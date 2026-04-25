// handlers/echo.js — invio WhatsApp via Waha + risoluzione destinatari rubrica.
import {
  getCosminaDb, db, FieldValue, logger,
  tokenize, matchesAllTokens, prettyName,
} from "./shared.js";

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
  const m = /^(\d+)@/.exec(chatId || "");
  if (!m) return "???";
  const n = m[1];
  if (n.length < 6) return `+${n.slice(0, 2)}***`;
  return `+${n.slice(0, 3)}***${n.slice(-4)}`;
}

async function resolveDestinatarioViaMemo(rawInput) {
  if (!rawInput) return { error: "destinatario_mancante" };
  const clean = String(rawInput).trim().replace(/^@/, "");
  const queryTokens = tokenize(clean);
  if (!queryTokens.length) return { error: "destinatario_mancante" };
  const cosmDb = getCosminaDb();

  let internalCandidates = [];
  try {
    const snap = await cosmDb.collection("cosmina_contatti_interni").limit(500).get();
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

  try {
    const snap = await cosmDb.collection("cosmina_contatti_clienti").limit(500).get();
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
  if (cfg && typeof cfg.dry_run === "boolean") return cfg.dry_run;
  const v = (process.env.ECHO_DRY_RUN ?? process.env.DRY_RUN ?? "true").toLowerCase();
  return v === "true";
}

async function persistEchoMessage(msg) {
  try {
    // Rimuovi chiavi con valore undefined (Firestore non le accetta)
    const clean = {};
    for (const [k, v] of Object.entries(msg)) {
      if (v !== undefined) clean[k] = v;
    }
    await db.collection("echo_messages").doc(msg.id).set({
      ...clean,
      _serverTime: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    logger.error("persistEchoMessage failed", { error: String(e) });
  }
}

function echoMsgId() {
  return "wa_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

export async function handleEchoWhatsApp(parametri, ctx) {
  const msg = (ctx?.userMessage || "").trim();
  let dest = String(parametri.to || parametri.destinatario || parametri.a || parametri.numero || "").trim();
  let body = String(parametri.body || parametri.testo || parametri.messaggio || parametri.text || "").trim();

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

  if (isEchoDryRun(cfg)) {
    await persistEchoMessage({ ...baseMsg, status: "skipped", failedReason: "ECHO_DRY_RUN attivo" });
    return {
      content: `Non ho mandato il messaggio a ${resolved.displayName} perché il dry-run è attivo. Vuoi che lo attivi?`,
      data: { dryRun: true, id, resolvedFrom: resolved.resolvedFrom },
    };
  }

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
          content: `Messaggio inviato a ${resolved.displayName} su WhatsApp.`,
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
  return { content: `Non sono riuscito a inviare il messaggio. ${lastErr || "Errore sconosciuto"}.` };
}
