// handlers/charta.js — fatture, incassi, report mensile.
import {
  db, FieldValue, logger,
  getCosminaDb, getGuazzottiDb, fetchIrisEmails, emailLine, isToday,
} from "./shared.js";

// Esposizione cliente da Guazzotti TEC pagamenti_clienti
export async function handleChartaEsposizioneCliente(parametri, ctx) {
  const query = String(
    parametri.cliente || parametri.condominio || parametri.nome || "",
  ).trim().toLowerCase();
  if (!query && !ctx?.userMessage) {
    return { content: "Mi serve il nome cliente/condominio." };
  }
  const q = query || String(ctx?.userMessage || "").toLowerCase();

  let snap;
  try {
    snap = await getGuazzottiDb().collection("pagamenti_clienti").limit(300).get();
  } catch (e) {
    return { content: `CHARTA: errore lettura Guazzotti pagamenti_clienti (${String(e).slice(0, 80)})` };
  }

  const matches = [];
  snap.forEach(d => {
    const v = d.data() || {};
    const bag = `${v.Cliente || ""} ${v.Amministratore || ""} ${v.CodCliente || ""}`.toLowerCase();
    if (bag.includes(q)) matches.push({
      codice: v.CodCliente,
      nome: v.Cliente,
      amministratore: v.Amministratore,
      esposizione: Number(v.TotaleEsposizione || 0),
      scaduto: Number(v.TotaleScaduto || 0),
      scadenzaCorrente: Number(v.AScadere || 0),
      scaduto30: Number(v.Scaduto30 || 0),
      scaduto60: Number(v.Scaduto60 || 0),
      scaduto90: Number(v.Scaduto90 || 0),
      scadutoOltre: Number(v.ScadutoOltre360 || 0) + Number(v.Scaduto360 || 0) + Number(v.Scaduto180 || 0),
      riskLevel: v.riskLevel,
      dataRif: v.dataRiferimento,
    });
  });

  if (!matches.length) {
    return { content: `Non trovo nessun cliente "${q}" nei dati di Guazzotti.` };
  }

  const top = matches.sort((a, b) => b.esposizione - a.esposizione).slice(0, 3);

  // Risposta naturale, una frase per cliente
  const parts = [];
  if (matches.length === 1) {
    const m = top[0];
    const bits = [`${m.nome} ha ${m.esposizione.toFixed(0)} euro di esposizione`];
    if (m.scaduto > 0) bits.push(`di cui ${m.scaduto.toFixed(0)} scaduti`);
    if (m.scadutoOltre > 0) bits.push(`${m.scadutoOltre.toFixed(0)} oltre i 6 mesi`);
    parts.push(bits.join(", ") + ".");
    if (m.riskLevel) parts.push(`Livello di rischio: ${m.riskLevel}.`);
  } else {
    parts.push(`Ho ${matches.length} clienti che corrispondono. I principali per esposizione:`);
    const elenco = top.map((m, i) => {
      const scad = m.scaduto > 0 ? `, ${m.scaduto.toFixed(0)} scaduti` : "";
      return `${i + 1}. ${m.nome}: ${m.esposizione.toFixed(0)} euro${scad}`;
    }).join("\n");
    parts.push(elenco);
  }
  return {
    content: parts.join("\n\n"),
    data: { count: matches.length, top },
  };
}

async function isChartaDryRun() {
  try {
    const snap = await getCosminaDb().collection("cosmina_config").doc("charta_config").get();
    if (snap.exists && typeof (snap.data() || {}).dry_run === "boolean") {
      return snap.data().dry_run;
    }
  } catch {}
  return true;
}

