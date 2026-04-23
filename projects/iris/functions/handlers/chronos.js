// handlers/chronos.js — pianificazione (agende, slot, scadenze, campagne).
import { getCosminaDb, logger } from "./shared.js";

// ─── Campagne ─────────────────────────────────────────────────────
// Schema: vedi context/memo-campagne-cosmina.md
//   - cosmina_campagne: anagrafica
//   - bacheca_cards: interventi operativi con campagna_id/campagna_nome
//
// Regole reali COSMINA (verificate via dump SPEGNIMENTO 2026, 407 cards):
//   stato="chiuso"          → completato     (371)
//   stato="aperto" + due<now → scaduto         (7)
//   stato="aperto" + due>=now → programmato    (21)
//   stato="aperto" + no due  → da_programmare  (8)
// + label overrides: DA NON FARE, NON FATTO, ORARIO RIDOTTO (contatore extra)
// Nota: archiviato e inBacheca NON indicano completamento.

function extractLabelNames(card) {
  const labels = card.labels || [];
  return labels.map(l => {
    if (!l) return "";
    if (typeof l === "string") return l.toUpperCase().trim();
    return String(l.name || "").toUpperCase().trim();
  }).filter(Boolean);
}

function classifyCampaignCard(card, now = new Date()) {
  const labels = extractLabelNames(card);
  const stato = String(card.stato || "").toLowerCase();

  // Due date
  let due = null;
  if (card.due) {
    try {
      due = card.due.toDate ? card.due.toDate() : new Date(card.due);
      if (Number.isNaN(due.getTime())) due = null;
    } catch { due = null; }
  }

  // Label overrides (hanno priorità sui derivati)
  if (labels.includes("DA NON FARE") || labels.includes("NON DA FARE")) return "da_non_fare";
  if (labels.includes("NON FATTO")) return "non_fatto";

  // Ground truth: stato da COSMINA
  if (stato === "chiuso" || stato === "completato" || stato === "fatto") return "completato";

  // Stato aperto (o mancante) → distingui via due date.
  // COSMINA considera "scaduto" solo se la data è STRETTAMENTE precedente
  // al giorno di oggi (non all'istante); stesso giorno = programmato.
  if (due) {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (due < startOfToday) return "scaduto";
    return "programmato";
  }
  return "da_programmare";
}

function hasOrarioRidotto(card) {
  const labels = extractLabelNames(card);
  return labels.includes("ORARIO RIDOTTO");
}

async function fetchCampagnaCards(campagnaNome, campagnaId) {
  const db = getCosminaDb();
  const cards = [];

  // COSMINA usa campagna_id come primary key (es. cosmina campagne.js). Preferisco
  // campagna_id; fallback a campagna_nome per campagne inferred senza doc anagrafica.
  const filters = [];
  if (campagnaId) filters.push({ field: "campagna_id", value: campagnaId });
  if (campagnaNome) filters.push({ field: "campagna_nome", value: campagnaNome });

  for (const f of filters) {
    try {
      const snap = await db.collection("bacheca_cards")
        .where(f.field, "==", f.value)
        .limit(2000).get();
      snap.forEach(d => cards.push({ _id: d.id, ...(d.data() || {}) }));
      if (cards.length) break; // primo match vince
    } catch (e) {
      logger.warn("fetchCampagnaCards filter failed", { field: f.field, error: String(e).slice(0, 120) });
    }
  }
  return cards;
}

function aggregateCampaignStats(cards) {
  const now = new Date();
  const stats = {
    totale: cards.length,
    completati: 0,
    programmati: 0,
    scaduti: 0,
    da_programmare: 0,
    orario_ridotto: 0,
    non_fatti: 0,
    da_non_fare: 0,
  };
  const perTecnico = {};
  for (const c of cards) {
    const k = classifyCampaignCard(c, now);
    const mapped = {
      completato: "completati",
      programmato: "programmati",
      scaduto: "scaduti",
      da_programmare: "da_programmare",
      non_fatto: "non_fatti",
      da_non_fare: "da_non_fare",
    }[k];
    if (mapped) stats[mapped]++;
    if (hasOrarioRidotto(c)) stats.orario_ridotto++;
    const tec = c.techName || (Array.isArray(c.techNames) && c.techNames[0]) || "(non assegnato)";
    perTecnico[tec] = (perTecnico[tec] || 0) + 1;
  }
  return { stats, perTecnico };
}

