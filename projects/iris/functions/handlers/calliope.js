// handlers/calliope.js — bozze via Claude Sonnet (DRY-RUN).
import {
  ANTHROPIC_API_KEY, ANTHROPIC_URL, db, FieldValue, logger,
  fetchIrisEmails,
} from "./shared.js";
import { handleMemoDossier } from "./memo.js";

const CALLIOPE_MODEL = "claude-sonnet-4-6";
const CALLIOPE_SYSTEM_PROMPT = `Sei l'assistente di Alberto Contardi, titolare di ACG Clima Service (manutenzione HVAC, Piemonte). Scrivi bozze email professionali in italiano.

REGOLE:
- Tono cordiale ma professionale, conciso. Non smielato.
- Italiano corretto, niente anglicismi inutili.
- Non inventare fatti, importi, date o appuntamenti non presenti nel contesto.
- Se mancano informazioni cruciali, chiedile esplicitamente nella bozza.
- Firma con "Cordiali saluti,\\nAlberto Contardi\\nACG Clima Service".

OUTPUT: solo il testo della bozza. Niente preambolo, niente markdown. Max 1500 caratteri.`;

export async function handleCalliopeBozza(parametri, ctx) {
  const emailId = String(parametri.emailId || parametri.id || "").trim();
  const tono = String(parametri.tono || parametri.tone || "cordiale").trim();
  const note = String(parametri.note || parametri.istruzioni || "").trim();
  const msg = String(ctx?.userMessage || "").toLowerCase();

  // Routing: preventivo / sollecito / comunicazione condominio
  if (/preventiv/.test(msg) || /preventiv/.test(String(parametri.tipo || ""))) {
    return generaBozzaPreventivo(parametri, ctx);
  }
  if (/sollecit/.test(msg) || /sollecit/.test(String(parametri.tipo || ""))) {
    return generaBozzaSollecito(parametri, ctx);
  }
  if (/comunicazione.*condomin|comunicazione.*condomin/.test(msg)) {
    return generaBozzaComunicazione(parametri, ctx);
  }

  // Risposta email standard (con contesto IRIS automatico)
  if (emailId && /^[A-Za-z0-9_-]{10,}$/.test(emailId)) {
    return generaBozzaFromEmail(emailId, tono, note);
  }

  let query = String(
    parametri.mittente || parametri.email || parametri.destinatario || parametri.a || parametri.to || "",
  ).trim();
  if (!query && ctx?.userMessage) {
    const m = /(?:a|per|rispondi(?:amo)?\s+a|bozza\s+a|scrivi.*a|risposta\s+a)\s+([A-Za-zÀ-ÿ][\wÀ-ÿ.\s]{2,50})$/i.exec(ctx.userMessage.trim());
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
  if (!match) return { content: `Non trovo email recenti correlate a "${query}". Se è un cliente nuovo, specifica 'bozza preventivo per X' e useremo dati CRM.` };
  return generaBozzaFromEmail(match.id, tono, note);
}

// ─── Preventivo contestualizzato (integra MEMO dossier) ────────
async function generaBozzaPreventivo(parametri, ctx) {
  const apiKey = ANTHROPIC_API_KEY.value();
  if (!apiKey) return { content: "CALLIOPE non configurato (ANTHROPIC_API_KEY mancante)." };
  const tono = String(parametri.tono || "formale").trim();
  const oggettoLavoro = String(parametri.oggetto || parametri.intervento || parametri.note || "").trim();

  // Estrai cliente dal prompt
  let cliente = String(parametri.cliente || parametri.condominio || parametri.a || parametri.destinatario || "").trim();
  const msg = String(ctx?.userMessage || "");
  if (!cliente) {
    const m = /(?:per|a|al)\s+(?:condominio\s+)?([A-Za-zÀ-ÿ][\wÀ-ÿ.\s]{2,50})/i.exec(msg);
    if (m) cliente = m[1].trim();
  }
  if (!cliente) {
    return { content: "Per il preventivo mi serve il cliente/condominio. Prova: 'scrivi bozza preventivo per Kristal'." };
  }

  // Chiedi dossier a MEMO (cross-project lookup)
  let dossier = null;
  try {
    const memo = await handleMemoDossier({ cliente }, ctx);
    dossier = memo.content;
  } catch (e) {
    logger.warn("calliope: memo lookup failed", { error: String(e) });
  }

  const userPrompt = [
    `=== RICHIESTA PREVENTIVO ===`,
    `Cliente/Condominio: ${cliente}`,
    oggettoLavoro ? `Oggetto lavoro: ${oggettoLavoro}` : "",
    ``,
    `=== CONTESTO DAL DOSSIER MEMO ===`,
    dossier || "(nessun dossier disponibile)",
    ``,
    `=== ISTRUZIONI ===`,
    `Tono: ${tono}. Genera bozza preventivo con:`,
    `- Intestazione formale cliente (usa anagrafica dal dossier)`,
    `- Riferimento eventuali interventi/impianti dal dossier`,
    `- Placeholder per importi (es. "[importo da definire]")`,
    `- Firma ACG Clima Service`,
  ].filter(Boolean).join("\n");

  const { corpo, usage } = await callSonnet(apiKey, userPrompt);
  const bozzaId = await salvaBozza({
    tipo: "preventivo", tono,
    corpo,
    oggetto: `Preventivo — ${cliente}`,
    contesto: { cliente, oggettoLavoro, dossierUsed: !!dossier },
    destinatario: null,
    usage, ctx,
  });

  return {
    content:
      `✍️ **Preventivo CALLIOPE** (DRY-RUN, salvato come \`${bozzaId}\`)\n\n` +
      `**Per:** ${cliente}\n\n---\n${corpo}\n---\n\n` +
      `_Contesto: ${dossier ? "dossier MEMO usato" : "senza dossier"}._`,
    data: { bozzaId, tipo: "preventivo", usage },
  };
}

async function generaBozzaSollecito(parametri, ctx) {
  const apiKey = ANTHROPIC_API_KEY.value();
  if (!apiKey) return { content: "CALLIOPE non configurato." };
  const cliente = String(parametri.cliente || parametri.a || "").trim();
  const livello = /(ultim|ultimatum|finale)/i.test(String(ctx?.userMessage || ""))
    ? "ultimo_avviso"
    : /(formal|second|ufficial)/i.test(String(ctx?.userMessage || ""))
      ? "formale"
      : "cortese";
  const importo = String(parametri.importo || "").trim();
  const riferimento = String(parametri.riferimento || parametri.fattura || "").trim();

  if (!cliente) return { content: "Per il sollecito mi serve il cliente. Prova: 'scrivi sollecito cortese a Bianchi'." };

  const userPrompt = [
    `=== SOLLECITO PAGAMENTO ===`,
    `Cliente: ${cliente}`,
    importo ? `Importo: ${importo}` : "Importo: [da definire]",
    riferimento ? `Riferimento fattura: ${riferimento}` : "",
    `Livello: ${livello} (cortese | formale | ultimo_avviso)`,
    ``,
    `Genera sollecito in italiano. Firma ACG Clima Service.`,
  ].filter(Boolean).join("\n");

  const { corpo, usage } = await callSonnet(apiKey, userPrompt);
  const bozzaId = await salvaBozza({
    tipo: "sollecito", tono: livello, corpo,
    oggetto: `Sollecito pagamento — ${cliente}`,
    contesto: { cliente, importo, riferimento, livello },
    destinatario: null, usage, ctx,
  });
  return {
    content: `✍️ **Sollecito CALLIOPE** (${livello}, \`${bozzaId}\`)\n\n---\n${corpo}\n---`,
    data: { bozzaId, tipo: "sollecito", livello, usage },
  };
}

async function generaBozzaComunicazione(parametri, ctx) {
  const apiKey = ANTHROPIC_API_KEY.value();
  if (!apiKey) return { content: "CALLIOPE non configurato." };
  const condominio = String(parametri.condominio || parametri.cliente || "").trim();
  const oggetto = String(parametri.oggetto || parametri.argomento || "").trim();

  if (!condominio || !oggetto) {
    return { content: "Per la comunicazione servono condominio + oggetto. Es: 'comunicazione al condominio Kristal per cambio ora'." };
  }

  // Chiedi dossier
  let dossier = "";
  try { dossier = (await handleMemoDossier({ condominio }, ctx))?.content || ""; } catch {}

  const userPrompt = [
    `=== COMUNICAZIONE CONDOMINIO ===`,
    `Condominio: ${condominio}`,
    `Oggetto: ${oggetto}`,
    ``,
    `=== CONTESTO ===`,
    dossier || "(nessun dossier)",
    ``,
    `Tono formale, lineare. Firma ACG Clima Service.`,
  ].join("\n");

  const { corpo, usage } = await callSonnet(apiKey, userPrompt);
  const bozzaId = await salvaBozza({
    tipo: "comunicazione_condominio", tono: "formale", corpo,
    oggetto: `${oggetto} — ${condominio}`,
    contesto: { condominio, oggetto, dossierUsed: !!dossier },
    destinatario: null, usage, ctx,
  });
  return {
    content: `✍️ **Comunicazione CALLIOPE** per ${condominio} (\`${bozzaId}\`)\n\n---\n${corpo}\n---`,
    data: { bozzaId, tipo: "comunicazione_condominio", usage },
  };
}

async function callSonnet(apiKey, userPrompt) {
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
    throw new Error(`Sonnet ${resp.status}: ${text.slice(0, 200)}`);
  }
  const json = await resp.json();
  const corpo = (json.content || []).filter(b => b.type === "text").map(b => b.text).join("\n").trim();
  return { corpo, usage: json.usage || {} };
}

async function salvaBozza({ tipo, tono, corpo, oggetto, contesto, destinatario, usage, ctx }) {
  const bozzaId = `boz_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  try {
    await db.collection("calliope_bozze").doc(bozzaId).set({
      id: bozzaId,
      tipo, tono,
      stato: "in_revisione",
      versione: 1,
      corrente: {
        versione: 1, corpo, oggetto: oggetto.slice(0, 150),
        firma: "Cordiali saluti,\nAlberto Contardi\nACG Clima Service",
        generataIl: new Date().toISOString(),
        generataDa: "ai", modello: CALLIOPE_MODEL,
        usage: { inputTokens: usage.input_tokens || 0, outputTokens: usage.output_tokens || 0 },
      },
      contesto: { ...contesto, richiedente: "nexus" },
      destinatario,
      _dryRun: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    logger.error("calliope salvaBozza failed", { error: String(e) });
  }
  return bozzaId;
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
