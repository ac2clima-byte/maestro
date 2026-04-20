/**
 * Lavagna — tipi condivisi per il bus inter-Collega di NEXO.
 *
 * Shape documento Firestore (`nexo_lavagna/{messageId}`):
 *   { id, from, to, type, payload, status, priority,
 *     sourceEmailId?, parentMessageId?, workflowInstanceId?,
 *     workflowStepOrdine?, ttlMinutes?,
 *     pickedUpAt?, completedAt?, failedAt?, failureReason?, result?,
 *     createdAt, updatedAt }
 */

// ─── Status / priority ──────────────────────────────────────────

export type LavagnaStatus = "pending" | "picked_up" | "completed" | "failed";

export type LavagnaPriority = "low" | "normal" | "high" | "critical";

// ─── Nomi Colleghi + Orchestratore ──────────────────────────────

/** Tutti i 10 Colleghi NEXO + Orchestratore (+ alberto per approvazioni umane). */
export const COLLEGHI = {
  IRIS: "iris",
  ECHO: "echo",
  ARES: "ares",
  CHRONOS: "chronos",
  MEMO: "memo",
  CHARTA: "charta",
  EMPORION: "emporion",
  DIKEA: "dikea",
  DELPHI: "delphi",
  PHARO: "pharo",
  CALLIOPE: "calliope",
  ORCHESTRATOR: "orchestrator",
  ALBERTO: "alberto",
} as const;

export type CollegaNome = (typeof COLLEGHI)[keyof typeof COLLEGHI];

/** Valore legacy mantenuto per retrocompatibilità. */
export const ORCHESTRATOR = COLLEGHI.ORCHESTRATOR;

/** Lista di tutti i Colleghi (utile per iterazione). */
export const COLLEGHI_LIST: readonly CollegaNome[] = Object.values(COLLEGHI);

// ─── Timestamp ──────────────────────────────────────────────────

export interface FirestoreTimestamp {
  seconds: number;
  nanoseconds: number;
}

// ─── Message types ──────────────────────────────────────────────

/**
 * Catalogo completo dei tipi di messaggio sulla Lavagna.
 *
 * Convenzione naming:
 *   - `richiesta_*` — "ho bisogno di X"
 *   - `*_ricevuto/a` / `*_pronto/a` — "è arrivato/pronto X"
 *   - `notifica` / `alert` — a ECHO per l'utente umano
 *   - `task_completato` / `task_fallito` — ack generici
 *   - `escalation` — Orchestratore → ECHO su pending scaduti
 */