// ─── Dashboard campagne (bulk, ottimizzata per Cloud Function) ──
//
// UNICA scan di bacheca_cards + aggregazione in-memory → evita N query
// parallele (OOM con 10 campagne × 1000 docs).
// Limiti: scan 5000 docs, prenderà solo le cards con campagna_nome.
// Memoria: ~50 MiB worst case invece di ~260.
export async function buildCampagneDashboard(parametri = {}) {
  const db = getCosminaDb();
  const now = new Date();

  // 1. Anagrafica campagne (5-50 docs, leggero)
  const campagneMap = new Map();
  try {
    const snap = await db.collection("cosmina_campagne").limit(50).get();
    snap.forEach(d => {
      const v = d.data() || {};
      const nome = String(v.nome || d.id);
      campagneMap.set(nome, {
        id: d.id,
        nome,
        stato: v.stato || null,
        archiviata: v.archiviata === true || v.stato === "archiviata",
        descrizione: v.descrizione || v.descrizione_dettagliata || "",
        data_inizio: v.data_inizio || null,
        data_fine: v.data_fine || null,
        source: "cosmina_campagne",
        _cards: [], // popolato dopo
      });
    });
  } catch (e) {
    logger.warn("dashboard: cosmina_campagne failed", { error: String(e).slice(0, 120) });
  }

  // 2. Scan mirato bacheca_cards per campagne note.
  //
  // bacheca_cards ha ~25k docs totali, limit(5000) tagliava campagne grandi
  // (SPEGNIMENTO 2026 aveva 38/407 conteggiati). Strategia: query per ogni
  // campagna nota con where("campagna_nome","==",nome) — Firestore ottimizza
  // con indice single-field automatico.
  //
  // Eseguo SEQUENZIALMENTE per non spawn-are N connessioni concurrent
  // (memoria controllata). Ogni query è ~100-500 docs al massimo.
  let scanned = 0;

  // Prima raccolgo i nomi noti: dalle campagne anagrafica + scan iniziale
  // mirato per scoprire le "inferred" (quelle senza doc in cosmina_campagne).
  const campagneNote = new Set(campagneMap.keys());

  // Discover fase: scan con listName=LETTURE RIP (campagne walkby) per
  // trovare nomi non in cosmina_campagne. Query cheap perché filtrata.
  try {
    const discoverListNames = ["LETTURE RIP", "LETTURE WALKBY", "LETTURE DIRETTE"];
    for (const ln of discoverListNames) {
      const dSnap = await db.collection("bacheca_cards")
        .where("listName", "==", ln).limit(200).get();
      dSnap.forEach(d => {
        const v = d.data() || {};
        if (v.campagna_nome) campagneNote.add(v.campagna_nome);
      });
    }
  } catch (e) {
    logger.warn("dashboard: discover failed", { error: String(e).slice(0, 120) });
  }

  // Crea entry bacheca_inferred per i nomi scoperti
  for (const nome of campagneNote) {
    if (!campagneMap.has(nome)) {
      campagneMap.set(nome, {
        id: null, nome,
        stato: null, archiviata: false,
        descrizione: "", source: "bacheca_inferred",
        _cards: [],
      });
    }
  }

  // Query mirata per ogni campagna (sequenziale, max 20 campagne).
  // Preferisce campagna_id come COSMINA (ground truth), fallback a campagna_nome.
  const campagneList = Array.from(campagneMap.values()).slice(0, 20);
  for (const c of campagneList) {
    try {
      const q = c.id
        ? db.collection("bacheca_cards").where("campagna_id", "==", c.id)
        : db.collection("bacheca_cards").where("campagna_nome", "==", c.nome);
      const cSnap = await q.limit(2000).get();
      cSnap.forEach(d => {
        scanned++;
        const v = d.data() || {};
        c._cards.push({
          stato: v.stato || null,
          archiviato: v.archiviato === true,
          inBacheca: v.inBacheca !== false,
          labels: v.labels || null,
          due: v.due || null,
          techName: v.techName || (Array.isArray(v.techNames) && v.techNames[0]) || null,
        });
      });
    } catch (e) {
      logger.warn(`dashboard: scan campagna ${c.nome} failed`, { error: String(e).slice(0, 120) });
    }
  }

  // 3. Per ogni campagna, calcola stats
  const out = [];
  for (const c of campagneMap.values()) {
    if (!parametri.archived && c.archiviata) continue;
    const cards = c._cards || [];
    const { stats, perTecnico } = aggregateCampaignStats(cards);
    const perc = stats.totale > 0 ? Math.round((stats.completati / stats.totale) * 100) : 0;

    out.push({
      campagna: {
        id: c.id, nome: c.nome,
        stato: c.stato, archiviata: c.archiviata,
        descrizione: c.descrizione,
        data_inizio: c.data_inizio, data_fine: c.data_fine,
        source: c.source,
      },
      stats,
      perTecnico,
      completamento_pct: perc,
      nome: c.nome,
    });
  }

  // Ordina per numero di interventi desc
  out.sort((a, b) => (b.stats.totale || 0) - (a.stats.totale || 0));

  logger.info("dashboard campagne done", {
    scanned_bacheca: scanned,
    campagne: out.length,
  });

  return { campagne: out, totale: out.length, scannedBachecaCards: scanned };
}

