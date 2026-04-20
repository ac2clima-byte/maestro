/**
 * ARES — tipi del dominio Operativo / Interventi.
 *
 * Riferimento: context/nexo-architettura.md sez. 3 (ARES) e schema
 * cosmina_impianti / cosmina_interventi_pianificati in acg_suite/CLAUDE.md.
 */

export type TipoIntervento =
  | "manutenzione"
  | "riparazione"
  | "installazione"
  | "sopralluogo"
  | "regolarizzazione_curit";

export type StatoIntervento =
  | "aperto"
  | "assegnato"
  | "in_corso"
  | "completato"
  | "annullato";

export type UrgenzaIntervento = "bassa" | "media" | "alta" | "critica";

/** Materiale usato in un intervento (riferimento a `magazzino`). */
export interface MaterialeUsato {
  articoloId: string;
  codice?: string;
  descrizione?: string;
  quantita: number;
  unita?: string;
  prelevatoDa?: string; // "centrale" | "furgone_<tecnico>"
}

/** Singolo intervento gestito da ARES. Persistito in `ares_interventi`. */
export interface Intervento {
  id: string;
  /** Riferimento all'impianto in `cosmina_impianti` (campo `targa`). */
  impiantoTarga?: string;
  /** Indirizzo / condominio se l'impianto non è ancora in CRM. */
  indirizzo?: string;
  condominio?: string;
  tipo: TipoIntervento;
  stato: StatoIntervento;
  urgenza: UrgenzaIntervento;
  /** Tecnico assegnato (uid in `acg_users`). */
  tecnico?: string;
  /** Data pianificata (ISO 8601). Compilata da CHRONOS via richiesta_slot. */
  dataPianificata?: string;
  /** Data effettiva di esecuzione, compilata in chiusura. */
  dataEsecuzione?: string;
  oreLavorate?: number;
  materiali?: MaterialeUsato[];
  note?: string;
  /** Esito di chiusura. */
  esito?: "ok" | "parziale" | "non_risolto";
  /** Riferimento all'eventuale email che ha originato l'intervento (IRIS). */
  sourceEmailId?: string;
  /** Riferimento al messaggio Lavagna che ha innescato l'apertura. */
  sourceLavagnaId?: string;
  /** Riferimento RTI generato (se presente). */
  rtiPdfUrl?: string;
  createdAt: string;
  updatedAt: string;
}

/** Tecnico ACG/Guazzotti. Vista locale ARES, alimentata da `acg_users` + COSMINA config. */
export interface Tecnico {
  uid: string;
  nome: string;
  ruolo: "tecnico" | "collaboratore" | "admin";
  attivo: boolean;
  zone?: string[];           // es. ["alessandria", "voghera"]
  competenze?: string[];     // es. ["caldaie_murali", "pdc", "centrali_termiche"]
  /** Magazzino di riferimento (es. "furgone_lorenzo"). */
  furgone?: string;
  /** Capacità giornaliera massima di interventi (default 6). */
  capacitaGiornaliera?: number;
}

/** Proposta di assegnazione: top-N candidati con score. `ares_assegnazioni`. */
export interface PropostaAssegnazione {
  id: string;
  interventoId: string;
  proposteAt: string;
  candidati: Array<{
    tecnicoUid: string;
    score: number;            // 0-100
    motivazione: string;      // "vicino al condominio + carico basso domani"
    slotProposto?: string;    // ISO 8601, se CHRONOS ha già risposto
  }>;
  /** Quale candidato è stato scelto (se l'utente ha confermato). */
  scelto?: string;
  /** Da chi è stata accettata. */
  accettataDa?: "alberto" | "auto";
  status: "proposta" | "confermata" | "rifiutata";
}

/** Filtri standard per `interventiAperti`. */
export interface InterventiAperFilters {
  stato?: StatoIntervento[];
  tecnico?: string;
  zona?: string;
  urgenzaMin?: UrgenzaIntervento;
  fromDate?: string;
  toDate?: string;
  limit?: number;
}
