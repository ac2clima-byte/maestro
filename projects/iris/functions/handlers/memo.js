// handlers/memo.js — dossier cliente (MEMO).
import { getCosminaDb, getGuazzottiDb, fetchIrisEmails, emailLine, db, FieldValue, logger } from "./shared.js";

// TTL cache clienti (24h)
const MEMO_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// ─── Cache memo_clienti_cache (nexo-hub-15f2d) ─────────────────
// Popolata da scripts/memo_carica_clienti.py (manuale) o Cloud Function
// memoCacheRefresh (schedulata).
async function memoCacheGetStats() {
  try {
    const snap = await db.collection("memo_clienti_cache").doc("_stats").get();
    return snap.exists ? (snap.data() || {}) : null;
  } catch (e) { return null; }
}

function memoCacheAgeMs(stats) {
  if (!stats) return Infinity;
  const ts = stats.ultima_scansione?.toMillis?.() || 0;
  return ts ? Date.now() - ts : Infinity;
}

async function memoCacheSearch(query) {
  // Scansiona fino a 800 doc (cap crm_clienti è 647) e filtra in memoria
  const snap = await db.collection("memo_clienti_cache").limit(800).get();
  const q = String(query).toLowerCase().trim();
  const matches = [];
  snap.forEach(d => {
    if (d.id === "_stats") return;
    const v = d.data() || {};
    const bag = `${v.codice || ""} ${v.nome || ""} ${v.indirizzo || ""} ${v.citta || ""} ${v.amministratore || ""} ${v.referente || ""}`.toLowerCase();
    if (bag.includes(q)) matches.push(v);
  });
  return matches;
}

async function memoCacheAllClients(max = 700) {
  const snap = await db.collection("memo_clienti_cache").limit(max).get();
  const out = [];
  snap.forEach(d => {
    if (d.id === "_stats") return;
    out.push(d.data() || {});
  });
  return out;
}

function memoBag(data) {
  const parts = [];
  for (const v of Object.values(data || {})) {
    if (typeof v === "string") parts.push(v.toLowerCase());
    else if (typeof v === "number" || typeof v === "boolean") parts.push(String(v).toLowerCase());
  }
  return parts.join(" ");
}

function memoFormatDate(v) {
  if (!v) return "";
  try {
    const d = v.toDate ? v.toDate() : new Date(v);
    if (Number.isNaN(d.getTime())) return String(v).slice(0, 10);
    return d.toISOString().slice(0, 10);
  } catch {
    return String(v).slice(0, 10);
  }
}

