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

  const intestM = /\b(?:intestato\s+a|committente|per\s+conto\s+di|intestazione)\s+([a-zà-ÿ0-9][\wà-ÿ.&'\s]{2,60}?)(?=\s+(?:con\s+p\.?iva|p\.?iva|oggetto|$))/i.exec(userMessage);
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

  // Check cache esistente
  if (piva) {
    try {
      const cached = await db.collection("memo_aziende").doc(`piva_${piva}`).get();
      if (cached.exists) return { ...cached.data(), _fromCache: true };
    } catch {}
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

// Formatta JSON preventivo per la chat
function formatPreventivoChat(prev) {
  const lines = [];
  lines.push(`📄 **Preventivo ${prev.numero || "—"}** — ${prev.data || ""}`);
  lines.push("");
  lines.push(`**Intestatario**:`);
  const int = prev.intestatario || {};
  lines.push(`  ${int.ragione_sociale || "—"}`);
  if (int.piva) lines.push(`  P.IVA ${int.piva}`);
  if (int.indirizzo || int.citta) lines.push(`  ${[int.indirizzo, int.cap, int.citta, int.provincia].filter(Boolean).join(", ")}`);
  if (int.pec) lines.push(`  PEC: ${int.pec}`);
  if (int.codice_sdi) lines.push(`  SDI: ${int.codice_sdi}`);
  lines.push("");
  lines.push(`**Oggetto**: ${prev.oggetto || "—"}`);
  if (prev.luogo_esecuzione) {
    const l = prev.luogo_esecuzione;
    lines.push(`**Luogo**: ${l.descrizione || "—"}${l.indirizzo ? ` (${l.indirizzo})` : ""}`);
  }
  lines.push("");
  if (Array.isArray(prev.voci) && prev.voci.length) {
    lines.push(`**Voci**:`);
    prev.voci.forEach((v, i) => {
      const qtaUnita = `${v.quantita || 1}${v.unita ? " " + v.unita : ""}`;
      const prezzo = typeof v.prezzo_unitario === "number" ? v.prezzo_unitario.toFixed(2) : v.prezzo_unitario;
      const tot = typeof v.totale === "number" ? v.totale.toFixed(2) : v.totale;
      lines.push(`  ${i + 1}. ${v.descrizione} — ${qtaUnita} × €${prezzo} = €${tot}`);
    });
    lines.push("");
  }
  if (typeof prev.totale_imponibile === "number") {
    lines.push(`**Imponibile**: €${prev.totale_imponibile.toFixed(2)}`);
    if (typeof prev.iva_importo === "number") lines.push(`**IVA ${prev.iva_percentuale || 22}%**: €${prev.iva_importo.toFixed(2)}`);
    if (typeof prev.totale === "number") lines.push(`**TOTALE**: €${prev.totale.toFixed(2)}`);
  }
  lines.push("");
  if (prev.condizioni_pagamento) lines.push(`_Pagamento: ${prev.condizioni_pagamento}_`);
  if (prev.validita) lines.push(`_Validità: ${prev.validita}_`);
  lines.push("");
  lines.push(`---`);
  lines.push(`✅ Rispondi **"approva"** per inviare · ✏️ **"modifica: [istruzioni]"** per correzioni · ❌ **"rifiuta"** per scartare`);
  return lines.join("\n");
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
      content: "Per preparare il preventivo mi servono almeno il condominio e il committente.\n\nEsempio: *'prepara preventivo per De Amicis intestato a 3i efficientamento con P.IVA 02486680065 per verifica riscaldamento'*",
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

  // Step 3: CALLIOPE genera preventivo JSON
  const t3 = Date.now();
  let preventivo = null;
  try {
    preventivo = await generaPreventivoJson(apiKey, intestatarioData, condominioData, input.oggetto);
    steps.push({ step: 3, name: "calliope_preventivo_json", ok: true, ms: Date.now() - t3, data: { numero: preventivo.numero, totale: preventivo.totale } });
  } catch (e) {
    steps.push({ step: 3, name: "calliope_preventivo_json", ok: false, error: String(e).slice(0, 200) });
    return { content: `Errore generazione preventivo: ${String(e).slice(0, 200)}` };
  }

  // Step 4: salva in calliope_bozze + charta_preventivi
  const t4 = Date.now();
  let bozzaId = null;
  try {
    const bozzaRef = db.collection("calliope_bozze").doc();
    bozzaId = bozzaRef.id;
    await bozzaRef.set({
      id: bozzaId,
      tipo: "preventivo",
      preventivo, // full JSON
      intestatario: intestatarioData,
      condominio: condominioData,
      sourceEmailId: input.sourceEmailId,
      sessionId: sessionId || null,
      userId: userId || null,
      status: "da_approvare",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const prevRef = db.collection("charta_preventivi").doc();
    await prevRef.set({
      id: prevRef.id,
      numero: preventivo.numero,
      data: preventivo.data,
      intestatario: intestatarioData,
      oggetto: preventivo.oggetto,
      importo_imponibile: preventivo.totale_imponibile || 0,
      importo_totale: preventivo.totale || 0,
      stato: "da_approvare",
      bozzaId,
      sourceEmailId: input.sourceEmailId,
      createdAt: FieldValue.serverTimestamp(),
    });

    steps.push({ step: 4, name: "salva_bozza", ok: true, ms: Date.now() - t4, data: { bozzaId } });
  } catch (e) {
    steps.push({ step: 4, name: "salva_bozza", ok: false, error: String(e).slice(0, 200) });
  }

  // Step 5: formatta risposta chat
  const content = formatPreventivoChat(preventivo);

  return {
    content,
    data: {
      bozzaId,
      preventivo,
      pendingApproval: {
        kind: "preventivo_approvazione",
        bozzaId,
        destinatario: context.sourceEmailSender || null,
        cc: context.threadPartecipanti || [],
      },
      steps,
    },
    _preventivoReady: true,
  };
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
    return { content: "Nessun preventivo in attesa di approvazione. Tutto a posto." };
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
      content: `📬 Un preventivo in attesa di approvazione:\n\n${content}`,
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

  // Lista compatta
  const lines = [];
  lines.push(`📬 **${bozze.length} preventivi in attesa di approvazione**`);
  lines.push("");
  bozze.forEach((b, i) => {
    const p = b.preventivo || {};
    const intest = (b.intestatario || p.intestatario || {}).ragione_sociale || "?";
    const cond = (b.condominio || {}).nome || "?";
    const tot = typeof p.totale === "number" ? `€${p.totale.toFixed(2)}` : "—";
    lines.push(`${i + 1}. **${p.numero || b.id.slice(-6)}** — ${cond} / ${intest} (${tot})`);
  });
  lines.push("");
  lines.push(`Dimmi "mostra il primo" oppure "apri preventivo <numero>" per approvarlo.`);
  return {
    content: lines.join("\n"),
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
    const dest = pending.destinatario || "(destinatario da verificare)";
    logger.info("preventivo approve: returning handled response", { bozzaId: pending.bozzaId });
    return {
      content: `✅ Preventivo approvato e messo in coda per invio.\n\nDestinatario: ${dest}\nBozza: \`${pending.bozzaId}\`\n\nECHO invierà l'email non appena attivo. Per ora resta in coda \`nexo_lavagna\`.`,
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
      content: `❌ Preventivo scartato. Bozza \`${pending.bozzaId}\` marcata come rifiutata.`,
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
