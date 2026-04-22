// handlers/nexus.js — router principale (Haiku intent parsing + DIRECT_HANDLERS dispatch).
import {
  db, FieldValue, logger,
  ANTHROPIC_API_KEY, ANTHROPIC_URL, MODEL,
} from "./shared.js";

// Import dei 10 Colleghi
import {
  handleContaEmailUrgenti, handleEmailOggi, handleEmailTotali,
  handleRicercaEmailMittente, handleEmailSenzaRisposta, handleEmailPerCategoria,
  handleStatoLavagna,
} from "./iris.js";
import { handleMemoDossier } from "./memo.js";
import { handleAresInterventiAperti, handleAresApriIntervento } from "./ares.js";
import { handleEchoWhatsApp } from "./echo.js";
import { handleCalliopeBozza } from "./calliope.js";
import {
  handleChartaRegistraIncasso, handleFattureScadute,
  handleChartaIncassiOggi, handleChartaReportMensile,
} from "./charta.js";
import {
  handlePharoStatoSuite, handlePharoProblemiAperti, handlePharoRtiMonitoring,
} from "./pharo.js";
import {
  handleDelphiKpi, handleDelphiConfrontoMoM, handleDelphiCostoAI,
} from "./delphi.js";
import { handleDikeaScadenzeCurit, handleDikeaImpiantiSenzaTarga } from "./dikea.js";
import { handleEmporionSottoScorta, handleEmporionDisponibilita } from "./emporion.js";
import {
  handleChronosSlotTecnico, handleChronosAgendaGiornaliera, handleChronosScadenze,
} from "./chronos.js";

// ─── NEXUS intent schema ───────────────────────────────────────
export const COLLEGHI_ROUTABLE = [
  "iris", "echo", "ares", "chronos", "memo",
  "charta", "emporion", "dikea", "delphi",
  "pharo", "calliope",
];
export const COLLEGHI_ATTIVI = new Set([]);
export const VALID_COLLEGHI = new Set([...COLLEGHI_ROUTABLE, "nessuno", "multi"]);

export const NEXUS_SYSTEM_PROMPT = `Sei NEXUS, l'interfaccia conversazionale di NEXO per ACG Clima Service (manutenzione HVAC, zona Alessandria/Voghera/Tortona).

L'utente ti parla in linguaggio naturale. Il tuo compito:
1. Capire cosa vuole.
2. Scegliere UN Collega competente.
3. Formulare azione + parametri per quel Collega.
4. Rispondere all'utente in italiano, 1-2 frasi.

COLLEGHI + AZIONI STANDARD (preferisci queste azioni quando possibile):
- iris       → email in arrivo
    azioni: cerca_email_urgenti, email_oggi, email_totali, email_senza_risposta,
            cerca_email_mittente, email_per_categoria
- echo       → uscita: sendWhatsApp, sendTelegram, sendEmail, sendPush
- ares       → interventi: interventi_aperti, apri_intervento, assegna_tecnico
- chronos    → pianificazione:
    azioni: scadenze_prossime, slot_tecnico, agenda_giornaliera
- memo       → dossier_cliente, storico_impianto
- charta     → amministrativo:
    azioni: fatture_scadute, incassi_oggi, report_mensile
- emporion   → magazzino:
    azioni: disponibilita (parametri: {codice, descrizione}), dov_si_trova
- dikea      → compliance:
    azioni: scadenze_curit, impianti_senza_targa, valida_dico
- delphi     → analisi:
    azioni: kpi_dashboard, costo_ai, margine_intervento
    IMPORTANTE: "come siamo andati" / "come va il mese" / "andamento" = kpi_dashboard
- pharo      → monitoring:
    azioni: stato_suite, problemi_aperti, controllo_heartbeat
    IMPORTANTE: "stato della suite" / "come sta il sistema" = stato_suite
- calliope   → content:
    azioni: bozza_risposta (parametri: {emailId, tono}), sollecito_pagamento
- nessuno    → saluti, chiarimenti

REGOLE:
- Rispondi SOLO con un oggetto JSON valido. Niente code fence, niente testo extra.
- Non inventare clienti, importi, condomini, date: chiedi chiarimento SOLO se ambiguo.
- Se la richiesta matcha un'azione standard sopra, USA ESATTAMENTE quella stringa.
- Azione in snake_case (es. "cerca_email_urgenti", "scadenze_curit").
- rispostaUtente: conversazionale, italiano, 1-2 frasi, MAI promettere "ti mostro" o "sto cercando" — il sistema risponde da solo, tu solo inoltri.

FORMATO OUTPUT:
{
  "collega": "<slug>",
  "azione": "<snake_case>",
  "parametri": { ... },
  "confidenza": 0.0-1.0,
  "rispostaUtente": "<1-2 frasi italiano>",
  "reasoning": "<1 frase debug>",
  "steps": [
    { "collega": "...", "azione": "...", "parametri": { ... } }
  ]
}`;

