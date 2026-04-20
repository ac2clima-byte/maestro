/**
 * CHRONOS — tipi del dominio Pianificazione.
 *
 * Riferimento: context/nexo-architettura.md sez. 4 (CHRONOS).
 */

export type TipoSlot =
  | "intervento"
  | "manutenzione_periodica"
  | "ferie"
  | "malattia"
  | "formazione"
  | "altro";

export type StatoSlot = "libero" | "prenotato" | "occupato" | "annullato";

/** Slot atomico di agenda (granularità tipica 30 min). */
export interface Slot {
  id: string;
  tecnicoUid: string;
  /** Data ISO yyyy-mm-dd. */
  data: string;
  /** Ora inizio HH:mm (locale Europe/Rome). */
  oraInizio: string;
  /** Durata in minuti. */
  durataMin: number;
  tipo: TipoSlot;
  stato: StatoSlot;
  /** Riferimento all'intervento ARES (se prenotato per intervento). */
  interventoId?: string;
  /** Indirizzo / zona, utile per route planning. */
  indirizzo?: string;
  zona?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

/** Vista aggregata della giornata di un tecnico (lettura). */
export interface AgendaGiornaliera {
  tecnicoUid: string;
  data: string;
  slot: Slot[];
  oreOccupate: number;
  oreLibere: number;
  /** Ferie/malattia attiva nella giornata. */
  assenze?: Array<{ tipo: "ferie" | "malattia"; nota?: string }>;
}

export type TipoScadenza =
  | "manutenzione_periodica"
  | "ree"
  | "f_gas"
  | "contratto"
  | "altro";

export type StatoScadenza = "futura" | "imminente" | "scaduta" | "completata";

/** Scadenza tracciata. Persistita in `chronos_scadenze`. */
export interface Scadenza {
  id: string;
  tipo: TipoScadenza;
  /** Riferimento all'impianto, contratto o cliente. */
  ref: { tipo: "impianto" | "contratto" | "cliente"; id: string };
  scadeIl: string;          // ISO 8601
  giorniAnticipo?: number;  // soglia per "imminente"
  stato: StatoScadenza;
  zona?: string;
  responsabile?: string;
  note?: string;
}

export type StatoCampagna = "bozza" | "pianificata" | "in_corso" | "completata";

/** Campagna stagionale (es. spegnimento autunnale). `chronos_campagne`. */
export interface Campagna {
  id: string;
  nome: string;
  anno: number;
  tipo: "accensione" | "spegnimento" | "controllo_estivo" | "altro";
  comuni: string[];
  /** Numero impianti totali da coprire. */
  impiantiCount?: number;
  dataInizio?: string;
  dataFine?: string;
  stato: StatoCampagna;
  note?: string;
}

/** Conflitto rilevato in agenda (ritornato da `trovaConflitti`). */
export interface ConflittoAgenda {
  tecnicoUid: string;
  data: string;
  slot: Slot[];
  motivo:
    | "sovrapposizione"
    | "viaggio_impossibile"
    | "ferie"
    | "malattia"
    | "doppia_prenotazione";
  severita: "warning" | "error";
}

/** Festività italiana o aziendale che blocca le agende. */
export interface Festivita {
  data: string;          // yyyy-mm-dd
  nome: string;
  tipo: "nazionale" | "patronale" | "aziendale";
  bloccaAgende: boolean;
}
