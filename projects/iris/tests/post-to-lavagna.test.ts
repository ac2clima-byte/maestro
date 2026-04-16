import { describe, it, expect, beforeEach } from "vitest";

import {
  EFESTO_COLLEAGUE,
  IRIS_COLLEAGUE,
  postInterventoToLavagna,
} from "../src/actions/PostToLavagna.js";
import { Lavagna, type FirestoreLike } from "../../nexo-core/lavagna/index.js";
import type { Email } from "../src/types/email.js";
import type { EmailClassification } from "../src/types/classification.js";

// Reuse a minimal in-memory fake for Firestore. Covered thoroughly in
// nexo-core/lavagna/tests; here we only need post() to work.
function makeFakeFirestore() {
  const col = new Map<string, Record<string, unknown>>();
  const firestore: FirestoreLike = {
    collection() {
      return {
        doc(id?: string) {
          const docId = id ?? Math.random().toString(36).slice(2);
          return {
            id: docId,
            async get() {
              const data = col.get(docId);
              return { exists: data !== undefined, id: docId, data: () => data };
            },
            async set(data: Record<string, unknown>) {
              col.set(docId, { ...data });
            },
            async update(data: Record<string, unknown>) {
              col.set(docId, { ...(col.get(docId) ?? {}), ...data });
            },
          };
        },
        where() { return this as unknown as ReturnType<typeof this.collection>["where"] extends (...a: any[]) => infer R ? R : never; },
        orderBy() { return this as never; },
        limit() { return this as never; },
        async get() { return { docs: [] }; },
      } as never;
    },
  };
  return { firestore, col };
}

function email(overrides: Partial<Email> = {}): Email {
  return {
    message_id: "<m1@corp.local>",
    subject: "Caldaia in blocco",
    sender: "admin@studiorossibianchi.it",
    received_time: "2026-04-16T07:42:00+00:00",
    body_text: "La caldaia condominiale è in blocco da stamattina.",
    has_attachments: false,
    importance: "High",
    ...overrides,
  };
}

function classification(
  overrides: Partial<EmailClassification> = {},
): EmailClassification {
  return {
    category: "GUASTO_URGENTE",
    summary: "Caldaia condominiale in blocco.",
    entities: { condominio: "Via Dante 5", urgenza: "critica" },
    suggestedAction: "URGENTE_CHIAMA",
    confidence: "high",
    reasoning: "Blocco caldaia.",
    ...overrides,
  };
}

describe("postInterventoToLavagna", () => {
  let firestore: FirestoreLike;
  let lavagna: Lavagna;

  beforeEach(() => {
    ({ firestore } = makeFakeFirestore());
    lavagna = new Lavagna({ firestore, idGenerator: () => "msg-1" });
  });

  it("posts a message for GUASTO_URGENTE with critical priority", async () => {
    const result = await postInterventoToLavagna(lavagna, email(), classification());
    expect(result).not.toBeNull();
    expect(result!.from).toBe(IRIS_COLLEAGUE);
    expect(result!.to).toBe(EFESTO_COLLEAGUE);
    expect(result!.type).toBe("richiesta_intervento");
    expect(result!.priority).toBe("critical");
    expect(result!.sourceEmailId).toBe("<m1@corp.local>");
    expect((result!.payload as { entities: unknown }).entities).toEqual({
      condominio: "Via Dante 5",
      urgenza: "critica",
    });
  });

  it("posts a normal-priority message for RICHIESTA_INTERVENTO without urgenza", async () => {
    const cls = classification({
      category: "RICHIESTA_INTERVENTO",
      entities: { cliente: "Mario Rossi" },
      suggestedAction: "APRI_INTERVENTO",
    });
    const result = await postInterventoToLavagna(lavagna, email(), cls);
    expect(result!.priority).toBe("normal");
  });

  it("maps urgenza='alta' to priority='high'", async () => {
    const cls = classification({
      category: "RICHIESTA_INTERVENTO",
      entities: { urgenza: "alta" },
    });
    const result = await postInterventoToLavagna(lavagna, email(), cls);
    expect(result!.priority).toBe("high");
  });

  it("returns null for non-intervention categories (no Lavagna write)", async () => {
    for (const category of [
      "PREVENTIVO",
      "FATTURA_FORNITORE",
      "NEWSLETTER_SPAM",
      "COMUNICAZIONE_INTERNA",
    ] as const) {
      const cls = classification({ category });
      const result = await postInterventoToLavagna(lavagna, email(), cls);
      expect(result).toBeNull();
    }
  });

  it("clips the email body preview to 500 chars", async () => {
    const longBody = "x".repeat(1200);
    const result = await postInterventoToLavagna(
      lavagna,
      email({ body_text: longBody }),
      classification(),
    );
    const payload = result!.payload as { email: { bodyPreview: string } };
    expect(payload.email.bodyPreview).toHaveLength(500);
  });
});