export async function handleChartaRegistraIncasso(parametri, ctx) {
  const msg = String(ctx?.userMessage || "");
  const importoParam = parametri.importo || parametri.amount;
  const controparteParam = parametri.cliente || parametri.controparte || parametri.da;

  let importo = typeof importoParam === "number" ? importoParam : parseFloat(String(importoParam || "").replace(",", "."));
  let controparte = String(controparteParam || "").trim();

  if (!Number.isFinite(importo) || importo <= 0) {
    const m = /(\d+(?:[.,]\d{1,2})?)\s*(?:euro|eur|€)/i.exec(msg) || /(?:euro|eur|€)\s*(\d+(?:[.,]\d{1,2})?)/i.exec(msg);
    if (m) importo = parseFloat(m[1].replace(",", "."));
  }

  if (!controparte) {
    const m = /\bda\s+(?:condominio\s+|cond\.\s+|cliente\s+)?([A-Za-zÀ-ÿ][\wÀ-ÿ.\s'\-]{2,60})/i.exec(msg);
    if (m) controparte = m[1].trim();
  }

  if (!Number.isFinite(importo) || importo <= 0) {
    return { content: "💰 Mi manca l'importo. Es. \"registra incasso 500 euro da Condominio Kristal\"." };
  }
  if (!controparte) {
    return { content: "💰 Mi manca il nome del cliente/condominio. Es. \"registra incasso 500 da Kristal\"." };
  }

  const id = "inc_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6);
  const record = {
    id,
    direzione: "in",
    controparteId: "unknown",
    controparteNome: controparte,
    importo,
    data: new Date().toISOString(),
    metodo: String(parametri.metodo || "bonifico"),
    causale: parametri.causale || undefined,
    fonte: "nexus",
    sourceSessionId: parametri.sessionId,
    createdAt: FieldValue.serverTimestamp(),
  };

  const dry = await isChartaDryRun();
  if (dry) {
    try { await db.collection("charta_pagamenti").doc(id).set({ ...record, _dryRun: true }); }
    catch (e) { logger.error("charta dry_run mirror failed", { error: String(e) }); }
    return {
      content:
        `💰 Incasso **simulato** (CHARTA DRY_RUN)\n\n` +
        `  · Da: **${controparte}**\n` +
        `  · Importo: € ${importo.toFixed(2)}\n` +
        `  · Metodo: ${record.metodo}\n\n` +
        `ID: \`${id}\`. Per salvare davvero, imposta \`cosmina_config/charta_config.dry_run = false\`.`,
      data: { id, dryRun: true },
    };
  }

  try {
    await db.collection("charta_pagamenti").doc(id).set(record);
    return {
      content:
        `✅ Incasso **registrato**\n\n` +
        `  · Da: **${controparte}**\n` +
        `  · Importo: € ${importo.toFixed(2)}\n` +
        `  · Metodo: ${record.metodo}\n\n` +
        `ID: \`${id}\``,
      data: { id, dryRun: false },
    };
  } catch (e) {
    return { content: `❌ CHARTA: scrittura fallita. ${String(e?.message || e).slice(0, 200)}` };
  }
}

// Fatture scadute: dati REALI da pagamenti_clienti (Guazzotti TEC)
// + email indicizzate come fallback aggregato.
export async function handleFattureScadute() {
  let totEsposizione = 0, totScaduto = 0, totOltre = 0;
  let topClienti = [];
  try {
    const snap = await getGuazzottiDb().collection("pagamenti_clienti").limit(300).get();
    snap.forEach(d => {
      const v = d.data() || {};
      const exp = Number(v.TotaleEsposizione || 0);
      const sca = Number(v.TotaleScaduto || 0);
      totEsposizione += exp;
      totScaduto += sca;
      totOltre += Number(v.ScadutoOltre360 || 0) + Number(v.Scaduto360 || 0) + Number(v.Scaduto180 || 0);
      if (sca > 0) topClienti.push({ nome: v.Cliente, scaduto: sca, esposizione: exp });
    });
    topClienti.sort((a, b) => b.scaduto - a.scaduto);
  } catch (e) {
    return { content: `Non riesco a leggere i dati di Guazzotti: ${String(e).slice(0, 100)}.` };
  }

  if (totScaduto === 0) {
    return { content: "Nessun cliente ha scaduti al momento, esposizione tutta nei termini." };
  }

  const parts = [];
  parts.push(`Esposizione totale: ${totEsposizione.toFixed(0)} euro, di cui ${totScaduto.toFixed(0)} scaduti${totOltre > 0 ? ` (${totOltre.toFixed(0)} oltre i 6 mesi)` : ""}.`);
  if (topClienti.length) {
    const top3 = topClienti.slice(0, 3);
    const elenco = top3.map(c => `${c.nome}: ${c.scaduto.toFixed(0)} euro`).join(", ");
    parts.push(`I clienti con più scaduto sono ${elenco}.`);
  }
  if (totScaduto > 5000) {
    parts.push(`Vuoi che mando un sollecito ai principali?`);
  }
  return {
    content: parts.join(" "),
    data: { totEsposizione, totScaduto, totOltre, topCount: topClienti.length },
  };
}

export async function handleChartaIncassiOggi() {
  const emails = await fetchIrisEmails(300);
  const today = emails.filter(e => isToday(e.received_time));
  const incassi = today.filter(e =>
    /pagament|incass|bonifico|accredit|saldo/i.test(`${e.subject} ${e.summary}`),
  );
  if (!incassi.length) {
    return { content: "Oggi nessuna email su incassi o pagamenti." };
  }
  if (incassi.length === 1) {
    const e = incassi[0];
    return {
      content: `Oggi un'email di pagamento da ${e.senderName || e.sender}: ${e.subject}.`,
      data: { count: 1 },
    };
  }
  return {
    content: `Oggi sono arrivate ${incassi.length} email su pagamenti, la prima è di ${incassi[0].senderName || incassi[0].sender}.`,
    data: { count: incassi.length },
  };
}

// Report mensile: dati REALI da pagamenti_clienti aggregato + email IRIS
export async function handleChartaReportMensile(parametri, ctx) {
  // Parsing flessibile: oltre al formato 2026-04 supporta nomi mesi italiani.
  // Il messaggio dell'utente è la fonte più ricca quando Haiku non passa il mese pulito.
  const userMessage = String((ctx && ctx.userMessage) || "");
  const MESI_IT = {
    gennaio: "01", febbraio: "02", marzo: "03", aprile: "04",
    maggio: "05", giugno: "06", luglio: "07", agosto: "08",
    settembre: "09", ottobre: "10", novembre: "11", dicembre: "12",
  };
  let yyyymm = String(parametri.mese || parametri.yyyymm || parametri.periodo || "").trim();

  // Cerca pattern "<mese italiano> <anno>" prima nel param, poi nel messaggio
  function tryParseItalian(s) {
    const lo = String(s || "").toLowerCase();
    const re = /\b(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)(?:\s+(\d{4}))?/i;
    const m = lo.match(re);
    if (!m) return null;
    const mese = MESI_IT[m[1].toLowerCase()];
    const anno = m[2] || String(new Date().getFullYear());
    return `${anno}-${mese}`;
  }

  const fromParam = tryParseItalian(yyyymm);
  if (fromParam) yyyymm = fromParam;
  if (!yyyymm) {
    const fromMsg = tryParseItalian(userMessage);
    if (fromMsg) yyyymm = fromMsg;
  }
  if (!yyyymm) yyyymm = new Date().toISOString().slice(0, 7);

  if (/^\d{1,2}$/.test(yyyymm)) {
    const anno = new Date().getFullYear();
    yyyymm = `${anno}-${yyyymm.padStart(2, "0")}`;
  } else if (/^\d{4}-\d{1,2}$/.test(yyyymm)) {
    const [a, m] = yyyymm.split("-");
    yyyymm = `${a}-${m.padStart(2, "0")}`;
  }

  const m = /^(\d{4})-(\d{2})$/.exec(yyyymm);
  if (!m) return { content: `Formato mese non valido: ${yyyymm}. Usa formato 2026-04.` };
  const start = new Date(`${yyyymm}-01T00:00:00Z`);
  const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1);
  const meseLabel = start.toLocaleDateString("it-IT", { month: "long", year: "numeric" });

  // Email IRIS del mese
  const emails = await fetchIrisEmails(500);
  let forn = 0, rich = 0, guast = 0, emailMese = 0;
  for (const e of emails) {
    if (!e.received_time) continue;
    const ric = new Date(e.received_time);
    if (ric < start || ric >= end) continue;
    emailMese++;
    if (e.category === "FATTURA_FORNITORE") forn++;
    else if (/RICHIESTA_PAGAMENTO|SOLLECITO/.test(e.category || "")) rich++;
    else if (e.category === "GUASTO_URGENTE") guast++;
  }

  // Interventi del mese (bacheca COSMINA, due nel mese)
  let interventiMese = 0;
  try {
    const cSnap = await getCosminaDb().collection("bacheca_cards")
      .where("listName", "==", "INTERVENTI").limit(800).get();
    cSnap.forEach(d => {
      const v = d.data() || {};
      try {
        const due = v.due?.toDate ? v.due.toDate() : (v.due ? new Date(v.due) : null);
        if (due && due >= start && due < end) interventiMese++;
      } catch {}
    });
  } catch (e) { logger.warn("charta: bacheca read", { error: String(e).slice(0, 80) }); }

  // Dati Guazzotti pagamenti — esposizione corrente + GRTIDF pronti
  let totExp = 0, totScad = 0, grtidfPronti = 0, valoreBloccato = 0;
  try {
    const pSnap = await getGuazzottiDb().collection("pagamenti_clienti").limit(300).get();
    pSnap.forEach(d => {
      const v = d.data() || {};
      totExp += Number(v.TotaleEsposizione || 0);
      totScad += Number(v.TotaleScaduto || 0);
    });
  } catch (e) { logger.warn("charta: pagamenti read", { error: String(e).slice(0, 80) }); }
  try {
    const rSnap = await getGuazzottiDb().collection("rtidf").limit(400).get();
    rSnap.forEach(d => {
      const v = d.data() || {};
      const tipo = String(v.tipo || "").toLowerCase();
      const stato = String(v.stato || "").toLowerCase();
      const isGen = tipo === "generico" || String(v.numero_rtidf || "").toUpperCase().startsWith("GRTIDF");
      if (isGen && stato === "inviato" && v.fatturabile !== false) {
        grtidfPronti++;
        valoreBloccato += Number(v.costo_intervento || 0);
      }
    });
  } catch (e) { logger.warn("charta: rtidf read", { error: String(e).slice(0, 80) }); }

  const parts = [];
  parts.push(`Report ${meseLabel}: ${emailMese} email indicizzate, ${interventiMese} interventi pianificati.`);
  if (forn || rich || guast) {
    const bits = [];
    if (forn) bits.push(`${forn} fatture fornitori`);
    if (rich) bits.push(`${rich} richieste pagamento`);
    if (guast) bits.push(`${guast} guasti urgenti`);
    parts.push(`Tra le email: ${bits.join(", ")}.`);
  }
  if (totExp > 0) {
    parts.push(`Esposizione clienti totale ${Math.round(totExp).toLocaleString("it-IT")} euro, scaduto ${Math.round(totScad).toLocaleString("it-IT")} euro.`);
  }
  if (grtidfPronti > 0) {
    parts.push(`In più, ${grtidfPronti} GRTIDF pronti da fatturare per ${Math.round(valoreBloccato).toLocaleString("it-IT")} euro bloccati.`);
  }
  return {
    content: parts.join(" "),
    data: { yyyymm, emailMese, interventiMese, forn, rich, guast, totExp, totScad, grtidfPronti, valoreBloccato },
  };
}
