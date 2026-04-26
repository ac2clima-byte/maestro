// handlers/nexus.js — router principale (Haiku intent parsing + DIRECT_HANDLERS dispatch).
import {
  db, FieldValue, logger,
  ANTHROPIC_API_KEY, ANTHROPIC_URL, MODEL,
  naturalize,
} from "./shared.js";

// Import dei 10 Colleghi
import {
  handleContaEmailUrgenti, handleEmailOggi, handleEmailTotali,
  handleEmailRecenti, handleEmailAltre, handleLeggiEmail,
  handleRicercaEmailMittente, handleEmailSenzaRisposta, handleEmailPerCategoria,
  handleStatoLavagna, handleIrisAnalizzaEmail,
} from "./iris.js";
import { handleWaInboxList, handleWaInboxAnalyzeLast } from "./echo-wa-inbox.js";
import { handleBozzePendenti, handleApriBozza, handlePreventiviEmessi } from "./preventivo.js";
import { handleMemoDossier, handleMemoTotaliClienti, handleMemoTopClienti, handleMemoRicercaIndirizzo, handleListaTecnici, handleMemoChiE } from "./memo.js";
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
  handlePharoRtiProntiFattura, handlePharoBozzeCrtiPerTecnico,
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

export const NEXUS_SYSTEM_PROMPT = `REGOLA ASSOLUTA: rispondi in italiano naturale come un collega che parla. Niente emoji. Niente bold (**). Niente elenchi puntati (· o -). Niente formato campo: valore. Frasi complete come se parlassi a voce. Se devi elencare numeri, fallo in una frase: "Hai 103 email, di cui 35 senza risposta da più di 2 giorni" non "· Email: 103 · Senza risposta: 35".

REGOLA FONDAMENTALE: Rispondi SEMPRE come se fossi un collega che parla a voce.
MAI usare formato report, bullet point, titoli, campi "nome: valore", o emoji decorative.

VIETATO:
- Titoli con emoji: niente "📧 **Titolo**", "🚨 Titolo —", "📊 DELPHI — KPI"
- Elenchi con bullet "·" o "-" o "•" — solo frasi
- Emoji come separatori tra parole
- Markdown **bold**: scrivi normale, non in grassetto
- Formato "Campo: valore" (es: "Firestore: OK", "Intent: preparare_preventivo")
- Ripetere la stessa risposta identica se l'utente chiede di cambiarla

OBBLIGATORIO:
- Frasi complete, italiano naturale, come un collega competente che parla.
- Max 2-3 frasi. Meglio 10 parole di 30.
- Le liste lunghe vanno riassunte: "Hai 3 email, la più importante è di X" invece di elenco.
- Max 1 emoji in tutta la risposta, solo se aggiunge valore.
- Proponi azioni come domande: "Vuoi che…?", "Lo faccio?", "Procedo?".

ESEMPIO SBAGLIATO:
🚨 Stato Suite NEXO — punteggio: 0/100
  · Firestore: OK
  · Email indicizzate: 103
  · Lavagna pending: 100

ESEMPIO GIUSTO:
"La suite funziona ma è congestionata. Hai 103 email indicizzate e 100 messaggi pending sulla lavagna. Vuoi che li pulisco?"

────────────────────────────────────────────

Sei NEXUS, l'assistente personale di Alberto Contardi, titolare di ACG Clima Service (manutenzione HVAC, Piemonte: Alessandria, Voghera, Tortona).

Parli con Alberto come un collega competente che lavora con lui da anni. Il tuo compito:
1. Capire cosa serve.
2. Scegliere il Collega giusto (backend).
3. Passargli azione + parametri.
4. Rispondere ad Alberto in italiano colloquiale ma professionale (vedi REGOLA FONDAMENTALE sopra).

COLLEGHI + AZIONI STANDARD (preferisci queste azioni quando possibile):
- iris       → email in arrivo
    azioni: cerca_email_urgenti, email_oggi, email_totali, email_senza_risposta,
            cerca_email_mittente, email_per_categoria,
            email_recenti (lista delle ultime email — vedi sotto),
            email_altre (paginazione: pagina successiva),
            leggi_email (parametri: {indice} oppure {emailId} o nome mittente),
            analizza_email (parametri: {mittente?} — "analizza l'ultima mail di X")
    IMPORTANTE — quando Alberto vuole VEDERE le email (non solo il conteggio):
      "guarda le mail" / "mostrami le email" / "fammi vedere" → email_recenti
      "guarda le altre" / "le successive" / "avanti" / "altre" → email_altre
      "leggi la prima" / "apri la 2" / "leggi quella di Torriglia" → leggi_email
      Quante email "ho" / "ne hai" / "in totale" → email_totali (solo conteggio).
- echo       → inbound/outbound WA:
    azioni: sendWhatsApp, sendTelegram, sendEmail, sendPush,
            wa_inbox (lista messaggi WA ricevuti, "messaggi WA in arrivo"),
            wa_analizza_ultimo (analizza ultimo WA ricevuto)
- ares       → interventi (bacheca COSMINA):
    azioni: interventi_aperti (parametri opzionali: {tecnico, data}),
            apri_intervento, assegna_tecnico
    IMPORTANTE: "interventi aperti di [tecnico]" / "interventi di [tecnico] oggi"
      → SEMPRE collega="ares" + azione="interventi_aperti" con
      parametri.tecnico = nome (es. Marco, Lorenzo, David, Federico,
      Antonio, Ergest). Se l'utente cita "oggi" / "domani" passa anche
      parametri.data. NON confondere con PHARO: PHARO è per RTI/RTIDF
      Guazzotti, ARES è per gli INTERVENTI in bacheca COSMINA.
      "interventi" = ARES, sempre.
- chronos    → pianificazione + campagne:
    azioni: scadenze_prossime, slot_tecnico, agenda_giornaliera,
            campagne_attive (lista), campagna_status (parametri: {nome})
    IMPORTANTE: tutto ciò che parla di CAMPAGNE = CHRONOS.
      Esempi: "come va la campagna walkby", "campagna spegnimento",
      "Letture WalkBy ACG", "campagna riempimento" → campagna_status
      con parametri.nome = il nome della campagna citato dall'utente.
      NON delphi, NON charta. DELPHI è solo per KPI cross-source generici.
    IMPORTANTE: "agenda di [tecnico]" → agenda_giornaliera con
      parametri.tecnico = nome (es. "agenda di Marco domani"). I tecnici
      ACG sono: Aime David, Albanesi Gianluca, Contardi Alberto,
      Dellafiore Lorenzo, Dellafiore Victor, Leshi Ergest, Piparo Marco,
      Tosca Federico, Troise Antonio. Malvicino è personale ufficio
      Guazzotti, NON un tecnico ACG: l'handler lo riconosce e risponde di
      conseguenza.
- memo       → dossier_cliente, storico_impianto, lista_tecnici, chi_e_persona
    "tecnici", "lista tecnici", "chi sono i tecnici", "tecnici acg",
    "tecnici guazzotti" → azione lista_tecnici.
    "chi è [Persona]" / "chi è [Nome Cognome]" → azione chi_e_persona
      con parametri.nome = stringa completa. Vale per persone (clienti,
      contatti rubrica), non per condomini. NON confondere con dossier_cliente.
- charta     → amministrativo:
    azioni: fatture_scadute, incassi_oggi, report_mensile (parametri: {mese}),
            esposizione_cliente (parametri: {nome})
    IMPORTANTE: "report mensile [mese italiano] [anno]" passa il mese in
      parametri così com'è ("aprile 2026", "marzo 2025"). L'handler lo
      parsifica. NON dire "formato non valido" all'utente.
- emporion   → magazzino:
    azioni: disponibilita (parametri: {codice, descrizione}), dov_si_trova
- dikea      → compliance:
    azioni: scadenze_curit, impianti_senza_targa, valida_dico
- delphi     → analisi:
    azioni: kpi_dashboard, costo_ai, margine_intervento
    IMPORTANTE: "come siamo andati" / "come va il mese" / "andamento" = kpi_dashboard
- pharo      → monitoring + RTI/RTIDF:
    azioni: stato_suite, problemi_aperti, controllo_heartbeat,
            rti_pronti_fattura (GRTIDF/CRTIDF con costo compilato pronti),
            bozze_crti_per_tecnico (parametri: {tecnico})
    IMPORTANTE: "stato della suite" / "come sta il sistema" = stato_suite
    IMPORTANTE: tutto ciò che riguarda RTI/RTIDF/CRTI/CRTIDF/GRTI/GRTIDF
      = PHARO. Esempi: "RTI pronti per fattura" → rti_pronti_fattura,
      "bozze CRTI di [tecnico]" / "bozze CRTI vecchie di [tecnico]" →
      bozze_crti_per_tecnico (parametri.tecnico = nome). NON memo, NON charta.
- calliope   → content + preventivi emessi:
    azioni: bozza_risposta (parametri: {emailId, tono}), sollecito_pagamento,
            bozze_pendenti (preventivi NON ancora approvati in calliope_bozze),
            preventivi_emessi (preventivi GIA' emessi su DOC, parametri opzionali:
              {data, cliente}). Trigger: "abbiamo preventivi oggi su DOC?",
              "lista preventivi", "preventivi di aprile", "preventivi di
              quest'anno", "preventivo De Amicis", "preventivi emessi",
              "preventivo per Rossi", "fatti questa settimana".
              IMPORTANTE: distinzione netta:
                - bozze_pendenti = pre-approvazione (calliope_bozze, status=da_approvare)
                - preventivi_emessi = post-approvazione, finiti su DOC (docfin_documents, type=PRV)
- orchestrator → workflow multi-step (attiva con azione "preparare_preventivo",
    parametri: {condominio, committente, piva, oggetto, destinatario}).
    Trigger: "prepara preventivo per X", "fai un'offerta a Y per Z",
    "prepara preventivo per X intestato a Y".
    IMPORTANTE: per QUALSIASI richiesta che inizia con "prepara preventivo"
    o "fai preventivo" → SEMPRE collega="orchestrator" + azione="preparare_preventivo".
    NON usare collega="nessuno" per i preventivi.
- nessuno    → saluti, chiarimenti

IMPORTANTE — Richieste di sviluppo: se l'utente chiede modifiche UI, nuove feature,
bug fix, o idee per migliorare la PWA/NEXUS ("aggiungi un bottone", "modifica il
colore", "vorrei una pagina", "non funziona X", "fai uno swipe", "cambia il
layout", ecc.), NON RIFIUTARE. Queste sono gestite da un intercept dedicato PRIMA
del routing NEXUS che le salva in nexo_dev_requests. Se arrivano a questo punto,
rispondi con collega="nessuno" e riconferma che sono state prese in carico.

USO DEL CONTESTO CONVERSAZIONALE — FONDAMENTALE:
Nei messages[] ricevi gli ultimi scambi della sessione. Usali SEMPRE per
disambiguare. Esempi:
- Alberto: "quali sono i tecnici di ACG?" → tu: routing memo/lista_tecnici
- (handler fallisce o tu sbagli routing)
- Alberto: "dovresti vederli su firestore"
  → "li" si riferisce ai tecnici della domanda precedente. NON chiedere
    "non ho capito, riformula". Riprova il routing memo/lista_tecnici e basta.
Pronomi e riferimenti ("lui", "loro", "li", "quel cliente", "la stessa cosa",
"riprovaci", "vedili su firestore", "controlla meglio", "guarda meglio",
"prova ancora", "non ti arrendere") = SEMPRE riferiti all'ultimo argomento
di conversazione.

REGOLA SUL NON-ARRENDERSI:
Se l'utente dice qualcosa che non capisci al primo colpo, guarda i messaggi
precedenti per capire il contesto. Non rispondere mai "non ho capito" se
puoi dedurre l'intenzione dal contesto. Anche se un handler ha appena
fallito ("non trovato", "0 risultati"), se l'utente insiste con un
riferimento ("dovrebbe esserci", "guarda meglio", "su firestore", "in
COSMINA") riprova lo STESSO routing precedente — magari con parametri
leggermente diversi — invece di chiedere di riformulare. Fai un secondo
tentativo prima di arrenderti, sempre.

REGOLE:
- Rispondi SOLO con un oggetto JSON valido. Niente code fence, niente testo extra.
- Non inventare clienti, importi, condomini, date: chiedi chiarimento SOLO se davvero ambiguo E il contesto non aiuta.
- Se la richiesta matcha un'azione standard sopra, USA ESATTAMENTE quella stringa.
- Azione in snake_case (es. "cerca_email_urgenti", "scadenze_curit").
- rispostaUtente: vedi sezione TONO sopra. 1-2 frasi max. Colloquiale, diretto, naturale. Non dire mai "ti mostro" o "sto cercando" — il sistema risponde da solo, tu solo inoltri la richiesta.
- VIETATO rispondere "non ho capito, puoi riformulare?" se nei messages[] precedenti c'è un argomento a cui il messaggio attuale si riferisce. In quel caso ripeti il routing dell'argomento precedente.

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
  // Preventivi EMESSI su DOC (docfin_documents, type=PRV).
  // Va prima di handleBozzePendenti perché "preventivi su doc / emessi / oggi /
  // questa settimana / di aprile / per Rossi" sono tutti casi "post-approvazione".
  { match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase().trim();
    // Esclude esplicitamente le bozze (handler successivo)
    if (/preventivi\s+(in\s+)?(attesa|sospeso|pendent)/i.test(m)) return false;
    if (/bozz\w*\s+da\s+approv/i.test(m)) return false;
    if (col === "calliope" && /preventiv.*emess|preventivi_emessi|preventivi.*doc|preventivi.*oggi|preventivi.*settiman|preventivi.*mese|preventivi.*aprile|preventivi.*marzo/.test(az)) return true;
    // Pattern user-message: "preventivo/preventivi" + qualifier temporale o "su doc" o "emess"
    if (/\bpreventiv[oi]\b.*\b(emess|fatt|fatti|registr|su\s+doc|in\s+doc|approva[t]?[oi]?)\b/i.test(m)) return true;
    if (/\bpreventiv[oi]\b.*\b(oggi|ieri|questa\s+settimana|settimana\s+scors|questo\s+mese|mese\s+scors|quest['']?\s*anno|aprile|marzo|febbraio|gennaio|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre|20\d{2})\b/i.test(m)) return true;
    if (/\bdoc\b.*\bpreventiv/i.test(m)) return true;
    if (/^\s*(?:lista|elenco|ultimi|recenti)\s+preventiv/i.test(m)) return true;
    if (/\babbiamo\s+(?:un\s+)?preventiv|\bc'?è\s+(?:un\s+)?preventiv|\bci\s+sono\s+preventiv/i.test(m)) return true;
    // "preventivo per X" / "preventivo di X" / "preventivi per X" — search per cliente
    if (/\bpreventiv[oi]\b\s+(?:per|di|a)\s+[a-zà-ÿ]/i.test(m)) return true;
    return false;
  }, fn: handlePreventiviEmessi },
  // Bozze preventivo pendenti (match robusto su messaggio utente)
  { match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase().trim();
    // Match diretto sul messaggio user (più affidabile di az/col che dipendono da Haiku)
    if (/^bozz\w*\s+pendent/i.test(m)) return true;
    if (/^(cosa|che)\s+c'?.?\s+da\s+approv/i.test(m)) return true;
    if (/preventivi\s+(in\s+)?(attesa|sospeso|pendent)/i.test(m)) return true;
    if (/bozz\w*\s+da\s+approv/i.test(m)) return true;
    if (col === "calliope" && /(bozz.*pendent|da.*approv|preventivi.*attesa)/.test(az)) return true;
    return false;
  }, fn: handleBozzePendenti },
  // Apri bozza specifica ("apri preventivo XYZ" / "mostra il primo")
  { match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase();
    return /^(apri|mostra|vedi)\s+(il\s+primo|preventivo\s+[a-z0-9-]+)/i.test(m);
  }, fn: handleApriBozza },
  { match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase();
    return (col === "echo" && /(wa.*inbox|wa.*arrivo|messaggi.*wa|whatsapp.*arrivo|whatsapp.*inbox)/.test(az))
      || /messaggi\s+(wa|whatsapp)\s+(?:in\s+)?arriv|wa\s+(?:in\s+)?arriv|whatsapp\s+non.*gest/.test(m);
  }, fn: handleWaInboxList },
  { match: (col, az) => col === "iris" && /urgen/.test(az), fn: handleContaEmailUrgenti },
  // IRIS — leggi email N (specifico, prima delle altre)
  { match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase();
    if (col === "iris" && /(leggi_email|apri_email|leggi.*mail|leggi_la|apri_la)/.test(az)) return true;
    return /\b(leggi|apri|mostra(?:mi)?|dimmi)\s+(?:la\s+|il\s+)?(?:prima|seconda|terza|quarta|quinta|sesta|settima|ottava|nona|decima|ultima|\d{1,2})\b/i.test(m)
        || /\b(?:leggi|apri|mostra(?:mi)?)\s+(?:la\s+)?mail\b.{0,30}(?:di|da|del)\s+/i.test(m);
  }, fn: handleLeggiEmail },
  // IRIS — guarda le altre / le successive (paginazione)
  { match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase();
    if (col === "iris" && /(altre|successiv|prossim|avanti|paginazion|email_altre|email_successive)/.test(az)) return true;
    return /\b(?:guarda(?:le)?|mostra(?:mi)?)\s+(?:le\s+)?(?:altre|successive|prossim\w+)\b/i.test(m)
        || /^\s*(?:le\s+)?altre\b/i.test(m)
        || /^\s*avanti\b/i.test(m);
  }, fn: handleEmailAltre },
  // IRIS — guarda le mail / mostrami le email (lista)
  { match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase();
    if (col === "iris" && /(email_recenti|recenti|lista|mostra|guarda|elenco|vedi)/.test(az)) return true;
    return /\b(guarda(?:mi)?|mostra(?:mi)?|fammi\s+vedere|vedi(?:amo)?)\s+(?:le\s+)?(?:mie\s+)?(?:mail|email)\b/i.test(m)
        || /^\s*(?:le\s+)?(?:mie\s+)?(?:mail|email)\s+recenti\b/i.test(m)
        || /\bemail\s+recenti\b/i.test(m);
  }, fn: handleEmailRecenti },
  { match: (col, az) => col === "iris" && /(oggi|today|di_oggi|ricevute_oggi)/.test(az), fn: handleEmailOggi },
  { match: (col, az) => col === "iris" && /(total|conta_email|count|quant(e|it))/.test(az) && !/urgen/.test(az), fn: handleEmailTotali },
  { match: (col, az) => col === "iris" && /(mittente|sender|cerca_email|ricerca|email_da|da_mittente)/.test(az), fn: handleRicercaEmailMittente },
  { match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase();
    if (col === "iris" && /(senza_risposta|no_reply|attesa|followup|follow_up)/.test(az)) return true;
    return /email\s+senza\s+risposta|email.*non\s+risp|email\s+da\s+rispondere|email.*ferm/.test(m);
  }, fn: handleEmailSenzaRisposta },
  { match: (col, az) => col === "iris" && /(categoria|per_categoria|breakdown)/.test(az), fn: handleEmailPerCategoria },
  // MEMO — lista tecnici (rubrica cosmina_contatti_interni)
  { match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase();
    if (col === "memo" && /lista_tecnic|tecnici_acg|tecnici_guazz|chi_sono_i_tecnic/.test(az)) return true;
    // Match diretto sul messaggio: "tecnici", "lista tecnici", "chi sono i tecnici"
    // Evita match su "tecnico assegnato", "slot tecnico" (CHRONOS) — quelli hanno verbi diversi
    if (/\b(?:lista|elenco|nomi)\s+(?:dei\s+|de\s+i\s+|i\s+)?tecnic[io]\b/i.test(m)) return true;
    if (/\bchi\s+sono\s+i\s+tecnic[io]\b/i.test(m)) return true;
    if (/\bquali\s+sono\s+i\s+tecnic[io]\b/i.test(m)) return true;
    if (/\btecnici\s+(?:di\s+)?(?:acg|guazzotti|clima|service|energia)/i.test(m)) return true;
    if (/^\s*tecnic[io]\s*\??\s*$/i.test(m)) return true;
    return false;
  }, fn: handleListaTecnici },
  // MEMO — totali (quanti clienti abbiamo)
  { match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase();
    return (col === "memo" && /(totali|quanti_client|conta_client|numero_client)/.test(az))
      || /^\s*quant[ie]\s+client|quanti\s+cond[oa]min|client[ei]?\s+tot|numero\s+client/.test(m);
  }, fn: handleMemoTotaliClienti },
  // MEMO — top clienti per impianti
  { match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase();
    return (col === "memo" && /(top|pi[uù]_impiant|top_client)/.test(az))
      || /client[ei]?\s+con\s+pi[uù]\s+impiant|top\s+client|client[ei]?\s+pi[uù]\s+grand/.test(m);
  }, fn: handleMemoTopClienti },
  // MEMO — ricerca per indirizzo
  { match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase();
    return (col === "memo" && /(ricerca_indirizz|cerca_indirizz|per_via|per_indirizz)/.test(az))
      || /\bcerca\s+cliente\s+(?:in\s+)?(?:via|viale|corso|piazza)/i.test(m)
      || /chi\s+[èe]\s+in\s+(?:via|viale|corso|piazza)/i.test(m);
  }, fn: handleMemoRicercaIndirizzo },
  // MEMO — chi è [Persona] (rubrica + email + amministratori)
  // PRIMA del dossier generico per intercettare il pattern "chi è X".
  { match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase();
    if (col === "memo" && /(chi_e|chi_è|persona|rubrica)/.test(az)) return true;
    return /^\s*chi\s+(?:è|e)\s+\S+/i.test(m);
  }, fn: handleMemoChiE },
  // MEMO — dossier generico (fallback su condominio/cliente)
  { match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase();
    return (col === "memo" && /(dossier|cliente|condominio|tutto_su|storico|impian|ricerca)/.test(az))
      || /dimmi\s+tutto.*(su|di|sul|sulla)|dossier|storico\s+di/.test(m);
  }, fn: handleMemoDossier },
  { match: (col, az) => /lavagna/.test(az) && col !== "pharo", fn: handleStatoLavagna },
  { match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase();
    return (col === "charta" && /(registr|aggiung|nuovo|insert|salva|record).*incass/.test(az))
      || (col === "charta" && /registr_incass|aggiung_incass|nuovo_pag/.test(az))
      || /^\s*(registr|aggiung|nuov|salv)\w*\s+(?:un\s+)?(incass|pagament)/.test(m);
  }, fn: handleChartaRegistraIncasso },
  { match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase();
    if ((col === "charta" || col === "delphi") && /(report.*mens|mens.*report|report_mensile|mese|mensile)/.test(az)) return true;
    return /^\s*report\s+mensil/.test(m)
        || /report\s+(?:di\s+)?(?:gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)/i.test(m);
  }, fn: handleChartaReportMensile },
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
  { match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase();
    if (col === "ares" && /(intervent|apert|attiv|in_corso|lista|cosa.*fare|oggi|giorno)/.test(az)) return true;
    // Match diretto: "interventi (aperti) di [nome]" / "interventi di [nome] oggi/domani"
    return /\bintervent[io]\s+(?:apert[io]\s+)?(?:di|del|per)\s+[a-zà-ÿ]/i.test(m)
        || /\bintervent[io]\s+(?:di\s+)?oggi\b/i.test(m);
  }, fn: handleAresInterventiAperti },
  { match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase();
    return (col === "echo" && /(whatsapp|wa|send_whatsapp|send_wa|send_message|invia)/.test(az))
      || /(manda|invia|scrivi).*(whatsapp|wa\b|messaggio.*whats)/.test(m);
  }, fn: handleEchoWhatsApp },
  { match: (col, az) => col === "calliope" && /(bozza|scriv|risp|preventiv|sollecit|comunicazion)/.test(az), fn: handleCalliopeBozza },
  // PHARO — RTI pronti per fattura (specifico, prima del generico monitoring)
  { match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase();
    if (col === "pharo" && /rti_pronti_fattura|pronti_fattura|rti.*pronti.*fatt/.test(az)) return true;
    return /\brti\s+(?:sono\s+)?pronti\s+(?:per\s+)?(?:la\s+)?fattur/.test(m)
        || /quanti\s+rti\s+pronti/.test(m)
        || /rti\s+da\s+fatturare/.test(m);
  }, fn: handlePharoRtiProntiFattura },
  // PHARO — Bozze CRTI per tecnico
  { match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase();
    if (col === "pharo" && /(bozze_crti|bozze.*crti|crti_per_tecnic)/.test(az)) return true;
    return /bozze\s+crti\b/.test(m)
        || /\bcrti\s+vecchi/.test(m)
        || /\bcrti\s+(?:di|del|per)\s+[a-zà-ÿ]/i.test(m);
  }, fn: handlePharoBozzeCrtiPerTecnico },
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
  { match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase();
    if (col === "dikea" && /(curit|ree|bollino|compliance|normat|scadenz)/.test(az)) return true;
    return /scadenze\s+curit|curit\s+(prossim|in\s+scadenza)/i.test(m);
  }, fn: handleDikeaScadenzeCurit },
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

// Nome del Collega derivato dal nome della funzione handler
// (es. "handlePharoRtiProntiFattura" → "pharo"). Serve quando Haiku ritorna
// collega="nessuno" ma il direct handler regex-based ha matchato comunque.
function inferCollegaFromHandlerName(fn) {
  const name = (fn && fn.name) || "";
  // 1. handleXxx → estrai gruppo Collega
  const m = name.match(/^handle(Pharo|Memo|Ares|Echo|Iris|Charta|Chronos|Delphi|Dikea|Emporion|Calliope|WaInbox|Fatture|StatoLavagna|Bozze|ApriBozza|ListaTecnici|ContaEmail|EmailOggi|EmailTotali|EmailPerCategoria|EmailSenzaRisposta|RicercaEmail|FattureScadute)/i);
  if (m) {
    const slug = m[1].toLowerCase();
    if (slug === "wainbox") return "echo";
    if (slug === "fatture" || slug === "fatturescadute") return "charta";
    if (slug === "statolavagna") return "pharo";
    if (slug === "bozze" || slug === "apribozza" || slug === "listatecnici") return "memo";
    if (slug.startsWith("email") || slug.startsWith("contaemail") || slug.startsWith("ricercaemail")) return "iris";
    return slug;
  }
  return null;
}

export async function tryDirectAnswer(intent, userMessage, sessionId = null) {
  const azione = (intent.azione || "").toLowerCase();
  const collega = (intent.collega || "").toLowerCase();
  const ctx = { userMessage: String(userMessage || ""), sessionId: sessionId || null };
  const handler = DIRECT_HANDLERS.find(h => h.match(collega, azione, ctx));
  if (!handler) return null;
  try {
    // Propaga sessionId nei parametri per le safety check (ECHO dry-run su forge-test)
    const params = { ...(intent.parametri || {}) };
    if (sessionId && !params.sessionId) params.sessionId = sessionId;
    const result = await handler.fn(params, ctx);
    // Annota il Collega effettivo derivato dal handler così il chiamante
    // può ricostruire il routing reale anche se Haiku ha messo "nessuno".
    if (result && typeof result === "object") {
      result._handlerCollega = inferCollegaFromHandlerName(handler.fn);
    }
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
  // Post-process: rimuove residui formato robotico da QUALSIASI content
  // prima di salvarlo. Safety net anche per handler non ancora migrati.
  const clean = { ...data };
  if (clean.content && clean.role === "assistant") {
    clean.content = naturalize(clean.content);
  }
  const msgRef = db.collection("nexus_chat").doc();
  await msgRef.set({
    id: msgRef.id,
    sessionId,
    ...clean,
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

// ─── Conversational email queue ──────────────────────────────
// Quando una risposta NEXUS porta data.pendingEmails (coda email da presentare
// una alla volta), il turno successivo intercetta "sì/prossima/basta/leggila".

const CONTINUA_RE = /^\s*(s[iì]|ok|va\s+bene|prossim\w*|continua|successiv\w|avanti|dai|vai|leggila\s+tutta|leggimi|dammi\s+dettagli)\b/i;
const STOP_RE = /^\s*(no|stop|basta|fermati|zitto|grazie\s+basta|lascia\s+perdere)\b/i;
const READ_FULL_RE = /\b(leggila|leggi\s+tutt|dammi\s+dettagli|corpo\s+completo|tutto|intera)\b/i;
const REPLY_RE = /\b(rispondi|scriv\w+\s+risposta|bozza)\b/i;

async function getLastAssistantPendingEmails(sessionId) {
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
      const pe = v.direct?.data?.pendingEmails;
      if (pe && pe.kind === "email_queue") found = { msgId: d.id, pendingEmails: pe };
    });
    return found;
  } catch { return null; }
}

async function callHaikuShortPresent(apiKey, email, mode) {
  const who = email.from || "?";
  const subject = email.subject || "";
  const body = (email.body || "").slice(0, 3000);
  const system = `Sei l'assistente personale di Alberto Contardi (ACG Clima Service, manutenzione HVAC).
