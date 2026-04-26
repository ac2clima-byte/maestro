// handlers/ares.js — interventi (lettura + scrittura).
import { getCosminaDb, db, FieldValue, logger } from "./shared.js";

// ── Helpers parsing data ─────────────────────────────────────────
const GIORNI_SETTIMANA = {
  domenica: 0, lunedi: 1, "lunedì": 1, martedi: 2, "martedì": 2,
  mercoledi: 3, "mercoledì": 3, giovedi: 4, "giovedì": 4,
  venerdi: 5, "venerdì": 5, sabato: 6,
};

function _midnight(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function _addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function _formatDateIt(d) {
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
}

// Detection del tense: "aveva, ha avuto, è andato, scorso/a, ieri" → passato.
// "avrà, prossimo/a, domani" → futuro. "oggi" → presente.
function _tense(msg) {
  const m = String(msg || "").toLowerCase();
  if (/\b(?:aveva|ha\s+avuto|è\s+stato|era|ho\s+avuto|ieri|scors[oa])\b/.test(m)) return "past";
  if (/\b(?:avrà|avra|avremo|domani|prossim[oa])\b/.test(m)) return "future";
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

  // Settimane
  if (/\bquesta\s+settimana\b/.test(m)) {
    const dow = today.getDay(); const lun = _addDays(today, dow === 0 ? -6 : 1 - dow);
    return { from: lun, to: _addDays(lun, 7), label: "questa settimana" };
  }
  if (/\bsettimana\s+scors|\bscorsa\s+settimana\b/.test(m)) {
    const dow = today.getDay(); const lun = _addDays(today, dow === 0 ? -6 : 1 - dow);
    const lunS = _addDays(lun, -7);
    return { from: lunS, to: lun, label: "la settimana scorsa" };
  }
  if (/\bsettimana\s+prossim|\bprossima\s+settimana\b/.test(m)) {
    const dow = today.getDay(); const lun = _addDays(today, dow === 0 ? -6 : 1 - dow);
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
    const todayDow = today.getDay();
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
    let yy = ass[3] ? Number(ass[3]) : today.getFullYear();
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
    const yy = meseAbs[3] ? Number(meseAbs[3]) : today.getFullYear();
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

// Estrae tutti i nomi tecnici da una card (techName + techNames[]).
// Dedup case-insensitive (techName spesso duplicato in techNames[]).
function _allTechs(data) {
  const seen = new Set();
  const out = [];
  const add = (t) => {
    const s = String(t || "").trim();
    if (!s) return;
    const k = s.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(s);
  };
  add(data.techName);
  if (Array.isArray(data.techNames)) for (const t of data.techNames) add(t);
  return out;
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
    });
  }

  // Logging diagnostico (visibile in Cloud Functions logs)
  logger.info("[ARES] handleAresInterventiAperti", {
    tecnicoFilter, range: range ? range.label : null, citta,
    tense, includeTerminali,
    stats, items: items.length,
    filteredByList, filteredByStato, scannedTecnico,
    filteredByDate, filteredByCitta,
  });

  items.sort((a, b) => {
    if (!a.due) return 1;
    if (!b.due) return -1;
    return a.due.getTime() - b.due.getTime();
  });
  const top = items.slice(0, limit);

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

  // Render righe in prosa. Se boardName è generico (ZZ000 / CLIENTI PRIVATI)
  // o vuoto/"?", usa il `name` o `workDescription` come fallback.
  const renderLine = (i) => {
    const data = i.due ? i.due.toLocaleDateString("it-IT") : "n.d.";
    const board = String(i.condominio || "").trim();
    let cond;
    if (!board || board === "?" || /^ZZ\d+/i.test(board) || /CLIENTI\s+PRIVATI/i.test(board)) {
      const fb = String(i.name || i.workDescription || "")
        .replace(/\s*-?\s*Intervento\s+concluso\s+DA\s+.+$/i, "")
        .replace(/\s*-?\s*Intervento\s+concluso\s*$/i, "")
        .trim();
      cond = fb ? fb.slice(0, 80) : "intervento privato";
    } else {
      cond = board.replace(/^[A-Z0-9]+\s*-\s*/, "").slice(0, 70);
    }
    const stato = i.stato || "aperto";
    // techs: dedup case-insensitive (i.tecnico è già "A + B + C" ma può
    // contenere duplicati derivati dal merge tra techName e techNames[])
    const techsArr = String(i.tecnico || "").split(" + ").map(t => t.trim()).filter(Boolean);
    const techsDedup = [...new Map(techsArr.map(t => [t.toLowerCase(), t])).values()];
    let tag;
    if (techsDedup.length > 1) tag = `tecnici ${techsDedup.join(" + ")}`;
    else if (techsDedup.length === 1 && techsDedup[0] !== "-") tag = `tecnico ${techsDedup[0]}`;
    else tag = "non assegnato";
    return `${data}, ${cond}, stato ${stato}, ${tag}`;
  };

  // 1 risultato → frase singola
  if (top.length === 1) {
    const i = top[0];
    const tecnicoTag = tecnicoCap ? `${tecnicoCap}` : "";
    const dataTag = rangeLabel ? rangeLabel : "";
    const cittaTag = cittaCap ? `a ${cittaCap}` : "";
    const board = String(i.condominio || "");
    let cond;
    if (!board || /^ZZ\d+/i.test(board) || /CLIENTI\s+PRIVATI/i.test(board)) {
      const fb = String(i.name || i.workDescription || "")
        .replace(/\s*-?\s*Intervento\s+concluso\s+DA\s+.+$/i, "")
        .trim();
      cond = fb || "intervento privato";
    } else {
      cond = board.replace(/^[A-Z0-9]+\s*-\s*/, "").trim();
    }
    const head = `${tecnicoTag} ${dataTag} ${cittaTag}`.replace(/\s+/g, " ").trim();
    // Co-assegnato: dedup, case-insensitive, esclude il tecnico richiesto
    let coAss = "";
    if (i.techCount > 1 && tecnicoFilter) {
      const others = String(i.tecnico).split(" + ")
        .filter(t => !t.toLowerCase().includes(tecnicoFilter));
      const dedup = [...new Set(others.map(t => t.trim()))].filter(Boolean);
      if (dedup.length) coAss = ` (co-assegnato a ${dedup.join(", ")})`;
    }
    // Se c'è già il giorno nel range label ("giovedì 23/04/2026") evita "il 23/04/2026"
    const includeDateSuffix = !dataTag || !i.due || !dataTag.includes(i.due.toLocaleDateString("it-IT"));
    const dueIt = (i.due && includeDateSuffix) ? ` il ${i.due.toLocaleDateString("it-IT")}` : "";
    return {
      content: `${head ? head + " " : ""}${verb} un intervento${dueIt}: ${cond}, stato ${i.stato}${coAss}.`.trim(),
      data: { count: 1, tecnico: tecnicoFilter, range: rangeLabel, citta, items: top, stats },
    };
  }

  // Più risultati → introduzione discorsiva + righe (newline-separated, no enumerazione)
  const intro = [
    tecnicoCap ? `${tecnicoCap}` : "Trovo",
    rangeLabel || "",
    cittaCap ? `a ${cittaCap}` : "",
    `${verb} ${top.length} interventi.`,
  ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  const righe = top.map(renderLine).join("\n");
  const more = items.length > top.length ? `\n\nAltri ${items.length - top.length} non mostrati.` : "";
  return {
    content: `${intro}\n\n${righe}${more}`,
    data: { count: top.length, totalMatched: items.length, tecnico: tecnicoFilter, range: rangeLabel, citta, items: top, stats },
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
