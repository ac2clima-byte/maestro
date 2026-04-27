// handlers/ares.js — interventi (lettura + scrittura).
import {
  getCosminaDb, db, FieldValue, logger,
  mezzanotteItalia, dataItaliaItFormat, oggiItalia,
  tecniciAssegnatiCard, cardDuplicateGroupKey, cardRichnessCompare,
  cardCategoryFromListName, cardCategoryLabel,
  cardExecutionStatus, isCardRitorno,
} from "./shared.js";

// ── Helpers parsing data ─────────────────────────────────────────
// IMPORTANTE: tutto il calcolo data deve essere in fuso Europe/Rome
// (le Cloud Functions girano in UTC, alle 00-02 UTC = 02-04 CEST il
// `new Date().setHours(0,0,0,0)` produceva il giorno precedente).
const GIORNI_SETTIMANA = {
  domenica: 0, lunedi: 1, "lunedì": 1, martedi: 2, "martedì": 2,
  mercoledi: 3, "mercoledì": 3, giovedi: 4, "giovedì": 4,
  venerdi: 5, "venerdì": 5, sabato: 6,
};

// Mezzanotte italiana del giorno passato (default: oggi). NON USARE
// new Date().setHours(0,0,0,0) — quello è midnight UTC sul server.
function _midnight(d) {
  return mezzanotteItalia(d);
}
function _addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
// Format DD/MM/YYYY usando il fuso italiano.
function _formatDateIt(d) {
  return dataItaliaItFormat(d);
}
// Giorno della settimana (0=domenica) per una Date, nel fuso Europe/Rome.
function _dayOfWeekRome(d) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Rome", weekday: "short",
  }).format(d);
  // "Sun"=0, "Mon"=1, ...
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[fmt] ?? new Date(d).getDay();
}

// Detection del tense: "aveva, ha avuto, è andato, scorso/a, ieri" → passato.
// "avrà, prossimo/a, domani" → futuro. "oggi" → presente.
function _tense(msg) {
  const m = String(msg || "").toLowerCase();
  if (/\b(?:aveva|ha\s+avuto|è\s+stato|era|ho\s+avuto|ieri|scors[oa])\b/.test(m)) return "past";
  if (/\b(?:avrà|avra|avremo|domani|prossim[oa])\b/.test(m)) return "future";
  // Verbi imperativi di creazione = sempre futuri
  if (/\b(?:metti|mettigli|crea|crei|programma|programmagli|fissa|fissagli|segna|segnami|registra|prenota|schedul\w+|pianifica|organizza|aggiungi|inserisci|appunta|prepara)\b/.test(m)) return "future";
  return "present";
}