export async function handleChronosListaCampagne(parametri = {}) {
  const db = getCosminaDb();
  // Unione: cosmina_campagne + nomi distinti in bacheca_cards (discover)
  const campagne = new Map();

  try {
    const snap = await db.collection("cosmina_campagne").limit(50).get();
    snap.forEach(d => {
      const v = d.data() || {};
      const nome = String(v.nome || d.id);
      campagne.set(nome, {
        id: d.id,
        nome,
        stato: v.stato || null,
        archiviata: v.archiviata === true || v.stato === "archiviata",
        descrizione: v.descrizione || v.descrizione_dettagliata || "",
        data_inizio: v.data_inizio || null,
        data_fine: v.data_fine || null,
        source: "cosmina_campagne",
        count: 0,
      });
    });
  } catch (e) {
    logger.warn("lista campagne: cosmina_campagne failed", { error: String(e).slice(0, 120) });
  }

  // Discover: nomi distinti in bacheca_cards via listName (per campagne non in
  // cosmina_campagne, es. WalkBy). Query ristretta, serve solo per scoprire i nomi.
  try {
    const discoverLists = ["LETTURE RIP", "LETTURE WALKBY", "LETTURE DIRETTE", "ACCENSIONE/SPEGNIMENTO", "RIEMPIMENTI", "SVUOTAMENTI"];
    for (const ln of discoverLists) {
      const snap = await db.collection("bacheca_cards")
        .where("listName", "==", ln).limit(500).get();
      snap.forEach(d => {
        const v = d.data() || {};
        const nome = v.campagna_nome;
        if (!nome) return;
        if (!campagne.has(nome)) {
          campagne.set(nome, {
            id: v.campagna_id || null,
            nome,
            stato: null,
            archiviata: false,
            descrizione: "",
            source: "bacheca_inferred",
            count: 0,
          });
        }
      });
    }
  } catch (e) {
    logger.warn("lista campagne: discover failed", { error: String(e).slice(0, 120) });
  }

  // Count reale: per ogni campagna, query mirata con preferenza su campagna_id
  // (COSMINA usa questo campo come ground truth). Fallback a campagna_nome per
  // campagne inferred senza id.
  for (const c of campagne.values()) {
    try {
      let snap;
      if (c.id) {
        snap = await db.collection("bacheca_cards")
          .where("campagna_id", "==", c.id).count().get();
      } else {
        snap = await db.collection("bacheca_cards")
          .where("campagna_nome", "==", c.nome).count().get();
      }
      c.count = snap.data()?.count || 0;
    } catch (e) {
      logger.warn(`lista campagne: count ${c.nome} failed`, { error: String(e).slice(0, 120) });
    }
  }

  const includeArchived = !!parametri.archived;
  const rows = Array.from(campagne.values())
    .filter(c => includeArchived || !c.archiviata)
    .sort((a, b) => (b.count || 0) - (a.count || 0));

  if (!rows.length) {
    return { content: "Nessuna campagna attiva trovata.", data: { campagne: [] } };
  }

  const lines = rows.slice(0, 10).map((c, i) => {
    const tag = c.source === "bacheca_inferred" ? " _(bacheca)_" : "";
    const archLabel = c.archiviata ? " [archiviata]" : "";
    return `${i + 1}. **${c.nome}**${archLabel}${tag} — ${c.count} interventi`;
  });
  return {
    content: `📋 **Campagne attive** (${rows.length}):\n\n${lines.join("\n")}`,
    data: { campagne: rows },
  };
}

