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

async function handleEmailPerCliente(parametri) {
  // "Dimmi tutto sul cliente X" → mini-dossier da iris_emails.
  //
  // MEMO v0.1 esiste come libreria (projects/memo/) ma il dossier
  // completo legge da `garbymobile-f89ac` (CRM, impianti, interventi)
  // — la Cloud Function NEXUS non ha ancora i permessi cross-progetto
  // (TODO: IAM Firestore Viewer su garbymobile-f89ac per il SA della
  // function). Per ora rispondo con l'unica fonte accessibile sul
  // progetto NEXO: iris_emails.
  // Cerca il nome in tutte le chiavi plausibili che Haiku potrebbe usare.
  const candidate =
    parametri.cliente || parametri.condominio || parametri.nome ||
    parametri.query || parametri.soggetto || parametri.target ||
    parametri.entita || parametri.entityName || parametri.name ||
    // fallback: prendi il primo valore string non vuoto
    Object.values(parametri).find((v) => typeof v === "string" && v.trim().length > 0) ||
    "";
  const q = String(candidate).trim().toLowerCase();
  if (!q) return { content: "Su quale cliente o condominio? Dammi un nome." };

  const emails = await fetchIrisEmails(500);
  const match = emails.filter(e => {
    const bag = [
      e.sender, e.senderName, e.subject, e.summary,
      e.entities.cliente, e.entities.condominio, e.entities.indirizzo,
    ].filter(Boolean).join(" ").toLowerCase();
    return bag.includes(q);
  });

  // Header chiaro: dico cosa MEMO vede e cosa NO.
  const header =
    `📇 **Mini-dossier per "${q}"** (MEMO v0.1 – solo email)\n\n` +
    `Per ora ho accesso solo a iris_emails. Il dossier completo (CRM ` +
    `cliente, impianti, interventi recenti) sarà disponibile quando ` +
    `attiveremo i permessi cross-progetto su garbymobile-f89ac.`;

  if (!match.length) {
    return { content: `${header}\n\nNon trovo email correlate a "${q}" nelle ultime 500.` };
  }
  const lines = match.slice(0, 10).map(emailLine).join("\n");
  const more = match.length > 10 ? `\n…e altre ${match.length - 10}.` : "";

  // Aggrego entità ricorrenti per dare contesto utile.
  const indirizzi = new Set();
  const tecnici = new Set();
  for (const e of match) {
    if (e.entities.indirizzo) indirizzi.add(e.entities.indirizzo);
    if (e.entities.tecnico) tecnici.add(e.entities.tecnico);
  }
  const ctxLines = [];
  if (indirizzi.size) ctxLines.push(`Indirizzi citati: ${[...indirizzi].slice(0, 3).join(" · ")}`);
  if (tecnici.size) ctxLines.push(`Tecnici citati: ${[...tecnici].slice(0, 3).join(" · ")}`);
  const ctx = ctxLines.length ? `\n\n${ctxLines.join("\n")}` : "";

  return {
    content: `${header}\n\n**${match.length} email** correlate:\n\n${lines}${more}${ctx}`,
    data: { count: match.length, query: q, indirizzi: [...indirizzi], tecnici: [...tecnici] },
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

/**
 * Alias impliciti per contatti interni comuni.
 * Se l'utente scrive solo "Alberto", il sistema sa che intende
 * alberto_contardi (il titolare). Questi alias mappano nomi comuni
 * a chiavi del documento nexo_contatti_interni.
 *
 * NOTA: qui niente numeri, solo alias di navigazione. I numeri stanno
 * nel documento Firestore cosmina_config/nexo_contatti_interni.
 */
const ECHO_ALIAS_INTERNI = {
  "alberto": "alberto_contardi",
  "contardi": "alberto_contardi",
  "alberto contardi": "alberto_contardi",
  "sara": "sara",
  "cristina": "cristina_davi",
  "cristina davì": "cristina_davi",
  "cristina davi": "cristina_davi",
  "malvicino": "andrea_malvicino",
  "andrea malvicino": "andrea_malvicino",
  "dellafiore": "lorenzo_dellafiore",
  "lorenzo dellafiore": "lorenzo_dellafiore",
  "victor": "victor",
  "marco": "marco",
  "david": "david",
};

/**
 * Risolutore destinatari via MEMO/CRM.
 *
 * Fonti in ordine di priorità:
 *  1. cosmina_config/nexo_contatti_interni — dipendenti ACG (Alberto, Sara,
 *     Cristina) + tecnici se non censiti altrove. Priorità MASSIMA per nomi
 *     interni: "Alberto" NON deve cadere su "Alberto Armano" del CRM.
 *  2. cosmina_config/tecnici_acg.tecnici[] — se il tecnico ha campo telefono.
 *  3. cosmina_config/numeri_acg — mappa flat { alias → numero }.
 *  4. cosmina_contatti_clienti — solo per nomi NON riconosciuti come interni.
 */
async function resolveDestinatarioViaMemo(rawInput) {
  if (!rawInput) return { error: "destinatario_mancante" };
  const clean = String(rawInput).trim().replace(/^@/, "");
  const lower = clean.toLowerCase();
  const db = getCosminaDb();

  // Controlla se è un alias interno noto — serve anche per saltare il
  // CRM clienti quando il nome è chiaramente un dipendente.
  const aliasKey = ECHO_ALIAS_INTERNI[lower] || null;
  const isInternoKnown = !!aliasKey;

  let partialMatch = null;

  // ── 1. Contatti interni (dipendenti + owner)
  try {
    const snap = await db.collection("cosmina_config").doc("nexo_contatti_interni").get();
    if (snap.exists) {
      const d = snap.data() || {};
      // Prova prima per chiave esatta dell'alias
      if (aliasKey && d[aliasKey]) {
        const entry = d[aliasKey];
        const tel = entry.telefono || entry.whatsapp || entry.cellulare || entry.tel;
        const name = entry.nome || aliasKey;
        if (tel) {
          const chat = normalizeWhatsappChatId(tel);
          if (chat) return {
            chatId: chat,
            resolvedFrom: "nexo_contatti_interni",
            displayName: name,
          };
        }
        partialMatch = name;
      }
      // Fallback: scan su tutti i valori per nome/ruolo
      if (!partialMatch) {
        for (const [k, entry] of Object.entries(d)) {
          if (!entry || typeof entry !== "object") continue;
          const bag = `${k} ${entry.nome || ""} ${entry.ruolo || ""}`.toLowerCase();
          if (!bag.includes(lower)) continue;
          const tel = entry.telefono || entry.whatsapp || entry.cellulare || entry.tel;
          const name = entry.nome || k;
          if (tel) {
            const chat = normalizeWhatsappChatId(tel);
            if (chat) return {
              chatId: chat,
              resolvedFrom: "nexo_contatti_interni",
              displayName: name,
            };
          }
          partialMatch = name;
          break;
        }
      }
    }
  } catch (e) {
    logger.warn("nexo_contatti_interni lookup failed", { error: String(e) });
  }

  // ── 2. Tecnici ACG (eventuale campo telefono direttamente in tecnici_acg)
  try {
    const snap = await db.collection("cosmina_config").doc("tecnici_acg").get();
    if (snap.exists) {
      const d = snap.data() || {};
      const tecnici = Array.isArray(d.tecnici) ? d.tecnici : [];
      for (const t of tecnici) {
        const bag = `${t.nome || ""} ${t.cognome || ""} ${t.nome_completo || ""} ${t.report_alias || ""}`.toLowerCase();
        if (!bag.includes(lower)) continue;
        const tel = t.telefono || t.whatsapp || t.cellulare || t.tel;
        if (tel) {
          const chat = normalizeWhatsappChatId(tel);
          if (chat) return {
            chatId: chat,
            resolvedFrom: "tecnici_acg",
            displayName: t.nome_completo || `${t.nome || ""} ${t.cognome || ""}`.trim(),
          };
        }
        if (!partialMatch) {
          partialMatch = t.nome_completo || `${t.nome} ${t.cognome}`.trim();
        }
        break;
      }
    }
  } catch (e) {
    logger.warn("tecnici_acg lookup failed", { error: String(e) });
  }

  // ── 3. Mappa dedicata cosmina_config/numeri_acg
  try {
    const snap = await db.collection("cosmina_config").doc("numeri_acg").get();
    if (snap.exists) {
      const d = snap.data() || {};
      const map = d.numeri && typeof d.numeri === "object" ? d.numeri : d;
      for (const [alias, num] of Object.entries(map)) {
        if (typeof num !== "string") continue;
        if (alias.toLowerCase() === lower || lower.includes(alias.toLowerCase())) {
          const chat = normalizeWhatsappChatId(num);
          if (chat) return {
            chatId: chat,
            resolvedFrom: "numeri_acg",
            displayName: alias,
          };
        }
      }
    }
  } catch (e) {
    logger.warn("numeri_acg lookup failed", { error: String(e) });
  }

  // ── 4. CRM clienti — SOLO se il nome NON è un alias interno noto.
  // Evita che "Alberto" (titolare) venga ambiguato con "Alberto Armano" cliente.
  if (!isInternoKnown) {
    try {
      const snap = await db.collection("cosmina_contatti_clienti").limit(500).get();
      const candidates = [];
      snap.forEach(doc => {
        const data = doc.data() || {};
        const nome = String(data.nome_completo || `${data.nome || ""} ${data.cognome || ""}`).trim();
        if (!nome) return;
        if (nome.toLowerCase().includes(lower) || lower.includes(nome.toLowerCase())) {
          const tel = data.telefono_normalizzato || data.telefono;
          if (tel) candidates.push({ nome, tel });
        }
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
          error: "troppi_match",
          candidates: candidates.slice(0, 5).map(c => c.nome),
        };
      }
    } catch (e) {
      logger.warn("contatti_clienti lookup failed", { error: String(e) });
    }
  }

  if (partialMatch) {
    return { partial: true, matchedEntity: partialMatch, isInterno: isInternoKnown };
  }
  return { error: "non_trovato", isInterno: isInternoKnown };
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
      content: `⚠️ Ho trovato "${resolved.matchedEntity}" ma senza numero di telefono.\n\n` +
        `Aggiungi il telefono in \`cosmina_config/nexo_contatti_interni\` o \`cosmina_config/tecnici_acg\` su garbymobile-f89ac.`,
    };
  }
  if (resolved.error) {
    if (resolved.error === "non_trovato") {
      if (resolved.isInterno) {
        // È un alias interno noto (Alberto, Malvicino, ...) ma non configurato
        return {
          content: `📞 "${dest}" è un contatto interno noto (titolare/tecnico/admin) ` +
            `ma il numero non è ancora configurato.\n\n` +
            `Aggiungi il documento Firestore \`cosmina_config/nexo_contatti_interni\` ` +
            `su \`garbymobile-f89ac\` con una voce tipo:\n\n` +
            `\`\`\`\n{\n  alberto_contardi: { nome: "Alberto Contardi", ruolo: "titolare", telefono: "+39..." },\n  andrea_malvicino: { nome: "Andrea Malvicino", ruolo: "tecnico", telefono: "+39..." },\n  sara: { nome: "Sara", ruolo: "amministrazione", telefono: "+39..." }\n}\n\`\`\``,
        };
      }
      return {
        content: `❓ Non trovo "${dest}" né tra i contatti interni (tecnici/admin) né nel CRM.\n\n` +
          `Se è un dipendente, aggiungilo in \`cosmina_config/nexo_contatti_interni\`. ` +
          `Se è un cliente, verifica che sia in \`cosmina_contatti_clienti\` con il telefono popolato.`,
      };
    }
    if (resolved.error === "troppi_match") {
      return {
        content: `⚠️ Trovo più contatti per "${dest}" nel CRM:\n\n` +
          resolved.candidates.map(n => `  · ${n}`).join("\n") +
          `\n\nSii più specifico (nome + cognome).`,
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
    return {
      content:
        `📤 Simulato: WA a **${resolved.displayName}** (${maskNumber(chatId)})\n` +
        `— ${body}\n\n` +
        `_Fonte contatto: ${resolved.resolvedFrom} · DRY_RUN attivo, nessun invio reale._`,
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
  { match: (col, az) => col === "memo" && /(dossier|cliente|condominio|tutto_su|storico)/.test(az), fn: handleEmailPerCliente },
  { match: (col, az) => /lavagna/.test(az) && col !== "pharo", fn: handleStatoLavagna },
  // CHARTA — report mensile (PRIMA di DELPHI perché Haiku può mandare report a DELPHI)
  { match: (col, az) => (col === "charta" || col === "delphi") && /(report.*mens|mens.*report|report_mensile|mese|mensile)/.test(az), fn: handleChartaReportMensile },
  { match: (col, az) => col === "charta" && /(incass|pagament|accredit|bonifico)/.test(az) && /(oggi|today)/.test(az), fn: handleChartaIncassiOggi },
  { match: (col, az) => col === "charta" && /(fattura|scadut|incass|pagament|accredit)/.test(az), fn: handleFattureScadute },
  // ARES — interventi (lettura COSMINA bacheca_cards)
  { match: (col, az) => col === "ares" && /(intervent|apert|attiv|in_corso|lista|cosa.*fare|oggi|giorno)/.test(az), fn: handleAresInterventiAperti },
  // ECHO — invio WhatsApp (DRY-RUN default, whitelist obbligatoria)
  { match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase();
    return (col === "echo" && /(whatsapp|wa|send_whatsapp|send_wa|send_message|invia)/.test(az))
      || /(manda|invia|scrivi).*(whatsapp|wa\b|messaggio.*whats)/.test(m);
  }, fn: handleEchoWhatsApp },
  // CALLIOPE — bozze risposta email (Claude Sonnet, DRY-RUN)
  { match: (col, az) => col === "calliope" && /(bozza|scriv|risp|preventiv|sollecit|comunicazion)/.test(az), fn: handleCalliopeBozza },
  // PHARO — monitoring (match anche senza richiedere col=pharo, perché Haiku
  //   può instradare "stato suite" a "nessuno" o altri Colleghi)
  { match: (col, az, int) => {
    const msg = String((int && int.userMessage) || "").toLowerCase();
    return col === "pharo" || /stato.*suite|salute.*sistema|health.*check|suite.*stato|suite.*status/.test(az + " " + msg);
  }, fn: handlePharoStatoSuite },
  { match: (col, az) => col === "pharo" && /(problem|alert|error|aperti|senza_ris|follow_up|issue|bloccat)/.test(az), fn: handlePharoProblemiAperti },
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
