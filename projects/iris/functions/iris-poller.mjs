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

const CLASSIFY_SYSTEM = `Sei l'assistente di classificazione email per ACG Clima Service (manutenzione HVAC).
Classifica l'email in UNA categoria tra:
- GUASTO_URGENTE (rottura impianto, emergenza)
- PEC_UFFICIALE (PEC da ente, comune, amministrazione)
- RICHIESTA_INTERVENTO (manutenzione ordinaria, preventivo su impianto)
- RICHIESTA_CONTRATTO (preventivo contratto manutenzione, offerta)
- RICHIESTA_PAGAMENTO (solleciti, estratti conto, fattura da pagare)
- FATTURA_FORNITORE (fattura ricevuta)
- COMUNICAZIONE_INTERNA (collega ACG)
- NEWSLETTER_SPAM (newsletter, promozioni, spam)
- ALTRO

Rispondi SOLO con JSON stretto:
{
  "category": "<SLUG>",
  "summary": "<1 frase>",
  "sentiment": "positivo|neutro|negativo|urgente",
  "suggestedAction": "<verbo_azione>",
  "entities": { "cliente": "...", "condominio": "...", "indirizzo": "...", "targa": "..." }
}
Niente code fence, niente testo extra.`;

export async function classifyEmail(anthropicKey, email) {
  const body = [
    `Da: ${email.sender_name ? `${email.sender_name} <${email.sender}>` : email.sender}`,
    `Oggetto: ${email.subject || "(nessun oggetto)"}`,
    ``,
    `Corpo:`,
    (email.body_text || "").slice(0, 3000),
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
      max_tokens: 400,
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
      suggestedAction: parsed.suggestedAction || "",
      entities: parsed.entities || {},
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
