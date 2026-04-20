/**
 * DELPHI — listener Lavagna.
 *
 * Ascolta `nexo_lavagna` con `to == "delphi"`. Tipi gestiti:
 *   - richiesta_analisi (da chiunque) → instrada all'azione corrispondente
 *                                       (kpiDashboard, marginePerIntervento,
 *                                       chiedi, ecc.)
 *
 * Stub: contratto + dispatcher non implementato.
 */

export const DELPHI_INBOUND_TYPES = [
  "richiesta_analisi",
] as const;

export type DelphiInboundType = (typeof DELPHI_INBOUND_TYPES)[number];

export interface LavagnaIncoming {
  id: string;
  from: string;
  to: "delphi";
  type: DelphiInboundType | string;
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