// Ritorna { from, to, label } in oggetti Date (entrambi mezzanotte;
// to è ESCLUSIVO: due < to). Oppure null se non c'è filtro temporale.
export function parseRangeDataInterventi(text) {
  const m = String(text || "").toLowerCase().trim();
  if (!m) return null;
  const today = _midnight(new Date());

  if (/\boggi\b/.test(m)) return { from: today, to: _addDays(today, 1), label: "oggi" };
  if (/\bieri\b/.test(m)) return { from: _addDays(today, -1), to: today, label: "ieri" };
  if (/\bdomani\b/.test(m)) return { from: _addDays(today, 1), to: _addDays(today, 2), label: "domani" };
  if (/\bdopodomani\b/.test(m)) return { from: _addDays(today, 2), to: _addDays(today, 3), label: "dopodomani" };

  // Settimane (dow Europe/Rome, non server)
  if (/\bquesta\s+settimana\b/.test(m)) {
    const dow = _dayOfWeekRome(today); const lun = _addDays(today, dow === 0 ? -6 : 1 - dow);
    return { from: lun, to: _addDays(lun, 7), label: "questa settimana" };
  }
  if (/\bsettimana\s+scors|\bscorsa\s+settimana\b/.test(m)) {
    const dow = _dayOfWeekRome(today); const lun = _addDays(today, dow === 0 ? -6 : 1 - dow);
    const lunS = _addDays(lun, -7);
    return { from: lunS, to: lun, label: "la settimana scorsa" };
  }
  if (/\bsettimana\s+prossim|\bprossima\s+settimana\b/.test(m)) {
    const dow = _dayOfWeekRome(today); const lun = _addDays(today, dow === 0 ? -6 : 1 - dow);
    return { from: _addDays(lun, 7), to: _addDays(lun, 14), label: "la settimana prossima" };
  }

  // Giorno della settimana (anche con accento). Il `\b` JS non funziona bene
  // con caratteri accentati, quindi uso lookaround manuali su [^a-zà-ÿ].
  for (const [name, idx] of Object.entries(GIORNI_SETTIMANA)) {
    const escName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?:^|[^a-zà-ÿ])${escName}(?=[^a-zà-ÿ]|$)`, "i");
    if (!re.test(m)) continue;
    const wantPast = /\bscors[oa]\b/.test(m) || (_tense(m) === "past" && !/\bprossim[oa]\b/.test(m));
    const wantFuture = /\bprossim[oa]\b/.test(m) || _tense(m) === "future";
    const todayDow = _dayOfWeekRome(today);
    let delta;
    if (wantPast) {
      delta = (todayDow - idx + 7) % 7;
      if (delta === 0) delta = 7;
      delta = -delta;
    } else if (wantFuture) {
      delta = (idx - todayDow + 7) % 7;
      if (delta === 0) delta = 7;
    } else {
      delta = (todayDow - idx + 7) % 7;
      if (delta === 0) delta = 0;
      else delta = -delta;
    }
    const day = _addDays(today, delta);
    // Label leggibile: lunedì/martedì… (mappa nome canonico)
    const labelName = name.endsWith("i") ? name.replace(/i$/, "ì") : name;
    return { from: day, to: _addDays(day, 1), label: `${labelName} ${_formatDateIt(day)}` };
  }

  // Data assoluta DD/MM[/YYYY] o DD-MM[-YYYY]
  const ass = m.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (ass) {
    const dd = Number(ass[1]), mm = Number(ass[2]);
    // anno fallback: anno italiano corrente
    let yy = ass[3] ? Number(ass[3]) : Number(oggiItalia(today).slice(0, 4));
    if (yy < 100) yy += 2000;
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      const d = new Date(yy, mm - 1, dd, 0, 0, 0, 0);
      if (!Number.isNaN(d.getTime())) {
        return { from: d, to: _addDays(d, 1), label: `il ${_formatDateIt(d)}` };
      }
    }
  }

  // "il 23 aprile" / "23 aprile [2025]"
  const MESI_ITA = { gennaio:1,febbraio:2,marzo:3,aprile:4,maggio:5,giugno:6,luglio:7,agosto:8,settembre:9,ottobre:10,novembre:11,dicembre:12 };
  const meseAbs = m.match(/\b(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)(?:\s+(\d{4}))?\b/);
  if (meseAbs) {
    const dd = Number(meseAbs[1]);
    const mm = MESI_ITA[meseAbs[2]];
    const yy = meseAbs[3] ? Number(meseAbs[3]) : Number(oggiItalia(today).slice(0, 4));
    const d = new Date(yy, mm - 1, dd, 0, 0, 0, 0);
    if (!Number.isNaN(d.getTime())) {
      return { from: d, to: _addDays(d, 1), label: `il ${_formatDateIt(d)}` };
    }
  }

  return null;
}

// Whitelist città principali (Piemonte/Lombardia + grandi città)
const CITTA_NOTE = [
  "alessandria", "voghera", "tortona", "novi ligure", "novi", "casale monferrato", "casale",
  "valenza", "asti", "acqui terme", "acqui", "ovada", "bra", "alba",
  "milano", "torino", "genova", "pavia", "vigevano", "stradella",
  "broni", "rivanazzano", "salice terme", "godiasco", "varzi",
  "serravalle scrivia", "arquata scrivia", "felizzano", "san salvatore",
  "moncalieri", "chivasso", "ivrea", "cuneo", "biella",
];

// Ordina la whitelist per lunghezza decrescente per evitare match prefisso
// (es. "novi ligure" prima di "novi", "casale monferrato" prima di "casale").
const CITTA_NOTE_SORTED = [...CITTA_NOTE].sort((a, b) => b.length - a.length);

export function parseCittaIntervento(text) {
  const m = String(text || "").toLowerCase();
  // Pattern "ad X", "a X", "in X", "su X", "verso X" davanti al nome città
  for (const citta of CITTA_NOTE_SORTED) {
    const re = new RegExp(`\\b(?:ad|a|in|su|verso)\\s+${citta.replace(/\s+/g, "\\s+")}\\b`, "i");
    if (re.test(m)) return citta;
  }
  // Match libero solo per città in whitelist (anche senza preposizione, fine frase)
  for (const citta of CITTA_NOTE_SORTED) {
    const re = new RegExp(`\\b${citta.replace(/\s+/g, "\\s+")}\\b`, "i");
    if (re.test(m)) return citta;
  }
  return null;
}

// Stati terminali ARES (un intervento "chiuso" non è più attivo).
const STATI_TERMINALI_RE = /\b(complet|chius|annul|terminat|cancel|risolt|finit)/;

// Whitelist 9 tecnici ACG per estrazione robusta (no falsi positivi su città/giorni).
const TECNICI_ACG = ["aime","david","albanesi","gianluca","contardi","alberto","dellafiore","lorenzo","victor","leshi","ergest","piparo","marco","tosca","federico","troise","antonio","malvicino"];

function _extractTecnico(userMessage) {
  const m = String(userMessage || "").toLowerCase();
  for (const nome of TECNICI_ACG) {
    if (new RegExp(`\\b${nome}\\b`, "i").test(m)) return nome;
  }
  // Fallback regex "di/del/per X"
  const r = m.match(/\b(?:di|del|per)\s+([a-zà-ÿ]+)(?:\s|$|,|\?|!)/i);
  if (r && r[1] && !/^(oggi|ieri|domani|tutti|nostri|loro|noi|voi|alessandria|voghera|tortona|pavia|milano|torino|genova|asti)$/i.test(r[1])) {
    return r[1].toLowerCase();
  }
  return null;
}

// listName che consideriamo "interventi" (non solo "INTERVENTI" maiuscolo).
// Match case-insensitive su substring: "intervent" cattura
//   INTERVENTI, INTERVENTI DA ESEGUIRE, Interventi da eseguire,
//   ACCENSIONE/SPEGNIMENTO (escluso — vedi sotto).
function _isListInterventi(listName) {
  const ln = String(listName || "").toUpperCase();
  if (/INTERVENT/.test(ln)) return true;
  if (/ACCENSIONE|SPEGNIMENTO/.test(ln)) return true;
  if (/TICKET\s+DA\s+CHIUDER/.test(ln)) return true;
  return false;
}

// Alias locale: delega a tecniciAssegnatiCard centralizzato in shared.js.
// Definizione ACG (vedi shared.js):
//   Un tecnico T è ASSEGNATO se compare in ALMENO UNO di:
//     1. card.techName (primario)
//     2. card.techNames[] (co-primari)
//     3. card.labels[].name filtrato su whitelist 9 tecnici ACG (label co-coinvolto)
function _allTechs(data) {
  return tecniciAssegnatiCard(data);
}

// Converte campo `due` in Date (gestisce string ISO, Timestamp Firestore, Date).
function _parseDue(due) {
  if (!due) return null;
  try {
    if (due.toDate) return due.toDate();
    if (due instanceof Date) return due;
    if (typeof due === "string") {
      // ISO "2026-04-23T12:00:00.000Z" o "2026-04-23"
      const d = new Date(due);
      if (!Number.isNaN(d.getTime())) return d;
    }
  } catch {}
  return null;
}

export async function handleAresInterventiAperti(parametri, ctx) {
  const limit = Math.min(Number(parametri.limit) || 20, 50);
  const userMessage = String((ctx && ctx.userMessage) || "");
  const userMessageLower = userMessage.toLowerCase();

  // Tecnico
  let tecnicoFilter = String(parametri.tecnico || parametri.nome || "").trim().toLowerCase() || null;
  if (!tecnicoFilter) tecnicoFilter = _extractTecnico(userMessage);

  // Range data: parametri.data > userMessage
  let range = null;
  if (parametri.data) range = parseRangeDataInterventi(String(parametri.data));
  if (!range) range = parseRangeDataInterventi(userMessage);

  // Città: parametri > userMessage
  let citta = String(parametri.citta || parametri.zona || parametri.localita || "").toLowerCase().trim() || null;
  if (!citta) citta = parseCittaIntervento(userMessage);

  // Tense detection: se passato, includi anche stati terminali
  const tense = _tense(userMessage);
  const includeTerminali = tense === "past" || /\btutt[ie]\b|\banche\s+chius/.test(userMessageLower);

  // ── QUERY FIRESTORE ────────────────────────────────────────────
  // Strategia:
  //   - Se c'è tecnicoFilter: due query parallele per intercettare
  //     sia chi ha tecnico in techName (primario) sia chi è in techNames[]
  //     (co-assegnato). Senza filtro listName per non perdere ACCENSIONE/
  //     SPEGNIMENTO o INTERVENTI DA ESEGUIRE (filtro applicato in memoria).
  //   - Se NO tecnicoFilter: query su listName INTERVENTI con limit alto.
  //   - inBacheca==true non viene mai aggiunto come filtro Firestore
  //     (richiede indice composito); viene applicato in memoria solo se
  //     non è una richiesta storica.
  const cosm = getCosminaDb();
  const tecnicoUpper = tecnicoFilter ? tecnicoFilter.toUpperCase() : null;
  const docs = new Map();
  const stats = { source: null, queries: [], rawCount: 0, federicoMatch: 0 };

  try {
    if (tecnicoUpper) {
      stats.source = "byTecnico";
      // Query 1: techName == TECNICO (case-sensitive UPPERCASE)
      const q1 = cosm.collection("bacheca_cards").where("techName", "==", tecnicoUpper).limit(500);
      // Query 2: techNames array-contains TECNICO
      const q2 = cosm.collection("bacheca_cards").where("techNames", "array-contains", tecnicoUpper).limit(500);
      let s1, s2;
      try {
        [s1, s2] = await Promise.all([q1.get(), q2.get()]);
      } catch (eMulti) {
        // Se l'indice array-contains non esiste, fallback a query 1 + scan
        logger.warn("ares query parallela fallita, fallback techName solo", { error: String(eMulti).slice(0, 150) });
        s1 = await q1.get();
        s2 = { forEach: () => {} };
      }
      stats.queries.push({ q: "techName==" + tecnicoUpper, count: s1.size });
      stats.queries.push({ q: "techNames array-contains " + tecnicoUpper, count: s2.size || 0 });
      s1.forEach(d => { if (!docs.has(d.id)) docs.set(d.id, d); });
      s2.forEach(d => { if (!docs.has(d.id)) docs.set(d.id, d); });

      // Query 3: labels[].name === TECNICO (co-tecnici via label colorata).
      // ACG usa labels Trello-style {name, color} per i co-coinvolti. Il
      // color può variare (sky/sky_light/black_light/orange/blue/lime),
      // quindi facciamo array-contains per ognuno dei 6 colori più
      // frequenti — copre > 99% dei casi reali.
      const LABEL_COLORS = ["sky_light", "sky", "black_light", "orange", "blue", "lime"];
      const labelQueries = LABEL_COLORS.map(color =>
        cosm.collection("bacheca_cards")
          .where("labels", "array-contains", { name: tecnicoUpper, color })
          .limit(500).get()
          .catch(e => { logger.warn("ares label query failed", { color, error: String(e).slice(0, 100) }); return { forEach: () => {}, size: 0 }; })
      );
      try {
        const labelSnaps = await Promise.all(labelQueries);
        let labelCount = 0;
        labelSnaps.forEach((s, i) => {
          labelCount += s.size || 0;
          s.forEach(d => { if (!docs.has(d.id)) docs.set(d.id, d); });
        });
        stats.queries.push({ q: `labels array-contains {name=${tecnicoUpper},color in [${LABEL_COLORS.join(",")}]}`, count: labelCount });
      } catch (eLab) {
        logger.warn("ares label queries failed", { error: String(eLab).slice(0, 150) });
      }

      // Fallback ulteriore: il primo nome è capitalize → potrebbe essere
      // "Federico" non "FEDERICO". Provo Capitalize se 0 risultati.
      if (docs.size === 0) {
        const cap = tecnicoUpper.charAt(0) + tecnicoUpper.slice(1).toLowerCase();
        const q3 = cosm.collection("bacheca_cards").where("techName", "==", cap).limit(500);
        const q4 = cosm.collection("bacheca_cards").where("techNames", "array-contains", cap).limit(500);
        try {
          const [s3, s4] = await Promise.all([q3.get(), q4.get()]);
          stats.queries.push({ q: "techName==" + cap + " (fallback)", count: s3.size });
          stats.queries.push({ q: "techNames AC " + cap + " (fallback)", count: s4.size });
          s3.forEach(d => { if (!docs.has(d.id)) docs.set(d.id, d); });
          s4.forEach(d => { if (!docs.has(d.id)) docs.set(d.id, d); });
        } catch {}
      }
    } else {
      // No tecnicoFilter: query su listName INTERVENTI (case-sensitive
      // exact match Firestore, ma allarghiamo in memoria)
      stats.source = "byListName";
      const q = cosm.collection("bacheca_cards")
        .where("listName", "==", "INTERVENTI")
        .limit(800);
      const s = await q.get();
      stats.queries.push({ q: "listName==INTERVENTI", count: s.size });
      s.forEach(d => { if (!docs.has(d.id)) docs.set(d.id, d); });
    }
  } catch (e) {
    const msg = String(e?.message || e);
    if (/permission|denied|UNAUTHENTICATED|403/i.test(msg)) {
      return {
        content:
          `ARES non riesce a leggere COSMINA dalla Cloud Function: il Service ` +
          `Account non ha ancora i permessi cross-progetto su garbymobile-f89ac. ` +
          `Per attivare:\n\n  gcloud projects add-iam-policy-binding garbymobile-f89ac \\\n` +
          `    --member=serviceAccount:272099489624-compute@developer.gserviceaccount.com \\\n` +
          `    --role=roles/datastore.user`,
      };
    }
    throw e;
  }
  stats.rawCount = docs.size;

  // ── FILTRO IN MEMORIA ──────────────────────────────────────────
  const items = [];
  let scannedTecnico = 0, filteredByList = 0, filteredByStato = 0,
      filteredByDate = 0, filteredByCitta = 0;

  for (const d of docs.values()) {
    const data = d.data() || {};
    const stato = String(data.stato || "").toLowerCase();

    // Filtro listName (allargato a INTERVENTI / DA ESEGUIRE / ACCENSIONE / TICKET)
    if (!_isListInterventi(data.listName)) { filteredByList++; continue; }

    // Filtro stato terminali
    if (!includeTerminali && STATI_TERMINALI_RE.test(stato)) { filteredByStato++; continue; }

    // Filtro tecnico (anche se la query era già su techName/techNames,
    // ricontrolliamo per sicurezza: il fallback ListName non filtra)
    const techs = _allTechs(data);
    if (tecnicoFilter) {
      const techHay = techs.join("|").toLowerCase();
      if (!techHay.includes(tecnicoFilter)) { scannedTecnico++; continue; }
    }

    const due = _parseDue(data.due);

    // Filtro range data
    if (range) {
      if (!due) { filteredByDate++; continue; }
      if (due < range.from || due >= range.to) { filteredByDate++; continue; }
    }

    // Filtro città (boardName + desc + zona + workDescription + name)
    if (citta) {
      const hay = [data.boardName, data.desc, data.zona, data.workDescription, data.name]
        .map(x => String(x || "").toLowerCase()).join(" ");
      if (!hay.includes(citta)) { filteredByCitta++; continue; }
    }

    items.push({
      id: d.id,
      condominio: data.boardName || "?",
      stato: stato || "aperto",
      tecnico: techs.join(" + ") || "-",
      techPrimary: data.techName || (techs[0] || "-"),
      techCount: techs.length,
      due,
      name: data.name || "(senza titolo)",
      workDescription: data.workDescription || "",
      listName: data.listName || "",
      // Raw card fields per dedup + categoria
      _raw: {
        workHours: data.workHours,
        workDescription: data.workDescription,
        closedAt: data.closedAt,
        boardName: data.boardName,
        originalBoardId: data.originalBoardId,
        listName: data.listName,
        techName: data.techName,
        techNames: data.techNames,
        due: data.due,
        stato: data.stato,
        name: data.name,
        desc: data.desc,
      },
      categoria: cardCategoryFromListName(data.listName, data.name),
      executionStatus: cardExecutionStatus(data),
      isRitorno: isCardRitorno(data),
    });
  }

  // ── DEDUP: card duplicate sullo stesso intervento fisico ────────
  // Trello sync occasionalmente crea più rapporti per lo stesso intervento.
  // Raggruppa per (originalBoardId | boardName-norm, dueDay, techPrimary,
  // listName-group) e mantieni la card più "ricca".
  const dedupBuckets = new Map();
  for (const it of items) {
    const key = cardDuplicateGroupKey(it._raw);
    if (!key) { dedupBuckets.set(it.id, [it]); continue; }
    const cur = dedupBuckets.get(key);
    if (!cur) dedupBuckets.set(key, [it]);
    else cur.push(it);
  }
  const itemsDedup = [];
  let droppedCount = 0;
  const droppedDetail = []; // descrizioni dei dedup per nota finale
  for (const group of dedupBuckets.values()) {
    if (group.length <= 1) { itemsDedup.push(group[0]); continue; }
    // Sort: card più ricca prima
    group.sort((a, b) => cardRichnessCompare(a._raw, b._raw));
    const kept = group[0];
    itemsDedup.push(kept);
    droppedCount += group.length - 1;
    // Costruisci descrizione del dedup per il messaggio utente
    for (const dropped of group.slice(1)) {
      const whK = Number(kept._raw.workHours || 0);
      const whD = Number(dropped._raw.workHours || 0);
      const wdLK = String(kept._raw.workDescription || "").length;
      const wdLD = String(dropped._raw.workDescription || "").length;
      let motivo = "rapporto chiuso più volte";
      if (whK > 0 && whD > 0 && whK !== whD) {
        motivo = `rapporto leggero ${whD}h vs ${whK}h della stessa card`;
      } else if (wdLK > wdLD * 2) {
        motivo = `rapporto sintetico vs descrizione completa`;
      }
      const condK = String(kept._raw.boardName || "").replace(/^[A-Z0-9]+\s*-\s*/, "").slice(0, 40);
      droppedDetail.push(`${condK || kept.id}: card ${dropped.id.slice(-8)} raggruppata (${motivo})`);
    }
  }

  // Logging diagnostico (visibile in Cloud Functions logs)
  logger.info("[ARES] handleAresInterventiAperti", {
    tecnicoFilter, range: range ? range.label : null, citta,
    tense, includeTerminali,
    stats, itemsRaw: items.length, itemsDedup: itemsDedup.length, droppedCount,
    filteredByList, filteredByStato, scannedTecnico,
    filteredByDate, filteredByCitta,
  });

  itemsDedup.sort((a, b) => {
    if (!a.due) return 1;
    if (!b.due) return -1;
    return a.due.getTime() - b.due.getTime();
  });
  // Riassegno la variabile items perché i blocchi successivi (counts/render
  // intro "items.length > top.length") leggono items.
  const items_ = items; // shadow per non rompere il logger sopra
  // eslint-disable-next-line no-unused-vars
  void items_;
  // Riuso la variabile locale items per compatibilità render successivo
  // ATTENZIONE: 'items' è const, usiamo un alias.
  const itemsForRender = itemsDedup;
  const top = itemsForRender.slice(0, limit);
  // Per le sezioni successive che leggono items.length come "totalMatched"
  // (vedi "Altri X non mostrati"), uso itemsForRender.length.

  // ── Costruzione risposta discorsiva ───────────────────────────
  const tecnicoCap = tecnicoFilter
    ? tecnicoFilter.charAt(0).toUpperCase() + tecnicoFilter.slice(1)
    : null;
  const cittaCap = citta ? citta.charAt(0).toUpperCase() + citta.slice(1) : null;
  const rangeLabel = range ? range.label : null;
  // Verbo: "ha avuto" se passato, "ha" se presente, "avrà" se futuro
  const verb = (tense === "past") ? "ha avuto" : (tense === "future" ? "avrà" : "ha");

  if (!top.length) {
    // Diagnostica: quando 0 risultati, dichiara cosa è stato cercato.
    const totaleTecnico = tecnicoFilter ? stats.rawCount : null;
    const diag = (() => {
      const parts = [];
      if (totaleTecnico != null) parts.push(`${totaleTecnico} card totali`);
      if (rangeLabel) parts.push(`filtro data ${rangeLabel}`);
      if (cittaCap) parts.push(`filtro città ${cittaCap}`);
      if (!includeTerminali) parts.push("solo aperti");
      else parts.push("anche chiusi");
      return parts.length ? ` (cercato: ${parts.join(", ")})` : "";
    })();

    if (rangeLabel || cittaCap) {
      return {
        content: (tecnicoCap
          ? `${tecnicoCap} ${rangeLabel ? rangeLabel + " " : ""}${cittaCap ? "a " + cittaCap + " " : ""}non ha interventi`
          : `Nessun intervento ${rangeLabel || ""}${cittaCap ? " a " + cittaCap : ""}`).replace(/\s+/g, " ").trim() + diag + ".",
        data: { count: 0, tecnico: tecnicoFilter, range: rangeLabel, citta, stats },
      };
    }
    if (tecnicoCap) {
      return { content: `${tecnicoCap} non ha interventi attivi in bacheca${diag}.`, data: { count: 0, tecnico: tecnicoFilter, stats } };
    }
    return { content: "Non ho trovato interventi nella bacheca COSMINA.", data: { count: 0, stats } };
  }

  // Helper: estrae titolo "umano" della card. Per ACCENSIONE/SPEGNIMENTO/
  // LETTURE usa il `name` (es. "Spegnimento", "Letture dirette") perché il
  // boardName è il condominio mentre il name dice cosa è. Per INTERVENTI
  // tipici usa boardName + fallback name su ZZ000/CLIENTI PRIVATI.
  const getCondLabel = (i) => {
    const board = String(i.condominio || "").trim();
    const cat = i.categoria || "intervento";
    const cleanName = String(i.name || i.workDescription || "")
      .replace(/\s*-?\s*Intervento\s+concluso\s+DA\s+.+$/i, "")
      .replace(/\s*-?\s*Intervento\s+concluso\s*$/i, "")
      .replace(/^RITORNO\s+/i, "")
      .trim();
    const boardClean = board.replace(/^[A-Z0-9]+\s*-\s*/, "").slice(0, 70);
    if (cat === "spegnimento" || cat === "accensione" || cat === "lettura") {
      // Es. "Spegnimento al CONDOMINIO STELLA A"
      const cond = boardClean || cleanName || "(senza luogo)";
      return `${cat} al ${cond}`;
    }
    if (cat === "ticket") return `ticket: ${cleanName || boardClean || "(senza titolo)"}`;
    // intervento/da validare/card
    if (!board || board === "?" || /^ZZ\d+/i.test(board) || /CLIENTI\s+PRIVATI/i.test(board)) {
      return cleanName ? cleanName.slice(0, 90) : "intervento privato";
    }
    // Per INTERVENTI con board valido, se name è ricco e diverso dal board, mostralo
    if (cleanName && cleanName.length > 10 && !/Intervento concluso/i.test(i.name || "")
        && !cleanName.toLowerCase().includes(boardClean.toLowerCase().slice(0, 20))) {
      return `${boardClean} (${cleanName.slice(0, 60)})`;
    }
    return boardClean;
  };

  // Render righe in prosa per le risposte multi-result.
  // Per le card "scheduled" (ritorni / aperte non eseguite) etichetta
  // diversa: "programmato non ancora eseguito" invece di "stato chiuso".
  const renderLine = (i) => {
    const data = i.due ? i.due.toLocaleDateString("it-IT") : "n.d.";
    const cond = getCondLabel(i);
    const techsArr = String(i.tecnico || "").split(" + ").map(t => t.trim()).filter(Boolean);
    const techsDedup = [...new Map(techsArr.map(t => [t.toLowerCase(), t])).values()];
    let tag;
    if (techsDedup.length > 1) tag = `tecnici ${techsDedup.join(" + ")}`;
    else if (techsDedup.length === 1 && techsDedup[0] !== "-") tag = `tecnico ${techsDedup[0]}`;
    else tag = "non assegnato";
    // Stato semantico per Alberto: "eseguito" / "programmato non eseguito" / etc.
    let statoLabel;
    if (i.executionStatus === "executed") {
      statoLabel = i.isRitorno ? "ritorno eseguito" : "eseguito";
    } else if (i.executionStatus === "scheduled") {
      statoLabel = i.isRitorno ? "ritorno programmato non ancora eseguito" : "programmato non ancora eseguito";
    } else if (i.executionStatus === "in_progress") {
      statoLabel = "in corso";
    } else {
      statoLabel = `stato ${i.stato || "aperto"}`;
    }
    return `${data}, ${cond}, ${statoLabel}, ${tag}`;
  };

  // 1 risultato → frase singola
  if (top.length === 1) {
    const i = top[0];
    const tecnicoTag = tecnicoCap ? `${tecnicoCap}` : "";
    const dataTag = rangeLabel ? rangeLabel : "";
    const cittaTag = cittaCap ? `a ${cittaCap}` : "";
    const cond = getCondLabel(i);
    const head = `${tecnicoTag} ${dataTag} ${cittaTag}`.replace(/\s+/g, " ").trim();
    // Co-assegnato: dedup, case-insensitive, esclude il tecnico richiesto
    let coAss = "";
    if (i.techCount > 1 && tecnicoFilter) {
      const others = String(i.tecnico).split(" + ")
        .filter(t => !t.toLowerCase().includes(tecnicoFilter));
      const dedup = [...new Set(others.map(t => t.trim()))].filter(Boolean);
      if (dedup.length) coAss = ` (co-assegnato a ${dedup.join(", ")})`;
    }
    const includeDateSuffix = !dataTag || !i.due || !dataTag.includes(i.due.toLocaleDateString("it-IT"));
    const dueIt = (i.due && includeDateSuffix) ? ` il ${i.due.toLocaleDateString("it-IT")}` : "";
    const categoria = i.categoria || "intervento";
    // Articolo per categoria: "un intervento", "uno spegnimento", "una lettura"
    const articolo = categoria === "spegnimento" || categoria === "spegnimenti" ? "uno"
      : (categoria === "lettura" || categoria === "accensione" ? "una" : "un");
    // Stato semantico: distingue eseguito da programmato non eseguito
    let statoFrase;
    if (i.executionStatus === "scheduled") {
      statoFrase = i.isRitorno ? "ritorno programmato non ancora eseguito" : "programmato non ancora eseguito";
    } else if (i.executionStatus === "executed") {
      statoFrase = i.isRitorno ? "ritorno eseguito" : `eseguito (stato ${i.stato})`;
    } else {
      statoFrase = `stato ${i.stato}`;
    }
    // Per scheduled cambia anche il verbo principale
    let verbo = verb;
    if (i.executionStatus === "scheduled" && tense === "past") {
      verbo = "aveva in agenda";
    } else if (i.executionStatus === "scheduled" && tense !== "past") {
      verbo = "ha in agenda";
    }
    return {
      content: `${head ? head + " " : ""}${verbo} ${articolo} ${categoria}${dueIt}: ${cond}, ${statoFrase}${coAss}.`.trim(),
      data: { count: 1, tecnico: tecnicoFilter, range: rangeLabel, citta, items: top, stats, droppedCount },
    };
  }

  // ── Più risultati → intro raggruppata per tipologia + esecuzione ─
  // Split eseguiti vs scheduled (programmati non eseguiti).
  const eseguiti = top.filter(i => i.executionStatus === "executed");
  const scheduled = top.filter(i => i.executionStatus === "scheduled");
  const inProgress = top.filter(i => i.executionStatus === "in_progress");

  // Conteggi per categoria sui SOLI eseguiti per la frase principale.
  const buildCatSummary = (subset) => {
    const byCat = {};
    for (const i of subset) {
      const c = i.categoria || "intervento";
      byCat[c] = (byCat[c] || 0) + 1;
    }
    const frasi = Object.entries(byCat).map(([cat, n]) => `${n} ${cardCategoryLabel(cat, n)}`);
    if (!frasi.length) return null;
    if (frasi.length === 1) return frasi[0];
    if (frasi.length === 2) return `${frasi[0]} e ${frasi[1]}`;
    return frasi.slice(0, -1).join(", ") + " e " + frasi[frasi.length - 1];
  };

  // Costruisce frase intro distinguendo eseguito vs programmato non eseguito.
  const introParts = [];
  introParts.push(tecnicoCap ? `${tecnicoCap}` : "Trovo");
  if (rangeLabel) introParts.push(rangeLabel);
  if (cittaCap) introParts.push(`a ${cittaCap}`);
  // Per past tense (aveva avuto), per "eseguiti" usa il verbo "ha avuto/eseguito"
  // Per scheduled mantieni "ha in agenda / ha programmato"
  const eseguitiSummary = buildCatSummary(eseguiti);
  const scheduledSummary = buildCatSummary(scheduled);
  const inProgressSummary = buildCatSummary(inProgress);

  let frase;
  if (eseguitiSummary && (scheduledSummary || inProgressSummary)) {
    const verboEseguito = (tense === "past") ? "ha eseguito" : "esegue";
    const subAgenda = scheduledSummary || inProgressSummary;
    const verboAgenda = (tense === "past") ? "aveva in agenda" : "ha in agenda";
    frase = `${verboEseguito} ${eseguitiSummary} e ${verboAgenda} ${subAgenda} (non ancora eseguit${subAgenda.includes("interventi") || subAgenda.includes("spegnimenti") || subAgenda.includes("letture") ? "i" : "o"}).`;
  } else if (eseguitiSummary) {
    frase = `${verb} ${eseguitiSummary}.`;
  } else if (scheduledSummary) {
    const verboAgenda = (tense === "past") ? "aveva in agenda" : "ha in agenda";
    frase = `${verboAgenda} ${scheduledSummary} (non ancora eseguit${scheduledSummary.includes("interventi") || scheduledSummary.includes("spegnimenti") || scheduledSummary.includes("letture") ? "i" : "o"}).`;
  } else if (inProgressSummary) {
    frase = `${verb} ${inProgressSummary} in corso.`;
  } else {
    frase = `${verb} ${top.length} card.`;
  }
  introParts.push(frase);
  const intro = introParts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  const righe = top.map(renderLine).join("\n");
  const more = itemsForRender.length > top.length ? `\n\nAltre ${itemsForRender.length - top.length} non mostrate.` : "";
  // Nota dedup: include ID e motivo
  let dedupNote = "";
  if (droppedCount > 0) {
    const linee = droppedDetail.slice(0, 3).join("; ");
    dedupNote = `\n\nNota dedup: ${droppedCount} card raggruppata${droppedCount > 1 ? "e" : ""} come duplicato. ${linee}.`;
  }
  return {
    content: `${intro}\n\n${righe}${more}${dedupNote}`,
    data: {
      count: top.length, totalMatched: itemsForRender.length, droppedCount,
      droppedDetail, eseguiti: eseguiti.length, scheduled: scheduled.length, inProgress: inProgress.length,
      tecnico: tecnicoFilter, range: rangeLabel, citta, items: top, stats,
    },
  };
}

async function isAresDryRun() {
  try {
    const snap = await getCosminaDb().collection("cosmina_config").doc("ares_config").get();
    if (snap.exists && typeof (snap.data() || {}).dry_run === "boolean") {
      return snap.data().dry_run;
    }
  } catch {}
  return true;
}

function aresIntId() {
  return "int_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

export async function handleAresApriIntervento(parametri, ctx) {
  const msg = String(ctx?.userMessage || "").toLowerCase();

  let condominio = String(
    parametri.condominio || parametri.cliente || parametri.indirizzo || parametri.dove || "",
  ).trim();
  const note = String(
    parametri.note || parametri.descrizione || parametri.problema || parametri.testo || "",
  ).trim();
  const tipoRaw = String(parametri.tipo || "").toLowerCase();
  const urgenzaRaw = String(parametri.urgenza || parametri.priorità || parametri.priority || "").toLowerCase();

  if (!condominio && msg) {
    const m = /(?:presso|per|al|alla|a|da)\s+(?:condominio\s+|condom\.\s+)?([A-Za-zÀ-ÿ][\w\sÀ-ÿ.,'\-]{2,60}?)(?:\s+(?:urgente|normale|subito|per|con|in|entro|per|$)|$)/i.exec(msg);
    if (m) condominio = m[1].trim();
  }

  let tipo = "manutenzione";
  if (tipoRaw.includes("ripar") || /ripar|guast/i.test(msg)) tipo = "riparazione";
  else if (tipoRaw.includes("install") || /install/i.test(msg)) tipo = "installazione";
  else if (tipoRaw.includes("sopral") || /sopral/i.test(msg)) tipo = "sopralluogo";

  let urgenza = "media";
  if (urgenzaRaw.includes("critic") || /critic|immediat|subito/i.test(msg)) urgenza = "critica";
  else if (urgenzaRaw.includes("alta") || urgenzaRaw === "high" || /urgent|priorit/i.test(msg)) urgenza = "alta";
  else if (urgenzaRaw.includes("bass") || /non.*urgent|basso|flessibil/i.test(msg)) urgenza = "bassa";

  if (!condominio) {
    return {
      content: "🔧 Per aprire un intervento mi serve il condominio/indirizzo.\n\n" +
        "Es. \"apri intervento riparazione caldaia al Condominio Kristal urgente\"",
    };
  }

  const id = aresIntId();
  const dry = await isAresDryRun();

  const cardName = (note || `${tipo} ${urgenza}`).slice(0, 80);
  const labels = [`tipo:${tipo}`, `urgenza:${urgenza}`, "source:nexus"];
  if (urgenza === "critica" || urgenza === "alta") labels.push("URGENTE");

  if (dry) {
    try {
      await db.collection("ares_interventi").doc(id).set({
        id, condominio, tipo, urgenza, note,
        stato: "aperto", source: "nexus",
        _dryRun: true,
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (e) {
      logger.error("ares mirror failed", { error: String(e) });
    }
    return {
      content:
        `📝 Intervento **simulato** (ARES DRY_RUN)\n\n` +
        `  · Condominio: **${condominio}**\n` +
        `  · Tipo: ${tipo}\n` +
        `  · Urgenza: ${urgenza}${urgenza !== "media" ? " ⚠️" : ""}\n` +
        (note ? `  · Note: ${note}\n` : "") +
        `\nID: \`${id}\`. Per scrivere davvero su COSMINA, imposta \`cosmina_config/ares_config.dry_run = false\`.`,
      data: { id, dryRun: true },
    };
  }

  try {
    const cosmDb = getCosminaDb();
    const ref = cosmDb.collection("bacheca_cards").doc();
    await ref.set({
      name: cardName,
      boardName: condominio,
      desc: note || undefined,
      workDescription: note || undefined,
      listName: "INTERVENTI",
      inBacheca: true,
      archiviato: false,
      stato: "aperto",
      labels,
      source: "nexus_ares",
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    try {
      await db.collection("ares_interventi").doc(ref.id).set({
        id: ref.id, cosmina_doc_id: ref.id,
        condominio, tipo, urgenza, note,
        stato: "aperto", source: "nexus",
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch {}

    return {
      content:
        `✅ Intervento **creato** su COSMINA\n\n` +
        `  · Condominio: **${condominio}**\n` +
        `  · Tipo: ${tipo} · Urgenza: ${urgenza}\n` +
        (note ? `  · Note: ${note}\n` : "") +
        `\nID: \`${ref.id}\` · Visibile nella bacheca interventi.`,
      data: { id: ref.id, cosminaDocId: ref.id, dryRun: false },
    };
  } catch (e) {
    const errMsg = String(e?.message || e).slice(0, 200);
    if (/permission|denied|403/i.test(errMsg)) {
      return { content: `❌ ARES non può scrivere su COSMINA: permessi insufficienti. ${errMsg}` };
    }
    return { content: `❌ ARES: scrittura fallita. ${errMsg}` };
  }
}

// ─── handleAresCreaIntervento ──────────────────────────────────
// Comando di CREAZIONE intervento sulla bacheca COSMINA.
// Trigger: "metti/crea/programma/fissa/aggiungi intervento", "mettigli intervento".
// Flow: parse parametri → preview con riepilogo → pending in
// nexo_ares_pending/{sessionId} → conferma utente → scrittura su
// bacheca_cards (techName/techNames/due/boardName/listName=INTERVENTI DA ESEGUIRE/createdBy=NEXUS).
// In FORGE/dry-run: simula, non scrive davvero.

const TECNICI_ACG_UPPER = TECNICI_ACG.map(t => t.toUpperCase());

// Estrae array di nomi tecnici da messaggio. Gestisce "con A e B", "A e B",
// "Federico, David". Ritorna array uppercase senza duplicati, già nella
// whitelist 9 tecnici.
function _extractTecniciCrea(userMessage, parametri) {
  const out = new Set();
  const add = (raw) => {
    const t = String(raw || "").trim().toLowerCase();
    if (!t) return;
    for (const nome of TECNICI_ACG) {
      if (t.includes(nome)) out.add(nome.toUpperCase());
    }
  };

  // 1. Da parametri (Haiku)
  if (Array.isArray(parametri.tecnici)) for (const t of parametri.tecnici) add(t);
  if (parametri.tecnico) add(parametri.tecnico);
  if (parametri.nome) add(parametri.nome);

  // 2. Pattern "con [tecnico]" / "con [A] e [B]"
  const m = String(userMessage || "").toLowerCase();
  const conM = m.match(/\bcon\s+([a-zà-ÿ\s,e]+?)(?:\s*(?:domani|oggi|ieri|stamani|stamattina|alle|al\b|alla\b|allo\b|in\b|presso\b|per\b|a\s|$|[,.\?!]))/i);
  if (conM) {
    for (const part of conM[1].split(/\s+e\s+|\s*,\s*/)) add(part);
  }
  // 3. Pattern "tecnico [Nome]" / "tecnici [A] e [B]"
  const tecM = m.match(/\btecnic[oi]\s+([a-zà-ÿ\s,e]+?)(?:\s*(?:domani|oggi|alle|al\b|in\b|per\b|a\s|$|[,.\?!]))/i);
  if (tecM) for (const part of tecM[1].split(/\s+e\s+|\s*,\s*/)) add(part);
  // 4. Tecnici menzionati ovunque nel messaggio (whitelist)
  for (const nome of TECNICI_ACG) {
    if (new RegExp(`\\b${nome}\\b`, "i").test(m)) out.add(nome.toUpperCase());
  }
  return [...out];
}

// Parse data + ora colloquiale. Ritorna Date oppure null.
// Riusa parseRangeDataInterventi per la data, poi imposta l'ora.
function _parseDataOra(userMessage, parametri) {
  const m = String(userMessage || "").toLowerCase();
  // Data: priorità a parametri.data ma SEMPRE concateno il userMessage per
  // dare contesto di tense ("programma" = futuro). Se Haiku passa solo
  // "lunedì" senza il verbo, il parser default a "passato più recente".
  let baseDate = null;
  if (parametri.data) {
    const hint = String(parametri.data) + " " + m;
    const r = parseRangeDataInterventi(hint);
    if (r) baseDate = new Date(r.from);
  }
  if (!baseDate) {
    const r = parseRangeDataInterventi(m);
    if (r) baseDate = new Date(r.from);
  }
  if (!baseDate) return null;

  // Ora: "mattina"=09:00, "pomeriggio"=14:00, "sera"=18:00,
  //       "alle 9", "alle 14:30", "alle 9 e mezza"
  let h = null, mi = 0;
  if (parametri.ora) {
    const oraM = String(parametri.ora).match(/(\d{1,2})(?::?(\d{2}))?/);
    if (oraM) { h = Number(oraM[1]); mi = Number(oraM[2] || 0); }
  }
  if (h == null) {
    const oraExpl = m.match(/\balle?\s+(\d{1,2})(?:[:.]\s*(\d{2}))?(?:\s+e\s+(mezza|quarto|tre[\s-]quarti))?/i);
    if (oraExpl) {
      h = Number(oraExpl[1]); mi = Number(oraExpl[2] || 0);
      if (oraExpl[3]) {
        if (/mezza/i.test(oraExpl[3])) mi = 30;
        else if (/quarto/i.test(oraExpl[3])) mi = 15;
        else if (/tre/i.test(oraExpl[3])) mi = 45;
      }
    } else if (/\b(stamattina|stamani|mattina(?:ta)?\s+presto|in\s+mattinata|prima\s+mattina)\b/i.test(m)) h = 8;
    else if (/\bmattin/i.test(m)) h = 9;
    else if (/\bprimo\s+pomeriggio|primissimo\s+pomeriggio\b/i.test(m)) h = 13;
    else if (/\bpomerigg/i.test(m)) h = 14;
    else if (/\b(sera(?:le|ta)?|tardo\s+pomeriggio)\b/i.test(m)) h = 18;
  }
  if (h == null) h = 9; // default mattina
  // baseDate è mezzanotte italiana espressa come Date UTC. setHours sul
  // server (UTC) producerebbe l'ora UTC sbagliata. Costruiamo invece una
  // ISO con offset Europe/Rome esplicito (gestisce CET/CEST automaticamente).
  const ymd = mezzanotteItalia(baseDate);
  // Estrai Y/M/D italiani della data target
  const yYMD = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(ymd).split("-").map(Number);
  const Y = yYMD[0], M = yYMD[1], D = yYMD[2];
  // Calcola offset Europe/Rome per la data target (CET=+01:00 / CEST=+02:00)
  const refUtc = new Date(Date.UTC(Y, M - 1, D, 12));
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Rome",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const parts = Object.fromEntries(dtf.formatToParts(refUtc).filter(p => p.type !== "literal").map(p => [p.type, Number(p.value)]));
  const asRomeMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour === 24 ? 0 : parts.hour, parts.minute, parts.second);
  const offsetMin = Math.round((asRomeMs - refUtc.getTime()) / 60000);
  const sign = offsetMin >= 0 ? "+" : "-";
  const oh = Math.abs(Math.trunc(offsetMin / 60));
  const om = Math.abs(offsetMin % 60);
  const iso = `${Y}-${String(M).padStart(2,"0")}-${String(D).padStart(2,"0")}T${String(h).padStart(2,"0")}:${String(mi).padStart(2,"0")}:00${sign}${String(oh).padStart(2,"0")}:${String(om).padStart(2,"0")}`;
  return new Date(iso);
}

// Estrae condominio/indirizzo dal messaggio o dal contesto precedente.
async function _extractCondominio(userMessage, parametri, sessionId) {
  // 1. Da parametri (Haiku)
  let cond = String(parametri.condominio || parametri.cliente || parametri.indirizzo || parametri.dove || parametri.luogo || "").trim();
  if (cond) return { value: cond, source: "parametri" };

  const m = String(userMessage || "");

  // 2. Città in whitelist (priorità alta: "ad Alessandria", "a Voghera")
  const cittaFound = parseCittaIntervento(m);
  if (cittaFound) {
    return { value: cittaFound.charAt(0).toUpperCase() + cittaFound.slice(1), source: "messaggio_citta" };
  }

  // 3. Pattern espliciti "presso/al/alla/al condominio [Cond]" — verbi più specifici.
  // Non più "a [X]" libero perché matcha "a Federico" (nome tecnico).
  const reSpec = /(?:presso\s+(?:il\s+|la\s+|lo\s+)?(?:condominio\s+|cond\.\s+)?|al\s+(?:condominio\s+|cond\.\s+)|alla\s+(?:palazzina\s+|villa\s+)?|allo\s+(?:stabile\s+)?|da\s+(?:un\s+)?(?:condominio\s+|cond\.\s+)|nel\s+condominio\s+|in\s+via\s+|in\s+viale\s+|in\s+corso\s+|in\s+piazza\s+)([A-Za-zÀ-ÿ][\w\sÀ-ÿ.,'\-]{2,60}?)(?=\s+(?:urgente|normale|subito|alle?|domani|oggi|per|con|in|entro|mattina|pomerigg|sera|$|[,.!?]))/i;
  const found = reSpec.exec(m);
  if (found) {
    const v = found[1].trim();
    // Esclude se è solo un nome di tecnico ACG
    if (!TECNICI_ACG.includes(v.toLowerCase())) {
      return { value: v, source: "messaggio" };
    }
  }

  // 3. Pronome "ci/lì" → ultima query ARES nella stessa sessione
  if (sessionId && /\b(ci|l[iì])\s+(?:deve|dovr|va\b)/i.test(m)) {
    try {
      const snap = await db.collection("nexus_chat")
        .where("sessionId", "==", sessionId)
        .orderBy("createdAt", "desc")
        .limit(20).get();
      // Cerca l'ultimo messaggio assistant con direct.data.items[]
      const docs = [];
      snap.forEach(d => docs.push(d));
      // Già ordinati desc, prendo il più recente con boardName valido
      for (const d of docs) {
        const v = d.data() || {};
        if (v.role !== "assistant") continue;
        const items = v.direct?.data?.items;
        if (Array.isArray(items) && items.length) {
          const it = items[0];
          const board = it.condominio || it.boardName || it.name;
          if (board && board !== "?") return { value: String(board).trim(), source: "contesto_chat" };
        }
      }
    } catch (e) {
      logger.warn("ares contesto failed", { error: String(e).slice(0, 120) });
    }
  }
  return { value: "", source: null };
}

// Cerca nel database `bacheca_cards` il boardName canonico per il
// condominio inserito da Alberto. Es. "Residenza Le Rose" → "S029 -
// RESIDENZA LE ROSE - VIA CALIPARI 5 - LUNGAVILLA (PV)". Match flessibile
// (case-insensitive, parole chiave).
async function _lookupBoardCanonical(rawName) {
  const input = String(rawName || "").trim().toLowerCase();
  if (!input || input.length < 4) return null;
  // Parole chiave significative (>=3 char, escluse stop word generiche).
  // NB: "condominio" e "residenza" sono stop word per il matching ma vengono
  // usate sotto come BOOST di score (preferiamo board name con la stessa
  // tipologia: input "residenza" → board "RESIDENZA", input "condominio" → "CONDOMINIO").
  const STOP = new Set(["via","viale","corso","piazza","del","della","dei","delle","il","la","lo","di","da","al","alla","con","per","in","su","condominio","residenza","palazzina"]);
  const keywords = input.split(/[\s,.\-]+/).filter(w => w.length >= 3 && !STOP.has(w));
  if (!keywords.length) return null;
  // Tipologia esplicitata dall'input (per boost score)
  const wantsResidenza = /\bresidenza\b/.test(input);
  const wantsCondominio = /\bcondominio\b/.test(input);
  const wantsPalazzina = /\bpalazzina\b/.test(input);
  try {
    const cosm = getCosminaDb();
    const snap = await cosm.collection("bacheca_cards").limit(5000).get();
    const seen = new Map();
    snap.forEach(d => {
      const x = d.data();
      const bn = String(x.boardName || "").trim();
      if (!bn) return;
      const lc = bn.toLowerCase();
      const matches = keywords.every(k => lc.includes(k));
      if (!matches) return;
      // Score: codice prefisso (10) + tipologia esatta matchata (50)
      let score = (/^[A-Z0-9]+\s*-\s*/.test(bn) ? 10 : 0) + Math.min(bn.length, 100);
      if (wantsResidenza && /\bresidenza\b/i.test(bn)) score += 50;
      if (wantsCondominio && /\bcondominio\b/i.test(bn)) score += 50;
      if (wantsPalazzina && /\bpalazzina\b/i.test(bn)) score += 50;
      // Penalty se la tipologia richiesta NON è quella del board
      if (wantsResidenza && !/\bresidenza\b/i.test(bn) && /\b(condominio|palazzina)\b/i.test(bn)) score -= 30;
      if (wantsCondominio && !/\bcondominio\b/i.test(bn) && /\b(residenza|palazzina)\b/i.test(bn)) score -= 30;
      if (wantsPalazzina && !/\bpalazzina\b/i.test(bn) && /\b(condominio|residenza)\b/i.test(bn)) score -= 30;
      if (!seen.has(bn) || score > seen.get(bn).score) {
        seen.set(bn, { boardName: bn, score });
      }
    });
    if (!seen.size) return null;
    const best = [...seen.values()].sort((a, b) => b.score - a.score)[0];
    logger.info("[ARES] boardName canonical lookup", { input: rawName, found: best.boardName, score: best.score });
    return best.boardName;
  } catch (e) {
    logger.warn("ares boardName lookup fallita", { error: String(e).slice(0, 100) });
    return null;
  }
}

// Estrae descrizione dal messaggio (dopo "per" o intera frase pulita).
function _extractDescrizione(userMessage, parametri) {
  const fromParam = String(parametri.descrizione || parametri.note || parametri.problema || parametri.testo || parametri.lavoro || "").trim();
  if (fromParam) return fromParam.slice(0, 120);
  const m = String(userMessage || "");
  // Strategia 1: dopo virgola finale (",controllo impianto solare")
  // L'utente tipicamente separa la descrizione da virgola dopo il luogo.
  const commaTail = m.match(/,\s*([a-zà-ÿ\s\d.,'\-]{4,120})$/i);
  if (commaTail) {
    const t = commaTail[1].trim();
    if (t && t.length >= 5) return t.slice(0, 120);
  }
  // Strategia 2: TUTTE le occorrenze di "per X" — prendi quelle che NON
  // sono nomi di tecnici (è "per Victor" → assegnatario, non descrizione).
  const perGlobal = [...m.matchAll(/\bper\s+([a-zà-ÿ\s\d.,'\-]{4,80}?)(?:\s*(?:domani|oggi|alle|con\s|presso|in\b|al\b|alla\b|$|[,.!?]))/gi)];
  for (const match of perGlobal) {
    const cand = match[1].trim();
    const candLow = cand.toLowerCase();
    // Se è solo un nome di tecnico, scarta
    if (TECNICI_ACG.includes(candLow)) continue;
    if (candLow.split(/\s+/).every(w => TECNICI_ACG.includes(w))) continue;
    return cand;
  }
  return "";
}

const VERBO_CREA_RE = /\b(?:crea|crei|cre[oi]|metti|mettigli|mettilo|metterli|metterai|programma|programmagli|fissa|fissagli|segna|segnami|registra|prenota|schedul\w+|pianifica|organizza|aggiungi|inserisci|appunta|nota)\s+(?:un\s+|gli\s+|loro\s+|il\s+|l['’]\s*)?(?:intervento|appuntamento|lavoro|visita)/i;

// True se la frase è un comando di creazione intervento.
export function isCreaInterventoCommand(userMessage) {
  const m = String(userMessage || "");
  return VERBO_CREA_RE.test(m);
}

// Forza DRY_RUN per sessioni FORGE (evita scrittura accidentale durante test).
function _isForgeSession(sessionId) {
  return String(sessionId || "").startsWith("forge-test");
}

// Costruisce il riepilogo discorsivo del pending (riusato per preview e conferma).
function _riepilogoCrea(p) {
  const tecLabel = p.tecnici && p.tecnici.length
    ? (p.tecnici.length === 1 ? p.tecnici[0] : p.tecnici.slice(0, -1).join(", ") + " e " + p.tecnici[p.tecnici.length - 1])
    : "(nessun tecnico)";
  const dataLabel = p.due
    ? new Date(p.due).toLocaleDateString("it-IT", { timeZone: "Europe/Rome", weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })
        + " alle " + new Date(p.due).toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit", hour12: false })
    : "(data non specificata)";
  const luogoLabel = p.condominio || "(luogo non specificato)";
  const descLabel = p.descrizione || "manutenzione";
  return `${tecLabel}, ${dataLabel}, presso ${luogoLabel}: ${descLabel}`;
}

export async function handleAresCreaIntervento(parametri = {}, ctx = {}) {
  const userMessage = String(ctx.userMessage || "");
  const sessionId = ctx.sessionId || parametri.sessionId || null;

  const tecnici = _extractTecniciCrea(userMessage, parametri);
  const due = _parseDataOra(userMessage, parametri);
  const cond = await _extractCondominio(userMessage, parametri, sessionId);
  const descrizione = _extractDescrizione(userMessage, parametri);
  // Lookup canonico boardName: cerca nei board esistenti se Alberto ha
  // detto "Residenza Le Rose" usa la versione canonica "S029 - RESIDENZA
  // LE ROSE - VIA CALIPARI 5 - LUNGAVILLA (PV)" come boardName per la
  // nuova card.
  let condCanonical = cond.value || "";
  if (cond.value) {
    const can = await _lookupBoardCanonical(cond.value);
    if (can) condCanonical = can;
  }

  const pending = {
    kind: "ares_crea_intervento",
    tecnici,
    due: due ? due.toISOString() : null,
    condominio: condCanonical || "",
    condominioInput: cond.value || "",
    condominioSource: cond.source || null,
    descrizione,
    sessionId,
    createdAt: FieldValue.serverTimestamp(),
  };

  // Validazione minima: almeno tecnici + data + condominio
  const missing = [];
  if (!tecnici.length) missing.push("tecnico");
  if (!due) missing.push("data");
  if (!cond.value) missing.push("condominio o indirizzo");
  if (missing.length) {
    return {
      content: `Per aprire un intervento mi serve ancora: ${missing.join(", ")}. Esempio: "metti intervento a Federico domani mattina al condominio Kristal per controllo caldaia".`,
      data: { pending, missing },
    };
  }

  // Salva pending per conferma (anche su FORGE per test E2E)
  if (sessionId) {
    try {
      await db.collection("nexo_ares_pending").doc(sessionId).set(pending, { merge: true });
    } catch (e) {
      logger.warn("ares pending save failed", { error: String(e).slice(0, 120) });
    }
  }

  // Riepilogo + richiesta conferma. Niente "DRY_RUN" o "modalità test"
  // nel testo all'utente: solo la frase chiara "Confermi?".
  return {
    content: `Creo un intervento per ${_riepilogoCrea(pending)}. Confermi?`,
    data: {
      pendingApproval: { kind: "ares_crea_intervento", sessionId },
      pending,
    },
  };
}

// Intercept di conferma: cerca pending in nexo_ares_pending/{sessionId}.
// Se l'utente dice sì/conferma/ok/procedi/manda → scrive su bacheca_cards.
// Se dice annulla/no → cancella il pending.
// Altrimenti ritorna null (lascia passare al routing standard).
export async function tryInterceptAresConfermaIntervento({ userMessage, sessionId, userId }) {
  if (!sessionId) return null;
  const t = String(userMessage || "").trim();
  if (!t) return null;

  // Quick check: deve sembrare conferma o annullamento.
  // NOTA: \b non funziona dopo "ì" (non-ASCII), uso lookahead esplicito.
  if (!/^\s*(s[iì](?:\s|$|[,.!?])|ok|va\s+bene|conferm|procedi|manda|invia|fallo|crealo|fai\s|fai$|pubblica|annull|no(?:\s|$|[,.!?])|cancell|stop|basta)/i.test(t)) {
    return null;
  }

  let pendingDoc, pendingData;
  try {
    pendingDoc = await db.collection("nexo_ares_pending").doc(sessionId).get();
    if (!pendingDoc.exists) return null;
    pendingData = pendingDoc.data() || {};
    if (pendingData.kind !== "ares_crea_intervento") return null;
  } catch {
    return null;
  }

  // Annullamento
  if (/^\s*(annull|no\b|cancell|stop|basta)/i.test(t)) {
    try { await pendingDoc.ref.delete(); } catch {}
    return {
      content: "Annullato. Non scrivo nulla in bacheca.",
      data: { kind: "ares_annullato" },
      _aresConfermaHandled: true,
    };
  }

  // Conferma → scrittura reale su bacheca_cards COSMINA
  const dueIso = pendingData.due || null;
  const tecnici = Array.isArray(pendingData.tecnici) ? pendingData.tecnici : [];
  // Determina label fascia oraria dall'ora del due
  let fasciaLabel = null;
  if (dueIso) {
    try {
      const oreIta = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", hour12: false }).format(new Date(dueIso));
      const ore = Number(oreIta);
      if (ore < 12) fasciaLabel = { name: "MATTINO", color: "yellow" };
      else if (ore < 17) fasciaLabel = { name: "POMERIGGIO", color: "red" };
      else fasciaLabel = { name: "SERA", color: "red" };
    } catch {}
  }
  // Costruisce labels[]: tecnici (color sky) + fascia oraria
  const labels = [];
  for (const t of tecnici) labels.push({ name: String(t).toUpperCase(), color: "sky" });
  if (fasciaLabel) labels.push(fasciaLabel);

  const cardData = {
    name: (pendingData.descrizione || "intervento da NEXUS").slice(0, 120),
    boardName: pendingData.condominio || "",
    desc: pendingData.descrizione || "",
    workDescription: pendingData.descrizione || "",
    listName: "INTERVENTI DA ESEGUIRE",
    inBacheca: true,
    archiviato: false,
    stato: "aperto",
    labels,
    source: "nexus_ares",
    techName: tecnici[0] || null,
    techNames: tecnici.length ? tecnici : null,
    due: dueIso,
    createdBy: "NEXUS",
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  };

  // Sessione FORGE: non scrive su bacheca COSMINA (per evitare card spurie
  // dai test E2E). Rispondi con messaggio neutro senza menzionare DRY_RUN.
  if (_isForgeSession(sessionId)) {
    try { await pendingDoc.ref.delete(); } catch {}
    const cardId = aresIntId();
    return {
      content: `Test FORGE: scrittura su bacheca skipped per sicurezza. Riepilogo intervento: ${_riepilogoCrea(pendingData)}.`,
      data: { id: cardId, forgeTest: true, ...pendingData },
      _aresConfermaHandled: true,
    };
  }

  // Scrittura reale su bacheca COSMINA (anche se isAresDryRun() era true:
  // l'utente ha confermato esplicitamente). Il config dry_run resta come
  // kill-switch documentato ma non lo esponiamo all'utente nel testo.
  try {
    const cosm = getCosminaDb();
    const ref = cosm.collection("bacheca_cards").doc();
    await ref.set(cardData);
    try {
      await db.collection("ares_interventi").doc(ref.id).set({
        id: ref.id, cosmina_doc_id: ref.id, ...cardData,
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch {}
    try { await pendingDoc.ref.delete(); } catch {}
    return {
      content: `Fatto. Intervento creato su bacheca COSMINA: ${_riepilogoCrea(pendingData)}.`,
      data: { id: ref.id, forgeTest: false, ...pendingData },
      _aresConfermaHandled: true,
    };
  } catch (e) {
    const msg = String(e && e.message || e).slice(0, 200);
    return {
      content: `Non sono riuscito a scrivere in bacheca COSMINA: ${msg}.`,
      _aresConfermaHandled: true,
      _failed: true,
    };
  }
}
