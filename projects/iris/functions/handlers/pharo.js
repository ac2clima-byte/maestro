// handlers/pharo.js — monitoring + alert RTI (PHARO).
import {
  db, FieldValue, logger,
  getGuazzottiDb, parseDocDate, classifyRtiTipo, fetchIrisEmails,
} from "./shared.js";

// Stato suite NEXO (non RTI).
export async function handlePharoStatoSuite() {
  let pending = 0, errori = 0, emailAttesa = 0, emails = 0, firestoreOk = true;

  try {
    const snap = await db.collection("nexo_lavagna")
      .orderBy("createdAt", "desc").limit(100).get();
    snap.forEach(d => {
      const s = (d.data() || {}).status;
      if (s === "pending" || s === "in_progress") pending++;
      else if (s === "failed" || s === "error" || s === "errore") errori++;
    });
  } catch { firestoreOk = false; }

  try {
    const snap = await db.collection("iris_emails")
      .orderBy("raw.received_time", "desc").limit(500).get();
    snap.forEach(d => {
      emails++;
      const f = (d.data() || {}).followup;
      if (f && f.needsAttention) emailAttesa++;
    });
  } catch { firestoreOk = false; }

  const punteggio = firestoreOk
    ? Math.max(0, Math.min(100, 100 - pending * 2 - errori * 5 - emailAttesa))
    : 0;

  // Risposta naturale, discorsiva
  const parts = [];
  if (!firestoreOk) {
    parts.push("Firestore sembra avere problemi, non riesco a leggere tutto.");
  } else if (punteggio >= 80) {
    parts.push("La suite è a posto.");
  } else if (punteggio >= 50) {
    parts.push("La suite funziona ma ha qualche arretrato.");
  } else {
    parts.push("La suite è congestionata.");
  }

  const bits = [];
  if (emails) bits.push(`${emails} email indicizzate`);
  if (emailAttesa) bits.push(`${emailAttesa} senza risposta da più di due giorni`);
  if (pending) bits.push(`${pending} messaggi pending sulla lavagna`);
  if (errori) bits.push(`${errori} in errore`);
  if (bits.length) parts.push(bits.join(", ") + ".");

  if (punteggio < 80 && (pending > 10 || emailAttesa > 10)) {
    const cosa = pending > 10 ? "i messaggi pending" : "le email arretrate";
    parts.push(`Vuoi che proviamo a ripulire ${cosa}?`);
  }

  return {
    content: parts.join(" "),
    data: { punteggio, pending, errori, emailAttesa, emails, firestoreOk },
  };
}

export async function handlePharoProblemiAperti() {
  const emails = await fetchIrisEmails(500);
  const att = emails.filter(e => (e.followup || {}).needsAttention);

  let lavFailed = [];
  try {
    const snap = await db.collection("nexo_lavagna")
      .orderBy("createdAt", "desc").limit(50).get();
    snap.forEach(d => {
      const v = d.data() || {};
      if (["failed", "error", "errore"].includes(v.status)) {
        lavFailed.push(`${v.from || "?"} → ${v.to || "?"}: ${v.type || "?"}`);
      }
    });
  } catch {}

  if (!att.length && !lavFailed.length) {
    return { content: "Tutto sotto controllo, niente di aperto al momento." };
  }
  const parts = [];
  if (att.length) {
    const primo = att[0];
    const chi = primo.senderName || primo.sender || "qualcuno";
    const gg = primo.followup?.daysWithoutReply || 0;
    if (att.length === 1) parts.push(`Una email è in attesa da ${gg} giorni, di ${chi}.`);
    else parts.push(`Ci sono ${att.length} email senza risposta da più di due giorni, la più vecchia è di ${chi} (${gg} giorni).`);
  }
  if (lavFailed.length) {
    parts.push(`Sulla lavagna ci sono ${lavFailed.length} messaggi in errore.`);
  }
  parts.push(`Vuoi che ti elenchi i principali?`);
  return { content: parts.join(" "), data: { emailCount: att.length, lavFailedCount: lavFailed.length } };
}

