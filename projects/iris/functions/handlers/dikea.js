// handlers/dikea.js — compliance normativa (CURIT, REE, impianti senza targa).
import { getCosminaDb } from "./shared.js";

export async function handleDikeaScadenzeCurit(parametri) {
  const finestraGiorni = Number(parametri.finestraGiorni) || 90;
  const now = new Date();
  const limite = new Date(now.getTime() + finestraGiorni * 86400000);

  const db = getCosminaDb();
  const collezioni = ["cosmina_impianti_cit", "cosmina_impianti"];
  const rows = [];

  for (const coll of collezioni) {
    try {
      const snap = await db.collection(coll).limit(500).get();
      snap.forEach(d => {
        const data = d.data() || {};
        const candidates = [
          { tipo: "CURIT", val: data.data_bollino_curit || data.scadenza_bollino },
          { tipo: "REE", val: data.data_ultima_ree || data.data_ree },
          { tipo: "MANUT", val: data.data_prossima_manutenzione || data.prossima_manutenzione },
        ];
        for (const c of candidates) {
          if (!c.val) continue;
          let scad;
          try {
            scad = c.val.toDate ? c.val.toDate() : new Date(c.val);
            if (Number.isNaN(scad.getTime())) continue;
          } catch { continue; }
          if (scad < now || scad > limite) continue;
          rows.push({
            tipo: c.tipo,
            data: scad,
            cond: data.condominio || data.indirizzo || "?",
            targa: data.targa_cit || "",
          });
        }
      });
      if (rows.length) break;
    } catch (e) {
      const msg = String(e?.message || e);
      if (/permission|denied|UNAUTHENTICATED|403|NOT_FOUND/i.test(msg)) continue;
      throw e;
    }
  }

  if (!rows.length) {
    return { content: `⚖️ Nessuna scadenza CURIT/REE/manutenzione nei prossimi ${finestraGiorni} giorni (o collection non accessibile).` };
  }

  rows.sort((a, b) => a.data.getTime() - b.data.getTime());
  const top = rows.slice(0, 12);
  const lines = top.map((r, i) => {
    const d = r.data.toLocaleDateString("it-IT");
    const giorni = Math.ceil((r.data.getTime() - now.getTime()) / 86400000);
    const urg = giorni <= 14 ? " ⚠️" : "";
    const targa = r.targa ? ` [${r.targa}]` : "";
    return `${i + 1}. [${d}] (${giorni}g)${urg} ${r.tipo} · ${r.cond.slice(0, 40)}${targa}`;
  }).join("\n");
  const more = rows.length > top.length ? `\n…e altre ${rows.length - top.length}.` : "";
  return {
    content: `⚖️ **${rows.length} scadenze normative** nei prossimi ${finestraGiorni}g:\n\n${lines}${more}`,
    data: { count: rows.length },
  };
}

export async function handleDikeaImpiantiSenzaTarga() {
  let snap;
  try {
    snap = await getCosminaDb().collection("cosmina_impianti").limit(500).get();
  } catch (e) {
    const msg = String(e?.message || e);
    if (/permission|denied|UNAUTHENTICATED|403|NOT_FOUND/i.test(msg)) {
      return { content: "DIKEA non può leggere `cosmina_impianti`." };
    }
    throw e;
  }
  const out = [];
  snap.forEach(d => {
    const data = d.data() || {};
    const targa = String(data.targa_cit || data.targa || "").trim();
    if (!targa) {
      out.push({
        id: d.id,
        cond: data.condominio || "",
        indirizzo: data.indirizzo || "",
      });
    }
  });
  if (!out.length) return { content: "✅ Tutti gli impianti censiti hanno una targa CURIT." };
  const top = out.slice(0, 15);
  const lines = top.map((r, i) => `${i + 1}. ${r.cond || "?"} — ${r.indirizzo || ""}`).join("\n");
  const more = out.length > top.length ? `\n…e altri ${out.length - top.length}.` : "";
  return {
    content: `⚠️ **${out.length} impianti SENZA targa CURIT**:\n\n${lines}${more}`,
    data: { count: out.length },
  };
}
