/**
 * CHRONOS — azioni esposte.
 *
 * v0.1 implementato:
 *   · slotDisponibili(criteri)   — LETTURA reale da COSMINA bacheca_cards
 *                                   (interventi pianificati per data/tecnico)
 *   · scadenzeProssime(query)    — LETTURA reale da COSMINA cosmina_impianti
 *                                   (scadenze manutenzione)
 *
 * Pattern NEXO: letture attive subito, scritture richiedono DRY_RUN=false.
 *
 * Stub "Not implemented":
 *   · agendaGiornaliera, agendaSettimanale, prenotaSlot, liberaSlot,
 *     scadenzeScadute, pianificaCampagna, trovaConflitti, riprogramma,
 *     ottimizzaGiornata, registraFerie, registraMalattia.
 */
import { initializeApp, getApps, applicationDefault, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import type {
  AgendaGiornaliera,
  Campagna,
  ConflittoAgenda,
  Scadenza,
  Slot,
  StatoCampagna,
  TipoScadenza,
} from "../types/index.js";

// ─── Lazy Firebase apps (COSMINA) ──────────────────────────────

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

// ─── Disponibilità / agenda ─────────────────────────────────────

export interface SlotDisponibiliCriteri {
  tecnicoUid?: string | string[];
  zona?: string;
  competenze?: string[];
  durataMin: number;
  fromDate: string;
  toDate: string;
  maxResults?: number;
}

/**
 * Legge gli interventi pianificati da COSMINA bacheca_cards e restituisce
 * gli "slot occupati" nella finestra temporale richiesta.
 *
 * NOTA: v0.1 ritorna gli slot OCCUPATI (con `stato="occupato"`) non quelli
 * liberi — il calcolo dei liberi richiede la conoscenza delle ore lavorative
 * del tecnico, che non è ancora modellata in NEXO. Per ora serve a rispondere
 * a "quando è libero [tecnico]?" mostrando quando è GIÀ impegnato.
 */
export async function slotDisponibili(
  criteri: SlotDisponibiliCriteri,
): Promise<Slot[]> {
  const limit = criteri.maxResults ?? 50;
  const from = new Date(criteri.fromDate);
  const to = new Date(criteri.toDate);

  let q: FirebaseFirestore.Query = cosminaDb()
    .collection("bacheca_cards")
    .where("listName", "==", "INTERVENTI")
    .where("inBacheca", "==", true)
    .limit(limit * 3);

  const tecFilter = Array.isArray(criteri.tecnicoUid)
    ? criteri.tecnicoUid.map((s) => s.toLowerCase())
    : criteri.tecnicoUid
      ? [criteri.tecnicoUid.toLowerCase()]
      : null;

  const snap = await q.get();
  const out: Slot[] = [];
  snap.forEach((d) => {
    const data = d.data() as Record<string, unknown>;
    const due = normalizeDate(data.due);
    if (!due) return;
    if (due < from || due > to) return;

    let tecnico: string | undefined;
    if (typeof data.techName === "string" && data.techName) tecnico = data.techName;
    else if (Array.isArray(data.techNames) && data.techNames.length > 0) {
      tecnico = String(data.techNames[0]);
    }
    if (tecFilter && (!tecnico || !tecFilter.includes(tecnico.toLowerCase()))) return;

    if (criteri.zona) {
      const zona = criteri.zona.toLowerCase();
      const bag = String(data.boardName || "").toLowerCase();
      if (!bag.includes(zona)) return;
    }

    const nowIso = new Date().toISOString();
    out.push({
      id: d.id,
      tecnicoUid: tecnico || "?",
      data: due.toISOString().slice(0, 10),
      oraInizio: due.toTimeString().slice(0, 5),
      durataMin: criteri.durataMin,
      tipo: "intervento",
      stato: "occupato",
      interventoId: d.id,
      indirizzo: data.boardName as string | undefined,
      zona: criteri.zona,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  });

  out.sort((a, b) => {
    const ka = `${a.data}T${a.oraInizio}`;
    const kb = `${b.data}T${b.oraInizio}`;
    return ka < kb ? -1 : 1;
  });
  return out.slice(0, limit);
}

export async function agendaGiornaliera(
  _tecnicoUid: string,
  _data: string,
): Promise<AgendaGiornaliera> {
  throw new Error("Not implemented: agendaGiornaliera (v0.2)");
}

export async function agendaSettimanale(
  _tecnicoUid: string,
  _weekIsoStart: string,
): Promise<AgendaGiornaliera[]> {
  throw new Error("Not implemented: agendaSettimanale (v0.2)");
}

// ─── Prenotazione / liberazione ────────────────────────────────

export interface PrenotaSlotInput {
  tecnicoUid: string;
  data: string;
  oraInizio: string;
  durataMin: number;
  interventoId: string;
  indirizzo?: string;
  zona?: string;
}

export async function prenotaSlot(_input: PrenotaSlotInput): Promise<Slot> {
  throw new Error("Not implemented: prenotaSlot (v0.2 — scrittura COSMINA)");
}

export async function liberaSlot(
  _slotId: string,
  _opts: { motivo?: string } = {},
): Promise<Slot> {
  throw new Error("Not implemented: liberaSlot (v0.2)");
}

// ─── Scadenze ──────────────────────────────────────────────────

export interface ScadenzeQuery {
  zona?: string;
  tipo?: TipoScadenza | TipoScadenza[];
  finestraGiorni?: number;
  limit?: number;
}

/**
 * Legge gli impianti con prossima scadenza di manutenzione.
 *
 * Collection reale COSMINA: `cosmina_impianti` con campo `data_prossima_manutenzione`.
 * Se il nome del campo/collection è diverso, ritorna array vuoto anziché crashare.
 */
export async function scadenzeProssime(
  query: ScadenzeQuery = {},
): Promise<Scadenza[]> {
  const limit = query.limit ?? 50;
  const finestra = query.finestraGiorni ?? 60;
  const now = new Date();
  const limite = new Date(now.getTime() + finestra * 86400000);

  try {
    const snap = await cosminaDb()
      .collection("cosmina_impianti")
      .limit(limit * 3)
      .get();

    const out: Scadenza[] = [];
    snap.forEach((d) => {
      const data = d.data() as Record<string, unknown>;
      // Campi possibili (verifico i più comuni)
      const scadRaw =
        data.data_prossima_manutenzione ||
        data.prossima_manutenzione ||
        data.data_scadenza ||
        data.scadenza_curit ||
        data.dataScadenza;
      const scadDate = normalizeDate(scadRaw);
      if (!scadDate) return;
      if (scadDate < now || scadDate > limite) return;

      if (query.zona) {
        const zona = query.zona.toLowerCase();
        const bag = [data.indirizzo, data.comune, data.condominio]
          .filter(Boolean).join(" ").toLowerCase();
        if (!bag.includes(zona)) return;
      }

      const giorniAnticipo = Math.floor((scadDate.getTime() - now.getTime()) / 86400000);
      const stato = giorniAnticipo <= 14 ? "imminente" : "futura";
      out.push({
        id: d.id,
        tipo: "manutenzione_periodica" as TipoScadenza,
        ref: { tipo: "impianto", id: d.id },
        scadeIl: scadDate.toISOString(),
        giorniAnticipo,
        stato,
        zona: (data.comune as string) || undefined,
        note: [data.condominio, data.indirizzo, data.modello]
          .filter(Boolean).join(" · ") || undefined,
      });
    });

    out.sort((a, b) => (a.scadeIl < b.scadeIl ? -1 : 1));
    return out.slice(0, limit);
  } catch (e) {
    const msg = String((e as Error).message || e);
    if (/permission|denied|not.*found|5 NOT_FOUND/i.test(msg)) {
      return [];
    }
    throw e;
  }
}

export async function scadenzeScadute(
  _query: Pick<ScadenzeQuery, "zona" | "tipo" | "limit"> = {},
): Promise<Scadenza[]> {
  throw new Error("Not implemented: scadenzeScadute (v0.2)");
}

// ─── Campagne ──────────────────────────────────────────────────

export interface PianificaCampagnaInput {
  nome: string;
  anno: number;
  comuni: string[];
  tipo: Campagna["tipo"];
  dataInizio?: string;
  dataFine?: string;
  statoIniziale?: StatoCampagna;
}

export async function pianificaCampagna(
  _input: PianificaCampagnaInput,
): Promise<Campagna> {
  throw new Error("Not implemented: pianificaCampagna (v0.2)");
}

// ─── Conflitti / riprogrammazioni ──────────────────────────────

export async function trovaConflitti(
  _data: string,
  _tecnicoUid?: string,
): Promise<ConflittoAgenda[]> {
  throw new Error("Not implemented: trovaConflitti (v0.2)");
}

export async function riprogramma(
  _slotId: string,
  _nuovaData: string,
  _opts: { nuovaOraInizio?: string; motivo?: string } = {},
): Promise<Slot> {
  throw new Error("Not implemented: riprogramma (v0.2)");
}

// ─── Ottimizzazione giornata ───────────────────────────────────

export interface GiornataOttimizzata {
  tecnicoUid: string;
  data: string;
  ordine: Array<{ slotId: string; orarioPropostoInizio: string }>;
  km_stimati?: number;
  durata_totale_min: number;
}

export async function ottimizzaGiornata(
  _tecnicoUid: string,
  _data: string,
): Promise<GiornataOttimizzata> {
  throw new Error("Not implemented: ottimizzaGiornata (v0.2)");
}

// ─── Assenze ───────────────────────────────────────────────────

export async function registraFerie(
  _tecnicoUid: string,
  _dal: string,
  _al: string,
  _opts: { note?: string } = {},
): Promise<{ slotsBloccati: number }> {
  throw new Error("Not implemented: registraFerie (v0.2)");
}

export async function registraMalattia(
  _tecnicoUid: string,
  _dal: string,
  _al?: string,
): Promise<{ slotsBloccati: number }> {
  throw new Error("Not implemented: registraMalattia (v0.2)");
}
