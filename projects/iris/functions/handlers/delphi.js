// handlers/delphi.js — KPI, confronti temporali, costo AI.
import {
  db, getCosminaDb, getGuazzottiDb, fetchIrisEmails, CATEGORIE_URGENTI_SET, logger,
} from "./shared.js";

export async function handleDelphiKpi(parametri) {
  const finestraSett = Number(parametri.finestraSettimane) || 4;
  const now = new Date();
  const from = new Date(now.getTime() - finestraSett * 7 * 86400000);

  // Parallelizza letture cross-source
  const [emails, lavCount, cosmStats, guazStats] = await Promise.all([
    fetchIrisEmails(500),
    countLavagnaMessages(from),
    countCosminaInterventi(from),
    countGuazzottiRtiEsposizione(),
  ]);

  let urg = 0, senzaRisposta = 0;
  for (const e of emails) {
    if (CATEGORIE_URGENTI_SET.has(e.category)) urg++;
    if ((e.followup || {}).needsAttention) senzaRisposta++;
  }

  const lines = [
    `📊 **DELPHI — KPI ultimi ${finestraSett * 7} giorni** (cross-source)`,
    ``,
    `**📧 Email (IRIS)**`,
    `  · Indicizzate: ${emails.length}`,
    `  · Urgenti: ${urg}`,
    `  · Senza risposta >48h: ${senzaRisposta}`,
    ``,
    `**🗒️ Lavagna**`,
    `  · Messaggi nel periodo: ${lavCount}`,
    ``,
    `**🔧 Interventi COSMINA**`,
    `  · Attivi ora: ${cosmStats.attivi}`,
    `  · Completati periodo: ${cosmStats.completati}`,
    ``,
    `**📋 Guazzotti TEC**`,
    `  · RTI totali: ${guazStats.rtiTot} · RTIDF totali: ${guazStats.rtidfTot}`,
    `  · GRTIDF pronti fatturazione (fatturabili): ${guazStats.grtidfPronti} docs = **€ ${guazStats.valoreBloccato.toFixed(2)}**`,
    `  · Esposizione totale clienti: € ${guazStats.esposTot.toFixed(2)}`,
    `  · Scaduto clienti: € ${guazStats.scadutoTot.toFixed(2)}`,
  ];
  return {
    content: lines.join("\n"),
    data: {
      emails: emails.length, urgenti: urg, senzaRisposta,
      lavMsgCount: lavCount,
      attivi: cosmStats.attivi, completati: cosmStats.completati,
      guazzotti: guazStats,
    },
  };
}

async function countLavagnaMessages(from) {
  try {
    const snap = await db.collection("nexo_lavagna").orderBy("createdAt", "desc").limit(200).get();
    let n = 0;
    snap.forEach(d => {
      const ca = (d.data() || {}).createdAt;
      const dd = ca?.toDate ? ca.toDate() : (ca ? new Date(ca) : null);
      if (dd && dd >= from) n++;
    });
    return n;
  } catch { return 0; }
}

async function countCosminaInterventi(from) {
  try {
    const cSnap = await getCosminaDb().collection("bacheca_cards")
      .where("listName", "==", "INTERVENTI").where("inBacheca", "==", true)
      .limit(500).get();
    let attivi = 0, completati = 0;
    cSnap.forEach(d => {
      const data = d.data() || {};
      const stato = String(data.stato || "").toLowerCase();
      if (stato.includes("complet")) {
        const upd = data.updated_at?.toDate ? data.updated_at.toDate()
          : data.updated_at ? new Date(data.updated_at) : null;
        if (upd && upd >= from) completati++;
      } else if (!stato.includes("annul")) attivi++;
    });
    return { attivi, completati };
  } catch { return { attivi: 0, completati: 0 }; }
}

async function countGuazzottiRtiEsposizione() {
  const out = { rtiTot: 0, rtidfTot: 0, grtidfPronti: 0, valoreBloccato: 0, esposTot: 0, scadutoTot: 0 };
  const gdb = getGuazzottiDb();
  try {
    const rtiSnap = await gdb.collection("rti").limit(700).get();
    out.rtiTot = rtiSnap.size;
  } catch (e) { logger.warn("delphi: rti read", { error: String(e).slice(0, 80) }); }
  try {
    const rtidfSnap = await gdb.collection("rtidf").limit(400).get();
    out.rtidfTot = rtidfSnap.size;
    rtidfSnap.forEach(d => {
      const v = d.data() || {};
      const tipo = String(v.tipo || "").toLowerCase();
      const stato = String(v.stato || "").toLowerCase();
      const isGen = tipo === "generico" || String(v.numero_rtidf || "").toUpperCase().startsWith("GRTIDF");
      if (isGen && stato === "inviato" && v.fatturabile !== false) {
        out.grtidfPronti++;
        const c = Number(v.costo_intervento || 0);
        if (!Number.isNaN(c)) out.valoreBloccato += c;
      }
    });
    out.valoreBloccato = Math.round(out.valoreBloccato * 100) / 100;
  } catch (e) { logger.warn("delphi: rtidf read", { error: String(e).slice(0, 80) }); }
  try {
    const pSnap = await gdb.collection("pagamenti_clienti").limit(300).get();
    pSnap.forEach(d => {
      const v = d.data() || {};
      out.esposTot += Number(v.TotaleEsposizione || 0);
      out.scadutoTot += Number(v.TotaleScaduto || 0);
    });
    out.esposTot = Math.round(out.esposTot * 100) / 100;
    out.scadutoTot = Math.round(out.scadutoTot * 100) / 100;
  } catch (e) { logger.warn("delphi: pagamenti read", { error: String(e).slice(0, 80) }); }
  return out;
}

