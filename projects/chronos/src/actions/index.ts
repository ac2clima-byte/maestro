/**
 * CHRONOS — azioni esposte.
 *
 * Tutti gli stub lanciano "Not implemented". Le firme sono il contratto.
 */
import type {
  AgendaGiornaliera,
  Campagna,
  ConflittoAgenda,
  Scadenza,
  Slot,
  StatoCampagna,
  TipoScadenza,
} from "../types/index.js";

// ─── Disponibilità / agenda ─────────────────────────────────────

export interface SlotDisponibiliCriteri {
  /** Filtra per uno o più tecnici. */
  tecnicoUid?: string | string[];
  /** Zona (comune o area logica). */
  zona?: string;
  /** Competenze richieste (es. ["caldaie_murali"]). */
  competenze?: string[];
  /** Durata richiesta in minuti. */
  durataMin: number;
  /** Finestra temporale di ricerca. */
  fromDate: string;
  toDate: string;
  /** Numero massimo di candidati restituiti. */
  maxResults?: number;
}

export async function slotDisponibili(
  _criteri: SlotDisponibiliCriteri,
): Promise<Slot[]> {
  throw new Error("Not implemented: slotDisponibili");
}

export async function agendaGiornaliera(
  _tecnicoUid: string,
  _data: string,
): Promise<AgendaGiornaliera> {
  throw new Error("Not implemented: agendaGiornaliera");
}

export async function agendaSettimanale(
  _tecnicoUid: string,
  _weekIsoStart: string,
): Promise<AgendaGiornaliera[]> {
  throw new Error("Not implemented: agendaSettimanale");
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
  throw new Error("Not implemented: prenotaSlot");
}

export async function liberaSlot(
  _slotId: string,
  _opts: { motivo?: string } = {},
): Promise<Slot> {
  throw new Error("Not implemented: liberaSlot");
}

// ─── Scadenze ──────────────────────────────────────────────────

export interface ScadenzeQuery {
  zona?: string;
  tipo?: TipoScadenza | TipoScadenza[];
  finestraGiorni?: number;
  limit?: number;
}

export async function scadenzeProssime(
  _query: ScadenzeQuery = {},
): Promise<Scadenza[]> {
  throw new Error("Not implemented: scadenzeProssime");
}

export async function scadenzeScadute(
  _query: Pick<ScadenzeQuery, "zona" | "tipo" | "limit"> = {},
): Promise<Scadenza[]> {
  throw new Error("Not implemented: scadenzeScadute");
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
  throw new Error("Not implemented: pianificaCampagna");
}

// ─── Conflitti / riprogrammazioni ──────────────────────────────

export async function trovaConflitti(
  _data: string,
  _tecnicoUid?: string,
): Promise<ConflittoAgenda[]> {
  throw new Error("Not implemented: trovaConflitti");
}

export async function riprogramma(
  _slotId: string,
  _nuovaData: string,
  _opts: { nuovaOraInizio?: string; motivo?: string } = {},
): Promise<Slot> {
  throw new Error("Not implemented: riprogramma");
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
  throw new Error("Not implemented: ottimizzaGiornata");
}

// ─── Assenze ───────────────────────────────────────────────────

export async function registraFerie(
  _tecnicoUid: string,
  _dal: string,
  _al: string,
  _opts: { note?: string } = {},
): Promise<{ slotsBloccati: number }> {
  throw new Error("Not implemented: registraFerie");
}

export async function registraMalattia(
  _tecnicoUid: string,
  _dal: string,
  _al?: string,
): Promise<{ slotsBloccati: number }> {
  throw new Error("Not implemented: registraMalattia");
}
