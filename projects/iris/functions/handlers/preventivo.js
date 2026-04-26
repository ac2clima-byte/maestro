// handlers/preventivo.js — workflow preventivo end-to-end sincrono.
//
// Chiamato direttamente dal NEXUS router quando l'utente chiede
// "prepara il preventivo per X intestato a Y" (o conferma dopo un'analisi
// email con intent=preparare_preventivo).
//
// Differenza con orchestrator.js:
//  - orchestrator.js è un listener Firestore async (per trigger da rules IRIS)
//  - questo modulo è sincrono: NEXUS aspetta e restituisce la bozza in chat.
//
// Steps:
//   1. Parsing input (condominio, committente, P.IVA, oggetto, sourceEmailId)
//   2. Ricerca P.IVA → arricchimento dati azienda (Haiku come fallback)
//   3. Ricerca condominio nel CRM COSMINA
//   4. CALLIOPE genera bozza JSON strutturata con Claude Sonnet
//   5. Salva in calliope_bozze + charta_preventivi (status: da_approvare)
//   6. Risponde in chat con preview + opzioni "approva/modifica/rifiuta"

import {
  db, FieldValue, logger,
  ANTHROPIC_API_KEY, ANTHROPIC_URL, MODEL,
  getCosminaDb,
  fetchIrisEmails,
} from "./shared.js";

const CALLIOPE_MODEL = "claude-sonnet-4-6";

