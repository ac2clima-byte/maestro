// handlers/echo-inbound.js — webhook Waha per messaggi WA in entrata.
// Waha fa POST con { chatId, from, body, timestamp, ... }.
// Identifica mittente (rubrica), salva echo_messages direction="inbound",
// route secondo chi ha scritto (Alberto / tecnico / cliente).
import {
  db, FieldValue, logger,
  getCosminaDb, tokenize,
} from "./shared.js";

function normalizeNumber(input) {
  let clean = String(input || "")
    .replace(/[\s\-()/.]/g, "")
    .replace(/^@/, "")
    .replace(/@(c\.us|s\.whatsapp\.net|lid)$/i, "");
  if (clean.startsWith("+")) clean = clean.slice(1);
  if (clean.length === 10 && clean.startsWith("3")) clean = "39" + clean;
  return /^\d{10,15}$/.test(clean) ? clean : null;
}

function numberMatches(stored, query) {
  const a = normalizeNumber(stored);
  const b = normalizeNumber(query);
  if (!a || !b) return false;
  if (a === b) return true;
  // Match su ultimi 10 (ignora prefisso internazionale)
  return a.slice(-10) === b.slice(-10);
}

async function identifyMittente(fromNumber) {
  if (!fromNumber) return { tipo: "ignoto", nome: null };
  const num = normalizeNumber(fromNumber);
  if (!num) return { tipo: "ignoto", nome: null };

  const cosm = getCosminaDb();

  // 1. Cerca in cosmina_contatti_interni (tecnici/ufficio ACG/Guazzotti)
  try {
    const snap = await cosm.collection("cosmina_contatti_interni").limit(500).get();
    for (const doc of snap.docs) {
      const v = doc.data() || {};
      const tp = v.telefono_personale;
      const tl = v.telefono_lavoro;
      if ((tp && numberMatches(tp, num)) || (tl && numberMatches(tl, num))) {
        const isAlberto = String(v.nome || "").toLowerCase().includes("alberto");
        return {
          tipo: isAlberto ? "alberto" : (String(v.categoria || "").toLowerCase() === "tecnico" ? "tecnico" : "ufficio_interno"),
          nome: v.nome,
          azienda: v.azienda,
          resolvedFrom: "cosmina_contatti_interni",
        };
      }
    }
  } catch (e) { logger.warn("inbound: contatti_interni lookup", { error: String(e) }); }

  // 2. Cerca in cosmina_contatti_clienti
  try {
    const snap = await cosm.collection("cosmina_contatti_clienti").limit(800).get();
    for (const doc of snap.docs) {
      const v = doc.data() || {};
      const t = v.telefono_normalizzato || v.telefono;
      if (t && numberMatches(t, num)) {
        return {
          tipo: "cliente",
          nome: v.nome_completo || `${v.nome || ""} ${v.cognome || ""}`.trim(),
          resolvedFrom: "cosmina_contatti_clienti",
        };
      }
    }
  } catch (e) { logger.warn("inbound: contatti_clienti lookup", { error: String(e) }); }

  return { tipo: "ignoto", nome: null, numero: num };
}

// Notifica Alberto di un nuovo messaggio in entrata
async function notifyAlberto({ mittente, body, fromNumber }) {
  try {
    await db.collection("nexo_lavagna").add({
      from: "echo_inbound",
      to: "echo",
      type: "wa_inbound_notify",
      payload: {
        canale: "wa",
        destinatario: "alberto",
        testo: `📥 WA in entrata da ${mittente.nome || fromNumber} (${mittente.tipo}): "${String(body).slice(0, 200)}"`,
        mittenteTipo: mittente.tipo,
        mittenteNome: mittente.nome,
        fromNumber,
      },
      status: "pending",
      priority: mittente.tipo === "cliente" ? "high" : "normal",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (e) { logger.warn("inbound: notify Alberto failed", { error: String(e) }); }
}

export async function handleEchoInboundWebhook(req) {
  // Waha webhook payload è variabile. Prova formati noti.
  const body = req.body || {};
  const payload = body.payload || body;

  const fromNumber =
    payload.from || payload.fromNumber || payload.number ||
    payload.chatId || payload.source || "";
  const text = String(
    payload.body || payload.text || payload.message || payload.content || ""
  ).slice(0, 2000);
  const wahaMessageId = payload.id || payload.messageId || payload.idMessage || null;
  const eventType = body.event || payload.event || "message";

  // Filtra eventi non messaggio
  if (!/message|text/i.test(String(eventType)) && !text) {
    return { status: 200, body: { ok: true, ignored: "non_message_event", event: eventType } };
  }

  // Ignora messaggi outbound (eco dei nostri invii)
  if (payload.fromMe === true || payload.fromme === true) {
    return { status: 200, body: { ok: true, ignored: "own_message" } };
  }

  const norm = normalizeNumber(fromNumber);
  if (!norm) {
    logger.warn("echoInbound: numero mittente non normalizzabile", { fromNumber });
    return { status: 400, body: { error: "invalid_from_number" } };
  }

  // Identifica chi ha scritto
  const mittente = await identifyMittente(norm);
  logger.info("echoInbound: recv", { from: norm, text: text.slice(0, 80), mittenteTipo: mittente.tipo });

  // Salva sempre in echo_messages
  const id = `wa_in_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  try {
    await db.collection("echo_messages").doc(id).set({
      id,
      channel: "whatsapp",
      direction: "inbound",
      from: norm,
      fromDisplayName: mittente.nome || null,
      mittenteTipo: mittente.tipo,
      body: text,
      wahaMessageId,
      status: "received",
      createdAt: FieldValue.serverTimestamp(),
      _serverTime: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    logger.error("echoInbound: save failed", { error: String(e) });
  }

  // Routing per tipo mittente
  if (mittente.tipo === "alberto") {
    // Alberto ha scritto: interpreta come comando NEXUS
    // Post messaggio Lavagna per nexusRouter interno (future feat)
    try {
      await db.collection("nexo_lavagna").add({
        from: "echo_inbound",
        to: "nexus",
        type: "comando_alberto_wa",
        payload: { testo: text, wahaMessageId, echoMessageId: id },
        status: "pending",
        priority: "normal",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } catch (e) { logger.warn("inbound: alberto cmd lavagna failed", { error: String(e) }); }
    return { status: 200, body: { ok: true, routed: "alberto", messageId: id } };
  }

  if (mittente.tipo === "tecnico" || mittente.tipo === "ufficio_interno") {
    // Tecnico/interno: salva + notifica Alberto
    await notifyAlberto({ mittente, body: text, fromNumber: norm });
    return { status: 200, body: { ok: true, routed: "interno", messageId: id } };
  }

  if (mittente.tipo === "cliente") {
    // Cliente: priorità alta, notifica Alberto
    await notifyAlberto({ mittente, body: text, fromNumber: norm });
    return { status: 200, body: { ok: true, routed: "cliente", messageId: id } };
  }

  // Ignoto: notifica Alberto comunque
  await notifyAlberto({ mittente, body: text, fromNumber: norm });
  return { status: 200, body: { ok: true, routed: "ignoto", messageId: id } };
}
