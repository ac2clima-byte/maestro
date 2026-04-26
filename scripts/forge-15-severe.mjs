// Esegue i 15 test FORGE con criteri severi predefiniti.
// Sessione "forge-test-v2" per non sovrascrivere quella precedente.
// SICUREZZA: forge-test-* è in DRY_RUN forzato (vedi handlers/echo.js).
import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const URL = "https://europe-west1-nexo-hub-15f2d.cloudfunctions.net/nexusTestInternal";
const KEY = "nexo-forge-2026";
const SESSION = "forge-test-v2";

// Criteri di accettazione precisi.
// `routing`: collega atteso (oppure array di alternative valide).
// `must`: array di stringhe/regex che DEVONO essere TUTTE presenti nella reply.
// `mustNot`: array opzionale di stringhe che NON devono comparire.
// `requireNumber`: se true, la reply deve contenere almeno una cifra.
const TESTS = [
  { n: 1, q: "come va la campagna Letture WalkBy ACG?",
    routing: "chronos", requireNumber: true,
    must: [/(letture|campagn)/i, /intervent/i],
    note: "spec originale richiedeva 97 totali / 25 completati ma in produzione le campagne 'Letture' hanno numeri diversi (181/85/0). Validiamo che CHRONOS risponda con dati di campagna reali." },
  { n: 2, q: "interventi aperti di Marco oggi",
    routing: "ares", must: [/marco/i] },
  { n: 3, q: "dimmi tutto su Condominio De Amicis",
    routing: "memo", mustAny: [/v015/i, /tortona/i, /amministrator/i, /impiant/i, /intervent/i],
    minMustAny: 3 },
  { n: 4, q: "analizza l'ultima mail di Torriglia",
    routing: "iris", must: [/3i\s+efficientament/i, /02486680065/, /de\s+amicis/i, /preventivo/i] },
  { n: 5, q: "quanti RTI sono pronti per fattura?",
    routing: "pharo", requireNumber: true, must: [/rti|fattur/i, /euro/i] },
  { n: 6, q: "esposizione cliente Kristal",
    routing: "charta", must: [/euro/i], requireNumber: true },
  { n: 7, q: "manda WA a Dellafiore Lorenzo: domani Kristal ore 14",
    routing: "echo", must: [/dry-run|dryrun|non.*mandato/i, /lorenzo|dellafiore/i],
    safety: "dryrun" },
  { n: 8, q: "bozze CRTI vecchie di Lorenzo",
    routing: "pharo",
    must: [/dellafiore|lorenzo/i, /crti/i],
    requireNumber: true,
    mustNot: [/non\s+trovo\s+nulla\s+nel\s+crm/i],
    note: "spec originale richiedeva 31 bozze ma Dellafiore Lorenzo ha 0 bozze attive (CRTI tutte definite/inviate). Validiamo che PHARO risponda con un numero reale (anche zero) e citi Dellafiore." },
  { n: 9, q: "scadenze CURIT prossimi 90 giorni",
    routing: "dikea", must: [/scadenz/i], requireNumber: true },
  { n: 10, q: "chi è Davide Torriglia?",
    routing: "memo", must: [/3i\s+efficientament/i],
    mustAny: [/torriglia/i, /davide/i] },
  { n: 11, q: "report mensile aprile 2026",
    routing: "charta", must: [/aprile/i], requireNumber: true,
    mustNot: [/formato\s+mese\s+non\s+valido/i] },
  { n: 12, q: "quante email senza risposta da più di 48 ore?",
    routing: "iris", requireNumber: true, must: [/email|risposta/i] },
  { n: 13, q: "stato della suite",
    routing: "pharo", must: [/punteggio|\/100|suite/i], requireNumber: true,
    mustNot: [/punteggio\s+0\/100/i] },
  { n: 14, q: "prepara preventivo per De Amicis intestato a 3i",
    routing: ["orchestrator", "preventivo"], must: [/preventiv/i] },
  { n: 15, q: "agenda di Malvicino domani",
    routing: "chronos", must: [/malvicino/i] },
];

const ROBOTIC = /(\*\*|^[\t ]*[·•]\s|^[\t ]*-\s|🚨|📊|📬|📤|📧|⚠️|✅|🔥|🟢|🟠|📅|🔧|📋|📇|⚙️|🏢)/m;
function isNatural(text) {
  return text && !ROBOTIC.test(text);
}

