import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

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
  res.set("Access-Control-Allow-Headers", "Content-Type");
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

COLLEGHI (scegli esattamente uno slug):
- iris       → email in arrivo: classificazione, ricerca, thread, follow-up, regole
- echo       → uscita: WA, Telegram, email, notifiche, voce
- ares       → interventi tecnici: apri, assegna, chiudi, RTI
- chronos    → calendario: slot, scadenze, agende
- memo       → dossier cliente, storico impianti, ricerca documenti
- charta     → fatture, incassi, DDT, solleciti
- emporion   → magazzino, giacenze, ordini fornitori
- dikea      → CURIT, F-Gas, DiCo, PEC, GDPR
- delphi     → analisi: KPI, margini, trend, report
- pharo      → monitoring: alert, heartbeat, budget
- calliope   → bozze, preventivi, solleciti, PEC
- nessuno    → saluti, chiarimenti, richieste non operative

REGOLE:
- Rispondi SOLO con un oggetto JSON valido. Niente code fence, niente testo extra.
- Non inventare clienti, importi, condomini, date: chiedi chiarimento.
- Azione in snake_case (es. "cerca_email_urgenti", "apri_intervento").
- rispostaUtente: conversazionale, italiano, 1-2 frasi.

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
    const userId = String(body.userId || "alberto");
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

    if (intent.collega !== "nessuno" && intent.collega !== "multi") {
      if (COLLEGHI_ATTIVI.has(intent.collega)) {
        stato = "in_attesa_collega";
      } else {
        stato = "collega_inattivo";
        fallbackMessage = `Richiesta inviata a ${intent.collega.toUpperCase()}. ` +
          `Il Collega non è ancora attivo — quando sarà implementato, gestirà questa richiesta automaticamente.`;
      }

      // Creiamo comunque il messaggio Lavagna (bus async: resta pending
      // finché il Collega non è live).
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

    const assistantContent = fallbackMessage
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
      modello: MODEL,
      usage: haiku.usage,
    });
  }
);
