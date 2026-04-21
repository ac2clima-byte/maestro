import { onRequest } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth as getAdminAuth } from "firebase-admin/auth";

if (!getApps().length) initializeApp();
const db = getFirestore();

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

const REGION = "europe-west1";
const MODEL = "claude-haiku-4-5";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

// Rate limit minimo per evitare runaway costs in v0.1 (no auth):
// 30 chiamate/ora per IP + 200 chiamate/ora globali. Tracciato in Firestore.
const MAX_PER_IP_PER_HOUR = 30;
const MAX_GLOBAL_PER_HOUR = 200;
const RATE_COLLECTION = "iris_rate_suggest_reply";

const ALLOWED_ORIGINS = new Set([
  "https://nexo-hub-15f2d.web.app",
  "https://nexo-hub-15f2d.firebaseapp.com",
  "http://localhost:5000",
  "http://localhost:5173",
]);

function applyCors(req, res) {
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.has(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
  }
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.set("Access-Control-Max-Age", "3600");
}

function hourBucket() {
  const d = new Date();
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}-${String(d.getUTCHours()).padStart(2, "0")}`;
}

async function checkRateLimit(ip) {
  const bucket = hourBucket();
  const ipKey = ip ? ip.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60) : "unknown";
  const ipRef = db.collection(RATE_COLLECTION).doc(`${bucket}_${ipKey}`);
  const globalRef = db.collection(RATE_COLLECTION).doc(`${bucket}_GLOBAL`);

  const [ipSnap, globalSnap] = await Promise.all([ipRef.get(), globalRef.get()]);
  const ipCount = (ipSnap.data() || {}).count || 0;
  const globalCount = (globalSnap.data() || {}).count || 0;

  if (ipCount >= MAX_PER_IP_PER_HOUR) {
    return { ok: false, reason: "rate_limit_ip", retryAfterSeconds: 3600 };
  }
  if (globalCount >= MAX_GLOBAL_PER_HOUR) {
    return { ok: false, reason: "rate_limit_global", retryAfterSeconds: 3600 };
  }

  await Promise.all([
    ipRef.set({ count: FieldValue.increment(1), bucket, ip: ipKey, updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
    globalRef.set({ count: FieldValue.increment(1), bucket, updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
  ]);
  return { ok: true };
}

const SYSTEM_PROMPT = `Sei l'assistente email di Alberto Contardi, titolare di ACG Clima Service S.R.L., azienda di manutenzione caldaie e impianti HVAC con sede in Piemonte. Scrivi bozze di risposta professionali in italiano per le email che riceve.

REGOLE:
- Tono cordiale ma professionale, conciso. Non smielato.
- Italiano corretto, niente anglicismi inutili.
- Non inventare fatti, importi, date o appuntamenti che non sono nell'email originale o nel contesto.
- Se l'email richiede un'azione (intervento, preventivo, conferma), proponila esplicitamente con un placeholder dove serve (es. "[data da confermare]").
- Firma con: "Cordiali saluti,\\nAlberto Contardi\\nACG Clima Service".
- Se la categoria è NEWSLETTER_SPAM o COMUNICAZIONE_INTERNA marginale, suggerisci che probabilmente non serve risposta — ma scrivi comunque una bozza minima.
- Se ci sono casi simili nello storico, tienine conto (es. "come l'altra volta…").
- Se ci sono messaggi sulla Lavagna correlati, riferisci sinteticamente quanto fatto/in corso.
- Se mancano informazioni cruciali, chiedile esplicitamente nella bozza.

OUTPUT: solo il testo della bozza, senza preambolo, senza spiegazioni, senza markdown. Max 2000 caratteri.`;

function buildUserPrompt({ email, classification, similar, lavagna }) {
  const parts = [];
  parts.push("=== EMAIL DA RISCONTRARE ===");
  parts.push(`Da: ${email.sender_name ? `${email.sender_name} <${email.sender}>` : email.sender}`);
  if (email.received_time) parts.push(`Ricevuta: ${email.received_time}`);
  parts.push(`Oggetto: ${email.subject || "(nessun oggetto)"}`);
  parts.push("");
  parts.push("Corpo:");
  parts.push(email.body_text || "(corpo vuoto)");
  parts.push("");

  parts.push("=== CLASSIFICAZIONE IRIS ===");
  parts.push(`Categoria: ${classification.category || "—"}`);
  parts.push(`Azione suggerita: ${classification.suggestedAction || "—"}`);
  parts.push(`Sentiment: ${classification.sentiment || "—"}`);
  if (classification.summary) parts.push(`Riassunto: ${classification.summary}`);
  const ents = classification.entities || {};
  const entLines = Object.entries(ents).filter(([, v]) => v).map(([k, v]) => `  - ${k}: ${v}`);
  if (entLines.length) {
    parts.push("Entità estratte:");
    parts.push(entLines.join("\n"));
  }
  parts.push("");

  if (similar && similar.length) {
    parts.push("=== CASI SIMILI STORICI (top 3) ===");
    similar.slice(0, 3).forEach((s, i) => {
      parts.push(`#${i + 1} (${s.date || "?"}, match=${s.matchKey || "?"}): ${s.summary || "—"}`);
      if (s.howHandled) {
        const h = s.howHandled;
        const bits = [];
        if (h.suggestedAction) bits.push(`azione=${h.suggestedAction}`);
        if (h.attentionStatus) bits.push(`stato=${h.attentionStatus}`);
        if (h.repliedInDays !== null && h.repliedInDays !== undefined) bits.push(`risposta in ${h.repliedInDays}gg`);
        if (bits.length) parts.push(`   gestione: ${bits.join(", ")}`);
      }
    });
    parts.push("");
  }

  if (lavagna && lavagna.length) {
    parts.push("=== MESSAGGI LAVAGNA CORRELATI ===");
    lavagna.forEach((m, i) => {
      parts.push(`#${i + 1} [${m.type}] ${m.from} → ${m.to} · stato=${m.status} · prio=${m.priority}`);
      if (m.payload) {
        try {
          parts.push(`   payload: ${JSON.stringify(m.payload).slice(0, 300)}`);
        } catch {}
      }
    });
    parts.push("");
  }

  parts.push("Scrivi ora una bozza di risposta in italiano, professionale e contestualizzata.");
  return parts.join("\n");
}

async function fetchLavagnaForEmail(messageId) {
  if (!messageId) return [];
  try {
    const snap = await db
      .collection("nexo_lavagna")
      .where("sourceEmailId", "==", messageId)
      .limit(10)
      .get();
    const out = [];
    snap.forEach((d) => {
      const data = d.data() || {};
      out.push({
        id: d.id,
        from: data.from,
        to: data.to,
        type: data.type,
        status: data.status,
        priority: data.priority,
        payload: data.payload,
      });
    });
    return out;
  } catch (e) {
    logger.warn("lavagna fetch failed", { error: String(e) });
    return [];
  }
}

async function callHaiku(apiKey, system, user) {
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

export const suggestReply = onRequest(
  {
    region: REGION,
    cors: false, // gestiamo CORS manualmente per controllare gli origin
    secrets: [ANTHROPIC_API_KEY],
    timeoutSeconds: 60,
    memory: "256MiB",
    maxInstances: 5,
  },
  async (req, res) => {
    applyCors(req, res);
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ error: "method_not_allowed" });
      return;
    }

    const ip = (req.headers["x-forwarded-for"] || req.ip || "")
      .toString()
      .split(",")[0]
      .trim();
    const rate = await checkRateLimit(ip);
    if (!rate.ok) {
      res.set("Retry-After", String(rate.retryAfterSeconds || 3600));
      res.status(429).json({ error: rate.reason });
      return;
    }

    const docId = (req.body || {}).docId;
    if (!docId || typeof docId !== "string") {
      res.status(400).json({ error: "missing_docId" });
      return;
    }

    let snap;
    try {
      snap = await db.collection("iris_emails").doc(docId).get();
    } catch (e) {
      logger.error("firestore read failed", { error: String(e), docId });
      res.status(500).json({ error: "firestore_read_failed" });
      return;
    }
    if (!snap.exists) {
      res.status(404).json({ error: "email_not_found" });
      return;
    }

    const data = snap.data() || {};
    const raw = data.raw || {};
    const classification = data.classification || {};
    const similar = Array.isArray(data.similarEmails) ? data.similarEmails : [];
    const lavagna = await fetchLavagnaForEmail(data.id || raw.message_id);

    const userPrompt = buildUserPrompt({
      email: raw,
      classification,
      similar,
      lavagna,
    });

    const apiKey = ANTHROPIC_API_KEY.value();
    if (!apiKey) {
      res.status(500).json({ error: "missing_anthropic_key" });
      return;
    }

    let result;
    try {
      result = await callHaiku(apiKey, SYSTEM_PROMPT, userPrompt);
    } catch (e) {
      logger.error("anthropic call failed", { error: String(e), docId });
      res.status(502).json({ error: "anthropic_failed", detail: String(e).slice(0, 300) });
      return;
    }

    res.status(200).json({
      docId,
      draft: result.text,
      model: MODEL,
      usage: result.usage,
      contextUsed: {
        similarCount: similar.length,
        lavagnaCount: lavagna.length,
        category: classification.category,
      },
    });
  }
);

// ─────────────────────────────────────────────────────────────────
//  NEXUS — interfaccia conversazionale
// ─────────────────────────────────────────────────────────────────

const NEXUS_RATE_COLLECTION = "iris_rate_nexus";
const NEXUS_MAX_PER_IP_PER_HOUR = 60;
const NEXUS_MAX_GLOBAL_PER_HOUR = 400;

const COLLEGHI_ROUTABLE = [
  "iris", "echo", "ares", "chronos", "memo",
  "charta", "emporion", "dikea", "delphi",
  "pharo", "calliope",
];
// Nessun Collega ha ancora un listener Lavagna per messaggi da NEXUS.
// Quando un Collega sarà attivo, aggiungerlo qui; NEXUS risponderà
// "in_attesa_collega" invece di "collega_inattivo".
const COLLEGHI_ATTIVI = new Set([]);
const VALID_COLLEGHI = new Set([...COLLEGHI_ROUTABLE, "nessuno", "multi"]);

const NEXUS_SYSTEM_PROMPT = `Sei NEXUS, l'interfaccia conversazionale di NEXO per ACG Clima Service (manutenzione HVAC, zona Alessandria/Voghera/Tortona).

L'utente ti parla in linguaggio naturale. Il tuo compito:
1. Capire cosa vuole.
2. Scegliere UN Collega competente.
3. Formulare azione + parametri per quel Collega.
4. Rispondere all'utente in italiano, 1-2 frasi.

COLLEGHI + AZIONI STANDARD (preferisci queste azioni quando possibile):
- iris       → email in arrivo
    azioni: cerca_email_urgenti, email_oggi, email_totali, email_senza_risposta,
            cerca_email_mittente, email_per_categoria
- echo       → uscita: sendWhatsApp, sendTelegram, sendEmail, sendPush
- ares       → interventi: interventi_aperti, apri_intervento, assegna_tecnico
- chronos    → pianificazione:
    azioni: scadenze_prossime, slot_tecnico, agenda_giornaliera
- memo       → dossier_cliente, storico_impianto
- charta     → amministrativo:
    azioni: fatture_scadute, incassi_oggi, report_mensile
- emporion   → magazzino:
    azioni: disponibilita (parametri: {codice, descrizione}), dov_si_trova
- dikea      → compliance:
    azioni: scadenze_curit, impianti_senza_targa, valida_dico
- delphi     → analisi:
    azioni: kpi_dashboard, costo_ai, margine_intervento
    IMPORTANTE: "come siamo andati" / "come va il mese" / "andamento" = kpi_dashboard
- pharo      → monitoring:
    azioni: stato_suite, problemi_aperti, controllo_heartbeat
    IMPORTANTE: "stato della suite" / "come sta il sistema" = stato_suite
- calliope   → content:
    azioni: bozza_risposta (parametri: {emailId, tono}), sollecito_pagamento
- nessuno    → saluti, chiarimenti

REGOLE:
- Rispondi SOLO con un oggetto JSON valido. Niente code fence, niente testo extra.
- Non inventare clienti, importi, condomini, date: chiedi chiarimento SOLO se ambiguo.
- Se la richiesta matcha un'azione standard sopra, USA ESATTAMENTE quella stringa.
- Azione in snake_case (es. "cerca_email_urgenti", "scadenze_curit").
- rispostaUtente: conversazionale, italiano, 1-2 frasi, MAI promettere "ti mostro" o "sto cercando" — il sistema risponde da solo, tu solo inoltri.

FORMATO OUTPUT:
{
  "collega": "<slug>",
  "azione": "<snake_case>",
  "parametri": { ... },
  "confidenza": 0.0-1.0,
  "rispostaUtente": "<1-2 frasi italiano>",
  "reasoning": "<1 frase debug>",
  "steps": [  // opzionale
    { "collega": "...", "azione": "...", "parametri": { ... } }
  ]
}`;

function extractJSON(text) {
  if (!text) return null;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fenced ? fenced[1].trim() : text.trim();
  const s = candidate.indexOf("{");
  const e = candidate.lastIndexOf("}");
  if (s === -1 || e === -1 || e <= s) return null;
  return candidate.slice(s, e + 1);
}

function parseAndValidateIntent(raw, userMessage) {
  const jsonStr = extractJSON(raw);
  if (!jsonStr) return fallbackIntent(`Non ho capito bene: "${userMessage}". Puoi riformulare?`);
  let obj;
  try { obj = JSON.parse(jsonStr); }
  catch { return fallbackIntent("Risposta dal modello non valida, riprova."); }

  const collegaRaw = String(obj.collega || "").toLowerCase().trim();
  const collega = VALID_COLLEGHI.has(collegaRaw) ? collegaRaw : "nessuno";
  const azione = String(obj.azione || "").trim() || "nessuna";
  const parametri = (obj.parametri && typeof obj.parametri === "object") ? obj.parametri : {};
  let confidenza = Number(obj.confidenza);
  if (!Number.isFinite(confidenza)) confidenza = 0;
  confidenza = Math.max(0, Math.min(1, confidenza));
  const rispostaUtente = String(obj.rispostaUtente || "").trim() || "Ho ricevuto, sto elaborando.";
  const reasoning = typeof obj.reasoning === "string" ? obj.reasoning : undefined;

  let steps;
  if (Array.isArray(obj.steps)) {
    steps = [];
    for (const s of obj.steps) {
      if (!s || typeof s !== "object") continue;
      const sColl = String(s.collega || "").toLowerCase();
      if (!COLLEGHI_ROUTABLE.includes(sColl)) continue;
      steps.push({
        collega: sColl,
        azione: String(s.azione || "nessuna"),
        parametri: (s.parametri && typeof s.parametri === "object") ? s.parametri : {},
      });
    }
    if (steps.length === 0) steps = undefined;
  }

  return { collega, azione, parametri, confidenza, rispostaUtente, reasoning, steps };
}

function fallbackIntent(rispostaUtente) {
  return {
    collega: "nessuno",
    azione: "chiarimento",
    parametri: {},
    confidenza: 0,
    rispostaUtente,
  };
}

