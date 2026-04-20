/**
 * ARES — listener Lavagna.
 *
 * Ascolta nexo_lavagna e processa SOLO i messaggi destinati ad ARES
 * (`to == "ares"`). Per ciascun tipo, invoca l'azione corrispondente.
 *
 * Implementazione concreta in v0.1: subscription Firestore con
 * `onSnapshot` filtrato + status machine pending → picked_up → completed.
 *
 * Per ora: definizione del contratto + dispatcher stub.
 */

/** Tipi di messaggio Lavagna ascoltati da ARES (vedi context/nexo-architettura.md). */
export const ARES_INBOUND_TYPES = [
  "richiesta_intervento",
  "guasto_urgente",
  "slot_proposto",
  "disponibilita_risposta",
] as const;

export type AresInboundType = (typeof ARES_INBOUND_TYPES)[number];

export interface LavagnaIncoming {
  id: string;
  from: string;
  to: "ares";
  type: AresInboundType | string;
  payload: Record<string, unknown>;
  priority: "low" | "normal" | "high" | "critical";
  sourceEmailId?: string;
  parentMessageId?: string;
}

/**
 * Avvia il listener sulla Lavagna (`nexo_lavagna` filtrato per `to=="ares"`,
 * `status=="pending"`). Ritorna un unsubscribe.
 *
 * Stub: lancerà "Not implemented" finché non viene implementato.
 */
export function startLavagnaListener(): () => void {
  throw new Error("Not implemented: startLavagnaListener");
}

/**
 * Dispatch di un singolo messaggio Lavagna ricevuto.
 * Ritorna `true` se il messaggio è stato preso in carico, `false` se non
 * è di nostra competenza.
 */
export async function dispatch(_msg: LavagnaIncoming): Promise<boolean> {
  throw new Error("Not implemented: dispatch");
}
