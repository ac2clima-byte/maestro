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
    // Skip campagne archiviate a prescindere (raramente utili nella ricerca
    // generale; per includerle: parametri.includeArchived=true).
    // Questo filtra anche i "dati sporchi" come POSTELEGRAFONICI.
    .filter(c => includeArchived || !c.archiviata)
    .sort((a, b) => (b.count || 0) - (a.count || 0));

  if (!rows.length) {
    return { content: "Non hai campagne attive al momento.", data: { campagne: [] } };
  }

  // Risposta naturale
  const totali = rows.length;
  const attive = rows.filter(c => !c.archiviata).length;
  const parts = [];
  if (attive === totali) parts.push(`Hai ${totali} campagne attive.`);
  else parts.push(`Hai ${attive} campagne attive e ${totali - attive} archiviate.`);

  const elenco = rows.slice(0, 8).map((c, i) => {
    const archNote = c.archiviata ? " (archiviata)" : "";
    return `${i + 1}. ${c.nome}${archNote} — ${c.count} interventi`;
  }).join("\n");
  return {
    content: `${parts.join(" ")}\n\n${elenco}`,
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

  // Ricerca fuzzy: splitta query in parole, trova campagne che contengono
  // TUTTE le parole significative. "Letture WalkBy" → cerca "letture" (walkby
  // è probabilmente sinonimo non presente nel nome) → fallback a "letture".
  const lista = await handleChronosListaCampagne({ archived: true });
  const allCamps = lista.data?.campagne || [];

  const SYNONYMS = {
    walkby: ["letture", "acg", "fs", "contatori"],
    lettura: ["letture"],
    spegnimento: ["spegnimento", "spegni"],
    accensione: ["accensione", "accendi"],
    contatori: ["contatori", "letture"],
  };

  const normalize = s => String(s).toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
  const STOP = new Set(["di", "del", "delle", "della", "per", "con", "e", "il", "la", "lo", "i", "gli", "le", "un", "una", "uno"]);
  const words = normalize(nome).split(/\s+/).filter(w => w.length >= 2 && !STOP.has(w));

  // Candidate scoring: match parole + sinonimi. Archiviate penalizzate.
  const scored = allCamps.map(c => {
    const bag = normalize(c.nome + " " + (c.descrizione || ""));
    let score = 0, matchedWords = 0;
    for (const w of words) {
      const syns = [w, ...(SYNONYMS[w] || [])];
      const anyHit = syns.some(s => bag.includes(s));
      if (anyHit) { matchedWords++; score += 10; }
      if (bag.includes(w)) score += 5;
    }
    // Penalità forte per archiviate (non voglio vederle in un match fuzzy)
    if (c.archiviata) score -= 100;
    return { camp: c, score, matchedWords };
  }).filter(x => x.matchedWords > 0 && x.score > 0)
    .sort((a, b) => b.score - a.score);

  const candidates = scored.map(x => x.camp);
  if (!candidates.length) {
    const attive = allCamps.slice(0, 8).map(c => c.nome).join(", ");
    return {
      content: `Non trovo una campagna che corrisponde a "${nome}". Quelle disponibili sono: ${attive}.`,
    };
  }
  if (candidates.length > 1) {
    // Ambiguità: se il top score è molto superiore ai seguenti, prendi il top
    const topScore = scored[0].score;
    const secondScore = scored[1]?.score || 0;
    if (topScore >= secondScore * 2 && scored[0].matchedWords >= words.length) {
      // Match dominante: vai con questo
    } else {
      const opzioni = candidates.slice(0, 4).map(c => `${c.nome} (${c.count} interventi)`).join("; ");
      return {
        content: `Ho trovato più campagne: ${opzioni}. Quale vuoi?`,
      };
    }
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

  // Risposta naturale discorsiva
  const parts = [];
  parts.push(`Campagna ${camp.nome}: ${perc}% completato.`);
  const bits = [];
  if (stats.completati) bits.push(`${stats.completati} fatti`);
  if (stats.programmati) bits.push(`${stats.programmati} programmati`);
  if (stats.scaduti) bits.push(`${stats.scaduti} scaduti`);
  if (stats.da_programmare) bits.push(`${stats.da_programmare} da programmare`);
  if (stats.non_fatti) bits.push(`${stats.non_fatti} non fatti`);
  if (bits.length) parts.push(`Sui ${stats.totale} totali: ${bits.join(", ")}.`);
  if (topTech) {
    const firstTech = topTech.split(",")[0];
    parts.push(`Il tecnico con più interventi è ${firstTech.replace("=", " con ")}.`);
  }
  if (stats.scaduti > 0) {
    parts.push(`Vuoi che recuperiamo gli scaduti?`);
  }

  return {
    content: parts.join(" "),
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

// Tecnici ACG (whitelist hard-coded). Match per cognome o nome.
// I non-tecnici noti (personale ufficio Guazzotti che capita in chat con
// Alberto) li riconosciamo per dare risposta corretta invece di "non
// trovo interventi".
const ACG_TECNICI = [
  { keys: ["aime", "david"], nome: "Aime David" },
  { keys: ["albanesi", "gianluca"], nome: "Albanesi Gianluca" },
  { keys: ["contardi", "alberto"], nome: "Contardi Alberto" },
  { keys: ["dellafiore lorenzo", "lorenzo dellafiore", "lorenzo"], nome: "Dellafiore Lorenzo" },
  { keys: ["dellafiore victor", "victor dellafiore", "victor"], nome: "Dellafiore Victor" },
  { keys: ["leshi", "ergest"], nome: "Leshi Ergest" },
  { keys: ["piparo", "marco"], nome: "Piparo Marco" },
  { keys: ["tosca", "federico"], nome: "Tosca Federico" },
  { keys: ["troise", "antonio"], nome: "Troise Antonio" },
];
const NON_TECNICI_NOTI = [
  { keys: ["malvicino"], descr: "personale ufficio Guazzotti" },
];

function isAcgTecnico(name) {
  const n = String(name || "").toLowerCase();
  if (!n) return false;
  return ACG_TECNICI.some(t => t.keys.some(k => n.includes(k)));
}

function findNonTecnicoNoto(name) {
  const n = String(name || "").toLowerCase();
  return NON_TECNICI_NOTI.find(t => t.keys.some(k => n.includes(k))) || null;
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
    return { content: "Quale tecnico? Dimmi il nome (es. 'agenda di Marco' o 'agenda di Lorenzo')." };
  }

  // Whitelist: se il nome NON corrisponde a un tecnico ACG ma è un non-tecnico
  // noto (es. Malvicino = ufficio Guazzotti) rispondi correttamente invece di
  // andare a vuoto in bacheca_cards.
  const cap = (s) => s.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  if (!isAcgTecnico(tecnico)) {
    const noto = findNonTecnicoNoto(tecnico);
    if (noto) {
      return {
        content: `${cap(tecnico)} non è un tecnico ACG, è ${noto.descr}. I tecnici ACG sono: Aime David, Albanesi Gianluca, Contardi Alberto, Dellafiore Lorenzo, Dellafiore Victor, Leshi Ergest, Piparo Marco, Tosca Federico, Troise Antonio.`,
        data: { tecnico, isAcgTecnico: false, ruolo: noto.descr },
      };
    }
    // Nome non riconosciuto: continuiamo lo stesso (potrebbe essere un cognome
    // o variante non in whitelist), ma l'agenda fallirà naturalmente se non
    // matcha bacheca_cards.
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

  const tecnicoLabel = tecnico.charAt(0).toUpperCase() + tecnico.slice(1);
  if (!slot.length) {
    return { content: `${tecnicoLabel} non ha interventi pianificati per ${dataStr}.` };
  }

  const lines = slot.slice(0, 12).map((s, i) =>
    `${i + 1}. ${s.ora} — ${String(s.cond).slice(0, 50)}`,
  ).join("\n");
  return {
    content: `Agenda ${tecnicoLabel} ${dataStr}, ${slot.length} interventi: \n${lines}`,
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

// ─── Dashboard Agenda (per-tecnico oggi/settimana) ──────────────
//
// Scansiona bacheca_cards listName=INTERVENTI + inBacheca, aggrega per
// tecnico con bucket temporali: oggi, settimana, futuro, scaduti.
// Normalizza case tecnico (VICTOR/Victor → VICTOR).
export async function buildAgendaDashboard(parametri = {}) {
  const db = getCosminaDb();
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startTomorrow = new Date(startToday.getTime() + 86400000);
  const endWeek = new Date(startToday.getTime() + 7 * 86400000);

  const snap = await db.collection("bacheca_cards")
    .where("listName", "==", "INTERVENTI")
    .where("inBacheca", "==", true)
    .limit(1500).get();

  const tecMap = new Map(); // { tec: { tot, oggi, domani, settimana, scaduti, futuri, completati, senzaData, items[] } }
  const getBucket = (tec) => {
    if (!tecMap.has(tec)) tecMap.set(tec, {
      tecnico: tec, totale: 0, oggi: 0, domani: 0, settimana: 0,
      scaduti: 0, futuri: 0, completati: 0, senza_data: 0, items: [],
    });
    return tecMap.get(tec);
  };

  snap.forEach(d => {
    const v = d.data() || {};
    const rawTec = v.techName || (Array.isArray(v.techNames) && v.techNames[0]) || "(non assegnato)";
    const tec = String(rawTec).toUpperCase().trim();
    let due = null;
    try { due = v.due?.toDate ? v.due.toDate() : (v.due ? new Date(v.due) : null); } catch {}
    if (due && Number.isNaN(due.getTime())) due = null;
    const stato = String(v.stato || "").toLowerCase();

    const b = getBucket(tec);
    b.totale++;

    if (stato === "chiuso" || stato === "completato") {
      b.completati++;
    } else if (!due) {
      b.senza_data++;
    } else if (due < startToday) {
      b.scaduti++;
    } else if (due >= startToday && due < startTomorrow) {
      b.oggi++;
    } else if (due >= startTomorrow && due < endWeek) {
      b.settimana++;
    } else {
      b.futuri++;
    }

    if (b.items.length < 50 && stato !== "chiuso") {
      b.items.push({
        id: d.id,
        name: String(v.name || "").slice(0, 80),
        cond: String(v.boardName || "").slice(0, 80),
        due: due ? due.toISOString() : null,
        stato: v.stato || null,
      });
    }
  });

  const tecnici = Array.from(tecMap.values())
    .map(t => {
      const attivi = t.totale - t.completati;
      t.completamento_pct = t.totale > 0 ? Math.round((t.completati / t.totale) * 100) : 0;
      t.aperti = attivi;
      t.items.sort((a, b) => {
        if (!a.due) return 1;
        if (!b.due) return -1;
        return a.due.localeCompare(b.due);
      });
      return t;
    })
    .sort((a, b) => (b.totale || 0) - (a.totale || 0));

  const totGlobal = {
    tecnici: tecnici.length,
    totale: tecnici.reduce((s, t) => s + t.totale, 0),
    oggi: tecnici.reduce((s, t) => s + t.oggi, 0),
    settimana: tecnici.reduce((s, t) => s + t.settimana, 0),
    scaduti: tecnici.reduce((s, t) => s + t.scaduti, 0),
    completati: tecnici.reduce((s, t) => s + t.completati, 0),
  };
  totGlobal.completamento_pct = totGlobal.totale > 0
    ? Math.round((totGlobal.completati / totGlobal.totale) * 100) : 0;

  logger.info("dashboard agenda done", {
    scanned: snap.size, tecnici: tecnici.length, oggi: totGlobal.oggi,
  });

  return { totale: totGlobal, tecnici };
}

// ─── Dashboard Scadenze (bucket temporali impianti) ─────────────
//
// Scansiona cosmina_impianti, estrae date scadenza da più campi candidati,
// aggrega per bucket: scaduti, 30g, 60g, 90g, futuro.
export async function buildScadenzeDashboard(parametri = {}) {
  const db = getCosminaDb();
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const snap = await db.collection("cosmina_impianti").limit(1000).get();

  const buckets = {
    scaduti: { label: "Scaduti", items: [], count: 0, color: "#dc2626" },
    g30: { label: "Entro 30 giorni", items: [], count: 0, color: "#f59e0b" },
    g60: { label: "31-60 giorni", items: [], count: 0, color: "#eab308" },
    g90: { label: "61-90 giorni", items: [], count: 0, color: "#3b82f6" },
    futuri: { label: "Oltre 90 giorni", items: [], count: 0, color: "#64748b" },
  };
  let totaleImpianti = snap.size;
  let senzaData = 0;

  const dateFields = [
    "data_prossima_manutenzione",
    "data_prossimo_contributo",
    "data_scadenza_dichiarazione",
    "prossima_manutenzione",
    "data_scadenza",
    "scadenza_curit",
    "dataScadenza",
  ];

  snap.forEach(d => {
    const v = d.data() || {};
    let scadenza = null;
    let sorgente = null;
    for (const f of dateFields) {
      if (!v[f]) continue;
      try {
        const dt = v[f].toDate ? v[f].toDate() : new Date(v[f]);
        if (!Number.isNaN(dt.getTime())) { scadenza = dt; sorgente = f; break; }
      } catch {}
    }
    if (!scadenza) { senzaData++; return; }

    const giorni = Math.ceil((scadenza - startToday) / 86400000);
    const item = {
      id: d.id,
      cond: v.condominio || v.indirizzo || v.codice_impianto || d.id,
      comune: v.comune || null,
      modello: v.modello || null,
      scadenza: scadenza.toISOString().slice(0, 10),
      giorni,
      sorgente,
    };

    let bucket;
    if (giorni < 0) bucket = buckets.scaduti;
    else if (giorni <= 30) bucket = buckets.g30;
    else if (giorni <= 60) bucket = buckets.g60;
    else if (giorni <= 90) bucket = buckets.g90;
    else bucket = buckets.futuri;

    bucket.count++;
    if (bucket.items.length < 50) bucket.items.push(item);
  });

  for (const b of Object.values(buckets)) {
    b.items.sort((a, b) => a.giorni - b.giorni);
  }

  const totaleConScadenza = Object.values(buckets).reduce((s, b) => s + b.count, 0);
  const totGlobal = {
    impianti_totali: totaleImpianti,
    con_scadenza: totaleConScadenza,
    senza_data: senzaData,
    copertura_pct: totaleImpianti > 0 ? Math.round((totaleConScadenza / totaleImpianti) * 100) : 0,
    scaduti: buckets.scaduti.count,
    g30: buckets.g30.count,
    g60: buckets.g60.count,
    g90: buckets.g90.count,
    futuri: buckets.futuri.count,
  };

  logger.info("dashboard scadenze done", {
    impianti: totaleImpianti, con_scadenza: totaleConScadenza,
  });

  return { totale: totGlobal, buckets };
}
