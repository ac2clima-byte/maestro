/**
 * PHARO — listener Lavagna.
 *
 * Ascolta `nexo_lavagna` con `to == "pharo"`. Tipi gestiti:
 *   - anomalia_rilevata (da DELPHI) → registra alert e notifica ECHO
 *
 * Stub: contratto + dispatcher non implementato.
 */

export const PHARO_INBOUND_TYPES = [
  "anomalia_rilevata",
] as const;

export type PharoInboundType = (typeof PHARO_INBOUND_TYPES)[number];

export interface LavagnaIncoming {
  id: string;
  from: string;
  to: "pharo";
  type: PharoInboundType | string;
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
