/**
 * MEMO — listener Lavagna.
 *
 * Ascolta `nexo_lavagna` con `to == "memo"`. Tipi gestiti:
 *   - richiesta_dossier (da chiunque)        → produce dossier_pronto
 *   - nuovo_cliente_rilevato (da IRIS)       → matchAnagrafica;
 *                                              se nessun match invia
 *                                              alert_nuovo_cliente a ECHO
 *
 * Stub: contratto + dispatcher non implementato.
 */

export const MEMO_INBOUND_TYPES = [
  "richiesta_dossier",
  "nuovo_cliente_rilevato",
] as const;

export type MemoInboundType = (typeof MEMO_INBOUND_TYPES)[number];

export interface LavagnaIncoming {
  id: string;
  from: string;
  to: "memo";
  type: MemoInboundType | string;
  payload: Record<string, unknown>;
  priority: "low" | "normal" | "high" | "critical";
  sourceEmailId?: string;
  parentMessageId?: string;
}

export function startLavagnaListener(): () => void {
  throw new Error("Not implemented: startLavagnaListener");
}

export async function dispatch(_msg: LavagnaIncoming): Promise<boolean> {
  throw new Error("Not implemented: dispatch");
}
