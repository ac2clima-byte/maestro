/**
 * ECHO — azioni esposte agli altri Colleghi e all'Orchestratore.
 *
 * v0.1 implementato:
 *   · sendWhatsApp(to, body, opts?) — invio reale via Waha self-hosted.
 *
 * Tutto il resto è stub `Not implemented` per ora.
 */
import { initializeApp, getApps, applicationDefault, type App } from "firebase-admin/app";
import { getFirestore, type Firestore, FieldValue } from "firebase-admin/firestore";
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
  /** Override di waha session per questa chiamata. */
  wahaSession?: string;
}

// ─── Lazy Firebase apps (NEXO + COSMINA per Waha config) ───────

const NEXO_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "nexo-hub-15f2d";
const COSMINA_PROJECT_ID = process.env.COSMINA_PROJECT_ID || "garbymobile-f89ac";

function getOrInit(name: string, projectId: string): App {
  const existing = getApps().find((a) => a.name === name);
  if (existing) return existing;
  if (name === "[DEFAULT]") {
    return initializeApp({ credential: applicationDefault(), projectId });
  }
  return initializeApp({ credential: applicationDefault(), projectId }, name);
}
function nexoDb(): Firestore {
  return getFirestore(getOrInit("[DEFAULT]", NEXO_PROJECT_ID));
}
function cosminaDb(): Firestore {
  return getFirestore(getOrInit("cosmina", COSMINA_PROJECT_ID));
}

// ─── Dispatcher generico ────────────────────────────────────────

export async function sendMessage(
  channel: EchoChannel,
  to: string,
  body: string,
  opts: SendOptions = {},
): Promise<EchoMessage> {
  if (channel === "whatsapp") return sendWhatsApp(to, body, opts);
  throw new Error(`Not implemented: sendMessage(channel=${channel})`);
}

// ─── WhatsApp via Waha ──────────────────────────────────────────

interface WahaConfig {
  url: string;
  session: string;
  /** Header `X-Api-Key` per Waha. */
  apiKey?: string;
  /** Override del flag enabled. */
  enabled?: boolean;
}

let _wahaCache: { config: WahaConfig; expiresAt: number } | null = null;
const WAHA_CONFIG_TTL_MS = 5 * 60 * 1000; // 5 min

/** Carica la config Waha. Priorità: env (per test) → cosmina_config/whatsapp. */
export async function loadWahaConfig(): Promise<WahaConfig> {
  // Env override (utile per dev/test locale, NON committare le chiavi).
  const envUrl = process.env.WAHA_API_URL;
  if (envUrl) {
    return {
      url: envUrl.replace(/\/$/, ""),
      session: process.env.WAHA_SESSION || "default",
      apiKey: process.env.WAHA_API_KEY,
      enabled: (process.env.WAHA_ENABLED || "true").toLowerCase() === "true",
    };
  }

  if (_wahaCache && Date.now() < _wahaCache.expiresAt) return _wahaCache.config;

  const doc = await cosminaDb()
    .collection("cosmina_config")
    .doc("whatsapp")
    .get();
  if (!doc.exists) {
    throw new Error(
      "Waha config non trovata in cosmina_config/whatsapp né in env (WAHA_API_URL).",
    );
  }
  const d = doc.data() as Record<string, unknown>;
  const config: WahaConfig = {
    url: String(d.waha_url || "").replace(/\/$/, ""),
    session: String(d.waha_session || "default"),
    // Waha può chiamarla `waha_secret` (più vecchio) o `waha_api_key`.
    apiKey: (d.waha_api_key as string) || (d.waha_secret as string) || undefined,
    enabled: d.enabled !== false,
  };
  if (!config.url) {
    throw new Error("Waha URL vuoto in cosmina_config/whatsapp.");
  }
  _wahaCache = { config, expiresAt: Date.now() + WAHA_CONFIG_TTL_MS };
  return config;
}

/** Normalizza il numero in formato Waha `<intl>@c.us`. */
export function normalizeWhatsappAddress(input: string): string {
  let clean = String(input)
    .replace(/[\s\-()/.]/g, "")
    .replace(/^@/, "")
    .replace(/@(c\.us|s\.whatsapp\.net|lid)$/i, "");
  // Rimuovi + iniziale
  if (clean.startsWith("+")) clean = clean.slice(1);
  // Numero italiano 10 cifre senza prefisso → aggiungi 39
  if (clean.length === 10 && clean.startsWith("3")) clean = "39" + clean;
  // Doppio prefisso 39
  if (clean.startsWith("3939") && clean.length >= 14) clean = clean.slice(2);
  if (!/^\d{10,15}$/.test(clean)) {
    throw new Error(`Numero WhatsApp non valido: "${input}" → "${clean}"`);
  }
  return `${clean}@c.us`;
}

