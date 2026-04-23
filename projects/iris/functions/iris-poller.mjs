/**
 * IRIS EWS poller — fetch nuove email Exchange e classifica con Haiku.
 *
 * Chiamato da irisPollScheduled (onSchedule 5min). Idempotente:
 * persiste watermark (timestamp ultima email) e skip di email già presenti
 * in iris_emails.
 *
 * Auth EWS supportati (configura in cosmina_config/iris_config):
 *   { auth: "basic", server, user, password, mailbox? }
 *   (OAuth token: v0.2)
 *
 * Il pacchetto ews-javascript-api è CommonJS, uso createRequire.
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const ews = require("ews-javascript-api");

const {
  ExchangeService,
  ExchangeVersion,
  Uri,
  WebCredentials,
  WellKnownFolderName,
  ItemView,
  PropertySet,
  BasePropertySet,
  ItemSchema,
  EmailMessageSchema,
  SearchFilter,
  LogicalOperator,
} = ews;

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const CLASSIFY_MODEL = "claude-haiku-4-5";

// Prompt v2 "intent recognition avanzato" — estrae anche intent, dati_estratti,
// contesto_thread, prossimo_passo. Legge l'intero thread (email quotate in cascata).
const CLASSIFY_SYSTEM = `Sei IRIS, il classificatore email di ACG Clima Service (manutenzione HVAC, Piemonte).
Leggi l'INTERO thread (anche email quotate sotto) e rispondi con JSON stretto:

{
  "category": "RICHIESTA_INTERVENTO|GUASTO_URGENTE|PREVENTIVO|CONFERMA_APPUNTAMENTO|FATTURA_FORNITORE|COMUNICAZIONE_INTERNA|PEC_UFFICIALE|AMMINISTRATORE_CONDOMINIO|RISPOSTA_CLIENTE|NEWSLETTER_SPAM|ALTRO",
  "summary": "<1-3 righe>",
  "entities": { "cliente": "...", "condominio": "...", "impianto": "...", "urgenza": "bassa|media|alta|critica", "importo": "...", "tecnico": "...", "indirizzo": "..." },
  "suggestedAction": "RISPONDI|APRI_INTERVENTO|INOLTRA|ARCHIVIA|PREPARA_PREVENTIVO|VERIFICA_PAGAMENTO|URGENTE_CHIAMA",
  "confidence": "high|medium|low",
  "reasoning": "<1-2 frasi>",
  "sentiment": "positivo|neutro|frustrato|arrabbiato|disperato",
  "sentimentReason": "<1 frase>",

  "intent": "preparare_preventivo|registrare_fattura|aprire_intervento_urgente|aprire_intervento_ordinario|rispondere_a_richiesta|registrare_incasso|gestire_pec|sollecitare_pagamento|archiviare|nessuna_azione",
  "dati_estratti": {
    "persone": [{"nome":"","ruolo":"","azienda":""}],
    "aziende": [{"nome":"","piva":"","indirizzo":""}],
    "condomini": [""],
    "importi": [{"valore":"","causale":""}],
    "date": [{"valore":"YYYY-MM-DD","tipo":"scadenza|appuntamento|fattura|generica"}],
    "riferimenti_documenti": [""]
  },
  "contesto_thread": "<1-3 frasi: chi ha iniziato, cosa si è detto, cosa dice l'ultima email>",
  "prossimo_passo": "<1-2 frasi: azione operativa concreta da fare adesso>",

  "intents": [{"category":"...","summary":"...","suggestedAction":"...","intent":"...","entities":{}}]
}

REGOLE:
1. Leggi TUTTO il thread, anche la parte quotata ("On X wrote", "Il X ha scritto", ">", "From:").
2. Ometti campi che non puoi estrarre con certezza — non inventare.
3. SOLO JSON, niente code fence, niente testo extra.
4. "intent" è UNO solo (quello primario). Gli altri stanno in "intents[]".
5. "contesto_thread" spiega la conversazione completa; "prossimo_passo" dà istruzioni operative.
6. "intents" sempre presente con almeno 1 elemento (replica top-level se l'email ha un solo argomento).`;

export async function classifyEmail(anthropicKey, email) {
  const body = [
    `Da: ${email.sender_name ? `${email.sender_name} <${email.sender}>` : email.sender}`,
    `Oggetto: ${email.subject || "(nessun oggetto)"}`,
    `Ricevuta: ${email.received_time || ""}`,
    ``,
    `Corpo (include email quotate sotto — leggi tutto il thread):`,
    (email.body_text || "").slice(0, 8000),
  ].join("\n");

  const resp = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLASSIFY_MODEL,
      max_tokens: 1500, // prompt v2 estrae più dati: persone/aziende/date/thread/next-step
      system: CLASSIFY_SYSTEM,
      messages: [{ role: "user", content: body }],
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Anthropic ${resp.status}: ${t.slice(0, 200)}`);
  }
  const json = await resp.json();
  const text = (json.content || []).filter(b => b.type === "text").map(b => b.text).join("\n").trim();
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  let parsed = {};
  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    try { parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)); } catch {}
  }
  return {
    classification: {
      category: parsed.category || "ALTRO",
      summary: parsed.summary || "",
      sentiment: parsed.sentiment || "neutro",
      sentimentReason: parsed.sentimentReason || "",
      suggestedAction: parsed.suggestedAction || "",
      confidence: parsed.confidence || "low",
      reasoning: parsed.reasoning || "",
      entities: parsed.entities || {},

      // Intent recognition avanzato (v2)
      intent: parsed.intent || "nessuna_azione",
      dati_estratti: parsed.dati_estratti || {},
      contesto_thread: parsed.contesto_thread || "",
      prossimo_passo: parsed.prossimo_passo || "",
      intents: Array.isArray(parsed.intents) ? parsed.intents : [],
    },
    usage: {
      input_tokens: json.usage?.input_tokens || 0,
      output_tokens: json.usage?.output_tokens || 0,
    },
  };
}

function buildExchangeService(cfg) {
  const version = cfg.exchange_version === "2010_SP2"
    ? ExchangeVersion.Exchange2010_SP2
    : ExchangeVersion.Exchange2013_SP1;
  const svc = new ExchangeService(version);
  svc.Credentials = new WebCredentials(cfg.user, cfg.password);
  svc.Url = new Uri(cfg.server);  // es. "https://mail.example.com/EWS/Exchange.asmx"
  return svc;
}

/**
 * Restituisce lista di { message_id, sender, sender_name, subject, body_text, received_time }
 * Le email sono ordinate dalla più recente, filtrate per dateFromIso.
 */
