// handlers/echo-digest.js — digest mattutino automatico (07:30 CET).
// Raccoglie dati da IRIS + ARES + PHARO + CHRONOS, manda WA ad Alberto.
// DRY_RUN di default: flag cosmina_config/echo_config.digest_enabled (default true).
import {
  db, FieldValue, logger,
  getCosminaDb, getGuazzottiDb, fetchIrisEmails,
  CATEGORIE_URGENTI_SET,
} from "./shared.js";
import { handleEchoWhatsApp } from "./echo.js";

async function loadDigestConfig() {
  try {
    const snap = await getCosminaDb().collection("cosmina_config").doc("echo_config").get();
    return snap.exists ? (snap.data() || {}) : {};
  } catch {
    return {};
  }
}

async function raccogliIris() {
  const emails = await fetchIrisEmails(200);
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  let totali = 0, urgenti = 0;
  const topUrgenti = [];
  for (const e of emails) {
    if (!e.received_time) continue;
    const ts = new Date(e.received_time);
    if (ts < since) continue;
    totali++;
    if (CATEGORIE_URGENTI_SET.has(e.category)) {
      urgenti++;
      if (topUrgenti.length < 3) {
        topUrgenti.push(`${e.senderName || e.sender}: ${(e.subject || "").slice(0, 50)}`);
      }
    }
  }
  return { totali, urgenti, topUrgenti };
}

async function raccogliAres() {
  try {
    const snap = await getCosminaDb().collection("bacheca_cards")
      .where("listName", "==", "INTERVENTI").where("inBacheca", "==", true)
      .limit(300).get();
    const today = new Date();
    let oggi = 0;
    const perTecnico = {};
    snap.forEach(d => {
      const v = d.data() || {};
      const stato = String(v.stato || "").toLowerCase();
      if (stato.includes("complet") || stato.includes("annul")) return;
      const due = v.due ? (v.due.toDate ? v.due.toDate() : new Date(v.due)) : null;
      if (!due) return;
      const same = due.getFullYear() === today.getFullYear() &&
                   due.getMonth() === today.getMonth() && due.getDate() === today.getDate();
      if (!same) return;
      oggi++;
      let tec = v.techName || (Array.isArray(v.techNames) && v.techNames[0]) || "non_assegnato";
      perTecnico[tec] = (perTecnico[tec] || 0) + 1;
    });
    return { oggi, perTecnico };
  } catch (e) {
    logger.warn("digest: ares failed", { error: String(e) });
    return { oggi: 0, perTecnico: {} };
  }
}

async function raccogliPharo() {
  try {
    const snap = await db.collection("pharo_alerts")
      .where("status", "==", "active").limit(20).get();
    const alerts = [];
    snap.forEach(d => {
      const v = d.data() || {};
      alerts.push({ severita: v.severita || "info", titolo: v.titolo || "?" });
    });
    return { totali: alerts.length, critical: alerts.filter(a => a.severita === "critical").length, alerts };
  } catch (e) {
    return { totali: 0, critical: 0, alerts: [] };
  }
}

async function raccogliChronos() {
  try {
    const snap = await getCosminaDb().collection("cosmina_impianti").limit(300).get();
    const today = new Date();
    const in7 = new Date(today.getTime() + 7 * 86400000);
    let entro7 = 0;
    snap.forEach(d => {
      const v = d.data() || {};
      const scad = v.data_prossima_manutenzione || v.data_scadenza || v.scadenza_curit;
      if (!scad) return;
      try {
        const s = scad.toDate ? scad.toDate() : new Date(scad);
        if (s >= today && s <= in7) entro7++;
      } catch {}
    });
    return { entro7 };
  } catch (e) {
    return { entro7: 0 };
  }
}

function formattaDigest({ iris, ares, pharo, chronos }) {
  const parts = ["Buongiorno."];
  if (iris.totali > 0) {
    let p = `Stanotte ${iris.totali} email`;
    if (iris.urgenti > 0) p += ` (${iris.urgenti} urgent${iris.urgenti === 1 ? "e" : "i"}`;
    if (iris.topUrgenti.length) p += `: ${iris.topUrgenti[0]}`;
    if (iris.urgenti > 0) p += ")";
    parts.push(p + ".");
  }
  if (ares.oggi > 0) {
    const byTec = Object.entries(ares.perTecnico)
      .map(([t, n]) => `${t} ${n}`).join(", ");
    parts.push(`Oggi ${ares.oggi} interventi pianificati (${byTec}).`);
  }
  if (pharo.totali > 0) {
    const critLabel = pharo.critical > 0 ? ` (${pharo.critical} critical)` : "";
    parts.push(`${pharo.totali} alert PHARO attivi${critLabel}.`);
  }
  if (chronos.entro7 > 0) {
    parts.push(`${chronos.entro7} scadenze manutenzione entro 7 giorni.`);
  }
  if (iris.totali === 0 && ares.oggi === 0 && pharo.totali === 0 && chronos.entro7 === 0) {
    parts.push("Tutto tranquillo — nessuna urgenza.");
  }
  return parts.join(" ");
}

export async function runDigestMattutino(opts = {}) {
  const cfg = await loadDigestConfig();
  const enabled = cfg.digest_enabled !== false; // default true
  if (!enabled && !opts.force) {
    logger.info("echoDigestMattutino: disabled via cosmina_config/echo_config.digest_enabled=false");
    return { skipped: "disabled" };
  }

  const [iris, ares, pharo, chronos] = await Promise.all([
    raccogliIris().catch(() => ({ totali: 0, urgenti: 0, topUrgenti: [] })),
    raccogliAres().catch(() => ({ oggi: 0, perTecnico: {} })),
    raccogliPharo().catch(() => ({ totali: 0, critical: 0, alerts: [] })),
    raccogliChronos().catch(() => ({ entro7: 0 })),
  ]);

  const testo = formattaDigest({ iris, ares, pharo, chronos });
  logger.info("echoDigestMattutino: generated", { testo, iris, ares, pharo, chronos });

  // Persisti snapshot
  try {
    await db.collection("echo_digest_log").add({
      testo,
      data_riepilogo: { iris, ares, pharo, chronos },
      sent: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (e) { logger.warn("digest log write failed", { error: String(e) }); }

  // Manda WA ad Alberto (DRY_RUN rispettato da handleEchoWhatsApp via echo_config)
  try {
    const result = await handleEchoWhatsApp(
      { to: "Alberto", body: testo },
      { userMessage: `digest mattutino automatico` },
    );
    logger.info("echoDigestMattutino: WA handler result", {
      contentPreview: String(result?.content || "").slice(0, 200),
      dryRun: result?.data?.dryRun,
    });
    return { ok: true, testo, waResult: result?.data || null };
  } catch (e) {
    logger.error("echoDigestMattutino: WA failed", { error: String(e) });
    return { ok: false, testo, error: String(e).slice(0, 200) };
  }
}