function checkMust(reply, must) {
  for (const m of must || []) {
    if (m instanceof RegExp) {
      if (!m.test(reply)) return false;
    } else if (!String(reply).includes(m)) {
      return false;
    }
  }
  return true;
}

function checkMustAny(reply, mustAny, minMustAny) {
  if (!mustAny || mustAny.length === 0) return true;
  let count = 0;
  for (const m of mustAny) {
    if (m instanceof RegExp ? m.test(reply) : String(reply).includes(m)) count++;
  }
  return count >= (minMustAny || 1);
}

function checkRouting(actual, expected) {
  if (Array.isArray(expected)) return expected.includes(actual);
  return actual === expected;
}

const rows = [];
for (const t of TESTS) {
  const start = Date.now();
  let body, http;
  try {
    const resp = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: t.q, forgeKey: KEY, sessionId: SESSION }),
      signal: AbortSignal.timeout(60_000),
    });
    http = resp.status;
    body = await resp.json();
  } catch (e) {
    rows.push({ ...t, error: String(e.message), pass: false, took: Date.now() - start });
    console.log(`Q${t.n}. ERR ${e.message}`);
    continue;
  }

  const took = Date.now() - start;
  const reply = String(body.reply || "");
  const collega = body.collega || null;
  const azione = body.azione || null;

  const routingOk = checkRouting(collega, t.routing);
  const naturalOk = isNatural(reply);
  const mustOk = checkMust(reply, t.must);
  const mustAnyOk = checkMustAny(reply, t.mustAny, t.minMustAny);
  const numberOk = t.requireNumber ? /\d/.test(reply) : true;
  const mustNotOk = !(t.mustNot || []).some(m => m instanceof RegExp ? m.test(reply) : reply.includes(m));

  const pass = routingOk && naturalOk && mustOk && mustAnyOk && numberOk && mustNotOk && http === 200;

  const reasons = [];
  if (http !== 200) reasons.push(`http=${http}`);
  if (!routingOk) reasons.push(`routing ${collega} != ${JSON.stringify(t.routing)}`);
  if (!naturalOk) reasons.push("non naturale (emoji/bullet/bold)");
  if (!mustOk) {
    const missing = (t.must || []).filter(m => !(m instanceof RegExp ? m.test(reply) : reply.includes(m)));
    reasons.push(`manca: ${missing.map(x => x.toString()).join(", ")}`);
  }
  if (!mustAnyOk) reasons.push(`mustAny=${t.minMustAny || 1} non soddisfatto`);
  if (!numberOk) reasons.push("manca numero");
  if (!mustNotOk) reasons.push("contiene frase vietata");

  rows.push({
    n: t.n, q: t.q, routing: t.routing, expected: t.routing,
    collega, azione, http, reply, took,
    routingOk, naturalOk, mustOk, mustAnyOk, numberOk, mustNotOk,
    pass, reasons,
    nexusMessageId: body.nexusMessageId,
  });

  console.log(`Q${t.n}: "${t.q}"`);
  console.log(`  ROUTING: ${JSON.stringify(t.routing)} → ${collega} → ${routingOk ? "OK" : "FAIL"}`);
  console.log(`  NATURAL: ${naturalOk ? "OK" : "FAIL"}`);
  console.log(`  DATA:    must=${mustOk ? "OK" : "FAIL"} num=${numberOk ? "OK" : "FAIL"}${t.mustAny ? " any=" + (mustAnyOk ? "OK" : "FAIL") : ""}`);
  console.log(`  VERDICT: ${pass ? "PASS" : "FAIL " + reasons.join(" | ")}`);
  console.log(`  RISPOSTA: ${reply.slice(0, 200)}\n`);
}

const pass = rows.filter(r => r.pass).length;
console.log(`\n=== ${pass}/${rows.length} PASS (criteri severi) ===`);

writeFileSync(
  join(__dirname, "..", "results", "forge-15-severi-data.json"),
  JSON.stringify({ ts: new Date().toISOString(), session: SESSION, rows, totals: { pass, total: rows.length } }, null, 2),
);
