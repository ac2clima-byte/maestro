// Test end-to-end v0.2: 11 query NEXUS (1 per Collega) via nexusRouter live.
// Genera custom token via Admin SDK, lo scambia per ID token, chiama API protetta.
import admin from "firebase-admin";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

admin.initializeApp({ projectId: "garbymobile-f89ac" });

const NEXUS_URL = "https://europe-west1-nexo-hub-15f2d.cloudfunctions.net/nexusRouter";
const TEST_UID = "test-nexus-v02";
const TEST_EMAIL = "test-v02@acgclimaservice.com";

const QUERIES = [
  { collega: "IRIS",     query: "quante email urgenti?" },
  { collega: "ECHO",     query: "manda WA a Alberto: test v0.2" },
  { collega: "ARES",     query: "interventi aperti" },
  { collega: "CHRONOS",  query: "scadenze prossime" },
  { collega: "MEMO",     query: "dimmi tutto su Kristal" },
  { collega: "CHARTA",   query: "fatture scadute" },
  { collega: "EMPORION", query: "cosa manca in magazzino?" },
  { collega: "DIKEA",    query: "scadenze CURIT" },
  { collega: "DELPHI",   query: "KPI di aprile" },
  { collega: "PHARO",    query: "stato della suite" },
  { collega: "CALLIOPE", query: "scrivi risposta a Moraschi" },
];

async function getIdToken() {
  // 1. Crea custom token con Admin SDK
  const customToken = await admin.auth().createCustomToken(TEST_UID, { test: true, email: TEST_EMAIL });
  // 2. Scambia custom token per ID token via REST endpoint Firebase Auth
  // Api key pubblica della PWA (config.apiKey landing)
  const apiKey = "AIzaSyDUoIbTYwnVAfX-ka9NiTpa08k7isNmD_k";
  const resp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Scambio custom token fallito: ${resp.status} ${t.slice(0, 300)}`);
  }
  const data = await resp.json();
  return data.idToken;
}

async function runTest(idToken, { collega, query }) {
  const sessionId = `test-v02-${collega}-${Date.now()}`;
  console.log(`\n═══ ${collega} ═══ "${query}"`);
  const start = Date.now();
  try {
    const resp = await fetch(NEXUS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${idToken}`,
      },
      body: JSON.stringify({ userMessage: query, sessionId, history: [] }),
    });
    const ms = Date.now() - start;
    const text = await resp.text();
    if (!resp.ok) {
      console.log(`  ❌ HTTP ${resp.status} (${ms}ms)`);
      console.log(`  ${text.slice(0, 200)}`);
      return { collega, query, ok: false, status: resp.status, error: text.slice(0, 200), ms };
    }
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    const intent = data.intent || {};
    const direct = data.direct || {};
    const stato = data.stato || "?";
    const confidenza = intent.confidenza;
    console.log(`  ✅ HTTP 200 (${ms}ms)`);
    console.log(`  stato: ${stato} · collega-rilevato: ${intent.collega} · azione: ${intent.azione} · conf: ${confidenza}`);
    if (direct.failed) console.log(`  ⚠️ handler failed`);
    if (direct.data) console.log(`  data keys: ${Object.keys(direct.data).slice(0, 8).join(", ")}`);
    console.log(`  risposta: ${String(intent.rispostaUtente || "").slice(0, 120)}`);
    return {
      collega, query, ok: true, status: 200, ms, sessionId,
      stato,
      intentCollega: intent.collega,
      azione: intent.azione,
      confidenza,
      rispostaUtente: intent.rispostaUtente,
      handlerFailed: !!direct.failed,
      dataKeys: direct.data ? Object.keys(direct.data).slice(0, 10) : [],
      nexusMessageId: data.nexusMessageId,
      lavagnaId: data.lavagnaMessageId,
    };
  } catch (e) {
    const ms = Date.now() - start;
    console.log(`  ❌ fetch: ${e.message} (${ms}ms)`);
    return { collega, query, ok: false, error: e.message, ms };
  }
}

async function readFullContent(sessionId) {
  // Leggi il content dell'ultimo messaggio assistant nella sessione
  try {
    admin.initializeApp({ projectId: "nexo-hub-15f2d" }, "nexo");
  } catch (e) {
    if (!String(e).includes("already exists")) throw e;
  }
  const nexoApp = admin.apps.find(a => a && a.name === "nexo");
  const fs = admin.firestore(nexoApp);
  const snap = await fs.collection("nexus_chat")
    .where("sessionId", "==", sessionId)
    .limit(20).get();
  const msgs = [];
  snap.forEach(d => {
    const v = d.data() || {};
    if (v.role === "assistant") {
      msgs.push({ content: String(v.content || ""), stato: v.stato });
    }
  });
  return msgs;
}

(async () => {
  mkdirSync("/home/albertocontardi/maestro-bridge/results/v02-test", { recursive: true });

  console.log("→ Generazione ID Token test…");
  const idToken = await getIdToken();
  console.log(`   ✅ token ottenuto (${idToken.length} char)`);

  const results = [];
  for (const q of QUERIES) {
    const r = await runTest(idToken, q);
    results.push(r);
    await new Promise(r => setTimeout(r, 1500));
  }

  // Arricchisci con il content dell'assistant (letto da Firestore)
  console.log("\n→ Recupero content risposte assistant…");
  for (const r of results) {
    if (r.sessionId) {
      try {
        const msgs = await readFullContent(r.sessionId);
        if (msgs.length) r.assistantContent = msgs[msgs.length - 1].content;
      } catch (e) {
        r.contentError = String(e).slice(0, 150);
      }
    }
  }

  // Sommario
  const pass = results.filter(r => r.ok).length;
  const fail = results.filter(r => !r.ok).length;
  const correctCollega = results.filter(r => r.ok && String(r.intentCollega || "").toLowerCase() === r.collega.toLowerCase()).length;
  const completed = results.filter(r => r.stato === "completata").length;

  console.log(`\n╔═══════════════════════════════════════════╗`);
  console.log(`║  RISULTATI v0.2 — ${pass}/${QUERIES.length} API OK              ║`);
  console.log(`║  ${completed}/${QUERIES.length} completate (handler eseguito)       ║`);
  console.log(`║  ${correctCollega}/${QUERIES.length} routing corretto Collega       ║`);
  console.log(`╚═══════════════════════════════════════════╝`);

  writeFileSync(
    "/home/albertocontardi/maestro-bridge/results/v02-test/results.json",
    JSON.stringify({ timestamp: new Date().toISOString(), summary: { pass, fail, completed, correctCollega, total: QUERIES.length }, results }, null, 2)
  );
  console.log("\n✅ Export: results/v02-test/results.json");
})().catch(e => {
  console.error("Fatal:", e);
  process.exit(1);
});