Ti viene mostrata un'email. Presentala in modo NATURALE E CONVERSAZIONALE, come se parlassi a voce al tuo capo.

REGOLE:
- ${mode === "resumen" ? "Massimo 2 frasi: chi scrive, cosa serve fare." : "Massimo 3 frasi: riassumi il contenuto in linguaggio naturale, senza elenchi."}
- Niente elenchi puntati, niente date "DD/MM", niente tag tecnici.
- Parla come un collega umano che ha letto la mail e te la riferisce.
- Se il mittente è sconosciuto, di' "un certo [nome]" o "tal [nome]".
- Concludi con una frase che chiede se vuole approfondire, passare alla prossima, o agire.`;
  const user = `Email da: ${who}\nOggetto: ${subject}\nCorpo:\n${body}`;
  const resp = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 400, system, messages: [{ role: "user", content: user }] }),
  });
  if (!resp.ok) throw new Error(`Haiku ${resp.status}`);
  const json = await resp.json();
  const text = (json.content || []).filter(b => b.type === "text").map(b => b.text).join("").trim();
  return text;
}

export async function tryInterceptEmailQueue({ userMessage, sessionId }) {
  const t = String(userMessage || "").trim();
  if (!t) return null;

  const pending = await getLastAssistantPendingEmails(sessionId);
  if (!pending) return null;

  const pe = pending.pendingEmails;
  const cursor = pe.cursor || 0;

  if (STOP_RE.test(t)) {
    return {
      content: "Ok, mi fermo. Dimmi quando vuoi riprendere.",
      data: { emailQueueClosed: true },
      _emailQueueHandled: true,
    };
  }

  const wantsFull = READ_FULL_RE.test(t);
  const wantsReply = REPLY_RE.test(t);
  const isContinue = CONTINUA_RE.test(t) || wantsFull || wantsReply;
  if (!isContinue) return null; // lascia il flow standard

  // Se vuole rispondere → routing a CALLIOPE via lavagna + NEXUS risposta breve
  if (wantsReply) {
    const curEmail = pe.emails[cursor];
    if (!curEmail) return { content: "Non ho più email in coda.", _emailQueueHandled: true };
    return {
      content: `Perfetto, passo a CALLIOPE per scrivere la bozza di risposta a ${curEmail.from}. Ti aggiorno quando è pronta.`,
      data: {
        triggerCalliope: { emailId: curEmail.id, from: curEmail.from },
        pendingEmails: pe, // mantieni la coda
      },
      _emailQueueHandled: true,
    };
  }

  // Altrimenti: presenta l'email corrente (read full) o avanza alla prossima
  const apiKey = ANTHROPIC_API_KEY.value();
  let curEmail, mode;
  if (wantsFull) {
    curEmail = pe.emails[cursor];
    mode = "full";
  } else {
    // Presenta la prossima
    curEmail = pe.emails[cursor];
    mode = "resumen";
  }
  if (!curEmail) return { content: "Ho finito la coda, non ci sono altre email.", _emailQueueHandled: true };

  let presented = "";
  try {
    if (apiKey) presented = await callHaikuShortPresent(apiKey, curEmail, mode);
  } catch (e) { logger.warn("email present Haiku failed", { error: String(e).slice(0, 150) }); }
  if (!presented) {
    presented = `${curEmail.from} ti scrive: "${(curEmail.summary || curEmail.subject || "").slice(0, 200)}". Vuoi approfondire?`;
  }

  // Avanza cursor per il prossimo turno (solo se non era "leggila tutta" — in quel caso resta)
  const newCursor = wantsFull ? cursor : cursor + 1;
  const remaining = pe.emails.length - newCursor;
  const tail = remaining > 0
    ? `\n\nCi sono ancora ${remaining} email in coda. Vuoi la prossima?`
    : `\n\nEra l'ultima in coda.`;

  return {
    content: presented + tail,
    data: {
      pendingEmails: remaining > 0 ? { ...pe, cursor: newCursor } : null,
      emailQueueDone: remaining <= 0,
    },
    _emailQueueHandled: true,
  };
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
    const confPct = Math.round((r.confidenza || 0) * 100);
    let msg;
    if (r.confidenza >= 1.0) {
      msg = `Imparato. D'ora in poi lo faccio in automatico.`;
    } else if ((r.volte_confermato ?? 1) > 1) {
      msg = `Ok, ${r.volte_confermato} volte che funziona — confidenza al ${confPct}%. Ancora un paio e lo metto in automatico.`;
    } else {
      msg = `Memorizzato. La prossima volta che ne vedo una uguale faccio lo stesso.`;
    }
    if (conferma.kind === "si_ma") msg += " Tengo nota della tua modifica.";
    return {
      content: msg,
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
      content: `Capito, allora ho sbagliato. Ho corretto: adesso so che era ${nuovoIntent.replace(/_/g, " ")}.`,
      data: { patternId: r.id, intentCorretto: nuovoIntent, emailId: pp.emailId },
      _trainingHandled: true,
    };
  }
  return {
    content: `Ok, mi sono sbagliato. Dimmi tu cosa voleva: preventivo, intervento, fattura, sollecito, PEC, niente di importante?`,
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

// ─── Richieste di sviluppo (dev request) ──────────────────────
// Quando l'utente chiede modifiche UI / nuove feature / bug fix / idee,
// NON rifiutare. Salva in nexo_dev_requests e rispondi "registrata".
// Il flow evita che NEXUS dica "non rientra nelle mie competenze".

const DEV_REQUEST_PATTERNS = [
  // Verbi di sviluppo
  /\b(aggiung\w+|modific\w+|cambi\w+|rimuov\w+|implement\w+|fix\w+|risolv\w+|sistem\w+|aggiorn\w+)\b/i,
  // Sostantivi di sviluppo
  /\b(feature|bug|errore|bottone|pulsante|pagina|schermata|card|widget|lista|menu|swipe|layout|design|colore|icon\w+|stil\w+|animazion\w+)\b/i,
  // Richieste esplicite
  /\b(vorrei|puoi\s+fare|puoi\s+aggiungere|serve\s+(che|un|una)|mi\s+serve|fammi|crea\w*)\b/i,
  // Metafora "non funziona"
  /\bnon\s+(funzion\w+|va\b|parte\b|carica\w+)\b/i,
];

const DEV_REQUEST_EXCLUSION = [
  // Non trigger se l'utente sta solo chiedendo info o confermando
  /^\s*(s[iì]|no|ok|va\s+bene|prossim|basta|analizz|mostr|dimmi|quante?|cosa|come)\b/i,
  // Non trigger se è già un comando chiaro a un collega
  /^\s*(apri|manda|invia|scriv|registr|cerca|trova)\s+(un\s+)?(intervent|email|whatsapp|wa|fattura|incass|preventivo|sollecit|cliente|bozza|messaggio)/i,
];

function isDevRequest(userMessage) {
  const t = String(userMessage || "").trim();
  if (!t || t.length < 10) return false;
  for (const re of DEV_REQUEST_EXCLUSION) {
    if (re.test(t)) return false;
  }
  // Richiede match di almeno 2 pattern (verbo + sostantivo, o verbo + richiesta) per ridurre falsi positivi
  let matches = 0;
  for (const re of DEV_REQUEST_PATTERNS) {
    if (re.test(t)) matches++;
    if (matches >= 2) return true;
  }
  // Se c'è una richiesta molto esplicita ("vorrei", "puoi fare") basta 1 match
  if (/\b(vorrei|puoi\s+fare|puoi\s+aggiungere|serve\s+che|mi\s+serve|fammi|crea\w*)\b/i.test(t)) return true;
  return false;
}

/**
 * Genera un ID leggibile DEV-NNN incrementando atomicamente un counter
 * in nexo_config/nexo_counters. Fallback su DEV-{epochMs} se il counter fallisce.
 */
async function nextDevRequestId() {
  try {
    const ref = db.collection("nexo_config").doc("nexo_counters");
    const next = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const cur = snap.exists ? (snap.data().devRequest || 0) : 0;
      const n = cur + 1;
      tx.set(ref, { devRequest: n, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return n;
    });
    return `DEV-${String(next).padStart(3, "0")}`;
  } catch (e) {
    logger.warn("dev_request counter failed, fallback timestamp", { error: String(e).slice(0, 200) });
    return `DEV-${Date.now()}`;
  }
}

/**
 * Salva una dev request in nexo_dev_requests + nexo_dev_requests_queue
 * (letta dal poller locale dev_request_poller.js che la trasforma in
 * tasks/dev-request-{DEV-NNN}.md e la pusha su GitHub).
 * Ritorna una risposta conversazionale con l'ID DEV-NNN.
 */
export async function tryInterceptDevRequest({ userMessage, userId, sessionId }) {
  if (!isDevRequest(userMessage)) return null;

  const description = String(userMessage || "").trim().slice(0, 3000);
  const humanId = await nextDevRequestId();

  let docId = null;
  try {
    // Doc primario in nexo_dev_requests (storia completa + stato analisi)
    const ref = db.collection("nexo_dev_requests").doc(humanId);
    await ref.set({
      id: humanId,
      description,
      status: "pending",
      source: "nexus_chat",
      userId: userId || null,
      sessionId: sessionId || null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    docId = humanId;

    // Coda per il poller locale: il poller legge i doc con queueStatus=pending,
    // crea il file md, pusha, e marca queueStatus=pushed.
    await db.collection("nexo_dev_requests_queue").doc(humanId).set({
      id: humanId,
      description,
      queueStatus: "pending",
      userId: userId || null,
      sessionId: sessionId || null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    logger.warn("dev_request save failed", { error: String(e).slice(0, 200) });
  }

  const preview = description.length > 100 ? description.slice(0, 97) + "…" : description;
  return {
    content: `Ho registrato la richiesta ${humanId}: "${preview}". Claude Code la sta analizzando, ti aggiorno quando l'analisi è pronta.`,
    data: { devRequestId: docId, humanId, description: preview },
    _devRequestHandled: true,
  };
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
    return (analysis && analysis._raw) || "Non sono riuscito a interpretare il testo.";
  }
  const parts = [];
  const mittenteSoft = analysis.mittente ? analysis.mittente.split(/\s+/)[0] : null;

  // Apertura
  if (mittenteSoft) parts.push(`Ho letto il messaggio di ${mittenteSoft}.`);
  else parts.push(`Ho letto.`);

  // Riepilogo — contenuto principale
  if (analysis.riepilogo) parts.push(analysis.riepilogo);
  else if (analysis.richiesta) parts.push(analysis.richiesta);

  // Urgenza solo se alta/critica
  if (analysis.urgenza === "alta" || analysis.urgenza === "critica") {
    parts.push(`È urgente.`);
  }

  // Prossimo passo → domanda diretta
  if (analysis.prossimo_passo) {
    parts.push(`${analysis.prossimo_passo.replace(/\.$/, "")}. Procedo?`);
  } else if (Array.isArray(analysis.azioni_suggerite) && analysis.azioni_suggerite.length) {
    parts.push(`Posso ${analysis.azioni_suggerite[0].toLowerCase().replace(/\.$/, "")}. Vuoi?`);
  } else {
    parts.push(`Cosa vuoi che faccia?`);
  }

  return parts.join(" ");
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
