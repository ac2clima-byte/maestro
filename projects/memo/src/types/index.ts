/**
 * MEMO — tipi del dominio Memoria / Dossier cliente.
 *
 * Riferimento: context/nexo-architettura.md sez. 5 (MEMO) e schema
 * crm_clienti / cosmina_impianti in acg_suite/CLAUDE.md.
 */

export type TipoCliente = "privato" | "condominio" | "ente" | "fornitore" | "interno";

export type SentimentMedio = "positivo" | "neutro" | "frustrato" | "negativo";

/** Vista compatta di un impianto (dal CRM). */
export interface ImpiantoSnapshot {
  targa: string;
  indirizzo?: string;
  comune?: string;
  tipo?: string;
  marca?: string;
  modello?: string;
  ultimaManutenzione?: string;
  prossimaScadenza?: string;
  responsabile?: string;
}

/** Voce timeline (un'email, un intervento, una fattura, un pagamento). */
export interface TimelineEntry {
  at: string;            // ISO 8601
  tipo: "email_in" | "email_out" | "intervento" | "fattura" | "pagamento" | "doc" | "note";
  titolo: string;
  ref?: { collezione: string; id: string };
  meta?: Record<string, unknown>;
}

/** Documento individuato sui dischi di rete. */
export interface DocumentoDisco {
  /** Disco di provenienza. */
  disco: "N" | "I" | "L" | "M";
  /** Path completo (es. /mnt/n/KRISTAL/contratti/2024.pdf). */
  path: string;
  /** Nome file. */
  filename: string;
  /** Estensione lowercased senza punto. */
  ext: string;
  /** Dimensione in byte (se nota). */
  size?: number;
  /** Modificato il, ISO 8601. */
  mtime?: string;
  /** Cliente associato dedotto dal path (es. "KRISTAL"). */
  clienteAssociato?: string;
  /** Categoria dedotta (contratto/foto/RTI/preventivo). */
  categoria?: string;
}

/** Relazione tra entità (impianto-condominio, cliente-fornitore, ecc.). */
export interface Relazione {
  da: { tipo: string; id: string };
  a: { tipo: string; id: string };
  /** Tipo di relazione. */
  tipo: "appartiene_a" | "fornito_da" | "amministrato_da" | "duplicato_di" | "altro";
  /** Confidenza 0-1 (per match anagrafico approssimato). */
  confidence?: number;
  rilevataIl: string;
}

/** Storico impianto: tutti gli eventi tecnici cronologici. */
export interface StoricoImpianto {
  targa: string;
  impianto: ImpiantoSnapshot;
  eventi: Array<{
    at: string;
    tipo: "manutenzione" | "riparazione" | "installazione" | "sostituzione" | "anomalia";
    descrizione: string;
    tecnico?: string;
    materiali?: Array<{ codice?: string; descrizione: string; quantita: number }>;
    costo?: number;
    rti?: { id: string; pdfUrl?: string };
  }>;
}

/** Dossier completo del cliente. Il "chi è costui". */
export interface DossierCliente {
  clienteId: string;
  tipo: TipoCliente;
  nome: string;
  /** Contatti aggregati. */
  contatti: {
    email?: string[];
    telefono?: string[];
    pec?: string;
    indirizzi?: string[];
  };
  /** Anagrafica fiscale. */
  fiscale?: { piva?: string; cf?: string };
  /** Amministratore (per condomini). */
  amministratore?: { nome?: string; email?: string; telefono?: string };
  /** Impianti del cliente. */
  impianti: ImpiantoSnapshot[];
  /** Esposizione finanziaria (da CHARTA quando attivo). */
  esposizione?: {
    totaleScaduto?: number;
    fattureScadute?: number;
    ultimoPagamento?: string;
    mediaGiorniPagamento?: number;
  };
  /** Sentiment medio sulle email del mittente (da IRIS sender profiles). */
  sentimentMedio?: SentimentMedio;
  /** Score di rischio churn 0-100 (silenzio + frequenza + esposizione). */
  rischioChurn?: number;
  /** Timeline ultimi N contatti. */
  timeline: TimelineEntry[];
  /** Documenti rilevanti su disco. */
  documenti?: DocumentoDisco[];
  /** Generato il (cache TTL). */
  generatoIl: string;
  /** Sorgenti consultate (per debug). */
  fonti?: string[];
}

/** Risultato di una ricerca documenti su disco. */
export interface RisultatoRicercaDocumenti {
  query: string;
  totale: number;
  risultati: DocumentoDisco[];
  durataMs: number;
}

/** Risultato di matchAnagrafica: candidati con score di similarità. */
export interface MatchAnagraficaResult {
  query: string;
  candidati: Array<{
    clienteId: string;
    nome: string;
    score: number;        // 0-1 (Levenshtein normalizzata)
    match: "exact" | "fuzzy" | "phonetic";
    fonte: "cosmina" | "guazzotti" | "condominium";
  }>;
}

// ─── v0.2 input/output types (usati come stub oggi) ────────────

export interface NuovoClienteInput {
  nome: string;
  tipo: TipoCliente;
  indirizzo?: string;
  comune?: string;
  email?: string;
  telefono?: string;
  piva?: string;
  cf?: string;
  amministratoreId?: string;
  note?: string;
}

export interface RicercaDocumentiQuery {
  testo?: string;
  clienteAssociato?: string;
  estensioni?: string[];
  dischi?: Array<DocumentoDisco["disco"]>;
  categorie?: string[];
  limit?: number;
}

export interface ConsumiMediResult {
  condominioId: string;
  anniConsiderati: number[];
  consumi: Array<{ anno: number; gas_smc?: number; calore_kwh?: number; acs_litri?: number }>;
  mediaAnnua?: { gas_smc?: number; calore_kwh?: number; acs_litri?: number };
}

export interface RischioChurnResult {
  clienteId: string;
  score: number;       // 0-100
  livello: "basso" | "medio" | "alto";
  segnali: Array<{ tipo: string; peso: number; descrizione: string }>;
}
