// IRIS → Lavagna bridge.
//
// When the classifier marks an email as RICHIESTA_INTERVENTO or GUASTO_URGENTE,
// IRIS does NOT act on COSMINA itself. It posts a message on the Lavagna
// addressed to "efesto" — the Collega that owns interventions. EFESTO will
// pick it up from its own loop.
//
// This keeps IRIS firmly inside its own domain (email) and respects the
// NEXO rule: no Collega acts on another Collega's domain.

import type { Lavagna, LavagnaNewMessage, LavagnaPriority } from "../../../nexo-core/lavagna/index.js";
import { LAVAGNA_MESSAGE_TYPES } from "../../../nexo-core/lavagna/index.js";
import type { Email } from "../types/email.js";
import type {
  EmailClassification,
  ExtractedEntities,
} from "../types/classification.js";

export const IRIS_COLLEAGUE = "iris";
export const EFESTO_COLLEAGUE = "efesto";

/**
 * Categories that trigger an automatic Lavagna message to EFESTO.
 * Keep this set small — every entry is an auto-hand-off to another Collega.
 */
export const INTERVENTO_CATEGORIES: ReadonlySet<EmailClassification["category"]> =
  new Set(["RICHIESTA_INTERVENTO", "GUASTO_URGENTE"]);

function priorityFor(
  classification: EmailClassification,
): LavagnaPriority {
  if (classification.category === "GUASTO_URGENTE") return "critical";
  const urgenza = classification.entities.urgenza?.toLowerCase();
  if (urgenza === "critica") return "critical";
  if (urgenza === "alta") return "high";
  if (urgenza === "bassa") return "low";
  return "normal";
}

function buildPayload(
  email: Email,
  classification: EmailClassification,
): Record<string, unknown> {
  const e: ExtractedEntities = classification.entities;
  return {
    category: classification.category,
    summary: classification.summary,
    reasoning: classification.reasoning,
    suggestedAction: classification.suggestedAction,
    confidence: classification.confidence,
    entities: e,
    email: {
      messageId: email.message_id,
      sender: email.sender,
      subject: email.subject,
      receivedTime: email.received_time,
      bodyPreview: (email.body_text || "").slice(0, 500),
      hasAttachments: email.has_attachments,
      importance: email.importance,
    },
  };
}

/**
 * Post a message on the Lavagna for EFESTO when the email is an intervention
 * request. Returns the created message, or `null` if no message was needed
 * (non-intervento category).
 */
export async function postInterventoToLavagna(
  lavagna: Lavagna,
  email: Email,
  classification: EmailClassification,
): Promise<ReturnType<Lavagna["post"]> extends Promise<infer R> ? R | null : never> {
  if (!INTERVENTO_CATEGORIES.has(classification.category)) {
    return null;
  }

  const message: LavagnaNewMessage = {
    from: IRIS_COLLEAGUE,
    to: EFESTO_COLLEAGUE,
    type: LAVAGNA_MESSAGE_TYPES.RICHIESTA_INTERVENTO,
    priority: priorityFor(classification),
    payload: buildPayload(email, classification),
    sourceEmailId: email.message_id,
  };

  return lavagna.post(message);
}
