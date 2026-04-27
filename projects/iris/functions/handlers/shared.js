// handlers/shared.js — Firebase apps, CORS, rate limiting, auth, utilities.
// Nessuna logica di business qui: solo infrastruttura condivisa tra handler.

import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getMessaging } from "firebase-admin/messaging";

// ─── Secrets ───────────────────────────────────────────────────
export const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
export const EWS_USERNAME = defineSecret("EWS_USERNAME");
export const EWS_PASSWORD = defineSecret("EWS_PASSWORD");
export const EWS_URL = defineSecret("EWS_URL");

// ─── Constants ─────────────────────────────────────────────────
export const REGION = "europe-west1";
export const MODEL = "claude-haiku-4-5";
export const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

// ─── Primary Firebase app (nexo-hub-15f2d) ─────────────────────
if (!getApps().length) initializeApp();
export const db = getFirestore();
// Ignora proprietà undefined nelle write Firestore (evita crash tipo
// "Cannot use 'undefined' as a Firestore value" quando un campo opzionale
// non è settato in un oggetto annidato come intent.steps).
try { db.settings({ ignoreUndefinedProperties: true }); } catch {}
export { FieldValue, logger };

// ─── Cross-project Firestore apps ──────────────────────────────
let _cosminaApp = null;
export function getCosminaDb() {
  if (_cosminaApp) return getFirestore(_cosminaApp);
  const existing = getApps().find((a) => a.name === "cosmina");
  if (existing) { _cosminaApp = existing; return getFirestore(_cosminaApp); }
  _cosminaApp = initializeApp({ projectId: "garbymobile-f89ac" }, "cosmina");
  return getFirestore(_cosminaApp);
}

let _guazzottiApp = null;
export function getGuazzottiDb() {
  if (_guazzottiApp) return getFirestore(_guazzottiApp);
  const existing = getApps().find((a) => a.name === "guazzotti");
  if (existing) { _guazzottiApp = existing; return getFirestore(_guazzottiApp); }
  _guazzottiApp = initializeApp({ projectId: "guazzotti-tec" }, "guazzotti");
  return getFirestore(_guazzottiApp);
}

// ─── Auth ACG (verifica ID Token da garbymobile-f89ac) ─────────
let _acgAuthApp = null;
export function getAcgAuthAdmin() {
  if (_acgAuthApp) return getAdminAuth(_acgAuthApp);
  const existing = getApps().find((a) => a.name === "acg-auth");
  if (existing) { _acgAuthApp = existing; return getAdminAuth(_acgAuthApp); }
  _acgAuthApp = initializeApp({ projectId: "garbymobile-f89ac" }, "acg-auth");
  return getAdminAuth(_acgAuthApp);
}

const _tokenCache = new Map();
export async function verifyAcgIdToken(req) {
  const authHdr = String(req.headers["authorization"] || req.headers["Authorization"] || "");
  const m = authHdr.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const token = m[1].trim();
  const cached = _tokenCache.get(token);
  if (cached && cached.exp > Date.now()) return cached.decoded;
  try {
    const decoded = await getAcgAuthAdmin().verifyIdToken(token);
    const result = { uid: decoded.uid, email: decoded.email || null, claims: decoded };
    _tokenCache.set(token, { decoded: result, exp: Date.now() + 10 * 60 * 1000 });
    if (_tokenCache.size > 500) {
      const keys = [..._tokenCache.keys()].slice(0, 200);
      keys.forEach(k => _tokenCache.delete(k));
    }
    return result;
  } catch (e) {
    logger.warn("verifyAcgIdToken failed", { error: String(e).slice(0, 200) });
    return null;
  }
}

// ─── CORS ──────────────────────────────────────────────────────
export const ALLOWED_ORIGINS = new Set([
  "https://nexo-hub-15f2d.web.app",
  "https://nexo-hub-15f2d.firebaseapp.com",
  "http://localhost:5000",
  "http://localhost:5173",
]);

export function applyCors(req, res) {
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.has(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
  }
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.set("Access-Control-Max-Age", "3600");
}

