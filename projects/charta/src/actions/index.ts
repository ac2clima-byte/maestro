/**
 * CHARTA — azioni esposte.
 *
 * v0.1 implementato:
 *   · estraiIncassiDaEmail(emailId|body) — parsing regex su testo email
 *     per trovare importi + causali + date. Non scrive nulla.
 *   · reportMensile(yyyymm) — aggregazione best-effort da iris_emails
 *     (FATTURA_FORNITORE, RICHIESTA_PAGAMENTO, ecc.) come placeholder
 *     finché non c'è Fatture-in-Cloud.
 */
import { initializeApp, getApps, applicationDefault, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
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

// ─── Lazy Firebase (NEXO) ──────────────────────────────────────

const NEXO_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "nexo-hub-15f2d";

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

/**
 * Estrae incassi da un'email (body passato direttamente o tramite ID).
 *
 * v0.1: regex su importi in formato €/EUR con eventuale data/causale vicine.
 * NON registra nulla (autoRegistra ignorato finché DRY_RUN è il default).
 *
 * Pattern riconosciuti:
 *   - "€ 1.234,56" / "EUR 1234.56" / "1.234,56 €"
 *   - Rif/Nr/Causale: testo fino a 60 char dopo la parola chiave
 *   - Data in formato gg/mm/aaaa o aaaa-mm-gg
 */
export async function estraiIncassiDaEmail(
  emailIdOrBody: string,
  _opts: { autoRegistra?: boolean; body?: string } = {},
): Promise<Array<RegistraIncassoInput>> {
  let body = _opts.body || "";
  let emailId = emailIdOrBody;

  // Se sembra un ID breve, prova a leggere il body da iris_emails
  if (!body && emailIdOrBody && emailIdOrBody.length < 80 && !/\s/.test(emailIdOrBody)) {
    try {
      const snap = await nexoDb().collection("iris_emails").doc(emailIdOrBody).get();
      const d = snap.data() || {};
      body = String((d.raw || {}).body_text || "");
    } catch {
      // fallback: tratta l'input come body grezzo
      body = emailIdOrBody;
    }
  } else {
    body = emailIdOrBody;
    emailId = _opts.body ? emailIdOrBody : "";
  }

  if (!body) return [];

  const out: RegistraIncassoInput[] = [];

  // Regex importi: € 1.234,56 | EUR 1234.56 | 1.234,56 € | 1234.56 EUR
  const importoRe = /(?:€|EUR)\s*([\d]{1,3}(?:[.\s][\d]{3})*(?:[.,]\d{1,2})?)|([\d]{1,3}(?:[.\s][\d]{3})*(?:[.,]\d{1,2})?)\s*(?:€|EUR)/gi;
  const match: Array<{ importo: number; pos: number; raw: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = importoRe.exec(body)) !== null) {
    const raw = m[1] || m[2];
    if (!raw) continue;
    // Normalizza: 1.234,56 → 1234.56 ; 1,234.56 → 1234.56
    let norm = raw.replace(/\s/g, "");
    if (norm.includes(",") && norm.includes(".")) {
      // Europeo: 1.234,56 → rimuovi . e sostituisci , con .
      if (norm.lastIndexOf(",") > norm.lastIndexOf(".")) {
        norm = norm.replace(/\./g, "").replace(",", ".");
      } else {
        norm = norm.replace(/,/g, "");
      }
    } else if (norm.includes(",")) {
      norm = norm.replace(",", ".");
    }
    const n = parseFloat(norm);
    if (Number.isFinite(n) && n > 0) {
      match.push({ importo: n, pos: m.index, raw: m[0] });
    }
  }

  // Data: 01/02/2026 o 2026-02-01
  const dataRe = /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/;
  const dataMatch = dataRe.exec(body);
  const dataStr = dataMatch ? dataMatch[1] : "";
  const dataIso = normalizzaData(dataStr) || new Date().toISOString();

  // Causale: prende 40 char attorno alle parole chiave
  const causaleRe = /(?:rif(?:erimento)?|causale|nr\.?|numero|fatt(?:ura)?)\.?[\s:]*([A-Z0-9\/\-\._]{3,40})/i;
  const causaleMatch = causaleRe.exec(body);
  const causale = causaleMatch ? causaleMatch[1].trim() : undefined;

  // Controparte: prima riga tipo "Da: X" o "From: X"
  const fromRe = /(?:da|from|gentile|spett\.le)[\s:]+([A-Za-zÀ-ÿ\s'.&]{3,60})/i;
  const fromMatch = fromRe.exec(body);
  const controparteNome = fromMatch ? fromMatch[1].trim() : undefined;

  for (const im of match) {
    // Euristica direzione: "pagamento ricevuto", "incasso", "accredito" → in
    // "fattura da pagare", "addebito" → out. Default "in".
    const ctx = body.slice(Math.max(0, im.pos - 80), im.pos + 80).toLowerCase();
    const direzione: "in" | "out" = /addebito|pagare|fornitor|fattura.*forn/i.test(ctx) ? "out" : "in";

    out.push({
      direzione,
      controparteId: "unknown",
      controparteNome,
      importo: im.importo,
      data: dataIso,
      metodo: "bonifico" as MetodoPagamento,
      causale,
      fonte: "email" as Incasso["fonte"],
      sourceEmailId: emailId || undefined,
    });
  }

  return out;
}

function normalizzaData(s: string): string | undefined {
  if (!s) return undefined;
  // 2026-02-01 già ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00:00.000Z`;
  // 01/02/2026 o 01-02-2026
  const m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/.exec(s);
  if (!m) return undefined;
  const gg = m[1].padStart(2, "0");
  const mm = m[2].padStart(2, "0");
  let aa = m[3];
  if (aa.length === 2) aa = (parseInt(aa) > 50 ? "19" : "20") + aa;
  return `${aa}-${mm}-${gg}T00:00:00.000Z`;
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

/**
 * Report mensile aggregato best-effort.
 *
 * v0.1: in assenza di un'integrazione Fatture-in-Cloud, stima i volumi
 * basandosi su iris_emails classificate `FATTURA_FORNITORE` / `RICHIESTA_PAGAMENTO`.
 * Ritorna conteggi reali ma totali a 0 (non abbiamo accesso agli importi reali).
 */
export async function reportMensile(yyyymm: string): Promise<ReportMensile> {
  const now = new Date();
  const db = nexoDb();

  // Finestra mese: yyyymm = "2026-04"
  const m = /^(\d{4})-(\d{2})$/.exec(yyyymm);
  const start = m ? new Date(`${yyyymm}-01T00:00:00Z`) : new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);

  const snap = await db.collection("iris_emails")
    .orderBy("raw.received_time", "desc")
    .limit(500).get();

  let fornitori = 0;
  let richiestePagamento = 0;
  snap.forEach((d) => {
    const data = d.data() || {};
    const ricIso = (data.raw || {}).received_time;
    if (!ricIso) return;
    const ric = new Date(ricIso);
    if (ric < start || ric >= end) return;
    const cat = (data.classification || {}).category || "";
    if (cat === "FATTURA_FORNITORE") fornitori++;
    else if (cat === "RICHIESTA_PAGAMENTO") richiestePagamento++;
  });

  return {
    yyyymm,
    emesso: { count: 0, totale: 0 },
    incassato: { count: 0, totale: 0 },
    daIncassare: { count: richiestePagamento, totale: 0 },
    ricevute: { count: fornitori, totale: 0 },
    pagate: { count: 0, totale: 0 },
    daPagare: { count: fornitori, totale: 0 },
    generatoIl: now.toISOString(),
  };
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