export async function handleMemoDossier(parametri, ctx) {
  const candidate =
    parametri.cliente || parametri.condominio || parametri.nome ||
    parametri.query || parametri.soggetto || parametri.target ||
    parametri.entita || parametri.entityName || parametri.name ||
    Object.values(parametri || {}).find(v => typeof v === "string" && v.trim().length > 0) ||
    "";
  let q = String(candidate).trim().toLowerCase();
  q = q.replace(/^(il|la|lo|gli|le|i|condominio)\s+/, "").trim();
  if (!q) return { content: "Su quale cliente cerco? Dammi un nome." };

  // ── Cache-first: prova prima memo_clienti_cache (nexo-hub) ──
  try {
    const stats = await memoCacheGetStats();
    const fresh = stats && memoCacheAgeMs(stats) < MEMO_CACHE_TTL_MS;
    if (fresh) {
      const matches = await memoCacheSearch(q);
      if (matches.length) {
        const top = matches.slice(0, 3);
        const parts = [];
        if (matches.length === 1) {
          const c = top[0];
          const bits = [];
          if (c.indirizzo || c.citta) bits.push(`${[c.indirizzo, c.citta].filter(Boolean).join(", ")}`);
          if (c.telefono) bits.push(`tel ${c.telefono}`);
          if (c.email) bits.push(c.email);
          if (c.amministratore) bits.push(`amministratore: ${c.amministratore}`);
          parts.push(`Ho trovato ${c.nome} (codice ${c.codice}).`);
          if (bits.length) parts.push(bits.join(". ") + ".");
          if (c.num_impianti > 0) parts.push(`Ha ${c.num_impianti} impianti registrati.`);
          return {
            content: parts.join(" "),
            data: { source: "cache", cliente: c, totalMatches: 1, clienti: [c.nome] },
          };
        }
        parts.push(`Ho ${matches.length} risultati per "${q}".`);
        const elenco = top.map((c, i) => `${i + 1}. ${c.nome} (${c.codice}, ${c.citta || "?"})`).join("\n");
        parts.push(elenco);
        if (matches.length > 3) parts.push(`E altri ${matches.length - 3}.`);
        parts.push(`Dimmi quale vuoi vedere.`);
        return {
          content: parts.join("\n\n"),
          data: { source: "cache", totalMatches: matches.length, clienti: top.map(c => c.nome) },
        };
      }
      // Cache fresca ma nessun match → ritorna subito
      return {
        content: `Non trovo nulla su ${q} nel CRM.`,
        data: { source: "cache", totalMatches: 0 },
      };
    }
  } catch (e) {
    logger.warn("memo cache lookup failed, fallback live", { error: String(e).slice(0, 150) });
  }

  // ── Fallback live su COSMINA (cache miss o stale) ──
  const cosm = getCosminaDb();
  const gua = getGuazzottiDb();

  const [clientiSnap, impiantiSnap, cardsSnap, rtiSnap, irisEmails] = await Promise.all([
    cosm.collection("crm_clienti").limit(700).get().catch(e => ({ _err: String(e) })),
    cosm.collection("cosmina_impianti").limit(500).get().catch(e => ({ _err: String(e) })),
    cosm.collection("bacheca_cards").where("listName", "==", "INTERVENTI").limit(400).get().catch(e => ({ _err: String(e) })),
    gua.collection("rti").limit(700).get().catch(e => ({ _err: String(e) })),
    fetchIrisEmails(500).catch(e => []),
  ]);

  const errors = [];
  if (clientiSnap._err) errors.push({ source: "crm_clienti", error: clientiSnap._err.slice(0, 120) });
  if (impiantiSnap._err) errors.push({ source: "cosmina_impianti", error: impiantiSnap._err.slice(0, 120) });
  if (cardsSnap._err) errors.push({ source: "bacheca_cards", error: cardsSnap._err.slice(0, 120) });
  if (rtiSnap._err) errors.push({ source: "guazzotti_rti", error: rtiSnap._err.slice(0, 120) });

  const clienti = [];
  if (clientiSnap.forEach) {
    clientiSnap.forEach(d => {
      const v = d.data() || {};
      if (memoBag(v).includes(q)) {
        clienti.push({
          id: d.id,
          nome: v.nome || v.ragione_sociale || v.denominazione || d.id,
          indirizzo: v.indirizzo || v.via || "",
          comune: v.comune || "",
          amministratore: v.amministratore || "",
          codice: v.codice || "",
          telefono: v.telefono || "",
          email: v.email || "",
        });
      }
    });
  }

  const impianti = [];
  if (impiantiSnap.forEach) {
    impiantiSnap.forEach(d => {
      const v = d.data() || {};
      if (memoBag(v).includes(q)) {
        impianti.push({
          id: d.id,
          codice: v.codice || "",
          targa: v.targa || "",
          indirizzo: v.indirizzo || "",
          occupante: v.occupante_cognome || "",
          combustibile: v.combustibile || "",
          scadenza: v.data_scadenza_dichiarazione || "",
          ritardo_manut: v.giorni_ritardo_manutenzione || 0,
          ditta: v.ditta_responsabile_cognome || "",
        });
      }
    });
  }

  const interventi = [];
  if (cardsSnap.forEach) {
    cardsSnap.forEach(d => {
      const v = d.data() || {};
      if (memoBag(v).includes(q)) {
        let due;
        try { due = v.due ? (v.due.toDate ? v.due.toDate() : new Date(v.due)) : null; } catch {}
        interventi.push({
          id: d.id,
          name: v.name || "",
          stato: v.stato || "?",
          tecnico: v.techName || (Array.isArray(v.techNames) && v.techNames[0]) || "",
          boardName: v.boardName || "",
          due: due ? due.toISOString().slice(0, 10) : "",
          updated: memoFormatDate(v.updated_at),
          workDescription: (v.workDescription || v.desc || "").slice(0, 200),
        });
      }
    });
    interventi.sort((a, b) => (b.updated || "").localeCompare(a.updated || ""));
  }

  const rti = [];
  if (rtiSnap.forEach) {
    rtiSnap.forEach(d => {
      const v = d.data() || {};
      if (memoBag(v).includes(q)) {
        rti.push({
          numero_rti: v.numero_rti || d.id,
          data: memoFormatDate(v.data_intervento),
          stato: v.stato || "?",
          tipo: v.tipo || "?",
          tecnico: v.tecnico_intervento || v.tecnico || "",
          condominio: v.condominio || "",
          cliente: v.cliente || "",
          intervento: (v.intervento_effettuato || "").slice(0, 150),
          fatturabile: v.fatturabile,
        });
      }
    });
    rti.sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  }

  const emails = (irisEmails || []).filter(e => {
    const bag = [
      e.sender, e.senderName, e.subject, e.summary,
      e.entities && e.entities.cliente, e.entities && e.entities.condominio, e.entities && e.entities.indirizzo,
    ].filter(Boolean).join(" ").toLowerCase();
    return bag.includes(q);
  });

  const sections = [];
  sections.push(`📇 **Dossier per "${q}"** (MEMO v0.2 — COSMINA + Guazzotti + email)`);
  sections.push("");

  if (clienti.length) {
    sections.push(`**🏢 Anagrafica CRM** (${clienti.length} match):`);
    clienti.slice(0, 5).forEach(c => {
      sections.push(`  · **${c.nome}** [${c.codice || c.id}] — ${c.indirizzo}${c.comune ? ", " + c.comune : ""}`);
      if (c.amministratore) sections.push(`    Amministratore: ${c.amministratore}`);
      if (c.telefono) sections.push(`    Tel: ${c.telefono}`);
    });
    if (clienti.length > 5) sections.push(`  …e altri ${clienti.length - 5}.`);
  } else {
    sections.push(`**🏢 Anagrafica CRM**: nessun cliente diretto trovato.`);
  }
  sections.push("");

  if (impianti.length) {
    sections.push(`**⚙️ Impianti CURIT** (${impianti.length}):`);
    impianti.slice(0, 5).forEach(i => {
      sections.push(`  · Targa ${i.targa} — ${i.indirizzo} — ${i.combustibile}`);
      if (i.occupante) sections.push(`    Occupante: ${i.occupante}`);
      if (i.ritardo_manut > 0) sections.push(`    ⚠️ ${i.ritardo_manut}g di ritardo manutenzione`);
      if (i.scadenza) sections.push(`    Scadenza dichiarazione: ${i.scadenza}`);
    });
    if (impianti.length > 5) sections.push(`  …e altri ${impianti.length - 5}.`);
  } else {
    sections.push(`**⚙️ Impianti**: nessuno trovato.`);
  }
  sections.push("");

  if (interventi.length) {
    sections.push(`**🔧 Interventi (bacheca COSMINA)** — ultimi ${Math.min(interventi.length, 10)} di ${interventi.length}:`);
    interventi.slice(0, 10).forEach(it => {
      const t = it.tecnico ? ` · ${it.tecnico}` : "";
      const s = it.stato ? ` [${it.stato}]` : "";
      sections.push(`  · ${it.updated || it.due || "?"}${t}${s} — ${(it.name || "").slice(0, 80)}`);
      if (it.workDescription) sections.push(`    → ${it.workDescription.slice(0, 100)}`);
    });
  } else {
    sections.push(`**🔧 Interventi**: nessuno trovato sulla bacheca.`);
  }
  sections.push("");

  if (rti.length) {
    sections.push(`**📋 RTI/RTIDF Guazzotti TEC** (${rti.length}):`);
    rti.slice(0, 8).forEach(r => {
      const fat = r.fatturabile === false ? " [non fatturabile]" : "";
      sections.push(`  · ${r.numero_rti} (${r.tipo}) — ${r.data} — ${r.stato}${fat} · ${r.tecnico}`);
      if (r.intervento) sections.push(`    → ${r.intervento}`);
    });
    if (rti.length > 8) sections.push(`  …e altri ${rti.length - 8}.`);
  } else {
    sections.push(`**📋 RTI Guazzotti**: nessuno trovato.`);
  }
  sections.push("");

  if (emails.length) {
    sections.push(`**📧 Email correlate** (${emails.length}):`);
    emails.slice(0, 5).forEach(e => sections.push(`  · ${emailLine(e)}`));
    if (emails.length > 5) sections.push(`  …e altre ${emails.length - 5}.`);
  } else {
    sections.push(`**📧 Email**: nessuna email correlata nelle ultime 500 indicizzate.`);
  }

  const totalMatches = clienti.length + impianti.length + interventi.length + rti.length + emails.length;
  if (totalMatches === 0) {
    return {
      content:
        `📇 **Dossier per "${q}"** (MEMO v0.2)\n\n` +
        `Non ho trovato nulla su "${q}" nelle fonti disponibili:\n` +
        `  · crm_clienti (${clientiSnap.size || 0} docs)\n` +
        `  · cosmina_impianti (${impiantiSnap.size || 0} docs)\n` +
        `  · bacheca_cards interventi (${cardsSnap.size || 0} docs)\n` +
        `  · rti guazzotti (${rtiSnap.size || 0} docs)\n` +
        `  · iris_emails (${(irisEmails || []).length} docs)\n\n` +
        `Possibili cause:\n` +
        `  · Nome scritto diversamente (prova varianti)\n` +
        `  · È una persona e non un condominio/cliente\n` +
        `  · Cliente dismesso o non ancora caricato\n` +
        (errors.length ? `\n❌ Errori lettura: ${errors.map(e => e.source).join(", ")}` : ""),
      data: { query: q, totalMatches: 0, errors },
    };
  }

  if (errors.length) {
    sections.push("");
    sections.push(`❌ Errori lettura parziali: ${errors.map(e => e.source).join(", ")}`);
  }

  return {
    content: sections.join("\n"),
    data: {
      query: q,
      clienti: clienti.length, impianti: impianti.length,
      interventi: interventi.length, rti: rti.length, emails: emails.length,
      errors,
    },
  };
}