export function extractJSON(text) {
  if (!text) return null;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fenced ? fenced[1].trim() : text.trim();
  const s = candidate.indexOf("{");
  const e = candidate.lastIndexOf("}");
  if (s === -1 || e === -1 || e <= s) return null;
  return candidate.slice(s, e + 1);
}

export function fallbackIntent(rispostaUtente) {
  return {
    collega: "nessuno",
    azione: "chiarimento",
    parametri: {},
    confidenza: 0,
    rispostaUtente,
  };
}

export function parseAndValidateIntent(raw, userMessage) {
  const jsonStr = extractJSON(raw);
  if (!jsonStr) return fallbackIntent(`Non ho capito bene: "${userMessage}". Puoi riformulare?`);
  let obj;
  try { obj = JSON.parse(jsonStr); }
  catch { return fallbackIntent("Risposta dal modello non valida, riprova."); }

  const collegaRaw = String(obj.collega || "").toLowerCase().trim();
  const collega = VALID_COLLEGHI.has(collegaRaw) ? collegaRaw : "nessuno";
  const azione = String(obj.azione || "").trim() || "nessuna";
  const parametri = (obj.parametri && typeof obj.parametri === "object") ? obj.parametri : {};
  let confidenza = Number(obj.confidenza);
  if (!Number.isFinite(confidenza)) confidenza = 0;
  confidenza = Math.max(0, Math.min(1, confidenza));
  const rispostaUtente = String(obj.rispostaUtente || "").trim() || "Ho ricevuto, sto elaborando.";
  const reasoning = typeof obj.reasoning === "string" ? obj.reasoning : undefined;

  let steps;
  if (Array.isArray(obj.steps)) {
    steps = [];
    for (const s of obj.steps) {
      if (!s || typeof s !== "object") continue;
      const sColl = String(s.collega || "").toLowerCase();
      if (!COLLEGHI_ROUTABLE.includes(sColl)) continue;
      steps.push({
        collega: sColl,
        azione: String(s.azione || "nessuna"),
        parametri: (s.parametri && typeof s.parametri === "object") ? s.parametri : {},
      });
    }
    if (steps.length === 0) steps = undefined;
  }

  return { collega, azione, parametri, confidenza, rispostaUtente, reasoning, steps };
}

