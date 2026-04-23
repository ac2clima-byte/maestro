// handlers/iris.js — handler email (IRIS).
import {
  fetchIrisEmails, emailLine, isToday, fmtDataOra,
  CATEGORIE_URGENTI_SET,
  ANTHROPIC_API_KEY, ANTHROPIC_URL, MODEL,
  db, FieldValue, logger,
} from "./shared.js";

export async function handleContaEmailUrgenti() {
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

export async function handleEmailOggi() {
  const emails = await fetchIrisEmails(300);
  const oggi = emails.filter(e => isToday(e.received_time));
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

export async function handleEmailTotali() {
  const emails = await fetchIrisEmails(500);
  return {
    content: `In totale ho indicizzato **${emails.length} email** (ultime 500 mostrate). La più recente è di ${fmtDataOra(emails[0]?.received_time)}.`,
    data: { count: emails.length },
  };
}

export async function handleRicercaEmailMittente(parametri) {
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

export async function handleEmailSenzaRisposta() {
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

export async function handleEmailPerCategoria(parametri) {
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

// Stato Lavagna (domain "nexo" ma letto dall'IRIS dashboard)
export async function handleStatoLavagna() {
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

// ─── Archivia email in cartella per mittente ───────────────────
//
// Pattern "coda EWS": la Cloud Function non parla direttamente con Exchange
// (server on-premise non raggiungibile da GCP). Salva una richiesta in
// iris_archive_queue, lo script su Hetzner la preleva ed esegue lo spostamento
// via exchangelib.
//
// Aggiorna subito iris_emails.status = "archived" ottimisticamente; in caso
// di failure EWS, il poller Hetzner imposterà status = "failed" + error.
//
// Generazione nome cartella: "Cognome Nome" (stile italiano).

export function derivaFolderName(senderName, senderEmail) {
  const name = String(senderName || "").trim();
  const email = String(senderEmail || "").trim().toLowerCase();

  // Se abbiamo un nome che sembra "Nome Cognome" o "Nome Cognome - Company"
  if (name) {
    // Rimuovi parte dopo " - " (azienda)
    const cleaned = name.split(/\s+[-–]\s+/)[0].trim();
    // Rimuovi caratteri strani e spezza in parole
    const parts = cleaned.replace(/[^\p{L}\s'.-]/gu, "").split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      // Assume Nome Cognome → restituisci "Cognome Nome"
      const cognome = parts[parts.length - 1];
      const nome = parts[0];
      if (cognome.length >= 2 && nome.length >= 2) {
        return `${capitalize(cognome)} ${capitalize(nome)}`;
      }
    } else if (parts.length === 1 && parts[0].length >= 3) {
      return capitalize(parts[0]);
    }
  }

  // Fallback: dominio email (es. "gruppo3i.it")
  if (email.includes("@")) {
    const domain = email.split("@")[1] || "";
    if (domain) return domain.toLowerCase();
  }
  return "Sconosciuto";
}

function capitalize(s) {
  return String(s || "")
    .split(/['-]/)
    .map(p => p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : p)
    .join(s.includes("'") ? "'" : "-")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Endpoint: archivia un'email.
 * Input: { emailId } (obbligatorio). Legge sender/messageId da iris_emails.
 * Output: { ok, queueId, folder, emailId }
 */
export async function handleIrisArchiveEmail(parametri) {
  const emailId = String(parametri.emailId || "").trim();
  if (!emailId) return { ok: false, error: "missing_emailId" };

  const docRef = db.collection("iris_emails").doc(emailId);
  const snap = await docRef.get();
  if (!snap.exists) return { ok: false, error: "email_not_found" };

  const d = snap.data() || {};
  const raw = d.raw || {};
  const messageId = raw.message_id || raw.ews_item_id || null;
  const folder = derivaFolderName(raw.sender_name, raw.sender);

  // Scrivi in coda
  const queueRef = db.collection("iris_archive_queue").doc();
  await queueRef.set({
    id: queueRef.id,
    emailId,
    messageId,
    ewsItemId: raw.ews_item_id || null,
    sender: raw.sender || "",
    senderName: raw.sender_name || "",
    subject: raw.subject || "",
    folder,
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Update ottimistico su iris_emails
  await docRef.set({
    status: "archived",
    archiviata_il: FieldValue.serverTimestamp(),
    cartella: folder,
    archiveQueueId: queueRef.id,
  }, { merge: true });

  return { ok: true, queueId: queueRef.id, folder, emailId };
}

// ─── "analizza l'ultima mail di X" — intent recognition interattivo ─
//
// Se l'email ha già intent+dati_estratti → mostra formattato.
// Altrimenti → chiama Haiku con prompt v2 e salva il risultato.
// Il messaggio di risposta include un prompt di conferma: "È corretto?".
// La conferma viene gestita in nexus.js (handleConfermaPatternTraining).

const CLASSIFY_SYSTEM_V2 = `Sei IRIS, classificatore email di ACG Clima Service.
Leggi l'INTERO thread (email quotate sotto) e rispondi SOLO con JSON valido:
{
  "category": "...",
  "summary": "<1-3 righe>",
  "entities": {...},
  "suggestedAction": "...",
  "confidence": "high|medium|low",
  "sentiment": "...",
  "intent": "preparare_preventivo|registrare_fattura|aprire_intervento_urgente|aprire_intervento_ordinario|rispondere_a_richiesta|registrare_incasso|gestire_pec|sollecitare_pagamento|archiviare|nessuna_azione",
  "dati_estratti": {
    "persone": [{"nome":"","ruolo":"","azienda":""}],
    "aziende": [{"nome":"","piva":"","indirizzo":""}],
    "condomini": [""],
    "importi": [{"valore":"","causale":""}],
    "date": [{"valore":"","tipo":""}],
    "riferimenti_documenti": [""]
  },
  "contesto_thread": "<1-3 frasi: chi ha iniziato, cosa si è detto, cosa dice l'ultima email>",
  "prossimo_passo": "<1-2 frasi: azione operativa concreta>"
}
Ometti campi che non puoi estrarre — non inventare. SOLO JSON.`;

async function classifyEmailV2(apiKey, email) {
  const payload = {
    model: MODEL,
    max_tokens: 1500,
    system: CLASSIFY_SYSTEM_V2,
    messages: [{
      role: "user",
      content: [
        `Da: ${email.senderName || email.sender_name || ""} <${email.sender || ""}>`,
        `Oggetto: ${email.subject || ""}`,
        `Ricevuta: ${email.received_time || ""}`,
        ``,
        `Corpo (thread completo — email quotate in fondo):`,
        String(email.body_text || "").slice(0, 8000),
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
    throw new Error(`Anthropic ${resp.status}: ${t.slice(0, 300)}`);
  }
  const json = await resp.json();
  const text = (json.content || []).filter(b => b.type === "text").map(b => b.text).join("\n").trim();
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s < 0 || e <= s) return null;
  try { return JSON.parse(text.slice(s, e + 1)); } catch { return null; }
}

function formatAnalyzedEmail(email, cls) {
  const lines = [];
  lines.push(`📧 **Email analizzata** — ${email.senderName || email.sender || "?"}`);
  lines.push(`_Oggetto: ${email.subject || "(vuoto)"} · Ricevuta: ${fmtDataOra(email.received_time)}_`);
  lines.push("");
  lines.push(`**Categoria**: ${cls.category || "?"}`);
  lines.push(`**Intent**: \`${cls.intent || "?"}\``);
  if (cls.confidence) lines.push(`**Confidenza**: ${cls.confidence}`);
  lines.push("");
  lines.push(`**Contesto thread**: ${cls.contesto_thread || "—"}`);
  lines.push("");
  lines.push(`**Prossimo passo proposto**: ${cls.prossimo_passo || "—"}`);

  const de = cls.dati_estratti || {};
  if (Array.isArray(de.persone) && de.persone.length) {
    lines.push("");
    lines.push(`**Persone**: ${de.persone.map(p => p.nome + (p.azienda ? ` (${p.azienda})` : "")).filter(Boolean).join(", ")}`);
  }
  if (Array.isArray(de.aziende) && de.aziende.length) {
    lines.push(`**Aziende**: ${de.aziende.map(a => a.nome + (a.piva ? ` [P.IVA ${a.piva}]` : "")).filter(Boolean).join(", ")}`);
  }
  if (Array.isArray(de.condomini) && de.condomini.length) {
    lines.push(`**Condomini**: ${de.condomini.filter(Boolean).join(", ")}`);
  }
  if (Array.isArray(de.importi) && de.importi.length) {
    lines.push(`**Importi**: ${de.importi.map(i => `€${i.valore}${i.causale ? ` (${i.causale})` : ""}`).join(", ")}`);
  }
  if (Array.isArray(de.riferimenti_documenti) && de.riferimenti_documenti.length) {
    lines.push(`**Riferimenti**: ${de.riferimenti_documenti.filter(Boolean).join(", ")}`);
  }
  lines.push("");
  lines.push(`❓ **È corretto?** Rispondi "sì", "sì ma [modifica]", oppure "no, l'intent è [altro]".`);
  return lines.join("\n");
}

/**
 * Analizza un'email su richiesta dell'utente in NEXUS Chat.
 * Uso: "analizza l'ultima mail di Torriglia" / "analizza questa email".
 *
 * Se parametri.emailId è presente → usa quella.
 * Altrimenti cerca per mittente (parametri.mittente) tra le ultime 400.
 *
 * Flow:
 *  1. Se l'email ha già cls.intent e cls.dati_estratti → mostra + chiede conferma.
 *  2. Altrimenti chiama Haiku con prompt v2, salva in iris_emails.classification,
 *     poi mostra + chiede conferma.
 *  3. Ritorna data.pendingPattern con proposta di pattern (usata da nexus per
 *     gestire "sì"/"no" nel turno successivo).
 */
export async function handleIrisAnalizzaEmail(parametri, ctx) {
  const emailIdParam = String(parametri.emailId || parametri.id || "").trim();
  const mittente = String(parametri.mittente || parametri.sender || parametri.nome || "").trim().toLowerCase();
  const userMessage = String(ctx?.userMessage || "").toLowerCase();

  // Risolvi email
  const emails = await fetchIrisEmails(400);
  if (!emails.length) return { content: "Non ho email indicizzate al momento." };

  let email = null;
  if (emailIdParam) {
    email = emails.find(e => e.id === emailIdParam) || null;
  }
  if (!email && mittente) {
    email = emails.find(e => `${e.sender} ${e.senderName}`.toLowerCase().includes(mittente)) || null;
  }
  // "analizza l'ultima mail di X" — estrai X dal messaggio
  if (!email && /analizz/.test(userMessage)) {
    const m = /analizz\w*\s+(?:l['a]?\s+)?(?:ultim[ao]\s+)?(?:mail|email|messaggio)(?:\s+di|\s+da)?\s+([a-zà-ÿ][\wà-ÿ.\s'-]{2,60})/i.exec(userMessage);
    if (m) {
      const q = m[1].trim().toLowerCase();
      email = emails.find(e => `${e.sender} ${e.senderName}`.toLowerCase().includes(q)) || null;
    }
  }
  // Fallback: "analizza questa email" senza nome → la più recente
  if (!email && /questa|ultima/.test(userMessage)) {
    email = emails[0];
  }
  if (!email) {
    return { content: "Dimmi di chi è l'email da analizzare. Es: 'analizza l'ultima mail di Torriglia'." };
  }

  // Se ha già l'intent recognition avanzato → usa
  if (email.intent && email.dati_estratti && email.prossimo_passo) {
    const cls = {
      category: email.category,
      intent: email.intent,
      confidence: email.confidence || "medium",
      dati_estratti: email.dati_estratti,
      contesto_thread: email.contesto_thread,
      prossimo_passo: email.prossimo_passo,
    };
    return {
      content: formatAnalyzedEmail(email, cls),
      data: {
        emailId: email.id,
        pendingPattern: {
          kind: "conferma_analisi",
          emailId: email.id,
          intent: cls.intent,
          contesto_thread: cls.contesto_thread,
          prossimo_passo: cls.prossimo_passo,
          dati_estratti: cls.dati_estratti,
        },
        cached: true,
      },
    };
  }

  // Altrimenti chiama Haiku con prompt v2
  const apiKey = ANTHROPIC_API_KEY.value();
  if (!apiKey) return { content: "Non posso analizzare: ANTHROPIC_API_KEY mancante." };

  let cls;
  try {
    cls = await classifyEmailV2(apiKey, email);
  } catch (e) {
    logger.warn("handleIrisAnalizzaEmail: Haiku failed", { error: String(e).slice(0, 200) });
    return { content: `Errore chiamata Haiku: ${String(e).slice(0, 150)}` };
  }
  if (!cls) return { content: "Non sono riuscito a parsare la risposta del modello. Riprova." };

  // Salva arricchimento nel doc iris_emails
  try {
    await db.collection("iris_emails").doc(email.id).set({
      classification: {
        ...(email.classification || {}),
        category: cls.category || email.category,
        summary: cls.summary || email.summary,
        sentiment: cls.sentiment || email.sentiment,
        suggestedAction: cls.suggestedAction || email.suggestedAction,
        confidence: cls.confidence || "medium",
        intent: cls.intent,
        dati_estratti: cls.dati_estratti || {},
        contesto_thread: cls.contesto_thread || "",
        prossimo_passo: cls.prossimo_passo || "",
      },
      intentEnrichedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch (e) {
    logger.warn("handleIrisAnalizzaEmail: firestore write failed", { error: String(e).slice(0, 200) });
  }

  return {
    content: formatAnalyzedEmail(email, cls),
    data: {
      emailId: email.id,
      pendingPattern: {
        kind: "conferma_analisi",
        emailId: email.id,
        intent: cls.intent,
        contesto_thread: cls.contesto_thread,
        prossimo_passo: cls.prossimo_passo,
        dati_estratti: cls.dati_estratti,
      },
      cached: false,
    },
  };
}