export async function handleChronosCampagne(parametri, ctx) {
  // Query può essere { nome, campagnaId } oppure estratta da userMessage
  let nome = String(parametri.nome || parametri.campagna || parametri.query || "").trim();
  if (!nome && ctx?.userMessage) {
    const m = /(?:campagn\w*\s+(?:di|per)?\s*)([A-Za-zÀ-ÿ0-9][\wÀ-ÿ\s\-]{2,60})/i.exec(ctx.userMessage);
    if (m) nome = m[1].trim();
  }

  // Se non c'è un nome specifico: restituisci la lista
  if (!nome || /^(attiv|aperte|tutte|lista)$/i.test(nome)) {
    return handleChronosListaCampagne(parametri);
  }

  // Cerca nome esatto o fuzzy
  const lista = await handleChronosListaCampagne({ archived: true });
  const candidates = (lista.data?.campagne || []).filter(c =>
    c.nome.toLowerCase().includes(nome.toLowerCase())
  );
  if (!candidates.length) {
    const attive = (lista.data?.campagne || []).slice(0, 8).map(c => `· ${c.nome}`).join("\n");
    return {
      content: `Nessuna campagna trovata per "${nome}".\n\nCampagne disponibili:\n${attive}`,
    };
  }
  if (candidates.length > 1) {
    const opzioni = candidates.slice(0, 5).map(c => `· ${c.nome} (${c.count} interv.)`).join("\n");
    return {
      content: `Ho trovato ${candidates.length} campagne con "${nome}":\n\n${opzioni}\n\nSpecifica meglio.`,
    };
  }

  // Match univoco: calcola metriche
  const camp = candidates[0];
  const cards = await fetchCampagnaCards(camp.nome, camp.id);
  const { stats, perTecnico } = aggregateCampaignStats(cards);

  const perc = stats.totale > 0 ? Math.round((stats.completati / stats.totale) * 100) : 0;
  const percBar = Math.min(20, Math.round((stats.completati / Math.max(1, stats.totale)) * 20));
  const bar = "█".repeat(percBar) + "░".repeat(20 - percBar);

  const topTech = Object.entries(perTecnico)
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([t, n]) => `${t}=${n}`).join(", ");

  const lines = [
    `📋 **Campagna: ${camp.nome}**`,
    camp.descrizione ? `_${camp.descrizione.slice(0, 150)}_` : "",
    ``,
    `**Avanzamento**: \`${bar}\` ${perc}% completato`,
    ``,
    `  · ✅ Completati: ${stats.completati}`,
    `  · 📅 Programmati: ${stats.programmati}`,
    `  · ⚠️ Scaduti: ${stats.scaduti}`,
    `  · 📝 Da Programmare: ${stats.da_programmare}`,
    `  · ❌ Non Fatti: ${stats.non_fatti}`,
    `  · 🚫 Da Non Fare: ${stats.da_non_fare}`,
    `  ─────────────`,
    `  · **Totale: ${stats.totale}**`,
    ``,
    `**Per tecnico**: ${topTech || "-"}`,
  ].filter(Boolean);

  return {
    content: lines.join("\n"),
    data: {
      campagna: camp,
      stats,
      perTecnico,
      completamento_pct: perc,
    },
  };
}


