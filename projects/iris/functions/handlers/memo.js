// handlers/memo.js — dossier cliente (MEMO).
import { getCosminaDb, getGuazzottiDb, fetchIrisEmails, emailLine } from "./shared.js";

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
  if (!q) return { content: "Su quale cliente o condominio cerco? Dammi un nome." };

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
