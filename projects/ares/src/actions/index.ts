/**
 * ARES — azioni esposte agli altri Colleghi e all'Orchestratore.
 *
 * v0.1 implementato:
 *   · interventiAperti(filtri)  — LETTURA reale da COSMINA
 *   · apriIntervento(input)     — SCRITTURA con DRY-RUN di default
 *
 * Pattern standard NEXO (uguale a ECHO):
 *   · le LETTURE sono attive subito
 *   · le SCRITTURE su sistemi condivisi richiedono DUE strati di guardia:
 *       1. ARES_DRY_RUN=true  (default) — niente write su COSMINA
 *       2. ARES_ALLOWED_TIPI o ARES_ALLOWED_INDIRIZZI — whitelist
 *   · per attivare: env var espliciti + redeploy
 *
 * Stub `Not implemented`:
 *   · assegnaTecnico, proponiAssegnazioni, chiudiIntervento, generaRTI,
 *     notificaTecnico, briefingTecnico, cercaStoricoInterventi.
 */
import { initializeApp, getApps, applicationDefault, type App } from "firebase-admin/app";
import { getFirestore, type Firestore, FieldValue } from "firebase-admin/firestore";
import type {
  Intervento,
  InterventiAperFilters,
  PropostaAssegnazione,
  StatoIntervento,
  TipoIntervento,
  UrgenzaIntervento,
} from "../types/index.js";

// ─── Lazy Firebase apps (NEXO + COSMINA) ───────────────────────

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

// ─── Guardie scrittura (pattern uguale a ECHO) ─────────────────

function isDryRun(): boolean {
  return (process.env.ARES_DRY_RUN ?? process.env.DRY_RUN ?? "true")
    .toLowerCase() === "true";
}

/** Whitelist tipi intervento ammessi alla scrittura reale. Vuota = tutti. */
function isTipoAllowed(tipo: TipoIntervento): boolean {
  const wl = (process.env.ARES_ALLOWED_TIPI || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (wl.length === 0) return true;
  return wl.includes(String(tipo).toLowerCase());
}

/** Strip undefined: Firestore Admin non li accetta. */
function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj)) {
    if (obj[k] !== undefined) out[k] = obj[k];
  }
  return out as Partial<T>;
}