export async function handleDelphiConfrontoMoM() {
  const now = new Date();
  const inizioQ = new Date(now.getFullYear(), now.getMonth(), 1);
  const inizioP = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const fineP = new Date(inizioQ.getTime() - 1);

  const snap = await db.collection("iris_emails")
    .orderBy("raw.received_time", "desc").limit(500).get();
  const all = [];
  snap.forEach(d => {
    const x = d.data() || {};
    const iso = (x.raw || {}).received_time;
    if (!iso) return;
    all.push({
      ts: new Date(iso),
      cat: (x.classification || {}).category || "",
      nr: !!(x.followup || {}).needsAttention,
    });
  });

  function bucket(from, to) {
    let tot = 0, urg = 0, senzaR = 0;
    for (const e of all) {
      if (e.ts < from || e.ts > to) continue;
      tot++;
      if (e.cat === "GUASTO_URGENTE" || e.cat === "PEC_UFFICIALE") urg++;
      if (e.nr) senzaR++;
    }
    return { tot, urg, senzaR };
  }
  function deltaPct(c, p) { return p === 0 ? (c === 0 ? 0 : 100) : Math.round(((c - p) / p) * 100); }
  function arrow(d) {
    if (d > 5) return `📈 +${d}%`;
    if (d < -5) return `📉 ${d}%`;
    return `➡️ ${d >= 0 ? "+" : ""}${d}%`;
  }

  const q = bucket(inizioQ, now);
  const p = bucket(inizioP, fineP);
  const mQ = inizioQ.toISOString().slice(0, 7);
  const mP = inizioP.toISOString().slice(0, 7);

  return {
    content:
      `📊 **Confronto ${mQ} vs ${mP}** (IRIS)\n\n` +
      `  · Email: ${q.tot} vs ${p.tot} ${arrow(deltaPct(q.tot, p.tot))}\n` +
      `  · Urgenti: ${q.urg} vs ${p.urg} ${arrow(deltaPct(q.urg, p.urg))}\n` +
      `  · Senza risposta >48h: ${q.senzaR} vs ${p.senzaR} ${arrow(deltaPct(q.senzaR, p.senzaR))}`,
    data: { mQ, mP, q, p },
  };
}

export async function handleDelphiCostoAI(parametri) {
  const finestraGiorni = Number(parametri.finestraGiorni) || 30;
  const now = new Date();
  const from = new Date(now.getTime() - finestraGiorni * 86400000);

  try {
    const snap = await getCosminaDb().collection("cosmina_config").doc("ai_usage").get();
    if (snap.exists) {
      const d = snap.data() || {};
      const costo = Number(d.costoTotale || 0);
      const ti = Number(d.tokenInput || 0);
      const to = Number(d.tokenOutput || 0);
      return {
        content:
          `💳 **Costo AI** (finestra ${finestraGiorni}g, fonte: cosmina_config)\n\n` +
          `  · Input tokens: ${ti.toLocaleString("it-IT")}\n` +
          `  · Output tokens: ${to.toLocaleString("it-IT")}\n` +
          `  · **Costo totale stimato: € ${costo.toFixed(2)}**`,
        data: { fonte: "cosmina_config", costo },
      };
    }
  } catch {}

  let tokenInput = 0, tokenOutput = 0, chiamate = 0;
  try {
    const snap = await db.collection("nexus_chat")
      .where("role", "==", "assistant").limit(500).get();
    snap.forEach(d => {
      const data = d.data() || {};
      const ts = data.timestamp?.toDate ? data.timestamp.toDate()
        : data.timestamp ? new Date(data.timestamp) : null;
      if (ts && ts < from) return;
      const u = data.usage || {};
      tokenInput += Number(u.inputTokens || 0);
      tokenOutput += Number(u.outputTokens || 0);
      chiamate++;
    });
  } catch {}

  const costoUsd = (tokenInput / 1e6) * 0.80 + (tokenOutput / 1e6) * 4;
  const costoEur = (costoUsd * 0.92).toFixed(4);
  return {
    content:
      `💳 **Costo AI** (finestra ${finestraGiorni}g, fonte: nexus_chat)\n\n` +
      `  · Chiamate NEXUS: ${chiamate}\n` +
      `  · Input tokens: ${tokenInput.toLocaleString("it-IT")}\n` +
      `  · Output tokens: ${tokenOutput.toLocaleString("it-IT")}\n` +
      `  · **Costo stimato Haiku 4.5: € ${costoEur}**\n\n` +
      `_Non sono inclusi costi IRIS/CALLIOPE. Per dato completo: \`cosmina_config/ai_usage\`._`,
    data: { tokenInput, tokenOutput, chiamate, costoEur },
  };
}
