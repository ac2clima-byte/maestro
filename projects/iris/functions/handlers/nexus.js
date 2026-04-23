// handlers/nexus.js — router principale (Haiku intent parsing + DIRECT_HANDLERS dispatch).
import {
  db, FieldValue, logger,
  ANTHROPIC_API_KEY, ANTHROPIC_URL, MODEL,
} from "./shared.js";

// Import dei 10 Colleghi
import {
  handleContaEmailUrgenti, handleEmailOggi, handleEmailTotali,
  handleRicercaEmailMittente, handleEmailSenzaRisposta, handleEmailPerCategoria,
  handleStatoLavagna, handleIrisAnalizzaEmail,
} from "./iris.js";
import { handleWaInboxList, handleWaInboxAnalyzeLast } from "./echo-wa-inbox.js";
import { handleMemoDossier } from "./memo.js";
import { handleAresInterventiAperti, handleAresApriIntervento } from "./ares.js";
import { handleEchoWhatsApp } from "./echo.js";
import { handleCalliopeBozza } from "./calliope.js";
import {
  handleChartaRegistraIncasso, handleFattureScadute,
  handleChartaIncassiOggi, handleChartaReportMensile,
  handleChartaEsposizioneCliente,
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
  handleChronosCampagne, handleChronosListaCampagne,
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
            cerca_email_mittente, email_per_categoria,
            analizza_email (parametri: {mittente?} — "analizza l'ultima mail di X")
- echo       → inbound/outbound WA:
    azioni: sendWhatsApp, sendTelegram, sendEmail, sendPush,
            wa_inbox (lista messaggi WA ricevuti, "messaggi WA in arrivo"),
            wa_analizza_ultimo (analizza ultimo WA ricevuto)
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
- orchestrator → workflow multi-step (attiva con azione "preparare_preventivo",
    parametri: {condominio, committente, piva, oggetto, destinatario}).
    Trigger: "prepara preventivo per X", "fai un'offerta a Y per Z".
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
  // IRIS — analizza email (intent recognition + training)
  { match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase();
    return (col === "iris" && /analizz/.test(az))
      || /^\s*analizz\w+\s+(?:l['a]?\s+)?(?:ultim[ao]\s+)?(?:mail|email|messaggio|questa)/.test(m);
  }, fn: handleIrisAnalizzaEmail },
  // ECHO — WA inbox (intercetta messaggi WhatsApp ricevuti in COSMINA)
  { match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase();
    return (col === "echo" && /(wa.*analizz.*ultim|analizz.*ultim.*wa|ultimo.*whats)/.test(az))
      || /analizz(?:a|mi)?\s+(?:l[''])?ultim[oa]\s+(wa|whatsapp|messaggio.*wa)/.test(m);
  }, fn: handleWaInboxAnalyzeLast },
  { match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase();
    return (col === "echo" && /(wa.*inbox|wa.*arrivo|messaggi.*wa|whatsapp.*arrivo|whatsapp.*inbox)/.test(az))
      || /messaggi\s+(wa|whatsapp)\s+(?:in\s+)?arriv|wa\s+(?:in\s+)?arriv|whatsapp\s+non.*gest/.test(m);
  }, fn: handleWaInboxList },
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
  // CHARTA esposizione cliente (leggi Guazzotti pagamenti_clienti)
  { match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase();
    return (col === "charta" && /(esposizion|scadut.*client|credit|debit)/.test(az))
      || /esposizione.*client|quanto.*deve|credit.*verso/.test(m);
  }, fn: handleChartaEsposizioneCliente },
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
  // CHRONOS — Campagne (lista + dettaglio)
  { match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase();
    return (col === "chronos" && /(lista.*campagn|tutte.*campagn|campagne.*attiv|campagn_list|campaigns_list)/.test(az))
      || /campagne.*attiv|lista.*campagn|tutte.*campagn|quali.*campagn/.test(m);
  }, fn: handleChronosListaCampagne },
  { match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase();
    return (col === "chronos" && /(campagn|walkby|spegnimento|svuotament|riempiment)/.test(az))
      || /come\s+va\s+.*campagn|stato.*campagn|campagn.*walkby|campagn.*spegnimento/.test(m);
  }, fn: handleChronosCampagne },
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

  // Routing: se azione è un intent-workflow (preparare_preventivo, ecc.)
  // manda all'orchestrator invece che al singolo collega
  const az = String(azione || "").toLowerCase();
  const workflowIntents = new Set(["preparare_preventivo", "aprire_intervento_urgente", "sollecitare_pagamento"]);
  const isWorkflow = workflowIntents.has(az) || /^preventivo|^guasto_urgente/.test(az);
  const targetCollega = isWorkflow ? "orchestrator" : collega;
  const msgType = isWorkflow ? (az === "aprire_intervento_urgente" ? "guasto_urgente" : az) : `nexus_${azione}`;

  await ref.set({
    id: ref.id,
    from: "nexus",
    to: targetCollega,
    type: msgType,
    payload: {
      azione, parametri, userMessage,
      nexusChatMessageId: nexusMessageId,
      sessionId,
      rispostaPreliminareNexus: rispostaUtente,
      ...parametri, // per compatibilità con orchestrator che legge payload.condominio ecc.
    },
    status: "pending",
    priority: "normal",
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
}

// ─── Training pattern (addestramento via chat) ─────────────────
//
// Flow: utente scrive "analizza l'ultima mail di X" → assistente mostra analisi
// e salva pendingPattern nel messaggio. Turno successivo, utente risponde:
//   - "sì" / "ok" / "corretto"  → salva pattern in iris_patterns (conf=0.9)
//   - "sì ma [modifica]"        → salva con override del prossimo_passo
//   - "no, l'intent è X"        → salva correzione in iris_corrections + pattern rivisto
//   - altro                     → non è conferma, prosegui con Haiku normale

const CONFERMA_RE = /^\s*(s[iì]|ok|va\s+bene|perfett\w+|corrett\w+|giust\w+|esatt\w+|conferm\w+|approv\w+)\b/i;
const NEGAZIONE_RE = /^\s*no\b|\bsbagliat\w+|\berrat\w+|\bl['a]?\s*intent\s+[eè]\s+/i;
const MODIFICA_RE = /\b(ma|per[oò]|tranne|eccetto)\b/i;

function parseConfermaUser(testo) {
  const t = String(testo || "").trim();
  if (!t) return { kind: "altro" };
  if (NEGAZIONE_RE.test(t)) {
    // Estrai il nuovo intent se specificato
    const m = /l['a]?\s*intent\s+[eè]\s+([a-z_]+)/i.exec(t);
    const nuovoIntent = m ? m[1].toLowerCase() : null;
    return { kind: "no", nuovoIntent, testo: t };
  }
  if (CONFERMA_RE.test(t)) {
    const hasMod = MODIFICA_RE.test(t);
    return { kind: hasMod ? "si_ma" : "si", testo: t };
  }
  return { kind: "altro" };
}

async function getLastAssistantPendingPattern(sessionId) {
  if (!sessionId) return null;
  try {
    const snap = await db.collection("nexus_chat")
      .where("sessionId", "==", sessionId)
      .orderBy("createdAt", "desc")
      .limit(4)
      .get();
    let found = null;
    snap.forEach(d => {
      if (found) return;
      const v = d.data() || {};
      if (v.role !== "assistant") return;
      const pp = v.direct?.data?.pendingPattern || v.pendingPattern;
      if (pp && pp.kind === "conferma_analisi") found = { msgId: d.id, pendingPattern: pp };
    });
    return found;
  } catch (e) {
    logger.warn("getLastAssistantPendingPattern failed", { error: String(e).slice(0, 200) });
    return null;
  }
}

function patternKey(intent, triggerHash) {
  return `${intent}_${triggerHash}`.slice(0, 100);
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

/**
 * Salva o aggiorna un pattern in iris_patterns (via Admin SDK).
 * Se esiste già un pattern con stesso (intent + hash trigger), incrementa counters.
 * Dopo 3+ conferme, confidenza diventa 1.0.
 */
export async function saveOrReinforcePattern({ intent, triggerDescription, emailId, userId, workflow, corrected = false }) {
  const triggerHash = hashStr(String(triggerDescription || "").toLowerCase().trim());
  const id = patternKey(intent, triggerHash);
  const ref = db.collection("iris_patterns").doc(id);
  const snap = await ref.get();
  const now = FieldValue.serverTimestamp();
  if (!snap.exists) {
    const data = {
      id,
      intent,
      trigger_description: String(triggerDescription || "").slice(0, 400),
      trigger_hash: triggerHash,
      workflow: workflow || null,
      confidenza: corrected ? 0.7 : 0.9,
      volte_confermato: corrected ? 0 : 1,
      volte_rifiutato: corrected ? 1 : 0,
      ultimo_uso: now,
      creato_da: userId || "alberto",
      esempio_email_ids: emailId ? [emailId] : [],
      createdAt: now,
      updatedAt: now,
    };
    await ref.set(data);
    return { id, created: true, confidenza: data.confidenza };
  }
  const v = snap.data() || {};
  const volte_confermato = (v.volte_confermato || 0) + (corrected ? 0 : 1);
  const volte_rifiutato = (v.volte_rifiutato || 0) + (corrected ? 1 : 0);
  const confidenza = volte_confermato >= 3 ? 1.0 : Math.min(0.95, 0.7 + 0.1 * volte_confermato);
  const esempi = new Set(v.esempio_email_ids || []);
  if (emailId) esempi.add(emailId);
  await ref.set({
    volte_confermato,
    volte_rifiutato,
    confidenza,
    ultimo_uso: now,
    esempio_email_ids: Array.from(esempi).slice(-20),
    updatedAt: now,
  }, { merge: true });
  return { id, created: false, confidenza, volte_confermato };
}

async function saveCorrection({ emailId, intentOriginale, intentCorretto, userId, userMessage }) {
  const ref = db.collection("iris_corrections").doc();
  await ref.set({
    id: ref.id,
    emailId,
    intentOriginale,
    intentCorretto,
    correggi_da: userId || "alberto",
    userMessage: String(userMessage || "").slice(0, 500),
    createdAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

/**
 * Intercetta il messaggio utente se è una conferma/negazione dell'ultima
 * analisi. Se sì, gestisce il training. Altrimenti ritorna null (flow normale).
 */
export async function tryInterceptPatternConfirmation({ userMessage, sessionId, userId }) {
  const conferma = parseConfermaUser(userMessage);
  if (conferma.kind === "altro") return null;

  const pending = await getLastAssistantPendingPattern(sessionId);
  if (!pending) return null;

  const pp = pending.pendingPattern;
  if (!pp || !pp.intent) return null;

  // Gestisci conferma
  if (conferma.kind === "si" || conferma.kind === "si_ma") {
    const r = await saveOrReinforcePattern({
      intent: pp.intent,
      triggerDescription: pp.contesto_thread || "",
      emailId: pp.emailId,
      userId,
      workflow: intentToWorkflow(pp.intent),
    });
    let extra = "";
    if (conferma.kind === "si_ma") extra = ` (modifica annotata: "${conferma.testo.slice(0, 150)}")`;
    const confPct = Math.round((r.confidenza || 0) * 100);
    const auto = r.confidenza >= 1.0 ? " → diventa regola automatica ✅" : "";
    return {
      content: `✅ Pattern salvato${extra}\n\n` +
               `• Intent: \`${pp.intent}\`\n` +
               `• Conferme: ${r.volte_confermato ?? 1} — confidenza ${confPct}%${auto}\n` +
               `• ID: \`${r.id}\`\n\n` +
               `La prossima volta che IRIS vede un'email simile applicherà automaticamente questo intent.`,
      data: { patternId: r.id, confidenza: r.confidenza, emailId: pp.emailId },
      _trainingHandled: true,
    };
  }

  // Negazione: salva correzione + crea pattern corretto (se fornito nuovo intent)
  const nuovoIntent = conferma.nuovoIntent || null;
  await saveCorrection({
    emailId: pp.emailId,
    intentOriginale: pp.intent,
    intentCorretto: nuovoIntent,
    userId,
    userMessage,
  });
  if (nuovoIntent) {
    const r = await saveOrReinforcePattern({
      intent: nuovoIntent,
      triggerDescription: pp.contesto_thread || "",
      emailId: pp.emailId,
      userId,
      workflow: intentToWorkflow(nuovoIntent),
      corrected: true,
    });
    return {
      content: `↪️ Correzione registrata.\n\n` +
               `• Intent precedente (scartato): \`${pp.intent}\`\n` +
               `• Intent corretto: \`${nuovoIntent}\`\n` +
               `• Pattern aggiornato: \`${r.id}\` (confidenza ${Math.round(r.confidenza * 100)}%)`,
      data: { patternId: r.id, intentCorretto: nuovoIntent, emailId: pp.emailId },
      _trainingHandled: true,
    };
  }
  return {
    content: `❌ Analisi rifiutata. Dimmi qual è l'intent corretto: "no, l'intent è [slug]".\n\n` +
             `Intent possibili: preparare_preventivo, registrare_fattura, aprire_intervento_urgente, aprire_intervento_ordinario, rispondere_a_richiesta, registrare_incasso, gestire_pec, sollecitare_pagamento, archiviare, nessuna_azione.`,
    data: { emailId: pp.emailId, intentOriginale: pp.intent },
    _trainingHandled: true,
  };
}

function intentToWorkflow(intent) {
  switch (intent) {
    case "preparare_preventivo": return "preventivo";
    case "aprire_intervento_urgente": return "guasto_urgente";
    case "aprire_intervento_ordinario": return "intervento_ordinario";
    case "sollecitare_pagamento": return "sollecito";
    default: return null;
  }
}

// ─── Contesto conversazionale: ultimi 5 messaggi della sessione ─
//
// Arricchisce messages[] con gli ultimi scambi dalla stessa sessione
// così NEXUS interpreta riferimenti come "loro", "lui", "quel cliente".
export async function loadConversationContext(sessionId, max = 5) {
  if (!sessionId) return [];
  try {
    const snap = await db.collection("nexus_chat")
      .where("sessionId", "==", sessionId)
      .orderBy("createdAt", "desc")
      .limit(max * 2 + 1) // escludi il current user message appena scritto
      .get();
    const rows = [];
    snap.forEach(d => {
      const v = d.data() || {};
      if (v.role !== "user" && v.role !== "assistant") return;
      rows.push({
        role: v.role,
        content: String(v.content || "").slice(0, 1500),
        ts: v.createdAt?.toDate ? v.createdAt.toDate().getTime() : 0,
      });
    });
    // Ordina cronologicamente (più vecchio prima), escludi l'ultimo user (è il current)
    rows.sort((a, b) => a.ts - b.ts);
    // Pop ultimo se è user (è la query corrente — il chiamante la aggiungerà)
    if (rows.length && rows[rows.length - 1].role === "user") rows.pop();
    // Mantieni solo ultimi max*2 (coppie user/assistant)
    const sliced = rows.slice(-max * 2);
    return sliced.map(r => ({ role: r.role, content: r.content }));
  } catch (e) {
    logger.warn("loadConversationContext failed", { error: String(e) });
    return [];
  }
}

// ─── Analisi testo lungo / incollato ──────────────────────────
// Se l'utente incolla un testo lungo (>200 char) o scrive
// "analizza questo: ...", invece del routing standard NEXUS facciamo
// un'analisi dedicata con Haiku che estrae chi parla, cosa vuole, intent,
// azioni suggerite. Ritorna una bolla formattata.

const ANALYZE_TEXT_SYSTEM = `Sei l'assistente di Alberto Contardi (ACG Clima Service, manutenzione HVAC, Piemonte).
Hai ricevuto un MESSAGGIO (email, WhatsApp, trascrizione chiamata, o testo libero) che Alberto vuole analizzare.
Rispondi SOLO con JSON:

{
  "mittente": "<chi ha scritto/parlato, se deducibile>",
  "argomento": "<1 frase>",
  "richiesta": "<cosa vuole l'interlocutore in 1-2 frasi>",
  "intent": "preparare_preventivo|registrare_fattura|aprire_intervento_urgente|aprire_intervento_ordinario|rispondere_a_richiesta|registrare_incasso|gestire_pec|sollecitare_pagamento|archiviare|nessuna_azione",
  "urgenza": "bassa|media|alta|critica",
  "sentiment": "positivo|neutro|frustrato|arrabbiato|disperato",
  "entita": {
    "persone": ["nome 1"],
    "aziende": ["nome 1"],
    "condomini": ["nome 1"],
    "indirizzi": ["via/città 1"],
    "importi": ["€ 1.250,00 (causale)"],
    "date": ["2026-05-15 (tipo)"]
  },
  "azioni_suggerite": ["azione 1", "azione 2"],
  "riepilogo": "<2-3 frasi>",
  "prossimo_passo": "<1-2 frasi operative, come se stessi dando istruzioni a un collega>"
}

REGOLE:
- Leggi TUTTO il thread (anche email quotate "On X wrote", ">", "Il X ha scritto").
- Ometti campi di entita che non puoi estrarre con certezza.
- SOLO JSON valido, niente code fence, niente testo extra.
- Italiano operativo, concreto.`;

function shouldAnalyzeTextDirectly(userMessage) {
  const t = String(userMessage || "").trim();
  if (!t) return false;
  // Prefisso esplicito
  if (/^(analizz[aa]|leggi|riassumi)\s+(questo|quest[ao]\s+(?:messaggio|email|testo|chat|thread|messaggio)|il\s+seguente)[:\s]/i.test(t)) {
    return true;
  }
  // Heuristica: testo lungo (>200 char) senza domanda esplicita
  if (t.length > 200) {
    const lower = t.toLowerCase();
    // Non è una domanda NEXUS standard ("quante email", "apri intervento", ecc.)
    const isQuestion = /\?|^(quante?|quanti|cosa|come|dove|quando|chi|perché|apri|manda|scrivi|dimmi|cerca|trova|registra|fammi)\s/i.test(t);
    if (!isQuestion) return true;
    // Oppure è una domanda MA contiene indizi di messaggio incollato
    if (/^(.{0,50}(ha\s+scritto|wrote|:.*\n|>\s))/im.test(t)) return true;
  }
  return false;
}

async function callHaikuForTextAnalysis(apiKey, userText) {
  const payload = {
    model: MODEL,
    max_tokens: 1500,
    system: ANALYZE_TEXT_SYSTEM,
    messages: [{ role: "user", content: `Testo da analizzare:\n\n${userText.slice(0, 8000)}` }],
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
  if (s < 0 || e <= s) return { _raw: text, usage: json.usage || {} };
  try {
    const parsed = JSON.parse(text.slice(s, e + 1));
    parsed._usage = json.usage || {};
    return parsed;
  } catch {
    return { _raw: text, usage: json.usage || {} };
  }
}

function formatTextAnalysis(analysis) {
  if (!analysis || analysis._raw) {
    return `📝 **Analisi testo**\n\n${(analysis && analysis._raw) || "(parsing fallito)"}`;
  }
  const lines = [];
  lines.push(`📝 **Ho letto il messaggio${analysis.mittente ? " di " + analysis.mittente : ""}.**`);
  lines.push("");
  if (analysis.riepilogo) { lines.push(analysis.riepilogo); lines.push(""); }
  if (analysis.richiesta) lines.push(`**Richiesta**: ${analysis.richiesta}`);
  if (analysis.argomento) lines.push(`**Argomento**: ${analysis.argomento}`);
  if (analysis.intent) lines.push(`**Intent**: \`${analysis.intent}\``);
  if (analysis.urgenza) lines.push(`**Urgenza**: ${analysis.urgenza}`);
  if (analysis.sentiment) lines.push(`**Sentiment**: ${analysis.sentiment}`);
  lines.push("");
  const ent = analysis.entita || {};
  const entRows = [];
  if (Array.isArray(ent.persone) && ent.persone.length) entRows.push(`  • Persone: ${ent.persone.join(", ")}`);
  if (Array.isArray(ent.aziende) && ent.aziende.length) entRows.push(`  • Aziende: ${ent.aziende.join(", ")}`);
  if (Array.isArray(ent.condomini) && ent.condomini.length) entRows.push(`  • Condomini: ${ent.condomini.join(", ")}`);
  if (Array.isArray(ent.indirizzi) && ent.indirizzi.length) entRows.push(`  • Indirizzi: ${ent.indirizzi.join(", ")}`);
  if (Array.isArray(ent.importi) && ent.importi.length) entRows.push(`  • Importi: ${ent.importi.join(", ")}`);
  if (Array.isArray(ent.date) && ent.date.length) entRows.push(`  • Date: ${ent.date.join(", ")}`);
  if (entRows.length) {
    lines.push(`**Dati estratti**:`);
    lines.push(entRows.join("\n"));
    lines.push("");
  }
  if (Array.isArray(analysis.azioni_suggerite) && analysis.azioni_suggerite.length) {
    lines.push(`**Azioni suggerite**:`);
    for (const a of analysis.azioni_suggerite) lines.push(`• ${a}`);
    lines.push("");
  }
  if (analysis.prossimo_passo) {
    lines.push(`**Prossimo passo**: ${analysis.prossimo_passo}`);
    lines.push("");
  }
  lines.push(`❓ Procedo?`);
  return lines.join("\n");
}

/**
 * Se applicabile, analizza direttamente il testo (bypassa routing NEXUS).
 * Ritorna { content, data } compatibile con il flow direct handler, o null.
 */
export async function tryAnalyzeLongText(userMessage, apiKey) {
  if (!shouldAnalyzeTextDirectly(userMessage)) return null;
  if (!apiKey) return null;
  try {
    const analysis = await callHaikuForTextAnalysis(apiKey, userMessage);
    return {
      content: formatTextAnalysis(analysis),
      data: { analysis, kind: "text_analysis" },
      _textAnalysis: true,
    };
  } catch (e) {
    logger.warn("tryAnalyzeLongText failed", { error: String(e).slice(0, 200) });
    return null;
  }
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
