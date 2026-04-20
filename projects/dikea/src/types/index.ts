/**
 * DIKEA — tipi del dominio Compliance.
 *
 * Riferimento: context/nexo-architettura.md sez. 8 (DIKEA) e schema
 * cosmina_impianti_cit / gdpr_consents / audit_log in acg_suite/CLAUDE.md.
 */

export type TipoScadenzaNormativa =
  | "ree"                    // Rapporto Efficienza Energetica
  | "bollino_curit"
  | "f_gas_controllo_periodico"
  | "f_gas_certificazione_tecnico"
  | "manutenzione_obbligatoria"
  | "pec_termine_risposta"
  | "altro";

export type StatoScadenza = "futura" | "imminente" | "scaduta" | "completata" | "non_applicabile";

/** Scadenza normativa tracciata. Persistita in `dikea_scadenze`. */
export interface ScadenzaNormativa {
  id: string;
  tipo: TipoScadenzaNormativa;
  /** Riferimento all'oggetto (impianto, PEC, certificazione tecnico). */
  ref: { tipo: "impianto" | "pec" | "tecnico" | "azienda"; id: string };
  scadeIl: string;            // ISO 8601
  giorniAnticipoAlert?: number; // soglia per "imminente"
  stato: StatoScadenza;
  /** Riferimento normativo (es. "DPR 74/2013 art. 7"). */
  normaRiferimento?: string;
  responsabile?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export type StatoDiCo =
  | "bozza"
  | "in_validazione"
  | "validata"
  | "firmata"
  | "inviata"
  | "respinta_validazione";

/**
 * Dichiarazione di Conformità (DM 37/2008).
 * Persistita in `dikea_dico`.
 */
export interface DiCo {
  id: string;
  /** Riferimento intervento ARES che ha generato la richiesta. */
  interventoId: string;
  /** Riferimento all'impianto. */
  impiantoTarga?: string;
  installatore: {
    ragioneSociale: string;
    piva: string;
    iscrizioneCciaa?: string;
    responsabileTecnico?: string;
  };
  committente: {
    nome: string;
    indirizzo: string;
    codiceFiscale?: string;
    piva?: string;
  };
  tipoLavoro: "nuovo_impianto" | "trasformazione" | "ampliamento" | "manutenzione_straordinaria";
  /** Mappa dei campi compilati (struttura libera per adattarsi a tipologie). */
  campiCompilati: Record<string, unknown>;
  /** Materiali principali installati. */
  materialiInstallati?: Array<{
    descrizione: string;
    marca?: string;
    modello?: string;
    matricola?: string;
    certificazione?: string;
  }>;
  /** Errori bloccanti rilevati da `validaDiCo`. */
  erroriValidazione?: Array<{
    campo: string;
    severita: "errore" | "warning";
    messaggio: string;
  }>;
  stato: StatoDiCo;
  pdfUrl?: string;
  numeroProtocollo?: string;
  dataEmissione?: string;
  createdAt: string;
  updatedAt: string;
}

export type TipoPEC =
  | "diffida"
  | "richiesta_documenti"
  | "comunicazione_ente"
  | "comunicazione_legale"
  | "altro";

export type StatoPEC =
  | "ricevuta"
  | "in_analisi"
  | "in_risposta"
  | "risposta_inviata"
  | "archiviata";

export type PriorityPEC = "low" | "normal" | "high" | "critical";

/** PEC ufficiale gestita. Persistita in `dikea_pec`. */
export interface PEC {
  id: string;
  /** Riferimento email IRIS che l'ha portata. */
  sourceEmailId: string;
  tipo: TipoPEC;
  mittente: string;
  oggetto: string;
  ricevutaIl: string;
  /** Termine entro cui rispondere (calcolato in base al tipo). */
  scadenzaRisposta?: string;
  priorita: PriorityPEC;
  stato: StatoPEC;
  /** Bozza risposta richiesta a CALLIOPE (id). */
  richiestaBozzaId?: string;
  rispostaInviataIl?: string;
  rispostaProtocollo?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

/** Certificazione F-Gas di un tecnico o di un impianto. */
export interface CertificazioneFGas {
  id: string;
  ref: { tipo: "tecnico" | "impianto"; id: string };
  numero?: string;
  rilasciataIl?: string;
  validaFino: string;
  /** Carica gas equivalente CO₂ (per impianti, determina la frequenza
   * dei controlli). */
  caricaCO2eq?: number;
  /** Frequenza controlli derivata dalla carica (mesi). */
  frequenzaControlliMesi?: number;
  ultimaVerifica?: string;
  prossimaVerifica?: string;
}

/** Libretto di impianto (DPR 74/2013). */
export interface LibrettoImpianto {
  id: string;
  impiantoTarga: string;
  intestatario: string;
  responsabile?: string;
  schedeCompilate: string[];   // riferimenti alle "schede" del libretto
  ultimaCompilazione?: string;
  prossimaScadenzaCompilazione?: string;
  pdfUrl?: string;
}