/** Whitelist destinatari (env). Se vuota → ALL allowed. */
function isAllowed(chatId: string): boolean {
  const wl = (process.env.ECHO_ALLOWED_NUMBERS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => normalizeWhatsappAddress(s));
  if (wl.length === 0) return true;
  return wl.includes(chatId);
}

function isDryRun(): boolean {
  return (process.env.ECHO_DRY_RUN ?? process.env.DRY_RUN ?? "true")
    .toLowerCase() === "true";
}

async function persistEchoMessage(msg: EchoMessage): Promise<void> {
  // best-effort: errore di scrittura non blocca la consegna
  try {
    await nexoDb()
      .collection("echo_messages")
      .doc(msg.id)
      .set({ ...msg, _serverTime: FieldValue.serverTimestamp() });
  } catch {
    /* swallow */
  }
}

function makeMsgId(): string {
  return (
    "wa_" +
    Date.now().toString(36) +
    "_" +
    Math.random().toString(36).slice(2, 8)
  );
}

/**
 * Invia un messaggio WhatsApp via Waha.
 *
 * Modalità sicure attive di default (vanno disattivate esplicitamente):
 *   · ECHO_DRY_RUN=true (default!) — non chiama Waha, scrive solo
 *     echo_messages con status="skipped".
 *   · ECHO_ALLOWED_NUMBERS — whitelist CSV. Se non vuota, solo numeri
 *     in whitelist ricevono. Se vuota → tutti ammessi (USE WITH CARE).
 *
 * Per attivare l'invio reale:
 *   ECHO_DRY_RUN=false
 *   ECHO_ALLOWED_NUMBERS=+393331234567
 */
export async function sendWhatsApp(
  to: string,
  body: string,
  opts: SendOptions = {},
): Promise<EchoMessage> {
  const id = makeMsgId();
  const now = new Date().toISOString();
  const chatId = normalizeWhatsappAddress(to);

  const baseMsg: EchoMessage = {
    id,
    channel: "whatsapp",
    to: chatId,
    body,
    priority: opts.priority ?? "normal",
    status: "queued",
    sourceLavagnaId: opts.sourceLavagnaId,
    sourceEmailId: opts.sourceEmailId,
    createdAt: now,
    updatedAt: now,
    attempts: 0,
  };

  // 1. Whitelist
  if (!isAllowed(chatId) && !opts.force) {
    const skipped: EchoMessage = {
      ...baseMsg,
      status: "skipped",
      failedReason: `destinatario non in whitelist (ECHO_ALLOWED_NUMBERS): ${chatId}`,
      updatedAt: new Date().toISOString(),
    };
    await persistEchoMessage(skipped);
    return skipped;
  }

  // 2. Dry-run: salta la chiamata Waha
  if (isDryRun() && !opts.force) {
    const skipped: EchoMessage = {
      ...baseMsg,
      status: "skipped",
      failedReason: "DRY_RUN attivo (ECHO_DRY_RUN=true)",
      updatedAt: new Date().toISOString(),
    };
    await persistEchoMessage(skipped);
    return skipped;
  }

  // 3. Carica config Waha
  let cfg: WahaConfig;
  try {
    cfg = await loadWahaConfig();
  } catch (e) {
    const failed: EchoMessage = {
      ...baseMsg,
      status: "failed",
      failedReason: `config Waha mancante: ${e instanceof Error ? e.message : String(e)}`,
      updatedAt: new Date().toISOString(),
    };
    await persistEchoMessage(failed);
    return failed;
  }

  if (cfg.enabled === false) {
    const skipped: EchoMessage = {
      ...baseMsg,
      status: "skipped",
      failedReason: "Waha config flag enabled=false",
      updatedAt: new Date().toISOString(),
    };
    await persistEchoMessage(skipped);
    return skipped;
  }

  // 4. Chiama Waha (1 retry su errore di rete / 5xx)
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cfg.apiKey) headers["X-Api-Key"] = cfg.apiKey;
  const session = opts.wahaSession || cfg.session || "default";
  const payload = JSON.stringify({ chatId, text: body, session });
  const url = `${cfg.url}/api/sendText`;

  let lastErr: string | undefined;
  for (let attempt = 1; attempt <= 2; attempt++) {
    baseMsg.attempts = attempt;
    baseMsg.attemptedAt = new Date().toISOString();
    try {
      const resp = await fetch(url, { method: "POST", headers, body: payload });
      const text = await resp.text().catch(() => "");
      if (resp.ok) {
        const sent: EchoMessage = {
          ...baseMsg,
          status: "sent",
          sentAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await persistEchoMessage(sent);
        return sent;
      }
      lastErr = `HTTP ${resp.status}: ${text.slice(0, 200)}`;
      // Solo 5xx merita retry
      if (resp.status < 500) break;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 800));
  }

  const failed: EchoMessage = {
    ...baseMsg,
    status: "failed",
    failedReason: lastErr || "errore sconosciuto",
    updatedAt: new Date().toISOString(),
  };
  await persistEchoMessage(failed);
  return failed;
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
