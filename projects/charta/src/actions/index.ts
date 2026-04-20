/**
 * CHARTA — azioni esposte.
 *
 * Tutti gli stub lanciano "Not implemented". Le firme sono il contratto.
 */
import type {
  DDT,
  EsposizioneCliente,
  Fattura,
  Incasso,
  MetodoPagamento,
  ReportMensile,
  RigaFattura,
  StatoFattura,
  TipoFattura,
} from "../types/index.js";

// ─── Fatture ────────────────────────────────────────────────────

export interface RegistraFatturaInput {
  tipo: TipoFattura;
  numero: string;
  serie?: string;
  controparteId: string;
  controparteNome?: string;
  dataEmissione: string;
  dataScadenza?: string;
  imponibile: number;
  iva: number;
  totale: number;
  righe?: RigaFattura[];
  stato?: StatoFattura;
  sourceFileUrl?: string;
  sourceEmailId?: string;
  externalRef?: string;
}

export async function registraFattura(_input: RegistraFatturaInput): Promise<Fattura> {
  throw new Error("Not implemented: registraFattura");
}

export interface FatturaParseResult {
  fattura: Partial<Fattura>;
  confidence: number; // 0-1
  warnings?: string[];
}

export async function parseFatturaFornitore(
  _allegato: { url?: string; bytes?: Uint8Array; mime?: string; filename?: string },
): Promise<FatturaParseResult> {
  throw new Error("Not implemented: parseFatturaFornitore");
}

export interface ScadenzeFattureQuery {
  finestraGiorni?: number;     // default 30
  controparteId?: string;
  tipo?: TipoFattura | TipoFattura[];
  limit?: number;
}

export async function scadenzeFatture(
  _query: ScadenzeFattureQuery = {},
): Promise<Fattura[]> {
  throw new Error("Not implemented: scadenzeFatture");
}

export async function fattureScadute(
  _query: Pick<ScadenzeFattureQuery, "controparteId" | "tipo" | "limit"> = {},
): Promise<Fattura[]> {
  throw new Error("Not implemented: fattureScadute");
}

// ─── Incassi e pagamenti ────────────────────────────────────────

export interface RegistraIncassoInput {
  direzione: "in" | "out";
  controparteId: string;
  controparteNome?: string;
  importo: number;
  data: string;
  metodo: MetodoPagamento;
  fatturaIds?: string[];
  causale?: string;
  fonte?: Incasso["fonte"];
  sourceEmailId?: string;
  sourceFileUrl?: string;
}

export async function registraIncasso(_input: RegistraIncassoInput): Promise<Incasso> {
  throw new Error("Not implemented: registraIncasso");
}

export async function estraiIncassiDaEmail(
  _emailId: string,
  _opts: { autoRegistra?: boolean } = {},
): Promise<Array<RegistraIncassoInput>> {
  throw new Error("Not implemented: estraiIncassiDaEmail");
}

export async function estraiIncassiDaExcel(
  _input: { filePath?: string; bytes?: Uint8Array },
  _opts: { sheet?: string; autoRegistra?: boolean } = {},
): Promise<Array<RegistraIncassoInput>> {
  throw new Error("Not implemented: estraiIncassiDaExcel");
}

// ─── DDT ────────────────────────────────────────────────────────

export interface RegistraDDTInput {
  numero: string;
  data: string;
  controparteId: string;
  controparteNome?: string;
  direzione: "in" | "out";
  righe: DDT["righe"];
  totaleStimato?: number;
  sourceFileUrl?: string;
  sourceEmailId?: string;
}

export async function registraDDT(_input: RegistraDDTInput): Promise<DDT> {
  throw new Error("Not implemented: registraDDT");
}

export async function parseDDT(
  _allegato: { url?: string; bytes?: Uint8Array; mime?: string; filename?: string },
): Promise<{ ddt: Partial<DDT>; confidence: number; warnings?: string[] }> {
  throw new Error("Not implemented: parseDDT");
}

export interface DDTMatchResult {
  ddtId: string;
  fatturaId?: string;
  match: "exact" | "fuzzy" | "none";
  delta?: { imponibile?: number; righeMancanti?: number };
  confidence: number;
}

export async function controllaDDTvsFattura(_ddtId: string): Promise<DDTMatchResult> {
  throw new Error("Not implemented: controllaDDTvsFattura");
}

export async function ddtSenzaFattura(
  _query: { controparteId?: string; minGiorni?: number; limit?: number } = {},
): Promise<DDT[]> {
  throw new Error("Not implemented: ddtSenzaFattura");
}

// ─── Esposizione e report ──────────────────────────────────────

export async function esposizioneCliente(_clienteId: string): Promise<EsposizioneCliente> {
  throw new Error("Not implemented: esposizioneCliente");
}

export async function clientiAltaEsposizione(
  _opts: { sogliaEur?: number; topN?: number } = {},
): Promise<EsposizioneCliente[]> {
  throw new Error("Not implemented: clientiAltaEsposizione");
}

export async function reportMensile(_yyyymm: string): Promise<ReportMensile> {
  throw new Error("Not implemented: reportMensile");
}

export async function reportAnnuale(
  _yyyy: string,
): Promise<{ anno: string; mesi: ReportMensile[]; totali: ReportMensile["emesso"] }> {
  throw new Error("Not implemented: reportAnnuale");
}

// ─── Solleciti e riconciliazione ───────────────────────────────

export type ToneSollecito = "cordiale" | "fermo" | "ultimativo";

export async function generaSollecito(
  _fatturaId: string,
  _tono: ToneSollecito,
): Promise<{ richiestaCalliopeId: string }> {
  throw new Error("Not implemented: generaSollecito");
}

export async function sollecitiBatch(
  _opts: { sogliaGiorni?: number; tono?: ToneSollecito; dryRun?: boolean } = {},
): Promise<{ richieste: number; saltate: number }> {
  throw new Error("Not implemented: sollecitiBatch");
}

export interface RiconciliazioneResult {
  scansionati: number;
  match: number;
  multiMatch: number;
  noMatch: number;
  candidati: Array<{
    incassoId: string;
    fatturaIds: string[];
    confidence: number;
    motivazione: string;
  }>;
}

export async function riconciliaAutomatica(
  _opts: { fromDate?: string; toDate?: string; soglia?: number } = {},
): Promise<RiconciliazioneResult> {
  throw new Error("Not implemented: riconciliaAutomatica");
}
