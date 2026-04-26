// handlers/iris.js — handler email (IRIS).
import {
  fetchIrisEmails, emailLine, isToday, fmtDataOra,
  CATEGORIE_URGENTI_SET,
  ANTHROPIC_API_KEY, ANTHROPIC_URL, MODEL,
  db, FieldValue, logger,
} from "./shared.js";

// ─── Conversational email presentation ───────────────────────
// Invece di liste tecniche, genera una frase naturale "Hai 3 email, la prima è..."
// con un pendingEmails nel context per i follow-up "sì/prossima/basta".
function conversationalPresent(emails, contestoLabel = "email") {
  if (!emails.length) return null;
  const first = emails[0];
  const who = first.senderName || (first.sender || "?").split("@")[0];
  const what = first.summary || first.subject || "";
  const intro = emails.length === 1
    ? `Hai 1 ${contestoLabel} nuova.`
    : `Hai ${emails.length} ${contestoLabel}.`;
  const firstLine = `La prima è da ${who}${what ? `, riguarda ${what.toLowerCase().replace(/\.$/, "")}` : ""}.`;
  return {
    content: `${intro} ${firstLine} Vuoi che te la legga?`,
    data: {
      pendingEmails: {
        kind: "email_queue",
        contestoLabel,
        emails: emails.map(e => ({
          id: e.id,
          from: e.senderName || e.sender,
          subject: e.subject,
          summary: e.summary,
          body: (e.body_text || "").slice(0, 1500),
          received: e.received_time,
          category: e.category,
          intent: e.intent,
          contesto_thread: e.contesto_thread,
          prossimo_passo: e.prossimo_passo,
        })).slice(0, 10),
        cursor: 0,
      },
    },
  };
}

export async function handleContaEmailUrgenti() {
  const emails = await fetchIrisEmails(500);
  const urgenti = emails.filter(e => CATEGORIE_URGENTI_SET.has(e.category));
  if (!urgenti.length) return { content: "Non c'è niente di urgente in questo momento, tutto sotto controllo." };
  const conv = conversationalPresent(urgenti, "email urgente");
  return conv;
}

export async function handleEmailOggi() {
  const emails = await fetchIrisEmails(300);
  const oggi = emails.filter(e => isToday(e.received_time));
  if (!oggi.length) return { content: "Oggi ancora niente di nuovo, la casella è tranquilla." };
  // Presentazione conversazionale: parte dalla più rilevante (urgenti prima)
  const sorted = [...oggi].sort((a, b) => {
    const wa = CATEGORIE_URGENTI_SET.has(a.category) ? 2 : (a.intent && a.intent !== "nessuna_azione" ? 1 : 0);
    const wb = CATEGORIE_URGENTI_SET.has(b.category) ? 2 : (b.intent && b.intent !== "nessuna_azione" ? 1 : 0);
    if (wa !== wb) return wb - wa;
    return (b.received_time || "").localeCompare(a.received_time || "");
  });
  return conversationalPresent(sorted, "email di oggi");
}

export async function handleEmailTotali() {
  const emails = await fetchIrisEmails(500);
  const ultimo = emails[0]?.received_time;
  const quando = ultimo ? fmtDataOra(ultimo) : "non saprei";
  return {
    content: `Ne ho indicizzate ${emails.length}, l'ultima è arrivata il ${quando}.`,
    data: { count: emails.length },
  };
}

export async function handleRicercaEmailMittente(parametri) {
  const query = String(
    parametri.mittente || parametri.sender || parametri.nome || parametri.from || "",
  ).trim().toLowerCase();
  if (!query) {
    return { content: "Di chi? Dimmi un nome." };
  }
  const emails = await fetchIrisEmails(400);
  const match = emails.filter(e => {
    const bag = `${e.sender} ${e.senderName}`.toLowerCase();
    return bag.includes(query);
  });
  if (!match.length) {
    return { content: `Non trovo email da ${query} nelle ultime 400.` };
  }
  // Riutilizzo la presentazione conversazionale
  const conv = conversationalPresent(match, `email da ${query}`);
  return conv || { content: `Ne ho ${match.length} da ${query}.`, data: { count: match.length, query } };
}

