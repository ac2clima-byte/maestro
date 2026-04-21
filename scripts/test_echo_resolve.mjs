// Test logica resolver ECHO con dati reali Firestore
import admin from "firebase-admin";

admin.initializeApp({ projectId: "garbymobile-f89ac" });
const db = admin.firestore();

function tokenize(s) {
  return String(s || "")
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .split(/[\s,._\-]+/)
    .filter(Boolean);
}

function matchesAllTokens(queryTokens, nameTokens) {
  if (!queryTokens.length) return false;
  const nameSet = new Set(nameTokens);
  return queryTokens.every(t => nameSet.has(t));
}

async function resolveContact(input) {
  const queryTokens = tokenize(input);
  const candidates = [];
  const snap = await db.collection("cosmina_contatti_interni").limit(500).get();
  snap.forEach(doc => {
    const data = doc.data() || {};
    const nome = data.nome;
    if (!nome) return;
    if (!matchesAllTokens(queryTokens, tokenize(nome))) return;
    candidates.push({
      nome,
      tel_personale: data.telefono_personale,
      tel_lavoro: data.telefono_lavoro,
      categoria: data.categoria,
      interno: data.interno,
    });
  });
  return candidates;
}

const tests = ["Malvicino", "Sara", "Dellafiore Lorenzo"];
for (const q of tests) {
  console.log(`\n═══ Query: "${q}" ═══`);
  const c = await resolveContact(q);
  console.log(`Match: ${c.length}`);
  c.forEach(x => {
    const tel = x.tel_personale || x.tel_lavoro;
    const outcome = tel
      ? `✅ invio a ${tel} (${x.tel_personale ? "personale" : "lavoro"})`
      : x.interno
        ? `⚠️ solo interno ${x.interno}, niente cellulare`
        : `❌ nessun contatto telefonico`;
    console.log(`  · ${x.nome} [${x.categoria}] → ${outcome}`);
  });
  // Decisione finale handler
  if (c.length === 0) {
    console.log(`  → Handler risponde: "Non trovo ${q} in rubrica"`);
  } else if (c.length === 1) {
    const only = c[0];
    const tel = only.tel_personale || only.tel_lavoro;
    if (tel) console.log(`  → Handler AUTO-INVIA a ${only.nome}`);
    else console.log(`  → Handler risponde: "Trovato ${only.nome} ma senza cellulare (interno ${only.interno})"`);
  } else {
    console.log(`  → Handler DISAMBIGUA: "Ho trovato ${c.length} match: ${c.map(x=>x.nome).join(", ")}. Quale?"`);
  }
}

process.exit(0);
