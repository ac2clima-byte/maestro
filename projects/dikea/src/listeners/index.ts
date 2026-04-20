/**
 * DIKEA — listener Lavagna.
 *
 * Ascolta `nexo_lavagna` con `to == "dikea"`. Tipi gestiti:
 *   - pec_ricevuta (da IRIS)             → gestisciPEC + bozzaRispostaPEC
 *                                          (delegata a CALLIOPE)
 *   - richiesta_dico (da ARES)           → generaDiCo + validaDiCo
 *   - scadenza_normativa (da CHRONOS)    → eco / sync su dikea_scadenze
 *
 * Stub: contratto + dispatcher non implementato.
 */

export const DIKEA_INBOUND_TYPES = [
  "pec_ricevuta",
  "richiesta_dico",
  "scadenza_normativa",
] as const;

export type DikeaInboundType = (typeof DIKEA_INBOUND_TYPES)[number];

export interface LavagnaIncoming {
  id: string;
  from: string;
  to: "dikea";
  type: DikeaInboundType | string;
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
