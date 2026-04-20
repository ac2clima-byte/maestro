import type {
  FirestoreTimestamp,
  HistoryFilters,
  LavagnaMessage,
  LavagnaNewMessage,
  LavagnaPriority,
  LavagnaStatus,
} from "./types.js";
import { LAVAGNA_COLLECTION } from "./types.js";

// --- Minimal Firestore-like interface (compatible with firebase-admin) ---

export interface DocumentSnapshot {
  exists: boolean;
  id: string;
  data(): Record<string, unknown> | undefined;
}

export interface QuerySnapshot {
  docs: DocumentSnapshot[];
}

export interface DocumentReference {
  id: string;
  get(): Promise<DocumentSnapshot>;
  set(data: Record<string, unknown>, options?: { merge?: boolean }): Promise<unknown>;
  update(data: Record<string, unknown>): Promise<unknown>;
}

export interface Query {
  where(field: string, op: string, value: unknown): Query;
  orderBy(field: string, direction?: "asc" | "desc"): Query;
  limit(n: number): Query;
  get(): Promise<QuerySnapshot>;
}

export interface CollectionReference extends Query {
  doc(id?: string): DocumentReference;
}

export interface FirestoreLike {
  collection(path: string): CollectionReference;
}

// --- Errors ---

export class LavagnaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LavagnaError";
  }
}

export class MessageNotFoundError extends LavagnaError {
  constructor(messageId: string) {
    super(`Lavagna message not found: ${messageId}`);
    this.name = "MessageNotFoundError";
  }
}

// --- Helpers ---

function nowTs(now: () => Date = () => new Date()): FirestoreTimestamp {
  const ms = now().getTime();
  return {
    seconds: Math.floor(ms / 1000),
    nanoseconds: (ms % 1000) * 1_000_000,
  };
}

function randomId(): string {
  // Firestore-style auto id: 20 chars, URL-safe.
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 20; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

function docToMessage(snap: DocumentSnapshot): LavagnaMessage {
  const d = snap.data() ?? {};
  return { ...(d as Record<string, unknown>), id: snap.id } as LavagnaMessage;
}

// --- Lavagna ---

export interface LavagnaOptions {
  firestore: FirestoreLike;
  collectionName?: string;
  /** Override for deterministic tests. */
  now?: () => Date;
  /** Override for deterministic tests. */
  idGenerator?: () => string;
}

export class Lavagna {
  private readonly firestore: FirestoreLike;
  private readonly collectionName: string;
  private readonly now: () => Date;
  private readonly idGen: () => string;

  constructor(options: LavagnaOptions) {
    this.firestore = options.firestore;
    this.collectionName = options.collectionName ?? LAVAGNA_COLLECTION;
    this.now = options.now ?? (() => new Date());
    this.idGen = options.idGenerator ?? randomId;
  }

  async post(message: LavagnaNewMessage): Promise<LavagnaMessage> {
    if (!message.from) throw new LavagnaError("`from` is required.");
    if (!message.to) throw new LavagnaError("`to` is required.");
    if (!message.type) throw new LavagnaError("`type` is required.");

    const id = this.idGen();
    const ts = nowTs(this.now);
    const priority: LavagnaPriority = message.priority ?? "normal";
    const status: LavagnaStatus = message.status ?? "pending";

    const doc: LavagnaMessage = {
      id,
      from: message.from,
      to: message.to,
      type: message.type,
      payload: message.payload ?? {},
      status,
      priority,
      ...(message.sourceEmailId ? { sourceEmailId: message.sourceEmailId } : {}),
      createdAt: ts,
      updatedAt: ts,
    };

    await this.collection().doc(id).set(doc as unknown as Record<string, unknown>);
    return doc;
  }

  async pickUp(messageId: string): Promise<LavagnaMessage> {
    const ref = this.collection().doc(messageId);
    const snap = await ref.get();
    if (!snap.exists) throw new MessageNotFoundError(messageId);
    const current = docToMessage(snap);
    if (current.status !== "pending") {
      throw new LavagnaError(
        `Cannot pick up message ${messageId} in status ${current.status}`,
      );
    }
    const ts = nowTs(this.now);
    const update = {
      status: "picked_up" as LavagnaStatus,
      pickedUpAt: ts,
      updatedAt: ts,
    };
    await ref.update(update);
    return { ...current, ...update };
  }

  async complete(
    messageId: string,
    result: Record<string, unknown> = {},
  ): Promise<LavagnaMessage> {
    const ref = this.collection().doc(messageId);
    const snap = await ref.get();
    if (!snap.exists) throw new MessageNotFoundError(messageId);
    const current = docToMessage(snap);
    if (current.status === "completed" || current.status === "failed") {
      throw new LavagnaError(
        `Cannot complete message ${messageId} in terminal status ${current.status}`,
      );
    }
    const ts = nowTs(this.now);
    const update = {
      status: "completed" as LavagnaStatus,
      completedAt: ts,
      updatedAt: ts,
      result,
    };
    await ref.update(update);
    return { ...current, ...update };
  }

  async fail(messageId: string, reason: string): Promise<LavagnaMessage> {
    const ref = this.collection().doc(messageId);
    const snap = await ref.get();
    if (!snap.exists) throw new MessageNotFoundError(messageId);
    const current = docToMessage(snap);
    if (current.status === "completed" || current.status === "failed") {
      throw new LavagnaError(
        `Cannot fail message ${messageId} in terminal status ${current.status}`,
      );
    }
    const ts = nowTs(this.now);
    const update = {
      status: "failed" as LavagnaStatus,
      failedAt: ts,
      failureReason: reason,
      updatedAt: ts,
    };
    await ref.update(update);
    return { ...current, ...update };
  }

  async getPending(colleagueName: string): Promise<LavagnaMessage[]> {
    if (!colleagueName) throw new LavagnaError("colleagueName is required.");
    const snap = await this.collection()
      .where("to", "==", colleagueName)
      .where("status", "==", "pending")
      .orderBy("createdAt", "asc")
      .get();
    return snap.docs.map(docToMessage);
  }

  async getHistory(filters: HistoryFilters = {}): Promise<LavagnaMessage[]> {
    let q: Query = this.collection();
    if (filters.from) q = q.where("from", "==", filters.from);
    if (filters.to) q = q.where("to", "==", filters.to);
    if (filters.type) q = q.where("type", "==", filters.type);
    if (filters.status) q = q.where("status", "==", filters.status);
    if (filters.since) {
      q = q.where("createdAt", ">=", isoToTimestamp(filters.since));
    }
    if (filters.until) {
      q = q.where("createdAt", "<", isoToTimestamp(filters.until));
    }
    q = q.orderBy("createdAt", "desc");
    if (filters.limit && filters.limit > 0) q = q.limit(filters.limit);
    const snap = await q.get();
    return snap.docs.map(docToMessage);
  }

  private collection(): CollectionReference {
    return this.firestore.collection(this.collectionName);
  }
}

function isoToTimestamp(iso: string): FirestoreTimestamp {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    throw new LavagnaError(`Invalid ISO date: ${iso}`);
  }
  return {
    seconds: Math.floor(ms / 1000),
    nanoseconds: (ms % 1000) * 1_000_000,
  };
}
