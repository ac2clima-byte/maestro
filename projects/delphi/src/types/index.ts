/**
 * DELPHI — tipi del dominio Analisi.
 *
 * Riferimento: context/nexo-architettura.md sez. 9 (DELPHI).
 */

export type TrendDirezione = "up" | "down" | "flat";

/** KPI singolo. Persistito (snapshot periodico) in `delphi_kpi`. */
export interface KPI {
  id: string;
  nome: string;
  valore: number;
  unita?: string;            // "EUR", "interventi", "%", ecc.
  /** Variazione vs periodo precedente (es. mese precedente). */
  delta?: number;
  /** Variazione percentuale. */
  deltaPct?: number;
  trend?: TrendDirezione;
  /** Target di riferimento (se definito). */
  target?: number;
  /** Quanto siamo dal target in %. Negativo = sotto target. */
  scostamentoTargetPct?: number;
  /** Periodo riferimento. */
  periodo: { from: string; to: string };
  /** Quando calcolato. */
  generatoIl: string;
  fonti?: string[];
}

export type TipoReport = "mensile" | "annuale" | "ad_hoc" | "kpi_snapshot";

/** Report aggregato. Persistito in `delphi_reports`. */
export interface Report {
  id: string;
  tipo: TipoReport;
  titolo: string;
  scope: string;             // es. "ACG", "Guazzotti", "tutto"
  periodo: { from: string; to: string };
  kpi: KPI[];
  /** Sezioni narrative opzionali. */
  sezioni?: Array<{ titolo: string; testo: string }>;
  pdfUrl?: string;
  htmlInline?: string;
  generatoIl: string;
}

export type SeveritaAnomalia = "info" | "warning" | "critical";

/** Anomalia rilevata. Notificata via Lavagna a PHARO. */
export interface Anomalia {
  id: string;
  metrica: string;
  valoreAtteso?: number;
  valoreOsservato: number;
  scostamentoPct?: number;
  severita: SeveritaAnomalia;
  /** Descrizione human-readable. */
  descrizione: string;
  /** Possibili cause (suggerimenti, non certezze). */
  ipotesi?: string[];
  rilevataIl: string;
  /** Periodo di osservazione. */
  periodo?: { from: string; to: string };
}

/** Serie storica con regressione lineare. Output di `trend()`. */
export interface Trend {
  metrica: string;
  punti: Array<{ at: string; valore: number }>;
  /** Regressione lineare: y = slope * x + intercept. */
  regressione?: { slope: number; intercept: number; r2: number };
  direzione: TrendDirezione;
  /** Variazione totale nel periodo (%). */
  variazioneTotalePct?: number;
}

/** Confronto fra due periodi. Output di `confrontoAnnoSuAnno`. */
export interface Confronto {
  metrica: string;
  periodoCorrente: { from: string; to: string; valore: number };
  periodoPrecedente: { from: string; to: string; valore: number };
  delta: number;
  deltaPct: number;
  /** Considera la stagionalità? */
  stagionalitaApplicata: boolean;
  note?: string;
}

/** Ranking generico (top condomini, top clienti, top tecnici). */
export interface Ranking<T = unknown> {
  criterio: string;
  periodo: { from: string; to: string };
  righe: Array<{
    posizione: number;
    id: string;
    nome?: string;
    valore: number;
    /** Dati extra dipendenti dal criterio. */
    meta?: T;
  }>;
}

/** Risposta a una domanda in linguaggio naturale (`chiedi`). */
export interface RispostaConversazionale {
  domanda: string;
  rispostaTesto: string;
  /** Eventuali dati strutturati a supporto. */
  dati?: Record<string, unknown>;
  fonti?: string[];
  modello: string;
  durataMs?: number;
}
