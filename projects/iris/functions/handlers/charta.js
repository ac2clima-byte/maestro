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
    return { content: `💰 Nessun cliente trovato per "${q}" in pagamenti_clienti (Guazzotti TEC).` };
  }

  const top = matches.sort((a, b) => b.esposizione - a.esposizione).slice(0, 5);
  const lines = top.map(m =>
    `**${m.nome}** [${m.codice}]\n` +
    `  · Esposizione: € ${m.esposizione.toFixed(2)} (scaduto: € ${m.scaduto.toFixed(2)}, a scadere: € ${m.scadenzaCorrente.toFixed(2)})\n` +
    `  · Aging: 30g=${m.scaduto30.toFixed(0)} · 60g=${m.scaduto60.toFixed(0)} · 90g=${m.scaduto90.toFixed(0)} · oltre=${m.scadutoOltre.toFixed(0)}\n` +
    `  · Risk: ${m.riskLevel || "?"} · Rif: ${m.dataRif || "?"}`
  ).join("\n\n");
  return {
    content: `💰 **Esposizione "${q}"** (${matches.length} match, top 5):\n\n${lines}`,
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

export async function handleFattureScadute() {
  const emails = await fetchIrisEmails(500);
  const fatt = emails.filter(e => e.category === "FATTURA_FORNITORE");
  const rich = emails.filter(e => e.category === "RICHIESTA_PAGAMENTO");
  const parts = [`💰 **CHARTA v0.1** — dati da email indicizzate (Fatture-in-Cloud non ancora integrato)`];
  parts.push(`\n📥 ${fatt.length} fatture fornitori + ${rich.length} richieste pagamento.`);
  if (fatt.length) {
    const lines = fatt.slice(0, 5).map(emailLine).join("\n");
    parts.push(`\nUltime fatture ricevute:\n${lines}`);
  }
  return { content: parts.join("\n"), data: { fatture: fatt.length, richieste: rich.length } };
}

export async function handleChartaIncassiOggi() {
  const emails = await fetchIrisEmails(300);
  const today = emails.filter(e => isToday(e.received_time));
  const incassi = today.filter(e =>
    /pagament|incass|bonifico|accredit|saldo/i.test(`${e.subject} ${e.summary}`),
  );
  if (!incassi.length) {
    return { content: "💰 Oggi non ho indicizzato email che segnalano incassi." };
  }
  const lines = incassi.slice(0, 8).map(emailLine).join("\n");
  return {
    content: `💰 **${incassi.length} email oggi** con keyword incasso/pagamento:\n\n${lines}\n\n_CHARTA v0.1: per importi reali serve Fatture-in-Cloud._`,
    data: { count: incassi.length },
  };
}

export async function handleChartaReportMensile(parametri) {
  let yyyymm = String(parametri.mese || parametri.yyyymm || parametri.periodo || "").trim()
    || new Date().toISOString().slice(0, 7);
  if (/^\d{1,2}$/.test(yyyymm)) {
    const anno = new Date().getFullYear();
    yyyymm = `${anno}-${yyyymm.padStart(2, "0")}`;
  } else if (/^\d{4}-\d{1,2}$/.test(yyyymm)) {
    const [a, m] = yyyymm.split("-");
    yyyymm = `${a}-${m.padStart(2, "0")}`;
  }
  const emails = await fetchIrisEmails(500);

  const m = /^(\d{4})-(\d{2})$/.exec(yyyymm);
  if (!m) return { content: `Formato mese non valido: "${yyyymm}". Usa YYYY-MM.` };
  const start = new Date(`${yyyymm}-01T00:00:00Z`);
  const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1);

  let forn = 0, rich = 0, guast = 0, contr = 0;
  for (const e of emails) {
    if (!e.received_time) continue;
    const ric = new Date(e.received_time);
    if (ric < start || ric >= end) continue;
    if (e.category === "FATTURA_FORNITORE") forn++;
    else if (e.category === "RICHIESTA_PAGAMENTO") rich++;
    else if (e.category === "GUASTO_URGENTE") guast++;
    else if (e.category === "RICHIESTA_CONTRATTO") contr++;
  }

  return {
    content:
      `📊 **Report mensile ${yyyymm}** (CHARTA v0.1, dati da iris_emails):\n\n` +
      `  · Fatture fornitori: ${forn}\n` +
      `  · Richieste pagamento: ${rich}\n` +
      `  · Guasti urgenti: ${guast}\n` +
      `  · Richieste contratto: ${contr}\n\n` +
      `_Totali € reali arriveranno con integrazione Fatture-in-Cloud._`,
    data: { yyyymm, forn, rich, guast, contr },
  };
}
