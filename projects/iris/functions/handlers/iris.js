// handlers/iris.js — handler email (IRIS).
import {
  fetchIrisEmails, emailLine, isToday, fmtDataOra,
  CATEGORIE_URGENTI_SET,
} from "./shared.js";

export async function handleContaEmailUrgenti() {
  const emails = await fetchIrisEmails(500);
  const urgenti = emails.filter(e => CATEGORIE_URGENTI_SET.has(e.category));
  if (!urgenti.length) return { content: "Nessuna email urgente al momento. 👍" };
  const sample = urgenti.slice(0, 5).map(emailLine).join("\n");
  const more = urgenti.length > 5 ? `\n…e altre ${urgenti.length - 5}.` : "";
  return {
    content: `Hai **${urgenti.length} email urgenti** (GUASTO_URGENTE + PEC_UFFICIALE):\n\n${sample}${more}`,
    data: { count: urgenti.length },
  };
}

export async function handleEmailOggi() {
  const emails = await fetchIrisEmails(300);
  const oggi = emails.filter(e => isToday(e.received_time));
  if (!oggi.length) return { content: "Oggi non sono arrivate email indicizzate. 🙂" };
  const byCat = {};
  for (const e of oggi) byCat[e.category] = (byCat[e.category] || 0) + 1;
  const breakdown = Object.entries(byCat)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `  · ${k}: ${v}`).join("\n");
  const sample = oggi.slice(0, 5).map(emailLine).join("\n");
  return {
    content: `Oggi sono arrivate **${oggi.length} email**:\n\n${breakdown}\n\nUltime:\n${sample}`,
    data: { count: oggi.length, byCat },
  };
}

export async function handleEmailTotali() {
  const emails = await fetchIrisEmails(500);
  return {
    content: `In totale ho indicizzato **${emails.length} email** (ultime 500 mostrate). La più recente è di ${fmtDataOra(emails[0]?.received_time)}.`,
    data: { count: emails.length },
  };
}

export async function handleRicercaEmailMittente(parametri) {
  const query = String(
    parametri.mittente || parametri.sender || parametri.nome || parametri.from || "",
  ).trim().toLowerCase();
  if (!query) {
    return { content: "Mi manca il nome del mittente. Riprova specificando chi." };
  }
  const emails = await fetchIrisEmails(400);
  const match = emails.filter(e => {
    const bag = `${e.sender} ${e.senderName}`.toLowerCase();
    return bag.includes(query);
  });
  if (!match.length) {
    return { content: `Non trovo email da "${query}" nelle ultime 400.` };
  }
  const lines = match.slice(0, 8).map(emailLine).join("\n");
  const more = match.length > 8 ? `\n…e altre ${match.length - 8}.` : "";
  return {
    content: `Ho trovato **${match.length} email** da "${query}":\n\n${lines}${more}`,
    data: { count: match.length, query },
  };
}

export async function handleEmailSenzaRisposta() {
  const emails = await fetchIrisEmails(500);
  const att = emails.filter(e => e.followup && e.followup.needsAttention);
  if (!att.length) return { content: "Tutte le email sono state gestite (nessuna in attesa >48h)." };
  const lines = att.slice(0, 10).map((e, i) => {
    const days = e.followup.daysWithoutReply || 0;
    const who = e.senderName || e.sender;
    return `${i + 1}. ⏰ ${days}g — ${who}: ${e.subject}`;
  }).join("\n");
  const more = att.length > 10 ? `\n…e altre ${att.length - 10}.` : "";
  return {
    content: `Hai **${att.length} email senza risposta da più di 48h**:\n\n${lines}${more}`,
    data: { count: att.length },
  };
}

export async function handleEmailPerCategoria(parametri) {
  const wanted = String(parametri.categoria || "").toUpperCase().trim();
  const emails = await fetchIrisEmails(500);
  const groups = {};
  for (const e of emails) groups[e.category] = (groups[e.category] || 0) + 1;
  if (wanted && groups[wanted] !== undefined) {
    const match = emails.filter(e => e.category === wanted);
    const lines = match.slice(0, 8).map(emailLine).join("\n");
    return {
      content: `Categoria **${wanted}**: ${match.length} email.\n\n${lines}`,
      data: { count: match.length, categoria: wanted },
    };
  }
  const breakdown = Object.entries(groups)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `  · ${k}: ${v}`).join("\n");
  return {
    content: `Distribuzione email per categoria (ultime ${emails.length}):\n\n${breakdown}`,
    data: groups,
  };
}

// Stato Lavagna (domain "nexo" ma letto dall'IRIS dashboard)
import { db, logger } from "./shared.js";

export async function handleStatoLavagna() {
  const snap = await db.collection("nexo_lavagna")
    .orderBy("createdAt", "desc").limit(10).get();
  const rows = [];
  snap.forEach(d => {
    const v = d.data() || {};
    rows.push({
      from: v.from || "?",
      to: v.to || "?",
      type: v.type || "?",
      status: v.status || "?",
      priority: v.priority || "normal",
      createdAt: v.createdAt || null,
    });
  });
  if (!rows.length) return { content: "La Lavagna è vuota — nessun messaggio scambiato." };
  const lines = rows.map((r, i) =>
    `${i + 1}. ${r.from} → ${r.to} · ${r.type} [${r.status}]` +
    (r.priority !== "normal" ? ` prio:${r.priority}` : "")
  ).join("\n");
  return {
    content: `Ultimi **${rows.length} messaggi** sulla Lavagna:\n\n${lines}`,
    data: { count: rows.length },
  };
}
