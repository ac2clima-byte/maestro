/**
 * CALLIOPE — listener Lavagna.
 *
 * Ascolta `nexo_lavagna` con `to == "calliope"`. Tipi gestiti:
 *   - richiesta_bozza (da chiunque)   → bozzaRisposta / comunicazione…
 *   - richiesta_sollecito (da CHARTA) → sollecitoPagamento
 *   - richiesta_pec (da DIKEA)        → rispostaPEC
 *
 * Stub: contratto + dispatcher non implementato.
 */

export const CALLIOPE_INBOUND_TYPES = [
  "richiesta_bozza",
  "richiesta_sollecito",
  "richiesta_pec",
] as const;

export type CalliopeInboundType = (typeof CALLIOPE_INBOUND_TYPES)[number];

export interface LavagnaIncoming {
  id: string;
  from: string;
  to: "calliope";
  type: CalliopeInboundType | string;
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