export function applyCorsOpen(req, res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-File-Name, X-Session-Id, X-Forge-Key");
  res.set("Access-Control-Expose-Headers", "X-Nexo-Cached, X-Nexo-Cache-Key");
  res.set("Access-Control-Max-Age", "3600");
}

// ─── Rate limiting ─────────────────────────────────────────────
export function hourBucket() {
  const d = new Date();
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}-${String(d.getUTCHours()).padStart(2, "0")}`;
}

// ─── Timezone helpers (Europe/Rome) ─────────────────────────────
// Le Cloud Functions girano in UTC. Tutti i calcoli di "oggi/ieri/domani"
// e i giorni della settimana DEVONO usare Europe/Rome (CET/CEST), perché
// la nostra utenza è italiana. Senza questo, alle 00-02 UTC (= 02-04 CEST)
// "oggi" risultava il giorno precedente.
const ROME_TZ = "Europe/Rome";

// Ritorna i campi Y/M/D di "now" nel fuso Europe/Rome.
function _romeYMD(date) {
  const d = date instanceof Date ? date : new Date(date);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: ROME_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  // en-CA produce "YYYY-MM-DD"
  const parts = fmt.format(d).split("-").map(Number);
  return { y: parts[0], m: parts[1], d: parts[2] };
}

// "YYYY-MM-DD" oggi in Europe/Rome (es. "2026-04-27").
export function oggiItalia(date) {
  const { y, m, d } = _romeYMD(date || new Date());
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// "27/04/2026" formato italiano.
export function dataItaliaItFormat(date) {
  const { y, m, d } = _romeYMD(date || new Date());
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

// Ora corrente "HH:MM" in Europe/Rome.
export function oraItalia(date) {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: ROME_TZ, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(date || new Date());
}

// Giorno della settimana in italiano (lowercase): "lunedì", "martedì", ecc.
export function giornoSettimanaItalia(date) {
  const s = new Intl.DateTimeFormat("it-IT", {
    timeZone: ROME_TZ, weekday: "long",
  }).format(date || new Date());
  return s.toLowerCase();
}

// Date object che rappresenta MEZZANOTTE in Europe/Rome del giorno passato
// (o di oggi). Tutti i calcoli range data devono partire da qui invece di
// `new Date()` con `setHours(0,0,0,0)` (che è mezzanotte locale del server,
// quasi sempre UTC su Cloud Functions).
//
// Ritorna una Date che, quando convertita in `toISOString()` o quando si
// fa `.getTime() + delta`, rappresenta correttamente "mezzanotte italiana".
//
// Implementazione: prendi Y/M/D italiani, costruisci la stringa ISO con
// offset Europe/Rome calcolato dinamicamente (gestisce CET/CEST).
export function mezzanotteItalia(date) {
  const ref = date instanceof Date ? date : (date ? new Date(date) : new Date());
  const { y, m, d } = _romeYMD(ref);
  // Calcola offset Europe/Rome per la data data (CET=+01:00 / CEST=+02:00)
  const offsetMin = _romeOffsetMinutes(new Date(Date.UTC(y, m - 1, d, 12)));
  const sign = offsetMin >= 0 ? "+" : "-";
  const oh = Math.abs(Math.trunc(offsetMin / 60));
  const om = Math.abs(offsetMin % 60);
  const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T00:00:00${sign}${String(oh).padStart(2, "0")}:${String(om).padStart(2, "0")}`;
  return new Date(iso);
}

// Offset in minuti del fuso Europe/Rome rispetto a UTC per una specifica
// Date di riferimento. Positivo per fuso ad est di UTC.
function _romeOffsetMinutes(date) {
  // Trick: confronta epoch UTC vs epoch derivato dalla rappresentazione in Rome.
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: ROME_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).filter(p => p.type !== "literal").map(p => [p.type, Number(p.value)]));
  const asRomeMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour === 24 ? 0 : parts.hour, parts.minute, parts.second);
  return Math.round((asRomeMs - date.getTime()) / 60000);
}

