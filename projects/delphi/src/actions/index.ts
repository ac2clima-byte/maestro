/**
 * DELPHI — azioni esposte.
 *
 * v0.1 implementato:
 *   · kpiDashboard(scope) — aggregazione da iris_emails + nexo_lavagna +
 *                            COSMINA bacheca_cards.
 *   · costoAI() — lettura cosmina_config/ai_usage se presente, altrimenti
 *                 stima da nexus_sessions token usage.
 */
import { initializeApp, getApps, applicationDefault, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import type {
  Anomalia,
  Confronto,
  KPI,
  Ranking,
  Report,
  RispostaConversazionale,
  Trend,
} from "../types/index.js";

// ─── Lazy Firebase ──────────────────────────────────────────────

const NEXO_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "nexo-hub-15f2d";
const COSMINA_PROJECT_ID = process.env.COSMINA_PROJECT_ID || "garbymobile-f89ac";

function getOrInit(name: string, projectId: string): App {
  const existing = getApps().find((a) => a.name === name);
  if (existing) return existing;
  if (name === "[DEFAULT]") {
    return initializeApp({ credential: applicationDefault(), projectId });
  }
  return initializeApp({ credential: applicationDefault(), projectId }, name);
}
function nexoDb(): Firestore {
  return getFirestore(getOrInit("[DEFAULT]", NEXO_PROJECT_ID));
}
function cosminaDb(): Firestore {
  return getFirestore(getOrInit("cosmina", COSMINA_PROJECT_ID));
}

// ─── KPI / dashboard ────────────────────────────────────────────

export interface KpiDashboardScope {
  /** Quale "area" si vuole. */
  area?: "operativa" | "amministrativa" | "compliance" | "tutte";
  /** Sub-azienda. */
  azienda?: "acg" | "guazzotti" | "entrambe";
  /** Quante settimane indietro per i delta (default 4). */
  finestraSettimane?: number;
}

/**
 * KPI aggregati da più fonti:
 *   - iris_emails: totali, urgenti, senza risposta
 *   - nexo_lavagna: messaggi ultimi 7gg
 *   - bacheca_cards: interventi attivi, completati ultimi 30gg
 */
export async function kpiDashboard(scope: KpiDashboardScope = {}): Promise<KPI[]> {
  const finestraSett = scope.finestraSettimane ?? 4;
  const now = new Date();
  const from = new Date(now.getTime() - finestraSett * 7 * 86400000);
  const nowIso = now.toISOString();
  const periodo = { from: from.toISOString(), to: nowIso };

  const kpi: KPI[] = [];

  // 1. Email totali + urgenti
  try {
    const snap = await nexoDb().collection("iris_emails")
      .orderBy("raw.received_time", "desc").limit(500).get();
    let tot = 0, urg = 0, senzaRisposta = 0;
    snap.forEach((d) => {
      tot++;
      const data = d.data() || {};
      const cat = (data.classification || {}).category;
      if (cat === "GUASTO_URGENTE" || cat === "PEC_UFFICIALE") urg++;
      if ((data.followup || {}).needsAttention) senzaRisposta++;
    });
    kpi.push({
      id: "email_totali", nome: "Email indicizzate", valore: tot, unita: "email",
      periodo, generatoIl: nowIso, fonti: ["iris_emails"],
    });
    kpi.push({
      id: "email_urgenti", nome: "Email urgenti", valore: urg, unita: "email",
      periodo, generatoIl: nowIso, fonti: ["iris_emails"],
    });
    kpi.push({
      id: "email_senza_risposta", nome: "Email senza risposta", valore: senzaRisposta,
      unita: "email", periodo, generatoIl: nowIso, fonti: ["iris_emails.followup"],
    });
  } catch {}

  // 2. Lavagna ultimi N giorni
  try {
    const snap = await nexoDb().collection("nexo_lavagna")
      .orderBy("createdAt", "desc").limit(200).get();
    let count = 0;
    snap.forEach((d) => {
      const ca = (d.data() || {}).createdAt;
      const dd = ca?.toDate ? ca.toDate() : (ca ? new Date(ca) : null);
      if (dd && dd >= from) count++;
    });
    kpi.push({
      id: "lavagna_messaggi", nome: `Messaggi Lavagna (${finestraSett * 7}gg)`,
      valore: count, unita: "messaggi", periodo, generatoIl: nowIso,
      fonti: ["nexo_lavagna"],
    });
  } catch {}

  // 3. Interventi COSMINA (tentativo; se fallisce skippa)
  try {
    const snap = await cosminaDb().collection("bacheca_cards")
      .where("listName", "==", "INTERVENTI").where("inBacheca", "==", true)
      .limit(500).get();
    let attivi = 0, completati = 0;
    snap.forEach((d) => {
      const data = d.data() || {};
      const stato = String(data.stato || "").toLowerCase();
      if (stato.includes("complet")) {
        const upd = data.updated_at?.toDate ? data.updated_at.toDate()
          : data.updated_at ? new Date(data.updated_at) : null;
        if (upd && upd >= from) completati++;
      } else if (!stato.includes("annul")) {
        attivi++;
      }
    });
    kpi.push({
      id: "interventi_attivi", nome: "Interventi attivi", valore: attivi,
      unita: "interventi", periodo, generatoIl: nowIso, fonti: ["bacheca_cards"],
    });
    kpi.push({
      id: "interventi_completati", nome: `Interventi completati (${finestraSett * 7}gg)`,
      valore: completati, unita: "interventi", periodo, generatoIl: nowIso,
      fonti: ["bacheca_cards"],
    });
  } catch {}

  return kpi;
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

/**
 * Tenta di leggere `cosmina_config/ai_usage`, altrimenti aggrega i token
 * usage memorizzati in `nexus_chat` per la finestra richiesta.
 *
 * Pricing (Jan 2026):
 *   - Haiku 4.5: $0.80/MTok in, $4/MTok out
 *   - Sonnet 4.6: $3/MTok in, $15/MTok out
 */
export async function costoAI(finestra: FinestraQuery): Promise<CostoAIResult> {
  const from = new Date(finestra.fromDate);
  const to = new Date(finestra.toDate);

  // 1. Tenta cosmina_config/ai_usage se esiste
  try {
    const snap = await cosminaDb().collection("cosmina_config").doc("ai_usage").get();
    if (snap.exists) {
      const d = snap.data() || {};
      const pm = Array.isArray(d.perModello) ? d.perModello : [];
      return {
        finestra,
        costoTotale: Number(d.costoTotale || 0),
        perModello: pm,
        perCollega: Array.isArray(d.perCollega) ? d.perCollega : undefined,
      };
    }
  } catch {}

  // 2. Fallback: aggrega da nexus_chat.usage
  let tokenInput = 0, tokenOutput = 0, chiamate = 0;
  try {
    const snap = await nexoDb().collection("nexus_chat")
      .where("role", "==", "assistant").limit(500).get();
    snap.forEach((d) => {
      const data = d.data() || {};
      const ts = data.timestamp?.toDate ? data.timestamp.toDate()
        : data.timestamp ? new Date(data.timestamp) : null;
      if (ts && (ts < from || ts > to)) return;
      const u = data.usage || {};
      tokenInput += Number(u.inputTokens || 0);
      tokenOutput += Number(u.outputTokens || 0);
      chiamate++;
    });
  } catch {}

  // Haiku pricing (default NEXUS usa Haiku)
  const costoUsd = (tokenInput / 1e6) * 0.80 + (tokenOutput / 1e6) * 4;
  const EUR_PER_USD = 0.92;
  const costoEur = Number((costoUsd * EUR_PER_USD).toFixed(4));

  return {
    finestra,
    costoTotale: costoEur,
    perModello: [{
      modello: "claude-haiku-4-5",
      tokensInput: tokenInput,
      tokensOutput: tokenOutput,
      costo: costoEur,
    }],
    perCollega: chiamate > 0 ? [{ collega: "nexus", chiamate, costo: costoEur }] : undefined,
  };
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
