// handlers/echo-wa-inbox.js — intercetta WA inbox da COSMINA.
//
// Architettura (v0.1):
// - Source: collection `cosmina_inbox` su progetto garbymobile-f89ac (cross-project).
// - Filtro WA: fonte == "whatsapp", direzione == "entrata".
// - Dato che è un progetto DIVERSO da nexo-hub, NON possiamo fare trigger
//   onDocumentCreated dalla function nexo → usiamo polling schedulato ogni 5min.
// - Per ogni doc non ancora analizzato da NEXO (no campo `nexo_analysis.at`):
//   chiama Haiku → scrive `nexo_analysis` nel doc + se urgente manda push.
//
// Handler NEXUS chat:
// - "messaggi WA in arrivo" / "ultimo WA" → lista con analisi.

import {
  getCosminaDb, db, FieldValue, logger,
  ANTHROPIC_API_KEY, ANTHROPIC_URL, MODEL,
  sendPushNotification, fmtDataOra,
} from "./shared.js";

const WA_ANALYSIS_SYSTEM = `Sei IRIS, classificatore messaggi per ACG Clima Service (manutenzione HVAC, Piemonte).
Hai ricevuto un messaggio WhatsApp ricevuto sull'utenza aziendale.
Rispondi SOLO con JSON valido:

{
  "intent": "guasto_urgente|richiesta_intervento|informazione|preventivo|appuntamento|lamentela|conferma|spam|altro",
  "urgenza": "bassa|media|alta|critica",
  "riassunto": "<1 frase>",
  "entita": {
    "condominio": "<se citato>",
    "indirizzo": "<se citato>",
    "impianto": "<se citato>"
  },
  "azione_suggerita": "<1 frase operativa concreta, es. 'Aprire intervento urgente con Malvicino e mandare conferma al cliente'>"
}

REGOLE:
- Se il mittente chiede "quando venite?" / "è già passato?" → intent=informazione, urgenza=bassa.
- Se dice "non c'è acqua calda" / "non parte la caldaia" / "perdita acqua" → intent=guasto_urgente, urgenza=critica o alta.
- Se chiede prezzo/offerta → intent=preventivo.
- Se è newsletter/spam/catena → intent=spam.
- Ometti campi entita che non riesci a estrarre.
- SOLO JSON, niente code fence, niente testo extra.`;

async function callHaikuForWa(apiKey, message, senderName, senderNumber) {
  const payload = {
    model: MODEL,
    max_tokens: 600,
    system: WA_ANALYSIS_SYSTEM,
    messages: [{
      role: "user",
      content: [
        `Da: ${senderName || senderNumber || "?"} (${senderNumber || "?"})`,
        `Messaggio:`,
        String(message).slice(0, 3000),
      ].join("\n"),
    }],
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
    const t = await resp.text();
    throw new Error(`Haiku ${resp.status}: ${t.slice(0, 300)}`);
  }
  const json = await resp.json();
  const text = (json.content || []).filter(b => b.type === "text").map(b => b.text).join("\n").trim();
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s < 0 || e <= s) return null;
  try { return JSON.parse(text.slice(s, e + 1)); } catch { return null; }
}

/**
 * Processa nuovi messaggi WA in cosmina_inbox.
 * Eseguito da scheduler ogni 5 minuti.
 */
