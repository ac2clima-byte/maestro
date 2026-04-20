/**
 * NEXUS — tipi condivisi.
 *
 * NEXUS è l'interfaccia conversazionale di NEXO: l'utente scrive in
 * linguaggio naturale, NEXUS capisce cosa vuole, identifica il Collega
 * competente, deposita il lavoro sulla Lavagna, e mostra la risposta
 * quando arriva.
 *
 * Non è un Collega: è il "router naturale" verso di loro.
 */

import type { CollegaNome } from "../lavagna/types.js";

export type NexusRole = "user" | "assistant" | "system";

/** Singolo messaggio della chat. `nexus_chat/{messageId}`. */
export interface NexusMessage {
  id: string;
  sessionId: string;
  role: NexusRole;
  content: string;
  /** Quale Collega ha gestito (solo per messaggi assistant). */
  collegaCoinvolto?: CollegaNome | "multi" | null;
  /** Messaggio Lavagna creato per questa interazione. */
  lavagnaMessageId?: string | null;
  /** Tipo di azione dedotta (stringa libera per flessibilità). */
  azione?: string | null;
  /** Parametri estratti dalla richiesta. */
  parametri?: Record<string, unknown>;
  /** Risposta effettiva del Collega (quando completed). */
  risposta?: Record<string, unknown> | null;
  /** Stato della pipeline NEXUS → Collega. */
  stato?: NexusMsgStato;
  /** Token consumati (solo per risposte LLM). */
  usage?: { inputTokens: number; outputTokens: number; modello?: string };
  timestamp: string;
}

export type NexusMsgStato =
  /** NEXUS ha interpretato la richiesta e sta aspettando il Collega. */
  | "in_attesa_collega"
  /** Il Collega ha risposto. */
  | "completata"
  /** Il Collega non esiste / non è attivo. */
  | "collega_inattivo"
  /** Il Collega non ha risposto entro timeout. */
  | "timeout"
  /** Errore LLM / Firestore / rete. */
  | "errore"
  /** Nessun Collega serve (risposta diretta di NEXUS). */
  | "diretta";

/** Sessione di chat. `nexus_sessions/{sessionId}`. */
export interface NexusSession {
  id: string;
  userId: string;
  stato: "attiva" | "chiusa";
  /** Numero totale di messaggi. */
  messaggiCount: number;
  inizioAt: string;
  ultimoMessaggioAt: string;
  /** Primo messaggio (per lista sessioni). */
  primoMessaggioPreview?: string;
  /** Titolo auto-generato dopo il primo scambio. */
  titolo?: string;
}

/** Risultato dell'interpretazione LLM. Persistito nel messaggio assistant. */
export interface NexusIntent {
  collega: CollegaNome | "multi" | "nessuno";
  azione: string;
  parametri: Record<string, unknown>;
  /** 0-1: quanto siamo sicuri dell'interpretazione. */
  confidenza: number;
  /** Messaggio per l'utente in italiano (prima risposta in chat). */
  rispostaUtente: string;
  /** Ragionamento breve (debug, non mostrato per default). */
  reasoning?: string;
  /** Se `multi`: lista step nell'ordine di esecuzione. */
  steps?: Array<{
    collega: CollegaNome;
    azione: string;
    parametri: Record<string, unknown>;
  }>;
}

/** Payload che la PWA manda al proxy. */
export interface NexusRouteRequest {
  sessionId: string;
  userMessage: string;
  /** Ultimi N messaggi della sessione per contesto (max 10). */
  history?: Array<Pick<NexusMessage, "role" | "content">>;
  /** Id utente (per ora: "alberto", unico). */
  userId?: string;
}

/** Risposta del proxy alla PWA. */
export interface NexusRouteResponse {
  intent: NexusIntent;
  /** Id del messaggio assistant appena scritto in `nexus_chat`. */
  nexusMessageId: string;
  /** Id del messaggio Lavagna creato (se serviva un Collega). */
  lavagnaMessageId?: string;
  stato: NexusMsgStato;
  /** Se collega_inattivo, qui il motivo human-readable. */
  fallbackMessage?: string;
  /** Se `completata` in-line (es. IRIS ha risposto sincrono). */
  rispostaDiretta?: Record<string, unknown>;
  modello?: string;
  usage?: { inputTokens: number; outputTokens: number };
}

/** Collection names. */
export const NEXUS_COLLECTIONS = {
  chat: "nexus_chat",
  sessions: "nexus_sessions",
} as const;

/** Colleghi noti per il routing (lista chiusa per evitare allucinazioni). */
export const COLLEGHI_ROUTABLE = [
  "iris", "echo", "ares", "chronos", "memo",
  "charta", "emporion", "dikea", "delphi",
  "pharo", "calliope",
] as const;

/** Colleghi già attivi in produzione (possono rispondere in-line). */
export const COLLEGHI_ATTIVI: ReadonlyArray<string> = ["iris"];
