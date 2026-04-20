/**
 * ARES — azioni esposte agli altri Colleghi e all'Orchestratore.
 *
 * Tutti gli stub lanciano "Not implemented" finché non sono implementati.
 * Le firme sono stabili (sono il contratto del Collega).
 */
import type {
  Intervento,
  InterventiAperFilters,
  PropostaAssegnazione,
  TipoIntervento,
  UrgenzaIntervento,
} from "../types/index.js";

export interface ApriInterventoInput {
  tipo: TipoIntervento;
  urgenza: UrgenzaIntervento;
  impiantoTarga?: string;
  indirizzo?: string;
  condominio?: string;
  note?: string;
  /** Se viene da IRIS: id email + id messaggio Lavagna. */
  sourceEmailId?: string;
  sourceLavagnaId?: string;
}

export async function apriIntervento(_input: ApriInterventoInput): Promise<Intervento> {
  throw new Error("Not implemented: apriIntervento");
}

export async function assegnaTecnico(
  _interventoId: string,
  _tecnicoUid: string,
  _opts: { dataPianificata?: string; auto?: boolean } = {},
): Promise<Intervento> {
  throw new Error("Not implemented: assegnaTecnico");
}

export async function proponiAssegnazioni(
  _interventoId: string,
  _opts: { topN?: number } = {},
): Promise<PropostaAssegnazione> {
  throw new Error("Not implemented: proponiAssegnazioni");
}

export interface ChiusuraInterventoInput {
  esito: NonNullable<Intervento["esito"]>;
  oreLavorate: number;
  materiali?: Intervento["materiali"];
  note?: string;
  /** Se true, ARES chiede a DIKEA di generare la DiCo via Lavagna. */
  richiediDico?: boolean;
}

export async function chiudiIntervento(
  _interventoId: string,
  _input: ChiusuraInterventoInput,
): Promise<Intervento> {
  throw new Error("Not implemented: chiudiIntervento");
}

export async function generaRTI(_interventoId: string): Promise<{ pdfUrl: string }> {
  throw new Error("Not implemented: generaRTI");
}

export interface NotificaTecnicoInput {
  titolo: string;
  body: string;
  priority?: "low" | "normal" | "high" | "critical";
  url?: string;
}

export async function notificaTecnico(
  _tecnicoUid: string,
  _input: NotificaTecnicoInput,
): Promise<{ delivered: boolean; via: string }> {
  throw new Error("Not implemented: notificaTecnico");
}

export interface BriefingTecnico {
  tecnicoUid: string;
  data: string; // ISO 8601 yyyy-mm-dd
  interventi: Array<{
    interventoId: string;
    orarioStimato?: string;
    indirizzo: string;
    note?: string;
  }>;
  generatoIl: string;
}

export async function briefingTecnico(
  _tecnicoUid: string,
  _data: string,
): Promise<BriefingTecnico> {
  throw new Error("Not implemented: briefingTecnico");
}

export async function interventiAperti(
  _filters: InterventiAperFilters = {},
): Promise<Intervento[]> {
  throw new Error("Not implemented: interventiAperti");
}

export async function cercaStoricoInterventi(
  _impiantoTarga: string,
  _opts: { limit?: number } = {},
): Promise<Intervento[]> {
  throw new Error("Not implemented: cercaStoricoInterventi");
}