export async function handleEmailSenzaRisposta() {
  const emails = await fetchIrisEmails(500);
  const att = emails.filter(e => e.followup && e.followup.needsAttention);
  if (!att.length) return { content: "Tutte gestite, niente in attesa da più di 48 ore." };
  const primo = att[0];
  const chi = primo.senderName || primo.sender || "qualcuno";
  const giorni = primo.followup?.daysWithoutReply || 0;
  if (att.length === 1) {
    return {
      content: `Una è in attesa da ${giorni} giorni: ${chi}. Vuoi che te la legga?`,
      data: { count: 1 },
    };
  }
  return {
    content: `Ne hai ${att.length} senza risposta da più di due giorni. La più vecchia è di ${chi}, ${giorni} giorni. Vuoi partire da quella?`,
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
    const conv = conversationalPresent(match, `email ${wanted.toLowerCase().replace(/_/g, " ")}`);
    return conv || { content: `Ne ho ${match.length} di categoria ${wanted}.`, data: { count: match.length } };
  }
  // Panoramica per categoria — 3 più popolate
  const top = Object.entries(groups).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const frasi = top.map(([k, v]) => `${v} ${k.toLowerCase().replace(/_/g, " ")}`).join(", ");
  return {
    content: `Sulle ultime ${emails.length}: ${frasi}.`,
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
  if (!rows.length) return { content: "Niente sulla Lavagna al momento." };
  const pending = rows.filter(r => r.status === "pending" || r.status === "in_progress").length;
  const urgenti = rows.filter(r => r.priority === "high").length;
  const parts = [];
  if (urgenti) {
    parts.push(`Sulla Lavagna ci sono ${rows.length} messaggi, ${pending} in lavorazione di cui ${urgenti} urgenti.`);
  } else {
    parts.push(`Sulla Lavagna ci sono ${rows.length} messaggi recenti${pending ? `, ${pending} in lavorazione` : ""}.`);
  }
  return { content: parts.join(" "), data: { count: rows.length, pending, urgenti } };
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

// ─── Elimina email (soft-delete) ─────────────────────────────────
// Soft-delete: NON cancella il doc da iris_emails, lo marca status="deleted"
// così la PWA può filtrarlo via e Hetzner può eventualmente consumare la
// coda iris_delete_queue per spostare in EWS Deleted Items.
// L'email resta in Firestore per audit + possibile undo.
export async function handleIrisDeleteEmail(parametri) {
  const emailId = String(parametri.emailId || "").trim();
  if (!emailId) return { ok: false, error: "missing_emailId" };

  const docRef = db.collection("iris_emails").doc(emailId);
  const snap = await docRef.get();
  if (!snap.exists) return { ok: false, error: "email_not_found" };

  const d = snap.data() || {};
  const raw = d.raw || {};
  const messageId = raw.message_id || raw.ews_item_id || null;

  // Coda per il consumer Hetzner (se/quando attivato): pattern identico a archive_queue.
  const queueRef = db.collection("iris_delete_queue").doc();
  await queueRef.set({
    id: queueRef.id,
    emailId,
    messageId,
    ewsItemId: raw.ews_item_id || null,
    sender: raw.sender || "",
    senderName: raw.sender_name || "",
    subject: raw.subject || "",
    mode: "soft",                 // EWS soft_delete = sposta in Deleted Items (recoverable)
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Update ottimistico su iris_emails: soft-delete, doc preservato.
  await docRef.set({
    status: "deleted",
    eliminata_il: FieldValue.serverTimestamp(),
    deleteQueueId: queueRef.id,
  }, { merge: true });

  return { ok: true, queueId: queueRef.id, emailId };
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

// Primo nome (per indicare chi ha scritto in modo naturale)
function firstName(full) {
  const parts = String(full || "").trim().split(/\s+/);
  return parts[0] || "";
}

// Riscrive l'intent in frase umana
function intentNaturale(intent) {
  const map = {
    preparare_preventivo: "preparare un preventivo",
    registrare_fattura: "registrare la fattura",
    aprire_intervento_urgente: "aprire un intervento urgente",
    aprire_intervento_ordinario: "aprire un intervento",
    rispondere_a_richiesta: "risponderti",
    registrare_incasso: "registrare l'incasso",
    gestire_pec: "gestire la PEC",
    sollecitare_pagamento: "mandare un sollecito",
    archiviare: "archiviarla",
    nessuna_azione: null,
  };
  return map[intent] || null;
}

function formatAnalyzedEmail(email, cls) {
  const who = firstName(email.senderName) || (email.sender || "").split("@")[0] || "qualcuno";
  const ctx = (cls.contesto_thread || "").trim();
  const prossimo = (cls.prossimo_passo || "").trim();
  const de = cls.dati_estratti || {};

  const parts = [];

  // Apertura: "Ho visto la mail di Torriglia. [contesto]"
  parts.push(`Ho visto la mail di ${who}.`);
  if (ctx) parts.push(ctx);

  // Dati estratti in frase: "Ti manda la P.IVA 02486680065 per 3i efficientamento, riferito a De Amicis."
  const dataBits = [];
  if (Array.isArray(de.aziende) && de.aziende.length) {
    const a = de.aziende[0];
    if (a.nome && a.piva) dataBits.push(`${a.nome} (P.IVA ${a.piva})`);
    else if (a.nome) dataBits.push(a.nome);
  }
  if (Array.isArray(de.condomini) && de.condomini.length) {
    dataBits.push(`condominio ${de.condomini[0]}`);
  }
  if (Array.isArray(de.importi) && de.importi.length) {
    const i = de.importi[0];
    dataBits.push(`€${i.valore}${i.causale ? ` per ${i.causale}` : ""}`);
  }
  // Non duplico le info se il contesto_thread le ha già citate
  const ctxLower = ctx.toLowerCase();
  const nuoviBits = dataBits.filter(b => !ctxLower.includes(b.toLowerCase().slice(0, 15)));
  if (nuoviBits.length) {
    parts.push(`Dati chiave: ${nuoviBits.join(", ")}.`);
  }

  // Proposta d'azione
  const azioneNat = intentNaturale(cls.intent);
  if (prossimo) {
    parts.push(`${prossimo.replace(/\.$/, "")}. Procedo?`);
  } else if (azioneNat) {
    parts.push(`Vuoi che provi a ${azioneNat}?`);
  } else {
    parts.push(`Ho capito bene?`);
  }

  return parts.join(" ");
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
