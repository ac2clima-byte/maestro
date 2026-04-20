/**
 * EMPORION — tipi del dominio Magazzino.
 *
 * Riferimento: context/nexo-architettura.md sez. 7 (EMPORION) e schema
 * magazzino / magazzino_giacenze / magazzino_movimenti / magazzino_listini
 * in acg_suite/CLAUDE.md.
 */

/** Posizioni magazzino supportate in v0.1. */
export type Posizione =
  | "centrale"
  | "furgone_malvicino"
  | "furgone_dellafiore"
  | "furgone_victor"
  | "furgone_marco"
  | "furgone_david"
  | "cantiere";

export const POSIZIONI: readonly Posizione[] = [
  "centrale",
  "furgone_malvicino",
  "furgone_dellafiore",
  "furgone_victor",
  "furgone_marco",
  "furgone_david",
  "cantiere",
] as const;

export type CategoriaArticolo =
  | "ricambio"
  | "consumabile"
  | "componente"
  | "utensile"
  | "altro";

/** Anagrafica articolo. Persistito in `emporion_articoli`. */
export interface Articolo {
  id: string;
  codice: string;             // codice principale (es. cod. fornitore primario)
  codiciAlias?: string[];     // altri codici (cod. interni, EAN, ecc.)
  descrizione: string;
  categoria?: CategoriaArticolo;
  marca?: string;
  modello?: string;
  unita?: string;             // pz, m, kg, ...
  /** Fornitori che lo trattano (in ordine di preferenza). */
  fornitori?: Array<{ fornitoreId: string; fornitoreNome?: string; codiceFornitore?: string }>;
  /** Prezzo medio acquisto (per analisi). */
  prezzoAcquistoMedio?: number;
  prezzoVendita?: number;
  /** Soglia globale (somma su tutte le posizioni). */
  scortaMinima?: number;
  /** Compatibilità: marche/modelli impianto su cui è installabile. */
  compatibilita?: Array<{ marca: string; modello?: string; note?: string }>;
  attivo: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Giacenza per (articolo, posizione). Persistita in `emporion_giacenze`. */
export interface Giacenza {
  id: string;                 // composito articoloId__posizione
  articoloId: string;
  posizione: Posizione;
  quantita: number;
  /** Aggiornata a ogni movimento. */
  ultimaModifica: string;
  /** Snapshot di inventario (data ultimo conteggio fisico). */
  ultimoInventario?: string;
}

export type TipoMovimento =
  | "carico"
  | "scarico"
  | "trasferimento"
  | "rettifica_inventario";

export type CausaleMovimento =
  | "ddt"
  | "intervento"
  | "vendita"
  | "scarto"
  | "trasferimento_furgone"
  | "rifornimento_furgone"
  | "manuale";

/** Movimento atomico. Append-only in `emporion_movimenti`. */
export interface Movimento {
  id: string;
  tipo: TipoMovimento;
  causale: CausaleMovimento;
  articoloId: string;
  quantita: number;
  /** Per trasferimento: posizione sorgente. */
  da?: Posizione;
  /** Posizione destinazione (carico) o sorgente (scarico). */
  a?: Posizione;
  tecnicoUid?: string;
  /** Documenti collegati (DDT, intervento, ordine). */
  riferimenti?: {
    ddtId?: string;
    interventoId?: string;
    ordineId?: string;
    fatturaId?: string;
  };
  prezzoUnitario?: number;
  note?: string;
  createdAt: string;
  /** Riferimento al messaggio Lavagna che ha generato il movimento. */
  sourceLavagnaId?: string;
}

export type StatoOrdine = "bozza" | "inviato" | "in_consegna" | "ricevuto_parziale" | "ricevuto" | "annullato";

/** Ordine fornitore. Persistito in `emporion_ordini`. */
export interface OrdineFornitore {
  id: string;
  fornitoreId: string;
  fornitoreNome?: string;
  numero?: string;            // numero assegnato dal fornitore (post invio)
  dataCreazione: string;
  dataInvio?: string;
  dataConsegnaAttesa?: string;
  dataConsegnaEffettiva?: string;
  righe: Array<{
    articoloId: string;
    codiceFornitore?: string;
    descrizione: string;
    quantitaOrdinata: number;
    quantitaRicevuta?: number;
    prezzoUnitario?: number;
  }>;
  totaleStimato?: number;
  stato: StatoOrdine;
  destinazione?: Posizione;   // dove caricare alla ricezione
  note?: string;
  /** Riferimento all'eventuale DDT di consegna. */
  ddtId?: string;
}

/** Vista materializzata dell'inventario di un furgone. */
export interface InventarioFurgone {
  posizione: Posizione;
  tecnicoUid?: string;
  generatoIl: string;
  righe: Array<{
    articoloId: string;
    codice?: string;
    descrizione: string;
    quantita: number;
    sottoScorta?: boolean;
  }>;
  totaleArticoli: number;
  valoreStimato?: number;
}

/** Risultato di disponibilità multi-posizione. */
export interface DisponibilitaResult {
  articoloId: string;
  totale: number;
  perPosizione: Array<{ posizione: Posizione; quantita: number }>;
  scortaMinima?: number;
  sottoScorta: boolean;
}