export async function fetchNewEmails({ cfg, dateFromIso, limit = 50 }) {
  const svc = buildExchangeService(cfg);
  const inbox = WellKnownFolderName.Inbox;
  const view = new ItemView(limit);

  // Filtra email ricevute dopo dateFromIso (se presente)
  let results;
  if (dateFromIso) {
    const filter = new SearchFilter.IsGreaterThan(
      ItemSchema.DateTimeReceived,
      new Date(dateFromIso),
    );
    results = await svc.FindItems(inbox, filter, view);
  } else {
    results = await svc.FindItems(inbox, view);
  }

  // Carica properties complete (body text)
  const ids = results.Items.map(i => i.Id);
  if (ids.length === 0) return [];
  const propSet = new PropertySet(BasePropertySet.FirstClassProperties);
  propSet.Add(EmailMessageSchema.Body);
  await svc.LoadPropertiesForItems(results.Items, propSet);

  const out = [];
  for (const item of results.Items) {
    const bodyText = item.Body && item.Body.Text ? item.Body.Text
      : (item.Body?.toString?.() || "");
    const fromAddr = item.From?.Address || item.From?.Name || "";
    const fromName = item.From?.Name || "";
    const received = item.DateTimeReceived;
    const receivedIso = received?.ToISOString?.() || new Date(received).toISOString();
    out.push({
      message_id: item.InternetMessageId || item.Id.UniqueId,
      ews_item_id: item.Id.UniqueId,
      sender: fromAddr,
      sender_name: fromName,
      subject: item.Subject || "",
      body_text: bodyText,
      received_time: receivedIso,
    });
  }
  return out;
}
