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
  // "Dimmi tutto sul cliente X" → MEMO non esiste, ma ritorno le email
  // che matchano il nome nel sender/subject/condominio/cliente.
  const q = String(
    parametri.cliente || parametri.condominio || parametri.nome || parametri.query || "",
  ).trim().toLowerCase();
  if (!q) return { content: "Su quale cliente o condominio? Dammi un nome." };
  const emails = await fetchIrisEmails(500);
  const match = emails.filter(e => {
    const bag = [
      e.sender, e.senderName, e.subject, e.summary,
      e.entities.cliente, e.entities.condominio, e.entities.indirizzo,
    ].filter(Boolean).join(" ").toLowerCase();
    return bag.includes(q);
  });
  if (!match.length) {
    return {
      content: `MEMO non è ancora attivo.\n\nNon trovo nemmeno email correlate a "${q}" nelle ultime 500.`,
    };
  }
  const lines = match.slice(0, 10).map(emailLine).join("\n");
  const more = match.length > 10 ? `\n…e altre ${match.length - 10}.` : "";
  return {
    content:
      `MEMO non è ancora attivo — quando sarà implementato ti darò il dossier completo.\n\n` +
      `Intanto ecco le **${match.length} email** correlate a "${q}":\n\n${lines}${more}`,
    data: { count: match.length, query: q },
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

async function handleFattureScadute() {
  // CHARTA non esiste. Cerco almeno le email classificate FATTURA_FORNITORE
  // come segnale di quello che arriverà.
  const emails = await fetchIrisEmails(300);
  const fatt = emails.filter(e => e.category === "FATTURA_FORNITORE");
  const parts = [
    `CHARTA non è ancora attivo — quando sarà implementato risponderò con le fatture scadute reali (da Fatture in Cloud).`,
  ];
  if (fatt.length) {
    const lines = fatt.slice(0, 6).map(emailLine).join("\n");
    parts.push(`\nNel frattempo, ho indicizzato **${fatt.length} email FATTURA_FORNITORE**:\n\n${lines}`);
  }
  return { content: parts.join("\n") };
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
  { match: (col, az) => /lavagna/.test(az) || (col === "pharo" && /stato/.test(az)), fn: handleStatoLavagna },
  { match: (col, az) => col === "charta" && /(fattura|scadut)/.test(az), fn: handleFattureScadute },
];

async function tryDirectAnswer(intent) {
  const azione = (intent.azione || "").toLowerCase();
  const collega = (intent.collega || "").toLowerCase();
  const handler = DIRECT_HANDLERS.find(h => h.match(collega, azione));
  if (!handler) return null;
  try {
    const result = await handler.fn(intent.parametri || {});
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
      directAnswer = await tryDirectAnswer(intent);
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
