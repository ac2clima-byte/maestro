import admin from 'firebase-admin';
admin.initializeApp({ projectId: "garbymobile-f89ac" });
const db = admin.firestore();

// Range "oggi italiano" 27/04/2026
const from = new Date("2026-04-26T22:00:00.000Z");
const to   = new Date("2026-04-27T22:00:00.000Z");

const snap = await db.collection("bacheca_cards").get();
console.log("totali bacheca:", snap.size);

// 1. Search ESTREMA: card con due oggi + qualsiasi traccia di Marco/Piparo
//    in TUTTI i campi stringa (incluso desc, workDescription, etc.)
const today = [];
const candidatesMarco = [];
snap.forEach(d => {
  const x = d.data();
  let due = null;
  if (x.due) {
    try { due = x.due.toDate ? x.due.toDate() : new Date(x.due); } catch {}
  }
  if (!due || isNaN(due.getTime())) return;
  if (due < from || due >= to) return;
  today.push({ id: d.id, x, due });

  // Match Marco in QUALSIASI campo
  const fullJson = JSON.stringify(x).toLowerCase();
  if (/\bmarco\b/.test(fullJson) || /piparo/.test(fullJson)) {
    candidatesMarco.push({ id: d.id, due: due.toISOString(), tn: x.techName, tns: x.techNames, ln: x.listName, name: (x.name||"").slice(0,80), desc: (x.desc||"").slice(0,80), wd: (x.workDescription||"").slice(0,80), board: (x.boardName||"").slice(0,50), labels: x.labels, archiviato: x.archiviato });
  }
});
console.log(`\n[1] Card con due 27/04 (qualsiasi listName, qualsiasi tecnico): ${today.length}`);
console.log(`[2] Card oggi che CITANO Marco/Piparo OVUNQUE: ${candidatesMarco.length}`);
for (const c of candidatesMarco) console.log(" ", JSON.stringify(c));

// 2. RANGE ALLARGATO: forse Alberto pensa "oggi" come 26-28 (weekend buffer)
console.log("\n[3] Card di Marco (techName/techNames) in range 25/04-29/04:");
const wide_from = new Date("2026-04-24T22:00:00.000Z");
const wide_to   = new Date("2026-04-30T22:00:00.000Z");
const marcoWide = [];
snap.forEach(d => {
  const x = d.data();
  let due = null;
  if (x.due) { try { due = x.due.toDate ? x.due.toDate() : new Date(x.due); } catch {} }
  if (!due || isNaN(due.getTime())) return;
  if (due < wide_from || due >= wide_to) return;
  const tn = String(x.techName||"").toUpperCase();
  const tns = (x.techNames||[]).map(t => String(t).toUpperCase());
  if (tn.includes("MARCO") || tns.some(t => t.includes("MARCO"))) {
    marcoWide.push({ id: d.id, due: due.toISOString().slice(0,16), tn: x.techName, tns: x.techNames, ln: x.listName, board: (x.boardName||"").slice(0,40), name: (x.name||"").slice(0,60), stato: x.stato });
  }
});
marcoWide.sort((a,b) => a.due.localeCompare(b.due));
console.log("count:", marcoWide.length);
for (const m of marcoWide) console.log(" ", JSON.stringify(m));

// 3. Card recentemente UPDATED (modificate oggi) per Marco
console.log("\n[4] Card di Marco modificate oggi (qualsiasi due):");
const todayStartUtc = new Date("2026-04-26T22:00:00.000Z");
const todayEndUtc   = new Date("2026-04-27T22:00:00.000Z");
const recentMod = [];
snap.forEach(d => {
  const x = d.data();
  let upd = null;
  try { upd = x.updated_at && x.updated_at.toDate ? x.updated_at.toDate() : (x.updated_at ? new Date(x.updated_at) : null); } catch {}
  if (!upd || upd < todayStartUtc || upd >= todayEndUtc) return;
  const tn = String(x.techName||"").toUpperCase();
  const tns = (x.techNames||[]).map(t => String(t).toUpperCase());
  if (tn.includes("MARCO") || tns.some(t => t.includes("MARCO"))) {
    let due = null;
    if (x.due) { try { due = x.due.toDate ? x.due.toDate() : new Date(x.due); } catch {} }
    recentMod.push({ id: d.id, updated: upd.toISOString().slice(0,16), due: due ? due.toISOString().slice(0,10) : "?", tn: x.techName, tns: x.techNames, ln: x.listName, board: (x.boardName||"").slice(0,40), stato: x.stato });
  }
});
recentMod.sort((a,b) => b.updated.localeCompare(a.updated));
console.log("count:", recentMod.length);
for (const m of recentMod.slice(0,10)) console.log(" ", JSON.stringify(m));

// 4. Cosa c'è in cosmina_contatti_interni come "Marco"?
console.log("\n[5] Lookup Marco nei contatti interni:");
const contatti = await db.collection("cosmina_contatti_interni").get();
contatti.forEach(d => {
  const x = d.data();
  if (/marco|piparo/i.test(JSON.stringify(x))) {
    console.log("  ", d.id, JSON.stringify({nome: x.nome, cognome: x.cognome, ruolo: x.ruolo, categoria: x.categoria}));
  }
});
