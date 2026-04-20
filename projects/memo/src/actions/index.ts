/**
 * MEMO — azioni esposte.
 *
 * Tutti gli stub lanciano "Not implemented". Le firme sono il contratto.
 */
import type {
  DocumentoDisco,
  DossierCliente,
  MatchAnagraficaResult,
  Relazione,
  RisultatoRicercaDocumenti,
  StoricoImpianto,
  TimelineEntry,
  TipoCliente,
} from "../types/index.js";

// ─── Dossier ────────────────────────────────────────────────────

export async function dossierCliente(
  _clienteId: string,
  _opts: { force?: boolean; sezioni?: Array<keyof DossierCliente> } = {},
): Promise<DossierCliente> {
  throw new Error("Not implemented: dossierCliente");
}

export async function dossierCondominio(
  _condominioId: string,
  _opts: { force?: boolean } = {},
): Promise<DossierCliente> {
  throw new Error("Not implemented: dossierCondominio");
}

export async function storicoImpianto(
  _targa: string,
  _opts: { limit?: number } = {},
): Promise<StoricoImpianto> {
  throw new Error("Not implemented: storicoImpianto");
}

// ─── Documenti ──────────────────────────────────────────────────

export interface RicercaDocumentiQuery {
  /** Pattern testo libero (subset del filename o del path). */
  testo?: string;
  /** Cliente specifico (cerca prima sotto la sua sotto-cartella in /mnt/n). */
  clienteAssociato?: string;
  /** Estensioni accettate (es. ["pdf","docx","xlsx"]). */
  estensioni?: string[];
  /** Dischi su cui cercare. */
  dischi?: Array<DocumentoDisco["disco"]>;
  /** Categorie filtro (contratto, foto, RTI, ...). */
  categorie?: string[];
  limit?: number;
}

export async function cercaDocumenti(
  _query: RicercaDocumentiQuery,
): Promise<RisultatoRicercaDocumenti> {
  throw new Error("Not implemented: cercaDocumenti");
}

// ─── Timeline / contatti ───────────────────────────────────────

export async function ultimiContatti(
  _clienteId: string,
  _n: number = 20,
): Promise<TimelineEntry[]> {
  throw new Error("Not implemented: ultimiContatti");
}

// ─── Match anagrafico / nuovo cliente ──────────────────────────

export interface MatchAnagraficaInput {
  nome?: string;
  email?: string;
  piva?: string;
  cf?: string;
  telefono?: string;
  indirizzo?: string;
}

export async function matchAnagrafica(
  _input: MatchAnagraficaInput,
  _opts: { soglia?: number; maxCandidati?: number } = {},
): Promise<MatchAnagraficaResult> {
  throw new Error("Not implemented: matchAnagrafica");
}

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

export async function nuovoCliente(
  _input: NuovoClienteInput,
  _opts: { skipMatchCheck?: boolean } = {},
): Promise<{ clienteId: string; created: boolean }> {
  throw new Error("Not implemented: nuovoCliente");
}

export async function collegaEntita(
  _da: Relazione["da"],
  _a: Relazione["a"],
  _tipo: Relazione["tipo"],
  _opts: { confidence?: number } = {},
): Promise<Relazione> {
  throw new Error("Not implemented: collegaEntita");
}

// ─── Consumi / churn ────────────────────────────────────────────

export interface ConsumiMediResult {
  condominioId: string;
  anniConsiderati: number[];
  consumi: Array<{ anno: number; gas_smc?: number; calore_kwh?: number; acs_litri?: number }>;
  mediaAnnua?: { gas_smc?: number; calore_kwh?: number; acs_litri?: number };
}

export async function consumiMedi(
  _condominioId: string,
  _opts: { anni?: number } = {},
): Promise<ConsumiMediResult> {
  throw new Error("Not implemented: consumiMedi");
}

export interface RischioChurnResult {
  clienteId: string;
  score: number;       // 0-100
  livello: "basso" | "medio" | "alto";
  segnali: Array<{ tipo: string; peso: number; descrizione: string }>;
}

export async function rischioChurn(_clienteId: string): Promise<RischioChurnResult> {
  throw new Error("Not implemented: rischioChurn");
}

// ─── Ricerca contestuale (semantica leggera) ───────────────────

export async function cercaPerContesto(
  _testo: string,
  _opts: { limit?: number } = {},
): Promise<Array<{ tipo: "cliente" | "impianto" | "documento"; id: string; score: number; titolo: string }>> {
  throw new Error("Not implemented: cercaPerContesto");
}
