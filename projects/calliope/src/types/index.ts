/**
 * CALLIOPE — tipi del dominio Content.
 *
 * Riferimento: context/nexo-architettura.md sez. 11 (CALLIOPE).
 */

export type TipoBozza =
  | "risposta_email"
  | "comunicazione_condominio"
  | "preventivo"
  | "sollecito"
  | "risposta_pec"
  | "offerta_commerciale"
  | "newsletter_tecnici"
  | "comunicazione_massiva"
  | "verbale_riunione";

export type ToneBozza = "cordiale" | "neutro" | "fermo" | "ultimativo" | "tecnico";

export type StatoBozza =
  | "in_generazione"
  | "pronta"
  | "in_revisione"
  | "approvata"
  | "rifiutata"
  | "inviata";

/** Versione singola di una bozza (storico). */
export interface VersioneBozza {
  versione: number;
  corpo: string;
  oggetto?: string;
  firma?: string;
  generataIl: string;
  generataDa: "ai" | "umano";
  feedback?: string;    // cosa è stato chiesto al passaggio precedente
  modello?: string;
  usage?: { inputTokens: number; outputTokens: number };
  campiMancanti?: string[];
}

/** Bozza. Persistita in `calliope_bozze`. */
export interface Bozza {
  id: string;
  tipo: TipoBozza;
  tono: ToneBozza;
  stato: StatoBozza;
  /** Versione corrente = ultima in `versioni`. */
  versione: number;
  versioniPrecedenti?: VersioneBozza[];
  /** Versione attiva (copia della più recente). */
  corrente: VersioneBozza;
  /** Contesto che ha prodotto la bozza. */
  contesto: {
    richiedente: string;               // quale Collega ha chiesto
    sourceEmailId?: string;
    sourceLavagnaId?: string;
    clienteId?: string;
    fatturaId?: string;
    pecId?: string;
    interventoId?: string;
    condominioId?: string;
    note?: string;
  };
  /** Destinatario previsto (per ECHO dopo approvazione). */
  destinatario?: {
    canale: "email" | "whatsapp" | "telegram" | "pec";
    to: string;
    nome?: string;
  };
  /** Approvazione umana. */
  approvazione?: {
    approvataDa?: string;
    approvataIl?: string;
    motivazione?: string;
  };
  /** Se rifiutata. */
  rifiuto?: { rifiutataDa?: string; rifiutataIl?: string; motivo?: string };
  /** Dopo l'invio (se passata a ECHO). */
  invio?: { echoMessageId?: string; inviataIl?: string };
  createdAt: string;
  updatedAt: string;
}

/** Template riutilizzabile. `calliope_template`. */
export interface Template {
  id: string;
  nome: string;
  tipo: TipoBozza;
  descrizione?: string;
  /** Corpo con placeholder `{{NOME_VARIABILE}}`. */
  corpo: string;
  oggetto?: string;
  firma?: string;
  /** Variabili richieste per il rendering. */
  variabiliRichieste: Array<{ nome: string; descrizione?: string; default?: string }>;
  toneConsigliato?: ToneBozza;
  ultimoUso?: string;
  contatoreUsi?: number;
  attivo: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Profilo stilistico di un destinatario (o dell'autore Alberto).
 * `calliope_stili`.
 */
export interface StileDestinatario {
  id: string;
  /** Chi è il soggetto dello stile (Alberto stesso, o un cliente specifico). */
  soggettoId: string;
  /** Tipo di soggetto. */
  soggettoTipo: "autore" | "cliente" | "amministratore" | "fornitore";
  formalita: "alta" | "media" | "bassa";
  lunghezzaMediaRighe?: number;
  chiusureFrequenti?: string[];
  aperitureFrequenti?: string[];
  /** Parole/espressioni caratteristiche (positive). */
  marcatoriStilistici?: string[];
  /** Parole da evitare quando si scrive a questa persona. */
  daEvitare?: string[];
  aggiornatoIl: string;
  esempiUsati?: number;
}
