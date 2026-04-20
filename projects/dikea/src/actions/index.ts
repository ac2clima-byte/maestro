/**
 * DIKEA — azioni esposte.
 *
 * v0.1 implementato:
 *   · scadenzeCURIT(query)      — LETTURA reale da COSMINA cosmina_impianti_cit
 *                                  (bollino CURIT, REE, scadenze normative)
 *   · impiantiSenzaTarga(opts) — LETTURA reale impianti senza targa_cit
 *
 * Stub: verificaStatoCURIT (richiede API CURIT esterna), DiCo, F-Gas, PEC, audit.
 */
import { initializeApp, getApps, applicationDefault, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import type {
  CertificazioneFGas,
  DiCo,
  PEC,
  ScadenzaNormativa,
  StatoDiCo,
  TipoScadenzaNormativa,
} from "../types/index.js";

const COSMINA_PROJECT_ID = process.env.COSMINA_PROJECT_ID || "garbymobile-f89ac";

function getOrInit(name: string, projectId: string): App {
  const existing = getApps().find((a) => a.name === name);
  if (existing) return existing;
  if (name === "[DEFAULT]") {
    return initializeApp({ credential: applicationDefault(), projectId });
  }
  return initializeApp({ credential: applicationDefault(), projectId }, name);
}
function cosminaDb(): Firestore {
  return getFirestore(getOrInit("cosmina", COSMINA_PROJECT_ID));
}

function normalizeDate(v: unknown): Date | undefined {
  if (!v) return undefined;
  if (v instanceof Date) return v;
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  if (typeof v === "object" && v !== null) {
    const t = v as { toDate?: () => Date; _seconds?: number; seconds?: number };
    if (typeof t.toDate === "function") return t.toDate();
    const s = t._seconds ?? t.seconds;
    if (typeof s === "number") return new Date(s * 1000);
  }
  return undefined;
}

// ─── CURIT ──────────────────────────────────────────────────────

export interface ScadenzeCURITQuery {
  zona?: string;
  finestraGiorni?: number;
  tipo?: TipoScadenzaNormativa | TipoScadenzaNormativa[];
  limit?: number;
}

/**
 * Legge scadenze normative (CURIT/REE/manutenzione) dagli impianti.
 *
 * Prova le collection in ordine:
 *   1. cosmina_impianti_cit (dedicata CIT se esiste)
 *   2. cosmina_impianti (fallback, cerca campi bollino/ree/curit)
 */
export async function scadenzeCURIT(query: ScadenzeCURITQuery = {}): Promise<ScadenzaNormativa[]> {
  const limit = query.limit ?? 50;
  const finestra = query.finestraGiorni ?? 90;
  const now = new Date();
  const limite = new Date(now.getTime() + finestra * 86400000);

  const db = cosminaDb();
  const collezioni = ["cosmina_impianti_cit", "cosmina_impianti"];
  const out: ScadenzaNormativa[] = [];

  for (const coll of collezioni) {
    try {
      const snap = await db.collection(coll).limit(500).get();
      snap.forEach((d) => {
        const data = d.data() as Record<string, unknown>;

        // Campi candidati per scadenze CURIT/REE
        const campi: Array<{ tipo: TipoScadenzaNormativa; val: unknown; norma?: string }> = [
          { tipo: "bollino_curit", val: data.data_bollino_curit || data.scadenza_bollino, norma: "CURIT" },
          { tipo: "ree", val: data.data_ultima_ree || data.data_ree, norma: "DPR 74/2013" },
          { tipo: "manutenzione_obbligatoria", val: data.data_prossima_manutenzione || data.prossima_manutenzione },
        ];

        if (query.zona) {
          const zona = query.zona.toLowerCase();
          const bag = [data.indirizzo, data.comune, data.condominio]
            .filter(Boolean).join(" ").toLowerCase();
          if (!bag.includes(zona)) return;
        }

        for (const c of campi) {
          const scad = normalizeDate(c.val);
          if (!scad) continue;
          if (scad < now || scad > limite) continue;
          // Filtro tipo opzionale
          if (query.tipo) {
            const tipi = Array.isArray(query.tipo) ? query.tipo : [query.tipo];
            if (!tipi.includes(c.tipo)) continue;
          }
          const giorniAnticipo = Math.floor((scad.getTime() - now.getTime()) / 86400000);
          const nowIso = new Date().toISOString();
          out.push({
            id: `${d.id}__${c.tipo}`,
            tipo: c.tipo,
            ref: { tipo: "impianto", id: d.id },
            scadeIl: scad.toISOString(),
            giorniAnticipoAlert: 30,
            stato: giorniAnticipo <= 14 ? "imminente" : "futura",
            normaRiferimento: c.norma,
            note: [data.condominio, data.indirizzo, data.modello]
              .filter(Boolean).map(String).join(" · ") || undefined,
            createdAt: nowIso,
            updatedAt: nowIso,
          });
        }
      });
      if (out.length) break; // se la prima collection ha dati, non serve la seconda
    } catch (e) {
      const msg = String((e as Error).message || e);
      if (/permission|denied|NOT_FOUND/i.test(msg)) continue;
      throw e;
    }
  }

  out.sort((a, b) => (a.scadeIl < b.scadeIl ? -1 : 1));
  return out.slice(0, limit);
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

/**
 * Restituisce impianti senza `targa_cit` censita. Utile per compliance.
 */
export async function impiantiSenzaTarga(
  opts: { zona?: string; limit?: number } = {},
): Promise<Array<{ impiantoId: string; indirizzo?: string; condominio?: string }>> {
  const limit = opts.limit ?? 50;
  const db = cosminaDb();
  const out: Array<{ impiantoId: string; indirizzo?: string; condominio?: string }> = [];

  try {
    const snap = await db.collection("cosmina_impianti").limit(500).get();
    snap.forEach((d) => {
      const data = d.data() as Record<string, unknown>;
      const targa = String(data.targa_cit || data.targa || "").trim();
      if (targa) return;
      if (opts.zona) {
        const zona = opts.zona.toLowerCase();
        const bag = [data.indirizzo, data.comune, data.condominio]
          .filter(Boolean).join(" ").toLowerCase();
        if (!bag.includes(zona)) return;
      }
      out.push({
        impiantoId: d.id,
        indirizzo: data.indirizzo as string | undefined,
        condominio: data.condominio as string | undefined,
      });
    });
  } catch (e) {
    const msg = String((e as Error).message || e);
    if (/permission|denied|NOT_FOUND/i.test(msg)) return [];
    throw e;
  }

  return out.slice(0, limit);
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