// ─── Nuovi handler basati su cache ─────────────────────────────
//
// "quanti clienti abbiamo?" → handleMemoTotaliClienti
// "top clienti" / "clienti con più impianti" → handleMemoTopClienti
// "cerca cliente in via Roma 12" → handleMemoRicercaIndirizzo

export async function handleMemoTotaliClienti() {
  const stats = await memoCacheGetStats();
  if (!stats) {
    return { content: "La cache clienti non è ancora popolata. Esegui scripts/memo_carica_clienti.py per caricarla." };
  }
  const parts = [];
  parts.push(`Abbiamo ${stats.totale_clienti} clienti nel CRM, ${stats.clienti_con_impianti} hanno almeno un impianto, per un totale di ${stats.totale_impianti} impianti.`);
  const byType = stats.per_tipo || {};
  if (byType.condominio || byType.privato || byType.azienda) {
    const segn = [];
    if (byType.condominio) segn.push(`${byType.condominio} condomini`);
    if (byType.privato) segn.push(`${byType.privato} privati`);
    if (byType.azienda) segn.push(`${byType.azienda} aziende`);
    if (segn.length) parts.push(`Tra questi ci sono ${segn.join(", ")}.`);
  }
  return { content: parts.join(" "), data: stats };
}

export async function handleMemoTopClienti(parametri) {
  const n = Math.min(Math.max(Number(parametri?.limit || 10), 3), 30);
  const all = await memoCacheAllClients();
  if (!all.length) {
    return { content: "Non ho la cache clienti. Esegui memo_carica_clienti.py per popolarla." };
  }
  const top = all
    .filter(c => (c.num_impianti || 0) > 0)
    .sort((a, b) => (b.num_impianti || 0) - (a.num_impianti || 0))
    .slice(0, n);
  if (!top.length) return { content: "Nessun cliente ha impianti registrati. Strano, controlla i dati." };

  const parts = [];
  parts.push(`I ${top.length} clienti con più impianti:`);
  const elenco = top.map((c, i) => `${i + 1}. ${c.nome} — ${c.num_impianti} impianti${c.citta ? ` (${c.citta})` : ""}`).join("\n");
  parts.push(elenco);
  return {
    content: parts.join("\n\n"),
    data: { top: top.map(c => ({ codice: c.codice, nome: c.nome, num_impianti: c.num_impianti })) },
  };
}

