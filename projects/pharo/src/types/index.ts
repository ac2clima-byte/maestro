/**
 * PHARO — tipi del dominio Monitoring.
 *
 * Riferimento: context/nexo-architettura.md sez. 10 (PHARO).
 */

export type SeveritaAlert = "info" | "warning" | "critical";

export type StatoAlert =
  | "nuovo"
  | "acknowledged"
  | "silenziato"
  | "risolto"
  | "scaduto";

/** Alert. Persistito in `pharo_alerts`. */
export interface Alert {
  id: string;
  /** Id della regola che ha generato questo alert. */
  regolaId?: string;
  titolo: string;
  descrizione: string;
  severita: SeveritaAlert;
  stato: StatoAlert;
  /** Riferimento all'entità interessata. */
  ref?: { tipo: string; id: string };
  /** Se l'alert è ricorrente, qui il numero di volte aperto. */
  ricorrenze?: number;
  /** Ultimo hit (per dedup). */
  ultimoHitAt?: string;
  ackBy?: string;
  ackAt?: string;
  ackNota?: string;
  risolto?: { at: string; by?: string; nota?: string };
  silenziatoFino?: string;
  /** Collega suggerito per la risoluzione. */
  suggestRoute?: string;
  /** Messaggio Lavagna già inviato? */
  lavagnaId?: string;
  createdAt: string;
  updatedAt: string;
}

/** Heartbeat di un servizio (worker, function, Collega). */
export interface Heartbeat {
  servizio: string;       // es. "cosmina_worker_alberto", "iris-pipeline"
  at: string;
  versione?: string;
  /** Latenza media rilevata in ms (se il servizio misura). */
  latenzaMs?: number;
  /** Errori recenti. */
  erroriUltimaOra?: number;
  meta?: Record<string, unknown>;
}

export type LivelloSalute = "verde" | "giallo" | "rosso";

/** Check di salute: risultato di una regola sul momento. */
export interface HealthCheck {
  id: string;
  regolaId: string;
  eseguitoIl: string;
  esito: "ok" | "warning" | "fail";
  /** Punteggio 0-100 (aggregato globale per dashboard). */
  punteggioSalute: number;
  livello: LivelloSalute;
  dettagli?: string;
  alertGenerato?: string;
  durataMs?: number;
}

export type TipoRegola =
  | "heartbeat"
  | "budget"
  | "email_senza_risposta"
  | "interventi_bloccati"
  | "fatture_non_inviate"
  | "impianti_orfani"
  | "clienti_silenziosi"
  | "duplicati"
  | "scadenza_dataset"
  | "custom";

/** Regola di monitoring periodico. Persistita in `pharo_checks`. */
export interface RegolaMonitoring {
  id: string;
  nome: string;
  tipo: TipoRegola;
  descrizione?: string;
  attiva: boolean;
  /** Cron / intervallo (secondi). */
  intervalSec: number;
  /** Parametri specifici (soglie, finestre, ecc.). */
  parametri?: Record<string, unknown>;
  severitaDefault: SeveritaAlert;
  /** Quando è stata eseguita l'ultima volta. */
  ultimaEsecuzione?: string;
  ultimoEsito?: "ok" | "warning" | "fail";
  /** Quante volte ha generato alert nell'ultimo mese. */
  hitsUltimoMese?: number;
}

/** Snapshot budget Anthropic. */
export interface BudgetSnapshot {
  yyyymm: string;
  budgetTotaleEur: number;
  spesoEur: number;
  percentuale: number;
  livello: LivelloSalute;
  dettaglio?: Array<{ collega: string; tokens: number; costoEur: number }>;
  generatoIl: string;
}
