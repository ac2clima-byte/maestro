import admin from 'firebase-admin';
admin.initializeApp({ projectId: "garbymobile-f89ac" });
const db = admin.firestore();

// Quante card con label tecnico-name nei labels[]?
const snap = await db.collection("bacheca_cards").limit(5000).get();
let withTechLabel = 0;
let labelTechNotMatchingTechName = [];
const TECNICI_UPPER = ["AIME","DAVID","ALBANESI","CONTARDI","ALBERTO","DELLAFIORE","LORENZO","VICTOR","LESHI","ERGEST","PIPARO","MARCO","TOSCA","FEDERICO","TROISE","ANTONIO"];

snap.forEach(d => {
  const x = d.data();
  if (!Array.isArray(x.labels)) return;
  const labelTechs = [];
  for (const l of x.labels) {
    const nm = String(l && l.name || "").toUpperCase();
    if (TECNICI_UPPER.includes(nm)) labelTechs.push(nm);
  }
  if (!labelTechs.length) return;
  withTechLabel++;
  // labelTechs vs techName/techNames
  const tn = String(x.techName||"").toUpperCase();
  const tns = (x.techNames||[]).map(t => String(t).toUpperCase());
  const allKnown = new Set([tn, ...tns].filter(Boolean));
  const extraLabels = labelTechs.filter(l => !allKnown.has(l));
  if (extraLabels.length) {
    labelTechNotMatchingTechName.push({ id: d.id, due: x.due, tn: x.techName, tns: x.techNames, labels: labelTechs, extra: extraLabels, board: (x.boardName||"").slice(0,40) });
  }
});
console.log("scan:", snap.size);
console.log("card con label tecnico:", withTechLabel);
console.log("card con label tecnico NON in techName/techNames (= caso DEPRETIS):", labelTechNotMatchingTechName.length);
for (const c of labelTechNotMatchingTechName.slice(0,10)) console.log(" ", JSON.stringify(c));
