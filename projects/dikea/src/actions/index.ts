/**
 * DIKEA — azioni esposte.
 *
 * Tutti gli stub lanciano "Not implemented". Le firme sono il contratto.
 */
import type {
  CertificazioneFGas,
  DiCo,
  PEC,
  ScadenzaNormativa,
  StatoDiCo,
  TipoScadenzaNormativa,
} from "../types/index.js";

// ─── CURIT ──────────────────────────────────────────────────────

export interface ScadenzeCURITQuery {
  zona?: string;
  finestraGiorni?: number;
  tipo?: TipoScadenzaNormativa | TipoScadenzaNormativa[];
  limit?: number;
}

export async function scadenzeCURIT(_query: ScadenzeCURITQuery = {}): Promise<ScadenzaNormativa[]> {
  throw new Error("Not implemented: scadenzeCURIT");
}

export interface StatoCURITResult {
  targa: string;
  registratoCIT: boolean;
  ultimaREE?: string;
  prossimaScadenza?: string;
  bollinoValido?: boolean;
  warnings?: string[];
}

export async function verificaStatoCURIT(_targa: string): Promise<StatoCURITResult> {
  throw new Error("Not implemented: verificaStatoCURIT");
}

export async function impiantiSenzaTarga(
  _opts: { zona?: string; limit?: number } = {},
): Promise<Array<{ impiantoId: string; indirizzo?: string; condominio?: string }>> {
  throw new Error("Not implemented: impiantiSenzaTarga");
}

export async function impiantiNonRegistrati(
  _opts: { zona?: string; limit?: number } = {},
): Promise<Array<{ impiantoId: string; targa: string; motivazione: string }>> {
  throw new Error("Not implemented: impiantiNonRegistrati");
}

// ─── DiCo ───────────────────────────────────────────────────────

export interface GeneraDiCoInput {
  interventoId: string;
  /** Override manuale di campi specifici (opzionale). */
  override?: Partial<DiCo["campiCompilati"]>;
}

export async function generaDiCo(_input: GeneraDiCoInput): Promise<DiCo> {
  throw new Error("Not implemented: generaDiCo");
}

export interface ValidaDiCoResult {
  valida: boolean;
  campiMancanti: string[];
  warnings: string[];
  rischio: "basso" | "medio" | "alto";
  consigli: string[];
}

export async function validaDiCo(_dico: DiCo | { dicoId: string }): Promise<ValidaDiCoResult> {
  throw new Error("Not implemented: validaDiCo");
}

export async function inviaDiCo(
  _dicoId: string,
  _opts: { firmaDigitale?: boolean; protocolla?: boolean } = {},
): Promise<DiCo> {
  throw new Error("Not implemented: inviaDiCo");
}

export async function dicoMancanti(
  _query: { fromDate?: string; toDate?: string; tecnicoUid?: string; limit?: number } = {},
): Promise<Array<{ interventoId: string; motivazione: string; statoSuggerito: StatoDiCo }>> {
  throw new Error("Not implemented: dicoMancanti");
}

// ─── F-Gas ──────────────────────────────────────────────────────

export interface CheckFGasResult {
  impiantoId: string;
  certificazioniValide: CertificazioneFGas[];
  certificazioniScadute: CertificazioneFGas[];
  prossimoControllo?: string;
  warnings?: string[];
}

export async function checkFGas(_impiantoId: string): Promise<CheckFGasResult> {
  throw new Error("Not implemented: checkFGas");
}

export async function scadenzeFGas(
  _query: { finestraGiorni?: number; zona?: string; limit?: number } = {},
): Promise<ScadenzaNormativa[]> {
  throw new Error("Not implemented: scadenzeFGas");
}

// ─── PEC ────────────────────────────────────────────────────────

export async function gestisciPEC(_emailId: string): Promise<PEC> {
  throw new Error("Not implemented: gestisciPEC");
}

export interface BozzaRispostaPECResult {
  pecId: string;
  /** Id del messaggio Lavagna inviato a CALLIOPE per la stesura. */
  richiestaCalliopeId: string;
}

export async function bozzaRispostaPEC(_pecId: string): Promise<BozzaRispostaPECResult> {
  throw new Error("Not implemented: bozzaRispostaPEC");
}

export async function pecInScadenza(
  _query: { finestraGiorni?: number; limit?: number } = {},
): Promise<PEC[]> {
  throw new Error("Not implemented: pecInScadenza");
}

// ─── Audit / GDPR ───────────────────────────────────────────────

export interface AuditEntry {
  uid?: string;
  azione: string;
  collezione?: string;
  docId?: string;
  ip?: string;
  at: string;
  esito: "ok" | "denied" | "error";
}

export async function auditAccessi(
  _query: { uid?: string; finestraGiorni?: number; limit?: number } = {},
): Promise<AuditEntry[]> {
  throw new Error("Not implemented: auditAccessi");
}

export interface GDPRReport {
  scope: string;
  conforme: boolean;
  problemi: Array<{ severita: "info" | "warning" | "errore"; descrizione: string }>;
  consigli: string[];
  generatoIl: string;
}

export async function verificaConformitaGDPR(_scope?: string): Promise<GDPRReport> {
  throw new Error("Not implemented: verificaConformitaGDPR");
}

export interface ReportConformita {
  yyyymm: string;
  scadenzeRispettate: number;
  scadenzeMancate: number;
  dicoEmesse: number;
  pecRicevute: number;
  pecRisposte: number;
  pecInRitardo: number;
  generatoIl: string;
  pdfUrl?: string;
}

export async function reportConformita(_yyyymm: string): Promise<ReportConformita> {
  throw new Error("Not implemented: reportConformita");
}
