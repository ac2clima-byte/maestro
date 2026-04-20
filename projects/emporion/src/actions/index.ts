/**
 * EMPORION — azioni esposte.
 *
 * v0.1 implementato:
 *   · disponibilita(query) — LETTURA reale da COSMINA:
 *                             `magazzino` (articoli) + `magazzino_giacenze`.
 *
 * Stub "Not implemented" per tutto il resto (scrittura movimenti, ordini,
 * trasferimenti, OCR DDT, inventari).
 */
import { initializeApp, getApps, applicationDefault, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import type {
  Articolo,
  CausaleMovimento,
  DisponibilitaResult,
  InventarioFurgone,
  Movimento,
  OrdineFornitore,
  Posizione,
} from "../types/index.js";

// ─── Lazy Firebase (COSMINA) ───────────────────────────────────

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

// ─── Disponibilità ──────────────────────────────────────────────

export interface DisponibilitaQuery {
  articoloId?: string;
  codice?: string;
  descrizione?: string;     // ricerca testuale
  posizioni?: Posizione[];
}

/**
 * Cerca un articolo per codice o descrizione in COSMINA `magazzino`,
 * poi somma le giacenze da `magazzino_giacenze`.
 *
 * Matching:
 *   - `codice`: esatto su `codice`, poi `codice_costruttore`, `codice_fornitore`
 *   - `descrizione`: sottostringa case-insensitive
 *   - `articoloId`: exact match su doc id
 */
export async function disponibilita(query: DisponibilitaQuery): Promise<DisponibilitaResult[]> {
  const db = cosminaDb();
  const results: DisponibilitaResult[] = [];

  // Trova articoli candidati
  let articoli: Array<{ id: string; codice: string; descrizione: string; scortaMinima?: number }> = [];

  if (query.articoloId) {
    try {
      const snap = await db.collection("magazzino").doc(query.articoloId).get();
      if (snap.exists) {
        const d = snap.data() || {};
        articoli.push({
          id: snap.id,
          codice: String(d.codice || ""),
          descrizione: String(d.descrizione || ""),
          scortaMinima: typeof d.scorta_minima === "number" ? d.scorta_minima : undefined,
        });
      }
    } catch {}
  } else if (query.codice) {
    const code = query.codice.trim();
    // Prova i tre campi
    const fields = ["codice", "codice_costruttore", "codice_fornitore"];
    for (const f of fields) {
      try {
        const snap = await db.collection("magazzino").where(f, "==", code).limit(10).get();
        snap.forEach((d) => {
          const data = d.data() || {};
          articoli.push({
            id: d.id,
            codice: String(data.codice || ""),
            descrizione: String(data.descrizione || ""),
            scortaMinima: typeof data.scorta_minima === "number" ? data.scorta_minima : undefined,
          });
        });
        if (articoli.length) break;
      } catch {}
    }
  } else if (query.descrizione) {
    // Firestore non ha LIKE: fetch N e filtro client-side
    const q = query.descrizione.toLowerCase();
    const snap = await db.collection("magazzino").limit(300).get();
    snap.forEach((d) => {
      const data = d.data() || {};
      const desc = String(data.descrizione || "").toLowerCase();
      const cod = String(data.codice || "").toLowerCase();
      if (desc.includes(q) || cod.includes(q)) {
        articoli.push({
          id: d.id,
          codice: String(data.codice || ""),
          descrizione: String(data.descrizione || ""),
          scortaMinima: typeof data.scorta_minima === "number" ? data.scorta_minima : undefined,
        });
      }
    });
    articoli = articoli.slice(0, 20);
  }

  // Per ogni articolo, aggrega giacenze
  for (const a of articoli) {
    const perPosizione: Array<{ posizione: Posizione; quantita: number }> = [];
    let totale = 0;
    try {
      const gSnap = await db.collection("magazzino_giacenze")
        .where("articolo_id", "==", a.id).limit(20).get();
      gSnap.forEach((g) => {
        const gd = g.data() || {};
        const qta = Number(gd.quantita || 0);
        const magId = String(gd.magazzino_id || "centrale");
        const pos = normalizzaPosizione(magId);
        perPosizione.push({ posizione: pos, quantita: qta });
        totale += qta;
      });
    } catch {}

    results.push({
      articoloId: a.id,
      totale,
      perPosizione,
      scortaMinima: a.scortaMinima,
      sottoScorta: typeof a.scortaMinima === "number" ? totale < a.scortaMinima : false,
    });
  }

  return results;
}

function normalizzaPosizione(magId: string): Posizione {
  const s = magId.toLowerCase();
  if (s.includes("centrale") || s.includes("principal")) return "centrale";
  if (s.includes("malvic")) return "furgone_malvicino";
  if (s.includes("della")) return "furgone_dellafiore";
  if (s.includes("victor")) return "furgone_victor";
  if (s.includes("marco")) return "furgone_marco";
  if (s.includes("david")) return "furgone_david";
  if (s.includes("cantier")) return "cantiere";
  return "centrale";
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
