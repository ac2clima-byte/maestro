/**
 * ECHO — tipi del dominio Comunicazione.
 *
 * Riferimento: context/nexo-architettura.md sez. 2 (ECHO) e sez. Lavagna.
 */

export type EchoChannel = "whatsapp" | "telegram" | "email" | "push" | "voice";

export type EchoPriority = "low" | "normal" | "high" | "critical";

export type EchoStatus = "queued" | "sending" | "sent" | "failed" | "skipped";

/** Singolo messaggio in uscita gestito da ECHO. Persistito in `echo_messages`. */
export interface EchoMessage {
  id: string;
  channel: EchoChannel;
  /** Identifier dipendente dal canale: numero WA, chat_id Telegram, email, fcm uid, ... */
  to: string;
  /** Testo principale del messaggio (Markdown leggero accettato per Telegram/email). */
  body: string;
  /** Subject solo per email. */
  subject?: string;
  priority: EchoPriority;
  status: EchoStatus;
  /** Riferimento al messaggio della Lavagna che ha originato questo invio. */
  sourceLavagnaId?: string;
  /** Riferimento opzionale all'email IRIS che ha generato la catena. */
  sourceEmailId?: string;
  /** Allegati: ref Firestore o URL Storage. */
  attachments?: Array<{ name: string; refOrUrl: string; mime?: string }>;
  /** Hash di idempotenza per evitare doppi invii (calcolato su channel+to+body+source). */
  dedupKey?: string;
  attemptedAt?: string;
  sentAt?: string;
  failedReason?: string;
  /** Quante volte abbiamo provato. Default 0. */
  attempts?: number;
  createdAt: string;
  updatedAt: string;
}

/** Configurazione runtime di un canale (es. credenziali, health). `echo_channels`. */
export interface EchoChannelConfig {
  channel: EchoChannel;
  enabled: boolean;
  /** Quando false, gli invii vengono saltati con status "skipped". */
  healthy: boolean;
  lastHealthCheckAt?: string;
  /** Configurazione opaca specifica del canale (mai segreti, solo metadata). */
  meta?: Record<string, unknown>;
}

/** Preferenze di Alberto su come ricevere notifiche. `echo_preferences`. */
export interface EchoPreferences {
  /** Canale preferito per ogni tipo di notifica. */
  defaultChannelByType: Partial<Record<string, EchoChannel>>;
  /** Quiet hours: nessuna notifica non-critical in queste fasce. */
  quietHours?: Array<{ from: string; to: string; weekdaysOnly?: boolean }>;
  /** Numero minimo di alert simili da raggruppare prima di notificare. */
  groupThreshold?: number;
}

/**
 * Configurazione del Digest mattutino. ECHO costruisce il digest leggendo
 * fonti diverse (IRIS, PHARO, CHRONOS) e lo invia sul canale preferito.
 */
export interface DigestConfig {
  /** Quando spedire il digest (es. "07:30"). */
  scheduledAt: string;
  channel: EchoChannel;
  to: string;
  /** Quali sezioni includere. */
  sections: Array<"email" | "alert" | "agenda" | "interventi">;
  /** Limite righe per sezione. */
  maxItemsPerSection?: number;
}

/** Inbound: WhatsApp / Telegram passano da qui prima di entrare nella Lavagna. */
export interface InboundMessage {
  channel: EchoChannel;
  /** Mittente, formato dipende dal canale (es. "+39…", "@user"). */
  from: string;
  body: string;
  receivedAt: string;
  /** Eventuale id originale del provider (per dedup). */
  providerMessageId?: string;
}
