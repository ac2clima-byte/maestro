// Test v0.3: verifica linguaggio naturale NEXUS via API
import admin from "firebase-admin";
import { writeFileSync } from "node:fs";

admin.initializeApp({ projectId: "garbymobile-f89ac" });

const NEXUS_URL = "https://europe-west1-nexo-hub-15f2d.cloudfunctions.net/nexusRouter";
const TEST_UID = "test-nexus-v03";
const API_KEY = "AIzaSyDUoIbTYwnVAfX-ka9NiTpa08k7isNmD_k";

const QUERIES = [
  { domanda: "ciao",                          area: "saluto" },
  { domanda: "quante email urgenti ho?",      area: "iris" },
  { domanda: "fatture scadute",               area: "charta" },
  { domanda: "stato della suite",             area: "pharo" },
  { domanda: "scadenze CURIT",                area: "dikea" },
];

const ROBOTIC = /\*\*|^[-•·]\s|📧|📊|📋|🚨|🔔|^\s+-\s/m;

async function getIdToken() {
  const customToken = await admin.auth().createCustomToken(TEST_UID, { test: true });
  const resp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  return (await resp.json()).idToken;
}

(async () => {
  const idToken = await getIdToken();
  const results = [];
  for (const q of QUERIES) {
    const sessionId = `test-v03-${q.area}-${Date.now()}`;
    const start = Date.now();
    let item;
    try {
      const resp = await fetch(NEXUS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
        body: JSON.stringify({ userMessage: q.domanda, sessionId, history: [] }),
      });
      const ms = Date.now() - start;
      const text = await resp.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
      const risposta = String(data?.intent?.rispostaUtente || data?.raw || "").trim();
      const robotic = ROBOTIC.test(risposta);
      item = { ...q, ok: resp.ok, ms, risposta: risposta.slice(0, 400), naturale: !robotic };
      console.log(`\n═══ ${q.area.toUpperCase()} ═══ "${q.domanda}" (${ms}ms, ${resp.status})`);
      console.log(`  ${item.naturale ? "✅" : "❌"} ${item.naturale ? "naturale" : "ROBOTICA"}`);
      console.log(`  ${risposta.slice(0, 250)}`);
    } catch (e) {
      item = { ...q, ok: false, error: String(e).slice(0, 200) };
      console.log(`\n❌ ${q.area}: ${item.error}`);
    }
    results.push(item);
  }
  const summary = {
    ts: new Date().toISOString(),
    totale: results.length,
    ok: results.filter(r => r.ok).length,
    naturali: results.filter(r => r.naturale).length,
    results,
  };
  writeFileSync("/home/albertocontardi/maestro-bridge/results/v03-nexus-test.json", JSON.stringify(summary, null, 2));
  console.log(`\n═══ Riepilogo: ${summary.naturali}/${summary.totale} naturali, ${summary.ok}/${summary.totale} ok ═══`);
  process.exit(0);
})();