export async function runWaInboxPoller({ limit = 20 } = {}) {
  const apiKey = ANTHROPIC_API_KEY.value();
  if (!apiKey) return { skipped: "no_anthropic_key" };

  const cosm = getCosminaDb();
  // Ultimi messaggi WA in entrata NON ancora analizzati da NEXO
  let snap;
  try {
    snap = await cosm.collection("cosmina_inbox")
      .where("fonte", "==", "whatsapp")
      .where("direzione", "==", "entrata")
      .orderBy("created_at", "desc")
      .limit(limit)
      .get();
  } catch (e) {
    logger.warn("waInboxPoller: query failed", { error: String(e).slice(0, 200) });
    return { error: "query_failed", detail: String(e).slice(0, 200) };
  }

  let analyzed = 0, skipped = 0, pushed = 0, errors = 0;
  for (const doc of snap.docs) {
    const d = doc.data() || {};
    // Skip se già analizzato da NEXO
    if (d.nexo_analysis && d.nexo_analysis.at) { skipped++; continue; }
    // Skip se archiviato o stato chiuso
    if (d.archived === true || d.stato === "chiuso") { skipped++; continue; }
    // Skip se nessun body
    if (!d.body || !d.body.trim()) { skipped++; continue; }

    let analysis = null;
    try {
      analysis = await callHaikuForWa(apiKey, d.body, d.from_name, d.from_number);
    } catch (e) {
      errors++;
      logger.warn("waInboxPoller: Haiku failed", { msgId: doc.id, error: String(e).slice(0, 200) });
      continue;
    }
    if (!analysis) { errors++; continue; }

    // Scrivi nexo_analysis nel doc (cross-project)
    try {
      await doc.ref.set({
        nexo_analysis: {
          ...analysis,
          at: FieldValue.serverTimestamp(),
          model: MODEL,
        },
      }, { merge: true });
      analyzed++;
    } catch (e) {
      errors++;
      logger.warn("waInboxPoller: write failed", { msgId: doc.id, error: String(e).slice(0, 200) });
      continue;
    }

    // Push notification per urgenze
    if (analysis.urgenza === "critica" || analysis.urgenza === "alta") {
      try {
        const senderLabel = d.from_name || d.from_number || "?";
        const urgIcon = analysis.urgenza === "critica" ? "🔴" : "🟠";
        await sendPushNotification(
          `${urgIcon} WA urgente da ${senderLabel}`,
          `${analysis.riassunto || d.body.slice(0, 100)}${analysis.azione_suggerita ? ` — ${analysis.azione_suggerita}` : ""}`,
          `/#echo/wa-inbox`,
          null,
        );
        pushed++;
      } catch (e) {
        logger.warn("waInboxPoller: push failed", { msgId: doc.id, error: String(e).slice(0, 150) });
      }
    }
  }

  logger.info("waInboxPoller done", { analyzed, skipped, pushed, errors, total: snap.size });
  return { analyzed, skipped, pushed, errors, total: snap.size };
}

/**
 * Handler per NEXUS chat: "messaggi WA in arrivo" / "WA non gestiti".
 */
export async function handleWaInboxList(parametri) {
  const limit = Math.min(Number(parametri?.limit || 20), 50);
  const cosm = getCosminaDb();
  let snap;
  try {
    snap = await cosm.collection("cosmina_inbox")
      .where("fonte", "==", "whatsapp")
      .where("direzione", "==", "entrata")
      .orderBy("created_at", "desc")
      .limit(limit)
      .get();
  } catch (e) {
    return { content: `Errore query cosmina_inbox: ${String(e).slice(0, 200)}` };
  }

  const rows = [];
  snap.forEach(d => {
    const v = d.data() || {};
    if (v.archived === true) return;
    rows.push({
      id: d.id,
      from: v.from_name || v.from_number || "?",
      body: String(v.body || "").slice(0, 200),
      stato: v.stato || "?",
      urgente: v.urgente === true,
      categoria: v.categoria || null,
      sintesi_ai: v.sintesi_ai || null,
      nexo: v.nexo_analysis || null,
      when: v.wa_timestamp || v.created_at || null,
    });
  });

  if (!rows.length) return { content: "📭 Nessun messaggio WhatsApp in arrivo non archiviato." };

  const lines = rows.slice(0, 15).map((r, i) => {
    const when = r.when ? fmtDataOra(r.when) : "?";
    const urgIcon = r.nexo?.urgenza === "critica" ? "🔴" :
                    r.nexo?.urgenza === "alta" ? "🟠" :
                    r.urgente ? "⚠️" : " ·";
    const riassunto = r.nexo?.riassunto || r.sintesi_ai || r.body.slice(0, 80);
    const intent = r.nexo?.intent ? ` [${r.nexo.intent}]` : "";
    const statoTag = r.stato === "chiuso" ? " ✓" : "";
    return `${i + 1}. ${urgIcon} [${when}] **${r.from}**${intent}${statoTag}\n   ${riassunto}`;
  }).join("\n\n");

  const totale = rows.length;
  const urgenti = rows.filter(r => r.nexo?.urgenza === "critica" || r.nexo?.urgenza === "alta" || r.urgente).length;
  const header = `📱 **WhatsApp in arrivo** — ${totale} messaggi${urgenti ? ` (${urgenti} urgenti)` : ""}`;

  return {
    content: `${header}\n\n${lines}${rows.length > 15 ? `\n\n…e altri ${rows.length - 15}.` : ""}`,
    data: { total: totale, urgenti, sampled: rows.slice(0, 15) },
  };
}