export async function handleMemoRicercaIndirizzo(parametri, ctx) {
  let q = String(parametri?.indirizzo || parametri?.query || "").trim().toLowerCase();
  // Se vuoto, estrai dal messaggio utente "cerca cliente via Roma 12"
  if (!q && ctx?.userMessage) {
    const m = /(?:in\s+)?(?:via|viale|corso|piazza|p\.zza|vicolo|strada)\s+([a-zà-ÿ][\wà-ÿ\s]{2,60})/i.exec(ctx.userMessage);
    if (m) q = `via ${m[1].trim()}`.toLowerCase();
  }
  if (!q) return { content: "Dammi un indirizzo da cercare. Esempio: cerca cliente in via Roma 12." };

  const all = await memoCacheAllClients();
  const matches = all.filter(c => {
    const bag = `${c.indirizzo || ""} ${c.citta || ""}`.toLowerCase();
    return bag.includes(q);
  });
  if (!matches.length) return { content: `Nessun cliente corrisponde a "${q}" nel CRM.` };

  if (matches.length === 1) {
    const c = matches[0];
    const bits = [c.nome, `codice ${c.codice}`];
    if (c.telefono) bits.push(`tel ${c.telefono}`);
    return {
      content: `Ho trovato ${bits.join(", ")}. Vuoi i dettagli completi?`,
      data: { cliente: c },
    };
  }
  const top = matches.slice(0, 5);
  const parts = [`Ho ${matches.length} clienti con quell'indirizzo:`];
  parts.push(top.map((c, i) => `${i + 1}. ${c.nome} (${c.codice}) — ${c.indirizzo || ""}, ${c.citta || ""}`).join("\n"));
  if (matches.length > 5) parts.push(`E altri ${matches.length - 5}.`);
  return { content: parts.join("\n\n"), data: { matches: matches.length } };
}

