/**
 * DELPHI — azioni esposte.
 *
 * Tutti gli stub lanciano "Not implemented". Le firme sono il contratto.
 */
import type {
  Anomalia,
  Confronto,
  KPI,
  Ranking,
  Report,
  RispostaConversazionale,
  Trend,
} from "../types/index.js";

// ─── KPI / dashboard ────────────────────────────────────────────

export interface KpiDashboardScope {
  /** Quale "area" si vuole. */
  area?: "operativa" | "amministrativa" | "compliance" | "tutte";
  /** Sub-azienda. */
  azienda?: "acg" | "guazzotti" | "entrambe";
  /** Quante settimane indietro per i delta (default 4). */
  finestraSettimane?: number;
}

export async function kpiDashboard(_scope: KpiDashboardScope = {}): Promise<KPI[]> {
  throw new Error("Not implemented: kpiDashboard");
}

export async function dashboardHTML(
  _preset: "mattutina" | "settimanale" | "compliance",
): Promise<{ html: string; pdfUrl?: string }> {
  throw new Error("Not implemented: dashboardHTML");
}

// ─── Marginalità / ranking ──────────────────────────────────────

export interface FinestraQuery {
  fromDate: string;
  toDate: string;
}

export interface MarginePerInterventoResult {
  finestra: FinestraQuery;
  numInterventi: number;
  totaleFatturato: number;
  totaleMateriali: number;
  margineMedio: number;
  margineMedioPct: number;
  perTipo?: Array<{ tipo: string; numero: number; margineMedio: number }>;
}

export async function marginePerIntervento(
  _finestra: FinestraQuery,
): Promise<MarginePerInterventoResult> {
  throw new Error("Not implemented: marginePerIntervento");
}

export type CriterioRanking =
  | "fatturato"
  | "interventi"
  | "problemi"
  | "redditivita"
  | "ore_lavorate";

export async function topCondomini(
  _anno: string,
  _criterio: CriterioRanking,
  _opts: { topN?: number } = {},
): Promise<Ranking> {
  throw new Error("Not implemented: topCondomini");
}

export async function topClienti(
  _anno: string,
  _criterio: CriterioRanking,
  _opts: { topN?: number } = {},
): Promise<Ranking> {
  throw new Error("Not implemented: topClienti");
}

export async function topTecnici(
  _anno: string,
  _criterio: CriterioRanking,
  _opts: { topN?: number } = {},
): Promise<Ranking> {
  throw new Error("Not implemented: topTecnici");
}

// ─── Produttività ───────────────────────────────────────────────

export interface ProduttivitaResult {
  periodo: { from: string; to: string };
  oreLavorate: number;
  oreFatturabili: number;
  utilizzoPct: number;
  interventiCompletati: number;
  numeroOreMedie: number;
  margineMedio?: number;
}

export async function produttivitaTecnico(
  _tecnicoUid: string,
  _yyyymm: string,
): Promise<ProduttivitaResult & { tecnicoUid: string }> {
  throw new Error("Not implemented: produttivitaTecnico");
}

export async function produttivitaTeam(
  _yyyymm: string,
): Promise<ProduttivitaResult & { tecnici: Array<{ uid: string; risultato: ProduttivitaResult }> }> {
  throw new Error("Not implemented: produttivitaTeam");
}

// ─── Trend e proiezioni ────────────────────────────────────────

export async function trend(
  _metrica: string,
  _finestra: FinestraQuery,
): Promise<Trend> {
  throw new Error("Not implemented: trend");
}

export async function previsioneIncassi(
  _mesi: number,
): Promise<Array<{ yyyymm: string; previsione: number; intervalloConfidenza: [number, number] }>> {
  throw new Error("Not implemented: previsioneIncassi");
}

export async function previsioneCaricoLavoro(
  _mesi: number,
  _opts: { zona?: string } = {},
): Promise<Array<{ yyyymm: string; interventiPrevisti: number; oreStimate: number }>> {
  throw new Error("Not implemented: previsioneCaricoLavoro");
}

// ─── Confronti / anomalie ──────────────────────────────────────

export async function confrontoAnnoSuAnno(
  _metrica: string,
  _anno: string,
): Promise<Confronto> {
  throw new Error("Not implemented: confrontoAnnoSuAnno");
}

export async function anomalie(
  _metrica?: string,
  _opts: { soglia?: number; finestraGiorni?: number } = {},
): Promise<Anomalia[]> {
  throw new Error("Not implemented: anomalie");
}

// ─── Costi piattaforma ─────────────────────────────────────────

export interface CostoAIResult {
  finestra: FinestraQuery;
  costoTotale: number;
  /** Per modello. */
  perModello: Array<{ modello: string; tokensInput: number; tokensOutput: number; costo: number }>;
  /** Per Collega. */
  perCollega?: Array<{ collega: string; chiamate: number; costo: number }>;
}

export async function costoAI(_finestra: FinestraQuery): Promise<CostoAIResult> {
  throw new Error("Not implemented: costoAI");
}

// ─── Report ─────────────────────────────────────────────────────

export async function reportMensile(_yyyymm: string): Promise<Report> {
  throw new Error("Not implemented: reportMensile");
}

export async function reportAnnuale(_yyyy: string): Promise<Report> {
  throw new Error("Not implemented: reportAnnuale");
}

// ─── Conversazionale ────────────────────────────────────────────

export interface ChiediOptions {
  /** Override modello per questa singola chiamata. */
  modello?: string;
  /** Limite max token output. */
  maxTokens?: number;
}

export async function chiedi(
  _domanda: string,
  _opts: ChiediOptions = {},
): Promise<RispostaConversazionale> {
  throw new Error("Not implemented: chiedi");
}
