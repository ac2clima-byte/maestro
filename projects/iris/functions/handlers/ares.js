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
  baseDate.setHours(h, mi, 0, 0);
  return baseDate;
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

// Estrae descrizione dal messaggio (dopo "per" o intera frase pulita).
function _extractDescrizione(userMessage, parametri) {
  const fromParam = String(parametri.descrizione || parametri.note || parametri.problema || parametri.testo || parametri.lavoro || "").trim();
  if (fromParam) return fromParam.slice(0, 120);
  const m = String(userMessage || "");
  // "per [descrizione]"
  const perM = m.match(/\bper\s+([a-zà-ÿ\s\d.,'\-]{4,80}?)(?:\s*(?:domani|oggi|alle|con\s|presso|in\b|al\b|alla\b|$|[,.!?]))/i);
  if (perM) return perM[1].trim();
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
    ? new Date(p.due).toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })
        + " alle " + new Date(p.due).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })
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

  const pending = {
    kind: "ares_crea_intervento",
    tecnici,
    due: due ? due.toISOString() : null,
    condominio: cond.value || "",
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

  // Riepilogo + richiesta conferma
  const dryNote = (await isAresDryRun() || _isForgeSession(sessionId))
    ? "\n\n(Modalità test: scrivo solo dopo la tua conferma e in modalità DRY_RUN.)"
    : "\n\nConfermi? Scrivi sì per pubblicare in bacheca COSMINA, oppure cambia/annulla.";
  return {
    content: `Creo un intervento per ${_riepilogoCrea(pending)}.${dryNote}`,
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

  // Conferma → scrittura
  const dryRun = (await isAresDryRun()) || _isForgeSession(sessionId);
  const cardId = aresIntId();
  const dueIso = pendingData.due || null;
  const tecnici = Array.isArray(pendingData.tecnici) ? pendingData.tecnici : [];
  const cardData = {
    name: (pendingData.descrizione || "intervento da NEXUS").slice(0, 120),
    boardName: pendingData.condominio || "",
    desc: pendingData.descrizione || "",
    workDescription: pendingData.descrizione || "",
    listName: "INTERVENTI DA ESEGUIRE",
    inBacheca: true,
    archiviato: false,
    stato: "aperto",
    labels: ["source:nexus", "tipo:manutenzione"],
    source: "nexus_ares",
    techName: tecnici[0] || null,
    techNames: tecnici.length ? tecnici : null,
    due: dueIso,
    createdBy: "NEXUS",
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  };

  if (dryRun) {
    // DRY_RUN: scrive specchio su nexo collection, non tocca bacheca COSMINA
    try {
      await db.collection("ares_interventi").doc(cardId).set({
        id: cardId, ...cardData,
        _dryRun: true,
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (e) {
      logger.warn("ares dry mirror failed", { error: String(e).slice(0, 120) });
    }
    try { await pendingDoc.ref.delete(); } catch {}
    return {
      content: `Simulato (DRY_RUN): ${_riepilogoCrea(pendingData)}. ID locale ${cardId}. Per scrivere davvero su COSMINA imposta cosmina_config/ares_config.dry_run=false.`,
      data: { id: cardId, dryRun: true, ...pendingData },
      _aresConfermaHandled: true,
    };
  }

  // Scrittura reale su bacheca COSMINA
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
      content: `Fatto. Ho scritto in bacheca COSMINA: ${_riepilogoCrea(pendingData)}. ID ${ref.id}.`,
      data: { id: ref.id, dryRun: false, ...pendingData },
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
