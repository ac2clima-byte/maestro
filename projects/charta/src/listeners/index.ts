/**
 * CHARTA — listener Lavagna.
 *
 * Ascolta `nexo_lavagna` con `to == "charta"`. Tipi gestiti:
 *   - fattura_ricevuta (da IRIS)         → parseFatturaFornitore + registra
 *   - incassi_ricevuti (da IRIS)         → estraiIncassiDaEmail / Excel
 *   - offerta_fornitore (da IRIS)        → log/tracciatura (no azione)
 *   - richiesta_esposizione (da chiunque) → esposizioneCliente
 *
 * Stub: contratto + dispatcher non implementato.
 */

export const CHARTA_INBOUND_TYPES = [
  "fattura_ricevuta",
  "incassi_ricevuti",
  "offerta_fornitore",
  "richiesta_esposizione",
] as const;

export type ChartaInboundType = (typeof CHARTA_INBOUND_TYPES)[number];

export interface LavagnaIncoming {
  id: string;
  from: string;
  to: "charta";
  type: ChartaInboundType | string;
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
