/**
 * CHARTA — tipi del dominio Amministrativo.
 *
 * Riferimento: context/nexo-architettura.md sez. 6 (CHARTA) e schema
 * pagamenti_clienti / commesse di Guazzotti TEC.
 */

export type TipoFattura =
  | "emessa"           // fatturata da noi a un cliente
  | "ricevuta"         // ricevuta da un fornitore
  | "nota_credito_emessa"
  | "nota_credito_ricevuta"
  | "proforma";

export type StatoFattura =
  | "bozza"
  | "emessa"
  | "scaduta"
  | "incassata"
  | "parzialmente_incassata"
  | "annullata"
  | "in_contenzioso";

/** Riga di una fattura. */
export interface RigaFattura {
  descrizione: string;
  quantita?: number;
  unita?: string;
  prezzoUnitario?: number;
  imponibile: number;
  aliquotaIva?: number;
  /** Eventuale riferimento all'articolo magazzino (EMPORION). */
  articoloId?: string;
}

/** Fattura. Persistita in `charta_fatture`. */
export interface Fattura {
  id: string;
  tipo: TipoFattura;
  /** Numero progressivo come riportato sul documento. */
  numero: string;
  serie?: string;
  /** Riferimento cliente (per emesse) o fornitore (per ricevute). */
  controparteId: string;
  controparteNome?: string;
  dataEmissione: string;     // ISO 8601
  dataScadenza?: string;     // ISO 8601
  imponibile: number;
  iva: number;
  totale: number;
  righe?: RigaFattura[];
  stato: StatoFattura;
  /** Importo ancora da incassare/pagare. */
  saldoResiduo?: number;
  /** Riferimento documento sorgente (PDF/XML). */
  sourceFileUrl?: string;
  /** Riferimento email IRIS che ha portato la fattura. */
  sourceEmailId?: string;
  /** Riferimento sistema esterno (Fatture in Cloud). */
  externalRef?: string;
  createdAt: string;
  updatedAt: string;
}

export type MetodoPagamento = "bonifico" | "ribba" | "rid" | "contanti" | "carta" | "altro";

/** Incasso o pagamento. Persistito in `charta_pagamenti`. */
export interface Incasso {
  id: string;
  /** "in" = incasso da cliente, "out" = pagamento a fornitore. */
  direzione: "in" | "out";
  controparteId: string;
  controparteNome?: string;
  importo: number;
  data: string;            // ISO 8601
  metodo: MetodoPagamento;
  /** Riferimenti fattura/e a cui imputare. Più di una se split. */
  fatturaIds?: string[];
  causale?: string;
  /** Origine del dato. */
  fonte: "manuale" | "email" | "excel" | "fatture_in_cloud" | "estratto_conto";
  sourceEmailId?: string;
  sourceFileUrl?: string;
  /** Riconciliato automaticamente? */
  riconciliato?: boolean;
  createdAt: string;
}

/** Esposizione complessiva di un cliente. Vista derivata. */
export interface EsposizioneCliente {
  clienteId: string;
  clienteNome?: string;
  totaleDovuto: number;
  fattureScadute: number;
  fattureScaduteCount: number;
  ultimaFatturaEmessa?: string;
  ultimoIncasso?: string;
  /** Giorni medi di pagamento sulle ultime 10 fatture incassate. */
  mediaGiorniPagamento?: number;
  /** Score 0-100 di affidabilità (più alto = più puntuale). */
  scoreAffidabilita?: number;
  generatoIl: string;
}

export type StatoDDT = "ricevuto" | "fatturato" | "in_attesa_fattura" | "discrepanza";

/** Documento di Trasporto. Persistito in `charta_ddt`. */
export interface DDT {
  id: string;
  numero: string;
  data: string;
  /** Fornitore (es. Cambielli) per ddt ricevuti, cliente per ddt emessi. */
  controparteId: string;
  controparteNome?: string;
  direzione: "in" | "out";
  righe: Array<{
    codice?: string;
    descrizione: string;
    quantita: number;
    unita?: string;
    prezzoUnitario?: number;
  }>;
  totaleStimato?: number;
  stato: StatoDDT;
  /** Fattura collegata (se identificata). */
  fatturaId?: string;
  sourceEmailId?: string;
  sourceFileUrl?: string;
  createdAt: string;
}

/** Report mensile aggregato. Persistito in `charta_reports`. */
export interface ReportMensile {
  yyyymm: string;          // es. "2026-04"
  emesso: { count: number; totale: number };
  incassato: { count: number; totale: number };
  daIncassare: { count: number; totale: number };
  ricevute: { count: number; totale: number };
  pagate: { count: number; totale: number };
  daPagare: { count: number; totale: number };
  topClienti?: Array<{ clienteId: string; nome?: string; totale: number }>;
  topFornitori?: Array<{ fornitoreId: string; nome?: string; totale: number }>;
  generatoIl: string;
}