function makeId(prefix = "int"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeDate(v: unknown): string | undefined {
  if (!v) return undefined;
  if (typeof v === "string") return v;
  if (typeof v === "object" && v !== null) {
    const t = v as { toDate?: () => Date; _seconds?: number; seconds?: number };
    if (typeof t.toDate === "function") return t.toDate().toISOString();
    const s = t._seconds ?? t.seconds;
    if (typeof s === "number") return new Date(s * 1000).toISOString();
  }
  return undefined;
}

/**
 * Mappa una `bacheca_cards` row → Intervento NEXO.
 *
 * Schema reale (verificato su garbymobile-f89ac):
 *   name, boardName, desc, workDescription, stato, techName, techNames,
 *   due, created_at, updated_at, labels, materials, workHours,
 *   inBacheca, archiviato, listName, ...
 *
 * `listName="INTERVENTI"` distingue interventi dagli altri tipi di card
 * (FOTO, CONTATTI, ecc.).
 */
function snapshotToIntervento(id: string, data: Record<string, unknown>): Intervento {
  // Tecnico: techName (singolo) prevalente, techNames se array
  let tecnico: string | undefined;
  if (typeof data.techName === "string" && data.techName) tecnico = data.techName;
  else if (Array.isArray(data.techNames) && data.techNames.length > 0) {
    tecnico = String(data.techNames[0]);
  }
  // Stato: COSMINA usa stringhe libere, le mappo conservativo
  const statoRaw = String(data.stato || "").toLowerCase();
  let stato: StatoIntervento = "aperto";
  if (statoRaw.includes("complet")) stato = "completato";
  else if (statoRaw.includes("annul")) stato = "annullato";
  else if (statoRaw.includes("corso")) stato = "in_corso";
  else if (tecnico) stato = "assegnato";
  // Tipo: bacheca non ha tipo_intervento → infer da labels o default
  let tipo: TipoIntervento = "manutenzione";
  if (Array.isArray(data.labels)) {
    const labelsLower = data.labels.map((l) => String(l).toLowerCase());
    if (labelsLower.some((l) => l.includes("ripar") || l.includes("guasto"))) tipo = "riparazione";
    else if (labelsLower.some((l) => l.includes("install"))) tipo = "installazione";
    else if (labelsLower.some((l) => l.includes("sopral"))) tipo = "sopralluogo";
  }
  // Urgenza: dalla scadenza `due`
  let urgenza: UrgenzaIntervento = "media";
  if (data.due) {
    const dueIso = normalizeDate(data.due);
    if (dueIso) {
      const days = (Date.parse(dueIso) - Date.now()) / 86400000;
      if (days < 0) urgenza = "critica";
      else if (days < 2) urgenza = "alta";
      else if (days < 7) urgenza = "media";
      else urgenza = "bassa";
    }
  }
  return {
    id,
    impiantoTarga: undefined, // bacheca_cards non lo collega direttamente
    indirizzo: undefined,
    condominio: data.boardName as string | undefined,
    tipo,
    stato,
    urgenza,
    tecnico,
    dataPianificata: normalizeDate(data.due),
    dataEsecuzione: undefined,
    oreLavorate: typeof data.workHours === "number" ? data.workHours : undefined,
    note: (data.workDescription as string) || (data.desc as string) || (data.name as string) || undefined,
    esito: undefined,
    sourceEmailId: undefined,
    sourceLavagnaId: undefined,
    rtiPdfUrl: undefined,
    createdAt: normalizeDate(data.created_at) || nowIso(),
    updatedAt: normalizeDate(data.updated_at) || nowIso(),
  };
}

// ─── apriIntervento (SCRITTURA — dry-run di default) ──────────

export interface ApriInterventoInput {
  tipo: TipoIntervento;
  urgenza: UrgenzaIntervento;
  impiantoTarga?: string;
  indirizzo?: string;
  condominio?: string;
  note?: string;
  /** Se viene da IRIS: id email + id messaggio Lavagna. */
  sourceEmailId?: string;
  sourceLavagnaId?: string;
  /** Forza l'invio reale ignorando dry-run (USE WITH CARE). */
  force?: boolean;
}

/**
 * Crea un intervento in `bacheca_cards` (su COSMINA).
 *
 * Modalità sicure ATTIVE DI DEFAULT:
 *   · ARES_DRY_RUN=true       → niente write, ritorna intervento finto
 *                               con id `dryrun_*` e flag `_dryRun: true`.
 *   · ARES_ALLOWED_TIPI       → whitelist tipi. Vuota = tutti.
 *
 * Per attivare scritture reali:
 *   ARES_DRY_RUN=false
 *   ARES_ALLOWED_TIPI=manutenzione,riparazione   (consigliato)
 */
export async function apriIntervento(input: ApriInterventoInput): Promise<Intervento> {
  const id = makeId(isDryRun() ? "dryrun" : "int");
  const now = nowIso();

  const intervento: Intervento = {
    id,
    impiantoTarga: input.impiantoTarga,
    indirizzo: input.indirizzo,
    condominio: input.condominio,
    tipo: input.tipo,
    urgenza: input.urgenza,
    stato: "aperto",
    note: input.note,
    sourceEmailId: input.sourceEmailId,
    sourceLavagnaId: input.sourceLavagnaId,
    createdAt: now,
    updatedAt: now,
  };

  // 1. Whitelist tipi
  if (!isTipoAllowed(input.tipo) && !input.force) {
    return {
      ...intervento,
      note: (intervento.note || "") +
        ` [ARES skip: tipo "${input.tipo}" non in ARES_ALLOWED_TIPI]`,
    };
  }

  // 2. Dry-run: nessuna scrittura su COSMINA
  if (isDryRun() && !input.force) {
    // Logga sul mirror NEXO `ares_interventi` per diagnosi (NON COSMINA)
    try {
      await nexoDb()
        .collection("ares_interventi")
        .doc(id)
        .set(stripUndefined({
          ...intervento,
          _dryRun: true,
          _serverTime: FieldValue.serverTimestamp(),
        }));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`[ares] dry-run mirror failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    return { ...intervento, note: (intervento.note || "") + " [DRY-RUN: nessuna scrittura su COSMINA]" };
  }

  // 3. Scrittura reale su COSMINA — bacheca_cards
  // Schema verificato: name, boardName, desc/workDescription, stato,
  //   techName, due, listName, inBacheca, archiviato, labels, created_at,
  //   updated_at.
  // listName="INTERVENTI" per distinguerlo dalle altre card della bacheca.
  const cardName = input.note
    ? input.note.slice(0, 80)
    : `[ARES] ${input.tipo} ${input.urgenza}`;
  const labels: string[] = [`tipo:${input.tipo}`, `urgenza:${input.urgenza}`, "source:ares_nexo"];
  if (input.urgenza === "critica" || input.urgenza === "alta") labels.push("URGENTE");

  const cosminaDoc = stripUndefined({
    name: cardName,
    boardName: input.condominio || input.indirizzo || "(sconosciuto)",
    desc: input.note,
    workDescription: input.note,
    listName: "INTERVENTI",
    inBacheca: true,
    archiviato: false,
    stato: "aperto",
    labels,
    // Riferimenti origine per audit
    source_email_id: input.sourceEmailId,
    source_lavagna_id: input.sourceLavagnaId,
    source: "ares_nexo",
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });

  const ref = cosminaDb().collection("bacheca_cards").doc();
  await ref.set(cosminaDoc);

  // Mirror NEXO (per audit + lettura veloce dalla PWA NEXO)
  try {
    await nexoDb()
      .collection("ares_interventi")
      .doc(ref.id)
      .set(stripUndefined({
        ...intervento,
        id: ref.id,
        cosmina_doc_id: ref.id,
        _serverTime: FieldValue.serverTimestamp(),
      }));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(`[ares] mirror failed (cosmina write OK): ${e instanceof Error ? e.message : String(e)}`);
  }

  return { ...intervento, id: ref.id };
}

// ─── interventiAperti (LETTURA reale) ──────────────────────────

export async function interventiAperti(
  filters: InterventiAperFilters = {},
): Promise<Intervento[]> {
  const limit = filters.limit ?? 50;
  // bacheca_cards è poliforme: usa listName="INTERVENTI" per filtrare.
  // `inBacheca=true` esclude le card archiviate.
  let q: FirebaseFirestore.Query = cosminaDb()
    .collection("bacheca_cards")
    .where("listName", "==", "INTERVENTI")
    .where("inBacheca", "==", true);

  // tecnico in bacheca_cards = `techName` (singola string)
  if (filters.tecnico) q = q.where("techName", "==", filters.tecnico);
  // Lo stato è una stringa libera; filtro client-side dopo.

  // Ordering: `data_pianificata` può non essere sempre presente, fallback a created_at
  q = q.limit(limit * 2);

  const snap = await q.get();
  const out: Intervento[] = [];
  snap.forEach((d) => {
    const data = d.data() as Record<string, unknown>;
    out.push(snapshotToIntervento(d.id, data));
  });

  // Filtri client-side: stato attivo (escludi completato/annullato),
  // zona, urgenzaMin, finestra date.
  const statiAmmessi = new Set(filters.stato || ["aperto", "assegnato", "in_corso"]);
  let filtered = out.filter((i) => statiAmmessi.has(i.stato));
  if (filters.fromDate) {
    filtered = filtered.filter((i) => !i.dataPianificata || i.dataPianificata >= filters.fromDate!);
  }
  if (filters.toDate) {
    filtered = filtered.filter((i) => !i.dataPianificata || i.dataPianificata <= filters.toDate!);
  }
  if (filters.zona) {
    const z = filters.zona.toLowerCase();
    filtered = filtered.filter((i) =>
      [i.indirizzo, i.condominio].filter(Boolean).join(" ").toLowerCase().includes(z),
    );
  }
  if (filters.urgenzaMin) {
    const order = ["bassa", "media", "alta", "critica"];
    const min = order.indexOf(filters.urgenzaMin);
    filtered = filtered.filter((i) => order.indexOf(i.urgenza) >= min);
  }

  // Ordina per urgenza (critica → bassa) poi data
  filtered.sort((a, b) => {
    const order = ["critica", "alta", "media", "bassa"];
    const da = order.indexOf(a.urgenza);
    const db_ = order.indexOf(b.urgenza);
    if (da !== db_) return da - db_;
    const ta = a.dataPianificata || a.createdAt;
    const tb = b.dataPianificata || b.createdAt;
    return ta < tb ? -1 : 1;
  });

  return filtered.slice(0, limit);
}

// ─── Stub Not implemented (v0.2) ───────────────────────────────

export async function assegnaTecnico(
  _interventoId: string,
  _tecnicoUid: string,
  _opts: { dataPianificata?: string; auto?: boolean } = {},
): Promise<Intervento> {
  throw new Error("Not implemented: assegnaTecnico (v0.2 — richiede ARES_DRY_RUN=false + autorizzazione)");
}

export async function proponiAssegnazioni(
  _interventoId: string,
  _opts: { topN?: number } = {},
): Promise<PropostaAssegnazione> {
  throw new Error("Not implemented: proponiAssegnazioni (v0.2)");
}

export interface ChiusuraInterventoInput {
  esito: NonNullable<Intervento["esito"]>;
  oreLavorate: number;
  materiali?: Intervento["materiali"];
  note?: string;
  /** Se true, ARES chiede a DIKEA di generare la DiCo via Lavagna. */
  richiediDico?: boolean;
}

export async function chiudiIntervento(
  _interventoId: string,
  _input: ChiusuraInterventoInput,
): Promise<Intervento> {
  throw new Error("Not implemented: chiudiIntervento");
}

export async function generaRTI(_interventoId: string): Promise<{ pdfUrl: string }> {
  throw new Error("Not implemented: generaRTI");
}

export interface NotificaTecnicoInput {
  titolo: string;
  body: string;
  priority?: "low" | "normal" | "high" | "critical";
  url?: string;
}

export async function notificaTecnico(
  _tecnicoUid: string,
  _input: NotificaTecnicoInput,
): Promise<{ delivered: boolean; via: string }> {
  throw new Error("Not implemented: notificaTecnico");
}

export interface BriefingTecnico {
  tecnicoUid: string;
  data: string; // ISO 8601 yyyy-mm-dd
  interventi: Array<{
    interventoId: string;
    orarioStimato?: string;
    indirizzo: string;
    note?: string;
  }>;
  generatoIl: string;
}

export async function briefingTecnico(
  _tecnicoUid: string,
  _data: string,
): Promise<BriefingTecnico> {
  throw new Error("Not implemented: briefingTecnico");
}

export async function cercaStoricoInterventi(
  _impiantoTarga: string,
  _opts: { limit?: number } = {},
): Promise<Intervento[]> {
  throw new Error("Not implemented: cercaStoricoInterventi");
}
