/**
 * EMPORION — azioni esposte.
 *
 * Tutti gli stub lanciano "Not implemented". Le firme sono il contratto.
 */
import type {
  Articolo,
  CausaleMovimento,
  DisponibilitaResult,
  InventarioFurgone,
  Movimento,
  OrdineFornitore,
  Posizione,
} from "../types/index.js";

// ─── Disponibilità ──────────────────────────────────────────────

export interface DisponibilitaQuery {
  articoloId?: string;
  codice?: string;
  descrizione?: string;     // ricerca testuale
  posizioni?: Posizione[];
}

export async function disponibilita(_query: DisponibilitaQuery): Promise<DisponibilitaResult[]> {
  throw new Error("Not implemented: disponibilita");
}

export async function dovSiTrova(_articoloId: string): Promise<DisponibilitaResult> {
  throw new Error("Not implemented: dovSiTrova");
}

export async function articoliSottoScorta(
  _opts: { posizioni?: Posizione[]; categoria?: Articolo["categoria"]; limit?: number } = {},
): Promise<Array<{ articolo: Articolo; mancante: number; perPosizione?: DisponibilitaResult["perPosizione"] }>> {
  throw new Error("Not implemented: articoliSottoScorta");
}

// ─── Movimenti ──────────────────────────────────────────────────

export interface MovimentoInput {
  articoloId: string;
  quantita: number;
  causale: CausaleMovimento;
  tecnicoUid?: string;
  riferimenti?: Movimento["riferimenti"];
  prezzoUnitario?: number;
  note?: string;
  sourceLavagnaId?: string;
}

export async function carico(
  _input: MovimentoInput & { destinazione: Posizione },
): Promise<Movimento> {
  throw new Error("Not implemented: carico");
}

export async function scarico(
  _input: MovimentoInput & { sorgente: Posizione },
): Promise<Movimento> {
  throw new Error("Not implemented: scarico");
}

export async function trasferisci(
  _articoloId: string,
  _da: Posizione,
  _a: Posizione,
  _quantita: number,
  _opts: { tecnicoUid?: string; note?: string; causale?: CausaleMovimento } = {},
): Promise<Movimento> {
  throw new Error("Not implemented: trasferisci");
}

// ─── Ordini fornitori ───────────────────────────────────────────

export interface CreaOrdineInput {
  fornitoreId: string;
  fornitoreNome?: string;
  righe: OrdineFornitore["righe"];
  destinazione?: Posizione;
  dataConsegnaAttesa?: string;
  note?: string;
}

export async function creaOrdine(_input: CreaOrdineInput): Promise<OrdineFornitore> {
  throw new Error("Not implemented: creaOrdine");
}

export async function ordiniInCorso(
  _query: { fornitoreId?: string; statoIn?: OrdineFornitore["stato"][]; limit?: number } = {},
): Promise<OrdineFornitore[]> {
  throw new Error("Not implemented: ordiniInCorso");
}

export async function ricevutoOrdine(
  _ordineId: string,
  _opts: { righeRicevute?: Array<{ articoloId: string; quantita: number }>; ddtId?: string } = {},
): Promise<OrdineFornitore> {
  throw new Error("Not implemented: ricevutoOrdine");
}

export async function suggerisciRiordino(
  _opts: { posizioni?: Posizione[]; finestraGiorni?: number } = {},
): Promise<Array<{ articoloId: string; quantitaSuggerita: number; motivazione: string }>> {
  throw new Error("Not implemented: suggerisciRiordino");
}

// ─── Listini ────────────────────────────────────────────────────

export interface ListinoComparato {
  articoloId: string;
  codice?: string;
  descrizione: string;
  offerte: Array<{
    fornitoreId: string;
    fornitoreNome?: string;
    prezzoUnitario: number;
    dataAggiornamento?: string;
    note?: string;
  }>;
  miglioreOfferta?: { fornitoreId: string; prezzoUnitario: number };
}

export async function listiniComparati(
  _input: { codice?: string; descrizione?: string; articoloId?: string },
): Promise<ListinoComparato[]> {
  throw new Error("Not implemented: listiniComparati");
}

// ─── DDT ────────────────────────────────────────────────────────

export interface DDTOcrResult {
  righe: Array<{
    codice?: string;
    descrizione: string;
    quantita: number;
    prezzoUnitario?: number;
    /** Articolo riconosciuto dall'anagrafica (se match). */
    articoloId?: string;
    confidence: number;
  }>;
  fornitoreRilevato?: string;
  numeroRilevato?: string;
  dataRilevata?: string;
  warnings?: string[];
}

export async function ocrDDT(
  _allegato: { url?: string; bytes?: Uint8Array; mime?: string; filename?: string },
): Promise<DDTOcrResult> {
  throw new Error("Not implemented: ocrDDT");
}

export async function caricaDaDDT(
  _ddtId: string,
  _opts: { destinazione?: Posizione; sourceLavagnaId?: string } = {},
): Promise<{ movimenti: Movimento[]; saltate: number }> {
  throw new Error("Not implemented: caricaDaDDT");
}

// ─── Furgoni ────────────────────────────────────────────────────

export async function inventarioFurgone(_tecnicoUid: string): Promise<InventarioFurgone> {
  throw new Error("Not implemented: inventarioFurgone");
}

export async function rifornisciFurgone(
  _tecnicoUid: string,
  _articoli: Array<{ articoloId: string; quantita: number }>,
): Promise<{ proposte: Movimento[] }> {
  throw new Error("Not implemented: rifornisciFurgone");
}

// ─── Compatibilità catalogo ─────────────────────────────────────

export async function articoliCompatibili(
  _impiantoTarga: string,
  _opts: { categoria?: Articolo["categoria"]; limit?: number } = {},
): Promise<Articolo[]> {
  throw new Error("Not implemented: articoliCompatibili");
}
