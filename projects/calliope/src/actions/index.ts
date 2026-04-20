/**
 * CALLIOPE — azioni esposte.
 *
 * Tutti gli stub lanciano "Not implemented". Le firme sono il contratto.
 */
import type {
  Bozza,
  StileDestinatario,
  Template,
  TipoBozza,
  ToneBozza,
} from "../types/index.js";

// ─── Bozze specifiche ───────────────────────────────────────────

export interface BozzaContesto {
  sourceEmailId?: string;
  sourceLavagnaId?: string;
  clienteId?: string;
  note?: string;
}

export async function bozzaRisposta(
  _emailId: string,
  _tono: ToneBozza,
  _contesto: BozzaContesto = {},
): Promise<Bozza> {
  throw new Error("Not implemented: bozzaRisposta");
}

export async function comunicazioneCondominio(
  _condominioId: string,
  _motivo: string,
  _dati: Record<string, unknown> = {},
): Promise<Bozza> {
  throw new Error("Not implemented: comunicazioneCondominio");
}

export interface PreventivoFormaleInput {
  impiantoId?: string;
  clienteId?: string;
  lavoro: string;
  voci?: Array<{ descrizione: string; quantita: number; prezzoUnitario: number }>;
  templateId?: string;
}

export async function preventivoFormale(_input: PreventivoFormaleInput): Promise<Bozza> {
  throw new Error("Not implemented: preventivoFormale");
}

export async function sollecitoPagamento(
  _fatturaId: string,
  _tono: Extract<ToneBozza, "cordiale" | "fermo" | "ultimativo">,
): Promise<Bozza> {
  throw new Error("Not implemented: sollecitoPagamento");
}

export async function rispostaPEC(_pecId: string): Promise<Bozza> {
  throw new Error("Not implemented: rispostaPEC");
}

export async function offertaCommerciale(
  _clienteId: string,
  _lavoro: string,
  _opts: { templateId?: string } = {},
): Promise<Bozza> {
  throw new Error("Not implemented: offertaCommerciale");
}

export async function newsletterTecnici(_yyyymm: string): Promise<Bozza> {
  throw new Error("Not implemented: newsletterTecnici");
}

export interface ComunicazioneMassivaInput {
  argomento: string;
  destinatari: Array<{ canale: "email" | "whatsapp" | "pec"; to: string; variabili?: Record<string, string> }>;
  templateId?: string;
  tono?: ToneBozza;
}

export async function comunicazioneMassiva(
  _input: ComunicazioneMassivaInput,
): Promise<{ bozzaId: string; totaleDestinatari: number }> {
  throw new Error("Not implemented: comunicazioneMassiva");
}

// ─── Trascrizioni ───────────────────────────────────────────────

export async function trascriviAudio(
  _audioRef: string,
  _opts: { lingua?: string; modello?: string } = {},
): Promise<{ testo: string; durataSec?: number; segmenti?: Array<{ start: number; end: number; testo: string }> }> {
  throw new Error("Not implemented: trascriviAudio");
}

export async function verbaleRiunione(
  _audioRef: string,
): Promise<{ trascrizione: string; riassunto: string; actionItems: Array<{ chi?: string; cosa: string; quando?: string }> }> {
  throw new Error("Not implemented: verbaleRiunione");
}

// ─── Ciclo di vita ──────────────────────────────────────────────

export async function revisiona(
  _bozzaId: string,
  _feedback: string,
): Promise<Bozza> {
  throw new Error("Not implemented: revisiona");
}

export async function approva(
  _bozzaId: string,
  _opts: { approvataDa?: string; motivazione?: string } = {},
): Promise<Bozza> {
  throw new Error("Not implemented: approva");
}

export async function rifiuta(
  _bozzaId: string,
  _motivo: string,
  _opts: { rifiutataDa?: string } = {},
): Promise<Bozza> {
  throw new Error("Not implemented: rifiuta");
}

// ─── Template ───────────────────────────────────────────────────

export async function listaTemplate(
  _opts: { tipo?: TipoBozza; attivi?: boolean } = {},
): Promise<Template[]> {
  throw new Error("Not implemented: listaTemplate");
}

export interface CreaTemplateInput {
  nome: string;
  tipo: TipoBozza;
  descrizione?: string;
  corpo: string;
  oggetto?: string;
  firma?: string;
  variabiliRichieste?: Template["variabiliRichieste"];
  toneConsigliato?: ToneBozza;
}

export async function creaTemplate(_input: CreaTemplateInput): Promise<Template> {
  throw new Error("Not implemented: creaTemplate");
}

export async function generaDaTemplate(
  _templateId: string,
  _variabili: Record<string, string>,
  _opts: { tono?: ToneBozza; contesto?: BozzaContesto } = {},
): Promise<Bozza> {
  throw new Error("Not implemented: generaDaTemplate");
}

// ─── Apprendimento stile ────────────────────────────────────────

export interface EsempioStile {
  corpo: string;
  destinatarioTipo?: StileDestinatario["soggettoTipo"];
  autore?: string;
}

export async function imparaStile(
  _esempi: EsempioStile[],
  _opts: { soggettoId?: string; soggettoTipo?: StileDestinatario["soggettoTipo"] } = {},
): Promise<StileDestinatario> {
  throw new Error("Not implemented: imparaStile");
}
