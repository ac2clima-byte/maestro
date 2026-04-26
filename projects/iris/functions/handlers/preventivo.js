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

  // Check pending pre-esistente: se per questa sessione c'è già un preventivo
  // ATTIVO (attesa_voci / attesa_approvazione) NON sovrascriviamo. Chiediamo
  // ad Alberto se continuare o ricominciare. Se l'utente esplicita "ricomincia"
  // / "rifai" / "nuovo" nel messaggio, procediamo a creare un nuovo pending
  // (cancelliamo quello vecchio cosi il doc id sessionId resta unico).
  const wantsRestart = /\b(ricominc\w+|rifai|rifare|nuovo\s+preventiv|cancella\s+preventiv|reset|riparti(?:amo)?)\b/i.test(userMessage);
  if (sessionId) {
    try {
      const existing = await db.collection("nexo_preventivi_pending").doc(sessionId).get();
      if (existing.exists) {
        const ex = existing.data() || {};
        const stato = ex.stato;
        const isActive = stato === "attesa_voci" || stato === "attesa_approvazione";
        if (isActive) {
          if (wantsRestart) {
            // Cancella pending esistente: il workflow continuerà sotto creando uno nuovo
            try { await existing.ref.delete(); } catch {}
          } else {
            // Pending attivo, l'utente non ha chiesto restart → chiedi cosa fare
            const fmtEur = (n) => Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const condNome = ex.condominio?.nome || "—";
            const intestNome = ex.intestatario?.ragione_sociale || "—";
            const voci = Array.isArray(ex.voci) ? ex.voci : [];
            const lines = [
              `Hai già un preventivo in corso per ${condNome} intestato a ${intestNome} (stato: ${stato === "attesa_voci" ? "in attesa delle voci" : "in attesa di approvazione"}).`,
            ];
            if (voci.length) {
              lines.push("");
              lines.push(`Voci attuali:`);
              voci.forEach((v, i) => lines.push(`${i + 1}. ${v.descrizione}: ${fmtEur(v.importo)} €`));
              if (ex.totale != null) {
                const aliquota = ex.iva_aliquota != null ? ex.iva_aliquota : 22;
                const ivaLbl = ex.iva_regime === "reverse_charge" ? "IVA 0% (reverse charge)" : `IVA ${aliquota}%`;
                lines.push(`Totale ${fmtEur(ex.totale_imponibile || 0)} € + ${ivaLbl} = ${fmtEur(ex.totale)} €.`);
              }
            }
            lines.push("");
            lines.push(`Vuoi continuare da dove eravamo (dimmi cosa modificare, es. "togli il sopralluogo" o "aggiungi verifica 300") oppure ricominciare da zero (rispondi "ricomincia")?`);
            return {
              content: lines.join("\n"),
              data: {
                pendingId: sessionId,
                pendingExisting: true,
                stato,
                voci,
              },
              _preventivoReady: true,
            };
          }
        }
        // pending chiuso (approvato/inviato/annullato): andiamo avanti e
        // creeremo un nuovo doc con .set() (overwrite) sullo stesso sessionId.
      }
    } catch (e) {
      logger.warn("runPreventivoWorkflow: check pending failed", { error: String(e).slice(0, 150) });
    }
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

  // IVA default: se l'intestatario ha P.IVA valida (cliente B2B) → reverse
  // charge ex art. 17 c.6 DPR 633/72 (default ACG per aziende). Altrimenti
  // (privati / condomini senza P.IVA) → IVA 22% ordinaria. Alberto può
  // sempre cambiare con "iva 22%" / "iva 10%" / "split payment" ecc.
  const pivaPulita = String(piva || "").replace(/\D/g, "");
  const hasPiva = /^\d{11}$/.test(pivaPulita);
  const ivaDefault = hasPiva
    ? { aliquota: 0, regime: "reverse_charge", nota: "Operazione soggetta a reverse charge ex art. 17 c.6 DPR 633/72." }
    : { aliquota: 22, regime: "ordinario", nota: null };

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
      // IVA default: già impostata. Le voci useranno questo regime quando
      // tryInterceptPreventivoVoci calcolerà il totale.
      iva_aliquota: ivaDefault.aliquota,
      iva_regime: ivaDefault.regime,
      iva_nota: ivaDefault.nota,
      iva_split_payment: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    steps.push({ step: 3, name: "salva_pending", ok: true, ms: Date.now() - t3, data: { pendingId, ivaDefault: ivaDefault.regime } });
  } catch (e) {
    steps.push({ step: 3, name: "salva_pending", ok: false, error: String(e).slice(0, 200) });
  }

  const ivaLabel = hasPiva ? `IVA 0% (reverse charge, art. 17 c.6 DPR 633/72)` : `IVA 22% ordinaria`;
  const lines = [
    `Ho i dati per il preventivo:`,
    `Intestatario ${ragioneSociale}, P.IVA ${piva}, ${indirizzoAzienda}.`,
    `Condominio ${nomeCondominio}, ${indirizzoCondominio}.`,
    `Regime IVA di default: ${ivaLabel}. Cambia con "iva 22%" o "iva 10%" se necessario.`,
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

  // Usa l'aliquota di default già salvata nel pending (impostata da
  // runPreventivoWorkflow in base alla presenza di P.IVA dell'intestatario).
  // Fallback 22% se non presente per qualche motivo.
  const aliquotaDefault = Number.isFinite(Number(pendingData.iva_aliquota))
    ? Number(pendingData.iva_aliquota) : 22;
  const regimeDefault = pendingData.iva_regime || "ordinario";
  const notaDefault = pendingData.iva_nota || null;

  const totaleImponibile = voci.reduce((s, v) => s + v.importo, 0);
  const ivaImporto = Math.round(totaleImponibile * (aliquotaDefault / 100) * 100) / 100;
  const totale = Math.round((totaleImponibile + ivaImporto) * 100) / 100;

  // Aggiorna stato pending → attesa_approvazione
  try {
    await pendingDoc.ref.set({
      voci,
      totale_imponibile: totaleImponibile,
      iva_importo: ivaImporto,
      iva_aliquota: aliquotaDefault,
      iva_regime: regimeDefault,
      iva_nota: notaDefault,
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
  // Etichetta IVA coerente con il regime di default
  let ivaLabel;
  if (regimeDefault === "reverse_charge") ivaLabel = `IVA 0% (reverse charge)`;
  else if (regimeDefault === "split_payment") ivaLabel = `IVA ${aliquotaDefault}% (split payment, non incassata)`;
  else if (aliquotaDefault === 0) ivaLabel = `IVA 0% (esente)`;
  else ivaLabel = `IVA ${aliquotaDefault}% ${fmtEur(ivaImporto)} €`;
  const blocchi = [
    `Riepilogo preventivo per ${pendingData.condominio?.nome || "—"}:`,
    elenco,
    ``,
    `Imponibile ${fmtEur(totaleImponibile)} €, ${ivaLabel}, totale ${fmtEur(totale)} €.`,
  ];
  if (notaDefault) {
    blocchi.push("");
    blocchi.push(`Nota fiscale: ${notaDefault}`);
  }
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

// ─── tryInterceptPreventivoModifica ────────────────────────────
// Quando il pending è in attesa_approvazione e Alberto scrive "modifica"
// (o varianti), riportiamo lo stato ad attesa_voci e mostriamo le voci
// attuali così sa cosa cambiare. Da qui Haiku fallback gestirà
// "togli/aggiungi/cambia" via tryInterceptPreventivoHaikuFallback.
export async function tryInterceptPreventivoModifica({ userMessage, sessionId }) {
  if (!sessionId) return null;
  const t = String(userMessage || "").trim().toLowerCase();
  if (!t) return null;
  // Match: "modifica", "cambia", "modificalo", "rivedere", "cambiare"
  // (forme sole o all'inizio frase). Esclude "modifica voce X" che va a
  // Haiku fallback (più informativo).
  if (!/^(modific\w*|cambi\w+|rived\w+|aggiust\w+)(?=$|\s|[,.!?])/i.test(t)) return null;
  // Se la frase ha contenuto specifico (numeri, "togli", "aggiungi", ecc.)
  // lasciamo passare al Haiku fallback che la interpreta meglio.
  if (/\d|togli|rimuov|aggiung|sconto/i.test(t)) return null;

  let pendingDoc, pendingData;
  try {
    pendingDoc = await db.collection("nexo_preventivi_pending").doc(sessionId).get();
    if (!pendingDoc.exists) return null;
    pendingData = pendingDoc.data() || {};
    if (pendingData.stato !== "attesa_approvazione") return null;
  } catch {
    return null;
  }

  try {
    await pendingDoc.ref.set({
      stato: "attesa_voci",
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch {}

  const fmtEur = (n) => Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const voci = Array.isArray(pendingData.voci) ? pendingData.voci : [];
  const lines = [];
  if (voci.length) {
    lines.push(`Ok, torniamo a sistemare il preventivo. Voci attuali:`);
    voci.forEach((v, i) => lines.push(`${i + 1}. ${v.descrizione}: ${fmtEur(v.importo)} €`));
  } else {
    lines.push(`Ok, torniamo a sistemare il preventivo. Non ci sono ancora voci.`);
  }
  lines.push("");
  lines.push(`Dimmi cosa cambiare. Esempi: "togli il sopralluogo", "aggiungi verifica 300", "cambia il sopralluogo a 250".`);

  return {
    content: lines.join("\n"),
    data: {
      pendingId: sessionId,
      stato: "attesa_voci",
      voci,
    },
    _preventivoModificaHandled: true,
  };
}

// ─── tryInterceptPreventivoSi ──────────────────────────────────
// Intercept rapido (regex-only) per le frasi che approvano un preventivo
// in attesa_approvazione. Riconosce TANTI pattern naturali:
//   conferme brevi: sì, si, ok, vai, fallo, dai, ho approvato, andiamo
//   verbi azione: procedi, approva, conferma, genera, crea, fai, salva
//   richieste output: "metti(lo) su doc", "salv(a|alo) su doc",
//                     "genera (il) pdf", "crea (il) pdf", "fai il pdf"
//   richieste invio: "manda(mi)? (il)? preventivo", "invia (il)? preventivo",
//                    "mandalo a ...", "mandami via mail [a indirizzo]"
// Estrae:
//   - sendByEmail: true se la frase contiene mail/email/manda/invia
//   - destinatarioEmail: regex email se presente
// Procede con approvaEGeneraPdf passando questi flag.
const APPROVA_PATTERNS = [
  // Conferme brevi all'inizio (sì / ok / vai / fallo / dai / ho approvato)
  /^(s[iì]|ok|va\s+bene|vai|fallo|dai|andiamo|approvato|approvo|conferm\w+)(?=$|\s|[,.!?])/i,
  // Verbi azione singoli o frasi con essi
  /\b(procedi|approva|approv[oa]l\w*|generaa?|crea(?:lo)?|fai(?:lo)?|salva(?:lo)?|conferm\w+)\b/i,
  // Richieste output esplicite
  /\b(metti(?:lo)?|salv\w+)\s+su\s+doc\b/i,
  /\b(genera|crea|fai|fammi)\s+(?:il\s+|un\s+)?pdf\b/i,
  /\b(genera|crea|fai|fammi)\s+(?:il\s+)?preventiv/i,
  // Richieste invio
  /\b(manda(?:mi|lo|melo|cela)?|invia(?:lo|melo|cela)?|spedisci(?:lo|melo)?)\b/i,
  // "mandami il pdf" / "mandami il preventivo"
  /\b(?:mi|me)\s+(?:lo\s+)?(?:mand|invi|spedisc)/i,
];
const EMAIL_REGEX = /([\w.+-]+@[\w-]+\.[\w.-]+)/;
const SEND_KEYWORDS_RE = /\b(mail|email|posta|mandare|inviare|manda(?:mi|lo|melo)?|invia(?:mi|lo|melo)?|spedisc\w*)\b/i;

export async function tryInterceptPreventivoSi({ userMessage, sessionId, userId }) {
  if (!sessionId) return null;
  const raw = String(userMessage || "").trim();
  if (!raw) return null;
  const t = raw.toLowerCase();

  // Fast reject: deve matchare almeno UN pattern di approvazione
  let matched = false;
  for (const re of APPROVA_PATTERNS) {
    if (re.test(t)) { matched = true; break; }
  }
  if (!matched) return null;

  // Hard exclude: messaggi che contengono "non" o "annulla" o "rifiuta"
  // come refuso negativo (es. "non mandare", "annulla")
  if (/\b(non\s+(?:mandare|inviare|approvare|generare|fare|farlo)|annull\w+|rifiut\w+|stop|aspett)/i.test(t)) {
    return null;
  }

  let pendingDoc, pendingData;
  try {
    pendingDoc = await db.collection("nexo_preventivi_pending").doc(sessionId).get();
    if (!pendingDoc.exists) return null;
    pendingData = pendingDoc.data() || {};
    if (pendingData.stato !== "attesa_approvazione") return null;
  } catch {
    return null;
  }

  // Estrai destinatario email se citato esplicitamente
  const emailMatch = raw.match(EMAIL_REGEX);
  const destinatarioEmail = emailMatch ? emailMatch[1].toLowerCase() : null;
  // Flag "manda via mail" se ci sono parole-chiave di invio (anche senza email)
  const sendByEmail = SEND_KEYWORDS_RE.test(t) || !!destinatarioEmail;

  return await approvaEGeneraPdf(pendingDoc, pendingData, sessionId, {
    sendByEmail,
    destinatarioEmail,
    rawUserMessage: raw,
  });
}

// ─── approvaEGeneraPdf ─────────────────────────────────────────
// Quando il preventivo è in attesa_approvazione e Alberto dice "sì",
// chiamiamo GRAPH (graphApi/api/v1/generate) con template "preventivo-doc".
// GRAPH genera il PDF, lo salva su Firebase Storage e — grazie al campo
// `docfin` nel body — scrive automaticamente anche un record su
// docfin_documents (visibile su acg-doc.web.app). Il link viene salvato
// nel pending e mostrato all'utente in chat.
const GRAPH_API_URL = "https://europe-west1-garbymobile-f89ac.cloudfunctions.net/graphApi/api/v1/generate";
const GRAPH_API_KEY = "graph-acg-suite-2026"; // valore default GRAPH (env GRAPH_API_KEY)
const GRAPH_APP_ID = "GRAPH";
const GRAPH_TEMPLATE_ID = "preventivo-doc";

// Estrae componenti dell'indirizzo azienda (raw da memo_aziende sede_legale
// se disponibile, altrimenti dalla stringa libera intestatario.indirizzo).
function splitIndirizzoAzienda(intest) {
  const raw = intest.raw || {};
  const sede = raw.sede_legale || {};
  // Caso A: sede_legale strutturata in memo_aziende
  if (sede.indirizzo || sede.citta) {
    return {
      indirizzo: sede.indirizzo || "",
      cap: sede.cap || "",
      citta: sede.citta || "",
      provincia: sede.provincia || "",
    };
  }
  // Caso B: stringa libera "Via X 33, 20154 Milano"
  const flat = String(intest.indirizzo || "").trim();
  if (!flat) return { indirizzo: "", cap: "", citta: "", provincia: "" };
  // Split su virgola: prima virgola = indirizzo, resto = cap+città
  const parts = flat.split(",").map(p => p.trim()).filter(Boolean);
  if (parts.length === 1) return { indirizzo: parts[0], cap: "", citta: "", provincia: "" };
  // Cerca cap (5 cifre) nella seconda parte
  const second = parts.slice(1).join(", ");
  const capMatch = second.match(/\b(\d{5})\b/);
  const cap = capMatch ? capMatch[1] : "";
  const citta = second.replace(/\b\d{5}\b/, "").trim().replace(/^[,\s-]+|[,\s-]+$/g, "");
  return { indirizzo: parts[0], cap, citta, provincia: "" };
}

// Costruisce un oggetto descrittivo "Offerta per [voci] — [Condominio], [indirizzo]"
function buildOggettoPreventivo(voci, cond) {
  const condNome = (cond.nome || "").replace(/^CONDOMINIO\s+/i, "Condominio ").trim() || "intervento";
  const condIndirizzo = (cond.indirizzo || "").trim();
  let descrizione;
  if (voci.length === 0) {
    descrizione = "intervento";
  } else if (voci.length === 1) {
    descrizione = String(voci[0].descrizione || "intervento").toLowerCase();
  } else {
    // Più voci: prendi le 2 voci principali, fallback "verifica e manutenzione"
    descrizione = voci.slice(0, 2).map(v => String(v.descrizione || "").toLowerCase()).filter(Boolean).join(" e ");
    if (!descrizione) descrizione = "intervento";
  }
  // Capitalizza la prima lettera
  descrizione = descrizione.charAt(0).toUpperCase() + descrizione.slice(1);
  // Componi
  const tail = condIndirizzo ? `${condNome}, ${condIndirizzo}` : condNome;
  return `Offerta per ${descrizione} — ${tail}`;
}

function buildGraphDataPreventivo(pendingData) {
  const intest = pendingData.intestatario || {};
  const cond = pendingData.condominio || {};
  const voci = Array.isArray(pendingData.voci) ? pendingData.voci : [];
  const aliquota = pendingData.iva_aliquota != null ? pendingData.iva_aliquota : 22;
  // GRAPH "righe" è un array di oggetti FIC-style.
  const righe = voci.map((v, i) => ({
    codice: String(i + 1),
    descrizione: v.descrizione,
    qta: 1,
    prezzo_unitario: v.importo,
    iva: aliquota,
    importo: v.importo,
    sconto: 0,
    prezzo_pre_sconto: v.importo,
    udm: "n.",
  }));
  const totaleImponibile = Number(pendingData.totale_imponibile || 0);
  const ivaImporto = Number(pendingData.iva_importo || 0);
  const totale = Number(pendingData.totale || 0);
  const note = pendingData.iva_nota || "";

  // BUG-3 FIX: il DESTINATARIO (campo indirizzo / comune / provincia del PDF)
  // deve essere l'indirizzo dell'AZIENDA intestataria, non del condominio.
  // Il condominio va nell'OGGETTO come luogo dell'intervento.
  const sede = splitIndirizzoAzienda(intest);
  const oggetto = buildOggettoPreventivo(voci, cond);

  // Template "preventivo-doc" (config locale GRAPH) usa nomi camelCase:
  // clientName (REQ), condominioName, indirizzo, comune, provincia, ecc.
  // - clientName + indirizzo + comune + provincia → indirizzo azienda
  // - condominioName → solo nome (non indirizzo, va nell'oggetto)
  // - descrizione → oggetto del preventivo (lavoro + condominio + via)
  return {
    clientName: intest.ragione_sociale || "",
    indirizzo: sede.indirizzo,
    comune: sede.citta,
    provincia: sede.provincia,
    cap: sede.cap,
    piva_cliente: intest.piva || "",
    // Nel PDF questo è solo il NOME del condominio (luogo intervento). Lo
    // ripeteremo nell'oggetto col suo indirizzo.
    condominioName: cond.nome || "",
    // Oggetto del preventivo
    descrizione: oggetto,
    righe,
    riepilogo_iva: [{
      aliquota,
      imponibile: totaleImponibile,
      imposta: ivaImporto,
    }],
    imponibile: totaleImponibile,
    importo_iva: ivaImporto,
    totale,
    note,
    condizioni_pagamento: "Pagamento a 30 gg DFFM",
    validita_offerta: "30 giorni",
  };
}

async function approvaEGeneraPdf(pendingDoc, pendingData, sessionId, options = {}) {
  const intest = pendingData.intestatario || {};
  const cond = pendingData.condominio || {};
  const voci = Array.isArray(pendingData.voci) ? pendingData.voci : [];
  if (!voci.length) {
    return {
      content: `Non posso approvare: il preventivo non ha voci. Aggiungi almeno una voce (es. "verifica impianto 200").`,
      _preventivoHaikuHandled: true,
    };
  }
  const { sendByEmail = false, destinatarioEmail = null } = options;

  const data = buildGraphDataPreventivo(pendingData);
  const docfinPayload = {
    type: "PRV",
    clientName: intest.ragione_sociale || "",
    condominioName: cond.nome || "",
    items: voci.map((v, i) => ({
      code: String(i + 1),
      description: v.descrizione,
      quantity: 1,
      unitPrice: v.importo,
      ivaRate: pendingData.iva_aliquota != null ? pendingData.iva_aliquota : 22,
      totalRow: v.importo,
    })),
    totals: {
      imponibile: Number(pendingData.totale_imponibile || 0),
      iva: Number(pendingData.iva_importo || 0),
      totale: Number(pendingData.totale || 0),
    },
    description: data.descrizione,
    notes: pendingData.iva_nota || "",
    naturaIva: pendingData.iva_regime || "ordinario",
    sourceApp: "NEXUS",
    sourceRef: sessionId,
    status: "emesso",
  };

  // Sessioni FORGE/test: NON devono toccare il counter reale del template
  // preventivo-doc (graph_counters/preventivo-doc_YYYY). Usano un counter
  // locale separato in nexo_test_counters/preventivo (Firestore nexo-hub-15f2d)
  // e passano il numero pre-formato a GRAPH con auto_number=false.
  // Tutto ciò che inizia con "forge-test" è considerato test.
  const isTestSession = String(sessionId || "").startsWith("forge-test");
  let preassignedNumber = null;
  if (isTestSession) {
    try {
      const ctrRef = db.collection("nexo_test_counters").doc("preventivo");
      const next = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ctrRef);
        const cur = snap.exists ? Number((snap.data() || {}).lastNumber || 0) : 0;
        const n = cur + 1;
        tx.set(ctrRef, {
          lastNumber: n,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        return n;
      });
      const year = new Date().getFullYear();
      preassignedNumber = `TEST-${String(next).padStart(3, "0")}/${year}`;
    } catch (e) {
      logger.warn("test counter fail, fallback to GRAPH counter", { error: String(e).slice(0, 120) });
      preassignedNumber = null;
    }
  }

  let resp;
  try {
    const body = {
      template_id: GRAPH_TEMPLATE_ID,
      company_id: "acg",
      data,
      docfin: docfinPayload,
    };
    if (preassignedNumber) {
      body.auto_number = false;
      body.number = preassignedNumber;
    } else {
      body.auto_number = true;
    }
    const r = await fetch(GRAPH_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-App-Id": GRAPH_APP_ID,
        "X-Api-Key": GRAPH_API_KEY,
      },
      body: JSON.stringify(body),
    });
    resp = await r.json();
    if (!r.ok || !resp.success) {
      return {
        content: `Errore generazione PDF GRAPH: ${resp?.message || resp?.error || "unknown"}.`,
        _preventivoHaikuHandled: true,
      };
    }
  } catch (e) {
    return {
      content: `Errore connessione a GRAPH: ${String(e).slice(0, 150)}.`,
      _preventivoHaikuHandled: true,
    };
  }

  const pdfUrl = resp.document?.pdf_url || null;
  const numero = resp.document?.number || "—";
  const docfinId = resp.docfin_id || null;
  const graphDocId = resp.document?.id || null;

  // Determina destinatario email se l'utente ha chiesto invio:
  // 1. email esplicita nel messaggio
  // 2. fallback: emailRef nel pending (dall'analizza email originaria) o
  //    sourceEmailSender (mittente del thread email che ha originato il preventivo)
  let emailTo = destinatarioEmail;
  if (sendByEmail && !emailTo) {
    emailTo = pendingData.threadDestinatario
      || pendingData.sourceEmailSender
      || (pendingData.intestatarioEmail || null);
  }

  // Update pending: stato approvato + dati invio
  try {
    await pendingDoc.ref.set({
      stato: emailTo ? "inviato" : "approvato",
      approvatoAt: FieldValue.serverTimestamp(),
      pdfUrl, numero,
      graphDocumentId: graphDocId,
      docfinId,
      destinatarioEmail: emailTo || null,
      sendByEmail: !!sendByEmail,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch {}

  const pdfLine = pdfUrl
    ? `Preventivo PREV-${numero} pronto. Scaricalo qui: ${pdfUrl}`
    : `Preventivo PREV-${numero} approvato (PDF in fase di generazione).`;
  const docLine = docfinId
    ? `Lo trovi anche su DOC: https://acg-doc.web.app/?openDoc=${docfinId}`
    : "";

  // Tre scenari di chiusura conversazione:
  //  A) sendByEmail con destinatario noto → registra in iris_email_outbox
  //     (ECHO/Hetzner consumerà la coda e manderà la email con allegato).
  //  B) sendByEmail SENZA destinatario noto → chiedi a chi mandarlo.
  //  C) niente invio → chiudi proponendo invio opzionale.
  let trailingLine;
  if (sendByEmail && emailTo) {
    try {
      await db.collection("iris_email_outbox").add({
        kind: "preventivo",
        to: emailTo,
        subject: `Preventivo ${numero} — ${cond.nome || ""}`.trim(),
        body: `Buongiorno,\n\nin allegato trovi il preventivo ${numero} per ${cond.nome || ""}. Resto a disposizione per qualsiasi chiarimento.\n\nCordiali saluti,\nAlberto Contardi\nACG Clima Service S.r.l.`,
        attachmentUrl: pdfUrl,
        attachmentName: `preventivo-${numero}.pdf`,
        sourceApp: "NEXUS",
        sourceRef: sessionId,
        graphDocumentId: graphDocId,
        docfinId,
        status: "pending",
        createdAt: FieldValue.serverTimestamp(),
      });
      trailingLine = `Ho messo l'invio in coda per ${emailTo}.`;
    } catch (e) {
      trailingLine = `Email NON in coda (errore: ${String(e).slice(0, 80)}). Mandalo manualmente a ${emailTo}.`;
    }
  } else if (sendByEmail && !emailTo) {
    trailingLine = `A chi lo mando? Dammi un indirizzo email (es. "manda a davide.torriglia@gruppo3i.it").`;
  } else {
    const dest = intest.ragione_sociale ? `a ${intest.ragione_sociale}` : "al destinatario";
    trailingLine = `Vuoi che lo mandi ${dest}? Dimmi l'indirizzo.`;
  }

  const content = [
    pdfLine,
    docLine,
    "",
    trailingLine,
  ].filter(Boolean).join("\n");

  return {
    content,
    data: {
      intent: "approva",
      pendingId: sessionId,
      numero,
      pdfUrl,
      graphDocumentId: graphDocId,
      docfinId,
      sendByEmail,
      destinatarioEmail: emailTo,
      source: "haiku_fallback",
    },
    _preventivoHaikuHandled: true,
  };
}

// ─── tryInterceptPreventivoHaikuFallback ────────────────────────
// Fallback intelligente: se per la sessione esiste un nexo_preventivi_pending
// ma nessuno dei parser regex (voci/iva/approval) ha intercettato il
// messaggio, chiediamo a Haiku di interpretare cosa vuole fare Alberto.
// Le azioni possibili e gli effetti:
//   modifica_iva   → applica come tryInterceptPreventivoIva
//   aggiungi_voce  → aggiunge alla lista voci e ricalcola
//   rimuovi_voce   → rimuove dalla lista (match per descrizione substring)
//   modifica_voce  → cambia importo di una voce esistente
//   sconto         → applica percentuale sull'imponibile
//   approva        → marca pending come approvato (TODO step PDF)
//   annulla        → cancella il pending
//   chiarimento    → chiede chiarimento all'utente con la domanda generata
async function callHaikuPreventivoIntent(apiKey, pendingData, userMessage) {
  const intestatario = pendingData.intestatario || {};
  const condominio = pendingData.condominio || {};
  const voci = Array.isArray(pendingData.voci) ? pendingData.voci : [];
  const stato = pendingData.stato || "attesa_voci";
  const aliquota = pendingData.iva_aliquota != null ? pendingData.iva_aliquota : 22;
  const totaleImp = pendingData.totale_imponibile || 0;
  const totale = pendingData.totale || 0;
  const fmtVoci = voci.length
    ? voci.map((v, i) => `  ${i + 1}. ${v.descrizione}: ${v.importo} €`).join("\n")
    : "  (nessuna voce ancora inserita)";

  const system = `Sei l'assistente NEXUS di ACG Clima Service. Alberto sta preparando un preventivo.

Stato attuale del preventivo:
- Intestatario: ${intestatario.ragione_sociale || "—"}, P.IVA ${intestatario.piva || "—"}, ${intestatario.indirizzo || "—"}
- Condominio: ${condominio.nome || "—"}, ${condominio.indirizzo || "—"}
- Voci inserite:
${fmtVoci}
- IVA attuale: ${aliquota}%
- Imponibile attuale: ${totaleImp} €
- Totale attuale: ${totale} €
- Stato: ${stato}

Alberto ha scritto un messaggio che NON è stato riconosciuto dai parser regex (voci/iva/approva).
Interpreta cosa vuole fare. Rispondi SOLO con un JSON valido (niente code fence, niente testo extra):

{
  "azione": "modifica_iva" | "aggiungi_voce" | "rimuovi_voce" | "modifica_voce" | "sconto" | "approva" | "annulla" | "chiarimento",
  "parametri": {
    // modifica_iva:   { aliquota: 0|4|10|22, regime: "reverse_charge"|"split_payment"|"esente"|"ordinario", nota?: "..." }
    // aggiungi_voce:  { descrizione: "...", importo: 50 }
    // rimuovi_voce:   { descrizione: "..." }    // substring per matchare la voce
    // modifica_voce:  { descrizione: "...", importo: 50 }   // descrizione = match substring, importo = nuovo
    // sconto:         { percentuale: 10 }
    // approva:        { sendByEmail?: true, destinatarioEmail?: "user@dominio.it" }
    // annulla:        {}
    // chiarimento:    { domanda: "Vuoi dire...?" }   // formula UNA domanda concisa
  }
}

REGOLE PER L'AZIONE "approva"
Le seguenti frasi (e simili) significano APPROVA:
  "sì", "ok", "vai", "procedi", "fallo", "dai", "andiamo", "approva",
  "conferma", "ho approvato", "andiamo avanti",
  "metti(lo) su doc", "salv(a/alo) su doc",
  "genera il pdf", "crea il pdf", "fammi il pdf",
  "manda(mi)? (il)? preventivo", "invia (il)? preventivo",
  "mandami via mail", "mandami il pdf via mail",
  "mandalo a <email>", "spedisci(lo)?".
Se la frase contiene una o più di queste keyword di invio
(mail/email/manda/invia/spedisci) imposta sendByEmail=true.
Se nella frase c'è un indirizzo email (regex pattern user@host.tld)
mettilo in destinatarioEmail.
Se c'è ambiguità ("mandami via mail" senza email) lascia
destinatarioEmail null: il sistema chiederà all'utente.

REGOLE GENERALI
- Non inventare voci o regimi che Alberto non ha menzionato.
- Se proprio non capisci, usa "chiarimento" con una domanda specifica.
- Importi: numeri decimali con punto (50.00), niente € o "euro".`;

  const resp = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 400,
      system,
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  if (!resp.ok) throw new Error(`Haiku ${resp.status}`);
  const json = await resp.json();
  const text = (json.content || []).filter(b => b.type === "text").map(b => b.text).join("").trim();
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s < 0 || e <= s) return null;
  return JSON.parse(text.slice(s, e + 1));
}

function recalcPreventivo(voci, aliquota = 22) {
  const totaleImponibile = Math.round(voci.reduce((s, v) => s + Number(v.importo || 0), 0) * 100) / 100;
  const ivaImporto = Math.round(totaleImponibile * (aliquota / 100) * 100) / 100;
  const totale = Math.round((totaleImponibile + ivaImporto) * 100) / 100;
  return { totaleImponibile, ivaImporto, totale };
}

function fmtRiepilogoPreventivo(pendingData) {
  const fmtEur = (n) => Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const voci = Array.isArray(pendingData.voci) ? pendingData.voci : [];
  const elenco = voci.map((v, i) => `${i + 1}. ${v.descrizione}: ${fmtEur(v.importo)} €`).join("\n");
  const aliquota = pendingData.iva_aliquota != null ? pendingData.iva_aliquota : 22;
  const regime = pendingData.iva_regime || "ordinario";
  let ivaLabel;
  if (regime === "reverse_charge") ivaLabel = `IVA 0% (reverse charge)`;
  else if (regime === "split_payment") ivaLabel = `IVA ${aliquota}% (split payment, non incassata)`;
  else if (aliquota === 0) ivaLabel = `IVA 0% (esente)`;
  else ivaLabel = `IVA ${aliquota}% ${fmtEur(pendingData.iva_importo || 0)} €`;
  return [
    `Riepilogo aggiornato per ${pendingData.condominio?.nome || "—"}:`,
    elenco || "  (nessuna voce)",
    ``,
    `Imponibile ${fmtEur(pendingData.totale_imponibile || 0)} €, ${ivaLabel}, totale ${fmtEur(pendingData.totale || 0)} €.`,
  ].join("\n");
}

export async function tryInterceptPreventivoHaikuFallback({ userMessage, sessionId, userId }) {
  if (!sessionId) return null;
  const t = String(userMessage || "").trim();
  if (!t) return null;

  // Cerca pending per la sessione
  let pendingDoc, pendingData;
  try {
    pendingDoc = await db.collection("nexo_preventivi_pending").doc(sessionId).get();
    if (!pendingDoc.exists) return null;
    pendingData = pendingDoc.data() || {};
  } catch {
    return null;
  }

  const apiKey = ANTHROPIC_API_KEY.value();
  if (!apiKey) return null;

  let intent;
  try {
    intent = await callHaikuPreventivoIntent(apiKey, pendingData, t);
  } catch (e) {
    logger.warn("Haiku fallback preventivo failed", { error: String(e).slice(0, 150) });
    return null; // lascia passare al routing standard
  }
  if (!intent || !intent.azione) return null;

  const az = String(intent.azione).toLowerCase();
  const params = intent.parametri || {};
  let voci = Array.isArray(pendingData.voci) ? [...pendingData.voci] : [];
  let aliquota = pendingData.iva_aliquota != null ? pendingData.iva_aliquota : 22;
  let regime = pendingData.iva_regime || "ordinario";
  let nota = pendingData.iva_nota || null;
  let splitPayment = !!pendingData.iva_split_payment;

  // ── Esegui l'azione ──────────────────────────────────────
  if (az === "chiarimento") {
    const d = String(params.domanda || "Non ho capito bene, puoi spiegare meglio?").slice(0, 280);
    return {
      content: d,
      data: { intent: "chiarimento", domanda: d, source: "haiku_fallback" },
      _preventivoHaikuHandled: true,
    };
  }

  if (az === "annulla") {
    try {
      await pendingDoc.ref.set({ stato: "annullato", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    } catch {}
    return {
      content: `Preventivo annullato. Quando vuoi prepararne uno nuovo dimmelo.`,
      data: { intent: "annulla", source: "haiku_fallback" },
      _preventivoHaikuHandled: true,
    };
  }

  if (az === "approva") {
    // Genera PDF + scrive docfin_documents tramite GRAPH (acg_suite),
    // poi marca il pending come approvato e — se Haiku ha riconosciuto
    // la richiesta di invio — mette in coda l'email a iris_email_outbox.
    return await approvaEGeneraPdf(pendingDoc, pendingData, sessionId, {
      sendByEmail: !!params.sendByEmail,
      destinatarioEmail: params.destinatarioEmail || null,
    });
  }

  if (az === "modifica_iva") {
    if (params.aliquota != null) {
      aliquota = Math.max(0, Math.min(30, Number(params.aliquota)));
    }
    regime = String(params.regime || regime || "ordinario");
    nota = params.nota || null;
    splitPayment = regime === "split_payment";
  } else if (az === "aggiungi_voce") {
    const desc = String(params.descrizione || "").trim();
    const importo = Number(params.importo);
    if (!desc || !Number.isFinite(importo) || importo <= 0) {
      return {
        content: `Mi serve descrizione e importo della voce da aggiungere. Esempio: "aggiungi viaggio 50".`,
        _preventivoHaikuHandled: true,
      };
    }
    voci.push({ descrizione: desc, importo: Math.round(importo * 100) / 100 });
  } else if (az === "rimuovi_voce") {
    const desc = String(params.descrizione || "").toLowerCase().trim();
    if (!desc) {
      return { content: `Quale voce vuoi rimuovere? Dimmi la descrizione.`, _preventivoHaikuHandled: true };
    }
    const before = voci.length;
    voci = voci.filter(v => !String(v.descrizione || "").toLowerCase().includes(desc));
    if (voci.length === before) {
      return { content: `Non trovo nessuna voce che corrisponda a "${desc}". Voci attuali: ${(pendingData.voci || []).map(v => v.descrizione).join(", ") || "(nessuna)"}.`, _preventivoHaikuHandled: true };
    }
  } else if (az === "modifica_voce") {
    const desc = String(params.descrizione || "").toLowerCase().trim();
    const importo = Number(params.importo);
    if (!desc || !Number.isFinite(importo) || importo <= 0) {
      return { content: `Mi serve la voce da modificare e il nuovo importo. Esempio: "cambia sopralluogo a 250".`, _preventivoHaikuHandled: true };
    }
    let found = false;
    voci = voci.map(v => {
      if (!found && String(v.descrizione || "").toLowerCase().includes(desc)) {
        found = true;
        return { ...v, importo: Math.round(importo * 100) / 100 };
      }
      return v;
    });
    if (!found) {
      return { content: `Non trovo la voce "${desc}". Voci attuali: ${(pendingData.voci || []).map(v => v.descrizione).join(", ") || "(nessuna)"}.`, _preventivoHaikuHandled: true };
    }
  } else if (az === "sconto") {
    const perc = Number(params.percentuale);
    if (!Number.isFinite(perc) || perc <= 0 || perc >= 100) {
      return { content: `Sconto non valido. Dimmi una percentuale fra 1 e 99 (es. "sconto 10%").`, _preventivoHaikuHandled: true };
    }
    const fattore = (100 - perc) / 100;
    voci = voci.map(v => ({ descrizione: `${v.descrizione} (sconto ${perc}%)`, importo: Math.round(v.importo * fattore * 100) / 100 }));
  } else {
    return null; // azione sconosciuta, lascia passare
  }

  // Ricalcola e salva
  const r = recalcPreventivo(voci, aliquota);
  const nuovoStato = voci.length > 0 ? "attesa_approvazione" : "attesa_voci";
  const newPending = {
    ...pendingData,
    voci,
    iva_aliquota: aliquota,
    iva_regime: regime,
    iva_nota: nota,
    iva_split_payment: splitPayment,
    iva_importo: r.ivaImporto,
    totale_imponibile: r.totaleImponibile,
    totale: r.totale,
    stato: nuovoStato,
  };
  try {
    await pendingDoc.ref.set({
      voci, iva_aliquota: aliquota, iva_regime: regime, iva_nota: nota,
      iva_split_payment: splitPayment, iva_importo: r.ivaImporto,
      totale_imponibile: r.totaleImponibile, totale: r.totale,
      stato: nuovoStato,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch (e) {
    return { content: `Errore aggiornamento preventivo: ${String(e).slice(0, 150)}`, _preventivoHaikuHandled: true };
  }

  const blocchi = [fmtRiepilogoPreventivo(newPending)];
  if (nota) {
    blocchi.push("");
    blocchi.push(`Nota fiscale: ${nota}`);
  }
  blocchi.push("");
  blocchi.push(`Lo genero in PDF? Rispondi "sì" per procedere, "modifica" per cambiare le voci, "annulla" per scartare.`);

  return {
    content: blocchi.join("\n"),
    data: {
      pendingId: sessionId,
      intent: az,
      voci: newPending.voci,
      iva_aliquota: aliquota,
      iva_regime: regime,
      iva_nota: nota,
      totale_imponibile: r.totaleImponibile,
      iva_importo: r.ivaImporto,
      totale: r.totale,
      source: "haiku_fallback",
    },
    _preventivoHaikuHandled: true,
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
