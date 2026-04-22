// handlers/delphi.js — KPI, confronti temporali, costo AI.
import {
  db, getCosminaDb, fetchIrisEmails, CATEGORIE_URGENTI_SET,
} from "./shared.js";

export async function handleDelphiKpi(parametri) {
  const finestraSett = Number(parametri.finestraSettimane) || 4;
  const now = new Date();
  const from = new Date(now.getTime() - finestraSett * 7 * 86400000);

  const emails = await fetchIrisEmails(500);
  let urg = 0, senzaRisposta = 0;
  for (const e of emails) {
    if (CATEGORIE_URGENTI_SET.has(e.category)) urg++;
    if ((e.followup || {}).needsAttention) senzaRisposta++;
  }

  let lavMsgCount = 0;
  try {
    const lavSnap = await db.collection("nexo_lavagna")
      .orderBy("createdAt", "desc").limit(200).get();
    lavSnap.forEach(d => {
      const ca = (d.data() || {}).createdAt;
      const dd = ca?.toDate ? ca.toDate() : (ca ? new Date(ca) : null);
      if (dd && dd >= from) lavMsgCount++;
    });
  } catch {}

  let attivi = 0, completati = 0;
  try {
    const cSnap = await getCosminaDb().collection("bacheca_cards")
      .where("listName", "==", "INTERVENTI").where("inBacheca", "==", true)
      .limit(500).get();
    cSnap.forEach(d => {
      const data = d.data() || {};
      const stato = String(data.stato || "").toLowerCase();
      if (stato.includes("complet")) {
        const upd = data.updated_at?.toDate ? data.updated_at.toDate()
          : data.updated_at ? new Date(data.updated_at) : null;
        if (upd && upd >= from) completati++;
      } else if (!stato.includes("annul")) attivi++;
    });
  } catch {}

  const lines = [
    `📊 **DELPHI — KPI ultimi ${finestraSett * 7} giorni**`,
    ``,
    `**Email**`,
    `  · Indicizzate: ${emails.length}`,
    `  · Urgenti: ${urg}`,
    `  · Senza risposta >48h: ${senzaRisposta}`,
    ``,
    `**Lavagna**`,
    `  · Messaggi: ${lavMsgCount}`,
    ``,
    `**Interventi COSMINA**`,
    `  · Attivi ora: ${attivi}`,
    `  · Completati: ${completati}`,
  ];
  return {
    content: lines.join("\n"),
    data: { emails: emails.length, urgenti: urg, senzaRisposta, lavMsgCount, attivi, completati },
  };
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
