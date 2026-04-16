export type LavagnaStatus = "pending" | "picked_up" | "completed" | "failed";

export type LavagnaPriority = "low" | "normal" | "high" | "critical";

export const ORCHESTRATOR = "orchestrator" as const;

export interface FirestoreTimestamp {
  seconds: number;
  nanoseconds: number;
}

export interface LavagnaMessage {
  id: string;
  from: string;
  to: string;
  type: string;
  payload: Record<string, unknown>;
  status: LavagnaStatus;
  priority: LavagnaPriority;
  sourceEmailId?: string;
  pickedUpAt?: FirestoreTimestamp;
  completedAt?: FirestoreTimestamp;
  failedAt?: FirestoreTimestamp;
  failureReason?: string;
  result?: Record<string, unknown>;
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
}

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
}

export const LAVAGNA_COLLECTION = "nexo_lavagna";

export const LAVAGNA_MESSAGE_TYPES = {
  RICHIESTA_INTERVENTO: "richiesta_intervento",
  ALERT_URGENTE: "alert_urgente",
  RICHIESTA_INFO: "richiesta_info",
  TASK_COMPLETATO: "task_completato",
  NOTIFICA: "notifica",
} as const;

export type LavagnaMessageType =
  (typeof LAVAGNA_MESSAGE_TYPES)[keyof typeof LAVAGNA_MESSAGE_TYPES];
