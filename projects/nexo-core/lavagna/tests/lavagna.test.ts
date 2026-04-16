import { describe, it, expect, beforeEach } from "vitest";

import {
  Lavagna,
  LavagnaError,
  MessageNotFoundError,
  type CollectionReference,
  type DocumentReference,
  type DocumentSnapshot,
  type FirestoreLike,
  type Query,
  type QuerySnapshot,
} from "../Lavagna.js";
import { LAVAGNA_COLLECTION } from "../types.js";

// --- In-memory fake Firestore (good enough for Lavagna's query surface) ---

type Store = Map<string, Map<string, Record<string, unknown>>>;

type WhereClause = { field: string; op: string; value: unknown };

function getField(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function compareTimestamps(a: unknown, b: unknown): number {
  const get = (x: unknown): number => {
    if (
      x &&
      typeof x === "object" &&
      "seconds" in x &&
      typeof (x as { seconds: number }).seconds === "number"
    ) {
      const t = x as { seconds: number; nanoseconds?: number };
      return t.seconds * 1e9 + (t.nanoseconds ?? 0);
    }
    if (typeof x === "number") return x * 1e9;
    return 0;
  };
  return get(a) - get(b);
}

function matchesClause(doc: Record<string, unknown>, c: WhereClause): boolean {
  const v = getField(doc, c.field);
  switch (c.op) {
    case "==":
      return v === c.value;
    case ">=":
      return compareTimestamps(v, c.value) >= 0;
    case "<":
      return compareTimestamps(v, c.value) < 0;
    default:
      throw new Error(`Unsupported op in fake: ${c.op}`);
  }
}

function makeFirestore(store: Store): FirestoreLike {
  const makeQuery = (
    collectionName: string,
    clauses: WhereClause[],
    orderBys: Array<{ field: string; dir: "asc" | "desc" }>,
    limit: number | null,
  ): Query => ({
    where(field, op, value) {
      return makeQuery(
        collectionName,
        [...clauses, { field, op, value }],
        orderBys,
        limit,
      );
    },
    orderBy(field, dir = "asc") {
      return makeQuery(
        collectionName,
        clauses,
        [...orderBys, { field, dir }],
        limit,
      );
    },
    limit(n) {
      return makeQuery(collectionName, clauses, orderBys, n);
    },
    async get(): Promise<QuerySnapshot> {
      const col = store.get(collectionName) ?? new Map();
      let items: Array<[string, Record<string, unknown>]> = Array.from(
        col.entries(),
      );
      for (const c of clauses) {
        items = items.filter(([, d]) => matchesClause(d, c));
      }
      for (const ob of orderBys.slice().reverse()) {
        items.sort(([, a], [, b]) => {
          const diff = compareTimestamps(
            getField(a, ob.field),
            getField(b, ob.field),
          );
          return ob.dir === "asc" ? diff : -diff;
        });
      }
      if (limit != null) items = items.slice(0, limit);
      return {
        docs: items.map(([id, data]): DocumentSnapshot => ({
          exists: true,
          id,
          data: () => data,
        })),
      };
    },
  });

  const makeCollection = (collectionName: string): CollectionReference => {
    const col = store.get(collectionName) ?? new Map<string, Record<string, unknown>>();
    if (!store.has(collectionName)) store.set(collectionName, col);
    const baseQuery = makeQuery(collectionName, [], [], null);
    const ref: CollectionReference = {
      doc(id?: string): DocumentReference {
        const docId = id ?? Math.random().toString(36).slice(2);
        return {
          id: docId,
          async get(): Promise<DocumentSnapshot> {
            const data = col.get(docId);
            return {
              exists: data !== undefined,
              id: docId,
              data: () => data,
            };
          },
          async set(data, options): Promise<void> {
            if (options?.merge) {
              col.set(docId, { ...(col.get(docId) ?? {}), ...data });
            } else {
              col.set(docId, { ...data });
            }
          },
          async update(data): Promise<void> {
            const cur = col.get(docId);
            if (cur === undefined) throw new Error("update on missing doc");
            col.set(docId, { ...cur, ...data });
          },
        };
      },
      where: (f, o, v) => baseQuery.where(f, o, v),
      orderBy: (f, d) => baseQuery.orderBy(f, d),
      limit: (n) => baseQuery.limit(n),
      get: () => baseQuery.get(),
    };
    return ref;
  };

  return { collection: makeCollection };
}

// --- Tests ---

describe("Lavagna", () => {
  let store: Store;
  let firestore: FirestoreLike;
  let now: Date;
  let ids: string[];
  let lavagna: Lavagna;

  beforeEach(() => {
    store = new Map();
    firestore = makeFirestore(store);
    now = new Date("2026-04-16T18:00:00.000Z");
    ids = ["id-1", "id-2", "id-3", "id-4", "id-5"];
    let i = 0;
    lavagna = new Lavagna({
      firestore,
      now: () => {
        const d = new Date(now.getTime());
        now = new Date(now.getTime() + 1000);
        return d;
      },
      idGenerator: () => ids[i++] ?? `id-${i}`,
    });
  });

  describe("post", () => {
    it("writes a message to the default collection", async () => {
      const msg = await lavagna.post({
        from: "iris",
        to: "efesto",
        type: "richiesta_intervento",
        priority: "high",
        payload: { cliente: "Mario Rossi" },
        sourceEmailId: "<m1@corp>",
      });

      expect(msg.id).toBe("id-1");
      expect(msg.status).toBe("pending");
      expect(msg.priority).toBe("high");
      expect(msg.payload.cliente).toBe("Mario Rossi");
      expect(msg.sourceEmailId).toBe("<m1@corp>");
      expect(msg.createdAt).toEqual(msg.updatedAt);

      const raw = store.get(LAVAGNA_COLLECTION)?.get("id-1");
      expect(raw?.to).toBe("efesto");
    });

    it("defaults priority to 'normal' and status to 'pending'", async () => {
      const msg = await lavagna.post({
        from: "iris",
        to: "efesto",
        type: "notifica",
        payload: {},
      });
      expect(msg.priority).toBe("normal");
      expect(msg.status).toBe("pending");
    });

    it("throws when `from` / `to` / `type` are missing", async () => {
      await expect(
        lavagna.post({ from: "", to: "efesto", type: "x", payload: {} }),
      ).rejects.toBeInstanceOf(LavagnaError);
      await expect(
        lavagna.post({ from: "iris", to: "", type: "x", payload: {} }),
      ).rejects.toBeInstanceOf(LavagnaError);
      await expect(
        lavagna.post({ from: "iris", to: "efesto", type: "", payload: {} }),
      ).rejects.toBeInstanceOf(LavagnaError);
    });
  });

  describe("state transitions", () => {
    it("pickUp moves pending → picked_up", async () => {
      const msg = await lavagna.post({
        from: "iris", to: "efesto", type: "x", payload: {},
      });
      const picked = await lavagna.pickUp(msg.id);
      expect(picked.status).toBe("picked_up");
      expect(picked.pickedUpAt).toBeDefined();
    });

    it("complete moves picked_up → completed with result", async () => {
      const msg = await lavagna.post({
        from: "iris", to: "efesto", type: "x", payload: {},
      });
      await lavagna.pickUp(msg.id);
      const done = await lavagna.complete(msg.id, { interventoId: "INT-42" });
      expect(done.status).toBe("completed");
      expect(done.result).toEqual({ interventoId: "INT-42" });
      expect(done.completedAt).toBeDefined();
    });

    it("fail moves a message to failed with reason", async () => {
      const msg = await lavagna.post({
        from: "iris", to: "efesto", type: "x", payload: {},
      });
      const failed = await lavagna.fail(msg.id, "cliente inesistente in COSMINA");
      expect(failed.status).toBe("failed");
      expect(failed.failureReason).toBe("cliente inesistente in COSMINA");
      expect(failed.failedAt).toBeDefined();
    });

    it("pickUp rejects messages already picked up", async () => {
      const msg = await lavagna.post({
        from: "iris", to: "efesto", type: "x", payload: {},
      });
      await lavagna.pickUp(msg.id);
      await expect(lavagna.pickUp(msg.id)).rejects.toThrow(/Cannot pick up/);
    });

    it("complete rejects already-terminal messages", async () => {
      const msg = await lavagna.post({
        from: "iris", to: "efesto", type: "x", payload: {},
      });
      await lavagna.pickUp(msg.id);
      await lavagna.complete(msg.id);
      await expect(lavagna.complete(msg.id)).rejects.toThrow(/terminal status/);
    });

    it("pickUp / complete / fail raise MessageNotFoundError for unknown ids", async () => {
      await expect(lavagna.pickUp("nope")).rejects.toBeInstanceOf(
        MessageNotFoundError,
      );
      await expect(lavagna.complete("nope")).rejects.toBeInstanceOf(
        MessageNotFoundError,
      );
      await expect(lavagna.fail("nope", "why")).rejects.toBeInstanceOf(
        MessageNotFoundError,
      );
    });
  });

  describe("getPending", () => {
    it("returns only pending messages addressed to the colleague, oldest first", async () => {
      await lavagna.post({ from: "iris", to: "efesto", type: "x", payload: {} });
      await lavagna.post({ from: "iris", to: "estia", type: "x", payload: {} });
      const m3 = await lavagna.post({
        from: "iris", to: "efesto", type: "x", payload: {},
      });
      await lavagna.pickUp(m3.id);
      await lavagna.post({ from: "iris", to: "efesto", type: "y", payload: {} });

      const pending = await lavagna.getPending("efesto");
      expect(pending).toHaveLength(2);
      expect(pending[0].id).toBe("id-1");
      expect(pending[1].id).toBe("id-4");
      expect(pending.every((m) => m.status === "pending")).toBe(true);
      expect(pending.every((m) => m.to === "efesto")).toBe(true);
    });

    it("throws when colleagueName is missing", async () => {
      await expect(lavagna.getPending("")).rejects.toBeInstanceOf(LavagnaError);
    });
  });

  describe("getHistory", () => {
    it("filters by `from`, `to`, `type`, `status`", async () => {
      await lavagna.post({ from: "iris", to: "efesto", type: "a", payload: {} });
      await lavagna.post({ from: "iris", to: "estia", type: "a", payload: {} });
      await lavagna.post({ from: "estia", to: "efesto", type: "b", payload: {} });

      const fromIris = await lavagna.getHistory({ from: "iris" });
      expect(fromIris.map((m) => m.id).sort()).toEqual(["id-1", "id-2"]);

      const toEfesto = await lavagna.getHistory({ to: "efesto" });
      expect(toEfesto.map((m) => m.id).sort()).toEqual(["id-1", "id-3"]);

      const typeA = await lavagna.getHistory({ type: "a" });
      expect(typeA.map((m) => m.id).sort()).toEqual(["id-1", "id-2"]);

      const pending = await lavagna.getHistory({ status: "pending" });
      expect(pending).toHaveLength(3);
    });

    it("returns results sorted desc by createdAt, optionally limited", async () => {
      await lavagna.post({ from: "iris", to: "efesto", type: "a", payload: {} });
      await lavagna.post({ from: "iris", to: "efesto", type: "a", payload: {} });
      await lavagna.post({ from: "iris", to: "efesto", type: "a", payload: {} });

      const all = await lavagna.getHistory();
      expect(all.map((m) => m.id)).toEqual(["id-3", "id-2", "id-1"]);

      const top2 = await lavagna.getHistory({ limit: 2 });
      expect(top2).toHaveLength(2);
      expect(top2[0].id).toBe("id-3");
    });

    it("filters by date range (since / until)", async () => {
      // Post 3 messages; each post advances `now` by 1s.
      await lavagna.post({ from: "iris", to: "efesto", type: "a", payload: {} });
      await lavagna.post({ from: "iris", to: "efesto", type: "a", payload: {} });
      await lavagna.post({ from: "iris", to: "efesto", type: "a", payload: {} });

      const windowed = await lavagna.getHistory({
        since: "2026-04-16T18:00:00.500Z",
        until: "2026-04-16T18:00:02.500Z",
      });
      expect(windowed.map((m) => m.id)).toEqual(["id-2"]);
    });
  });
});