// ─── DIRECT_HANDLERS: mappa (collega, azione) → handler ─────────
export const DIRECT_HANDLERS = [
  { match: (col, az) => col === "iris" && /urgen/.test(az), fn: handleContaEmailUrgenti },
  { match: (col, az) => col === "iris" && /(oggi|today|di_oggi|ricevute_oggi)/.test(az), fn: handleEmailOggi },
  { match: (col, az) => col === "iris" && /(total|conta_email|count|quant(e|it))/.test(az) && !/urgen/.test(az), fn: handleEmailTotali },
  { match: (col, az) => col === "iris" && /(mittente|sender|cerca_email|ricerca|email_da|da_mittente)/.test(az), fn: handleRicercaEmailMittente },
  { match: (col, az) => col === "iris" && /(senza_risposta|no_reply|attesa|followup|follow_up)/.test(az), fn: handleEmailSenzaRisposta },
  { match: (col, az) => col === "iris" && /(categoria|per_categoria|breakdown)/.test(az), fn: handleEmailPerCategoria },
  { match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase();
    return (col === "memo" && /(dossier|cliente|condominio|tutto_su|storico|impian|ricerca)/.test(az))
      || /dimmi\s+tutto.*(su|di|sul|sulla)|chi\s+e|dossier|storico\s+di/.test(m);
  }, fn: handleMemoDossier },
  { match: (col, az) => /lavagna/.test(az) && col !== "pharo", fn: handleStatoLavagna },
  { match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase();
    return (col === "charta" && /(registr|aggiung|nuovo|insert|salva|record).*incass/.test(az))
      || (col === "charta" && /registr_incass|aggiung_incass|nuovo_pag/.test(az))
      || /^\s*(registr|aggiung|nuov|salv)\w*\s+(?:un\s+)?(incass|pagament)/.test(m);
  }, fn: handleChartaRegistraIncasso },
  { match: (col, az) => (col === "charta" || col === "delphi") && /(report.*mens|mens.*report|report_mensile|mese|mensile)/.test(az), fn: handleChartaReportMensile },
  { match: (col, az) => col === "charta" && /(incass|pagament|accredit|bonifico)/.test(az) && /(oggi|today)/.test(az), fn: handleChartaIncassiOggi },
  { match: (col, az) => col === "charta" && /(fattura|scadut|incass|pagament|accredit)/.test(az), fn: handleFattureScadute },
  { match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase();
    return (col === "ares" && /(apri_intervent|crea_intervent|nuovo_intervent|open_intervent)/.test(az))
      || /^\s*(apri|crea|nuovo|aggiungi)\s+(un\s+)?intervent/.test(m);
  }, fn: handleAresApriIntervento },
  { match: (col, az) => col === "ares" && /(intervent|apert|attiv|in_corso|lista|cosa.*fare|oggi|giorno)/.test(az), fn: handleAresInterventiAperti },
  { match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase();
    return (col === "echo" && /(whatsapp|wa|send_whatsapp|send_wa|send_message|invia)/.test(az))
      || /(manda|invia|scrivi).*(whatsapp|wa\b|messaggio.*whats)/.test(m);
  }, fn: handleEchoWhatsApp },
  { match: (col, az) => col === "calliope" && /(bozza|scriv|risp|preventiv|sollecit|comunicazion)/.test(az), fn: handleCalliopeBozza },
  { match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase();
    return (col === "pharo" && /(rti|rtidf|ticket|guazzott|pending|rapporti|monitor)/.test(az))
      || /rti\b|rtidf|guazzott.*monitor|ticket.*apert|pending.*rti|monitor.*rti/.test(m);
  }, fn: handlePharoRtiMonitoring },
  { match: (col, az, int) => {
    const msg = String((int && int.userMessage) || "").toLowerCase();
    return col === "pharo" || /stato.*suite|salute.*sistema|health.*check|suite.*stato|suite.*status/.test(az + " " + msg);
  }, fn: handlePharoStatoSuite },
  { match: (col, az) => col === "pharo" && /(problem|alert|error|aperti|senza_ris|follow_up|issue|bloccat)/.test(az), fn: handlePharoProblemiAperti },
  { match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase();
    return (col === "delphi" && /(confront|mom|mese.*su.*mese|rispetto.*mese|vs.*mese)/.test(az))
      || /confronto.*mese|rispetto.*al.*mese|mese.*su.*mese/.test(m);
  }, fn: handleDelphiConfrontoMoM },
  { match: (col, az, ctx) => {
    const msg = (ctx?.userMessage || "").toLowerCase();
    return (col === "delphi" && /(costo.*ai|ai.*costo|token|spesa.*ai|budget)/.test(az))
      || /costo.*ai|spesa.*ai|token.*consum/.test(msg);
  }, fn: handleDelphiCostoAI },
  { match: (col, az, ctx) => {
    const msg = (ctx?.userMessage || "").toLowerCase();
    return (col === "delphi" && /(kpi|dashboard|andament|sintes|riassunto|come_siamo|come_andat)/.test(az))
      || /come.*siamo.*andat|come.*(va|vanno).*mese|andament.*mens|riassunto.*mese|kpi|dashboard/.test(msg);
  }, fn: handleDelphiKpi },
  { match: (col, az, ctx) => {
    const msg = (ctx?.userMessage || "").toLowerCase();
    return (col === "dikea" && /(targa|senza|censit)/.test(az))
      || /impianti.*senza.*targa|targa.*cit|senza.*targa/.test(msg);
  }, fn: handleDikeaImpiantiSenzaTarga },
  { match: (col, az) => col === "dikea" && /(curit|ree|bollino|compliance|normat|scadenz)/.test(az), fn: handleDikeaScadenzeCurit },
  { match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase();
    return (col === "emporion" && /(sotto.*scort|manca|mancan|riordin|scort.*min)/.test(az))
      || /cosa.*manca|sotto.*scort|articoli.*mancant/.test(m);
  }, fn: handleEmporionSottoScorta },
  { match: (col, az) => col === "emporion" && /(disponibil|giacenz|ricambi|pezz|articol|magazzin|c.*il.*pezz)/.test(az), fn: handleEmporionDisponibilita },
  { match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase();
    return (col === "chronos" && /(agenda.*giorn|agenda.*tecnico|giornata|agenda_giorn)/.test(az))
      || /agenda.*(di|del|per)\s+\w+.*(oggi|domani|dopodomani|\d{1,2}\/\d{1,2})/.test(m)
      || /agenda.*di.*\w+$/.test(m);
  }, fn: handleChronosAgendaGiornaliera },
  { match: (col, az) => col === "chronos" && /(scadenz|manutenz|curit|imminente|prossim.*manut)/.test(az), fn: handleChronosScadenze },
  { match: (col, az) => col === "chronos" && /(slot|libero|quando|agenda|disponib|prossim|impegni|fa.*domani|fa.*oggi)/.test(az), fn: handleChronosSlotTecnico },
];

