// handlers/emporion.js — magazzino (lettura COSMINA).
import { getCosminaDb } from "./shared.js";

export async function handleEmporionSottoScorta() {
  const db = getCosminaDb();
  let snap;
  try {
    snap = await db.collection("magazzino").limit(500).get();
  } catch (e) {
    const m = String(e?.message || e);
    if (/permission|denied|403|NOT_FOUND/i.test(m)) {
      return { content: "EMPORION non può leggere `magazzino`." };
    }
    throw e;
  }

  const out = [];
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const min = typeof data.scorta_minima === "number" ? data.scorta_minima : 0;
    if (min <= 0) continue;

    let totale = 0;
    try {
      const gSnap = await db.collection("magazzino_giacenze")
        .where("articolo_id", "==", doc.id).limit(20).get();
      gSnap.forEach(g => { totale += Number((g.data() || {}).quantita || 0); });
    } catch {}

    if (totale < min) {
      out.push({
        codice: data.codice || doc.id,
        descrizione: String(data.descrizione || "").slice(0, 60),
        totale, min,
        mancante: min - totale,
      });
    }
    if (out.length >= 30) break;
  }

  if (!out.length) return { content: "✅ Nessun articolo sotto scorta al momento." };

  out.sort((a, b) => b.mancante - a.mancante);
  const top = out.slice(0, 15);
  const lines = top.map((r, i) =>
    `${i + 1}. **${r.codice}** — ${r.descrizione}\n     giacenza: ${r.totale}/${r.min} (manca: ${r.mancante})`,
  ).join("\n");
  const more = out.length > top.length ? `\n\n…e altri ${out.length - top.length}.` : "";
  return {
    content: `⚠️ **${out.length} articoli sotto scorta**:\n\n${lines}${more}`,
    data: { count: out.length },
  };
}

export async function handleEmporionDisponibilita(parametri) {
  const codice = String(parametri.codice || parametri.code || "").trim();
  const descrizione = String(parametri.descrizione || parametri.nome || parametri.articolo || "").trim();

  if (!codice && !descrizione) {
    return { content: "Mi serve un codice articolo o una descrizione (es. 'valvola 3/4', 'termocoppia')." };
  }

  const db = getCosminaDb();
  const articoli = [];

  try {
    if (codice) {
      const fields = ["codice", "codice_costruttore", "codice_fornitore"];
      for (const f of fields) {
        const snap = await db.collection("magazzino").where(f, "==", codice).limit(10).get();
        snap.forEach(d => {
          const data = d.data() || {};
          articoli.push({
            id: d.id,
            codice: data.codice || "",
            descrizione: data.descrizione || "",
            scorta_minima: data.scorta_minima,
            fornitore: data.fornitore,
            prezzo: data.prezzo,
          });
        });
        if (articoli.length) break;
      }
    }
    if (!articoli.length && descrizione) {
      const q = descrizione.toLowerCase();
      const snap = await db.collection("magazzino").limit(300).get();
      snap.forEach(d => {
        const data = d.data() || {};
        const desc = String(data.descrizione || "").toLowerCase();
        const cod = String(data.codice || "").toLowerCase();
        if (desc.includes(q) || cod.includes(q)) {
          articoli.push({
            id: d.id,
            codice: data.codice || "",
            descrizione: data.descrizione || "",
            scorta_minima: data.scorta_minima,
            fornitore: data.fornitore,
            prezzo: data.prezzo,
          });
        }
      });
    }
  } catch (e) {
    const msg = String(e?.message || e);
    if (/permission|denied|UNAUTHENTICATED|403/i.test(msg)) {
      return { content: "EMPORION non ha i permessi per leggere COSMINA `magazzino`." };
    }
    throw e;
  }

  if (!articoli.length) {
    const chi = codice || descrizione;
    return { content: `📦 Nessun articolo trovato per "${chi}" nel magazzino.` };
  }

  const top = articoli.slice(0, 5);
  const blocchi = [];
  for (const a of top) {
    let totale = 0;
    const perMag = [];
    try {
      const gSnap = await db.collection("magazzino_giacenze")
        .where("articolo_id", "==", a.id).limit(20).get();
      gSnap.forEach(g => {
        const gd = g.data() || {};
        const qta = Number(gd.quantita || 0);
        totale += qta;
        if (qta > 0) perMag.push(`${gd.magazzino_id}=${qta}`);
      });
    } catch {}
    const sotto = typeof a.scorta_minima === "number" && totale < a.scorta_minima ? " ⚠️ sotto scorta" : "";
    const det = perMag.length ? ` (${perMag.slice(0, 4).join(", ")})` : "";
    blocchi.push(
      `**${a.codice || a.id}** — ${a.descrizione.slice(0, 50)}\n  giacenza: **${totale}**${det}${sotto}`,
    );
  }
  const more = articoli.length > top.length ? `\n\n…e altri ${articoli.length - top.length} articoli.` : "";
  return {
    content: `📦 Trovati ${articoli.length} articoli:\n\n${blocchi.join("\n\n")}${more}`,
    data: { count: articoli.length },
  };
}