export async function handleChronosSlotTecnico(parametri) {
  const tecnicoFilter = String(
    parametri.tecnico || parametri.nome || parametri.tecnicoUid || "",
  ).trim().toLowerCase();
  const finestraGiorni = Number(parametri.finestraGiorni) || 14;
  const now = new Date();
  const limite = new Date(now.getTime() + finestraGiorni * 86400000);

  let snap;
  try {
    snap = await getCosminaDb().collection("bacheca_cards")
      .where("listName", "==", "INTERVENTI")
      .where("inBacheca", "==", true)
      .limit(200).get();
  } catch (e) {
    const msg = String(e?.message || e);
    if (/permission|denied|UNAUTHENTICATED|403/i.test(msg)) {
      return { content: "CHRONOS non ha ancora i permessi per leggere COSMINA." };
    }
    throw e;
  }

  const rows = [];
  snap.forEach((d) => {
    const data = d.data() || {};
    const stato = String(data.stato || "").toLowerCase();
    if (stato.includes("complet") || stato.includes("annul")) return;
    let tecnico = data.techName;
    if (!tecnico && Array.isArray(data.techNames) && data.techNames.length) {
      tecnico = String(data.techNames[0]);
    }
    if (!tecnico) return;
    if (tecnicoFilter && !String(tecnico).toLowerCase().includes(tecnicoFilter)) return;

    let due;
    if (data.due) {
      try {
        due = data.due.toDate ? data.due.toDate() : new Date(data.due);
        if (Number.isNaN(due.getTime())) due = null;
      } catch { due = null; }
    }
    if (!due || due < now || due > limite) return;

    rows.push({
      tecnico,
      data: due,
      cond: data.boardName || "?",
      name: data.name || "(senza titolo)",
    });
  });

  rows.sort((a, b) => a.data.getTime() - b.data.getTime());
  if (!rows.length) {
    const who = tecnicoFilter ? `per "${tecnicoFilter}"` : "";
    return { content: `Nessun impegno pianificato ${who} nei prossimi ${finestraGiorni} giorni.` };
  }

  const perTec = new Map();
  for (const r of rows) {
    if (!perTec.has(r.tecnico)) perTec.set(r.tecnico, []);
    perTec.get(r.tecnico).push(r);
  }

  const blocchi = [];
  for (const [tec, items] of perTec) {
    const lines = items.slice(0, 6).map((r) => {
      const d = r.data.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
      const h = r.data.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
      return `  · ${d} ${h} — ${r.cond.slice(0, 40)}`;
    }).join("\n");
    const more = items.length > 6 ? `\n  …e altri ${items.length - 6}` : "";
    blocchi.push(`**${tec}** (${items.length} impegni):\n${lines}${more}`);
  }

  return {
    content: `📅 Agenda prossimi ${finestraGiorni} giorni:\n\n${blocchi.join("\n\n")}`,
    data: { tecnici: [...perTec.keys()], totale: rows.length },
  };
}