export async function tryDirectAnswer(intent, userMessage) {
  const azione = (intent.azione || "").toLowerCase();
  const collega = (intent.collega || "").toLowerCase();
  const ctx = { userMessage: String(userMessage || "") };
  const handler = DIRECT_HANDLERS.find(h => h.match(collega, azione, ctx));
  if (!handler) return null;
  try {
    const result = await handler.fn(intent.parametri || {}, ctx);
    return result;
  } catch (e) {
    logger.error("nexus handler failed", {
      error: String(e), collega, azione,
    });
    return {
      content: `Ho provato a rispondere ma la query è fallita: ${String(e).slice(0, 200)}`,
      _failed: true,
    };
  }
}

// ─── NEXUS session management ──────────────────────────────────
export async function ensureNexusSession(sessionId, userId, previewText) {
  const ref = db.collection("nexus_sessions").doc(sessionId);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      id: sessionId,
      userId,
      title: (previewText || "Nuova conversazione").slice(0, 80),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      messageCount: 0,
    });
  } else {
    await ref.update({ updatedAt: FieldValue.serverTimestamp() });
  }
}

export async function writeNexusMessage(sessionId, data) {
  const msgRef = db.collection("nexus_chat").doc();
  await msgRef.set({
    id: msgRef.id,
    sessionId,
    ...data,
    createdAt: FieldValue.serverTimestamp(),
    timestamp: FieldValue.serverTimestamp(),
  });
  await db.collection("nexus_sessions").doc(sessionId).update({
    messageCount: FieldValue.increment(1),
    lastMessageAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }).catch(() => {});
  return msgRef.id;
}

export async function postLavagnaFromNexus({ collega, azione, parametri, rispostaUtente, userMessage, sessionId, nexusMessageId }) {
  const now = FieldValue.serverTimestamp();
  const ref = db.collection("nexo_lavagna").doc();
  await ref.set({
    id: ref.id,
    from: "nexus",
    to: collega,
    type: `nexus_${azione}`,
    payload: {
      azione, parametri, userMessage,
      nexusChatMessageId: nexusMessageId,
      sessionId,
      rispostaPreliminareNexus: rispostaUtente,
    },
    status: "pending",
    priority: "normal",
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
}

// ─── Haiku intent call ─────────────────────────────────────────
export async function callHaikuForIntent(apiKey, messages) {
  const payload = {
    model: MODEL,
    max_tokens: 1024,
    system: NEXUS_SYSTEM_PROMPT,
    messages,
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
  const text = (json.content || [])
    .filter(b => b.type === "text").map(b => b.text).join("\n").trim();
  return { text, usage: json.usage || {} };
}