export const LAVAGNA_MESSAGE_TYPES = {
  // Generici (retrocompat v0.1)
  RICHIESTA_INTERVENTO: "richiesta_intervento",
  ALERT_URGENTE: "alert_urgente",
  RICHIESTA_INFO: "richiesta_info",
  TASK_COMPLETATO: "task_completato",
  TASK_FALLITO: "task_fallito",
  NOTIFICA: "notifica",

  // IRIS → altri
  GUASTO_URGENTE: "guasto_urgente",
  FATTURA_RICEVUTA: "fattura_ricevuta",
  INCASSI_RICEVUTI: "incassi_ricevuti",
  OFFERTA_FORNITORE: "offerta_fornitore",
  PEC_RICEVUTA: "pec_ricevuta",
  NUOVO_CLIENTE_RILEVATO: "nuovo_cliente_rilevato",
  DDT_RICEVUTO: "ddt_ricevuto",

  // ARES ↔ CHRONOS / EMPORION / DIKEA / ECHO
  RICHIESTA_SLOT: "richiesta_slot",
  SLOT_PROPOSTO: "slot_proposto",
  RICHIESTA_DISPONIBILITA_RICAMBIO: "richiesta_disponibilita_ricambio",
  DISPONIBILITA_RISPOSTA: "disponibilita_risposta",
  MATERIALI_CONSUMATI: "materiali_consumati",
  RICHIESTA_DICO: "richiesta_dico",

  // CHRONOS / DIKEA → altri
  SCADENZA_NORMATIVA: "scadenza_normativa",
  RICHIESTA_RIPROGRAMMAZIONE: "richiesta_riprogrammazione",

  // MEMO ↔ altri
  RICHIESTA_DOSSIER: "richiesta_dossier",
  DOSSIER_PRONTO: "dossier_pronto",
  RICHIESTA_ESPOSIZIONE: "richiesta_esposizione",

  // CALLIOPE richieste
  RICHIESTA_BOZZA: "richiesta_bozza",
  RICHIESTA_SOLLECITO: "richiesta_sollecito",
  RICHIESTA_PEC: "richiesta_pec",
  BOZZA_PRONTA: "bozza_pronta",
  BOZZA_APPROVATA: "bozza_approvata",

  // DELPHI / PHARO
  RICHIESTA_ANALISI: "richiesta_analisi",
  REPORT_PRONTO: "report_pronto",
  ANOMALIA_RILEVATA: "anomalia_rilevata",
  ALERT: "alert",

  // ECHO / Orchestratore
  DIGEST_PRONTO: "digest_pronto",
  AGENDA_GIORNALIERA: "agenda_giornaliera",
  ESCALATION: "escalation",
  RICHIESTA_APPROVAZIONE: "richiesta_approvazione",

  // Orchestratore interno
  ROUTING_RICHIESTO: "routing_richiesto",
  AVVIO_WORKFLOW: "avvio_workflow",
  CONFLITTO: "conflitto",
} as const;

export type LavagnaMessageType =
  (typeof LAVAGNA_MESSAGE_TYPES)[keyof typeof LAVAGNA_MESSAGE_TYPES];

// ─── LavagnaMessage ─────────────────────────────────────────────

export interface LavagnaMessage {
  id: string;
  /** Collega mittente. */
  from: CollegaNome | string;
  /** Collega destinatario. */
  to: CollegaNome | string;
  /** Tipo messaggio (vedi `LAVAGNA_MESSAGE_TYPES`). */
  type: LavagnaMessageType | string;
  /** Payload specifico del tipo. */
  payload: Record<string, unknown>;
  status: LavagnaStatus;
  priority: LavagnaPriority;

  /** Email IRIS da cui nasce la catena. */
  sourceEmailId?: string;
  /** Messaggio Lavagna che ha generato questo. */
  parentMessageId?: string;

  /** Workflow Orchestrator — istanza e ordine dello step. */
  workflowInstanceId?: string;
  workflowStepOrdine?: number;
  /** Time-to-live in minuti: oltre → escalation. Default in `EscalationRule`. */
  ttlMinutes?: number;

  pickedUpAt?: FirestoreTimestamp;
  completedAt?: FirestoreTimestamp;
  failedAt?: FirestoreTimestamp;
  failureReason?: string;
  /** Risultato del lavoro (quando `completed`). */
  result?: Record<string, unknown>;

  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
}

/** Shape di input per `Lavagna.post` — campi calcolati esclusi. */
export type LavagnaNewMessage = Omit<
  LavagnaMessage,
  | "id"
  | "status"
  | "pickedUpAt"
  | "completedAt"
  | "failedAt"
  | "failureReason"
  | "result"
  | "createdAt"
  | "updatedAt"
> & {
  status?: LavagnaStatus;
};

// ─── History / query filters ────────────────────────────────────

export interface HistoryFilters {
  from?: string;
  to?: string;
  type?: string;
  status?: LavagnaStatus;
  /** ISO-8601 lower bound (inclusive) on createdAt. */
  since?: string;
  /** ISO-8601 upper bound (exclusive) on createdAt. */
  until?: string;
  limit?: number;
  /** Filtra per workflow instance. */
  workflowInstanceId?: string;
}

// ─── Collection name ────────────────────────────────────────────

export const LAVAGNA_COLLECTION = "nexo_lavagna";
