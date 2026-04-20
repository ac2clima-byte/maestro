/**
 * ECHO — listener Lavagna.
 *
 * Ascolta nexo_lavagna e processa SOLO i messaggi destinati a ECHO
 * (`to == "echo"`). Per ciascun tipo, invoca l'azione corrispondente.
 *
 * Implementazione concreta in v0.1: subscription Firestore con
 * `onSnapshot` filtrato + status machine pending → picked_up → completed.
 *
 * Per ora: definizione del contratto + dispatcher stub.
 */
import type { EchoPriority } from "../types/index.js";

/** Tipi di messaggio Lavagna ascoltati da ECHO (vedi context/nexo-architettura.md). */
export const ECHO_INBOUND_TYPES = [
  "notifica",
  "alert",
  "digest_pronto",
  "bozza_approvata",
  "agenda_giornaliera",
  "escalation",
] as const;

export type EchoInboundType = (typeof ECHO_INBOUND_TYPES)[number];

export interface LavagnaIncoming {
  id: string;
  from: string;
  to: "echo";
  type: EchoInboundType | string;
  payload: Record<string, unknown>;
  priority: EchoPriority;
  sourceEmailId?: string;
  parentMessageId?: string;
}

/**
 * Avvia il listener sulla Lavagna (`nexo_lavagna` filtrato per `to=="echo"`,
 * `status=="pending"`). Ritorna un unsubscribe.
 *
 * Stub: lancerà "Not implemented" finché non viene implementato.
 */
export function startLavagnaListener(): () => void {
  throw new Error("Not implemented: startLavagnaListener");
}

/**
 * Dispatch di un singolo messaggio Lavagna ricevuto.
 * Ritorna `true` se il messaggio è stato preso in carico (e quindi va
 * marcato `picked_up`/`completed`), `false` se non è di nostra competenza.
 */
export async function dispatch(_msg: LavagnaIncoming): Promise<boolean> {
  throw new Error("Not implemented: dispatch");
}