/**
 * Handler "analizza ultimo WA" — prende l'ultimo messaggio WA e fa analisi
 * puntuale (anche se già analizzato, rifà fresh).
 */
export async function handleWaInboxAnalyzeLast(parametri) {
  const cosm = getCosminaDb();
  const apiKey = ANTHROPIC_API_KEY.value();
  if (!apiKey) return { content: "Non posso analizzare: ANTHROPIC_API_KEY mancante." };

  let snap;
  try {
    snap = await cosm.collection("cosmina_inbox")
      .where("fonte", "==", "whatsapp")
      .where("direzione", "==", "entrata")
      .orderBy("created_at", "desc")
      .limit(1)
      .get();
  } catch (e) {
    return { content: `Errore query: ${String(e).slice(0, 200)}` };
  }
  if (snap.empty) return { content: "Nessun messaggio WA in arrivo." };

  const doc = snap.docs[0];
  const d = doc.data() || {};
  if (!d.body) return { content: "L'ultimo messaggio WA non ha testo (solo media?)." };

  let analysis;
  try {
    analysis = await callHaikuForWa(apiKey, d.body, d.from_name, d.from_number);
  } catch (e) {
    return { content: `Errore analisi: ${String(e).slice(0, 200)}` };
  }
  if (!analysis) return { content: "Parsing risposta modello fallito." };

  // Aggiorna il doc
  try {
    await doc.ref.set({
      nexo_analysis: { ...analysis, at: FieldValue.serverTimestamp(), model: MODEL },
    }, { merge: true });
  } catch {}

  const senderLabel = d.from_name || d.from_number || "?";
  const when = fmtDataOra(d.wa_timestamp || d.created_at);
  const lines = [];
  lines.push(`📱 **Ultimo WA da ${senderLabel}** (${when})`);
  lines.push("");
  lines.push(`> ${String(d.body).slice(0, 300)}`);
  lines.push("");
  lines.push(`**Intent**: \`${analysis.intent || "?"}\``);
  lines.push(`**Urgenza**: ${analysis.urgenza || "?"}`);
  if (analysis.riassunto) lines.push(`**Riassunto**: ${analysis.riassunto}`);
  const ent = analysis.entita || {};
  const entRows = [];
  if (ent.condominio) entRows.push(`  • Condominio: ${ent.condominio}`);
  if (ent.indirizzo) entRows.push(`  • Indirizzo: ${ent.indirizzo}`);
  if (ent.impianto) entRows.push(`  • Impianto: ${ent.impianto}`);
  if (entRows.length) { lines.push("**Entità**:"); lines.push(entRows.join("\n")); }
  if (analysis.azione_suggerita) { lines.push(""); lines.push(`**Azione suggerita**: ${analysis.azione_suggerita}`); }

  return {
    content: lines.join("\n"),
    data: { msgId: doc.id, analysis },
  };
}