// Parsing input del messaggio NEXUS
export function parsePreventivoInput(userMessage, context = {}) {
  const msg = String(userMessage || "").toLowerCase();
  const out = {
    condominio: null,
    committente: null,
    piva: null,
    oggetto: "verifica impianto di riscaldamento",
    sourceEmailId: null,
  };

  // Se arriva dal context (es. da pendingPattern di "analizza email"), usa quello
  if (context.dati_estratti) {
    const de = context.dati_estratti;
    if (Array.isArray(de.condomini) && de.condomini.length) out.condominio = de.condomini[0];
    if (Array.isArray(de.aziende) && de.aziende.length) {
      out.committente = de.aziende[0].nome;
      out.piva = de.aziende[0].piva || null;
    }
  }
  if (context.sourceEmailId) out.sourceEmailId = context.sourceEmailId;

  // Parsing regex dal testo libero
  // "prepara il preventivo per X intestato a Y"
  const perM = /\bper\s+(?:il\s+|la\s+|lo\s+)?(?:condominio\s+)?([a-zà-ÿ][\wà-ÿ.'\s]{2,40}?)(?=\s+(?:intest|committ|con\s+p\.?iva|oggetto|per\s+la\s+verifica|$))/i.exec(userMessage);
  if (perM && !out.condominio) out.condominio = perM[1].trim();

  const intestM = /\b(?:intestato\s+a|committente|per\s+conto\s+di|intestazione)\s+([a-zà-ÿ0-9][\wà-ÿ.&'\s]{1,60}?)(?=\s+(?:con\s+p\.?iva|p\.?iva|oggetto)|\s*[\.,;!?]|$)/i.exec(userMessage);
  if (intestM && !out.committente) out.committente = intestM[1].trim();

  const pivaM = /\bp\.?iva\s*[:= ]*(\d{11})\b/i.exec(userMessage);
  if (pivaM && !out.piva) out.piva = pivaM[1];

  const oggettoM = /\b(?:oggetto|per\s+la\s+verifica|per\s+il\s+lavoro)\s+(?:di\s+)?([a-zà-ÿ][\wà-ÿ\s]{5,80})/i.exec(userMessage);
  if (oggettoM) out.oggetto = oggettoM[1].trim();

  return out;
}

// Haiku: arricchisci dati azienda a partire da nome + P.IVA
// (fallback quando non abbiamo accesso a servizi P.IVA esterni)
async function arricchisciAzienda(apiKey, committente, piva) {
  if (!apiKey || (!committente && !piva)) return null;

  // 1. Lookup diretto su piva_XXX (più veloce)
  if (piva) {
    try {
      const cached = await db.collection("memo_aziende").doc(`piva_${piva}`).get();
      if (cached.exists) return { ...cached.data(), _fromCache: true };
    } catch {}
  }

  // 2. Lookup per nome: scan memo_aziende e cerca match su ragione_sociale
  //    (token-based, case-insensitive, ignora suffissi "S.r.l." / "Società Benefit").
  //    Risolve il caso "intestato a 3i" senza piva esplicita: la doc è
  //    cached con id "piva_02486680065" e ragione_sociale "3i efficientamento
  //    energetico S.r.l. Società Benefit" → matcha sul token "3i".
  if (committente) {
    try {
      const qTokens = String(committente).toLowerCase()
        .replace(/[^\wà-ÿ\s]/g, " ")
        .split(/\s+/)
        .filter(t => t && t.length >= 2 && !/^(s\.?r\.?l|s\.?p\.?a|spa|srl|societa|società|benefit|di|del|della|il|la|lo)$/.test(t));
      if (qTokens.length) {
        const snap = await db.collection("memo_aziende").limit(100).get();
        for (const d of snap.docs) {
          if (d.id === "_stats") continue;
          const v = d.data() || {};
          const rs = String(v.ragione_sociale || "").toLowerCase();
          if (!rs) continue;
          // Match: tutti i token query devono apparire nella ragione sociale
          const allMatch = qTokens.every(t => rs.includes(t));
          if (allMatch) {
            return { ...v, _fromCache: true, _matchedBy: "ragione_sociale_tokens" };
          }
        }
      }
    } catch (e) {
      logger.warn("arricchisciAzienda nome-lookup fail", { error: String(e).slice(0, 120) });
    }
  }

  const system = `Sei un esperto di anagrafica aziende italiane.
Ti viene chiesto di arricchire i dati di un'azienda a partire dal nome e/o P.IVA.
Rispondi SOLO con JSON valido:

{
  "ragione_sociale": "<nome completo, es. '3i efficientamento energetico S.r.l. Società Benefit'>",
  "piva": "<11 cifre>",
  "codice_fiscale": "<se coincide con P.IVA scrivi la stessa>",
  "sede_legale": {
    "indirizzo": "<via e numero>",
    "cap": "<5 cifre>",
    "citta": "<città>",
    "provincia": "<sigla>"
  },
  "pec": "<pec@...>",
  "codice_sdi": "<7 caratteri per fatturazione elettronica>",
  "telefono": "<numero se noto>",
  "settore": "<1 frase>",
  "confidenza": "high|medium|low",
  "note": "<1 frase se dati incerti>"
}

REGOLE:
- Se non conosci un dato, ometti il campo (non inventare).
- Se conosci solo alcuni campi, ritorna solo quelli + "confidenza": "low".
- SOLO JSON, niente code fence, niente testo extra.`;

  const user = [
    committente ? `Nome/Ragione sociale: ${committente}` : "",
    piva ? `P.IVA: ${piva}` : "",
    "",
    "Arricchisci i dati di anagrafica di questa azienda italiana.",
  ].filter(Boolean).join("\n");

  try {
    const resp = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 800,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!resp.ok) throw new Error(`Haiku ${resp.status}`);
    const json = await resp.json();
    const text = (json.content || []).filter(b => b.type === "text").map(b => b.text).join("").trim();
    const s = text.indexOf("{"), e = text.lastIndexOf("}");
    if (s < 0 || e <= s) return null;
    const parsed = JSON.parse(text.slice(s, e + 1));

    // Cache su memo_aziende
    if (piva) {
      try {
        await db.collection("memo_aziende").doc(`piva_${piva}`).set({
          ...parsed,
          _createdAt: FieldValue.serverTimestamp(),
          _source: "haiku_enrichment",
        });
      } catch {}
    }
    return parsed;
  } catch (e) {
    logger.warn("arricchisciAzienda failed", { error: String(e).slice(0, 200) });
    return null;
  }
}

// Cerca il condominio in COSMINA (impianti + clienti)
async function cercaCondominio(nome) {
  if (!nome) return null;
  const q = String(nome).toLowerCase().trim();
  const cosm = getCosminaDb();

  const out = {
    nome: nome,
    indirizzo: null,
    amministratore: null,
    impianti: [],
    _matched: false,
  };

  try {
    const clientiSnap = await cosm.collection("crm_clienti").limit(800).get();
    clientiSnap.forEach(d => {
      const v = d.data() || {};
      const bag = `${v.nome || ""} ${v.ragione_sociale || ""} ${v.denominazione || ""} ${v.indirizzo || ""}`.toLowerCase();
      if (bag.includes(q) && !out._matched) {
        out._matched = true;
        out.nome = v.nome || v.ragione_sociale || v.denominazione || nome;
        out.indirizzo = v.indirizzo || v.via || null;
        out.cap = v.cap || null;
        out.citta = v.citta || v.comune || null;
        out.amministratore = v.amministratore || v.ammin || null;
        out._clienteId = d.id;
      }
    });
  } catch (e) {
    logger.warn("cercaCondominio: crm_clienti failed", { error: String(e).slice(0, 150) });
  }

  try {
    const impSnap = await cosm.collection("cosmina_impianti").limit(600).get();
    impSnap.forEach(d => {
      const v = d.data() || {};
      const bag = `${v.condominio || ""} ${v.nome || ""} ${v.cliente || ""} ${v.indirizzo || ""}`.toLowerCase();
      if (bag.includes(q)) {
        out._matched = true;
        out.impianti.push({
          id: d.id,
          tipo: v.tipo || v.tipologia || "?",
          marca: v.marca || null,
          modello: v.modello || null,
          potenza: v.potenza || v.potenza_kw || null,
          matricola: v.matricola || v.targa || null,
        });
        if (!out.indirizzo && v.indirizzo) out.indirizzo = v.indirizzo;
      }
    });
  } catch (e) {
    logger.warn("cercaCondominio: cosmina_impianti failed", { error: String(e).slice(0, 150) });
  }

  // Limita a 5 impianti per non esplodere il prompt
  out.impianti = out.impianti.slice(0, 5);
  return out;
}

// CALLIOPE: genera preventivo JSON strutturato con Claude Sonnet
async function generaPreventivoJson(apiKey, intestatario, condominio, oggetto) {
  if (!apiKey) throw new Error("no_anthropic_key");

  // Numero progressivo
  const now = new Date();
  const year = now.getFullYear();
  const numeroProgressivo = `PREV-${year}-${String(Date.now()).slice(-6)}`;
  const dataDoc = now.toISOString().slice(0, 10);

  const system = `Sei CALLIOPE, l'assistente preventivi di Alberto Contardi (ACG Clima Service S.R.L., manutenzione HVAC, Piemonte).
Genera un preventivo professionale in italiano.

Rispondi SOLO con JSON valido (niente code fence, niente testo extra):

{
  "intestatario": {
    "ragione_sociale": "...",
    "piva": "...",
    "indirizzo": "...",
    "cap": "...",
    "citta": "...",
    "provincia": "...",
    "pec": "...",
    "codice_sdi": "..."
  },
  "numero": "<numero progressivo>",
  "data": "YYYY-MM-DD",
  "oggetto": "<titolo preventivo, es: 'Verifica impianto di riscaldamento - Condominio De Amicis'>",
  "luogo_esecuzione": {
    "descrizione": "<es: 'Condominio De Amicis'>",
    "indirizzo": "<se disponibile>"
  },
  "impianti_oggetto": [
    { "tipo": "...", "marca": "...", "modello": "...", "potenza": "..." }
  ],
  "voci": [
    { "descrizione": "...", "quantita": 1, "unita": "cadauno|h|mq", "prezzo_unitario": 120.00, "totale": 120.00 }
  ],
  "totale_imponibile": 0.00,
  "iva_percentuale": 22,
  "iva_importo": 0.00,
  "totale": 0.00,
  "condizioni_pagamento": "Bonifico bancario 30gg data fattura",
  "validita": "30 giorni dalla data di emissione",
  "note": "<eventuali note, max 2 righe>",
  "firma": {
    "nome": "Alberto Contardi",
    "qualifica": "Amministratore",
    "azienda": "ACG Clima Service S.R.L."
  }
}

REGOLE:
- Voci di lavoro REALISTICHE per il settore (sopralluogo, verifica combustione, relazione tecnica, ecc.)
- Prezzi in EUR, 2 decimali
- Se non hai dati certi sull'intestatario, usa quello fornito + "—" sui campi mancanti
- Calcola esattamente totale_imponibile, iva_importo, totale
- Voci sensate per una verifica impianto riscaldamento (3-6 voci tipicamente)`;

  const intest = intestatario || {};
  const user = [
    `=== DATI PER IL PREVENTIVO ===`,
    `Numero da usare: ${numeroProgressivo}`,
    `Data: ${dataDoc}`,
    `Oggetto: ${oggetto}`,
    ``,
    `=== INTESTATARIO ===`,
    `Ragione sociale: ${intest.ragione_sociale || intest.nome || "—"}`,
    intest.piva ? `P.IVA: ${intest.piva}` : "",
    intest.sede_legale?.indirizzo ? `Indirizzo: ${intest.sede_legale.indirizzo}` : "",
    intest.sede_legale?.cap ? `CAP: ${intest.sede_legale.cap}` : "",
    intest.sede_legale?.citta ? `Città: ${intest.sede_legale.citta}` : "",
    intest.sede_legale?.provincia ? `Provincia: ${intest.sede_legale.provincia}` : "",
    intest.pec ? `PEC: ${intest.pec}` : "",
    intest.codice_sdi ? `SDI: ${intest.codice_sdi}` : "",
    ``,
    `=== LUOGO ESECUZIONE ===`,
    `Condominio: ${condominio?.nome || "—"}`,
    condominio?.indirizzo ? `Indirizzo: ${condominio.indirizzo}${condominio.citta ? ", " + condominio.citta : ""}` : "",
    ``,
    condominio?.impianti?.length ? `=== IMPIANTI (dal CRM) ===\n${condominio.impianti.map(i => `- ${i.tipo || "?"} ${i.marca || ""} ${i.modello || ""} ${i.potenza ? "(" + i.potenza + " kW)" : ""}`).join("\n")}` : "",
    ``,
    `Genera il preventivo JSON completo e coerente.`,
  ].filter(Boolean).join("\n");

  const resp = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CALLIOPE_MODEL,
      max_tokens: 2500,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Sonnet ${resp.status}: ${t.slice(0, 300)}`);
  }
  const json = await resp.json();
  const text = (json.content || []).filter(b => b.type === "text").map(b => b.text).join("").trim();
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s < 0 || e <= s) throw new Error("preventivo_parse_failed");
  const parsed = JSON.parse(text.slice(s, e + 1));
  parsed._usage = json.usage || {};
  parsed._numeroProgressivo = numeroProgressivo;
  parsed._dataDoc = dataDoc;
  return parsed;
}

// Numero preventivo naturale per la voce (es: "PREV-2026-770620" → "770")
function numeroNaturale(numero) {
  const m = /(\d+)$/.exec(String(numero || ""));
  return m ? m[1].slice(-3) : String(numero || "").slice(-4);
}

// Formatta il preventivo in modo conversazionale — suona bene letto ad alta voce.
function formatPreventivoChat(prev) {
  const int = prev.intestatario || {};
  const luogo = prev.luogo_esecuzione || {};
  const voci = Array.isArray(prev.voci) ? prev.voci : [];
  const tot = typeof prev.totale === "number" ? prev.totale.toFixed(2) : (prev.totale || "?");
  const imp = typeof prev.totale_imponibile === "number" ? prev.totale_imponibile.toFixed(2) : null;
  const ivaP = prev.iva_percentuale || 22;
  const numBreve = numeroNaturale(prev.numero);

  const parts = [];
  // Apertura: "Preventivo pronto. Intestato a 3i efficientamento per il De Amicis, viene €866 più IVA."
  const chi = int.ragione_sociale ? int.ragione_sociale.replace(/\s+(S\.r\.l\.|S\.p\.A\.|S\.n\.c\.|Società Benefit).*$/i, "").trim() : null;
  const dove = luogo.descrizione || luogo.indirizzo || null;

  const apertura = [`Preventivo pronto`];
  if (numBreve) apertura.push(`(numero ${numBreve})`);
  apertura.push(`.`);
  parts.push(apertura.join(" ").replace(/ \./, "."));

  // Descrizione contenuto
  const desc = [];
  if (chi) desc.push(`Intestato a ${chi}`);
  if (dove) desc.push(`per il ${dove.replace(/^condominio\s+/i, "")}`);
  if (desc.length) parts.push(`${desc.join(" ")}.`);

  // Totale — forma naturale
  if (imp) {
    parts.push(`Viene ${imp} euro più IVA ${ivaP}%, in totale ${tot} euro.`);
  } else {
    parts.push(`Totale ${tot} euro.`);
  }

  // Voci: brevemente
  if (voci.length) {
    const voceCount = voci.length;
    parts.push(`Ho messo ${voceCount} voci di lavoro standard per una verifica di questo tipo.`);
  }

  // Chiusura: chiedi azione
  parts.push(`Lo approvi e lo mando, oppure vuoi cambiare qualcosa?`);

  return parts.join(" ");
}

/**
 * Workflow end-to-end preventivo (sincrono, chiamato da NEXUS router).
 * Ritorna { content, data: { bozzaId, preventivoId, pendingApproval } }.
 */
export async function runPreventivoWorkflow({ userMessage, context = {}, userId, sessionId }) {
  const apiKey = ANTHROPIC_API_KEY.value();
  if (!apiKey) return { content: "Servizio CALLIOPE non disponibile (ANTHROPIC_API_KEY mancante)." };

  const steps = [];
  const input = parsePreventivoInput(userMessage, context);

  if (!input.committente && !input.condominio) {
    return {
      content: "Mi servono il condominio e il committente. Dimmi per esempio: prepara preventivo per De Amicis intestato a 3i efficientamento.",
    };
  }

  // Step 1: arricchimento azienda
  const t1 = Date.now();
  let intestatarioData = null;
  try {
    const enriched = await arricchisciAzienda(apiKey, input.committente, input.piva);
    if (enriched) {
      intestatarioData = enriched;
    } else {
      intestatarioData = {
        ragione_sociale: input.committente,
        piva: input.piva,
        confidenza: "low",
      };
    }
    steps.push({ step: 1, name: "arricchisci_azienda", ok: true, ms: Date.now() - t1, data: { fromCache: enriched?._fromCache, confidenza: intestatarioData.confidenza } });
  } catch (e) {
    steps.push({ step: 1, name: "arricchisci_azienda", ok: false, error: String(e).slice(0, 200) });
  }

  // Step 2: ricerca condominio CRM
  const t2 = Date.now();
  let condominioData = null;
  try {
    condominioData = await cercaCondominio(input.condominio);
    steps.push({ step: 2, name: "cerca_condominio_crm", ok: true, ms: Date.now() - t2, data: { matched: condominioData?._matched, impianti: condominioData?.impianti?.length || 0 } });
  } catch (e) {
    steps.push({ step: 2, name: "cerca_condominio_crm", ok: false, error: String(e).slice(0, 200) });
    condominioData = { nome: input.condominio };
  }

  // Step 3: NON generare voci con Sonnet. I prezzi li decide SOLO Alberto.
  // Salviamo lo stato "attesa_voci" in nexo_preventivi_pending. Al prossimo
  // messaggio dell'utente, tryInterceptPreventivoVoci parsa le voci e calcola
  // imponibile + IVA + totale.
  const t3 = Date.now();
  const ragioneSociale = intestatarioData?.ragione_sociale || input.committente || "—";
  const piva = intestatarioData?.piva || input.piva || "non disponibile";
  const indirizzoAzienda = intestatarioData?.sede_legale?.indirizzo
    || intestatarioData?.indirizzo
    || (intestatarioData?.sede_legale ? [intestatarioData.sede_legale.indirizzo, intestatarioData.sede_legale.citta].filter(Boolean).join(", ") : null)
    || "indirizzo non disponibile";
  const nomeCondominio = condominioData?.nome || condominioData?.codice || input.condominio;
  const indirizzoCondominio = [condominioData?.indirizzo, condominioData?.citta || condominioData?.comune]
    .filter(Boolean).join(", ") || "indirizzo non disponibile";

  let pendingId = null;
  try {
    const ref = db.collection("nexo_preventivi_pending").doc(sessionId || ("auto_" + Date.now()));
    pendingId = ref.id;
    await ref.set({
      id: ref.id,
      sessionId: sessionId || null,
      userId: userId || null,
      stato: "attesa_voci",
      intestatario: {
        ragione_sociale: ragioneSociale,
        piva,
        indirizzo: indirizzoAzienda,
        raw: intestatarioData,
      },
      condominio: {
        nome: nomeCondominio,
        indirizzo: indirizzoCondominio,
        raw: condominioData,
      },
      oggetto: input.oggetto || null,
      sourceEmailId: input.sourceEmailId || null,
      threadPartecipanti: context.threadPartecipanti || [],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    steps.push({ step: 3, name: "salva_pending", ok: true, ms: Date.now() - t3, data: { pendingId } });
  } catch (e) {
    steps.push({ step: 3, name: "salva_pending", ok: false, error: String(e).slice(0, 200) });
  }

  const lines = [
    `Ho i dati per il preventivo:`,
    `Intestatario ${ragioneSociale}, P.IVA ${piva}, ${indirizzoAzienda}.`,
    `Condominio ${nomeCondominio}, ${indirizzoCondominio}.`,
    ``,
    `Dimmi le voci e gli importi che vuoi inserire. Esempio: "sopralluogo 200, relazione tecnica 150, verifica impianto 300".`,
  ];

  return {
    content: lines.join("\n"),
    data: {
      pendingId,
      stato: "attesa_voci",
      intestatario: { ragione_sociale: ragioneSociale, piva, indirizzo: indirizzoAzienda },
      condominio: { nome: nomeCondominio, indirizzo: indirizzoCondominio },
      oggetto: input.oggetto || null,
      pendingPrev: {
        kind: "preventivo_voci",
        pendingId,
        destinatario: context.sourceEmailSender || null,
        cc: context.threadPartecipanti || [],
      },
      steps,
    },
    _preventivoReady: true,
  };
}

// ─── tryInterceptPreventivoVoci ────────────────────────────────
// Quando esiste un nexo_preventivi_pending in stato "attesa_voci" per la
// sessione corrente, parsa il messaggio dell'utente per estrarre voci e
// calcolare imponibile + IVA. Il messaggio atteso è del tipo:
//   "sopralluogo 200, relazione tecnica 150, verifica impianto 300"
//   "sopralluogo: 200\nrelazione tecnica: 150\nverifica impianto: 300"
// Importo: numero (con virgola decimale o punto) opzionalmente seguito
// da "€" o "euro".
export async function tryInterceptPreventivoVoci({ userMessage, sessionId, userId }) {
  if (!sessionId) return null;
  const t = String(userMessage || "").trim();
  if (!t) return null;
  // Quickcheck: deve contenere almeno una cifra
  if (!/\d/.test(t)) return null;

  // Cerca pending attesa_voci per questa sessione
  let pendingDoc, pendingData;
  try {
    pendingDoc = await db.collection("nexo_preventivi_pending").doc(sessionId).get();
    if (!pendingDoc.exists) return null;
    pendingData = pendingDoc.data() || {};
    if (pendingData.stato !== "attesa_voci") return null;
  } catch {
    return null;
  }

  const voci = parseVociPreventivo(t);
  const istruzioniExtra = extractIstruzioniExtra(t);
  if (!voci.length) {
    return {
      content: `Non ho trovato voci nel formato "descrizione importo". Esempio valido: "sopralluogo 200, relazione tecnica 150, verifica impianto 300".`,
      _preventivoVociFailed: true,
    };
  }

  const totaleImponibile = voci.reduce((s, v) => s + v.importo, 0);
  const ivaImporto = Math.round(totaleImponibile * 0.22 * 100) / 100;
  const totale = Math.round((totaleImponibile + ivaImporto) * 100) / 100;

  // Aggiorna stato pending → attesa_approvazione
  try {
    await pendingDoc.ref.set({
      voci,
      totale_imponibile: totaleImponibile,
      iva_importo: ivaImporto,
      totale,
      istruzioni_extra: istruzioniExtra,
      stato: "attesa_approvazione",
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch (e) {
    return { content: `Errore salvataggio voci: ${String(e).slice(0, 150)}`, _preventivoVociFailed: true };
  }

  const fmtEur = (n) => Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const elenco = voci.map((v, i) => `${i + 1}. ${v.descrizione}: ${fmtEur(v.importo)} €`).join("\n");
  const blocchi = [
    `Riepilogo preventivo per ${pendingData.condominio?.nome || "—"}:`,
    elenco,
    ``,
    `Imponibile ${fmtEur(totaleImponibile)} €, IVA 22% ${fmtEur(ivaImporto)} €, totale ${fmtEur(totale)} €.`,
  ];
  if (istruzioniExtra.length) {
    blocchi.push("");
    blocchi.push(`Istruzioni extra ricevute: ${istruzioniExtra.join("; ")}.`);
  }
  blocchi.push("");
  blocchi.push(`Lo genero in PDF? Rispondi "sì" per procedere, "modifica" per cambiare le voci, "annulla" per scartare.`);
  const content = blocchi.join("\n");

  return {
    content,
    data: {
      pendingId: sessionId,
      voci,
      totale_imponibile: totaleImponibile,
      iva_importo: ivaImporto,
      totale,
      istruzioni_extra: istruzioniExtra,
      pendingPrev: { kind: "preventivo_approvazione_voci", pendingId: sessionId },
    },
    _preventivoVociHandled: true,
  };
}

// Parser robusto delle voci: accetta separatori "," ";" newline.
// Ogni voce ha forma "descrizione importo".
// Accetta TUTTE queste varianti:
//   "sopralluogo 200"
//   "sopralluogo 200€"     "sopralluogo 200 €"
//   "sopralluogo 200€ + iva"   "sopralluogo 200 + iva"
//   "sopralluogo euro 200"     "sopralluogo €200"
//   "Verifica impianto di distribuzione riscaldamento 200€ + iva"
//   "1. sopralluogo: 200"
// L'IVA viene calcolata sempre al 22% — l'eventuale "+ iva" è solo
// conferma esplicita dell'utente, non cambia il calcolo.
export function parseVociPreventivo(text) {
  const out = [];
  if (!text) return out;
  // Split su virgola, punto-e-virgola o newline
  const items = String(text).split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);

  for (const raw of items) {
    // 1. Rimuovi prefissi numerici "1." / "1)"
    let s = raw.replace(/^\d+\s*[\.\)]\s*/, "");
    // 2. Rimuovi suffissi "+ iva" / "+iva" / "+ IVA" / "iva inclusa" / "iva esclusa"
    s = s.replace(/\s*\+?\s*iva\s+(?:inclus|esclus)\w*/gi, "");
    s = s.replace(/\s*\+\s*iva\b/gi, "");
    s = s.replace(/\s*\biva\s+(?:inclus|esclus)\w*/gi, "");
    // 3. Normalizza simboli euro: "€" / "EUR" / "euro" → marcatore unico " ¤ "
    //    (evita che "euro" prima del numero confonda il regex)
    s = s.replace(/\s*€\s*/g, " ¤ ").replace(/\b(?:eur|euro)\b/gi, " ¤ ");
    s = s.replace(/\s+/g, " ").trim();
    if (!s) continue;
    // 4. Estrai numero (descrizione + importo). L'importo è l'ULTIMO numero
    //    della stringa, eventualmente preceduto/seguito da "¤".
    //    Pattern: <descrizione non vuota> [¤?] <numero> [¤?]
    const m = s.match(/^(.+?)\s*[\¤]?\s*([\d]+(?:[.,]\d{1,2})?)\s*[\¤]?\s*$/);
    if (!m) continue;
    let desc = m[1].trim();
    // Pulizia descrizione: togli ":" ":", trattini, "¤" residui, spazi multipli
    desc = desc.replace(/[\¤:]/g, " ").replace(/\s*[\-—–]\s*$/, "").replace(/\s+/g, " ").trim();
    if (!desc) continue;
    const importo = Number(m[2].replace(",", "."));
    if (!Number.isFinite(importo) || importo <= 0) continue;
    out.push({ descrizione: desc, importo: Math.round(importo * 100) / 100 });
  }
  return out;
}

// ─── tryInterceptPreventivoIva ─────────────────────────────────
// Quando il preventivo pending è in stato "attesa_approvazione" e l'utente
// scrive un'indicazione su IVA (regime/aliquota), ricalcoliamo IVA + totale
// e aggiorniamo il pending. Esempi accettati:
//   "iva 0 reverse charge" / "iva 0" / "senza iva" / "esente iva"
//   "iva 10" / "iva 10%" / "iva 4" / "iva 22"
//   "reverse charge" / "inversione contabile" → 0% + nota art.17 c.6 DPR 633/72
//   "split payment" → 22% + nota art.17-ter DPR 633/72
// L'imponibile NON cambia: cambiano solo aliquota e totale.
//
// Restituisce {content, data, _preventivoIvaHandled:true} se ha intercettato,
// null altrimenti (così il chiamante prosegue con tryInterceptPreventivoApproval).
export function parseRegimeIva(text) {
  const t = String(text || "").toLowerCase();
  if (!t) return null;

  // Pattern triggers
  const hasIvaKeyword = /\biva\b/.test(t);
  const hasReverse = /\b(reverse\s*charge|inversione\s+contabile|inversion\s+contabil)\b/.test(t);
  const hasSplit = /\b(split\s*payment|split-payment)\b/.test(t);
  const hasEsente = /\besent\w+/.test(t);
  const hasSenzaIva = /\bsenza\s+iva\b/.test(t);

  if (!hasIvaKeyword && !hasReverse && !hasSplit && !hasEsente) return null;

  // Reverse charge: aliquota 0 + nota
  if (hasReverse) {
    return {
      aliquota: 0,
      nota: "Operazione soggetta a reverse charge ex art. 17 c.6 DPR 633/72.",
      regime: "reverse_charge",
    };
  }
  // Split payment: aliquota 22 (esposta) + nota
  if (hasSplit) {
    return {
      aliquota: 22,
      nota: "Operazione soggetta a split payment ex art. 17-ter DPR 633/72.",
      regime: "split_payment",
      splitPayment: true,
    };
  }
  // Esente / senza iva → 0% senza nota reverse
  if (hasEsente || hasSenzaIva) {
    return { aliquota: 0, nota: null, regime: "esente" };
  }
  // Pattern "iva N" o "iva N%" — N numero esplicito
  const m = t.match(/\biva\s*(?:al\s+)?(\d{1,2})\s*%?/);
  if (m) {
    const a = Number(m[1]);
    if (Number.isFinite(a) && a >= 0 && a <= 30) {
      return { aliquota: a, nota: null, regime: a === 0 ? "esente" : "ordinario" };
    }
  }
  return null;
}

export async function tryInterceptPreventivoIva({ userMessage, sessionId, userId }) {
  if (!sessionId) return null;
  const t = String(userMessage || "").trim();
  if (!t) return null;

  // Quickcheck: deve contenere parole-chiave IVA/regime
  if (!/\b(iva|reverse|split|esent|senza\s+iva)\b/i.test(t)) return null;

  let pendingDoc, pendingData;
  try {
    pendingDoc = await db.collection("nexo_preventivi_pending").doc(sessionId).get();
    if (!pendingDoc.exists) return null;
    pendingData = pendingDoc.data() || {};
    // Accettiamo l'IVA SIA in attesa_approvazione (caso normale dopo voci)
    // SIA in attesa_voci (se l'utente lo dice insieme alle voci, es.
    // "verifica 200, iva 0 reverse charge").
    if (pendingData.stato !== "attesa_approvazione" && pendingData.stato !== "attesa_voci") return null;
  } catch {
    return null;
  }

  const regime = parseRegimeIva(t);
  if (!regime) return null;

  // Se siamo ancora in attesa_voci e non c'è imponibile salvato, non possiamo
  // ricalcolare — segnaliamo all'utente di mandare prima le voci.
  const totaleImponibile = Number(pendingData.totale_imponibile);
  if (!Number.isFinite(totaleImponibile) || totaleImponibile <= 0) {
    return {
      content: `Ho capito il regime ${regime.regime}, ma prima dimmi le voci con gli importi (es. "verifica impianto 200").`,
      _preventivoIvaHandled: true,
    };
  }

  const aliquota = regime.aliquota;
  const ivaImporto = Math.round(totaleImponibile * (aliquota / 100) * 100) / 100;
  const totale = Math.round((totaleImponibile + ivaImporto) * 100) / 100;

  try {
    await pendingDoc.ref.set({
      iva_aliquota: aliquota,
      iva_importo: ivaImporto,
      iva_regime: regime.regime,
      iva_nota: regime.nota || null,
      iva_split_payment: !!regime.splitPayment,
      totale,
      stato: "attesa_approvazione",
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch (e) {
    return { content: `Errore aggiornamento IVA: ${String(e).slice(0, 150)}`, _preventivoIvaHandled: true };
  }

  const fmtEur = (n) => Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const voci = Array.isArray(pendingData.voci) ? pendingData.voci : [];
  const elenco = voci.map((v, i) => `${i + 1}. ${v.descrizione}: ${fmtEur(v.importo)} €`).join("\n");

  // Etichetta IVA in una frase
  let ivaLabel;
  if (regime.regime === "reverse_charge") ivaLabel = `IVA 0% (reverse charge)`;
  else if (regime.regime === "split_payment") ivaLabel = `IVA ${aliquota}% (split payment, non incassata)`;
  else if (aliquota === 0) ivaLabel = `IVA 0% (esente)`;
  else ivaLabel = `IVA ${aliquota}% ${fmtEur(ivaImporto)} €`;

  // Per reverse charge il "totale fattura" è imponibile (l'IVA la versa il cessionario).
  // Per split payment il committente paga solo l'imponibile, l'IVA va all'erario.
  const blocchi = [
    `Riepilogo aggiornato per ${pendingData.condominio?.nome || "—"}:`,
    elenco,
    ``,
    `Imponibile ${fmtEur(totaleImponibile)} €, ${ivaLabel}, totale ${fmtEur(totale)} €.`,
  ];
  if (regime.nota) {
    blocchi.push("");
    blocchi.push(`Nota fiscale: ${regime.nota}`);
  }
  blocchi.push("");
  blocchi.push(`Lo genero in PDF? Rispondi "sì" per procedere, "modifica" per cambiare le voci, "annulla" per scartare.`);

  return {
    content: blocchi.join("\n"),
    data: {
      pendingId: sessionId,
      iva_aliquota: aliquota,
      iva_importo: ivaImporto,
      iva_regime: regime.regime,
      iva_nota: regime.nota,
      iva_split_payment: !!regime.splitPayment,
      totale_imponibile: totaleImponibile,
      totale,
    },
    _preventivoIvaHandled: true,
  };
}

// Estrae le istruzioni extra (testo senza numeri) dal messaggio voci.
// Esempio: "sopralluogo 200, mandami via mail, mettilo su doc" →
//   voci=["sopralluogo 200"], istruzioni=["mandami via mail","mettilo su doc"]
export function extractIstruzioniExtra(text) {
  if (!text) return [];
  const items = String(text).split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
  const out = [];
  for (const raw of items) {
    // Skip se ha un numero che potrebbe essere un importo
    if (/\d/.test(raw)) continue;
    // Skip se è troppo corto per essere un'istruzione
    if (raw.length < 4) continue;
    out.push(raw);
  }
  return out;
}

/**
 * Intercepta "approva"/"modifica"/"rifiuta" dopo un preventivo pendingApproval.
 */
/**
 * Handler NEXUS chat: "bozze pendenti" / "cosa c'è da approvare".
 * Lista bozze preventivo in stato da_approvare con preview, e se c'è una
 * bozza sola la mostra direttamente con i bottoni approva/modifica/rifiuta.
 */
export async function handleBozzePendenti() {
  const snap = await db.collection("calliope_bozze")
    .where("tipo", "==", "preventivo")
    .where("status", "==", "da_approvare")
    .limit(10)
    .get();
  if (snap.empty) {
    return { content: "Non hai preventivi in attesa. Tutto a posto." };
  }

  const bozze = [];
  snap.forEach(d => {
    const v = d.data() || {};
    bozze.push({
      id: d.id,
      preventivo: v.preventivo,
      intestatario: v.intestatario,
      condominio: v.condominio,
      createdAt: v.createdAt,
    });
  });

  // Sort by createdAt desc in memoria
  bozze.sort((a, b) => {
    const ta = a.createdAt?.toMillis?.() || 0;
    const tb = b.createdAt?.toMillis?.() || 0;
    return tb - ta;
  });

  // Se 1 sola bozza: mostra direttamente con pendingApproval
  if (bozze.length === 1) {
    const b = bozze[0];
    const content = formatPreventivoChat(b.preventivo);
    return {
      content: `Hai un preventivo in attesa. ${content}`,
      data: {
        bozzaId: b.id,
        preventivo: b.preventivo,
        pendingApproval: {
          kind: "preventivo_approvazione",
          bozzaId: b.id,
          destinatario: null,
          cc: [],
        },
      },
    };
  }

  // Lista compatta — tono discorsivo
  const parts = [`Hai ${bozze.length} preventivi in attesa.`];
  const elenco = bozze.slice(0, 5).map((b, i) => {
    const p = b.preventivo || {};
    const intest = ((b.intestatario || p.intestatario || {}).ragione_sociale || "?")
      .replace(/\s+(S\.r\.l\.|S\.p\.A\.|S\.n\.c\.|Società Benefit).*$/i, "").trim();
    const cond = ((b.condominio || {}).nome || "").replace(/^condominio\s+/i, "");
    const tot = typeof p.totale === "number" ? `${p.totale.toFixed(0)} euro` : "";
    const bits = [intest, cond && `per ${cond}`, tot].filter(Boolean).join(" ");
    return `${i + 1}. ${bits}`;
  }).join("\n");
  parts.push(elenco);
  if (bozze.length > 5) parts.push(`E altri ${bozze.length - 5} più indietro.`);
  parts.push(`Dimmi il numero, oppure "mostra il primo" per aprirlo.`);
  return {
    content: parts.join("\n\n"),
    data: { bozze: bozze.map(b => ({ id: b.id, numero: b.preventivo?.numero, totale: b.preventivo?.totale })) },
  };
}

/**
 * Handler: "apri preventivo <numero>" o "mostra il primo" dopo una lista
 */
export async function handleApriBozza(parametri, ctx) {
  const msg = String(ctx?.userMessage || "").toLowerCase();
  const numM = /(?:apri|mostra|vedi).*(?:preventivo\s+)?([a-z0-9-]{6,})/i.exec(msg);
  const numero = numM ? numM[1] : null;
  const isFirst = /\b(primo|prima|il\s+primo)\b/i.test(msg);

  let snap;
  if (numero) {
    snap = await db.collection("calliope_bozze")
      .where("tipo", "==", "preventivo")
      .where("status", "==", "da_approvare")
      .limit(20)
      .get();
  } else if (isFirst) {
    snap = await db.collection("calliope_bozze")
      .where("tipo", "==", "preventivo")
      .where("status", "==", "da_approvare")
      .limit(1)
      .get();
  } else {
    return null;
  }

  let target = null;
  snap.forEach(d => {
    if (target) return;
    const v = d.data();
    if (numero) {
      const n = (v.preventivo || {}).numero || "";
      if (n.toLowerCase().includes(numero.toLowerCase()) || d.id.includes(numero)) {
        target = { id: d.id, data: v };
      }
    } else {
      target = { id: d.id, data: v };
    }
  });

  if (!target) return null;

  const content = formatPreventivoChat(target.data.preventivo);
  return {
    content,
    data: {
      bozzaId: target.id,
      preventivo: target.data.preventivo,
      pendingApproval: {
        kind: "preventivo_approvazione",
        bozzaId: target.id,
        destinatario: null,
        cc: [],
      },
    },
  };
}

export async function tryInterceptPreventivoApproval({ userMessage, sessionId, userId }) {
  const t = String(userMessage || "").trim();
  if (!t) return null;

  // Parola-chiave quickcheck: evita query Firestore se non è una risposta
  // plausibile di approvazione/modifica/rifiuto
  if (!/^\s*(approv|ok|manda|invia|va\s+bene|procedi|rifiut|scart|annull|modific)/i.test(t)) {
    return null;
  }

  // Trova pendingApproval dall'ultimo messaggio assistant della sessione.
  // Uso orderBy(createdAt desc) senza where sessionId per evitare compound index;
  // filtro in memoria.
  let pending = null;
  let scanCount = 0;
  try {
    const snap = await db.collection("nexus_chat")
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();
    snap.forEach(d => {
      if (pending) return;
      scanCount++;
      const v = d.data() || {};
      if (v.sessionId !== sessionId) return;
      if (v.role !== "assistant") return;
      const pa = v.direct?.data?.pendingApproval;
      if (pa && pa.kind === "preventivo_approvazione") pending = pa;
    });
  } catch (e) {
    logger.warn("preventivo intercept: query failed", { error: String(e).slice(0, 200) });
    return null;
  }
  if (!pending || !pending.bozzaId) {
    logger.info("preventivo intercept: no pending found", { sessionId, scanCount });
    return null;
  }
  logger.info("preventivo intercept: pending found", { sessionId, bozzaId: pending.bozzaId });

  const bozzaRef = db.collection("calliope_bozze").doc(pending.bozzaId);

  if (/^\s*(approv|ok|manda|invia|invia.*pure|va\s+bene|procedi)\b/i.test(t)) {
    try {
      await bozzaRef.set({ status: "approvato", approvedAt: FieldValue.serverTimestamp() }, { merge: true });
    } catch (e) { logger.warn("preventivo approve: bozza set failed", { error: String(e).slice(0, 200) }); }
    // Accoda send_email su Lavagna (ECHO lo processerà quando disponibile)
    try {
      await db.collection("nexo_lavagna").add({
        from: "nexus", to: "echo", type: "send_preventivo",
        payload: {
          bozzaId: pending.bozzaId,
          destinatario: pending.destinatario,
          cc: pending.cc || [],
        },
        status: "pending", priority: "normal",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } catch (e) { logger.warn("preventivo approve: lavagna add failed", { error: String(e).slice(0, 200) }); }
    // Aggiorna charta_preventivi
    try {
      const q = await db.collection("charta_preventivi").where("bozzaId", "==", pending.bozzaId).limit(1).get();
      q.forEach(d => d.ref.set({ stato: "inviato", inviatoAt: FieldValue.serverTimestamp() }, { merge: true }));
    } catch (e) { logger.warn("preventivo approve: charta update failed", { error: String(e).slice(0, 200) }); }
    const dest = pending.destinatario || null;
    logger.info("preventivo approve: returning handled response", { bozzaId: pending.bozzaId });
    const msg = dest
      ? `Approvato. Lo mando a ${dest} appena ECHO è attivo, per ora è in coda.`
      : `Approvato. Appena ho il destinatario lo mando.`;
    return {
      content: msg,
      data: { approved: true, bozzaId: pending.bozzaId },
      _preventivoHandled: true,
    };
  }

  if (/^\s*(rifiut|scart|annull|no\s+grazie|lascia\s+perder)/i.test(t)) {
    await bozzaRef.set({ status: "rifiutato", rejectedAt: FieldValue.serverTimestamp() }, { merge: true });
    try {
      const q = await db.collection("charta_preventivi").where("bozzaId", "==", pending.bozzaId).limit(1).get();
      q.forEach(d => d.ref.set({ stato: "rifiutato", rifiutatoAt: FieldValue.serverTimestamp() }, { merge: true }));
    } catch {}
    return {
      content: `Ok, lo scarto. Se serve ne preparo un altro quando vuoi.`,
      data: { rejected: true, bozzaId: pending.bozzaId },
      _preventivoHandled: true,
    };
  }

  const modM = /^\s*modific\w*\s*[:,-]?\s*(.+)$/i.exec(t);
  if (modM) {
    const istruzioni = modM[1].trim();
    // Rigenera usando le istruzioni
    const apiKey = ANTHROPIC_API_KEY.value();
    try {
      const bozzaSnap = await bozzaRef.get();
      if (!bozzaSnap.exists) return { content: "Bozza non trovata.", _preventivoHandled: true };
      const bozza = bozzaSnap.data();
      const intest = bozza.intestatario || {};
      const cond = bozza.condominio || {};

      // Haiku: applica le modifiche al JSON esistente
      const updateSystem = `Sei CALLIOPE. Ti viene dato un preventivo JSON e le istruzioni di modifica di Alberto.
Applica le modifiche e restituisci il NUOVO JSON completo (stesso schema).
SOLO JSON valido, niente testo extra.`;
      const updateUser = [
        `=== PREVENTIVO ATTUALE ===`,
        JSON.stringify(bozza.preventivo, null, 2),
        ``,
        `=== ISTRUZIONI DI MODIFICA ===`,
        istruzioni,
        ``,
        `Applica le modifiche e ritorna il JSON aggiornato.`,
      ].join("\n");
      const resp = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: CALLIOPE_MODEL, max_tokens: 2500, system: updateSystem, messages: [{ role: "user", content: updateUser }] }),
      });
      if (!resp.ok) throw new Error(`Sonnet ${resp.status}`);
      const jj = await resp.json();
      const text = (jj.content || []).filter(b => b.type === "text").map(b => b.text).join("").trim();
      const s = text.indexOf("{"), e = text.lastIndexOf("}");
      if (s < 0 || e <= s) throw new Error("parse_failed");
      const newPrev = JSON.parse(text.slice(s, e + 1));
      await bozzaRef.set({
        preventivo: newPrev,
        modificaIstruzioni: istruzioni,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return {
        content: formatPreventivoChat(newPrev),
        data: {
          bozzaId: pending.bozzaId,
          preventivo: newPrev,
          pendingApproval: { ...pending, modified: true },
        },
        _preventivoHandled: true,
      };
    } catch (e) {
      return { content: `Errore modifica: ${String(e).slice(0, 200)}`, _preventivoHandled: true };
    }
  }

  return null; // non è una conferma preventivo, lascia passare
}