// ─── PHARO RTI Monitoring (Guazzotti TEC) ──────────────────────
//
// Regole business:
//   - stato `rtidf_fatturato` (RTI) e `fatturato` (RTIDF) → escludi dagli alert
//   - `fatturabile === false` → escludi
//   - CRTIDF senza costo_intervento è NORMALE → alert solo su GRTIDF
export async function handlePharoRtiMonitoring(parametri = {}) {
  const now = new Date();
  const DAY7 = new Date(now.getTime() - 7 * 86400000);
  const DAY3 = new Date(now.getTime() - 3 * 86400000);
  const DAY14 = new Date(now.getTime() - 14 * 86400000);
  const DAY30 = new Date(now.getTime() - 30 * 86400000);

  const out = {
    ok: true,
    scan_at: now.toISOString(),
    rti_gen: { total: 0, bozza: 0, definito: 0, rtidf_presente: 0, rtidf_inviato: 0, rtidf_fatturato: 0, da_verificare: 0, non_fatturabili: 0 },
    rti_con: { total: 0, bozza: 0, definito: 0, rtidf_presente: 0, rtidf_inviato: 0, non_fatturabili: 0 },
    rtidf_gen: { total: 0, bozza: 0, definito: 0, inviato: 0, fatturato: 0, senza_costo: 0 },
    rtidf_con: { total: 0, bozza: 0, definito: 0, inviato: 0, fatturato: 0 },
    alerts_metrics: {
      grtidf_pronti_fattura: { count: 0, valore_eur: 0 },
      grtidf_senza_costo: 0,
      grti_definito_senza_grtidf: 0,
      crti_definito_senza_crtidf: 0,
      crti_bozza_30g: 0,
      tickets_aperti_30g_no_rti: 0,
    },
    rti: { total: 0, bozza: 0, definito: 0, rtidf_presente: 0, rtidf_inviato: 0, rtidf_fatturato: 0, bozza_vecchi_7g: 0 },
    rtidf: { total: 0, bozza: 0, definito: 0, inviato: 0, fatturato: 0 },
    pending: { total: 0, old_3g: 0 },
    tickets: { total: 0, aperti: 0, aperti_vecchi_14g: 0, aperti_vecchi_30g: 0, senza_rti: 0 },
    pagamenti: { total: 0 },
    tabella_rti: [],
    stats: { rti_per_mese: {}, tempo_medio_rti_rtidf_giorni: null, top_tecnici: [] },
    warnings: [],
    errors: [],
    business_rules: {
      stati_rti_esclusi: ["rtidf_fatturato"],
      stati_rtidf_esclusi: ["fatturato"],
      filtro_fatturabile: "esclude fatturabile=false",
      crtidf_senza_costo: "non_e_alert_ripartizione_millesimi",
    },
  };

  const gdb = getGuazzottiDb();

  let rtiDocs = [];
  let rtidfDocs = [];
  try {
    const snap = await gdb.collection("rti").limit(700).get();
    rtiDocs = snap.docs.map(d => ({ _id: d.id, ...(d.data() || {}) }));
    out.rti.total = rtiDocs.length;
  } catch (e) {
    out.errors.push({ collection: "rti", error: String(e).slice(0, 200) });
  }
  try {
    const snap = await gdb.collection("rtidf").limit(400).get();
    rtidfDocs = snap.docs.map(d => ({ _id: d.id, ...(d.data() || {}) }));
    out.rtidf.total = rtidfDocs.length;
  } catch (e) {
    out.errors.push({ collection: "rtidf", error: String(e).slice(0, 200) });
  }

  const rtidfGenByNum = new Map();
  const rtidfGenById = new Map();
  const rtidfConByNum = new Map();
  const rtidfConById = new Map();
  rtidfDocs.forEach(v => {
    const tipo = classifyRtiTipo(v, "rtidf");
    const num = String(v.numero_rti_origine || "");
    const rid = String(v.rti_origine_id || "");
    if (tipo === "generico") {
      if (num) rtidfGenByNum.set(num, v);
      if (rid) rtidfGenById.set(rid, v);
    } else if (tipo === "contabilizzazione") {
      if (num) rtidfConByNum.set(num, v);
      if (rid) rtidfConById.set(rid, v);
    }
  });

  rtidfDocs.forEach(v => {
    const tipo = classifyRtiTipo(v, "rtidf");
    const stato = String(v.stato || "").toLowerCase();
    const bucket = tipo === "generico" ? out.rtidf_gen : tipo === "contabilizzazione" ? out.rtidf_con : null;
    if (bucket) {
      bucket.total++;
      if (stato === "bozza") bucket.bozza++;
      else if (stato === "definito" || stato === "definitivo") bucket.definito++;
      else if (stato === "inviato") bucket.inviato++;
      else if (stato === "fatturato") bucket.fatturato++;
    }
    if (stato === "bozza") out.rtidf.bozza++;
    else if (stato === "definito" || stato === "definitivo") out.rtidf.definito++;
    else if (stato === "inviato") out.rtidf.inviato++;
    else if (stato === "fatturato") out.rtidf.fatturato++;

    if (tipo === "generico" && stato === "inviato" && v.fatturabile !== false) {
      out.alerts_metrics.grtidf_pronti_fattura.count++;
      const c = Number(v.costo_intervento || 0);
      if (!Number.isNaN(c)) out.alerts_metrics.grtidf_pronti_fattura.valore_eur += c;
    }

    if (tipo === "generico" && stato !== "bozza" && stato !== "fatturato" && v.fatturabile !== false) {
      const c = Number(v.costo_intervento || 0);
      if (!c || c === 0) {
        out.rtidf_gen.senza_costo++;
        out.alerts_metrics.grtidf_senza_costo++;
      }
    }
  });

  out.alerts_metrics.grtidf_pronti_fattura.valore_eur =
    Math.round(out.alerts_metrics.grtidf_pronti_fattura.valore_eur * 100) / 100;

  const rtiRows = [];
  const perMese = {};
  const perTecnico = {};
  rtiDocs.forEach(v => {
    const tipo = classifyRtiTipo(v, "rti");
    const stato = String(v.stato || "").toLowerCase();
    const bucket = tipo === "generico" ? out.rti_gen : tipo === "contabilizzazione" ? out.rti_con : null;
    if (bucket) {
      bucket.total++;
      if (stato === "bozza") bucket.bozza++;
      else if (stato === "definito") bucket.definito++;
      else if (stato === "rtidf_presente") bucket.rtidf_presente++;
      else if (stato === "rtidf_inviato") bucket.rtidf_inviato++;
      else if (stato === "rtidf_fatturato" && bucket.rtidf_fatturato !== undefined) bucket.rtidf_fatturato++;
      else if (stato === "da_verificare" && bucket.da_verificare !== undefined) bucket.da_verificare++;
      if (v.fatturabile === false) bucket.non_fatturabili++;
    }
    if (stato === "bozza") out.rti.bozza++;
    else if (stato === "definito") out.rti.definito++;
    else if (stato === "rtidf_presente") out.rti.rtidf_presente++;
    else if (stato === "rtidf_inviato") out.rti.rtidf_inviato++;
    else if (stato === "rtidf_fatturato") out.rti.rtidf_fatturato++;

    const dataRti = parseDocDate(v.data_intervento) || parseDocDate(v.data) || parseDocDate(v.created_at) || parseDocDate(v._lastModified);

    if (stato === "bozza" && dataRti && dataRti < DAY7) out.rti.bozza_vecchi_7g++;

    if (tipo === "contabilizzazione" && stato === "bozza" && dataRti && dataRti < DAY30) {
      out.alerts_metrics.crti_bozza_30g++;
    }

    if (dataRti) {
      const ym = dataRti.toISOString().slice(0, 7);
      perMese[ym] = (perMese[ym] || 0) + 1;
    }
    const tec = String(v.tecnico_intervento || v.tecnico || "").trim();
    if (tec) perTecnico[tec] = (perTecnico[tec] || 0) + 1;

    const num = String(v.numero_rti || "");
    const rid = String(v._id);
    const iid = String(v.id || "");
    let haRtidf = stato.startsWith("rtidf_");
    if (!haRtidf) {
      if (tipo === "generico") {
        haRtidf = rtidfGenByNum.has(num) || rtidfGenById.has(rid) || (iid && rtidfGenById.has(iid));
      } else if (tipo === "contabilizzazione") {
        haRtidf = rtidfConByNum.has(num) || rtidfConById.has(rid) || (iid && rtidfConById.has(iid));
      }
    }

    if (stato === "definito" && !haRtidf && v.fatturabile !== false) {
      if (tipo === "generico") out.alerts_metrics.grti_definito_senza_grtidf++;
      else if (tipo === "contabilizzazione") out.alerts_metrics.crti_definito_senza_crtidf++;
    }

    rtiRows.push({
      id: rid,
      numero_rti: v.numero_rti || rid,
      data: dataRti ? dataRti.toISOString().slice(0, 10) : "",
      stato: stato || "?",
      tipo: tipo || "?",
      fatturabile: v.fatturabile !== false,
      tecnico: tec || "-",
      cliente: String(v.cliente || "").slice(0, 60),
      ha_rtidf: haRtidf,
    });
  });

  rtiRows.sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  out.tabella_rti = rtiRows.slice(0, 50);
  out.stats.rti_per_mese = perMese;
  out.stats.top_tecnici = Object.entries(perTecnico)
    .map(([nome, count]) => ({ nome, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  try {
    const snap = await gdb.collection("pending_rti").limit(200).get();
    out.pending.total = snap.size;
    snap.forEach(d => {
      const v = d.data() || {};
      const created = parseDocDate(v.created_at) || parseDocDate(v.data_invio);
      const stato = String(v.stato || "").toLowerCase();
      if (created && created < DAY3 && stato !== "processed") out.pending.old_3g++;
    });
  } catch (e) {
    out.errors.push({ collection: "pending_rti", error: String(e).slice(0, 200) });
  }

  try {
    const snap = await gdb.collection("tickets").limit(700).get();
    out.tickets.total = snap.size;
    snap.forEach(d => {
      const v = d.data() || {};
      const stato = String(v.stato || "").toLowerCase();
      const isAperto = stato === "aperto" || stato === "pianificato" || stato === "in_attesa" || stato === "da_chiudere";
      if (isAperto) out.tickets.aperti++;

      const dataApertura = parseDocDate(v.data_apertura) || parseDocDate(v.timestamp);
      if (isAperto && dataApertura) {
        if (dataApertura < DAY14) out.tickets.aperti_vecchi_14g++;
        if (dataApertura < DAY30) out.tickets.aperti_vecchi_30g++;
      }
      if (isAperto && !v.rti_inviato && !v.rtiChiusura) out.tickets.senza_rti++;

      if (isAperto && dataApertura && dataApertura < DAY30 && !v.rti_inviato && !v.rtiChiusura) {
        out.alerts_metrics.tickets_aperti_30g_no_rti++;
      }
    });
  } catch (e) {
    out.errors.push({ collection: "tickets", error: String(e).slice(0, 200) });
  }

  try {
    const snap = await gdb.collection("pagamenti_clienti").limit(300).get();
    out.pagamenti.total = snap.size;
  } catch (e) {
    out.errors.push({ collection: "pagamenti_clienti", error: String(e).slice(0, 200) });
  }

  const m = out.alerts_metrics;
  if (m.grtidf_pronti_fattura.count > 0) {
    out.warnings.push({
      severita: "critical",
      titolo: `${m.grtidf_pronti_fattura.count} GRTIDF pronti per fatturazione (${m.grtidf_pronti_fattura.valore_eur} €)`,
      descrizione: "Rapporti generici inviati all'amministratore, in attesa di essere inseriti in commessa/fattura.",
      tipo_target: "generico",
      codice: "A1-G",
    });
  }
  if (m.grtidf_senza_costo > 0) {
    out.warnings.push({
      severita: "critical",
      titolo: `${m.grtidf_senza_costo} GRTIDF senza costo_intervento`,
      descrizione: "Documenti non producibili per fatturazione. Amministrazione deve compilare costo.",
      tipo_target: "generico",
      codice: "A2-G",
    });
  }
  if (m.grti_definito_senza_grtidf > 0) {
    out.warnings.push({
      severita: "critical",
      titolo: `${m.grti_definito_senza_grtidf} GRTI 'definito' senza GRTIDF (fatturabili)`,
      descrizione: "Interventi chiusi ma snapshot fatturazione mai creato. Esclusi non fatturabili.",
      tipo_target: "generico",
      codice: "A3-G",
    });
  }
  if (m.crti_bozza_30g > 0) {
    out.warnings.push({
      severita: "critical",
      titolo: `${m.crti_bozza_30g} bozze CRTI da più di 30 giorni`,
      descrizione: "Backlog contabilizzazioni non ancora finalizzate dal tecnico.",
      tipo_target: "contabilizzazione",
      codice: "A1-C",
    });
  }
  if (m.crti_definito_senza_crtidf > 0) {
    out.warnings.push({
      severita: "warning",
      titolo: `${m.crti_definito_senza_crtidf} CRTI 'definito' senza CRTIDF (fatturabili)`,
      descrizione: "Contabilizzazioni chiuse in attesa di duplicazione in RTIDF.",
      tipo_target: "contabilizzazione",
      codice: "A2-C",
    });
  }
  if (m.tickets_aperti_30g_no_rti > 0) {
    out.warnings.push({
      severita: "critical",
      titolo: `${m.tickets_aperti_30g_no_rti} ticket aperti da più di 30 giorni senza RTI`,
      descrizione: "Interventi in stallo. Verifica urgente con tecnici.",
      tipo_target: "tutti",
      codice: "A4",
    });
  }

  // Risposta naturale invece di report
  const parts = [];
  const valore = m.grtidf_pronti_fattura?.valore_eur || 0;
  const ticketVecchi = out.tickets.aperti_vecchi_30g || 0;
  const critici = out.warnings.filter(w => w.severita === "critical").length;

  // Apertura: situazione RTI
  parts.push(`Su Guazzotti: ${out.rti.total} RTI totali, ${out.rtidf.total} RTIDF, ${out.tickets.aperti} ticket aperti${ticketVecchi ? ` (${ticketVecchi} da oltre 30 giorni)` : ""}.`);

  // Punto chiave: fatturazione bloccata
  if (valore > 0) {
    parts.push(`Ci sono ${valore.toFixed(2)} euro di fatturazione bloccata su ${m.grtidf_pronti_fattura.count || "?"} GRTIDF pronti da inviare.`);
  }

  // Alert: solo il più urgente, in linguaggio naturale
  if (out.warnings.length) {
    const first = out.warnings[0];
    if (critici > 1) {
      parts.push(`Ho ${critici} alert critici, il principale è: ${first.titolo.toLowerCase()}.`);
    } else {
      parts.push(`Un alert: ${first.titolo.toLowerCase()}.`);
    }
    parts.push(`Vuoi l'elenco completo?`);
  } else {
    parts.push(`Nessun alert, è tutto in ordine.`);
  }

  return { content: parts.join(" "), data: out };
}

// Helper per writePharoAlert (usato dallo scheduler pharoCheckRti)
export async function writePharoAlert({ tipo, severita, titolo, descrizione, dati }) {
  const now = FieldValue.serverTimestamp();
  const existingSnap = await db.collection("pharo_alerts")
    .where("tipo", "==", tipo)
    .where("status", "==", "active")
    .limit(1)
    .get();
  if (!existingSnap.empty) {
    const d = existingSnap.docs[0];
    await d.ref.set({
      lastSeenAt: now,
      dati: dati || null,
      count: ((d.data() || {}).count || 1) + 1,
    }, { merge: true });
    return d.id;
  }
  const ref = db.collection("pharo_alerts").doc();
  await ref.set({
    id: ref.id,
    tipo, severita, titolo,
    descrizione: descrizione || "",
    dati: dati || null,
    status: "active",
    source: "pharoCheckRti",
    count: 1,
    createdAt: now,
    lastSeenAt: now,
  });
  return ref.id;
}
