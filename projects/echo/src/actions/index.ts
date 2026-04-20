/**
 * ECHO — azioni esposte agli altri Colleghi e all'Orchestratore.
 *
 * Tutti gli stub lanciano "Not implemented" finché non sono implementati.
 * Le firme sono stabili (sono il contratto del Collega).
 */
import type {
  EchoChannel,
  EchoMessage,
  EchoPriority,
  InboundMessage,
} from "../types/index.js";

export interface SendOptions {
  priority?: EchoPriority;
  sourceLavagnaId?: string;
  sourceEmailId?: string;
  /** Se true, bypassa quiet hours e dedup. Default false. */
  force?: boolean;
}

// ─── Dispatcher generico ────────────────────────────────────────

export async function sendMessage(
  _channel: EchoChannel,
  _to: string,
  _body: string,
  _opts: SendOptions = {},
): Promise<EchoMessage> {
  throw new Error("Not implemented: sendMessage");
}

// ─── Canali specifici ───────────────────────────────────────────

export async function sendWhatsApp(
  _to: string,
  _body: string,
  _opts: SendOptions = {},
): Promise<EchoMessage> {
  throw new Error("Not implemented: sendWhatsApp");
}

export async function sendTelegram(
  _chatId: string,
  _body: string,
  _opts: SendOptions = {},
): Promise<EchoMessage> {
  throw new Error("Not implemented: sendTelegram");
}

export async function sendEmail(
  _to: string,
  _subject: string,
  _body: string,
  _opts: SendOptions & { attachments?: EchoMessage["attachments"] } = {},
): Promise<EchoMessage> {
  throw new Error("Not implemented: sendEmail");
}

export async function sendPushNotification(
  _uid: string,
  _title: string,
  _body: string,
  _opts: SendOptions & { url?: string } = {},
): Promise<EchoMessage> {
  throw new Error("Not implemented: sendPushNotification");
}

// ─── Voce ───────────────────────────────────────────────────────

export interface SpeakOptions {
  voice?: string;        // es. "it-IT-IsabellaNeural"
  rate?: string;         // es. "+0%"
  outFormat?: "mp3" | "wav";
  saveTo?: string;       // path locale opzionale
}

export async function speak(_text: string, _opts: SpeakOptions = {}): Promise<{ audioPath: string; durationMs: number }> {
  throw new Error("Not implemented: speak");
}

export interface TranscribeOptions {
  language?: string;     // default "it"
  model?: string;        // default "small"
}

export async function transcribe(
  _audioRef: string,
  _opts: TranscribeOptions = {},
): Promise<{ text: string; durationMs: number; segments?: Array<{ start: number; end: number; text: string }> }> {
  throw new Error("Not implemented: transcribe");
}

// ─── Digest ─────────────────────────────────────────────────────

export interface DigestScope {
  /** Quali sezioni includere. */
  sections: Array<"email" | "alert" | "agenda" | "interventi">;
  /** Per quale utente. */
  forUserUid: string;
  /** Limite righe per sezione. */
  maxItemsPerSection?: number;
}

export async function generaDigest(
  _scope: DigestScope,
  _opts: SendOptions & { channel?: EchoChannel; to?: string } = {},
): Promise<EchoMessage> {
  throw new Error("Not implemented: generaDigest");
}

// ─── Webhook handlers (canali in entrata) ───────────────────────

export async function onWhatsAppIncoming(_payload: unknown): Promise<InboundMessage> {
  throw new Error("Not implemented: onWhatsAppIncoming");
}

export async function onTelegramIncoming(_payload: unknown): Promise<InboundMessage> {
  throw new Error("Not implemented: onTelegramIncoming");
}
