/**
 * CHRONOS — listener Lavagna.
 *
 * Ascolta `nexo_lavagna` con `to == "chronos"`. Tipi gestiti:
 *   - richiesta_slot (da ARES)            → invoca slotDisponibili e
 *                                            risponde con `slot_proposto`
 *   - scadenza_normativa (da DIKEA)       → registra in chronos_scadenze
 *   - richiesta_riprogrammazione (da chiunque) → invoca riprogramma
 *
 * Stub: contratto + dispatcher non implementato.
 */

export const CHRONOS_INBOUND_TYPES = [
  "richiesta_slot",
  "scadenza_normativa",
  "richiesta_riprogrammazione",
] as const;

export type ChronosInboundType = (typeof CHRONOS_INBOUND_TYPES)[number];

export interface LavagnaIncoming {
  id: string;
  from: string;
  to: "chronos";
  type: ChronosInboundType | string;
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
