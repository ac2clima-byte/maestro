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

function isEchoDryRun(cfg, parametri = {}) {
  // Sicurezza: sessioni di test FORGE → SEMPRE dry-run, qualsiasi config dica.
  const sid = String(parametri.sessionId || "");
  if (sid.startsWith("forge-test")) return true;
  if (parametri.forceDryRun === true) return true;
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
  const sessionId = ctx?.sessionId || null;
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

  if (!dest) {
    // Salva pending per intercettare il turno successivo: utente
    // tipicamente risponde "[Nome Cognome] [testo]" → tryInterceptEchoPending
    // ricostruirà la chiamata.
    if (sessionId) {
      try {
        await db.collection("nexo_echo_pending").doc(sessionId).set({
          kind: "echo_wa_destinatario",
          have: { dest: false, body: !!body },
          partialBody: body || null,
          sessionId,
          createdAt: FieldValue.serverTimestamp(),
        });
      } catch {}
    }
    return { content: "A chi mando il messaggio? Dimmi nome e cognome (es. \"Andrea Malvicino\"), poi il testo." };
  }
  if (!body) {
    if (sessionId) {
      try {
        await db.collection("nexo_echo_pending").doc(sessionId).set({
          kind: "echo_wa_testo",
          have: { dest: true, body: false },
          partialDest: dest,
          sessionId,
          createdAt: FieldValue.serverTimestamp(),
        });
      } catch {}
    }
    return { content: `Cosa scrivo a ${dest}?` };
  }
  if (body.length > 2000) return { content: "Testo troppo lungo (max 2000 caratteri)." };

  if (/^\+?\d{9,15}$/.test(dest.replace(/[\s\-()]/g, ""))) {
    return {
      content:
        `Non mando a numeri grezzi per sicurezza. Dimmi il nome (tecnico, cliente, condominio) e cerco io il numero in COSMINA.`,
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

  if (isEchoDryRun(cfg, parametri)) {
    await persistEchoMessage({ ...baseMsg, status: "skipped", failedReason: "ECHO_DRY_RUN attivo" });
    // Salva pending leggero così se Alberto risponde "si/ok/grazie" il
    // turno successivo non cade su Haiku (che genererebbe un saluto
    // generico). Non disabilita DRY_RUN: per gli invii reali serve cambio
    // manuale in cosmina_config/echo_config (modifica di sicurezza).
    if (sessionId) {
      try {
        await db.collection("nexo_echo_pending").doc(sessionId).set({
          kind: "echo_wa_dryrun_info",
          dryRunAck: true,
          destDisplay: resolved.displayName || "?",
          sessionId,
          createdAt: FieldValue.serverTimestamp(),
        });
      } catch {}
    }
    return {
      content: `Modalità test attiva: il messaggio a ${resolved.displayName} è stato preparato ma non spedito. Per abilitare gli invii reali bisogna togliere il dry-run da cosmina_config/echo_config (è una modifica di sicurezza, va fatta manualmente).`,
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

// Intercept del turno successivo: se in nexo_echo_pending c'è un pending
// (kind echo_wa_destinatario o echo_wa_testo), parsa il messaggio utente
// per completare destinatario+testo e chiama handleEchoWhatsApp.
//
// Pattern parsing per kind=echo_wa_destinatario (manca dest):
//   "Victor dellafiore lavoro" → dest="Victor dellafiore", body="lavoro"
//   "andrea malvicino: ciao come va" → dest="andrea malvicino", body="ciao come va"
//   "Marco" → solo dest, manca body → ri-prompta per il testo
// Per kind=echo_wa_testo (ha dest, manca body): tutto il messaggio = body.
//
// Se l'utente risponde con annullo ("no", "lascia stare", "annulla"), cancella pending.
export async function tryInterceptEchoPending({ userMessage, sessionId }) {
  if (!sessionId) return null;
  const t = String(userMessage || "").trim();
  if (!t) return null;

  let pendingDoc, pendingData;
  try {
    pendingDoc = await db.collection("nexo_echo_pending").doc(sessionId).get();
    if (!pendingDoc.exists) return null;
    pendingData = pendingDoc.data() || {};
    if (!pendingData.kind || !String(pendingData.kind).startsWith("echo_wa_")) return null;
  } catch {
    return null;
  }

  // Annullamento esplicito
  if (/^\s*(?:lascia\s+stare|annull|no\b|stop|basta|fa\s+nulla|niente)/i.test(t)) {
    try { await pendingDoc.ref.delete(); } catch {}
    return {
      content: "Ok, lascio perdere il messaggio WhatsApp.",
      _echoPendingHandled: true,
    };
  }

  // kind=echo_wa_dryrun_info: pending puramente informativo dopo dry-run.
  // Riconosce 3 famiglie di follow-up:
  //   1. "togli/disattiva/spegni dry run" / "abilita reali" / "manda davvero"
  //      → istruzioni passo-passo per cambio manuale (non lo facciamo noi, è
  //      un cambio di sicurezza)
  //   2. "si/ok/grazie/capito" → ack semplice
  //   3. altro → pulisce pending, lascia fluire al routing standard
  if (pendingData.kind === "echo_wa_dryrun_info") {
    if (/(?:togli|toglil[oa]|disattiv|spegni|disabil)\s*(?:il\s+|la\s+)?(?:dry[\s\-]?run|test|modal)|abilit\w+\s+(?:invii|wa|whatsapp|reali)|manda(?:lo)?\s+(?:davvero|comunque|reale|in\s+production|sul\s+serio)|metti(?:lo)?\s+(?:live|in\s+produzione|reale)/i.test(t)) {
      try { await pendingDoc.ref.delete(); } catch {}
      return {
        content: "Per togliere il dry-run devi cambiarlo a mano in console Firebase: vai su https://console.firebase.google.com/project/garbymobile-f89ac/firestore/data/cosmina_config/echo_config , clicca il campo dry_run e cambia il valore da true a false. Da quel momento i WA partono per davvero (server Waha su Hetzner 178.104.88.86 è attivo). Suggerimento: testa prima con un destinatario interno come te stesso o Federico, poi passa ai clienti. È una modifica di sicurezza, non posso farla io in autonomia.",
        _echoPendingHandled: true,
      };
    }
    if (/^\s*(?:s[iì]|ok|d['’]?\s*accordo|va\s+bene|capito|grazie|perfetto|chiaro)\b/i.test(t)) {
      try { await pendingDoc.ref.delete(); } catch {}
      return {
        content: "Ok. Quando vuoi togliere il dry-run dimmelo (\"togli dry run\") e ti spiego dove cambiarlo.",
        _echoPendingHandled: true,
      };
    }
    // Altri messaggi: pulisco il pending e lascio fluire al routing standard
    // (l'utente sta facendo un'altra richiesta).
    try { await pendingDoc.ref.delete(); } catch {}
    return null;
  }

  let dest = "";
  let body = "";

  if (pendingData.kind === "echo_wa_testo") {
    // Ha dest, l'utente sta dando il testo
    dest = pendingData.partialDest || "";
    body = t;
  } else {
    // echo_wa_destinatario: parse "[Nome Cognome] [testo opzionale]"
    // Strategie:
    //   1. Se contiene ":" → split su ":" (dest:body)
    //   2. Else: prime 1-2 parole con iniziale maiuscola = dest, resto = body
    //      (fallback: prime 2 parole = dest, resto = body)
    const colonSplit = t.match(/^([^:]{2,80}?)\s*:\s*(.+)$/);
    if (colonSplit) {
      dest = colonSplit[1].trim();
      body = colonSplit[2].trim();
    } else {
      const tokens = t.split(/\s+/);
      // Heuristica per separare nome+cognome dal body:
      // - 1 token totale → tutto nome (manca body, lo chiedo dopo)
      // - 2 token → tutto nome (nome+cognome, body lo chiedo dopo)
      // - 3+ token → contiamo i token "nome-like": maiuscola iniziale
      //   o parola breve che può essere cognome minuscolo (es.
      //   "dellafiore"). Limite max 3 parole nome ("Maria Teresa
      //   Bianchi"). Resto = body.
      if (tokens.length <= 2) {
        dest = t.trim();
        body = "";
      } else {
        // 3+ parole: i primi 2 token sono SEMPRE nome (nome+cognome
        // di default). Il 3° è nome solo se maiuscolo (es. "Maria
        // Teresa Bianchi"); altrimenti è inizio del body.
        let nameTokens = 2;
        if (tokens[2] && /^[A-ZÀ-Ý][\w'À-ÿ\-]*$/.test(tokens[2])) {
          nameTokens = 3;
        }
        dest = tokens.slice(0, nameTokens).join(" ").trim();
        body = tokens.slice(nameTokens).join(" ").trim();
      }
    }
    // Se aveva già un partialBody dal turno precedente, concatena
    if (!body && pendingData.partialBody) body = pendingData.partialBody;
  }

  if (!dest) {
    return {
      content: "Non ho capito il destinatario. Dimmi nome e cognome (es. \"Andrea Malvicino\") seguito dal testo.",
      _echoPendingHandled: true,
    };
  }

  // Body opzionale al primo round se kind=echo_wa_destinatario:
  // se manca, salva pending kind=echo_wa_testo e chiedi solo il testo
  if (!body) {
    try {
      await db.collection("nexo_echo_pending").doc(sessionId).set({
        kind: "echo_wa_testo",
        have: { dest: true, body: false },
        partialDest: dest,
        sessionId,
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch {}
    return {
      content: `Cosa scrivo a ${dest}?`,
      _echoPendingHandled: true,
    };
  }

  // Pulisci pending e procedi all'invio
  try { await pendingDoc.ref.delete(); } catch {}
  const result = await handleEchoWhatsApp({ to: dest, body }, { userMessage: t, sessionId });
  return { ...result, _echoPendingHandled: true };
}

// Mappa userId (email Firebase Auth o uid) al nome interno rubrica.
// Usato dai pattern self-recipient ("mandami / mandamela / scrivimi").
// Cerca in cosmina_contatti_interni per email matching, fallback su
// "Alberto Contardi" (owner storico del sistema).
async function _resolveSelfFromUserId(userId) {
  const fallback = "Alberto Contardi";
  if (!userId) return fallback;
  const email = String(userId).toLowerCase().trim();
  if (!email.includes("@")) return fallback;
  try {
    const snap = await getCosminaDb().collection("cosmina_contatti_interni").limit(500).get();
    let match = null;
    snap.forEach(doc => {
      if (match) return;
      const d = doc.data() || {};
      const emails = [d.email, d.email_personale, d.email_lavoro]
        .filter(Boolean).map(e => String(e).toLowerCase().trim());
      if (emails.includes(email) && d.nome) match = d.nome;
    });
    return match || fallback;
  } catch (e) {
    logger.warn("self-resolve failed", { error: String(e).slice(0, 100) });
    return fallback;
  }
}

// ─── Contextual send ───────────────────────────────────────────
// Risolve compound intent "manda(lo|li|melo) [via wa] [a X]" che
// dipende dalla risposta precedente di NEXUS (es. lista interventi
// query da ARES). Strategia:
//   1. Match regex pattern referenziale
//   2. Recupera ultimo messaggio assistant della sessione con
//      direct.data.items[] o content "ricco" (>= 100 char)
//   3. Estrae dest dal messaggio attuale: "a X" → X; "mandami" → utente
//   4. Formatta items in testo WA conciso (max 1500 char)
//   5. Chiama handleEchoWhatsApp({ to: dest, body: testo })

// Pattern dest esplicito: "manda[lo|li|...] [qualsiasi parole intermedie]
// (a|ad|al|alla|per) X". L'ultima clausola "a X" è il dest.
// Cattura dest come max 3 parole inizianti con lettera (no stop-word
// italiane), così "manda ad alberto anche i dettagli" → dest "alberto"
// e non "alberto anche i dettagli degli interventi".
// Esempi che devono matchare:
//   "mandali via wa ad alberto"
//   "manda la lista di interventi ad alberto"
//   "mandalo a Federico"
//   "manda il riepilogo a Lorenzo"
//   "manda questo a Marco Piparo"
//   "manda a Maria Teresa Bianchi"
// NON deve catturare frasi continuanti dopo il nome:
//   "manda ad alberto anche i dettagli" → dest = "alberto"
const CONTEXTUAL_SEND_RE = /^\s*(?:e\s+)?manda(?:lo|li|le|melo|tela|telo|teli|cele)?\s+(?:.{1,120}?\s+)?(?:a(?:l|lla|llo|d)?|per)\s+([A-Za-zÀ-ÿ][\w'À-ÿ\-]{0,40}(?:\s+[A-Za-zÀ-ÿ][\w'À-ÿ\-]{0,40}){0,2})\b/i;
// Stop-word italiane che NON sono parte del nome destinatario. Se
// compaiono nel match, taglia dest prima della stop-word.
const DEST_STOP_WORDS = new Set([
  "anche", "pure", "poi", "dopo", "subito", "ora", "ora,",
  "il", "lo", "la", "i", "gli", "le", "un", "una", "uno",
  "del", "dello", "della", "dei", "degli", "delle",
  "con", "per", "fra", "tra", "su", "in", "da", "di", "a", "ad",
  "e", "o", "ma", "ed", "od",
  "che", "questo", "questi", "queste", "questa",
  "interventi", "intervento", "lista", "messaggio", "testo", "dettagli",
  "appuntamento", "appuntamenti", "wa", "whatsapp", "via", "tramite",
]);

// Tronca il match dest alla prima stop-word, ritornando solo il nome reale.
function _trimDestStopWords(raw) {
  if (!raw) return "";
  const tokens = String(raw).trim().split(/\s+/);
  const clean = [];
  for (const tok of tokens) {
    if (DEST_STOP_WORDS.has(tok.toLowerCase())) break;
    clean.push(tok);
    if (clean.length >= 3) break; // max 3 parole nome
  }
  return clean.join(" ").trim();
}
// Pattern self: "mandami / mandamela / mandamelo [qualsiasi cosa]"
//   "mandami questo via wa"
//   "mandami la lista"
//   "mandamela"
//   "scrivimi il riepilogo"
const CONTEXTUAL_SEND_SELF_RE = /^\s*(?:e\s+)?(?:manda|scriv|mand|invi)(?:amela|amelo|ameli|amele|ami|imi|amelo|imelo|imela|imeli|imele)\s*.*$/i;

// Converte un valore "due" eterogeneo in Date. Gestisce:
// - ISO string ("2026-05-01T07:00:00.000Z")
// - Firestore Timestamp serialized ({_seconds, _nanoseconds})
// - millisecondi
// - Date già istanziato
function _parseDueToDate(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === "string") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === "number") return new Date(v);
  if (typeof v === "object") {
    if (typeof v._seconds === "number") return new Date(v._seconds * 1000);
    if (typeof v.seconds === "number") return new Date(v.seconds * 1000);
    if (typeof v.toDate === "function") return v.toDate();
  }
  return null;
}

// Formatta una risposta ARES con items in testo WA conciso
function _formatItemsForWhatsApp(items, maxLen = 1500) {
  if (!Array.isArray(items) || !items.length) return null;
  const lines = items.slice(0, 25).map((it, i) => {
    const dt = _parseDueToDate(it.due);
    const data = dt
      ? dt.toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit" })
      : (it.data || "");
    // condominio (usato da ARES interventi_aperti) ha già il formato pieno;
    // altrimenti fallback su boardName/name. Strip "VIA ..." per compattezza WA.
    const fullName = it.condominio || it.boardName || it.name || "";
    const board = fullName.replace(/\s*-\s*VIA.*$/i, "").trim().slice(0, 60);
    // Tecnico: techPrimary > techNames > techName > tecnico
    let tec = "";
    if (it.techPrimary) tec = it.techPrimary;
    else if (Array.isArray(it.techNames) && it.techNames.length) tec = it.techNames.join("+");
    else if (it.techName) tec = it.techName;
    else if (it.tecnico) tec = it.tecnico;
    const bits = [data, board, tec ? `(${tec})` : ""].filter(Boolean);
    return `${i + 1}. ${bits.join(" — ")}`;
  });
  let txt = lines.join("\n");
  if (txt.length > maxLen) txt = txt.slice(0, maxLen - 12) + "\n... [+altri]";
  return txt;
}

export async function tryInterceptEchoContextualSend({ userMessage, sessionId, userId }) {
  if (!sessionId) return null;
  const t = String(userMessage || "").trim();
  if (!t) return null;

  // Match: o pattern dest esplicito "manda...a X", o pattern self "mandami..."
  let dest = null;
  let isSelf = false;
  const mDest = CONTEXTUAL_SEND_RE.exec(t);
  const mSelf = CONTEXTUAL_SEND_SELF_RE.exec(t);
  if (mDest) {
    dest = _trimDestStopWords(mDest[1]);
    // Filtra dest che sono parole comuni o stop-word ("tutti", "lista", ecc.)
    // o vuoti dopo il trim.
    if (!dest || /^(tutti|tutte|tutto|cose|lista|elenco|loro)$/i.test(dest)) return null;
  } else if (mSelf) {
    isSelf = true;
  } else {
    return null;
  }

  // Recupera ultimo messaggio assistant con contenuto ricco
  let context = null;
  try {
    const snap = await db.collection("nexus_chat")
      .where("sessionId", "==", sessionId)
      .limit(50).get();
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    docs.sort((a, b) => {
      const ta = (a.createdAt && (a.createdAt._seconds ?? a.createdAt.seconds)) || 0;
      const tb = (b.createdAt && (b.createdAt._seconds ?? b.createdAt.seconds)) || 0;
      return tb - ta;
    });
    for (const d of docs) {
      if (d.role !== "assistant") continue;
      // Skippa il messaggio "🧠 Claude sta pensando..." e simili placeholder
      if (/Claude sta pensando|sto verificando/i.test(d.content || "")) continue;
      const items = d.direct?.data?.items;
      if (Array.isArray(items) && items.length) {
        context = { kind: "items", items, originalContent: d.content };
        break;
      }
      if (d.content && d.content.length >= 80) {
        context = { kind: "text", text: d.content, originalContent: d.content };
        break;
      }
    }
  } catch (e) {
    logger.warn("contextual send: chat lookup failed", { error: String(e).slice(0, 120) });
  }

  if (!context) {
    return {
      content: "Non trovo niente da inoltrare. Fai prima la query (es. \"interventi di Marco domani\") e poi dimmi \"mandalo a X\".",
      _echoPendingHandled: true,
    };
  }

  // Costruisci body
  let body = "";
  if (context.kind === "items") {
    body = _formatItemsForWhatsApp(context.items);
  }
  if (!body) {
    // Fallback: usa il content originale (testo già formattato)
    body = String(context.originalContent || "").trim().slice(0, 1500);
  }
  if (!body) {
    return {
      content: "Non sono riuscito a estrarre il testo da inoltrare.",
      _echoPendingHandled: true,
    };
  }

  // Risolvi dest: self → mappa email/userId al nome rubrica
  if (isSelf) {
    dest = await _resolveSelfFromUserId(userId);
  }

  // CRITICO: passa sessionId nei parametri così isEchoDryRun riconosce
  // forge-test-* e applica DRY_RUN automatico anche per le chiamate
  // intercept (altrimenti il flag forge non si propaga).
  const result = await handleEchoWhatsApp(
    { to: dest, body, sessionId },
    { userMessage: t, sessionId }
  );
  return { ...result, _echoPendingHandled: true, _contextualSend: true };
}

// ─── Repeat last ───────────────────────────────────────────────
// "mandalo ancora / di nuovo / nuovamente / un'altra volta / rimandalo"
// → ripete l'ultimo invio WhatsApp riuscito della sessione (stesso
// destinatario, stesso body). Cerca echo_messages where sessionId e
// status:sent, prende il più recente.

const REPEAT_LAST_RE = new RegExp(
  // Forma 1: verbo + suffisso "ancora/di nuovo/nuovamente/un'altra volta"
  "^\\s*(?:e\\s+)?(?:" +
    "(?:manda(?:lo|li|melo|cele)?|invia(?:lo|li)?|spedisci(?:lo|li)?|rimanda(?:lo|li)?)\\s+" +
    "(?:di\\s+nuovo|ancora(?:\\s+una\\s+volta|\\s+uno)?|nuovamente|un['’]?altra\\s+volta|un['’]?altra)" +
  // Forma 2: "rimandalo" / "mandane un altro" come comando standalone
    "|rimanda(?:lo|li)?" +
    "|manda(?:ne|n[oae])\\s+un[oa]?(?:\\s+altr[oa])?" +
    "|ripeti(?:\\s+l['’]?invio|\\s+il\\s+messaggio)?" +
  ")\\s*[.!?]?\\s*$",
  "i"
);

export async function tryInterceptEchoRepeatLast({ userMessage, sessionId }) {
  if (!sessionId) return null;
  const t = String(userMessage || "").trim();
  if (!t) return null;
  if (!REPEAT_LAST_RE.test(t)) return null;

  let last = null;
  try {
    const snap = await db.collection("echo_messages")
      .where("sessionId", "==", sessionId)
      .limit(20).get();
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Prendi il più recente con status:sent (o skipped per FORGE)
    docs.sort((a, b) => {
      const ta = (a._serverTime && a._serverTime._seconds) || 0;
      const tb = (b._serverTime && b._serverTime._seconds) || 0;
      return tb - ta;
    });
    last = docs.find(d => d.status === "sent" || d.status === "skipped") || null;
  } catch (e) {
    logger.warn("echo repeat-last lookup failed", { error: String(e).slice(0, 120) });
  }

  if (!last || !last.body) {
    return {
      content: "Non trovo un messaggio recente da rinviare. Dimmi a chi e cosa.",
      _echoPendingHandled: true,
    };
  }

  // Re-invia: usa il displayName risolto se presente, altrimenti il chatId.
  // Passiamo dest = displayName così handleEchoWhatsApp lo cerca di nuovo
  // in rubrica e non si affida al chatId raw (più safe).
  const dest = last.destDisplayName || last.to || "";
  if (!dest) {
    return {
      content: "L'ultimo invio non aveva un destinatario tracciato. Dimmi a chi mandare.",
      _echoPendingHandled: true,
    };
  }
  const result = await handleEchoWhatsApp(
    { to: dest, body: last.body, sessionId },
    { userMessage: t, sessionId }
  );
  return { ...result, _echoPendingHandled: true, _repeatLast: true };
}