async function checkNexusRateLimit(ip) {
  const bucket = hourBucket();
  const ipKey = ip ? ip.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60) : "unknown";
  const ipRef = db.collection(NEXUS_RATE_COLLECTION).doc(`${bucket}_${ipKey}`);
  const globalRef = db.collection(NEXUS_RATE_COLLECTION).doc(`${bucket}_GLOBAL`);
  const [ipSnap, globalSnap] = await Promise.all([ipRef.get(), globalRef.get()]);
  const ipCount = (ipSnap.data() || {}).count || 0;
  const globalCount = (globalSnap.data() || {}).count || 0;
  if (ipCount >= NEXUS_MAX_PER_IP_PER_HOUR) return { ok: false, reason: "rate_limit_ip" };
  if (globalCount >= NEXUS_MAX_GLOBAL_PER_HOUR) return { ok: false, reason: "rate_limit_global" };
  await Promise.all([
    ipRef.set({ count: FieldValue.increment(1), bucket, ip: ipKey, updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
    globalRef.set({ count: FieldValue.increment(1), bucket, updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
  ]);
  return { ok: true };
}

async function ensureNexusSession(sessionId, userId, previewText) {
  if (!sessionId) return null;
  const ref = db.collection("nexus_sessions").doc(sessionId);
  const snap = await ref.get();
  const now = FieldValue.serverTimestamp();
  if (!snap.exists) {
    await ref.set({
      id: sessionId,
      userId: userId || "alberto",
      stato: "attiva",
      messaggiCount: 0,
      inizioAt: now,
      ultimoMessaggioAt: now,
      primoMessaggioPreview: (previewText || "").slice(0, 140),
    });
  }
  return ref;
}

async function writeNexusMessage(sessionId, data) {
  const ref = db.collection("nexus_chat").doc();
  const now = FieldValue.serverTimestamp();
  await ref.set({
    id: ref.id,
    sessionId,
    timestamp: now,
    createdAt: now,
    ...data,
  });
  return ref.id;
}

// ─── Direct query handlers: NEXUS legge Firestore e risponde ────
//
// Finché i Colleghi non hanno un listener Lavagna, NEXUS risolve da sé
// tutto ciò che può essere fatto con una query su iris_emails /
// nexo_lavagna. Ogni handler riceve (parametri, ctx) e ritorna:
//   { content: string, data?: object }
// "content" è la stringa finale che va nella chat.
//
// Il router `tryDirectAnswer` fa il matching intent → handler. Se non
// match, ritorna null → si passa al fallback Lavagna.

const CATEGORIE_URGENTI_SET = new Set(["GUASTO_URGENTE", "PEC_UFFICIALE"]);

function fmtData(iso) {
  if (!iso) return "—";
  try {
    const d = typeof iso === "string" ? new Date(iso) : (iso.toDate ? iso.toDate() : iso);
    return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
  } catch { return "—"; }
}
function fmtDataOra(iso) {
  if (!iso) return "—";
  try {
    const d = typeof iso === "string" ? new Date(iso) : (iso.toDate ? iso.toDate() : iso);
    return d.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch { return "—"; }
}
function isToday(iso) {
  if (!iso) return false;
  try {
    const d = typeof iso === "string" ? new Date(iso) : (iso.toDate ? iso.toDate() : iso);
    const now = new Date();
    return d.getFullYear() === now.getFullYear()
      && d.getMonth() === now.getMonth()
      && d.getDate() === now.getDate();
  } catch { return false; }
}

async function fetchIrisEmails(limit = 200) {
  const snap = await db.collection("iris_emails")
    .orderBy("raw.received_time", "desc")
    .limit(limit)
    .get();
  const out = [];
  snap.forEach(doc => {
    const d = doc.data() || {};
    out.push({
      id: doc.id,
      subject: (d.raw || {}).subject || "(senza oggetto)",
      sender: (d.raw || {}).sender || "",
      senderName: (d.raw || {}).sender_name || "",
      received: (d.raw || {}).received_time || null,
      category: (d.classification || {}).category || "ALTRO",
      summary: (d.classification || {}).summary || "",
      entities: (d.classification || {}).entities || {},
      followup: d.followup || null,
    });
  });
  return out;
}

function emailLine(e, i) {
  const when = fmtData(e.received);
  const who = e.senderName || e.sender;
  return `${i + 1}. [${when}] ${who} — ${e.subject}`;
}

// ─── Handlers ───────────────────────────────────────────────────

async function handleContaEmailUrgenti() {
  const emails = await fetchIrisEmails(500);
  const urgenti = emails.filter(e => CATEGORIE_URGENTI_SET.has(e.category));
  if (!urgenti.length) return { content: "Nessuna email urgente al momento. 👍" };
  const sample = urgenti.slice(0, 5).map(emailLine).join("\n");
  const more = urgenti.length > 5 ? `\n…e altre ${urgenti.length - 5}.` : "";
  return {
    content: `Hai **${urgenti.length} email urgenti** (GUASTO_URGENTE + PEC_UFFICIALE):\n\n${sample}${more}`,
    data: { count: urgenti.length },
  };
}

async function handleEmailOggi() {
  const emails = await fetchIrisEmails(300);
  const oggi = emails.filter(e => isToday(e.received));
  if (!oggi.length) return { content: "Oggi non sono arrivate email indicizzate. 🙂" };
  const byCat = {};
  for (const e of oggi) byCat[e.category] = (byCat[e.category] || 0) + 1;
  const breakdown = Object.entries(byCat)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `  · ${k}: ${v}`).join("\n");
  const sample = oggi.slice(0, 5).map(emailLine).join("\n");
  return {
    content: `Oggi sono arrivate **${oggi.length} email**:\n\n${breakdown}\n\nUltime:\n${sample}`,
    data: { count: oggi.length, byCat },
  };
}

async function handleEmailTotali() {
  const emails = await fetchIrisEmails(500);
  return {
    content: `In totale ho indicizzato **${emails.length} email** (ultime 500 mostrate). La più recente è di ${fmtDataOra(emails[0]?.received)}.`,
    data: { count: emails.length },
  };
}

async function handleRicercaEmailMittente(parametri) {
  const query = String(
    parametri.mittente || parametri.sender || parametri.nome || parametri.from || "",
  ).trim().toLowerCase();
  if (!query) {
    return { content: "Mi manca il nome del mittente. Riprova specificando chi." };
  }
  const emails = await fetchIrisEmails(400);
  const match = emails.filter(e => {
    const bag = `${e.sender} ${e.senderName}`.toLowerCase();
    return bag.includes(query);
  });
  if (!match.length) {
    return { content: `Non trovo email da "${query}" nelle ultime 400.` };
  }
  const lines = match.slice(0, 8).map(emailLine).join("\n");
  const more = match.length > 8 ? `\n…e altre ${match.length - 8}.` : "";
  return {
    content: `Ho trovato **${match.length} email** da "${query}":\n\n${lines}${more}`,
    data: { count: match.length, query },
  };
}

async function handleEmailSenzaRisposta() {
  const emails = await fetchIrisEmails(500);
  const att = emails.filter(e => e.followup && e.followup.needsAttention);
  if (!att.length) return { content: "Tutte le email sono state gestite (nessuna in attesa >48h)." };
  const lines = att.slice(0, 10).map((e, i) => {
    const days = e.followup.daysWithoutReply || 0;
    const who = e.senderName || e.sender;
    return `${i + 1}. ⏰ ${days}g — ${who}: ${e.subject}`;
  }).join("\n");
  const more = att.length > 10 ? `\n…e altre ${att.length - 10}.` : "";
  return {
    content: `Hai **${att.length} email senza risposta da più di 48h**:\n\n${lines}${more}`,
    data: { count: att.length },
  };
}

async function handleEmailPerCategoria(parametri) {
  const wanted = String(parametri.categoria || "").toUpperCase().trim();
  const emails = await fetchIrisEmails(500);
  const groups = {};
  for (const e of emails) groups[e.category] = (groups[e.category] || 0) + 1;
  if (wanted && groups[wanted] !== undefined) {
    const match = emails.filter(e => e.category === wanted);
    const lines = match.slice(0, 8).map(emailLine).join("\n");
    return {
      content: `Categoria **${wanted}**: ${match.length} email.\n\n${lines}`,
      data: { count: match.length, categoria: wanted },
    };
  }
  const breakdown = Object.entries(groups)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `  · ${k}: ${v}`).join("\n");
  return {
    content: `Distribuzione email per categoria (ultime ${emails.length}):\n\n${breakdown}`,
    data: groups,
  };
}

// MEMO v0.2 — Dossier reale da COSMINA (garbymobile-f89ac) + Guazzotti TEC + iris_emails
//
// Sorgenti usate:
//   - garbymobile-f89ac / crm_clienti     (anagrafica)
//   - garbymobile-f89ac / cosmina_impianti (impianti CURIT, targhe, scadenze)
//   - garbymobile-f89ac / bacheca_cards    (interventi, listName=INTERVENTI)
//   - guazzotti-tec    / rti              (RTI Guazzotti)
//   - nexo-hub-15f2d   / iris_emails      (email correlate)
//
// Fuzzy match: toLowerCase + includes su bag di campi testuali.
// Il SA della Cloud Function ha già roles/datastore.user su entrambi i progetti
// (usato da ARES per bacheca_cards, da PHARO per rti).

function memoBag(data) {
  const parts = [];
  for (const v of Object.values(data || {})) {
    if (typeof v === "string") parts.push(v.toLowerCase());
    else if (typeof v === "number" || typeof v === "boolean") parts.push(String(v).toLowerCase());
  }
  return parts.join(" ");
}

function memoFormatDate(v) {
  if (!v) return "";
  try {
    const d = v.toDate ? v.toDate() : new Date(v);
    if (Number.isNaN(d.getTime())) return String(v).slice(0, 10);
    return d.toISOString().slice(0, 10);
  } catch {
    return String(v).slice(0, 10);
  }
}

async function handleMemoDossier(parametri, ctx) {
  const candidate =
    parametri.cliente || parametri.condominio || parametri.nome ||
    parametri.query || parametri.soggetto || parametri.target ||
    parametri.entita || parametri.entityName || parametri.name ||
    Object.values(parametri || {}).find(v => typeof v === "string" && v.trim().length > 0) ||
    "";
  let q = String(candidate).trim().toLowerCase();
  // Rimuovi articoli iniziali ("la bussola" → "bussola")
  q = q.replace(/^(il|la|lo|gli|le|i|condominio)\s+/, "").trim();
  if (!q) return { content: "Su quale cliente o condominio cerco? Dammi un nome." };

  const cosm = getCosminaDb();
  const gua = getGuazzottiDb();

  // ── Lanci parallelismo read
  const [clientiSnap, impiantiSnap, cardsSnap, rtiSnap, irisEmails] = await Promise.all([
    cosm.collection("crm_clienti").limit(700).get().catch(e => ({ _err: String(e) })),
    cosm.collection("cosmina_impianti").limit(500).get().catch(e => ({ _err: String(e) })),
    cosm.collection("bacheca_cards").where("listName", "==", "INTERVENTI").limit(400).get().catch(e => ({ _err: String(e) })),
    gua.collection("rti").limit(700).get().catch(e => ({ _err: String(e) })),
    fetchIrisEmails(500).catch(e => []),
  ]);

  const errors = [];
  if (clientiSnap._err) errors.push({ source: "crm_clienti", error: clientiSnap._err.slice(0, 120) });
  if (impiantiSnap._err) errors.push({ source: "cosmina_impianti", error: impiantiSnap._err.slice(0, 120) });
  if (cardsSnap._err) errors.push({ source: "bacheca_cards", error: cardsSnap._err.slice(0, 120) });
  if (rtiSnap._err) errors.push({ source: "guazzotti_rti", error: rtiSnap._err.slice(0, 120) });

  // ── Match clienti
  const clienti = [];
  if (clientiSnap.forEach) {
    clientiSnap.forEach(d => {
      const v = d.data() || {};
      if (memoBag(v).includes(q)) {
        clienti.push({
          id: d.id,
          nome: v.nome || v.ragione_sociale || v.denominazione || d.id,
          indirizzo: v.indirizzo || v.via || "",
          comune: v.comune || "",
          amministratore: v.amministratore || "",
          codice: v.codice || "",
          telefono: v.telefono || "",
          email: v.email || "",
        });
      }
    });
  }

  // ── Match impianti (per codice condominio/indirizzo/occupante)
  const impianti = [];
  if (impiantiSnap.forEach) {
    impiantiSnap.forEach(d => {
      const v = d.data() || {};
      if (memoBag(v).includes(q)) {
        impianti.push({
          id: d.id,
          codice: v.codice || "",
          targa: v.targa || "",
          indirizzo: v.indirizzo || "",
          occupante: v.occupante_cognome || "",
          combustibile: v.combustibile || "",
          scadenza: v.data_scadenza_dichiarazione || "",
          ritardo_manut: v.giorni_ritardo_manutenzione || 0,
          ditta: v.ditta_responsabile_cognome || "",
        });
      }
    });
  }

  // ── Match interventi (bacheca_cards)
  const interventi = [];
  if (cardsSnap.forEach) {
    cardsSnap.forEach(d => {
      const v = d.data() || {};
      if (memoBag(v).includes(q)) {
        let due;
        try { due = v.due ? (v.due.toDate ? v.due.toDate() : new Date(v.due)) : null; } catch {}
        interventi.push({
          id: d.id,
          name: v.name || "",
          stato: v.stato || "?",
          tecnico: v.techName || (Array.isArray(v.techNames) && v.techNames[0]) || "",
          boardName: v.boardName || "",
          due: due ? due.toISOString().slice(0, 10) : "",
          updated: memoFormatDate(v.updated_at),
          workDescription: (v.workDescription || v.desc || "").slice(0, 200),
        });
      }
    });
    interventi.sort((a, b) => (b.updated || "").localeCompare(a.updated || ""));
  }

  // ── Match RTI Guazzotti
  const rti = [];
  if (rtiSnap.forEach) {
    rtiSnap.forEach(d => {
      const v = d.data() || {};
      if (memoBag(v).includes(q)) {
        rti.push({
          numero_rti: v.numero_rti || d.id,
          data: memoFormatDate(v.data_intervento),
          stato: v.stato || "?",
          tipo: v.tipo || "?",
          tecnico: v.tecnico_intervento || v.tecnico || "",
          condominio: v.condominio || "",
          cliente: v.cliente || "",
          intervento: (v.intervento_effettuato || "").slice(0, 150),
          fatturabile: v.fatturabile,
        });
      }
    });
    rti.sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  }

  // ── Match email
  const emails = (irisEmails || []).filter(e => {
    const bag = [
      e.sender, e.senderName, e.subject, e.summary,
      e.entities && e.entities.cliente, e.entities && e.entities.condominio, e.entities && e.entities.indirizzo,
    ].filter(Boolean).join(" ").toLowerCase();
    return bag.includes(q);
  });

  // ── Costruisco dossier
  const sections = [];
  sections.push(`📇 **Dossier per "${q}"** (MEMO v0.2 — COSMINA + Guazzotti + email)`);
  sections.push("");

  // Anagrafica
  if (clienti.length) {
    sections.push(`**🏢 Anagrafica CRM** (${clienti.length} match):`);
    clienti.slice(0, 5).forEach(c => {
      sections.push(`  · **${c.nome}** [${c.codice || c.id}] — ${c.indirizzo}${c.comune ? ", " + c.comune : ""}`);
      if (c.amministratore) sections.push(`    Amministratore: ${c.amministratore}`);
      if (c.telefono) sections.push(`    Tel: ${c.telefono}`);
    });
    if (clienti.length > 5) sections.push(`  …e altri ${clienti.length - 5}.`);
  } else {
    sections.push(`**🏢 Anagrafica CRM**: nessun cliente diretto trovato.`);
  }
  sections.push("");

  // Impianti
  if (impianti.length) {
    sections.push(`**⚙️ Impianti CURIT** (${impianti.length}):`);
    impianti.slice(0, 5).forEach(i => {
      sections.push(`  · Targa ${i.targa} — ${i.indirizzo} — ${i.combustibile}`);
      if (i.occupante) sections.push(`    Occupante: ${i.occupante}`);
      if (i.ritardo_manut > 0) sections.push(`    ⚠️ ${i.ritardo_manut}g di ritardo manutenzione`);
      if (i.scadenza) sections.push(`    Scadenza dichiarazione: ${i.scadenza}`);
    });
    if (impianti.length > 5) sections.push(`  …e altri ${impianti.length - 5}.`);
  } else {
    sections.push(`**⚙️ Impianti**: nessuno trovato.`);
  }
  sections.push("");

  // Interventi
  if (interventi.length) {
    sections.push(`**🔧 Interventi (bacheca COSMINA)** — ultimi ${Math.min(interventi.length, 10)} di ${interventi.length}:`);
    interventi.slice(0, 10).forEach(it => {
      const t = it.tecnico ? ` · ${it.tecnico}` : "";
      const s = it.stato ? ` [${it.stato}]` : "";
      sections.push(`  · ${it.updated || it.due || "?"}${t}${s} — ${(it.name || "").slice(0, 80)}`);
      if (it.workDescription) sections.push(`    → ${it.workDescription.slice(0, 100)}`);
    });
  } else {
    sections.push(`**🔧 Interventi**: nessuno trovato sulla bacheca.`);
  }
  sections.push("");

  // RTI Guazzotti
  if (rti.length) {
    sections.push(`**📋 RTI/RTIDF Guazzotti TEC** (${rti.length}):`);
    rti.slice(0, 8).forEach(r => {
      const fat = r.fatturabile === false ? " [non fatturabile]" : "";
      sections.push(`  · ${r.numero_rti} (${r.tipo}) — ${r.data} — ${r.stato}${fat} · ${r.tecnico}`);
      if (r.intervento) sections.push(`    → ${r.intervento}`);
    });
    if (rti.length > 8) sections.push(`  …e altri ${rti.length - 8}.`);
  } else {
    sections.push(`**📋 RTI Guazzotti**: nessuno trovato.`);
  }
  sections.push("");

  // Email
  if (emails.length) {
    sections.push(`**📧 Email correlate** (${emails.length}):`);
    emails.slice(0, 5).forEach(e => sections.push(`  · ${emailLine(e)}`));
    if (emails.length > 5) sections.push(`  …e altre ${emails.length - 5}.`);
  } else {
    sections.push(`**📧 Email**: nessuna email correlata nelle ultime 500 indicizzate.`);
  }

  // Nessun risultato ovunque → messaggio esplicito
  const totalMatches = clienti.length + impianti.length + interventi.length + rti.length + emails.length;
  if (totalMatches === 0) {
    return {
      content:
        `📇 **Dossier per "${q}"** (MEMO v0.2)\n\n` +
        `Non ho trovato nulla su "${q}" nelle fonti disponibili:\n` +
        `  · crm_clienti (${clientiSnap.size || 0} docs)\n` +
        `  · cosmina_impianti (${impiantiSnap.size || 0} docs)\n` +
        `  · bacheca_cards interventi (${cardsSnap.size || 0} docs)\n` +
        `  · rti guazzotti (${rtiSnap.size || 0} docs)\n` +
        `  · iris_emails (${(irisEmails || []).length} docs)\n\n` +
        `Possibili cause:\n` +
        `  · Nome scritto diversamente (prova varianti)\n` +
        `  · È una persona e non un condominio/cliente\n` +
        `  · Cliente dismesso o non ancora caricato\n` +
        (errors.length ? `\n❌ Errori lettura: ${errors.map(e => e.source).join(", ")}` : ""),
      data: { query: q, totalMatches: 0, errors },
    };
  }

  if (errors.length) {
    sections.push("");
    sections.push(`❌ Errori lettura parziali: ${errors.map(e => e.source).join(", ")}`);
  }

  return {
    content: sections.join("\n"),
    data: {
      query: q,
      clienti: clienti.length, impianti: impianti.length,
      interventi: interventi.length, rti: rti.length, emails: emails.length,
      errors,
    },
  };
}

async function handleStatoLavagna() {
  const snap = await db.collection("nexo_lavagna")
    .orderBy("createdAt", "desc").limit(10).get();
  const rows = [];
  snap.forEach(d => {
    const v = d.data() || {};
    rows.push({
      from: v.from || "?",
      to: v.to || "?",
      type: v.type || "?",
      status: v.status || "?",
      priority: v.priority || "normal",
      createdAt: v.createdAt || null,
    });
  });
  if (!rows.length) return { content: "La Lavagna è vuota — nessun messaggio scambiato." };
  const lines = rows.map((r, i) =>
    `${i + 1}. ${r.from} → ${r.to} · ${r.type} [${r.status}]` +
    (r.priority !== "normal" ? ` prio:${r.priority}` : "")
  ).join("\n");
  return {
    content: `Ultimi **${rows.length} messaggi** sulla Lavagna:\n\n${lines}`,
    data: { count: rows.length },
  };
}

// ─── ARES — interventi (lettura COSMINA) ───────────────────────
//
// Legge bacheca_cards (listName=INTERVENTI, inBacheca=true) da
// garbymobile-f89ac. Il SA della Cloud Function potrebbe non avere
// `roles/datastore.user` su garbymobile-f89ac → in quel caso intercetto
// l'errore e rispondo con un placeholder utile invece di crashare.

let _cosminaApp = null;
function getCosminaDb() {
  if (_cosminaApp) return getFirestore(_cosminaApp);
  const existing = getApps().find((a) => a.name === "cosmina");
  if (existing) {
    _cosminaApp = existing;
    return getFirestore(_cosminaApp);
  }
  _cosminaApp = initializeApp({ projectId: "garbymobile-f89ac" }, "cosmina");
  return getFirestore(_cosminaApp);
}

let _guazzottiApp = null;
function getGuazzottiDb() {
  if (_guazzottiApp) return getFirestore(_guazzottiApp);
  const existing = getApps().find((a) => a.name === "guazzotti");
  if (existing) {
    _guazzottiApp = existing;
    return getFirestore(_guazzottiApp);
  }
  _guazzottiApp = initializeApp({ projectId: "guazzotti-tec" }, "guazzotti");
  return getFirestore(_guazzottiApp);
}

// ── Auth verifier: token emessi da garbymobile-f89ac (ACG Suite SSO) ───
// La primary app qui è nexo-hub-15f2d, ma i token utenti vengono da
// garbymobile-f89ac. Usiamo un'app admin dedicata per verificare.
let _acgAuthApp = null;
function getAcgAuthAdmin() {
  if (_acgAuthApp) return getAdminAuth(_acgAuthApp);
  const existing = getApps().find((a) => a.name === "acg-auth");
  if (existing) {
    _acgAuthApp = existing;
    return getAdminAuth(_acgAuthApp);
  }
  _acgAuthApp = initializeApp({ projectId: "garbymobile-f89ac" }, "acg-auth");
  return getAdminAuth(_acgAuthApp);
}

// Verifica Bearer token. Ritorna { uid, email } se valido, null altrimenti.
// Cache in-memory per evitare re-verifica su ogni request nello stesso cold start.
const _tokenCache = new Map(); // token → { decoded, exp }
async function verifyAcgIdToken(req) {
  const authHdr = String(req.headers["authorization"] || req.headers["Authorization"] || "");
  const m = authHdr.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const token = m[1].trim();
  // Cache check (token valido ≤1h → cache 10 min)
  const cached = _tokenCache.get(token);
  if (cached && cached.exp > Date.now()) return cached.decoded;
  try {
    const decoded = await getAcgAuthAdmin().verifyIdToken(token);
    const result = { uid: decoded.uid, email: decoded.email || null, claims: decoded };
    _tokenCache.set(token, { decoded: result, exp: Date.now() + 10 * 60 * 1000 });
    // Purge cache se troppo grande
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

async function handleAresInterventiAperti(parametri) {
  const limit = Math.min(Number(parametri.limit) || 20, 50);
  const tecnicoFilter = String(parametri.tecnico || "").trim().toLowerCase();
  const oggiFlag = /oggi|today|giorno/.test(JSON.stringify(parametri).toLowerCase());

  let snap;
  try {
    let q = getCosminaDb().collection("bacheca_cards")
      .where("listName", "==", "INTERVENTI")
      .where("inBacheca", "==", true)
      .limit(limit * 3); // overfetch per filtri client-side
    snap = await q.get();
  } catch (e) {
    const msg = String(e?.message || e);
    if (/permission|denied|UNAUTHENTICATED|403/i.test(msg)) {
      return {
        content:
          `ARES non riesce a leggere COSMINA dalla Cloud Function: il Service ` +
          `Account non ha ancora i permessi cross-progetto su garbymobile-f89ac. ` +
          `Per attivare:\n\n  gcloud projects add-iam-policy-binding garbymobile-f89ac \\\n` +
          `    --member=serviceAccount:272099489624-compute@developer.gserviceaccount.com \\\n` +
          `    --role=roles/datastore.user`,
      };
    }
    throw e;
  }

  const items = [];
  snap.forEach((d) => {
    const data = d.data() || {};
    const stato = String(data.stato || "").toLowerCase();
    if (stato.includes("complet") || stato.includes("annul")) return;
    let tecnico = data.techName;
    if (!tecnico && Array.isArray(data.techNames) && data.techNames.length) {
      tecnico = String(data.techNames[0]);
    }
    if (tecnicoFilter && !String(tecnico || "").toLowerCase().includes(tecnicoFilter)) return;

    let due;
    if (data.due) {
      try {
        const v = data.due.toDate ? data.due.toDate() : new Date(data.due);
        if (!Number.isNaN(v.getTime())) due = v;
      } catch {}
    }
    if (oggiFlag && due) {
      const today = new Date();
      const sameDay = due.getFullYear() === today.getFullYear()
        && due.getMonth() === today.getMonth()
        && due.getDate() === today.getDate();
      if (!sameDay) return;
    }
    items.push({
      id: d.id,
      condominio: data.boardName || "?",
      stato: stato || "aperto",
      tecnico: tecnico || "-",
      due,
      name: data.name || "(senza titolo)",
    });
  });

  // Ordina per data crescente (i scaduti prima)
  items.sort((a, b) => {
    if (!a.due) return 1;
    if (!b.due) return -1;
    return a.due.getTime() - b.due.getTime();
  });
  const top = items.slice(0, limit);

  if (!top.length) {
    return { content: oggiFlag
      ? "Nessun intervento programmato per oggi."
      : "Non ho trovato interventi attivi nella bacheca COSMINA." };
  }

  const lines = top.map((i, idx) => {
    const data = i.due ? i.due.toLocaleDateString("it-IT") : "n.d.";
    const tag = i.tecnico !== "-" ? `tecnico=${i.tecnico}` : "non assegnato";
    return `${idx + 1}. [${data}] ${i.condominio.slice(0, 50)} — ${i.stato} · ${tag}`;
  }).join("\n");

  const header = oggiFlag
    ? `🔧 Interventi di **oggi** (${top.length}):`
    : `🔧 **${top.length}** interventi attivi su COSMINA${items.length > top.length ? ` (mostro i primi ${top.length} di ${items.length})` : ""}:`;
  return { content: `${header}\n\n${lines}`, data: { count: top.length } };
}

// ─── CHARTA — registra incasso (scrittura charta_pagamenti) ────
//
// DRY_RUN di default. Legge flag da cosmina_config/charta_config.dry_run.
// Salvataggio su nexo-hub collection `charta_pagamenti`.

async function isChartaDryRun() {
  try {
    const snap = await getCosminaDb().collection("cosmina_config").doc("charta_config").get();
    if (snap.exists && typeof (snap.data() || {}).dry_run === "boolean") {
      return snap.data().dry_run;
    }
  } catch {}
  return true;
}

async function handleChartaRegistraIncasso(parametri, ctx) {
  const msg = String(ctx?.userMessage || "");
  const importoParam = parametri.importo || parametri.amount;
  const controparteParam = parametri.cliente || parametri.controparte || parametri.da;

  // Parse da prompt naturale: "registra incasso 500 euro da Condominio Kristal"
  let importo = typeof importoParam === "number" ? importoParam : parseFloat(String(importoParam || "").replace(",", "."));
  let controparte = String(controparteParam || "").trim();

  if (!Number.isFinite(importo) || importo <= 0) {
    // Regex importo: "500 euro" | "€ 500" | "500,50"
    const m = /(\d+(?:[.,]\d{1,2})?)\s*(?:euro|eur|€)/i.exec(msg) || /(?:euro|eur|€)\s*(\d+(?:[.,]\d{1,2})?)/i.exec(msg);
    if (m) importo = parseFloat(m[1].replace(",", "."));
  }

  if (!controparte) {
    // "da [Nome ...]"
    const m = /\bda\s+(?:condominio\s+|cond\.\s+|cliente\s+)?([A-Za-zÀ-ÿ][\wÀ-ÿ.\s'\-]{2,60})/i.exec(msg);
    if (m) controparte = m[1].trim();
  }

  if (!Number.isFinite(importo) || importo <= 0) {
    return { content: "💰 Mi manca l'importo. Es. \"registra incasso 500 euro da Condominio Kristal\"." };
  }
  if (!controparte) {
    return { content: "💰 Mi manca il nome del cliente/condominio. Es. \"registra incasso 500 da Kristal\"." };
  }

  const id = "inc_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6);
  const record = {
    id,
    direzione: "in",
    controparteId: "unknown",
    controparteNome: controparte,
    importo,
    data: new Date().toISOString(),
    metodo: String(parametri.metodo || "bonifico"),
    causale: parametri.causale || undefined,
    fonte: "nexus",
    sourceSessionId: parametri.sessionId,
    createdAt: FieldValue.serverTimestamp(),
  };

  const dry = await isChartaDryRun();
  if (dry) {
    // Mirror solo su nexo-hub con flag DRY
    try {
      await db.collection("charta_pagamenti").doc(id).set({ ...record, _dryRun: true });
    } catch (e) {
      logger.error("charta dry_run mirror failed", { error: String(e) });
    }
    return {
      content:
        `💰 Incasso **simulato** (CHARTA DRY_RUN)\n\n` +
        `  · Da: **${controparte}**\n` +
        `  · Importo: € ${importo.toFixed(2)}\n` +
        `  · Metodo: ${record.metodo}\n\n` +
        `ID: \`${id}\`. Per salvare davvero, imposta \`cosmina_config/charta_config.dry_run = false\`.`,
      data: { id, dryRun: true },
    };
  }

  try {
    await db.collection("charta_pagamenti").doc(id).set(record);
    return {
      content:
        `✅ Incasso **registrato**\n\n` +
        `  · Da: **${controparte}**\n` +
        `  · Importo: € ${importo.toFixed(2)}\n` +
        `  · Metodo: ${record.metodo}\n\n` +
        `ID: \`${id}\``,
      data: { id, dryRun: false },
    };
  } catch (e) {
    return { content: `❌ CHARTA: scrittura fallita. ${String(e?.message || e).slice(0, 200)}` };
  }
}

// ─── ARES — apertura intervento (scrittura bacheca_cards) ──────
//
// DRY_RUN di default via cosmina_config/ares_config.dry_run.
// In DRY_RUN: mirror su nexo-hub ares_interventi con _dryRun=true, niente
// scrittura su COSMINA.
// In modalità reale: crea doc in bacheca_cards con listName=INTERVENTI.

async function isAresDryRun() {
  try {
    const snap = await getCosminaDb().collection("cosmina_config").doc("ares_config").get();
    if (snap.exists && typeof (snap.data() || {}).dry_run === "boolean") {
      return snap.data().dry_run;
    }
  } catch {}
  return true; // default safe
}

function aresIntId() {
  return "int_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

/**
 * Apre un intervento: estrae tipo/urgenza/note dal prompt + parametri.
 * In DRY-RUN: dummy su nexo-hub.ares_interventi con _dryRun=true.
 * In reale: scrive su COSMINA bacheca_cards (listName=INTERVENTI).
 */
async function handleAresApriIntervento(parametri, ctx) {
  const msg = String(ctx?.userMessage || "").toLowerCase();

  // Estrai info: condominio/indirizzo, tipo, urgenza, note
  let condominio = String(
    parametri.condominio || parametri.cliente || parametri.indirizzo || parametri.dove || "",
  ).trim();
  const note = String(
    parametri.note || parametri.descrizione || parametri.problema || parametri.testo || "",
  ).trim();
  const tipoRaw = String(parametri.tipo || "").toLowerCase();
  const urgenzaRaw = String(parametri.urgenza || parametri.priorità || parametri.priority || "").toLowerCase();

  // Fallback: regex su messaggio. "apri intervento [tipo] [a|per|presso] [dove] ..."
  if (!condominio && msg) {
    const m = /(?:presso|per|al|alla|a|da)\s+(?:condominio\s+|condom\.\s+)?([A-Za-zÀ-ÿ][\w\sÀ-ÿ.,'\-]{2,60}?)(?:\s+(?:urgente|normale|subito|per|con|in|entro|per|$)|$)/i.exec(msg);
    if (m) condominio = m[1].trim();
  }

  // Tipo intervento: inferisci da keyword
  let tipo = "manutenzione";
  if (tipoRaw.includes("ripar") || /ripar|guast/i.test(msg)) tipo = "riparazione";
  else if (tipoRaw.includes("install") || /install/i.test(msg)) tipo = "installazione";
  else if (tipoRaw.includes("sopral") || /sopral/i.test(msg)) tipo = "sopralluogo";

  // Urgenza
  let urgenza = "media";
  if (urgenzaRaw.includes("critic") || /critic|immediat|subito/i.test(msg)) urgenza = "critica";
  else if (urgenzaRaw.includes("alta") || urgenzaRaw === "high" || /urgent|priorit/i.test(msg)) urgenza = "alta";
  else if (urgenzaRaw.includes("bass") || /non.*urgent|basso|flessibil/i.test(msg)) urgenza = "bassa";

  if (!condominio) {
    return {
      content: "🔧 Per aprire un intervento mi serve il condominio/indirizzo.\n\n" +
        "Es. \"apri intervento riparazione caldaia al Condominio Kristal urgente\"",
    };
  }

  const id = aresIntId();
  const now = new Date().toISOString();
  const dry = await isAresDryRun();

  const cardName = (note || `${tipo} ${urgenza}`).slice(0, 80);
  const labels = [`tipo:${tipo}`, `urgenza:${urgenza}`, "source:nexus"];
  if (urgenza === "critica" || urgenza === "alta") labels.push("URGENTE");

  if (dry) {
    // Mirror su nexo-hub per diagnosi (db = Firestore nexo-hub nell'index.js)
    try {
      await db.collection("ares_interventi").doc(id).set({
        id,
        condominio, tipo, urgenza, note,
        stato: "aperto",
        source: "nexus",
        _dryRun: true,
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (e) {
      logger.error("ares mirror failed", { error: String(e) });
    }
    return {
      content:
        `📝 Intervento **simulato** (ARES DRY_RUN)\n\n` +
        `  · Condominio: **${condominio}**\n` +
        `  · Tipo: ${tipo}\n` +
        `  · Urgenza: ${urgenza}${urgenza !== "media" ? " ⚠️" : ""}\n` +
        (note ? `  · Note: ${note}\n` : "") +
        `\nID: \`${id}\`. Per scrivere davvero su COSMINA, imposta \`cosmina_config/ares_config.dry_run = false\`.`,
      data: { id, dryRun: true },
    };
  }

  // Scrittura reale su COSMINA bacheca_cards
  try {
    const cosmDb = getCosminaDb();
    const ref = cosmDb.collection("bacheca_cards").doc();
    await ref.set({
      name: cardName,
      boardName: condominio,
      desc: note || undefined,
      workDescription: note || undefined,
      listName: "INTERVENTI",
      inBacheca: true,
      archiviato: false,
      stato: "aperto",
      labels,
      source: "nexus_ares",
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    // Mirror su nexo-hub per audit
    try {
      await db.collection("ares_interventi").doc(ref.id).set({
        id: ref.id, cosmina_doc_id: ref.id,
        condominio, tipo, urgenza, note,
        stato: "aperto", source: "nexus",
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch {}

    return {
      content:
        `✅ Intervento **creato** su COSMINA\n\n` +
        `  · Condominio: **${condominio}**\n` +
        `  · Tipo: ${tipo} · Urgenza: ${urgenza}\n` +
        (note ? `  · Note: ${note}\n` : "") +
        `\nID: \`${ref.id}\` · Visibile nella bacheca interventi.`,
      data: { id: ref.id, cosminaDocId: ref.id, dryRun: false },
    };
  } catch (e) {
    const errMsg = String(e?.message || e).slice(0, 200);
    if (/permission|denied|403/i.test(errMsg)) {
      return { content: `❌ ARES non può scrivere su COSMINA: permessi insufficienti. ${errMsg}` };
    }
    return { content: `❌ ARES: scrittura fallita. ${errMsg}` };
  }
}

// ─── ECHO — invio WhatsApp via Waha ────────────────────────────
//
// Safety model (nuova versione senza whitelist statica):
//   1. ECHO_DRY_RUN (default true da Firestore cosmina_config/echo_config.dry_run)
//      → nessun invio reale, solo simulazione.
//   2. Lookup MEMO/CRM: il destinatario ("Alberto", "Malvicino", "Kristal"…) deve
//      essere trovato in una fonte autorevole:
//        · cosmina_config/tecnici_acg.tecnici[] (se ha campo telefono/whatsapp)
//        · cosmina_config/numeri_acg (mappa { alias → numero } curata da Alberto)
//        · cosmina_contatti_clienti (CRM clienti)
//      Se nessuna fonte restituisce un numero → rifiuto con messaggio "non trovato".
//   3. Numeri grezzi dal prompt (es. "3339999999") NON sono accettati:
//      i messaggi si possono mandare SOLO a entità presenti nel CRM.
//
// Niente PII nel codice: tutto da Firestore.

async function loadEchoConfig() {
  try {
    const snap = await getCosminaDb().collection("cosmina_config").doc("echo_config").get();
    return snap.exists ? (snap.data() || {}) : {};
  } catch (e) {
    logger.warn("echo config load failed", { error: String(e) });
    return {};
  }
}

async function loadWahaConfigFromCosmina() {
  try {
    const snap = await getCosminaDb().collection("cosmina_config").doc("whatsapp").get();
    if (!snap.exists) return null;
    const d = snap.data() || {};
    return {
      url: String(d.waha_url || "").replace(/\/$/, ""),
      session: String(d.waha_session || "default"),
      apiKey: d.waha_api_key || d.waha_secret || null,
      enabled: d.enabled !== false,
    };
  } catch (e) {
    logger.error("waha config load failed", { error: String(e) });
    return null;
  }
}

function normalizeWhatsappChatId(input) {
  let clean = String(input || "")
    .replace(/[\s\-()/.]/g, "")
    .replace(/^@/, "")
    .replace(/@(c\.us|s\.whatsapp\.net|lid)$/i, "");
  if (clean.startsWith("+")) clean = clean.slice(1);
  if (clean.length === 10 && clean.startsWith("3")) clean = "39" + clean;
  if (clean.startsWith("3939") && clean.length >= 14) clean = clean.slice(2);
  if (!/^\d{10,15}$/.test(clean)) return null;
  return `${clean}@c.us`;
}

function maskNumber(chatId) {
  // Maschera numero per output user-facing: 393331234567@c.us → +393****4567
  const m = /^(\d+)@/.exec(chatId || "");
  if (!m) return "???";
  const n = m[1];
  if (n.length < 6) return `+${n.slice(0, 2)}***`;
  return `+${n.slice(0, 3)}***${n.slice(-4)}`;
}

// Tokenizza il campo "nome" della rubrica COSMINA.
// Schema reale misto: "DELLAFIORE VICTOR" o "ALBERTO CONTARDI". Normalizzo a
// set di token minuscoli per matching per parole intere (case-insensitive,
// accent-insensitive).
function tokenize(s) {
  return String(s || "")
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")   // rimuovi accenti (Davì → Davi)
    .toLowerCase()
    .split(/[\s,._\-]+/)
    .filter(Boolean);
}

// Matching per parole intere: tutti i token della query devono essere
// token del nome. Evita che "davi" matchi "david".
function matchesAllTokens(queryTokens, nameTokens) {
  if (!queryTokens.length) return false;
  const nameSet = new Set(nameTokens);
  return queryTokens.every(t => nameSet.has(t));
}

// Formatta "DELLAFIORE VICTOR" → "Victor Dellafiore" (assumo 2 token: cognome nome),
// "ALBERTO CONTARDI" → "Alberto Contardi" se il primo token è nome.
// Euristica: lascio com'è in Title Case, non serve riordinare per display.
function prettyName(s) {
  return String(s || "")
    .split(/\s+/).filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Risolutore destinatari via rubrica interna COSMINA.
 *
 * Fonti in ordine di priorità:
 *  1. cosmina_contatti_interni — rubrica reale ACG/Guazzotti (34 contatti
 *     con nome, telefono_personale, telefono_lavoro, categoria, interno).
 *     Schema: { nome, telefono_personale, telefono_lavoro, email, categoria,
 *               interno, origine }.
 *     Matching per parole intere (token), disambigua se più match.
 *     Preferenza numero: telefono_personale > telefono_lavoro.
 *  2. cosmina_contatti_clienti — solo se NESSUN match interno (nemmeno ambiguo).
 *
 * Ritorna:
 *  - { chatId, resolvedFrom, displayName } → match unico con telefono
 *  - { error: "ambiguo", candidates: [...] } → più match interni
 *  - { partial, matchedEntity } → match unico senza telefono
 *  - { error: "non_trovato" } → nessuno
 */
async function resolveDestinatarioViaMemo(rawInput) {
  if (!rawInput) return { error: "destinatario_mancante" };
  const clean = String(rawInput).trim().replace(/^@/, "");
  const queryTokens = tokenize(clean);
  if (!queryTokens.length) return { error: "destinatario_mancante" };
  const db = getCosminaDb();

  // ── 1. Rubrica interni (cosmina_contatti_interni)
  let internalCandidates = [];
  try {
    const snap = await db.collection("cosmina_contatti_interni").limit(500).get();
    snap.forEach(doc => {
      const data = doc.data() || {};
      const nome = data.nome;
      if (!nome) return;
      const nameTokens = tokenize(nome);
      if (!matchesAllTokens(queryTokens, nameTokens)) return;
      internalCandidates.push({
        id: doc.id,
        nome: prettyName(nome),
        rawNome: nome,
        tel_personale: data.telefono_personale || null,
        tel_lavoro: data.telefono_lavoro || null,
        email: data.email || null,
        categoria: data.categoria || null,
        interno: data.interno || null,
      });
    });
  } catch (e) {
    logger.warn("cosmina_contatti_interni lookup failed", { error: String(e) });
  }

  if (internalCandidates.length === 1) {
    const c = internalCandidates[0];
    const tel = c.tel_personale || c.tel_lavoro;
    if (tel) {
      const chat = normalizeWhatsappChatId(tel);
      if (chat) return {
        chatId: chat,
        resolvedFrom: "cosmina_contatti_interni",
        displayName: c.nome,
        telSource: c.tel_personale ? "personale" : "lavoro",
      };
    }
    return { partial: true, matchedEntity: c.nome, isInterno: true };
  }

  if (internalCandidates.length > 1) {
    // Disambigua: mostra tutti i match interni con info utile
    return {
      error: "ambiguo_interni",
      candidates: internalCandidates.map(c => ({
        nome: c.nome,
        categoria: c.categoria,
        haCellulare: !!c.tel_personale,
        haTelLavoro: !!c.tel_lavoro,
      })),
    };
  }

  // ── 2. CRM clienti (solo se la rubrica interni non ha match)
  try {
    const snap = await db.collection("cosmina_contatti_clienti").limit(500).get();
    const candidates = [];
    snap.forEach(doc => {
      const data = doc.data() || {};
      const nome = String(data.nome_completo || `${data.nome || ""} ${data.cognome || ""}`).trim();
      if (!nome) return;
      const nameTokens = tokenize(nome);
      if (!matchesAllTokens(queryTokens, nameTokens)) return;
      const tel = data.telefono_normalizzato || data.telefono;
      if (tel) candidates.push({ nome, tel });
    });
    if (candidates.length === 1) {
      const chat = normalizeWhatsappChatId(candidates[0].tel);
      if (chat) return {
        chatId: chat,
        resolvedFrom: "cosmina_contatti_clienti",
        displayName: candidates[0].nome,
      };
    }
    if (candidates.length > 1) {
      return {
        error: "ambiguo_clienti",
        candidates: candidates.slice(0, 5).map(c => ({ nome: c.nome })),
      };
    }
  } catch (e) {
    logger.warn("contatti_clienti lookup failed", { error: String(e) });
  }

  return { error: "non_trovato" };
}

function isEchoDryRun(cfg) {
  // Priorità: Firestore flag → env var → default true (sicuro)
  if (cfg && typeof cfg.dry_run === "boolean") return cfg.dry_run;
  const v = (process.env.ECHO_DRY_RUN ?? process.env.DRY_RUN ?? "true").toLowerCase();
  return v === "true";
}

async function persistEchoMessage(msg) {
  try {
    await db.collection("echo_messages").doc(msg.id).set({
      ...msg,
      _serverTime: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    logger.error("persistEchoMessage failed", { error: String(e) });
  }
}

function echoMsgId() {
  return "wa_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

async function handleEchoWhatsApp(parametri, ctx) {
  // Estrai destinatario + corpo dal modello o dal messaggio utente.
  const msg = (ctx?.userMessage || "").trim();
  let dest = String(parametri.to || parametri.destinatario || parametri.a || parametri.numero || "").trim();
  let body = String(parametri.body || parametri.testo || parametri.messaggio || parametri.text || "").trim();

  // Fallback: parser regex su userMessage.
  //   Pattern: "whatsapp a X: testo" | "manda whatsapp a X testo..."
  if ((!dest || !body) && msg) {
    const m1 = /(?:whatsapp|wa|messaggio|whats'?app)\s+(?:a|per|al)\s+([^\s:,]+(?:\s+[^\s:,]+)?)\s*[:,]\s*(.+)$/i.exec(msg);
    if (m1) {
      if (!dest) dest = m1[1].trim();
      if (!body) body = m1[2].trim();
    } else {
      const m2 = /(?:whatsapp|wa|messaggio)\s+(?:a|per|al)\s+([^\s:,]+)\s+(.+)$/i.exec(msg);
      if (m2) {
        if (!dest) dest = m2[1].trim();
        if (!body) body = m2[2].trim();
      }
    }
  }

  if (!dest) return { content: "Mi manca il destinatario. Prova: 'manda whatsapp a Malvicino: testo'." };
  if (!body) return { content: "Mi manca il testo del messaggio." };
  if (body.length > 2000) return { content: "Testo troppo lungo (max 2000 caratteri)." };

  // Niente numeri grezzi: un numero che NON è un nome/alias noto viene
  // rifiutato. La sicurezza è "solo contatti del CRM".
  if (/^\+?\d{9,15}$/.test(dest.replace(/[\s\-()]/g, ""))) {
    return {
      content:
        `🚫 ECHO rifiuta numeri grezzi dal prompt per sicurezza.\n\n` +
        `Indica il destinatario per NOME (tecnico, cliente, condominio).\n` +
        `Es. "manda whatsapp a Malvicino: ..." — cercherò il numero in COSMINA.`,
    };
  }

  const cfg = await loadEchoConfig();
  const resolved = await resolveDestinatarioViaMemo(dest);

  // Ordine: partial (trovato ma senza numero) → error → chatId valido
  if (resolved.partial && !resolved.chatId) {
    return {
      content: `⚠️ Trovato "${resolved.matchedEntity}" nella rubrica interna ma senza cellulare.\n\n` +
        `Aggiungi \`telefono_personale\` o \`telefono_lavoro\` in \`cosmina_contatti_interni\` su garbymobile-f89ac.`,
    };
  }
  if (resolved.error) {
    if (resolved.error === "ambiguo_interni") {
      const list = resolved.candidates.map(c => {
        const tel = c.haCellulare ? "📱" : (c.haTelLavoro ? "☎️" : "❌");
        return `  ${tel} **${c.nome}** (${c.categoria || "?"})`;
      }).join("\n");
      return {
        content: `🔍 Trovo ${resolved.candidates.length} contatti con nome "${dest}":\n\n${list}\n\n` +
          `Specifica nome + cognome. Es. "manda whatsapp a Andrea Malvicino: ...".`,
      };
    }
    if (resolved.error === "ambiguo_clienti") {
      return {
        content: `🔍 Trovo ${resolved.candidates.length} clienti con nome "${dest}":\n\n` +
          resolved.candidates.map(c => `  · ${c.nome}`).join("\n") +
          `\n\nSpecifica meglio (nome + cognome).`,
      };
    }
    if (resolved.error === "non_trovato") {
      return {
        content: `❓ Non trovo "${dest}" né nella rubrica interna (\`cosmina_contatti_interni\`) né nei clienti (\`cosmina_contatti_clienti\`).\n\n` +
          `Verifica che il nome sia corretto e che il contatto abbia un telefono popolato.`,
      };
    }
    return { content: `ECHO: ${resolved.error}` };
  }
  if (!resolved.chatId) {
    return { content: `ECHO: risoluzione destinatario fallita senza errore noto (interno).` };
  }

  const chatId = resolved.chatId;
  const id = echoMsgId();
  const now = new Date().toISOString();
  const baseMsg = {
    id, channel: "whatsapp", to: chatId, body,
    priority: "normal", status: "queued",
    createdAt: now, updatedAt: now, attempts: 0,
    source: "nexus", resolvedFrom: resolved.resolvedFrom,
    destDisplayName: resolved.displayName,
    sessionId: parametri.sessionId,
  };

  // DRY-RUN: simula (flag da Firestore cosmina_config/echo_config.dry_run)
  if (isEchoDryRun(cfg)) {
    await persistEchoMessage({ ...baseMsg, status: "skipped", failedReason: "ECHO_DRY_RUN attivo" });
    const telLabel = resolved.telSource ? ` [${resolved.telSource}]` : "";
    return {
      content:
        `📤 Simulato: WA a **${resolved.displayName}** (${maskNumber(chatId)})${telLabel}\n` +
        `— ${body}\n\n` +
        `_Fonte: ${resolved.resolvedFrom} · DRY_RUN attivo, nessun invio reale._`,
      data: { dryRun: true, id, resolvedFrom: resolved.resolvedFrom },
    };
  }

  // Invio reale via Waha
  const waha = await loadWahaConfigFromCosmina();
  if (!waha || !waha.url) {
    await persistEchoMessage({ ...baseMsg, status: "failed", failedReason: "waha_config_missing" });
    return { content: "ECHO: config Waha mancante in `cosmina_config/whatsapp`." };
  }
  if (waha.enabled === false) {
    await persistEchoMessage({ ...baseMsg, status: "skipped", failedReason: "waha_disabled" });
    return { content: "ECHO: Waha è disabilitato (`cosmina_config/whatsapp.enabled=false`)." };
  }

  const headers = { "Content-Type": "application/json" };
  if (waha.apiKey) headers["X-Api-Key"] = waha.apiKey;
  const url = `${waha.url}/api/sendText`;
  const payload = JSON.stringify({ chatId, text: body, session: waha.session });

  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    baseMsg.attempts = attempt;
    try {
      const resp = await fetch(url, { method: "POST", headers, body: payload });
      const txt = await resp.text().catch(() => "");
      if (resp.ok) {
        await persistEchoMessage({
          ...baseMsg, status: "sent",
          sentAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        return {
          content:
            `✅ WA inviato a **${resolved.displayName}** (${maskNumber(chatId)})\n` +
            `— ${body}\n\n` +
            `_Fonte contatto: ${resolved.resolvedFrom} · ID: \`${id}\`_`,
          data: { id, sent: true, resolvedFrom: resolved.resolvedFrom },
        };
      }
      lastErr = `HTTP ${resp.status}: ${txt.slice(0, 200)}`;
      if (resp.status < 500) break;
    } catch (e) {
      lastErr = e?.message || String(e);
    }
    if (attempt < 2) await new Promise(r => setTimeout(r, 800));
  }

  await persistEchoMessage({ ...baseMsg, status: "failed", failedReason: lastErr });
  return { content: `❌ ECHO: invio fallito. ${lastErr || "errore sconosciuto"}` };
}

// ─── CALLIOPE — bozze via Claude Sonnet ────────────────────────
//
// DRY_RUN di default: la bozza NON viene inviata. Viene salvata in
// `calliope_bozze` con stato "in_revisione" per approvazione umana.

const CALLIOPE_MODEL = "claude-sonnet-4-6";
const CALLIOPE_SYSTEM_PROMPT = `Sei l'assistente di Alberto Contardi, titolare di ACG Clima Service (manutenzione HVAC, Piemonte). Scrivi bozze email professionali in italiano.

REGOLE:
- Tono cordiale ma professionale, conciso. Non smielato.
- Italiano corretto, niente anglicismi inutili.
- Non inventare fatti, importi, date o appuntamenti non presenti nel contesto.
- Se mancano informazioni cruciali, chiedile esplicitamente nella bozza.
- Firma con "Cordiali saluti,\\nAlberto Contardi\\nACG Clima Service".

OUTPUT: solo il testo della bozza. Niente preambolo, niente markdown. Max 1500 caratteri.`;

async function handleCalliopeBozza(parametri, ctx) {
  const emailId = String(parametri.emailId || parametri.id || "").trim();
  const tono = String(parametri.tono || parametri.tone || "cordiale").trim();
  const note = String(parametri.note || parametri.istruzioni || "").trim();

  if (emailId && /^[A-Za-z0-9_-]{10,}$/.test(emailId)) {
    return generaBozzaFromEmail(emailId, tono, note);
  }

  // Cerca per mittente: nei parametri + userMessage
  let query = String(
    parametri.mittente || parametri.email || parametri.destinatario || parametri.a || parametri.to || "",
  ).trim();
  if (!query && ctx?.userMessage) {
    // Pattern: "risposta a X", "bozza a X", "a Nome Cognome"
    const m = /(?:a|per|rispondi(?:amo)?\s+a|bozza\s+a|scrivi.*a)\s+([A-Za-zÀ-ÿ][\wÀ-ÿ.\s]{2,50})$/i.exec(ctx.userMessage.trim());
    if (m) query = m[1].trim();
  }
  if (!query) {
    return { content: "Per generare una bozza mi serve il mittente. Prova: 'scrivi una risposta cordiale a Rossi'." };
  }

  const emails = await fetchIrisEmails(200);
  const q = query.toLowerCase();
  const match = emails.find(e =>
    `${e.sender} ${e.senderName} ${e.subject}`.toLowerCase().includes(q),
  );
  if (!match) return { content: `Non trovo email recenti correlate a "${query}".` };
  return generaBozzaFromEmail(match.id, tono, note);
}

async function generaBozzaFromEmail(emailId, tono, note) {
  const apiKey = ANTHROPIC_API_KEY.value();
  if (!apiKey) return { content: "CALLIOPE non configurato (ANTHROPIC_API_KEY mancante)." };

  let snap;
  try { snap = await db.collection("iris_emails").doc(emailId).get(); }
  catch { return { content: `Email "${emailId}" non leggibile.` }; }
  if (!snap.exists) return { content: `Email "${emailId}" non trovata.` };

  const data = snap.data() || {};
  const raw = data.raw || {};
  const cls = data.classification || {};

  const userPrompt = [
    `=== EMAIL DA RISCONTRARE ===`,
    `Da: ${raw.sender_name || raw.sender || "?"}`,
    `Oggetto: ${raw.subject || "(nessun oggetto)"}`,
    ``,
    `Corpo:`,
    String(raw.body_text || "(corpo vuoto)").slice(0, 2000),
    ``,
    `=== CLASSIFICAZIONE IRIS ===`,
    `Categoria: ${cls.category || "—"}`,
    `Riassunto: ${cls.summary || "—"}`,
    ``,
    `=== ISTRUZIONI ===`,
    `Tono richiesto: ${tono}`,
    note ? `Note: ${note}` : "",
    ``,
    `Scrivi ora la bozza di risposta.`,
  ].filter(Boolean).join("\n");

  let corpo, usage;
  try {
    const resp = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CALLIOPE_MODEL,
        max_tokens: 1024,
        system: CALLIOPE_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      return { content: `CALLIOPE: errore modello (${resp.status}): ${text.slice(0, 200)}` };
    }
    const json = await resp.json();
    corpo = (json.content || []).filter(b => b.type === "text").map(b => b.text).join("\n").trim();
    usage = json.usage || {};
  } catch (e) {
    return { content: `CALLIOPE: chiamata fallita — ${String(e).slice(0, 200)}` };
  }

  // Salva in calliope_bozze (DRY_RUN: stato="in_revisione")
  const bozzaId = `boz_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  try {
    await db.collection("calliope_bozze").doc(bozzaId).set({
      id: bozzaId,
      tipo: "risposta_email",
      tono,
      stato: "in_revisione",
      versione: 1,
      corrente: {
        versione: 1,
        corpo,
        oggetto: `Re: ${raw.subject || ""}`.slice(0, 150),
        firma: "Cordiali saluti,\nAlberto Contardi\nACG Clima Service",
        generataIl: new Date().toISOString(),
        generataDa: "ai",
        modello: CALLIOPE_MODEL,
        usage: {
          inputTokens: usage.input_tokens || 0,
          outputTokens: usage.output_tokens || 0,
        },
      },
      contesto: { richiedente: "nexus", sourceEmailId: emailId, note },
      destinatario: raw.sender ? {
        canale: "email", to: raw.sender, nome: raw.sender_name || null,
      } : null,
      _dryRun: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    logger.error("calliope save failed", { error: String(e) });
  }

  return {
    content:
      `✍️ **Bozza CALLIOPE** (DRY-RUN, tono: ${tono}, salvata come \`${bozzaId}\`)\n\n` +
      `**A:** ${raw.sender_name || raw.sender}\n` +
      `**Oggetto:** Re: ${raw.subject || ""}\n\n` +
      `---\n${corpo}\n---\n\n` +
      `_⚠️ DRY-RUN: la bozza NON è stata inviata. Rivedila e approva quando sei pronto._`,
    data: { bozzaId, modello: CALLIOPE_MODEL, usage },
  };
}

// ─── PHARO — monitoring (lettura NEXO) ─────────────────────────

async function handlePharoStatoSuite() {
  let pending = 0, errori = 0, emailAttesa = 0, emails = 0, firestoreOk = true;

  try {
    const snap = await db.collection("nexo_lavagna")
      .orderBy("createdAt", "desc").limit(100).get();
    snap.forEach(d => {
      const s = (d.data() || {}).status;
      if (s === "pending" || s === "in_progress") pending++;
      else if (s === "failed" || s === "error" || s === "errore") errori++;
    });
  } catch { firestoreOk = false; }

  try {
    const snap = await db.collection("iris_emails")
      .orderBy("raw.received_time", "desc").limit(500).get();
    snap.forEach(d => {
      emails++;
      const f = (d.data() || {}).followup;
      if (f && f.needsAttention) emailAttesa++;
    });
  } catch { firestoreOk = false; }

  const punteggio = firestoreOk
    ? Math.max(0, Math.min(100, 100 - pending * 2 - errori * 5 - emailAttesa))
    : 0;

  const emoji = punteggio >= 80 ? "✅" : punteggio >= 50 ? "⚠️" : "🚨";
  const lines = [
    `${emoji} **Stato Suite NEXO** — punteggio: ${punteggio}/100`,
    ``,
    `  · Firestore: ${firestoreOk ? "✅ OK" : "❌ down"}`,
    `  · Email indicizzate: ${emails}`,
    `  · Email senza risposta >48h: ${emailAttesa}`,
    `  · Lavagna pending: ${pending}`,
    `  · Lavagna errori: ${errori}`,
  ];
  return {
    content: lines.join("\n"),
    data: { punteggio, pending, errori, emailAttesa, emails, firestoreOk },
  };
}

async function handlePharoProblemiAperti() {
  // Query email senza risposta + lavagna failed
  const emails = await fetchIrisEmails(500);
  const att = emails.filter(e => (e.followup || {}).needsAttention);

  let lavFailed = [];
  try {
    const snap = await db.collection("nexo_lavagna")
      .orderBy("createdAt", "desc").limit(50).get();
    snap.forEach(d => {
      const v = d.data() || {};
      if (["failed", "error", "errore"].includes(v.status)) {
        lavFailed.push(`${v.from || "?"} → ${v.to || "?"}: ${v.type || "?"}`);
      }
    });
  } catch {}

  const parts = ["🔎 **Problemi aperti PHARO**\n"];
  if (!att.length && !lavFailed.length) {
    return { content: "✅ Nessun problema aperto al momento!" };
  }
  if (att.length) {
    const lines = att.slice(0, 6).map((e, i) => {
      const days = e.followup.daysWithoutReply || 0;
      return `  ${i + 1}. ⏰ ${days}g — ${e.senderName || e.sender}: ${e.subject}`;
    }).join("\n");
    parts.push(`**Email senza risposta** (${att.length}):\n${lines}`);
  }
  if (lavFailed.length) {
    parts.push(`\n**Lavagna errori** (${lavFailed.length}):\n  · ${lavFailed.slice(0, 5).join("\n  · ")}`);
  }
  return { content: parts.join("\n"), data: { emailCount: att.length, lavFailedCount: lavFailed.length } };
}

// ─── PHARO — Monitoring RTI Guazzotti TEC ──────────────────────
//
// Legge rti / rtidf / pending_rti / tickets dal progetto guazzotti-tec
// e aggrega metriche per la dashboard PHARO della PWA.
// NB: il SA della Cloud Function deve avere roles/datastore.user su
// guazzotti-tec per poter leggere.
//
//   gcloud projects add-iam-policy-binding guazzotti-tec \
//     --member=serviceAccount:272099489624-compute@developer.gserviceaccount.com \
//     --role=roles/datastore.user

function daysBetween(a, b) {
  if (!a || !b) return null;
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / 86400000);
}

function parseDocDate(val) {
  if (!val) return null;
  try {
    if (val.toDate) return val.toDate();
    if (typeof val === "string") {
      // ISO diretto
      const iso = new Date(val);
      if (!Number.isNaN(iso.getTime())) return iso;
      // Formato DD/MM/YYYY
      const m = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    }
    if (val instanceof Date) return val;
  } catch {}
  return null;
}

// Classifica tipo documento RTI/RTIDF: campo `tipo` primario, fallback su prefisso numero
function classifyRtiTipo(v, colName) {
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

// Regole business:
//   - stato `rtidf_fatturato` (RTI) e `fatturato` (RTIDF) → escludi dagli alert
//   - `fatturabile === false` → escludi (interventi garanzia / cliente non reperibile / non eseguiti)
//   - CRTIDF senza costo_intervento è NORMALE (ripartizione millesimi) → alert solo su GRTIDF
async function handlePharoRtiMonitoring(parametri = {}) {
  const now = new Date();
  const DAY7 = new Date(now.getTime() - 7 * 86400000);
  const DAY3 = new Date(now.getTime() - 3 * 86400000);
  const DAY14 = new Date(now.getTime() - 14 * 86400000);
  const DAY30 = new Date(now.getTime() - 30 * 86400000);

  const out = {
    ok: true,
    scan_at: now.toISOString(),
    // Metriche segmentate per tipo
    rti_gen: { total: 0, bozza: 0, definito: 0, rtidf_presente: 0, rtidf_inviato: 0, rtidf_fatturato: 0, da_verificare: 0, non_fatturabili: 0 },
    rti_con: { total: 0, bozza: 0, definito: 0, rtidf_presente: 0, rtidf_inviato: 0, non_fatturabili: 0 },
    rtidf_gen: { total: 0, bozza: 0, definito: 0, inviato: 0, fatturato: 0, senza_costo: 0 },
    rtidf_con: { total: 0, bozza: 0, definito: 0, inviato: 0, fatturato: 0 },
    // Metriche ALERT effettivi (post filtri business)
    alerts_metrics: {
      grtidf_pronti_fattura: { count: 0, valore_eur: 0 },
      grtidf_senza_costo: 0,
      grti_definito_senza_grtidf: 0, // solo fatturabili, esclusi rtidf_fatturato
      crti_definito_senza_crtidf: 0,
      crti_bozza_30g: 0,
      tickets_aperti_30g_no_rti: 0,
    },
    // Aggregati legacy (compat PWA)
    rti: { total: 0, bozza: 0, definito: 0, rtidf_presente: 0, rtidf_inviato: 0, rtidf_fatturato: 0, bozza_vecchi_7g: 0 },
    rtidf: { total: 0, bozza: 0, definito: 0, inviato: 0, fatturato: 0 },
    pending: { total: 0, old_3g: 0 },
    tickets: { total: 0, aperti: 0, aperti_vecchi_14g: 0, aperti_vecchi_30g: 0, senza_rti: 0 },
    pagamenti: { total: 0 },
    tabella_rti: [],
    stats: { rti_per_mese: {}, tempo_medio_rti_rtidf_giorni: null, top_tecnici: [] },
    warnings: [],
    errors: [],
    business_rules: {
      stati_rti_esclusi: ["rtidf_fatturato"],
      stati_rtidf_esclusi: ["fatturato"],
      filtro_fatturabile: "esclude fatturabile=false",
      crtidf_senza_costo: "non_e_alert_ripartizione_millesimi",
    },
  };

  const gdb = getGuazzottiDb();

  // Carico RTI e RTIDF in parallelo (serve il match cross-collection)
  let rtiDocs = [];
  let rtidfDocs = [];
  try {
    const snap = await gdb.collection("rti").limit(700).get();
    rtiDocs = snap.docs.map(d => ({ _id: d.id, ...(d.data() || {}) }));
    out.rti.total = rtiDocs.length;
  } catch (e) {
    out.errors.push({ collection: "rti", error: String(e).slice(0, 200) });
  }
  try {
    const snap = await gdb.collection("rtidf").limit(400).get();
    rtidfDocs = snap.docs.map(d => ({ _id: d.id, ...(d.data() || {}) }));
    out.rtidf.total = rtidfDocs.length;
  } catch (e) {
    out.errors.push({ collection: "rtidf", error: String(e).slice(0, 200) });
  }

  // Indici per match RTI → RTIDF (per tipo)
  const rtidfGenByNum = new Map();
  const rtidfGenById = new Map();
  const rtidfConByNum = new Map();
  const rtidfConById = new Map();
  rtidfDocs.forEach(v => {
    const tipo = classifyRtiTipo(v, "rtidf");
    const num = String(v.numero_rti_origine || "");
    const rid = String(v.rti_origine_id || "");
    if (tipo === "generico") {
      if (num) rtidfGenByNum.set(num, v);
      if (rid) rtidfGenById.set(rid, v);
    } else if (tipo === "contabilizzazione") {
      if (num) rtidfConByNum.set(num, v);
      if (rid) rtidfConById.set(rid, v);
    }
  });

  // ── Analisi RTIDF (aggrega prima di usarli in tabella RTI)
  rtidfDocs.forEach(v => {
    const tipo = classifyRtiTipo(v, "rtidf");
    const stato = String(v.stato || "").toLowerCase();
    const bucket = tipo === "generico" ? out.rtidf_gen : tipo === "contabilizzazione" ? out.rtidf_con : null;
    if (bucket) {
      bucket.total++;
      if (stato === "bozza") bucket.bozza++;
      else if (stato === "definito" || stato === "definitivo") bucket.definito++;
      else if (stato === "inviato") bucket.inviato++;
      else if (stato === "fatturato") bucket.fatturato++;
    }
    // Legacy aggregate
    if (stato === "bozza") out.rtidf.bozza++;
    else if (stato === "definito" || stato === "definitivo") out.rtidf.definito++;
    else if (stato === "inviato") out.rtidf.inviato++;
    else if (stato === "fatturato") out.rtidf.fatturato++;

    // A1-G: GRTIDF pronti fatturazione (filtro: generico, inviato, fatturabile!=false, esclusi già fatturati)
    if (tipo === "generico" && stato === "inviato" && v.fatturabile !== false) {
      out.alerts_metrics.grtidf_pronti_fattura.count++;
      const c = Number(v.costo_intervento || 0);
      if (!Number.isNaN(c)) out.alerts_metrics.grtidf_pronti_fattura.valore_eur += c;
    }

    // A2-G: GRTIDF senza costo (solo generico, esclusi bozza + fatturato + non-fatturabili)
    if (tipo === "generico" && stato !== "bozza" && stato !== "fatturato" && v.fatturabile !== false) {
      const c = Number(v.costo_intervento || 0);
      if (!c || c === 0) {
        out.rtidf_gen.senza_costo++;
        out.alerts_metrics.grtidf_senza_costo++;
      }
    }
  });

  // Arrotonda valore EUR a 2 decimali
  out.alerts_metrics.grtidf_pronti_fattura.valore_eur =
    Math.round(out.alerts_metrics.grtidf_pronti_fattura.valore_eur * 100) / 100;

  // ── Analisi RTI
  const rtiRows = [];
  const perMese = {};
  const perTecnico = {};
  rtiDocs.forEach(v => {
    const tipo = classifyRtiTipo(v, "rti");
    const stato = String(v.stato || "").toLowerCase();
    const bucket = tipo === "generico" ? out.rti_gen : tipo === "contabilizzazione" ? out.rti_con : null;
    if (bucket) {
      bucket.total++;
      if (stato === "bozza") bucket.bozza++;
      else if (stato === "definito") bucket.definito++;
      else if (stato === "rtidf_presente") bucket.rtidf_presente++;
      else if (stato === "rtidf_inviato") bucket.rtidf_inviato++;
      else if (stato === "rtidf_fatturato" && bucket.rtidf_fatturato !== undefined) bucket.rtidf_fatturato++;
      else if (stato === "da_verificare" && bucket.da_verificare !== undefined) bucket.da_verificare++;
      if (v.fatturabile === false) bucket.non_fatturabili++;
    }
    // Legacy aggregate
    if (stato === "bozza") out.rti.bozza++;
    else if (stato === "definito") out.rti.definito++;
    else if (stato === "rtidf_presente") out.rti.rtidf_presente++;
    else if (stato === "rtidf_inviato") out.rti.rtidf_inviato++;
    else if (stato === "rtidf_fatturato") out.rti.rtidf_fatturato++;

    const dataRti = parseDocDate(v.data_intervento) || parseDocDate(v.data) || parseDocDate(v.created_at) || parseDocDate(v._lastModified);

    // Bozza vecchia >7g (compat)
    if (stato === "bozza" && dataRti && dataRti < DAY7) out.rti.bozza_vecchi_7g++;

    // A1-C: bozze CRTI >30g (esclude rtidf_fatturato — ma le bozze per definizione non lo sono)
    if (tipo === "contabilizzazione" && stato === "bozza" && dataRti && dataRti < DAY30) {
      out.alerts_metrics.crti_bozza_30g++;
    }

    // Per mese/tecnico
    if (dataRti) {
      const ym = dataRti.toISOString().slice(0, 7);
      perMese[ym] = (perMese[ym] || 0) + 1;
    }
    const tec = String(v.tecnico_intervento || v.tecnico || "").trim();
    if (tec) perTecnico[tec] = (perTecnico[tec] || 0) + 1;

    // Match RTIDF per tabella UI
    const num = String(v.numero_rti || "");
    const rid = String(v._id);
    const iid = String(v.id || "");
    let haRtidf = stato.startsWith("rtidf_");
    if (!haRtidf) {
      if (tipo === "generico") {
        haRtidf = rtidfGenByNum.has(num) || rtidfGenById.has(rid) || (iid && rtidfGenById.has(iid));
      } else if (tipo === "contabilizzazione") {
        haRtidf = rtidfConByNum.has(num) || rtidfConById.has(rid) || (iid && rtidfConById.has(iid));
      }
    }

    // A3-G / A3-C: RTI 'definito' senza RTIDF corrispondente, filtro fatturabile, esclude rtidf_fatturato (stato != definito comunque)
    if (stato === "definito" && !haRtidf && v.fatturabile !== false) {
      if (tipo === "generico") out.alerts_metrics.grti_definito_senza_grtidf++;
      else if (tipo === "contabilizzazione") out.alerts_metrics.crti_definito_senza_crtidf++;
    }

    rtiRows.push({
      id: rid,
      numero_rti: v.numero_rti || rid,
      data: dataRti ? dataRti.toISOString().slice(0, 10) : "",
      stato: stato || "?",
      tipo: tipo || "?",
      fatturabile: v.fatturabile !== false, // true o missing = considerato fatturabile
      tecnico: tec || "-",
      cliente: String(v.cliente || "").slice(0, 60),
      ha_rtidf: haRtidf,
    });
  });

  rtiRows.sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  out.tabella_rti = rtiRows.slice(0, 50);
  out.stats.rti_per_mese = perMese;
  out.stats.top_tecnici = Object.entries(perTecnico)
    .map(([nome, count]) => ({ nome, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // ── Pending
  try {
    const snap = await gdb.collection("pending_rti").limit(200).get();
    out.pending.total = snap.size;
    snap.forEach(d => {
      const v = d.data() || {};
      const created = parseDocDate(v.created_at) || parseDocDate(v.data_invio);
      const stato = String(v.stato || "").toLowerCase();
      if (created && created < DAY3 && stato !== "processed") out.pending.old_3g++;
    });
  } catch (e) {
    out.errors.push({ collection: "pending_rti", error: String(e).slice(0, 200) });
  }

  // ── Tickets (business rule tickets: i ticket non hanno `fatturabile`, filtro solo stato+età)
  try {
    const snap = await gdb.collection("tickets").limit(700).get();
    out.tickets.total = snap.size;
    snap.forEach(d => {
      const v = d.data() || {};
      const stato = String(v.stato || "").toLowerCase();
      const isAperto = stato === "aperto" || stato === "pianificato" || stato === "in_attesa" || stato === "da_chiudere";
      if (isAperto) out.tickets.aperti++;

      const dataApertura = parseDocDate(v.data_apertura) || parseDocDate(v.timestamp);
      if (isAperto && dataApertura) {
        if (dataApertura < DAY14) out.tickets.aperti_vecchi_14g++;
        if (dataApertura < DAY30) out.tickets.aperti_vecchi_30g++;
      }
      if (isAperto && !v.rti_inviato && !v.rtiChiusura) out.tickets.senza_rti++;

      // A4: ticket aperto >30g senza RTI
      if (isAperto && dataApertura && dataApertura < DAY30 && !v.rti_inviato && !v.rtiChiusura) {
        out.alerts_metrics.tickets_aperti_30g_no_rti++;
      }
    });
  } catch (e) {
    out.errors.push({ collection: "tickets", error: String(e).slice(0, 200) });
  }

  // ── Pagamenti (conteggio info)
  try {
    const snap = await gdb.collection("pagamenti_clienti").limit(300).get();
    out.pagamenti.total = snap.size;
  } catch (e) {
    out.errors.push({ collection: "pagamenti_clienti", error: String(e).slice(0, 200) });
  }

  // ── Costruzione warnings (con regole business)
  const m = out.alerts_metrics;

  if (m.grtidf_pronti_fattura.count > 0) {
    out.warnings.push({
      severita: "critical",
      titolo: `${m.grtidf_pronti_fattura.count} GRTIDF pronti per fatturazione (${m.grtidf_pronti_fattura.valore_eur} €)`,
      descrizione: "Rapporti generici inviati all'amministratore, in attesa di essere inseriti in commessa/fattura.",
      tipo_target: "generico",
      codice: "A1-G",
    });
  }
  if (m.grtidf_senza_costo > 0) {
    out.warnings.push({
      severita: "critical",
      titolo: `${m.grtidf_senza_costo} GRTIDF senza costo_intervento`,
      descrizione: "Documenti non producibili per fatturazione. Amministrazione deve compilare costo.",
      tipo_target: "generico",
      codice: "A2-G",
    });
  }
  if (m.grti_definito_senza_grtidf > 0) {
    out.warnings.push({
      severita: "critical",
      titolo: `${m.grti_definito_senza_grtidf} GRTI 'definito' senza GRTIDF (fatturabili)`,
      descrizione: "Interventi chiusi ma snapshot fatturazione mai creato. Esclusi non fatturabili.",
      tipo_target: "generico",
      codice: "A3-G",
    });
  }
  if (m.crti_bozza_30g > 0) {
    out.warnings.push({
      severita: "critical",
      titolo: `${m.crti_bozza_30g} bozze CRTI da più di 30 giorni`,
      descrizione: "Backlog contabilizzazioni non ancora finalizzate dal tecnico.",
      tipo_target: "contabilizzazione",
      codice: "A1-C",
    });
  }
  if (m.crti_definito_senza_crtidf > 0) {
    out.warnings.push({
      severita: "warning",
      titolo: `${m.crti_definito_senza_crtidf} CRTI 'definito' senza CRTIDF (fatturabili)`,
      descrizione: "Contabilizzazioni chiuse in attesa di duplicazione in RTIDF.",
      tipo_target: "contabilizzazione",
      codice: "A2-C",
    });
  }
  if (m.tickets_aperti_30g_no_rti > 0) {
    out.warnings.push({
      severita: "critical",
      titolo: `${m.tickets_aperti_30g_no_rti} ticket aperti da più di 30 giorni senza RTI`,
      descrizione: "Interventi in stallo. Verifica urgente con tecnici.",
      tipo_target: "tutti",
      codice: "A4",
    });
  }

  // ── Testo NEXUS Chat
  const lines = [
    `🏢 **PHARO — Monitoring Guazzotti TEC (v2 con regole business)**`,
    ``,
    `**RTI**: ${out.rti.total} totali (GRTI: ${out.rti_gen.total}, CRTI: ${out.rti_con.total})`,
    `  · Non fatturabili esclusi: ${out.rti_gen.non_fatturabili + out.rti_con.non_fatturabili}`,
    `  · Già fatturati (rtidf_fatturato): ${out.rti_gen.rtidf_fatturato}`,
    `**RTIDF**: ${out.rtidf.total} totali (GRTIDF: ${out.rtidf_gen.total}, CRTIDF: ${out.rtidf_con.total})`,
    `  · Fatturati (esclusi): ${out.rtidf_gen.fatturato + out.rtidf_con.fatturato}`,
    `**Tickets**: ${out.tickets.total} (${out.tickets.aperti} aperti, ${out.tickets.aperti_vecchi_30g} >30g)`,
    ``,
    `**💰 Valore fatturazione bloccata**: ${m.grtidf_pronti_fattura.valore_eur} € (solo GRTIDF inviati fatturabili)`,
    ``,
  ];
  if (out.warnings.length) {
    lines.push(`⚠️ **Alert attivi** (${out.warnings.length}):`);
    out.warnings.forEach(w => lines.push(`  · [${w.severita}|${w.codice}] ${w.titolo}`));
  } else {
    lines.push(`✅ Nessun alert attivo — tutto in ordine.`);
  }
  if (out.errors.length) {
    lines.push(``, `❌ Errori lettura: ${out.errors.map(e => e.collection).join(", ")}`);
  }

  return { content: lines.join("\n"), data: out };
}

// ─── DELPHI — KPI e costo AI ───────────────────────────────────

async function handleDelphiKpi(parametri) {
  const finestraSett = Number(parametri.finestraSettimane) || 4;
  const now = new Date();
  const from = new Date(now.getTime() - finestraSett * 7 * 86400000);

  // Email totali + urgenti
  const emails = await fetchIrisEmails(500);
  let urg = 0, senzaRisposta = 0;
  for (const e of emails) {
    if (CATEGORIE_URGENTI_SET.has(e.category)) urg++;
    if ((e.followup || {}).needsAttention) senzaRisposta++;
  }

  // Lavagna
  let lavMsgCount = 0;
  try {
    const lavSnap = await db.collection("nexo_lavagna")
      .orderBy("createdAt", "desc").limit(200).get();
    lavSnap.forEach(d => {
      const ca = (d.data() || {}).createdAt;
      const dd = ca?.toDate ? ca.toDate() : (ca ? new Date(ca) : null);
      if (dd && dd >= from) lavMsgCount++;
    });
  } catch {}

  // Interventi COSMINA
  let attivi = 0, completati = 0;
  try {
    const cSnap = await getCosminaDb().collection("bacheca_cards")
      .where("listName", "==", "INTERVENTI").where("inBacheca", "==", true)
      .limit(500).get();
    cSnap.forEach(d => {
      const data = d.data() || {};
      const stato = String(data.stato || "").toLowerCase();
      if (stato.includes("complet")) {
        const upd = data.updated_at?.toDate ? data.updated_at.toDate()
          : data.updated_at ? new Date(data.updated_at) : null;
        if (upd && upd >= from) completati++;
      } else if (!stato.includes("annul")) attivi++;
    });
  } catch {}

  const lines = [
    `📊 **DELPHI — KPI ultimi ${finestraSett * 7} giorni**`,
    ``,
    `**Email**`,
    `  · Indicizzate: ${emails.length}`,
    `  · Urgenti: ${urg}`,
    `  · Senza risposta >48h: ${senzaRisposta}`,
    ``,
    `**Lavagna**`,
    `  · Messaggi: ${lavMsgCount}`,
    ``,
    `**Interventi COSMINA**`,
    `  · Attivi ora: ${attivi}`,
    `  · Completati: ${completati}`,
  ];
  return {
    content: lines.join("\n"),
    data: { emails: emails.length, urgenti: urg, senzaRisposta, lavMsgCount, attivi, completati },
  };
}

async function handleDelphiConfrontoMoM() {
  const now = new Date();
  const inizioQ = new Date(now.getFullYear(), now.getMonth(), 1);
  const inizioP = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const fineP = new Date(inizioQ.getTime() - 1);

  const snap = await db.collection("iris_emails")
    .orderBy("raw.received_time", "desc").limit(500).get();
  const all = [];
  snap.forEach(d => {
    const x = d.data() || {};
    const iso = (x.raw || {}).received_time;
    if (!iso) return;
    all.push({
      ts: new Date(iso),
      cat: (x.classification || {}).category || "",
      nr: !!(x.followup || {}).needsAttention,
    });
  });

  function bucket(from, to) {
    let tot = 0, urg = 0, senzaR = 0;
    for (const e of all) {
      if (e.ts < from || e.ts > to) continue;
      tot++;
      if (e.cat === "GUASTO_URGENTE" || e.cat === "PEC_UFFICIALE") urg++;
      if (e.nr) senzaR++;
    }
    return { tot, urg, senzaR };
  }
  function deltaPct(c, p) { return p === 0 ? (c === 0 ? 0 : 100) : Math.round(((c - p) / p) * 100); }
  function arrow(d) {
    if (d > 5) return `📈 +${d}%`;
    if (d < -5) return `📉 ${d}%`;
    return `➡️ ${d >= 0 ? "+" : ""}${d}%`;
  }

  const q = bucket(inizioQ, now);
  const p = bucket(inizioP, fineP);
  const mQ = inizioQ.toISOString().slice(0, 7);
  const mP = inizioP.toISOString().slice(0, 7);

  return {
    content:
      `📊 **Confronto ${mQ} vs ${mP}** (IRIS)\n\n` +
      `  · Email: ${q.tot} vs ${p.tot} ${arrow(deltaPct(q.tot, p.tot))}\n` +
      `  · Urgenti: ${q.urg} vs ${p.urg} ${arrow(deltaPct(q.urg, p.urg))}\n` +
      `  · Senza risposta >48h: ${q.senzaR} vs ${p.senzaR} ${arrow(deltaPct(q.senzaR, p.senzaR))}`,
    data: { mQ, mP, q, p },
  };
}

async function handleDelphiCostoAI(parametri) {
  const finestraGiorni = Number(parametri.finestraGiorni) || 30;
  const now = new Date();
  const from = new Date(now.getTime() - finestraGiorni * 86400000);

  // Prova cosmina_config
  try {
    const snap = await getCosminaDb().collection("cosmina_config").doc("ai_usage").get();
    if (snap.exists) {
      const d = snap.data() || {};
      const costo = Number(d.costoTotale || 0);
      const ti = Number(d.tokenInput || 0);
      const to = Number(d.tokenOutput || 0);
      return {
        content:
          `💳 **Costo AI** (finestra ${finestraGiorni}g, fonte: cosmina_config)\n\n` +
          `  · Input tokens: ${ti.toLocaleString("it-IT")}\n` +
          `  · Output tokens: ${to.toLocaleString("it-IT")}\n` +
          `  · **Costo totale stimato: € ${costo.toFixed(2)}**`,
        data: { fonte: "cosmina_config", costo },
      };
    }
  } catch {}

  // Fallback: aggrega da nexus_chat
  let tokenInput = 0, tokenOutput = 0, chiamate = 0;
  try {
    const snap = await db.collection("nexus_chat")
      .where("role", "==", "assistant").limit(500).get();
    snap.forEach(d => {
      const data = d.data() || {};
      const ts = data.timestamp?.toDate ? data.timestamp.toDate()
        : data.timestamp ? new Date(data.timestamp) : null;
      if (ts && ts < from) return;
      const u = data.usage || {};
      tokenInput += Number(u.inputTokens || 0);
      tokenOutput += Number(u.outputTokens || 0);
      chiamate++;
    });
  } catch {}

  const costoUsd = (tokenInput / 1e6) * 0.80 + (tokenOutput / 1e6) * 4;
  const costoEur = (costoUsd * 0.92).toFixed(4);
  return {
    content:
      `💳 **Costo AI** (finestra ${finestraGiorni}g, fonte: nexus_chat)\n\n` +
      `  · Chiamate NEXUS: ${chiamate}\n` +
      `  · Input tokens: ${tokenInput.toLocaleString("it-IT")}\n` +
      `  · Output tokens: ${tokenOutput.toLocaleString("it-IT")}\n` +
      `  · **Costo stimato Haiku 4.5: € ${costoEur}**\n\n` +
      `_Non sono inclusi costi IRIS/CALLIOPE. Per dato completo: \`cosmina_config/ai_usage\`._`,
    data: { tokenInput, tokenOutput, chiamate, costoEur },
  };
}

// ─── DIKEA — compliance (lettura COSMINA) ──────────────────────
//
// Legge scadenze CURIT/REE/manutenzione da cosmina_impianti(_cit).

async function handleDikeaScadenzeCurit(parametri) {
  const finestraGiorni = Number(parametri.finestraGiorni) || 90;
  const now = new Date();
  const limite = new Date(now.getTime() + finestraGiorni * 86400000);

  const db = getCosminaDb();
  const collezioni = ["cosmina_impianti_cit", "cosmina_impianti"];
  const rows = [];

  for (const coll of collezioni) {
    try {
      const snap = await db.collection(coll).limit(500).get();
      snap.forEach(d => {
        const data = d.data() || {};
        const candidates = [
          { tipo: "CURIT", val: data.data_bollino_curit || data.scadenza_bollino },
          { tipo: "REE", val: data.data_ultima_ree || data.data_ree },
          { tipo: "MANUT", val: data.data_prossima_manutenzione || data.prossima_manutenzione },
        ];
        for (const c of candidates) {
          if (!c.val) continue;
          let scad;
          try {
            scad = c.val.toDate ? c.val.toDate() : new Date(c.val);
            if (Number.isNaN(scad.getTime())) continue;
          } catch { continue; }
          if (scad < now || scad > limite) continue;
          rows.push({
            tipo: c.tipo,
            data: scad,
            cond: data.condominio || data.indirizzo || "?",
            targa: data.targa_cit || "",
          });
        }
      });
      if (rows.length) break;
    } catch (e) {
      const msg = String(e?.message || e);
      if (/permission|denied|UNAUTHENTICATED|403|NOT_FOUND/i.test(msg)) continue;
      throw e;
    }
  }

  if (!rows.length) {
    return { content: `⚖️ Nessuna scadenza CURIT/REE/manutenzione nei prossimi ${finestraGiorni} giorni (o collection non accessibile).` };
  }

  rows.sort((a, b) => a.data.getTime() - b.data.getTime());
  const top = rows.slice(0, 12);
  const lines = top.map((r, i) => {
    const d = r.data.toLocaleDateString("it-IT");
    const giorni = Math.ceil((r.data.getTime() - now.getTime()) / 86400000);
    const urg = giorni <= 14 ? " ⚠️" : "";
    const targa = r.targa ? ` [${r.targa}]` : "";
    return `${i + 1}. [${d}] (${giorni}g)${urg} ${r.tipo} · ${r.cond.slice(0, 40)}${targa}`;
  }).join("\n");
  const more = rows.length > top.length ? `\n…e altre ${rows.length - top.length}.` : "";
  return {
    content: `⚖️ **${rows.length} scadenze normative** nei prossimi ${finestraGiorni}g:\n\n${lines}${more}`,
    data: { count: rows.length },
  };
}

async function handleDikeaImpiantiSenzaTarga() {
  let snap;
  try {
    snap = await getCosminaDb().collection("cosmina_impianti").limit(500).get();
  } catch (e) {
    const msg = String(e?.message || e);
    if (/permission|denied|UNAUTHENTICATED|403|NOT_FOUND/i.test(msg)) {
      return { content: "DIKEA non può leggere `cosmina_impianti`." };
    }
    throw e;
  }
  const out = [];
  snap.forEach(d => {
    const data = d.data() || {};
    const targa = String(data.targa_cit || data.targa || "").trim();
    if (!targa) {
      out.push({
        id: d.id,
        cond: data.condominio || "",
        indirizzo: data.indirizzo || "",
      });
    }
  });
  if (!out.length) return { content: "✅ Tutti gli impianti censiti hanno una targa CURIT." };
  const top = out.slice(0, 15);
  const lines = top.map((r, i) => `${i + 1}. ${r.cond || "?"} — ${r.indirizzo || ""}`).join("\n");
  const more = out.length > top.length ? `\n…e altri ${out.length - top.length}.` : "";
  return {
    content: `⚠️ **${out.length} impianti SENZA targa CURIT**:\n\n${lines}${more}`,
    data: { count: out.length },
  };
}

// ─── EMPORION — magazzino (lettura COSMINA) ────────────────────
//
// Collection reali COSMINA:
//   - `magazzino` (articoli): campi codice, descrizione, codice_costruttore,
//     codice_fornitore, scorta_minima, gruppo, sottogruppo, modello
//   - `magazzino_giacenze`: articolo_id, magazzino_id, quantita

async function handleEmporionSottoScorta() {
  const db = getCosminaDb();
  let snap;
  try {
    snap = await db.collection("magazzino").limit(500).get();
  } catch (e) {
    const m = String(e?.message || e);
    if (/permission|denied|403|NOT_FOUND/i.test(m)) {
      return { content: "EMPORION non può leggere `magazzino`." };
    }
    throw e;
  }

  const out = [];
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const min = typeof data.scorta_minima === "number" ? data.scorta_minima : 0;
    if (min <= 0) continue;

    let totale = 0;
    try {
      const gSnap = await db.collection("magazzino_giacenze")
        .where("articolo_id", "==", doc.id).limit(20).get();
      gSnap.forEach(g => { totale += Number((g.data() || {}).quantita || 0); });
    } catch {}

    if (totale < min) {
      out.push({
        codice: data.codice || doc.id,
        descrizione: String(data.descrizione || "").slice(0, 60),
        totale,
        min,
        mancante: min - totale,
      });
    }
    if (out.length >= 30) break;
  }

  if (!out.length) {
    return { content: "✅ Nessun articolo sotto scorta al momento." };
  }

  out.sort((a, b) => b.mancante - a.mancante);
  const top = out.slice(0, 15);
  const lines = top.map((r, i) =>
    `${i + 1}. **${r.codice}** — ${r.descrizione}\n     giacenza: ${r.totale}/${r.min} (manca: ${r.mancante})`,
  ).join("\n");
  const more = out.length > top.length ? `\n\n…e altri ${out.length - top.length}.` : "";
  return {
    content: `⚠️ **${out.length} articoli sotto scorta**:\n\n${lines}${more}`,
    data: { count: out.length },
  };
}

async function handleEmporionDisponibilita(parametri) {
  const codice = String(parametri.codice || parametri.code || "").trim();
  const descrizione = String(parametri.descrizione || parametri.nome || parametri.articolo || "").trim();

  if (!codice && !descrizione) {
    return { content: "Mi serve un codice articolo o una descrizione (es. 'valvola 3/4', 'termocoppia')." };
  }

  const db = getCosminaDb();
  const articoli = [];

  try {
    if (codice) {
      const fields = ["codice", "codice_costruttore", "codice_fornitore"];
      for (const f of fields) {
        const snap = await db.collection("magazzino").where(f, "==", codice).limit(10).get();
        snap.forEach(d => {
          const data = d.data() || {};
          articoli.push({
            id: d.id,
            codice: data.codice || "",
            descrizione: data.descrizione || "",
            scorta_minima: data.scorta_minima,
            fornitore: data.fornitore,
            prezzo: data.prezzo,
          });
        });
        if (articoli.length) break;
      }
    }
    if (!articoli.length && descrizione) {
      const q = descrizione.toLowerCase();
      const snap = await db.collection("magazzino").limit(300).get();
      snap.forEach(d => {
        const data = d.data() || {};
        const desc = String(data.descrizione || "").toLowerCase();
        const cod = String(data.codice || "").toLowerCase();
        if (desc.includes(q) || cod.includes(q)) {
          articoli.push({
            id: d.id,
            codice: data.codice || "",
            descrizione: data.descrizione || "",
            scorta_minima: data.scorta_minima,
            fornitore: data.fornitore,
            prezzo: data.prezzo,
          });
        }
      });
    }
  } catch (e) {
    const msg = String(e?.message || e);
    if (/permission|denied|UNAUTHENTICATED|403/i.test(msg)) {
      return { content: "EMPORION non ha i permessi per leggere COSMINA `magazzino`." };
    }
    throw e;
  }

  if (!articoli.length) {
    const chi = codice || descrizione;
    return { content: `📦 Nessun articolo trovato per "${chi}" nel magazzino.` };
  }

  // Per i primi 5 articoli, aggrega giacenze
  const top = articoli.slice(0, 5);
  const blocchi = [];
  for (const a of top) {
    let totale = 0;
    const perMag = [];
    try {
      const gSnap = await db.collection("magazzino_giacenze")
        .where("articolo_id", "==", a.id).limit(20).get();
      gSnap.forEach(g => {
        const gd = g.data() || {};
        const qta = Number(gd.quantita || 0);
        totale += qta;
        if (qta > 0) perMag.push(`${gd.magazzino_id}=${qta}`);
      });
    } catch {}
    const sotto = typeof a.scorta_minima === "number" && totale < a.scorta_minima ? " ⚠️ sotto scorta" : "";
    const det = perMag.length ? ` (${perMag.slice(0, 4).join(", ")})` : "";
    blocchi.push(
      `**${a.codice || a.id}** — ${a.descrizione.slice(0, 50)}\n  giacenza: **${totale}**${det}${sotto}`,
    );
  }
  const more = articoli.length > top.length ? `\n\n…e altri ${articoli.length - top.length} articoli.` : "";
  return {
    content: `📦 Trovati ${articoli.length} articoli:\n\n${blocchi.join("\n\n")}${more}`,
    data: { count: articoli.length },
  };
}

// ─── CHRONOS — pianificazione (lettura COSMINA) ────────────────
//
// slotDisponibili: legge bacheca_cards INTERVENTI con `due` e filtra per
//   tecnico/finestra. Risponde a "quando è libero X", "cosa fa X domani".
// scadenzeProssime: legge cosmina_impianti e cerca campi con date di
//   scadenza manutenzione/CURIT nei prossimi N giorni.

async function handleChronosSlotTecnico(parametri) {
  const tecnicoFilter = String(
    parametri.tecnico || parametri.nome || parametri.tecnicoUid || "",
  ).trim().toLowerCase();
  const finestraGiorni = Number(parametri.finestraGiorni) || 14;
  const now = new Date();
  const limite = new Date(now.getTime() + finestraGiorni * 86400000);

  let snap;
  try {
    snap = await getCosminaDb().collection("bacheca_cards")
      .where("listName", "==", "INTERVENTI")
      .where("inBacheca", "==", true)
      .limit(200).get();
  } catch (e) {
    const msg = String(e?.message || e);
    if (/permission|denied|UNAUTHENTICATED|403/i.test(msg)) {
      return { content: "CHRONOS non ha ancora i permessi per leggere COSMINA." };
    }
    throw e;
  }

  const rows = [];
  snap.forEach((d) => {
    const data = d.data() || {};
    const stato = String(data.stato || "").toLowerCase();
    if (stato.includes("complet") || stato.includes("annul")) return;
    let tecnico = data.techName;
    if (!tecnico && Array.isArray(data.techNames) && data.techNames.length) {
      tecnico = String(data.techNames[0]);
    }
    if (!tecnico) return;
    if (tecnicoFilter && !String(tecnico).toLowerCase().includes(tecnicoFilter)) return;

    let due;
    if (data.due) {
      try {
        due = data.due.toDate ? data.due.toDate() : new Date(data.due);
        if (Number.isNaN(due.getTime())) due = null;
      } catch { due = null; }
    }
    if (!due || due < now || due > limite) return;

    rows.push({
      tecnico,
      data: due,
      cond: data.boardName || "?",
      name: data.name || "(senza titolo)",
    });
  });

  rows.sort((a, b) => a.data.getTime() - b.data.getTime());
  if (!rows.length) {
    const who = tecnicoFilter ? `per "${tecnicoFilter}"` : "";
    return { content: `Nessun impegno pianificato ${who} nei prossimi ${finestraGiorni} giorni.` };
  }

  // Raggruppa per tecnico
  const perTec = new Map();
  for (const r of rows) {
    if (!perTec.has(r.tecnico)) perTec.set(r.tecnico, []);
    perTec.get(r.tecnico).push(r);
  }

  const blocchi = [];
  for (const [tec, items] of perTec) {
    const lines = items.slice(0, 6).map((r) => {
      const d = r.data.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
      const h = r.data.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
      return `  · ${d} ${h} — ${r.cond.slice(0, 40)}`;
    }).join("\n");
    const more = items.length > 6 ? `\n  …e altri ${items.length - 6}` : "";
    blocchi.push(`**${tec}** (${items.length} impegni):\n${lines}${more}`);
  }

  return {
    content: `📅 Agenda prossimi ${finestraGiorni} giorni:\n\n${blocchi.join("\n\n")}`,
    data: { tecnici: [...perTec.keys()], totale: rows.length },
  };
}

async function handleChronosAgendaGiornaliera(parametri, ctx) {
  const msg = (ctx?.userMessage || "").toLowerCase();
  const tecnico = String(
    parametri.tecnico || parametri.nome || parametri.tecnicoUid || "",
  ).trim().toLowerCase();

  // Determina il giorno richiesto (tollerante: parse fallito → oggi)
  let giorno = new Date();
  if (parametri.data) {
    const parsed = new Date(parametri.data);
    if (!Number.isNaN(parsed.getTime())) giorno = parsed;
  }
  if (/dopodomani/.test(msg)) {
    giorno = new Date(); giorno.setDate(giorno.getDate() + 2);
  } else if (/domani/.test(msg)) {
    giorno = new Date(); giorno.setDate(giorno.getDate() + 1);
  } else if (/oggi/.test(msg)) {
    giorno = new Date();
  }

  const start = new Date(giorno); start.setHours(0, 0, 0, 0);
  const end = new Date(giorno); end.setHours(23, 59, 59, 999);

  if (!tecnico) {
    return { content: "Quale tecnico? Dimmi il nome (es. 'agenda di Malvicino')." };
  }

  let snap;
  try {
    snap = await getCosminaDb().collection("bacheca_cards")
      .where("listName", "==", "INTERVENTI").where("inBacheca", "==", true)
      .limit(300).get();
  } catch (e) {
    const m = String(e?.message || e);
    if (/permission|denied|403/i.test(m)) {
      return { content: "CHRONOS non può leggere COSMINA." };
    }
    throw e;
  }

  const slot = [];
  snap.forEach(d => {
    const row = d.data() || {};
    const stato = String(row.stato || "").toLowerCase();
    if (stato.includes("complet") || stato.includes("annul")) return;
    let tec = row.techName;
    if (!tec && Array.isArray(row.techNames) && row.techNames.length) tec = String(row.techNames[0]);
    if (!tec || !tec.toLowerCase().includes(tecnico)) return;
    let due;
    try {
      due = row.due?.toDate ? row.due.toDate() : (row.due ? new Date(row.due) : null);
      if (due && Number.isNaN(due.getTime())) due = null;
    } catch { due = null; }
    if (!due || due < start || due > end) return;
    slot.push({
      ora: due.toTimeString().slice(0, 5),
      cond: row.boardName || "?",
      name: row.name || "",
    });
  });

  slot.sort((a, b) => a.ora.localeCompare(b.ora));
  const dataStr = giorno.toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "long" });

  if (!slot.length) {
    return { content: `📅 ${tecnico.toUpperCase()} non ha interventi pianificati per ${dataStr}.` };
  }

  const lines = slot.slice(0, 12).map((s, i) =>
    `${i + 1}. ${s.ora} — ${String(s.cond).slice(0, 50)}`,
  ).join("\n");
  return {
    content: `📅 **Agenda ${tecnico.toUpperCase()} — ${dataStr}** (${slot.length} interventi):\n\n${lines}`,
    data: { tecnico, giorno: giorno.toISOString().slice(0, 10), count: slot.length },
  };
}

async function handleChronosScadenze(parametri) {
  const finestraGiorni = Number(parametri.finestraGiorni) || 60;
  const now = new Date();
  const limite = new Date(now.getTime() + finestraGiorni * 86400000);

  let snap;
  try {
    snap = await getCosminaDb().collection("cosmina_impianti").limit(300).get();
  } catch (e) {
    const msg = String(e?.message || e);
    if (/permission|denied|UNAUTHENTICATED|403|NOT_FOUND/i.test(msg)) {
      return { content: "CHRONOS non riesce a leggere `cosmina_impianti` (permessi o collection assente)." };
    }
    throw e;
  }

  const rows = [];
  snap.forEach((d) => {
    const data = d.data() || {};
    const candidates = [
      data.data_prossima_manutenzione,
      data.prossima_manutenzione,
      data.data_scadenza,
      data.scadenza_curit,
      data.dataScadenza,
    ];
    let scadenza = null;
    for (const c of candidates) {
      if (!c) continue;
      try {
        const d2 = c.toDate ? c.toDate() : new Date(c);
        if (!Number.isNaN(d2.getTime())) { scadenza = d2; break; }
      } catch {}
    }
    if (!scadenza || scadenza < now || scadenza > limite) return;

    rows.push({
      id: d.id,
      data: scadenza,
      cond: data.condominio || data.indirizzo || "?",
      modello: data.modello || "",
    });
  });

  rows.sort((a, b) => a.data.getTime() - b.data.getTime());
  if (!rows.length) {
    return { content: `Nessuna scadenza manutenzione trovata nei prossimi ${finestraGiorni} giorni.` };
  }

  const top = rows.slice(0, 10);
  const lines = top.map((r, i) => {
    const d = r.data.toLocaleDateString("it-IT");
    const giorni = Math.ceil((r.data.getTime() - now.getTime()) / 86400000);
    const urg = giorni <= 7 ? " ⚠️" : "";
    return `${i + 1}. [${d}] (${giorni}g)${urg} ${r.cond.slice(0, 45)} ${r.modello ? `· ${r.modello}` : ""}`;
  }).join("\n");
  const more = rows.length > 10 ? `\n…e altre ${rows.length - 10}.` : "";
  return {
    content: `📆 **${rows.length} scadenze** nei prossimi ${finestraGiorni}g:\n\n${lines}${more}`,
    data: { count: rows.length },
  };
}

async function handleFattureScadute() {
  // CHARTA v0.1: aggrega email FATTURA_FORNITORE + RICHIESTA_PAGAMENTO
  // come segnale. Totali reali richiedono integrazione Fatture-in-Cloud.
  const emails = await fetchIrisEmails(500);
  const fatt = emails.filter(e => e.category === "FATTURA_FORNITORE");
  const rich = emails.filter(e => e.category === "RICHIESTA_PAGAMENTO");
  const parts = [`💰 **CHARTA v0.1** — dati da email indicizzate (Fatture-in-Cloud non ancora integrato)`];
  parts.push(`\n📥 ${fatt.length} fatture fornitori + ${rich.length} richieste pagamento.`);
  if (fatt.length) {
    const lines = fatt.slice(0, 5).map(emailLine).join("\n");
    parts.push(`\nUltime fatture ricevute:\n${lines}`);
  }
  return { content: parts.join("\n"), data: { fatture: fatt.length, richieste: rich.length } };
}

async function handleChartaIncassiOggi() {
  // Cerca email "PAGAMENTO_RICEVUTO" o con sentiment=incasso/pagamento
  const emails = await fetchIrisEmails(300);
  const today = emails.filter(e => isToday(e.received));
  const incassi = today.filter(e =>
    /pagament|incass|bonifico|accredit|saldo/i.test(
      `${e.subject} ${e.summary}`,
    ),
  );
  if (!incassi.length) {
    return { content: "💰 Oggi non ho indicizzato email che segnalano incassi." };
  }
  const lines = incassi.slice(0, 8).map(emailLine).join("\n");
  return {
    content: `💰 **${incassi.length} email oggi** con keyword incasso/pagamento:\n\n${lines}\n\n_CHARTA v0.1: per importi reali serve Fatture-in-Cloud._`,
    data: { count: incassi.length },
  };
}

async function handleChartaReportMensile(parametri) {
  let yyyymm = String(parametri.mese || parametri.yyyymm || parametri.periodo || "").trim()
    || new Date().toISOString().slice(0, 7);
  // Se Haiku manda solo il mese (es. "04") o "mese=4", completa con anno corrente
  if (/^\d{1,2}$/.test(yyyymm)) {
    const anno = new Date().getFullYear();
    yyyymm = `${anno}-${yyyymm.padStart(2, "0")}`;
  } else if (/^\d{4}-\d{1,2}$/.test(yyyymm)) {
    const [a, m] = yyyymm.split("-");
    yyyymm = `${a}-${m.padStart(2, "0")}`;
  }
  const emails = await fetchIrisEmails(500);

  const m = /^(\d{4})-(\d{2})$/.exec(yyyymm);
  if (!m) return { content: `Formato mese non valido: "${yyyymm}". Usa YYYY-MM.` };
  const start = new Date(`${yyyymm}-01T00:00:00Z`);
  const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1);

  let forn = 0, rich = 0, guast = 0, contr = 0;
  for (const e of emails) {
    if (!e.received) continue;
    const ric = new Date(e.received);
    if (ric < start || ric >= end) continue;
    if (e.category === "FATTURA_FORNITORE") forn++;
    else if (e.category === "RICHIESTA_PAGAMENTO") rich++;
    else if (e.category === "GUASTO_URGENTE") guast++;
    else if (e.category === "RICHIESTA_CONTRATTO") contr++;
  }

  return {
    content:
      `📊 **Report mensile ${yyyymm}** (CHARTA v0.1, dati da iris_emails):\n\n` +
      `  · Fatture fornitori: ${forn}\n` +
      `  · Richieste pagamento: ${rich}\n` +
      `  · Guasti urgenti: ${guast}\n` +
      `  · Richieste contratto: ${contr}\n\n` +
      `_Totali € reali arriveranno con integrazione Fatture-in-Cloud._`,
    data: { yyyymm, forn, rich, guast, contr },
  };
}

// ─── Router handlers ─────────────────────────────────────────────
//
// Mappa (collega, azione/alias) → handler. Le "azioni" sono stringhe
// libere dal modello: uso matching fuzzy su sostringhe + sinonimi.

const DIRECT_HANDLERS = [
  { match: (col, az) => col === "iris" && /urgen/.test(az), fn: handleContaEmailUrgenti },
  { match: (col, az) => col === "iris" && /(oggi|today|di_oggi|ricevute_oggi)/.test(az), fn: handleEmailOggi },
  { match: (col, az) => col === "iris" && /(total|conta_email|count|quant(e|it))/.test(az) && !/urgen/.test(az), fn: handleEmailTotali },
  { match: (col, az) => col === "iris" && /(mittente|sender|cerca_email|ricerca|email_da|da_mittente)/.test(az), fn: handleRicercaEmailMittente },
  { match: (col, az) => col === "iris" && /(senza_risposta|no_reply|attesa|followup|follow_up)/.test(az), fn: handleEmailSenzaRisposta },
  { match: (col, az) => col === "iris" && /(categoria|per_categoria|breakdown)/.test(az), fn: handleEmailPerCategoria },
  { match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase();
    return (col === "memo" && /(dossier|cliente|condominio|tutto_su|storico|impian|ricerca)/.test(az))
      || /dimmi\s+tutto.*(su|di|sul|sulla)|chi\s+e|dossier|storico\s+di/.test(m);
  }, fn: handleMemoDossier },
  { match: (col, az) => /lavagna/.test(az) && col !== "pharo", fn: handleStatoLavagna },
  // CHARTA — SCRITTURA: registra incasso (DRY_RUN default)
  { match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase();
    return (col === "charta" && /(registr|aggiung|nuovo|insert|salva|record).*incass/.test(az))
      || (col === "charta" && /registr_incass|aggiung_incass|nuovo_pag/.test(az))
      || /^\s*(registr|aggiung|nuov|salv)\w*\s+(?:un\s+)?(incass|pagament)/.test(m);
  }, fn: handleChartaRegistraIncasso },
  // CHARTA — report mensile (PRIMA di DELPHI perché Haiku può mandare report a DELPHI)
  { match: (col, az) => (col === "charta" || col === "delphi") && /(report.*mens|mens.*report|report_mensile|mese|mensile)/.test(az), fn: handleChartaReportMensile },
  { match: (col, az) => col === "charta" && /(incass|pagament|accredit|bonifico)/.test(az) && /(oggi|today)/.test(az), fn: handleChartaIncassiOggi },
  { match: (col, az) => col === "charta" && /(fattura|scadut|incass|pagament|accredit)/.test(az), fn: handleFattureScadute },
  // ARES — SCRITTURA: apri intervento (DRY_RUN default). Ha priorità
  // sopra la LETTURA "interventi_aperti" perché il verbo chiave è diverso.
  { match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase();
    return (col === "ares" && /(apri_intervent|crea_intervent|nuovo_intervent|open_intervent)/.test(az))
      || /^\s*(apri|crea|nuovo|aggiungi)\s+(un\s+)?intervent/.test(m);
  }, fn: handleAresApriIntervento },
  // ARES — LETTURA interventi aperti
  { match: (col, az) => col === "ares" && /(intervent|apert|attiv|in_corso|lista|cosa.*fare|oggi|giorno)/.test(az), fn: handleAresInterventiAperti },
  // ECHO — invio WhatsApp (DRY-RUN default, whitelist obbligatoria)
  { match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase();
    return (col === "echo" && /(whatsapp|wa|send_whatsapp|send_wa|send_message|invia)/.test(az))
      || /(manda|invia|scrivi).*(whatsapp|wa\b|messaggio.*whats)/.test(m);
  }, fn: handleEchoWhatsApp },
  // CALLIOPE — bozze risposta email (Claude Sonnet, DRY-RUN)
  { match: (col, az) => col === "calliope" && /(bozza|scriv|risp|preventiv|sollecit|comunicazion)/.test(az), fn: handleCalliopeBozza },
  // PHARO — monitoring RTI Guazzotti (priorità su stato suite quando si parla di RTI/ticket)
  { match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase();
    return (col === "pharo" && /(rti|rtidf|ticket|guazzott|pending|rapporti|monitor)/.test(az))
      || /rti\b|rtidf|guazzott.*monitor|ticket.*apert|pending.*rti|monitor.*rti/.test(m);
  }, fn: handlePharoRtiMonitoring },
  // PHARO — monitoring generico suite (match anche senza richiedere col=pharo, perché Haiku
  //   può instradare "stato suite" a "nessuno" o altri Colleghi)
  { match: (col, az, int) => {
    const msg = String((int && int.userMessage) || "").toLowerCase();
    return col === "pharo" || /stato.*suite|salute.*sistema|health.*check|suite.*stato|suite.*status/.test(az + " " + msg);
  }, fn: handlePharoStatoSuite },
  { match: (col, az) => col === "pharo" && /(problem|alert|error|aperti|senza_ris|follow_up|issue|bloccat)/.test(az), fn: handlePharoProblemiAperti },
  // DELPHI — confronto mese su mese (PRIMA di KPI generico)
  { match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase();
    return (col === "delphi" && /(confront|mom|mese.*su.*mese|rispetto.*mese|vs.*mese)/.test(az))
      || /confronto.*mese|rispetto.*al.*mese|mese.*su.*mese/.test(m);
  }, fn: handleDelphiConfrontoMoM },
  // DELPHI — KPI e costo AI (match sia da azione che da messaggio)
  { match: (col, az, ctx) => {
    const msg = (ctx?.userMessage || "").toLowerCase();
    return (col === "delphi" && /(costo.*ai|ai.*costo|token|spesa.*ai|budget)/.test(az))
      || /costo.*ai|spesa.*ai|token.*consum/.test(msg);
  }, fn: handleDelphiCostoAI },
  { match: (col, az, ctx) => {
    const msg = (ctx?.userMessage || "").toLowerCase();
    return (col === "delphi" && /(kpi|dashboard|andament|sintes|riassunto|come_siamo|come_andat)/.test(az))
      || /come.*siamo.*andat|come.*(va|vanno).*mese|andament.*mens|riassunto.*mese|kpi|dashboard/.test(msg);
  }, fn: handleDelphiKpi },
  // DIKEA — compliance: scadenze CURIT e impianti senza targa
  // Targa: match anche se Haiku sbaglia collega (MEMO/ARES) — la parola "targa" è univoca
  { match: (col, az, ctx) => {
    const msg = (ctx?.userMessage || "").toLowerCase();
    return (col === "dikea" && /(targa|senza|censit)/.test(az))
      || /impianti.*senza.*targa|targa.*cit|senza.*targa/.test(msg);
  }, fn: handleDikeaImpiantiSenzaTarga },
  { match: (col, az) => col === "dikea" && /(curit|ree|bollino|compliance|normat|scadenz)/.test(az), fn: handleDikeaScadenzeCurit },
  // EMPORION — magazzino
  { match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase();
    return (col === "emporion" && /(sotto.*scort|manca|mancan|riordin|scort.*min)/.test(az))
      || /cosa.*manca|sotto.*scort|articoli.*mancant/.test(m);
  }, fn: handleEmporionSottoScorta },
  { match: (col, az) => col === "emporion" && /(disponibil|giacenz|ricambi|pezz|articol|magazzin|c.*il.*pezz)/.test(az), fn: handleEmporionDisponibilita },
  // CHRONOS — agenda giornaliera (ha priorità rispetto allo slot generico)
  { match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase();
    return (col === "chronos" && /(agenda.*giorn|agenda.*tecnico|giornata|agenda_giorn)/.test(az))
      || /agenda.*(di|del|per)\s+\w+.*(oggi|domani|dopodomani|\d{1,2}\/\d{1,2})/.test(m)
      || /agenda.*di.*\w+$/.test(m);
  }, fn: handleChronosAgendaGiornaliera },
  // CHRONOS — slot tecnici e scadenze
  { match: (col, az) => col === "chronos" && /(scadenz|manutenz|curit|imminente|prossim.*manut)/.test(az), fn: handleChronosScadenze },
  { match: (col, az) => col === "chronos" && /(slot|libero|quando|agenda|disponib|prossim|impegni|fa.*domani|fa.*oggi)/.test(az), fn: handleChronosSlotTecnico },
];

async function tryDirectAnswer(intent, userMessage) {
  const azione = (intent.azione || "").toLowerCase();
  const collega = (intent.collega || "").toLowerCase();
  const ctx = { userMessage: String(userMessage || "") };
  const handler = DIRECT_HANDLERS.find(h => h.match(collega, azione, ctx));
  if (!handler) return null;
  try {
    const result = await handler.fn(intent.parametri || {}, ctx);
    return result;
  } catch (e) {
    logger.error("nexus handler failed", {
      error: String(e), collega, azione,
    });
    return {
      content: `Ho provato a rispondere ma la query è fallita: ${String(e).slice(0, 200)}`,
      _failed: true,
    };
  }
}

async function postLavagnaFromNexus({ collega, azione, parametri, rispostaUtente, userMessage, sessionId, nexusMessageId }) {
  const now = FieldValue.serverTimestamp();
  const ref = db.collection("nexo_lavagna").doc();
  await ref.set({
    id: ref.id,
    from: "nexus",
    to: collega,
    type: `nexus_${azione}`,
    payload: {
      azione,
      parametri,
      userMessage,
      nexusChatMessageId: nexusMessageId,
      sessionId,
      rispostaPreliminareNexus: rispostaUtente,
    },
    status: "pending",
    priority: "normal",
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
}

export const nexusRouter = onRequest(
  {
    region: REGION,
    cors: false,
    secrets: [ANTHROPIC_API_KEY],
    timeoutSeconds: 60,
    memory: "256MiB",
    maxInstances: 10,
  },
  async (req, res) => {
    applyCors(req, res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") {
      res.status(405).json({ error: "method_not_allowed" });
      return;
    }

    // Auth: richiede ID Token valido di garbymobile-f89ac (ACG Suite SSO)
    const authUser = await verifyAcgIdToken(req);
    if (!authUser) {
      res.status(401).json({ error: "unauthorized", message: "Firebase ID Token ACG mancante o non valido" });
      return;
    }

    const ip = (req.headers["x-forwarded-for"] || req.ip || "")
      .toString().split(",")[0].trim();
    const rate = await checkNexusRateLimit(ip);
    if (!rate.ok) {
      res.set("Retry-After", "3600");
      res.status(429).json({ error: rate.reason });
      return;
    }

    const body = req.body || {};
    const userMessage = String(body.userMessage || "").trim();
    const sessionId = String(body.sessionId || "").trim();
    // userId viene dal token Firebase (fidato), non dal body
    const userId = authUser.email || authUser.uid;
    const history = Array.isArray(body.history) ? body.history.slice(-10) : [];

    if (!userMessage || !sessionId) {
      res.status(400).json({ error: "missing_userMessage_or_sessionId" });
      return;
    }
    if (userMessage.length > 2000) {
      res.status(400).json({ error: "userMessage_too_long" });
      return;
    }

    // Ensure session exists
    await ensureNexusSession(sessionId, userId, userMessage);

    // Persist user message immediately (so chat UI vede conferma)
    const userMsgId = await writeNexusMessage(sessionId, {
      role: "user", content: userMessage,
    });

    // Interpret via Haiku
    const apiKey = ANTHROPIC_API_KEY.value();
    if (!apiKey) {
      res.status(500).json({ error: "missing_anthropic_key" });
      return;
    }

    const messages = [];
    for (const h of history) {
      if (!h || typeof h !== "object") continue;
      const role = h.role === "assistant" ? "assistant" : h.role === "user" ? "user" : null;
      if (!role) continue;
      const content = String(h.content || "").slice(0, 2000);
      if (content) messages.push({ role, content });
    }
    messages.push({ role: "user", content: userMessage });

    let haiku;
    try {
      const haikuResp = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 512,
          system: NEXUS_SYSTEM_PROMPT,
          messages,
        }),
      });
      if (!haikuResp.ok) {
        const errText = await haikuResp.text();
        throw new Error(`Anthropic ${haikuResp.status}: ${errText.slice(0, 300)}`);
      }
      const haikuJson = await haikuResp.json();
      const haikuText = (haikuJson.content || [])
        .filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      haiku = { text: haikuText, usage: haikuJson.usage || {} };
    } catch (e) {
      logger.error("nexus anthropic failed", { error: String(e) });
      res.status(502).json({ error: "anthropic_failed", detail: String(e).slice(0, 300) });
      return;
    }

    const intent = parseAndValidateIntent(haiku.text, userMessage);

    let lavagnaMessageId = null;
    let stato = "diretta";
    let fallbackMessage;
    let directAnswer = null;

    // 1. Provo prima a rispondere direttamente con una query Firestore.
    //    Se matcha un handler, saltiamo la Lavagna: l'utente riceve la
    //    risposta reale in questa stessa richiesta.
    if (intent.collega !== "nessuno" && intent.collega !== "multi") {
      directAnswer = await tryDirectAnswer(intent, userMessage);
    }

    if (directAnswer) {
      stato = directAnswer._failed ? "errore" : "completata";
    } else if (intent.collega !== "nessuno" && intent.collega !== "multi") {
      // 2. Nessun handler locale: è un'azione operativa → Lavagna.
      if (COLLEGHI_ATTIVI.has(intent.collega)) {
        stato = "in_attesa_collega";
      } else {
        stato = "collega_inattivo";
        fallbackMessage = `Richiesta inviata a ${intent.collega.toUpperCase()}. ` +
          `Il Collega non è ancora attivo — quando sarà implementato, gestirà questa richiesta automaticamente.`;
      }
      const assistantMsgDraftId = db.collection("nexus_chat").doc().id;
      lavagnaMessageId = await postLavagnaFromNexus({
        collega: intent.collega,
        azione: intent.azione,
        parametri: intent.parametri,
        rispostaUtente: intent.rispostaUtente,
        userMessage,
        sessionId,
        nexusMessageId: assistantMsgDraftId,
      });
    }

    // Testo finale mostrato all'utente:
    //   · se abbiamo una directAnswer → mostra i dati reali
    //   · se abbiamo fallback Lavagna → mostra preliminare + placeholder
    //   · altrimenti → solo la rispostaUtente del modello
    const assistantContent = directAnswer
      ? directAnswer.content
      : fallbackMessage
        ? `${intent.rispostaUtente}\n\n${fallbackMessage}`
        : intent.rispostaUtente;

    const nexusMessageId = await writeNexusMessage(sessionId, {
      role: "assistant",
      content: assistantContent,
      collegaCoinvolto: intent.collega,
      lavagnaMessageId,
      azione: intent.azione,
      parametri: intent.parametri,
      stato,
      usage: {
        inputTokens: haiku.usage.input_tokens || 0,
        outputTokens: haiku.usage.output_tokens || 0,
        modello: MODEL,
      },
    });

    // Update session metadata
    await db.collection("nexus_sessions").doc(sessionId).set({
      ultimoMessaggioAt: FieldValue.serverTimestamp(),
      messaggiCount: FieldValue.increment(2),
    }, { merge: true });

    res.status(200).json({
      intent,
      nexusMessageId,
      userMsgId,
      lavagnaMessageId,
      stato,
      fallbackMessage,
      direct: directAnswer ? { data: directAnswer.data, failed: !!directAnswer._failed } : null,
      modello: MODEL,
      usage: haiku.usage,
    });
  }
);


// ─────────────────────────────────────────────────────────────────
//  RuleEngine IRIS — onCreate iris_emails (config-driven)
// ─────────────────────────────────────────────────────────────────
//
// Le regole sono memorizzate in Firestore `iris_rules` (nexo-hub-15f2d).
// Ogni regola ha: id, name, description, enabled, priority, stopOnMatch,
// conditions[], actions[].
//
// Condition schema: { field, op, value }
//   field: "category" | "sender" | "subject" | "body" | "sentiment"
//   op:    "equals" | "contains" | "startsWith" | "regex" | "in" | "not_equals"
//
// Action schema (5 tipi, seed_rules.py):
//   - write_lavagna  { to, messageType, priority?, payload? }
//   - notify_echo    { channel: "wa"|..., text }
//   - extract_data   { extractPatterns: { fieldName: regex } }
//   - archive_email
//   - set_priority   { priority }
//
// Idempotenza: se `rule_processed_at` esiste sul doc email, skip.
// Priorità: regole ordinate DESC. Se `stopOnMatch=true` e matcha, stop.

async function loadIrisRules() {
  // Prova query con indice composto; fallback a fetch + filtro client-side
  // se l'indice non è ancora propagato (deploy iniziale).
  try {
    const snap = await db.collection("iris_rules")
      .where("enabled", "==", true)
      .orderBy("priority", "desc")
      .get();
    const rules = [];
    snap.forEach(d => rules.push({ id: d.id, ...d.data() }));
    return rules;
  } catch (e) {
    const msg = String(e?.message || e);
    if (/FAILED_PRECONDITION|requires an index/i.test(msg)) {
      logger.warn("loadIrisRules: index missing, fallback to scan");
      try {
        const snap = await db.collection("iris_rules").get();
        const rules = [];
        snap.forEach(d => {
          const data = d.data();
          if (data.enabled === true) rules.push({ id: d.id, ...data });
        });
        rules.sort((a, b) => (b.priority || 0) - (a.priority || 0));
        return rules;
      } catch (e2) {
        logger.error("loadIrisRules fallback failed", { error: String(e2) });
        return [];
      }
    }
    logger.error("loadIrisRules failed", { error: msg });
    return [];
  }
}

function ruleFieldValue(emailData, field) {
  const raw = emailData.raw || {};
  const cls = emailData.classification || {};
  switch (field) {
    case "category":  return String(cls.category || "");
    case "sender":    return String(raw.sender || raw.sender_name || "");
    case "subject":   return String(raw.subject || "");
    case "body":      return String(raw.body_text || raw.body || "");
    case "sentiment": return String(cls.sentiment || "");
    case "suggestedAction": return String(cls.suggestedAction || "");
    default: return "";
  }
}

function ruleConditionMatches(cond, emailData) {
  const val = ruleFieldValue(emailData, cond.field);
  const expected = cond.value;
  switch (cond.op) {
    case "equals":     return val === expected;
    case "not_equals": return val !== expected;
    case "contains":   return val.toLowerCase().includes(String(expected).toLowerCase());
    case "startsWith": return val.toLowerCase().startsWith(String(expected).toLowerCase());
    case "in":         return Array.isArray(expected) && expected.includes(val);
    case "regex":
      try { return new RegExp(expected, "i").test(val); } catch { return false; }
    default: return false;
  }
}

function ruleAllConditionsMatch(rule, emailData) {
  const conds = Array.isArray(rule.conditions) ? rule.conditions : [];
  if (conds.length === 0) return false;  // regola senza condizioni = skip
  return conds.every(c => ruleConditionMatches(c, emailData));
}

// ─── Action handlers ──────────────────────────────────────────

async function postLavagna({ to, type, payload, priority = "normal", from = "iris_rules" }) {
  const ref = db.collection("nexo_lavagna").doc();
  const now = FieldValue.serverTimestamp();
  await ref.set({
    id: ref.id,
    from, to, type, payload: payload || {},
    status: "pending", priority,
    createdAt: now, updatedAt: now,
  });
  return ref.id;
}

async function actionWriteLavagna(action, ctx) {
  const payload = {
    ...(action.payload || {}),
    sourceEmailId: ctx.emailId,
    triggeredByRule: ctx.ruleId,
    extracted: ctx.extracted || undefined,
  };
  const lavId = await postLavagna({
    to: action.to,
    type: action.messageType || `iris_${ctx.ruleId}`,
    payload,
    priority: action.priority || "normal",
    from: "iris_rules",
  });
  return { type: "write_lavagna", to: action.to, lavagnaId: lavId };
}

async function actionNotifyEcho(action, ctx) {
  // Convenzione: ECHO riceve un messaggio sulla Lavagna con type=iris_whatsapp_alberto
  // I colleghi consumeranno la Lavagna quando avranno il listener; per ora
  // il messaggio resta pending, visibile nella PWA.
  const text = String(action.text || "").trim() || "Notifica IRIS (senza testo)";
  const lavId = await postLavagna({
    to: "echo",
    type: "iris_notify",
    payload: {
      canale: action.channel || "wa",
      destinatario: "Alberto",
      testo: text,
      sourceEmailId: ctx.emailId,
      triggeredByRule: ctx.ruleId,
    },
    priority: ctx.priorityBoost || "normal",
    from: "iris_rules",
  });
  return { type: "notify_echo", channel: action.channel || "wa", lavagnaId: lavId };
}

async function actionArchiveEmail(action, ctx) {
  await ctx.emailRef.set({
    status: "archived",
    archivedAt: FieldValue.serverTimestamp(),
    archivedBy: "iris_rules",
  }, { merge: true });
  return { type: "archive_email" };
}

function actionExtractData(action, ctx) {
  // Pattern estrazione regex da body. Salva in ctx.extracted accumulativo.
  const body = ruleFieldValue(ctx.emailData, "body");
  const patterns = action.extractPatterns || {};
  const found = {};
  for (const [fieldName, pattern] of Object.entries(patterns)) {
    try {
      const re = new RegExp(pattern, "i");
      const m = re.exec(body);
      if (m) found[fieldName] = m[1] || m[0];
    } catch (e) {
      logger.warn("extract_data: bad regex", { fieldName, pattern, error: String(e) });
    }
  }
  ctx.extracted = { ...(ctx.extracted || {}), ...found };
  logger.info("extract_data", { emailId: ctx.emailId, ruleId: ctx.ruleId, found });
  return { type: "extract_data", fieldsFound: Object.keys(found) };
}

function actionSetPriority(action, ctx) {
  // Boost priority per gli action successivi (es. notify_echo)
  if (action.priority) ctx.priorityBoost = action.priority;
  return { type: "set_priority", priority: action.priority };
}

async function executeAction(action, ctx) {
  switch (action.type) {
    case "write_lavagna":  return await actionWriteLavagna(action, ctx);
    case "notify_echo":    return await actionNotifyEcho(action, ctx);
    case "archive_email":  return await actionArchiveEmail(action, ctx);
    case "extract_data":   return actionExtractData(action, ctx);
    case "set_priority":   return actionSetPriority(action, ctx);
    default:
      logger.warn("unknown action type", { type: action.type, ruleId: ctx.ruleId });
      return { type: action.type, error: "unknown_action_type" };
  }
}

async function applyRulesToEmail(emailId, emailData, emailRef) {
  const rules = await loadIrisRules();
  if (rules.length === 0) {
    logger.info("applyRules: no enabled rules");
    return { matched: [], actionsExecuted: [] };
  }

  const matched = [];
  const actionsExecuted = [];

  for (const rule of rules) {
    if (!ruleAllConditionsMatch(rule, emailData)) continue;
    matched.push(rule.id);

    // Esegui azioni in ordine, share context (extracted + priorityBoost)
    const ctx = { emailId, emailData, emailRef, ruleId: rule.id };
    for (const action of (rule.actions || [])) {
      try {
        const r = await executeAction(action, ctx);
        actionsExecuted.push({ ruleId: rule.id, ...r });
      } catch (e) {
        logger.error("action failed", {
          ruleId: rule.id, actionType: action.type, error: String(e),
        });
        actionsExecuted.push({ ruleId: rule.id, type: action.type, error: String(e).slice(0, 150) });
      }
    }

    if (rule.stopOnMatch !== false) {
      logger.info("rule matched with stopOnMatch, halt", { ruleId: rule.id });
      break;
    }
  }

  return { matched, actionsExecuted };
}

export const irisRuleEngine = onDocumentCreated(
  { region: REGION, document: "iris_emails/{emailId}", memory: "256MiB", maxInstances: 5 },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const emailId = event.params.emailId;
    const data = snap.data() || {};

    // Idempotenza
    if (data.rule_processed_at) {
      logger.info("rule already applied", { emailId });
      return;
    }

    let result;
    try {
      result = await applyRulesToEmail(emailId, data, snap.ref);
    } catch (e) {
      logger.error("applyRulesToEmail failed", { error: String(e), emailId });
      return;
    }

    try {
      await snap.ref.set({
        rule_processed_at: FieldValue.serverTimestamp(),
        rules_matched: result.matched,
        actions_executed: result.actionsExecuted,
      }, { merge: true });
    } catch (e) {
      logger.error("mark processed failed", { error: String(e), emailId });
    }

    logger.info("rules evaluated", {
      emailId, matched: result.matched, actionsCount: result.actionsExecuted.length,
    });
  }
);

// ─────────────────────────────────────────────────────────────────
//  irisPoller — polling 24/7 via Cloud Scheduler (every 5 min)
// ─────────────────────────────────────────────────────────────────
//
// Config Firestore (progetto garbymobile-f89ac):
//   cosmina_config/iris_config = {
//     enabled: true,
//     auth: "basic",
//     user: "user@example.com",
//     password: "...",
//     server: "https://mail.example.com/EWS/Exchange.asmx",
//     exchange_version: "2013_SP1" | "2010_SP2",
//     limit_per_run: 50,       // opzionale
//     initial_lookback_hours: 24  // opzionale per primo run
//   }
//
// Watermark: nexo-hub.iris_poller_state/default.lastProcessedIso
//   Incrementato dopo ogni run all'ora dell'ultima email processata.
//
// Deduplica: skip se iris_emails/{message_id_hash} esiste già.
// Classificazione Haiku inline (vedi iris-poller.mjs).
// irisRuleEngine si attiva automaticamente via onDocumentCreated.

const IRIS_POLLER_STATE_COLL = "iris_poller_state";
const IRIS_POLLER_STATE_DOC = "default";

function hashMessageId(msgId) {
  // Hash deterministico per doc id Firestore (evita caratteri speciali negli IMAP IDs)
  let h = 0;
  for (let i = 0; i < msgId.length; i++) {
    h = ((h << 5) - h + msgId.charCodeAt(i)) | 0;
  }
  return `ews_${Math.abs(h).toString(36)}_${msgId.length}`;
}

async function runIrisPoller() {
  // 1. Leggi config
  const cfgSnap = await getCosminaDb().collection("cosmina_config").doc("iris_config").get();
  if (!cfgSnap.exists) {
    logger.info("irisPoller: iris_config missing, skipping");
    return { skipped: "no_config" };
  }
  const cfg = cfgSnap.data() || {};
  if (cfg.enabled === false) {
    logger.info("irisPoller: disabled via config");
    return { skipped: "disabled" };
  }
  if (!cfg.server || !cfg.user || !cfg.password) {
    logger.warn("irisPoller: iris_config incomplete", {
      hasServer: !!cfg.server, hasUser: !!cfg.user, hasPassword: !!cfg.password,
    });
    return { skipped: "incomplete_config" };
  }

  // 2. Leggi watermark
  const stateRef = db.collection(IRIS_POLLER_STATE_COLL).doc(IRIS_POLLER_STATE_DOC);
  const stateSnap = await stateRef.get();
  let lastProcessedIso = stateSnap.exists ? (stateSnap.data() || {}).lastProcessedIso : null;
  if (!lastProcessedIso) {
    // Primo run: ultime N ore (default 24)
    const hrs = cfg.initial_lookback_hours || 24;
    lastProcessedIso = new Date(Date.now() - hrs * 3600 * 1000).toISOString();
    logger.info("irisPoller: first run, lookback", { hours: hrs, from: lastProcessedIso });
  }

  // 3. Fetch EWS
  const { fetchNewEmails, classifyEmail } = await import("./iris-poller.mjs");
  const limit = Number(cfg.limit_per_run) || 50;
  let emails;
  try {
    emails = await fetchNewEmails({ cfg, dateFromIso: lastProcessedIso, limit });
  } catch (e) {
    logger.error("irisPoller: EWS fetch failed", { error: String(e) });
    return { error: "ews_fetch_failed", detail: String(e).slice(0, 300) };
  }

  if (!emails.length) {
    logger.info("irisPoller: no new emails", { from: lastProcessedIso });
    return { processed: 0, skipped_existing: 0 };
  }

  // 4. Classifica + scrivi Firestore (skip duplicati)
  const anthropicKey = ANTHROPIC_API_KEY.value();
  if (!anthropicKey) {
    logger.error("irisPoller: ANTHROPIC_API_KEY missing");
    return { error: "no_api_key" };
  }

  let processed = 0;
  let skippedExisting = 0;
  let classifyErrors = 0;
  let latestReceivedIso = lastProcessedIso;

  for (const email of emails) {
    const docId = hashMessageId(email.message_id);
    const existing = await db.collection("iris_emails").doc(docId).get();
    if (existing.exists) {
      skippedExisting++;
      continue;
    }

    let classification;
    try {
      const r = await classifyEmail(anthropicKey, email);
      classification = r.classification;
    } catch (e) {
      classifyErrors++;
      logger.warn("irisPoller: classify failed", { error: String(e), msgId: email.message_id });
      classification = { category: "ALTRO", summary: "", sentiment: "neutro", entities: {} };
    }

    try {
      await db.collection("iris_emails").doc(docId).set({
        id: docId,
        raw: email,
        classification,
        source: "irisPoller",
        createdAt: FieldValue.serverTimestamp(),
      });
      processed++;
    } catch (e) {
      logger.error("irisPoller: firestore write failed", { error: String(e) });
    }

    // Aggiorna watermark solo se il write è riuscito
    if (email.received_time > latestReceivedIso) {
      latestReceivedIso = email.received_time;
    }
  }

  // 5. Salva watermark
  await stateRef.set({
    lastProcessedIso: latestReceivedIso,
    lastRunAt: FieldValue.serverTimestamp(),
    lastRunProcessed: processed,
    lastRunSkippedExisting: skippedExisting,
    lastRunClassifyErrors: classifyErrors,
  }, { merge: true });

  logger.info("irisPoller: done", {
    processed, skippedExisting, classifyErrors, latestReceivedIso,
  });
  return { processed, skippedExisting, classifyErrors, latestReceivedIso };
}

export const irisPoller = onSchedule(
  {
    region: REGION,
    schedule: "every 5 minutes",
    timeZone: "Europe/Rome",
    memory: "512MiB",
    timeoutSeconds: 120,
    secrets: [ANTHROPIC_API_KEY],
  },
  async () => {
    try {
      const r = await runIrisPoller();
      logger.info("irisPoller scheduled complete", r);
    } catch (e) {
      logger.error("irisPoller scheduled failed", { error: String(e) });
    }
  }
);

// HTTP trigger per forzare un run manuale (utile per debug/first-run).
// Richiede header X-Admin-Key matching cosmina_config/iris_config.admin_key.
export const irisPollerRun = onRequest(
  {
    region: REGION,
    secrets: [ANTHROPIC_API_KEY],
    timeoutSeconds: 120,
    memory: "512MiB",
    cors: false,
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "method_not_allowed" });
      return;
    }
    // Auth via admin_key da config
    const cfgSnap = await getCosminaDb().collection("cosmina_config").doc("iris_config").get();
    const adminKey = (cfgSnap.data() || {}).admin_key;
    if (!adminKey || req.get("X-Admin-Key") !== adminKey) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    try {
      const r = await runIrisPoller();
      res.status(200).json(r);
    } catch (e) {
      res.status(500).json({ error: String(e).slice(0, 300) });
    }
  }
);

// LEGACY: export dormiente mantenuto per compatibilità con vecchi
// scheduler job già creati. Alla prossima pulizia si può rimuovere.
export const irisPollScheduled = onSchedule(
  { region: REGION, schedule: "every 1 hours", timeZone: "Europe/Rome", memory: "128MiB" },
  async () => {
    logger.info("irisPollScheduled: deprecated, noop. Use irisPoller.");
  }
);

// ─────────────────────────────────────────────────────────────────
//  Scheduler: pharoHealthCheck (5 min)
// ─────────────────────────────────────────────────────────────────

export const pharoHealthCheck = onSchedule(
  { region: REGION, schedule: "every 5 minutes", timeZone: "Europe/Rome", memory: "256MiB" },
  async () => {
    try {
      let firestoreOk = true;
      let pending = 0, errori = 0, emailAttesa = 0;

      // Check nexo_lavagna: troppi pending o errori?
      try {
        const snap = await db.collection("nexo_lavagna").orderBy("createdAt", "desc").limit(100).get();
        snap.forEach(d => {
          const s = (d.data() || {}).status;
          if (s === "pending" || s === "in_progress") pending++;
          else if (s === "failed" || s === "error" || s === "errore") errori++;
        });
      } catch { firestoreOk = false; }

      // Email senza risposta >48h
      try {
        const snap = await db.collection("iris_emails").orderBy("raw.received_time", "desc").limit(500).get();
        snap.forEach(d => {
          const f = (d.data() || {}).followup;
          if (f && f.needsAttention) emailAttesa++;
        });
      } catch { firestoreOk = false; }

      const punteggio = firestoreOk
        ? Math.max(0, Math.min(100, 100 - pending * 2 - errori * 5 - emailAttesa))
        : 0;

      // Persisti snapshot
      const now = FieldValue.serverTimestamp();
      await db.collection("pharo_health_snapshots").add({
        firestoreOk, pending, errori, emailAttesa, punteggio, createdAt: now,
      });

      // Se problemi gravi → Lavagna per ECHO
      const critico = !firestoreOk || errori >= 3 || emailAttesa >= 10;
      if (critico) {
        await db.collection("nexo_lavagna").add({
          from: "pharo_scheduler",
          to: "echo",
          type: "pharo_alert",
          payload: {
            testo: `⚠️ PHARO alert: Firestore ${firestoreOk ? "OK" : "DOWN"}, pending=${pending}, errori=${errori}, emailAttesa=${emailAttesa}`,
            punteggio,
          },
          status: "pending",
          priority: "high",
          createdAt: now, updatedAt: now,
        });
      }

      logger.info("pharoHealthCheck done", { punteggio, firestoreOk, pending, errori, emailAttesa, critico });
    } catch (e) {
      logger.error("pharoHealthCheck failed", { error: String(e) });
    }
  }
);

// ─────────────────────────────────────────────────────────────────
//  PHARO RTI Dashboard — endpoint HTTPS pubblico (lettura)
// ─────────────────────────────────────────────────────────────────
//
// GET /pharoRtiDashboard → ritorna lo stato corrente del monitoring
// RTI Guazzotti TEC (dati aggregati). Consumato dalla PWA PHARO page.

function applyCorsOpen(req, res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.set("Access-Control-Max-Age", "3600");
}

export const pharoRtiDashboard = onRequest(
  { region: REGION, cors: false, timeoutSeconds: 60, memory: "256MiB", maxInstances: 5 },
  async (req, res) => {
    applyCorsOpen(req, res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "GET") {
      res.status(405).json({ error: "method_not_allowed" });
      return;
    }
    // Auth ACG Suite
    const authUser = await verifyAcgIdToken(req);
    if (!authUser) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    try {
      const r = await handlePharoRtiMonitoring({});
      res.status(200).json(r.data || {});
    } catch (e) {
      logger.error("pharoRtiDashboard failed", { error: String(e) });
      res.status(500).json({ error: String(e).slice(0, 300) });
    }
  }
);

// ─────────────────────────────────────────────────────────────────
//  PHARO Alert Resolve — endpoint POST {alertId}
// ─────────────────────────────────────────────────────────────────

export const pharoResolveAlert = onRequest(
  { region: REGION, cors: false, timeoutSeconds: 30, memory: "128MiB", maxInstances: 5 },
  async (req, res) => {
    applyCorsOpen(req, res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") {
      res.status(405).json({ error: "method_not_allowed" });
      return;
    }
    // Auth ACG Suite
    const authUser = await verifyAcgIdToken(req);
    if (!authUser) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const body = req.body || {};
    const alertId = String(body.alertId || "").trim();
    if (!alertId) {
      res.status(400).json({ error: "missing_alertId" });
      return;
    }
    try {
      await db.collection("pharo_alerts").doc(alertId).set({
        status: "resolved",
        resolvedAt: FieldValue.serverTimestamp(),
        resolvedBy: authUser.email || authUser.uid,
      }, { merge: true });
      res.status(200).json({ ok: true, alertId });
    } catch (e) {
      logger.error("pharoResolveAlert failed", { error: String(e) });
      res.status(500).json({ error: String(e).slice(0, 300) });
    }
  }
);

// ─────────────────────────────────────────────────────────────────
//  Scheduler: pharoCheckRti (ogni 6 ore)
// ─────────────────────────────────────────────────────────────────
//
// Controlla RTI/pending/tickets di Guazzotti TEC e scrive alert in
// pharo_alerts. Alert critical → Lavagna per ECHO (WA Alberto).

async function writePharoAlert({ tipo, severita, titolo, descrizione, dati }) {
  const now = FieldValue.serverTimestamp();
  // Dedup: se esiste già un alert non risolto con stesso tipo, aggiorna solo lastSeen
  const existingSnap = await db.collection("pharo_alerts")
    .where("tipo", "==", tipo)
    .where("status", "==", "active")
    .limit(1)
    .get();
  if (!existingSnap.empty) {
    const d = existingSnap.docs[0];
    await d.ref.set({
      lastSeenAt: now,
      dati: dati || null,
      count: ((d.data() || {}).count || 1) + 1,
    }, { merge: true });
    return d.id;
  }
  const ref = db.collection("pharo_alerts").doc();
  await ref.set({
    id: ref.id,
    tipo,
    severita,
    titolo,
    descrizione: descrizione || "",
    dati: dati || null,
    status: "active",
    source: "pharoCheckRti",
    count: 1,
    createdAt: now,
    lastSeenAt: now,
  });
  return ref.id;
}

export const pharoCheckRti = onSchedule(
  { region: REGION, schedule: "every 6 hours", timeZone: "Europe/Rome", memory: "256MiB", timeoutSeconds: 120 },
  async () => {
    try {
      const r = await handlePharoRtiMonitoring({});
      const data = r.data || {};

      let alertCount = 0;
      let criticalCount = 0;

      for (const w of (data.warnings || [])) {
        const tipo = `rti_${w.titolo.slice(0, 60).toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
        await writePharoAlert({
          tipo,
          severita: w.severita || "warning",
          titolo: w.titolo,
          descrizione: w.descrizione,
          dati: { rti: data.rti, tickets: data.tickets, pending: data.pending },
        });
        alertCount++;
        if (w.severita === "critical") criticalCount++;
      }

      // Se almeno un alert critical → Lavagna per ECHO
      if (criticalCount > 0) {
        const now = FieldValue.serverTimestamp();
        await db.collection("nexo_lavagna").add({
          from: "pharo_scheduler",
          to: "echo",
          type: "pharo_rti_critical",
          payload: {
            testo: `🚨 PHARO alert critical Guazzotti TEC: ${criticalCount} problemi urgenti rilevati. Tickets aperti >14g senza RTI: ${data.tickets?.aperti_vecchi_14g || 0}. Verifica dashboard PHARO.`,
            rti: data.rti,
            tickets: data.tickets,
            pending: data.pending,
          },
          status: "pending",
          priority: "high",
          createdAt: now,
          updatedAt: now,
        });
      }

      logger.info("pharoCheckRti done", {
        alertCount,
        criticalCount,
        rti_total: data.rti?.total,
        tickets_aperti: data.tickets?.aperti,
        errors: (data.errors || []).length,
      });
    } catch (e) {
      logger.error("pharoCheckRti failed", { error: String(e) });
    }
  }
);

// ─────────────────────────────────────────────────────────────────
//  ARES Lavagna listener
// ─────────────────────────────────────────────────────────────────
//
// Ascolta nexo_lavagna: quando arriva un messaggio per ARES, esegue
// l'azione corrispondente. Supporta:
//   · type = "richiesta_intervento" | "nexus_apri_intervento" → apriIntervento
//   · type = "guasto_urgente" → apriIntervento urgenza=critica + notifica ECHO
// Segna il messaggio come status="completed" (o "failed") dopo esecuzione.

export const aresLavagnaListener = onDocumentCreated(
  { region: REGION, document: "nexo_lavagna/{msgId}", memory: "256MiB", maxInstances: 5 },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const msgId = event.params.msgId;
    const v = snap.data() || {};

    // Filtro: solo messaggi pending indirizzati ad ARES
    if (v.status !== "pending") return;
    const to = String(v.to || "").toLowerCase();
    if (to !== "ares") return;

    const type = String(v.type || "").toLowerCase();
    const isIntervento = /intervent|richiesta/.test(type);
    const isGuasto = /guasto_urgente|guasto|urgenza/.test(type);
    if (!isIntervento && !isGuasto) return;

    logger.info("aresLavagnaListener: processing", { msgId, type, to });

    const payload = v.payload || {};
    const parametri = payload.parametri || payload || {};

    // Per guasto urgente → forza urgenza critica
    if (isGuasto) parametri.urgenza = "critica";

    const ctx = { userMessage: String(payload.userMessage || "") };

    let result;
    try {
      result = await handleAresApriIntervento(parametri, ctx);
    } catch (e) {
      logger.error("aresLavagnaListener: apriIntervento failed", { error: String(e), msgId });
      await snap.ref.set({
        status: "failed",
        error: String(e).slice(0, 300),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return;
    }

    // Se guasto urgente → scrivi anche Lavagna per ECHO (notifica Alberto)
    if (isGuasto) {
      try {
        const interventoId = result?.data?.id || "?";
        const condominio = parametri.condominio || parametri.cliente || "?";
        await db.collection("nexo_lavagna").add({
          from: "ares",
          to: "echo",
          type: "notifica_guasto_urgente",
          payload: {
            testo: `🚨 Guasto urgente aperto: ${condominio} (${interventoId}). Verifica immediata.`,
            destinatario: "alberto",
            canale: "whatsapp",
            interventoId,
            condominio,
          },
          status: "pending",
          priority: "high",
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } catch (e) {
        logger.warn("aresLavagnaListener: echo notify failed", { error: String(e) });
      }
    }

    // Marca messaggio completato
    try {
      await snap.ref.set({
        status: "completed",
        result: {
          content: String(result?.content || "").slice(0, 500),
          data: result?.data || null,
        },
        processedBy: "aresLavagnaListener",
        completedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      logger.info("aresLavagnaListener: completed", { msgId, dryRun: result?.data?.dryRun });
    } catch (e) {
      logger.error("aresLavagnaListener: mark completed failed", { error: String(e), msgId });
    }
  }
);
