/**
 * EMPORION — listener Lavagna.
 *
 * Ascolta `nexo_lavagna` con `to == "emporion"`. Tipi gestiti:
 *   - richiesta_disponibilita_ricambio (da ARES) → disponibilita /
 *                                                  dovSiTrova; risponde
 *                                                  con `disponibilita_risposta`
 *   - materiali_consumati (da ARES) → scarico (causale: intervento)
 *   - ddt_ricevuto (da IRIS / CHARTA) → ocrDDT + caricaDaDDT
 *
 * Stub: contratto + dispatcher non implementato.
 */

export const EMPORION_INBOUND_TYPES = [
  "richiesta_disponibilita_ricambio",
  "materiali_consumati",
  "ddt_ricevuto",
] as const;

export type EmporionInboundType = (typeof EMPORION_INBOUND_TYPES)[number];

export interface LavagnaIncoming {
  id: string;
  from: string;
  to: "emporion";
  type: EmporionInboundType | string;
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