export async function handleChronosAgendaGiornaliera(parametri, ctx) {
  const msg = (ctx?.userMessage || "").toLowerCase();
  const tecnico = String(
    parametri.tecnico || parametri.nome || parametri.tecnicoUid || "",
  ).trim().toLowerCase();

  let giorno = new Date();
  if (parametri.data) {
    const parsed = new Date(parametri.data);
    if (!Number.isNaN(parsed.getTime())) giorno = parsed;
  }
  if (/dopodomani/.test(msg)) {
    giorno = new Date(); giorno.setDate(giorno.getDate() + 2);
  } else if (/domani/.test(msg)) {
    giorno = new Date(); giorno.setDate(giorno.getDate() + 1);
  } else if (/oggi/.test(msg)) {
    giorno = new Date();
  }

  const start = new Date(giorno); start.setHours(0, 0, 0, 0);
  const end = new Date(giorno); end.setHours(23, 59, 59, 999);

  if (!tecnico) {
    return { content: "Quale tecnico? Dimmi il nome (es. 'agenda di Malvicino')." };
  }

  let snap;
  try {
    snap = await getCosminaDb().collection("bacheca_cards")
      .where("listName", "==", "INTERVENTI").where("inBacheca", "==", true)
      .limit(300).get();
  } catch (e) {
    const m = String(e?.message || e);
    if (/permission|denied|403/i.test(m)) {
      return { content: "CHRONOS non può leggere COSMINA." };
    }
    throw e;
  }

  const slot = [];
  snap.forEach(d => {
    const row = d.data() || {};
    const stato = String(row.stato || "").toLowerCase();
    if (stato.includes("complet") || stato.includes("annul")) return;
    let tec = row.techName;
    if (!tec && Array.isArray(row.techNames) && row.techNames.length) tec = String(row.techNames[0]);
    if (!tec || !tec.toLowerCase().includes(tecnico)) return;
    let due;
    try {
      due = row.due?.toDate ? row.due.toDate() : (row.due ? new Date(row.due) : null);
      if (due && Number.isNaN(due.getTime())) due = null;
    } catch { due = null; }
    if (!due || due < start || due > end) return;
    slot.push({
      ora: due.toTimeString().slice(0, 5),
      cond: row.boardName || "?",
      name: row.name || "",
    });
  });

  slot.sort((a, b) => a.ora.localeCompare(b.ora));
  const dataStr = giorno.toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "long" });

  if (!slot.length) {
    return { content: `📅 ${tecnico.toUpperCase()} non ha interventi pianificati per ${dataStr}.` };
  }

  const lines = slot.slice(0, 12).map((s, i) =>
    `${i + 1}. ${s.ora} — ${String(s.cond).slice(0, 50)}`,
  ).join("\n");
  return {
    content: `📅 **Agenda ${tecnico.toUpperCase()} — ${dataStr}** (${slot.length} interventi):\n\n${lines}`,
    data: { tecnico, giorno: giorno.toISOString().slice(0, 10), count: slot.length },
  };
}

export async function handleChronosScadenze(parametri) {
  const finestraGiorni = Number(parametri.finestraGiorni) || 60;
  const now = new Date();
  const limite = new Date(now.getTime() + finestraGiorni * 86400000);

  let snap;
  try {
    snap = await getCosminaDb().collection("cosmina_impianti").limit(300).get();
  } catch (e) {
    const msg = String(e?.message || e);
    if (/permission|denied|UNAUTHENTICATED|403|NOT_FOUND/i.test(msg)) {
      return { content: "CHRONOS non riesce a leggere `cosmina_impianti` (permessi o collection assente)." };
    }
    throw e;
  }

  const rows = [];
  snap.forEach((d) => {
    const data = d.data() || {};
    // Campi scadenza reali (da scan MEMO: memo-firestore-garbymobile.md §1.3)
    const candidates = [
      data.data_prossima_manutenzione,
      data.data_prossimo_contributo,       // cosmina_impianti field reale
      data.data_scadenza_dichiarazione,
      data.prossima_manutenzione,
      data.data_scadenza,
      data.scadenza_curit,
      data.dataScadenza,
    ];
    let scadenza = null;
    for (const c of candidates) {
      if (!c) continue;
      try {
        const d2 = c.toDate ? c.toDate() : new Date(c);
        if (!Number.isNaN(d2.getTime())) { scadenza = d2; break; }
      } catch {}
    }
    if (!scadenza || scadenza < now || scadenza > limite) return;

    rows.push({
      id: d.id,
      data: scadenza,
      cond: data.condominio || data.indirizzo || "?",
      modello: data.modello || "",
    });
  });

  rows.sort((a, b) => a.data.getTime() - b.data.getTime());
  if (!rows.length) {
    return { content: `Nessuna scadenza manutenzione trovata nei prossimi ${finestraGiorni} giorni.` };
  }

  const top = rows.slice(0, 10);
  const lines = top.map((r, i) => {
    const d = r.data.toLocaleDateString("it-IT");
    const giorni = Math.ceil((r.data.getTime() - now.getTime()) / 86400000);
    const urg = giorni <= 7 ? " ⚠️" : "";
    return `${i + 1}. [${d}] (${giorni}g)${urg} ${r.cond.slice(0, 45)} ${r.modello ? `· ${r.modello}` : ""}`;
  }).join("\n");
  const more = rows.length > 10 ? `\n…e altre ${rows.length - 10}.` : "";
  return {
    content: `📆 **${rows.length} scadenze** nei prossimi ${finestraGiorni}g:\n\n${lines}${more}`,
    data: { count: rows.length },
  };
}