// Stringa pronta per system prompt LLM: "lunedì 27 aprile 2026, ore 10:35".
export function oggiPromptItalia(date) {
  const ref = date || new Date();
  const fmt = new Intl.DateTimeFormat("it-IT", {
    timeZone: ROME_TZ, weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).format(ref);
  return `${fmt}, ore ${oraItalia(ref)}`;
}

const MAX_PER_IP_PER_HOUR = 30;
const MAX_GLOBAL_PER_HOUR = 200;
const RATE_COLLECTION = "iris_rate_suggest_reply";

export async function checkRateLimit(ip) {
  const bucket = hourBucket();
  const ipKey = ip ? ip.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60) : "unknown";
  const ipRef = db.collection(RATE_COLLECTION).doc(`${bucket}_${ipKey}`);
  const globalRef = db.collection(RATE_COLLECTION).doc(`${bucket}_GLOBAL`);
  const [ipSnap, globalSnap] = await Promise.all([ipRef.get(), globalRef.get()]);
  const ipCount = (ipSnap.data() || {}).count || 0;
  const globalCount = (globalSnap.data() || {}).count || 0;
  if (ipCount >= MAX_PER_IP_PER_HOUR) return { ok: false, reason: "rate_limit_ip", retryAfterSeconds: 3600 };
  if (globalCount >= MAX_GLOBAL_PER_HOUR) return { ok: false, reason: "rate_limit_global", retryAfterSeconds: 3600 };
  await Promise.all([
    ipRef.set({ count: FieldValue.increment(1), bucket, ip: ipKey, updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
    globalRef.set({ count: FieldValue.increment(1), bucket, updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
  ]);
  return { ok: true };
}

const NEXUS_RATE_COLLECTION = "iris_rate_nexus";
const NEXUS_MAX_PER_IP_PER_HOUR = 60;
const NEXUS_MAX_GLOBAL_PER_HOUR = 400;

export async function checkNexusRateLimit(ip) {
  const bucket = hourBucket();
  const ipKey = ip ? ip.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60) : "unknown";
  const ipRef = db.collection(NEXUS_RATE_COLLECTION).doc(`${bucket}_${ipKey}`);
  const globalRef = db.collection(NEXUS_RATE_COLLECTION).doc(`${bucket}_GLOBAL`);
  const [ipSnap, globalSnap] = await Promise.all([ipRef.get(), globalRef.get()]);
  const ipCount = (ipSnap.data() || {}).count || 0;
  const globalCount = (globalSnap.data() || {}).count || 0;
  if (ipCount >= NEXUS_MAX_PER_IP_PER_HOUR) return { ok: false, reason: "rate_limit_ip", retryAfterSeconds: 3600 };
  if (globalCount >= NEXUS_MAX_GLOBAL_PER_HOUR) return { ok: false, reason: "rate_limit_global", retryAfterSeconds: 3600 };
  await Promise.all([
    ipRef.set({ count: FieldValue.increment(1), bucket, ip: ipKey, updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
    globalRef.set({ count: FieldValue.increment(1), bucket, updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
  ]);
  return { ok: true };
}

// ─── Anthropic Haiku helper ────────────────────────────────────
export async function callHaiku(apiKey, system, user) {
  const payload = {
    model: MODEL,
    max_tokens: 1024,
    system,
    messages: [{ role: "user", content: user }],
  };
  const resp = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Anthropic ${resp.status}: ${text.slice(0, 300)}`);
  }
  const json = await resp.json();
  const text = (json.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  return { text, usage: json.usage || {} };
}

// ─── Date utilities ────────────────────────────────────────────
export function fmtData(iso) {
  if (!iso) return "?";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "?";
    return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
  } catch { return "?"; }
}

export function fmtDataOra(iso) {
  if (!iso) return "?";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "?";
    return d.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch { return "?"; }
}

export function isToday(iso) {
  if (!iso) return false;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return false;
    const now = new Date();
    return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth() && d.getUTCDate() === now.getUTCDate();
  } catch { return false; }
}

export function daysBetween(a, b) {
  if (!a || !b) return null;
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / 86400000);
}

export function parseDocDate(val) {
  if (!val) return null;
  try {
    if (val.toDate) return val.toDate();
    if (typeof val === "string") {
      const iso = new Date(val);
      if (!Number.isNaN(iso.getTime())) return iso;
      const m = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    }
    if (val instanceof Date) return val;
  } catch {}
  return null;
}

// ─── Name/token utilities ──────────────────────────────────────
export function tokenize(s) {
  return String(s || "")
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .split(/[\s,._\-]+/)
    .filter(Boolean);
}

export function matchesAllTokens(queryTokens, nameTokens) {
  if (!queryTokens.length) return false;
  const nameSet = new Set(nameTokens);
  return queryTokens.every(t => nameSet.has(t));
}

export function prettyName(s) {
  return String(s || "")
    .split(/\s+/).filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

// ─── Classificazione RTI/RTIDF ─────────────────────────────────
export function classifyRtiTipo(v, colName) {
  const t = String(v.tipo || "").toLowerCase();
  if (t === "generico" || t === "contabilizzazione") return t;
  const n = String(v.numero_rti || v.numero_rtidf || v._id || "").toUpperCase();
  if (colName === "rti") {
    if (n.startsWith("GRTI")) return "generico";
    if (n.startsWith("CRTI")) return "contabilizzazione";
  } else if (colName === "rtidf") {
    if (n.startsWith("GRTIDF")) return "generico";
    if (n.startsWith("CRTIDF")) return "contabilizzazione";
  }
  return "?";
}

// ─── Email utilities (condivise) ───────────────────────────────
export const CATEGORIE_URGENTI_SET = new Set(["GUASTO_URGENTE", "PEC_UFFICIALE"]);

export async function fetchIrisEmails(limit = 200) {
  try {
    const snap = await db.collection("iris_emails")
      .orderBy("raw.received_time", "desc")
      .limit(limit)
      .get();
    const out = [];
    snap.forEach(doc => {
      const d = doc.data() || {};
      const raw = d.raw || {}, cls = d.classification || {}, fu = d.followup || {};
      out.push({
        id: doc.id,
        subject: raw.subject || "",
        sender: raw.sender || "",
        senderName: raw.sender_name || "",
        received_time: raw.received_time || "",
        body_text: raw.body_text || "",
        category: cls.category || "ALTRO",
        sentiment: cls.sentiment || "neutro",
        suggestedAction: cls.suggestedAction || "",
        summary: cls.summary || "",
        entities: cls.entities || {},
        intent: cls.intent || null,
        dati_estratti: cls.dati_estratti || null,
        contesto_thread: cls.contesto_thread || null,
        prossimo_passo: cls.prossimo_passo || null,
        score: typeof d.score === "number" ? d.score : 0,
        followup: fu,
      });
    });
    return out;
  } catch (e) {
    logger.warn("fetchIrisEmails failed", { error: String(e) });
    return [];
  }
}

export function emailLine(e, i) {
  const idx = (typeof i === "number") ? `${i + 1}. ` : "";
  const when = e.received_time ? fmtData(e.received_time) : "";
  const who = e.senderName || e.sender || "?";
  const subj = (e.subject || "").slice(0, 100);
  return `${idx}[${when}] ${who} — ${subj}`;
}

// ─── Naturalize: post-processor content per tono conversazionale ─
//
// Rete di sicurezza AGGRESSIVA: qualsiasi content prodotto dai direct handler
// passa di qui prima di essere scritto in nexus_chat. Rimuove SEMPRE:
//  - markdown bold **...** (tiene il testo)
//  - bullet "· " e "- " a inizio riga
//  - emoji decorative (📧 📊 🏢 🚨 ✅ ⚠️ ❌ ⏰ 💰 ecc.)
//  - separatori "—", "─" a inizio riga
//  - linee vuote consecutive

const DECORATIVE_EMOJIS = /[📧📊🏢🚨✅⚠️❌⏰🔎📋🔧💰🗒️📱📞📄📁✍️🔔↪️📬❓🎤🔊🔇🟣🟢🟠🔴🟡📎🎯🚀💡🔥🌟✨🆕⚖️⚖🔒🔓📦📇👁️📤📥💳💵💸📈📉🏷️📌📍🛒🚚🏠🏭]/gu;

export function naturalize(text) {
  if (!text || typeof text !== "string") return text;
  let s = text;

  // Rimuovi SEMPRE le emoji decorative (anche inline) — non solo a inizio riga
  s = s.replace(DECORATIVE_EMOJIS, "");
  // Rimuovi **bold** mantenendo il testo
  s = s.replace(/\*\*(.+?)\*\*/g, "$1");
  // Rimuovi *italic* mantenendo il testo (singolo *)
  s = s.replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, "$1");
  // Rimuovi underscore italic _testo_
  s = s.replace(/(?<!\w)_([^_\n]+?)_(?!\w)/g, "$1");
  // Rimuovi bullet "· " e "• " e "- " a inizio riga (sostituisci con nulla)
  s = s.replace(/^\s*[·•]\s+/gm, "");
  s = s.replace(/^[ \t]*-\s+/gm, "");
  // Rimuovi separatori "─────" e righe di soli "─"
  s = s.replace(/^\s*[─━]+\s*$/gm, "");
  // Rimuovi parentesi backtick `xxxxx` inline (mantiene contenuto)
  s = s.replace(/`([^`\n]+)`/g, "$1");
  // Trim doppi spazi
  s = s.replace(/[ \t]{2,}/g, " ");
  // Riga vuota consecutiva → collassa
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

// ─── FCM Push Notifications ────────────────────────────────────
// sendPushNotification — legge i token FCM da nexo_config/fcm_tokens
// e manda via FCM Admin SDK. Link apre la PWA.
//
// Args:
//   title: string (titolo notifica)
//   body:  string (corpo)
//   link:  string opzionale (es. "/#home" o "/#chronos/campagne/walkby")
//   userId: string opzionale (se presente, manda solo a quell'utente;
//           altrimenti a tutti i token registrati)
//
// Return: { ok, sent, failed, errors }
export async function sendPushNotification(title, body, link, userId) {
  const result = { ok: false, sent: 0, failed: 0, errors: [] };
  try {
    const snap = await db.collection("nexo_config").doc("fcm_tokens").get();
    if (!snap.exists) {
      result.errors.push("no_fcm_tokens_doc");
      return result;
    }
    const tokens = [];
    const data = snap.data() || {};
    const targetUserKey = userId ? String(userId).replace(/[^a-zA-Z0-9._-]/g, "_") : null;
    for (const [k, v] of Object.entries(data)) {
      if (!v || typeof v !== "object" || !v.token) continue;
      if (targetUserKey && k !== targetUserKey) continue;
      tokens.push(v.token);
    }
    if (tokens.length === 0) {
      result.errors.push("no_tokens_matched");
      return result;
    }

    const message = {
      notification: { title: String(title).slice(0, 120), body: String(body).slice(0, 400) },
      data: {
        link: String(link || "/#home").slice(0, 300),
        timestamp: new Date().toISOString(),
      },
      webpush: {
        fcmOptions: { link: String(link || "/#home") },
        notification: {
          icon: "/icon-192.png",
          badge: "/icon-192.png",
        },
      },
    };

    const messaging = getMessaging();
    const sendPromises = tokens.map(async (token) => {
      try {
        await messaging.send({ ...message, token });
        return { ok: true, token };
      } catch (e) {
        return { ok: false, token, error: String(e).slice(0, 200) };
      }
    });
    const results = await Promise.all(sendPromises);
    for (const r of results) {
      if (r.ok) result.sent++;
      else { result.failed++; result.errors.push(r.error); }
    }

    // Log in Firestore (per audit)
    try {
      await db.collection("nexo_push_log").add({
        title: message.notification.title,
        body: message.notification.body,
        link: message.data.link,
        targetUser: userId || null,
        tokensTried: tokens.length,
        sent: result.sent,
        failed: result.failed,
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (e) { logger.warn("push log write failed", { error: String(e) }); }

    result.ok = result.sent > 0;
    return result;
  } catch (e) {
    logger.error("sendPushNotification failed", { error: String(e) });
    result.errors.push(String(e).slice(0, 200));
    return result;
  }
}

// ─── Lavagna helper (condiviso tra regole/ARES/ECHO) ───────────
export async function postLavagna({ to, type, payload, priority = "normal", from = "iris_rules" }) {
  const ref = await db.collection("nexo_lavagna").add({
    from, to, type,
    payload: payload || {},
    status: "pending",
    priority,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}