// ─── Rubrica tecnici (cosmina_contatti_interni su garbymobile-f89ac) ─
//
// "tecnici", "lista tecnici", "chi sono i tecnici", "tecnici ACG", "tecnici Guazzotti"
// Filtra categoria === "tecnico" e separa per azienda.
function joinNatural(items) {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} e ${items[1]}`;
  return items.slice(0, -1).join(", ") + " e " + items[items.length - 1];
}

function fullName(v) {
  const nome = String(v.nome || "").trim();
  const cognome = String(v.cognome || "").trim();
  return [nome, cognome].filter(Boolean).join(" ").trim();
}

function aziendaSlug(azienda) {
  const a = String(azienda || "").toLowerCase();
  if (a.includes("acg")) return "acg";
  if (a.includes("guazzotti")) return "guazzotti";
  return "altri";
}

export async function handleListaTecnici(parametri, ctx) {
  const cosm = getCosminaDb();
  const msg = String(ctx?.userMessage || "").toLowerCase();
  const wantsAcg = /\bacg\b|acg\s*clima|clima\s*service/.test(msg);
  const wantsGuaz = /guazzotti/.test(msg);
  const explicitFilter = wantsAcg || wantsGuaz;

  let snap;
  try {
    snap = await cosm.collection("cosmina_contatti_interni").limit(500).get();
  } catch (e) {
    logger.warn("handleListaTecnici: read failed", { error: String(e) });
    return { content: "Non sono riuscito a leggere la rubrica COSMINA. Riprova tra un attimo." };
  }

  const groups = { acg: [], guazzotti: [], altri: [] };
  snap.forEach(d => {
    const v = d.data() || {};
    const cat = String(v.categoria || "").toLowerCase().trim();
    if (cat !== "tecnico") return;
    const name = fullName(v);
    if (!name) return;
    const slug = aziendaSlug(v.azienda);
    groups[slug].push(name);
  });

  // Ordina alfabeticamente per cognome
  for (const k of Object.keys(groups)) {
    groups[k].sort((a, b) => {
      const ac = a.split(" ").slice(-1)[0] || a;
      const bc = b.split(" ").slice(-1)[0] || b;
      return ac.localeCompare(bc, "it");
    });
  }

  const total = groups.acg.length + groups.guazzotti.length + groups.altri.length;
  if (total === 0) {
    return { content: "Nella rubrica COSMINA non ho trovato contatti con categoria 'tecnico'. Forse la rubrica non è popolata o usa un'altra etichetta." };
  }

  // Modalità filtro esplicito
  if (wantsAcg && !wantsGuaz) {
    if (groups.acg.length === 0) return { content: "Non ho tecnici ACG in rubrica al momento." };
    return {
      content: `I tecnici ACG sono: ${joinNatural(groups.acg)}.`,
      data: { acg: groups.acg, count: groups.acg.length },
    };
  }
  if (wantsGuaz && !wantsAcg) {
    if (groups.guazzotti.length === 0) return { content: "Non ho tecnici Guazzotti in rubrica al momento." };
    return {
      content: `I tecnici di Guazzotti sono: ${joinNatural(groups.guazzotti)}.`,
      data: { guazzotti: groups.guazzotti, count: groups.guazzotti.length },
    };
  }

  // Default: tutti, separati per azienda
  const parts = [];
  if (groups.acg.length) parts.push(`I tecnici ACG sono: ${joinNatural(groups.acg)}.`);
  if (groups.guazzotti.length) parts.push(`Quelli di Guazzotti sono: ${joinNatural(groups.guazzotti)}.`);
  if (groups.altri.length) parts.push(`Altri: ${joinNatural(groups.altri)}.`);
  return {
    content: parts.join(" "),
    data: { acg: groups.acg, guazzotti: groups.guazzotti, altri: groups.altri, total },
  };
}

