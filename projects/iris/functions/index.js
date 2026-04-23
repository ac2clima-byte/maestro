// index.js — entrypoint Cloud Functions. Solo router + exports.
// Logica dei Colleghi: vedi handlers/*.js
// shared.js: Firebase apps, CORS, rate limit, auth, utilities

import { onRequest } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";

import {
  REGION, MODEL, ANTHROPIC_URL, ANTHROPIC_API_KEY, EWS_USERNAME, EWS_PASSWORD, EWS_URL,
  db, FieldValue, logger,
  getCosminaDb,
  applyCors, applyCorsOpen,
  checkRateLimit, checkNexusRateLimit,
  verifyAcgIdToken,
  callHaiku,
  fetchIrisEmails,
  sendPushNotification,
} from "./handlers/shared.js";

import {
  tryDirectAnswer, ensureNexusSession, writeNexusMessage, postLavagnaFromNexus,
  parseAndValidateIntent, callHaikuForIntent, loadConversationContext,
  tryInterceptPatternConfirmation, tryAnalyzeLongText, tryInterceptEmailQueue,
} from "./handlers/nexus.js";

import { handleAresApriIntervento } from "./handlers/ares.js";
import { handlePharoRtiMonitoring, writePharoAlert } from "./handlers/pharo.js";
import { runDigestMattutino } from "./handlers/echo-digest.js";
import { handleEchoInboundWebhook } from "./handlers/echo-inbound.js";
import { runOrchestratorWorkflow } from "./handlers/orchestrator.js";
import { handleChronosCampagne, handleChronosListaCampagne, buildCampagneDashboard, buildAgendaDashboard, buildScadenzeDashboard } from "./handlers/chronos.js";

// ─── suggestReply (legacy IRIS draft helper) ───────────────────

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
        try { parts.push(`   payload: ${JSON.stringify(m.payload).slice(0, 300)}`); } catch {}
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
    const snap = await db.collection("nexo_lavagna").where("sourceEmailId", "==", messageId).limit(10).get();
    const out = [];
    snap.forEach(d => {
      const data = d.data() || {};
      out.push({ id: d.id, from: data.from, to: data.to, type: data.type, status: data.status, priority: data.priority, payload: data.payload });
    });
    return out;
  } catch (e) {
    logger.warn("lavagna fetch failed", { error: String(e) });
    return [];
  }
}

export const suggestReply = onRequest(
  { region: REGION, cors: false, secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 60, memory: "256MiB", maxInstances: 5 },
  async (req, res) => {
    applyCors(req, res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }

    const ip = (req.headers["x-forwarded-for"] || req.ip || "").toString().split(",")[0].trim();
    const rate = await checkRateLimit(ip);
    if (!rate.ok) {
      res.set("Retry-After", String(rate.retryAfterSeconds || 3600));
      res.status(429).json({ error: rate.reason });
      return;
    }

    const docId = (req.body || {}).docId;
    if (!docId || typeof docId !== "string") { res.status(400).json({ error: "missing_docId" }); return; }

    let snap;
    try { snap = await db.collection("iris_emails").doc(docId).get(); }
    catch (e) { logger.error("firestore read failed", { error: String(e), docId }); res.status(500).json({ error: "firestore_read_failed" }); return; }
    if (!snap.exists) { res.status(404).json({ error: "email_not_found" }); return; }

    const data = snap.data() || {};
    const raw = data.raw || {};
    const classification = data.classification || {};
    const similar = Array.isArray(data.similarEmails) ? data.similarEmails : [];
    const lavagna = await fetchLavagnaForEmail(data.id || raw.message_id);
    const userPrompt = buildUserPrompt({ email: raw, classification, similar, lavagna });

    const apiKey = ANTHROPIC_API_KEY.value();
    if (!apiKey) { res.status(500).json({ error: "missing_anthropic_key" }); return; }

    let result;
    try { result = await callHaiku(apiKey, SYSTEM_PROMPT, userPrompt); }
    catch (e) { logger.error("anthropic call failed", { error: String(e), docId }); res.status(502).json({ error: "anthropic_failed", detail: String(e).slice(0, 300) }); return; }

    res.status(200).json({
      docId, draft: result.text, model: MODEL, usage: result.usage,
      contextUsed: { similarCount: similar.length, lavagnaCount: lavagna.length, category: classification.category },
    });
  }
);

// ─── nexusRouter (intent parsing + dispatch) ───────────────────

export const nexusRouter = onRequest(
  { region: REGION, cors: false, secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 60, memory: "256MiB", maxInstances: 10 },
  async (req, res) => {
    applyCors(req, res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }

    // Auth
    const authUser = await verifyAcgIdToken(req);
    if (!authUser) { res.status(401).json({ error: "unauthorized", message: "Firebase ID Token ACG mancante o non valido" }); return; }

    const ip = (req.headers["x-forwarded-for"] || req.ip || "").toString().split(",")[0].trim();
    const rate = await checkNexusRateLimit(ip);
    if (!rate.ok) { res.set("Retry-After", "3600"); res.status(429).json({ error: rate.reason }); return; }

    const body = req.body || {};
    const userMessage = String(body.userMessage || "").trim();
    const sessionId = String(body.sessionId || "").trim();
    const userId = authUser.email || authUser.uid;
    const history = Array.isArray(body.history) ? body.history.slice(-10) : [];

    if (!userMessage || !sessionId) { res.status(400).json({ error: "missing_userMessage_or_sessionId" }); return; }
    if (userMessage.length > 2000) { res.status(400).json({ error: "userMessage_too_long" }); return; }

    await ensureNexusSession(sessionId, userId, userMessage);
    const userMsgId = await writeNexusMessage(sessionId, { role: "user", content: userMessage });

    // Email queue: intercetta "sì/prossima/basta/leggila" dopo "email urgenti/oggi"
    try {
      const emailHandled = await tryInterceptEmailQueue({ userMessage, sessionId });
      if (emailHandled && emailHandled._emailQueueHandled) {
        const nexusMessageId = await writeNexusMessage(sessionId, {
          role: "assistant",
          content: emailHandled.content,
          direct: { data: emailHandled.data || null, failed: false },
          stato: "completata",
          modello: "email_queue",
        });
        res.status(200).json({
          intent: { collega: "iris", azione: "email_queue", parametri: {}, rispostaUtente: emailHandled.content, confidenza: 1 },
          nexusMessageId, userMsgId, stato: "completata",
          direct: { data: emailHandled.data || null, failed: false },
          modello: "email_queue", usage: {},
        });
        return;
      }
    } catch (e) {
      logger.warn("email queue intercept failed, continuing normal flow", { error: String(e).slice(0, 200) });
    }

    // Training pattern: intercetta "sì"/"no"/"sì ma..." dopo "analizza email"
    try {
      const trained = await tryInterceptPatternConfirmation({ userMessage, sessionId, userId });
      if (trained && trained._trainingHandled) {
        const nexusMessageId = await writeNexusMessage(sessionId, {
          role: "assistant",
          content: trained.content,
          direct: { data: trained.data || null, failed: false },
          stato: "completata",
          modello: "training_intercept",
        });
        res.status(200).json({
          intent: { collega: "iris", azione: "training_pattern", parametri: {}, rispostaUtente: trained.content, confidenza: 1 },
          nexusMessageId, userMsgId, stato: "completata",
          direct: { data: trained.data || null, failed: false },
          modello: "training_intercept", usage: {},
        });
        return;
      }
    } catch (e) {
      logger.warn("training intercept failed, continuing normal flow", { error: String(e).slice(0, 200) });
    }

    const apiKey = ANTHROPIC_API_KEY.value();
    if (!apiKey) { res.status(500).json({ error: "missing_anthropic_key" }); return; }

    // Analisi diretta testo lungo / incollato (bypass routing NEXUS)
    try {
      const textAnalysis = await tryAnalyzeLongText(userMessage, apiKey);
      if (textAnalysis && textAnalysis._textAnalysis) {
        const nexusMessageId = await writeNexusMessage(sessionId, {
          role: "assistant",
          content: textAnalysis.content,
          direct: { data: textAnalysis.data, failed: false },
          stato: "completata",
          modello: MODEL,
        });
        res.status(200).json({
          intent: { collega: "nexus", azione: "analizza_testo", parametri: {}, rispostaUtente: textAnalysis.content, confidenza: 1 },
          nexusMessageId, userMsgId, stato: "completata",
          direct: { data: textAnalysis.data, failed: false },
          modello: MODEL, usage: {},
        });
        return;
      }
    } catch (e) {
      logger.warn("tryAnalyzeLongText intercept failed, continuing normal flow", { error: String(e).slice(0, 200) });
    }

    // Carica gli ultimi 5 scambi della sessione (contesto multi-turno)
    // per far capire a Haiku riferimenti come "lui", "loro", "quel cliente".
    const sessionContext = await loadConversationContext(sessionId, 5);

    const messages = [...sessionContext];
    // Merge con history esplicita dal client (dedupe per contenuto+ruolo)
    const seen = new Set(messages.map(m => m.role + "|" + m.content));
    for (const h of history) {
      if (!h || typeof h !== "object") continue;
      const role = h.role === "assistant" ? "assistant" : h.role === "user" ? "user" : null;
      if (!role) continue;
      const content = String(h.content || "").slice(0, 2000);
      if (!content) continue;
      const key = role + "|" + content;
      if (seen.has(key)) continue;
      messages.push({ role, content });
      seen.add(key);
    }
    messages.push({ role: "user", content: userMessage });

    let haiku;
    try { haiku = await callHaikuForIntent(apiKey, messages); }
    catch (e) {
      logger.error("nexus haiku failed", { error: String(e) });
      const fallback = { collega: "nessuno", azione: "errore", parametri: {}, confidenza: 0, rispostaUtente: `Errore interpretazione: ${String(e).slice(0, 120)}` };
      const nexusMessageId = await writeNexusMessage(sessionId, { role: "assistant", content: fallback.rispostaUtente, intent: fallback, stato: "errore_modello", modello: MODEL });
      res.status(200).json({ intent: fallback, nexusMessageId, userMsgId, stato: "errore_modello" });
      return;
    }

    const intent = parseAndValidateIntent(haiku.text, userMessage);

    // Try direct answer
    const direct = await tryDirectAnswer(intent, userMessage);
    let finalContent = intent.rispostaUtente;
    let stato = "assegnata";
    let lavagnaId = null;

    if (direct && !direct._failed) {
      finalContent = direct.content || finalContent;
      stato = "completata";
    } else if (direct && direct._failed) {
      finalContent = direct.content || finalContent;
      stato = "errore_handler";
    } else if (intent.collega && intent.collega !== "nessuno" && intent.collega !== "multi") {
      // Postamessage on Lavagna for async processing
      try {
        lavagnaId = await postLavagnaFromNexus({
          collega: intent.collega,
          azione: intent.azione,
          parametri: intent.parametri,
          rispostaUtente: intent.rispostaUtente,
          userMessage,
          sessionId,
          nexusMessageId: userMsgId,
        });
        stato = "in_attesa_collega";
      } catch (e) {
        logger.error("lavagna post failed", { error: String(e) });
        stato = "errore_lavagna";
      }
    }

    const nexusMessageId = await writeNexusMessage(sessionId, {
      role: "assistant", content: finalContent,
      intent, stato,
      direct: direct ? { data: direct.data || null, failed: !!direct._failed } : null,
      modello: MODEL, usage: haiku.usage,
    });

    res.status(200).json({
      intent, nexusMessageId, userMsgId,
      lavagnaMessageId: lavagnaId,
      stato,
      direct: direct ? { data: direct.data || null, failed: !!direct._failed } : null,
      modello: MODEL, usage: haiku.usage,
    });
  }
);

// ─── IRIS Rule Engine (action handlers inline) ─────────────────

async function loadIrisRules() {
  try {
    const snap = await db.collection("iris_rules").where("enabled", "==", true).orderBy("priority", "desc").get();
    const rules = [];
    snap.forEach(d => rules.push({ id: d.id, ...d.data() }));
    return rules;
  } catch (e) {
    const msg = String(e?.message || e);
    if (/FAILED_PRECONDITION|requires an index/i.test(msg)) {
      try {
        const snap = await db.collection("iris_rules").get();
        const rules = [];
        snap.forEach(d => { const data = d.data(); if (data.enabled === true) rules.push({ id: d.id, ...data }); });
        rules.sort((a, b) => (b.priority || 0) - (a.priority || 0));
        return rules;
      } catch (e2) { logger.error("loadIrisRules fallback failed", { error: String(e2) }); return []; }
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
  if (conds.length === 0) return false;
  return conds.every(c => ruleConditionMatches(c, emailData));
}

async function postLavagna({ to, type, payload, priority = "normal", from = "iris_rules" }) {
  const ref = db.collection("nexo_lavagna").doc();
  const now = FieldValue.serverTimestamp();
  await ref.set({
    id: ref.id, from, to, type, payload: payload || {},
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
  };
  if (ctx.extracted && typeof ctx.extracted === "object" && Object.keys(ctx.extracted).length > 0) {
    payload.extracted = ctx.extracted;
  }
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
  const text = String(action.text || "").trim() || "Notifica IRIS (senza testo)";
  const lavId = await postLavagna({
    to: "echo", type: "iris_notify",
    payload: {
      canale: action.channel || "wa", destinatario: "Alberto", testo: text,
      sourceEmailId: ctx.emailId, triggeredByRule: ctx.ruleId,
    },
    priority: ctx.priorityBoost || "normal", from: "iris_rules",
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
  const body = ruleFieldValue(ctx.emailData, "body");
  const patterns = action.extractPatterns || {};
  const found = {};
  for (const [fieldName, pattern] of Object.entries(patterns)) {
    try {
      const re = new RegExp(pattern, "i");
      const m = re.exec(body);
      if (m) found[fieldName] = m[1] || m[0];
    } catch (e) { logger.warn("extract_data: bad regex", { fieldName, pattern, error: String(e) }); }
  }
  ctx.extracted = { ...(ctx.extracted || {}), ...found };
  return { type: "extract_data", fieldsFound: Object.keys(found) };
}

function actionSetPriority(action, ctx) {
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
  if (rules.length === 0) return { matched: [], actionsExecuted: [] };
  const matched = [];
  const actionsExecuted = [];
  for (const rule of rules) {
    if (!ruleAllConditionsMatch(rule, emailData)) continue;
    matched.push(rule.id);
    const ctx = { emailId, emailData, emailRef, ruleId: rule.id };
    for (const action of (rule.actions || [])) {
      try {
        const r = await executeAction(action, ctx);
        actionsExecuted.push({ ruleId: rule.id, ...r });
      } catch (e) {
        logger.error("action failed", { ruleId: rule.id, actionType: action.type, error: String(e) });
        actionsExecuted.push({ ruleId: rule.id, type: action.type, error: String(e).slice(0, 150) });
      }
    }
    if (rule.stopOnMatch !== false) break;
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
    if (data.rule_processed_at) return;
    let result;
    try { result = await applyRulesToEmail(emailId, data, snap.ref); }
    catch (e) { logger.error("applyRulesToEmail failed", { error: String(e), emailId }); return; }
    try {
      await snap.ref.set({
        rule_processed_at: FieldValue.serverTimestamp(),
        rules_matched: result.matched,
        actions_executed: result.actionsExecuted,
      }, { merge: true });
    } catch (e) { logger.error("mark processed failed", { error: String(e), emailId }); }
  }
);

// ─── irisPoller (EWS) ──────────────────────────────────────────

const IRIS_POLLER_STATE_COLL = "iris_poller_state";
const IRIS_POLLER_STATE_DOC = "default";

function hashMessageId(msgId) {
  let h = 0;
  for (let i = 0; i < msgId.length; i++) h = ((h << 5) - h + msgId.charCodeAt(i)) | 0;
  return `ews_${Math.abs(h).toString(36)}_${msgId.length}`;
}

async function runIrisPoller() {
  let cfg = {}, source = "unknown";
  let secretUser = null, secretPassword = null, secretUrl = null;
  try { secretUser = EWS_USERNAME.value() || null; } catch {}
  try { secretPassword = EWS_PASSWORD.value() || null; } catch {}
  try { secretUrl = EWS_URL.value() || null; } catch {}

  if (secretUser && secretPassword && secretUrl) {
    cfg = {
      user: secretUser, password: secretPassword, server: secretUrl, auth: "basic",
      exchange_version: process.env.EWS_VERSION || "2013_SP1",
      limit_per_run: Number(process.env.EWS_LIMIT_PER_RUN) || 50,
      initial_lookback_hours: Number(process.env.EWS_INITIAL_HOURS) || 24,
      enabled: true,
    };
    source = "secret_manager";
    try {
      const cfgSnap = await getCosminaDb().collection("cosmina_config").doc("iris_config").get();
      if (cfgSnap.exists) {
        const fs = cfgSnap.data() || {};
        if (typeof fs.enabled === "boolean") cfg.enabled = fs.enabled;
        if (fs.limit_per_run) cfg.limit_per_run = Number(fs.limit_per_run);
        if (fs.initial_lookback_hours) cfg.initial_lookback_hours = Number(fs.initial_lookback_hours);
      }
    } catch {}
  } else {
    const cfgSnap = await getCosminaDb().collection("cosmina_config").doc("iris_config").get();
    if (!cfgSnap.exists) {
      logger.info("irisPoller: no_config_anywhere", { hasSecretUser: !!secretUser, hasSecretPassword: !!secretPassword, hasSecretUrl: !!secretUrl });
      return { skipped: "no_config" };
    }
    cfg = cfgSnap.data() || {};
    source = "firestore_iris_config";
  }

  if (cfg.enabled === false) { logger.info("irisPoller: disabled", { source }); return { skipped: "disabled", source }; }
  if (!cfg.server || !cfg.user || !cfg.password) {
    logger.warn("irisPoller: config incomplete", { source, hasServer: !!cfg.server, hasUser: !!cfg.user, hasPassword: !!cfg.password });
    return { skipped: "incomplete_config", source };
  }
  logger.info("irisPoller: config loaded", { source, server: cfg.server });

  const stateRef = db.collection(IRIS_POLLER_STATE_COLL).doc(IRIS_POLLER_STATE_DOC);
  const stateSnap = await stateRef.get();
  let lastProcessedIso = stateSnap.exists ? (stateSnap.data() || {}).lastProcessedIso : null;
  if (!lastProcessedIso) {
    const hrs = cfg.initial_lookback_hours || 24;
    lastProcessedIso = new Date(Date.now() - hrs * 3600 * 1000).toISOString();
    logger.info("irisPoller: first run, lookback", { hours: hrs, from: lastProcessedIso });
  }

  const { fetchNewEmails, classifyEmail } = await import("./iris-poller.mjs");
  const limit = Number(cfg.limit_per_run) || 50;
  let emails;
  try { emails = await fetchNewEmails({ cfg, dateFromIso: lastProcessedIso, limit }); }
  catch (e) {
    const detail = {
      message: String(e?.message || e), name: String(e?.name || ""),
      stack: String(e?.stack || "").slice(0, 1500),
      server: cfg.server, exchange_version: cfg.exchange_version,
    };
    logger.error("irisPoller: EWS fetch failed", detail);
    return { error: "ews_fetch_failed", detail };
  }

  if (!emails.length) { logger.info("irisPoller: no new emails", { from: lastProcessedIso }); return { processed: 0, skipped_existing: 0 }; }

  const anthropicKey = ANTHROPIC_API_KEY.value();
  if (!anthropicKey) { logger.error("irisPoller: ANTHROPIC_API_KEY missing"); return { error: "no_api_key" }; }

  let processed = 0, skippedExisting = 0, classifyErrors = 0;
  let latestReceivedIso = lastProcessedIso;

  for (const email of emails) {
    const docId = hashMessageId(email.message_id);
    const existing = await db.collection("iris_emails").doc(docId).get();
    if (existing.exists) { skippedExisting++; continue; }

    let classification;
    try { const r = await classifyEmail(anthropicKey, email); classification = r.classification; }
    catch (e) {
      classifyErrors++;
      logger.warn("irisPoller: classify failed", { error: String(e), msgId: email.message_id });
      classification = { category: "ALTRO", summary: "", sentiment: "neutro", entities: {} };
    }

    try {
      await db.collection("iris_emails").doc(docId).set({
        id: docId, raw: email, classification,
        source: "irisPoller",
        createdAt: FieldValue.serverTimestamp(),
      });
      processed++;
    } catch (e) { logger.error("irisPoller: firestore write failed", { error: String(e) }); }

    if (email.received_time > latestReceivedIso) latestReceivedIso = email.received_time;
  }

  await stateRef.set({
    lastProcessedIso: latestReceivedIso,
    lastRunAt: FieldValue.serverTimestamp(),
    lastRunProcessed: processed, lastRunSkippedExisting: skippedExisting, lastRunClassifyErrors: classifyErrors,
  }, { merge: true });

  logger.info("irisPoller: done", { processed, skippedExisting, classifyErrors, latestReceivedIso });
  return { processed, skippedExisting, classifyErrors, latestReceivedIso };
}

// ⚠️ DISABILITATO: il server Exchange on-prem (remote.gruppobadano.it) non è
// raggiungibile da Cloud Function GCP su europe-west1. Il poller EWS gira ora
// SUL PC DI ALBERTO (WSL) via cron/daemon ogni 5 min. Vedi:
//   scripts/iris_local_poller.sh         — ciclo singolo
//   scripts/start-iris-poller.sh         — daemon (nohup loop)
//   projects/iris/scripts/pipeline.py    — pipeline Python (EWS → Haiku → Firestore)
//
// Alternativa passata (Hetzner) deprecata: vedi scripts/iris_hetzner_poller.py.
// Se un giorno Exchange diventa pubblico, scommenta gli scheduler qui sotto.
//
// Lasciato `irisPollerRun` come HTTP trigger manuale per debug (richiede
// admin_key).
/*
export const irisPoller = onSchedule(
  { region: REGION, schedule: "every 5 minutes", timeZone: "Europe/Rome", memory: "512MiB", timeoutSeconds: 120, secrets: [ANTHROPIC_API_KEY, EWS_USERNAME, EWS_PASSWORD, EWS_URL] },
  async () => {
    try { const r = await runIrisPoller(); logger.info("irisPoller scheduled complete", r); }
    catch (e) { logger.error("irisPoller scheduled failed", { error: String(e) }); }
  }
);

export const irisPollScheduled = onSchedule(
  { region: REGION, schedule: "every 1 hours", timeZone: "Europe/Rome", memory: "128MiB" },
  async () => { logger.info("irisPollScheduled: deprecated, noop. Use irisPoller."); }
);
*/

// HTTP trigger manuale: ancora disponibile per debug (richiede admin_key).
// NON gira in automatico: il polling ora è su Hetzner.
export const irisPollerRun = onRequest(
  { region: REGION, secrets: [ANTHROPIC_API_KEY, EWS_USERNAME, EWS_PASSWORD, EWS_URL], timeoutSeconds: 120, memory: "512MiB", cors: false },
  async (req, res) => {
    if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
    const cfgSnap = await getCosminaDb().collection("cosmina_config").doc("iris_config").get();
    const adminKey = (cfgSnap.data() || {}).admin_key;
    if (!adminKey || req.get("X-Admin-Key") !== adminKey) { res.status(403).json({ error: "forbidden" }); return; }
    try { const r = await runIrisPoller(); res.status(200).json(r); }
    catch (e) { res.status(500).json({ error: String(e).slice(0, 300) }); }
  }
);

// ─── PHARO schedulers + endpoints ──────────────────────────────

export const pharoHealthCheck = onSchedule(
  { region: REGION, schedule: "every 5 minutes", timeZone: "Europe/Rome", memory: "256MiB" },
  async () => {
    try {
      let firestoreOk = true, pending = 0, errori = 0, emailAttesa = 0;
      try {
        const snap = await db.collection("nexo_lavagna").orderBy("createdAt", "desc").limit(100).get();
        snap.forEach(d => {
          const s = (d.data() || {}).status;
          if (s === "pending" || s === "in_progress") pending++;
          else if (s === "failed" || s === "error" || s === "errore") errori++;
        });
      } catch { firestoreOk = false; }
      try {
        const snap = await db.collection("iris_emails").orderBy("raw.received_time", "desc").limit(500).get();
        snap.forEach(d => { const f = (d.data() || {}).followup; if (f && f.needsAttention) emailAttesa++; });
      } catch { firestoreOk = false; }

      const punteggio = firestoreOk ? Math.max(0, Math.min(100, 100 - pending * 2 - errori * 5 - emailAttesa)) : 0;
      const now = FieldValue.serverTimestamp();
      await db.collection("pharo_health_snapshots").add({ firestoreOk, pending, errori, emailAttesa, punteggio, createdAt: now });

      const critico = !firestoreOk || errori >= 3 || emailAttesa >= 10;
      if (critico) {
        await db.collection("nexo_lavagna").add({
          from: "pharo_scheduler", to: "echo", type: "pharo_alert",
          payload: { testo: `⚠️ PHARO alert: Firestore ${firestoreOk ? "OK" : "DOWN"}, pending=${pending}, errori=${errori}, emailAttesa=${emailAttesa}`, punteggio },
          status: "pending", priority: "high",
          createdAt: now, updatedAt: now,
        });
      }
      logger.info("pharoHealthCheck done", { punteggio, firestoreOk, pending, errori, emailAttesa, critico });
    } catch (e) { logger.error("pharoHealthCheck failed", { error: String(e) }); }
  }
);

export const pharoRtiDashboard = onRequest(
  { region: REGION, cors: false, timeoutSeconds: 60, memory: "256MiB", maxInstances: 5 },
  async (req, res) => {
    applyCorsOpen(req, res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "GET") { res.status(405).json({ error: "method_not_allowed" }); return; }
    const authUser = await verifyAcgIdToken(req);
    if (!authUser) { res.status(401).json({ error: "unauthorized" }); return; }
    try { const r = await handlePharoRtiMonitoring({}); res.status(200).json(r.data || {}); }
    catch (e) { logger.error("pharoRtiDashboard failed", { error: String(e) }); res.status(500).json({ error: String(e).slice(0, 300) }); }
  }
);

// CHRONOS — dashboard campagne (lista + dettaglio)
// Memory 512MiB: la scan di bacheca_cards (5000 docs) con Firestore SDK
// richiede più di 256MiB. Usa buildCampagneDashboard che fa UNA sola scan
// e aggrega in-memory (evita N query parallele OOM).
export const chronosCampagneDashboard = onRequest(
  { region: REGION, cors: false, timeoutSeconds: 120, memory: "512MiB", maxInstances: 5 },
  async (req, res) => {
    applyCorsOpen(req, res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "GET") { res.status(405).json({ error: "method_not_allowed" }); return; }
    const authUser = await verifyAcgIdToken(req);
    if (!authUser) { res.status(401).json({ error: "unauthorized" }); return; }
    try {
      const campagnaNome = String(req.query?.nome || "").trim();
      if (campagnaNome) {
        // Dettaglio singola campagna — usa handler dedicato
        const r = await handleChronosCampagne({ nome: campagnaNome }, { userMessage: "" });
        res.status(200).json(r.data || { content: r.content });
      } else {
        // Lista con metriche — UNA sola scan bacheca_cards
        const data = await buildCampagneDashboard({});
        res.status(200).json(data);
      }
    } catch (e) {
      logger.error("chronosCampagneDashboard failed", { error: String(e), stack: String(e?.stack || "").slice(0, 500) });
      res.status(500).json({ error: String(e).slice(0, 300) });
    }
  }
);

// CHRONOS — dashboard agenda tecnici (oggi / settimana / scaduti per tecnico)
export const chronosAgendaDashboard = onRequest(
  { region: REGION, cors: false, timeoutSeconds: 60, memory: "512MiB", maxInstances: 5 },
  async (req, res) => {
    applyCorsOpen(req, res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "GET") { res.status(405).json({ error: "method_not_allowed" }); return; }
    const authUser = await verifyAcgIdToken(req);
    if (!authUser) { res.status(401).json({ error: "unauthorized" }); return; }
    try {
      const data = await buildAgendaDashboard({});
      res.status(200).json(data);
    } catch (e) {
      logger.error("chronosAgendaDashboard failed", { error: String(e), stack: String(e?.stack || "").slice(0, 500) });
      res.status(500).json({ error: String(e).slice(0, 300) });
    }
  }
);

// CHRONOS — dashboard scadenze impianti (bucket 30/60/90g)
export const chronosScadenzeDashboard = onRequest(
  { region: REGION, cors: false, timeoutSeconds: 60, memory: "512MiB", maxInstances: 5 },
  async (req, res) => {
    applyCorsOpen(req, res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "GET") { res.status(405).json({ error: "method_not_allowed" }); return; }
    const authUser = await verifyAcgIdToken(req);
    if (!authUser) { res.status(401).json({ error: "unauthorized" }); return; }
    try {
      const data = await buildScadenzeDashboard({});
      res.status(200).json(data);
    } catch (e) {
      logger.error("chronosScadenzeDashboard failed", { error: String(e), stack: String(e?.stack || "").slice(0, 500) });
      res.status(500).json({ error: String(e).slice(0, 300) });
    }
  }
);

export const pharoResolveAlert = onRequest(
  { region: REGION, cors: false, timeoutSeconds: 30, memory: "128MiB", maxInstances: 5 },
  async (req, res) => {
    applyCorsOpen(req, res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
    const authUser = await verifyAcgIdToken(req);
    if (!authUser) { res.status(401).json({ error: "unauthorized" }); return; }
    const body = req.body || {};
    const alertId = String(body.alertId || "").trim();
    if (!alertId) { res.status(400).json({ error: "missing_alertId" }); return; }
    try {
      await db.collection("pharo_alerts").doc(alertId).set({
        status: "resolved",
        resolvedAt: FieldValue.serverTimestamp(),
        resolvedBy: authUser.email || authUser.uid,
      }, { merge: true });
      res.status(200).json({ ok: true, alertId });
    } catch (e) { logger.error("pharoResolveAlert failed", { error: String(e) }); res.status(500).json({ error: String(e).slice(0, 300) }); }
  }
);

export const pharoCheckRti = onSchedule(
  { region: REGION, schedule: "every 6 hours", timeZone: "Europe/Rome", memory: "256MiB", timeoutSeconds: 120 },
  async () => {
    try {
      const r = await handlePharoRtiMonitoring({});
      const data = r.data || {};
      let alertCount = 0, criticalCount = 0;
      for (const w of (data.warnings || [])) {
        const tipo = `rti_${w.titolo.slice(0, 60).toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
        await writePharoAlert({
          tipo, severita: w.severita || "warning",
          titolo: w.titolo, descrizione: w.descrizione,
          dati: { rti: data.rti, tickets: data.tickets, pending: data.pending },
        });
        alertCount++;
        if (w.severita === "critical") criticalCount++;
      }
      if (criticalCount > 0) {
        const now = FieldValue.serverTimestamp();
        await db.collection("nexo_lavagna").add({
          from: "pharo_scheduler", to: "echo", type: "pharo_rti_critical",
          payload: {
            testo: `🚨 PHARO alert critical Guazzotti TEC: ${criticalCount} problemi urgenti rilevati. Tickets aperti >14g senza RTI: ${data.tickets?.aperti_vecchi_14g || 0}. Verifica dashboard PHARO.`,
            rti: data.rti, tickets: data.tickets, pending: data.pending,
          },
          status: "pending", priority: "high",
          createdAt: now, updatedAt: now,
        });
      }
      logger.info("pharoCheckRti done", {
        alertCount, criticalCount,
        rti_total: data.rti?.total, tickets_aperti: data.tickets?.aperti,
        errors: (data.errors || []).length,
      });
    } catch (e) { logger.error("pharoCheckRti failed", { error: String(e) }); }
  }
);

// ─── ARES Lavagna listener ─────────────────────────────────────

export const aresLavagnaListener = onDocumentCreated(
  { region: REGION, document: "nexo_lavagna/{msgId}", memory: "256MiB", maxInstances: 5 },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const msgId = event.params.msgId;
    const v = snap.data() || {};

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
    if (isGuasto) parametri.urgenza = "critica";
    const ctx = { userMessage: String(payload.userMessage || "") };

    let result;
    try { result = await handleAresApriIntervento(parametri, ctx); }
    catch (e) {
      logger.error("aresLavagnaListener: apriIntervento failed", { error: String(e), msgId });
      await snap.ref.set({
        status: "failed", error: String(e).slice(0, 300),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return;
    }

    if (isGuasto) {
      try {
        const interventoId = result?.data?.id || "?";
        const condominio = parametri.condominio || parametri.cliente || "?";
        await db.collection("nexo_lavagna").add({
          from: "ares", to: "echo", type: "notifica_guasto_urgente",
          payload: {
            testo: `🚨 Guasto urgente aperto: ${condominio} (${interventoId}). Verifica immediata.`,
            destinatario: "alberto", canale: "whatsapp",
            interventoId, condominio,
          },
          status: "pending", priority: "high",
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } catch (e) { logger.warn("aresLavagnaListener: echo notify failed", { error: String(e) }); }
    }

    try {
      await snap.ref.set({
        status: "completed",
        result: { content: String(result?.content || "").slice(0, 500), data: result?.data || null },
        processedBy: "aresLavagnaListener",
        completedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      logger.info("aresLavagnaListener: completed", { msgId, dryRun: result?.data?.dryRun });
    } catch (e) { logger.error("aresLavagnaListener: mark completed failed", { error: String(e), msgId }); }
  }
);

// ─── ECHO digest mattutino (07:30 CET) ─────────────────────────

export const echoDigestMattutino = onSchedule(
  { region: REGION, schedule: "30 7 * * *", timeZone: "Europe/Rome", memory: "256MiB", timeoutSeconds: 120 },
  async () => {
    try {
      const r = await runDigestMattutino();
      logger.info("echoDigestMattutino: done", r);
    } catch (e) {
      logger.error("echoDigestMattutino: failed", { error: String(e) });
    }
  }
);

// Trigger HTTP manuale (per test + debug)
export const echoDigestRun = onRequest(
  { region: REGION, cors: false, timeoutSeconds: 120, memory: "256MiB" },
  async (req, res) => {
    const authUser = await verifyAcgIdToken(req);
    if (!authUser) { res.status(401).json({ error: "unauthorized" }); return; }
    try {
      const r = await runDigestMattutino({ force: req.method === "POST" });
      res.status(200).json(r);
    } catch (e) {
      logger.error("echoDigestRun failed", { error: String(e) });
      res.status(500).json({ error: String(e).slice(0, 300) });
    }
  }
);

// ─── ECHO inbound webhook (Waha) ───────────────────────────────

export const echoInboundWebhook = onRequest(
  { region: REGION, cors: false, timeoutSeconds: 30, memory: "256MiB", maxInstances: 10 },
  async (req, res) => {
    try {
      const result = await handleEchoInboundWebhook(req);
      res.status(result.status || 200).json(result.body || { ok: true });
    } catch (e) {
      logger.error("echoInboundWebhook failed", { error: String(e) });
      res.status(500).json({ error: String(e).slice(0, 300) });
    }
  }
);

// ─── ECHO WA Inbox poller (cosmina_inbox cross-project) ────────
import { runWaInboxPoller } from "./handlers/echo-wa-inbox.js";

// Scheduler: ogni 5 min analizza i nuovi WA inbound arrivati in cosmina_inbox
// (progetto garbymobile-f89ac). Non trigger onCreate perché la function è su
// progetto diverso.
export const echoWaInboxPoller = onSchedule(
  {
    region: REGION,
    schedule: "every 5 minutes",
    timeZone: "Europe/Rome",
    memory: "256MiB",
    timeoutSeconds: 120,
    secrets: [ANTHROPIC_API_KEY],
  },
  async () => {
    try {
      const r = await runWaInboxPoller({ limit: 20 });
      logger.info("echoWaInboxPoller done", r);
    } catch (e) {
      logger.error("echoWaInboxPoller failed", { error: String(e) });
    }
  }
);

// HTTP trigger manuale per test/debug
export const echoWaInboxRun = onRequest(
  { region: REGION, cors: false, timeoutSeconds: 120, memory: "256MiB", secrets: [ANTHROPIC_API_KEY] },
  async (req, res) => {
    applyCorsOpen(req, res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    const authUser = await verifyAcgIdToken(req);
    if (!authUser) { res.status(401).json({ error: "unauthorized" }); return; }
    try {
      const limit = Math.min(Number(req.query?.limit || req.body?.limit || 20), 50);
      const r = await runWaInboxPoller({ limit });
      res.status(200).json(r);
    } catch (e) {
      logger.error("echoWaInboxRun failed", { error: String(e) });
      res.status(500).json({ error: String(e).slice(0, 300) });
    }
  }
);

// ─── NEXUS TTS (edge-tts voce Diego) ───────────────────────────
import { generateTts } from "./handlers/tts.js";

export const nexusTts = onRequest(
  {
    region: REGION,
    cors: false,
    timeoutSeconds: 30,
    memory: "512MiB",
    maxInstances: 5,
  },
  async (req, res) => {
    applyCorsOpen(req, res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }

    const authUser = await verifyAcgIdToken(req);
    if (!authUser) { res.status(401).json({ error: "unauthorized" }); return; }

    const body = req.body || {};
    const text = String(body.text || "").trim();
    const voice = String(body.voice || "it-IT-DiegoNeural");
    const rate = String(body.rate || "+10%");
    if (!text) { res.status(400).json({ error: "missing_text" }); return; }
    if (text.length > 3000) { res.status(400).json({ error: "text_too_long", max: 3000 }); return; }

    try {
      const result = await generateTts(text, voice, rate);
      res.set("Content-Type", "audio/mpeg");
      res.set("Cache-Control", "public, max-age=3600");
      res.set("X-Nexo-Cached", result.cached ? "1" : "0");
      res.set("X-Nexo-Cache-Key", result.cacheKey);
      res.status(200).send(result.audio);
    } catch (e) {
      logger.error("nexusTts failed", { error: String(e) });
      res.status(500).json({ error: String(e).slice(0, 300) });
    }
  }
);

// ─── NEXUS audio transcription ─────────────────────────────────
import { handleNexusTranscribeAudio } from "./handlers/nexus-audio.js";

export const nexusTranscribeAudio = onRequest(
  {
    region: REGION,
    cors: false,
    timeoutSeconds: 300,
    memory: "512MiB",
    maxInstances: 5,
    // NOTA: per abilitare Whisper, aggiungi OPENAI_API_KEY via:
    //   firebase functions:secrets:set OPENAI_API_KEY
    // e aggiungi qui `secrets: [ANTHROPIC_API_KEY, defineSecret("OPENAI_API_KEY")]`.
    // Finché non è configurato, l'endpoint risponde 503 con messaggio chiaro.
    secrets: [ANTHROPIC_API_KEY],
  },
  async (req, res) => {
    applyCorsOpen(req, res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }

    const authUser = await verifyAcgIdToken(req);
    if (!authUser) { res.status(401).json({ error: "unauthorized" }); return; }

    // Raw body: Cloud Functions v2 passa req.rawBody. Per multipart dobbiamo
    // parsarlo. Usiamo un parsing minimale perché Cloud Functions non include
    // busboy di default.
    //
    // Formato accettato:
    //  - Content-Type: multipart/form-data con campo "audio"
    //  - Content-Type: audio/* diretto (body è il file)

    const ct = String(req.headers["content-type"] || "");
    let audioBuffer = null, fileName = null, mimeType = null;

    if (/^audio\//.test(ct)) {
      // Upload diretto (client fa fetch con body: blob, content-type: audio/mpeg)
      audioBuffer = Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(req.rawBody || "");
      fileName = String(req.headers["x-file-name"] || "audio.mp3");
      mimeType = ct;
    } else if (/^multipart\/form-data/.test(ct)) {
      // Parse multipart minimale (solo 1 file "audio")
      try {
        const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/.exec(ct);
        const boundary = boundaryMatch ? (boundaryMatch[1] || boundaryMatch[2]) : null;
        if (!boundary) throw new Error("missing_boundary");
        const raw = Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(req.rawBody || "");
        const parts = splitMultipart(raw, boundary);
        for (const part of parts) {
          const nameMatch = /name="([^"]+)"/i.exec(part.headers);
          if (!nameMatch || nameMatch[1] !== "audio") continue;
          const fnMatch = /filename="([^"]+)"/i.exec(part.headers);
          const ctMatch = /content-type:\s*([^\r\n]+)/i.exec(part.headers);
          fileName = fnMatch ? fnMatch[1] : "audio.mp3";
          mimeType = ctMatch ? ctMatch[1].trim() : "audio/mpeg";
          audioBuffer = part.body;
          break;
        }
      } catch (e) {
        res.status(400).json({ error: "multipart_parse_failed", detail: String(e).slice(0, 200) });
        return;
      }
    } else {
      res.status(400).json({ error: "unsupported_content_type", got: ct });
      return;
    }

    if (!audioBuffer || !audioBuffer.length) {
      res.status(400).json({ error: "missing_audio" });
      return;
    }

    const sessionId = String(req.headers["x-session-id"] || "").slice(0, 80) || null;
    try {
      const result = await handleNexusTranscribeAudio({
        audioBuffer, fileName, mimeType,
        userId: authUser.email || authUser.uid,
        sessionId,
      });
      res.status(result.ok ? 200 : 503).json(result);
    } catch (e) {
      logger.error("nexusTranscribeAudio failed", { error: String(e) });
      res.status(500).json({ error: String(e).slice(0, 300) });
    }
  }
);

// Minimal multipart parser (ricerca buffer split su boundary)
function splitMultipart(buf, boundary) {
  const dashBoundary = Buffer.from(`--${boundary}`);
  const parts = [];
  let idx = 0;
  while (idx < buf.length) {
    const start = buf.indexOf(dashBoundary, idx);
    if (start < 0) break;
    const headEnd = buf.indexOf(Buffer.from("\r\n\r\n"), start);
    if (headEnd < 0) break;
    const headers = buf.slice(start + dashBoundary.length, headEnd).toString("utf8");
    const bodyStart = headEnd + 4;
    const nextBoundary = buf.indexOf(dashBoundary, bodyStart);
    if (nextBoundary < 0) break;
    // Body = [bodyStart, nextBoundary - 2] (rimuovi \r\n finale)
    const body = buf.slice(bodyStart, nextBoundary - 2);
    parts.push({ headers, body });
    idx = nextBoundary;
  }
  return parts;
}

// ─── IRIS archivio email ───────────────────────────────────────

// Endpoint autenticato per archiviare un'email in cartella per mittente.
// Pattern coda: scrive in iris_archive_queue, lo script Hetzner consuma.
import { handleIrisArchiveEmail } from "./handlers/iris.js";

export const irisArchiveEmail = onRequest(
  { region: REGION, cors: false, timeoutSeconds: 30, memory: "256MiB", maxInstances: 10 },
  async (req, res) => {
    applyCorsOpen(req, res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
    const authUser = await verifyAcgIdToken(req);
    if (!authUser) { res.status(401).json({ error: "unauthorized" }); return; }

    const body = req.body || {};
    const emailId = String(body.emailId || "").trim();
    if (!emailId) { res.status(400).json({ error: "missing_emailId" }); return; }

    try {
      const r = await handleIrisArchiveEmail({ emailId });
      if (!r.ok) { res.status(400).json({ error: r.error }); return; }
      res.status(200).json(r);
    } catch (e) {
      logger.error("irisArchiveEmail failed", { error: String(e) });
      res.status(500).json({ error: String(e).slice(0, 300) });
    }
  }
);

// ─── Push notifications (FCM) ──────────────────────────────────

// Endpoint autenticato per mandare notifiche push manuali (test + trigger esterni)
export const nexoPushSend = onRequest(
  { region: REGION, cors: false, timeoutSeconds: 30, memory: "256MiB", maxInstances: 5 },
  async (req, res) => {
    applyCorsOpen(req, res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
    const authUser = await verifyAcgIdToken(req);
    if (!authUser) { res.status(401).json({ error: "unauthorized" }); return; }

    const body = req.body || {};
    const title = String(body.title || "").trim();
    const text  = String(body.body  || "").trim();
    const link  = String(body.link  || "/#home").trim();
    const userId = body.userId ? String(body.userId) : null;
    if (!title || !text) { res.status(400).json({ error: "missing_title_or_body" }); return; }

    try {
      const r = await sendPushNotification(title, text, link, userId);
      res.status(200).json(r);
    } catch (e) {
      logger.error("nexoPushSend failed", { error: String(e) });
      res.status(500).json({ error: String(e).slice(0, 300) });
    }
  }
);

// ─── Orchestrator workflow listener ────────────────────────────

export const orchestratorLavagnaListener = onDocumentCreated(
  { region: REGION, document: "nexo_lavagna/{msgId}", memory: "256MiB", maxInstances: 5 },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const msgId = event.params.msgId;
    const v = snap.data() || {};
    if (v.status !== "pending") return;
    const to = String(v.to || "").toLowerCase();
    if (to !== "orchestrator") return;

    logger.info("orchestrator: processing", { msgId, type: v.type });
    try {
      await runOrchestratorWorkflow(msgId, v, snap.ref);
    } catch (e) {
      logger.error("orchestrator: workflow failed", { error: String(e), msgId });
      await snap.ref.set({
        status: "failed",
        error: String(e).slice(0, 300),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  }
);
