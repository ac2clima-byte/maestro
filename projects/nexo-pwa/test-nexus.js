#!/usr/bin/env node
/**
 * test-nexus.js — test E2E di NEXUS chat via Playwright su produzione.
 *
 * Requisiti:
 *   node >=20, playwright installato (riuso ~/node_modules/playwright).
 *
 * Apre la PWA live, apre il pannello chat, invia 3 messaggi, verifica
 * che la risposta arrivi (entro 15s) e fa screenshot.
 *
 * Uso:
 *   node projects/nexo-pwa/test-nexus.js
 *
 * Exit code:
 *   0 = tutti i test passati
 *   1 = almeno un test fallito
 */

import { chromium } from "/home/albertocontardi/node_modules/playwright/index.mjs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = path.join(__dirname, "test-screenshots");
const PWA_URL = "https://nexo-hub-15f2d.web.app";

const SESSION_ID =
  "test_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

// Colori console
const C = {
  g: (s) => `\x1b[32m${s}\x1b[0m`,
  r: (s) => `\x1b[31m${s}\x1b[0m`,
  y: (s) => `\x1b[33m${s}\x1b[0m`,
  b: (s) => `\x1b[36m${s}\x1b[0m`,
  gray: (s) => `\x1b[90m${s}\x1b[0m`,
};

function log(...a) { console.log(C.gray(new Date().toISOString().slice(11, 19)), ...a); }

/** Legge tutte le bolle assistant dal pannello. */
async function readAssistantBubbles(page) {
  return page.$$eval(".nexus-bubble.assistant", (els) =>
    els.map((e) => e.textContent.trim()),
  );
}

/** Aspetta che arrivi una nuova risposta assistant (oltre quelle già presenti). */
async function waitForNewAssistantReply(page, initialCount, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const bubbles = await readAssistantBubbles(page);
    if (bubbles.length > initialCount) return bubbles[bubbles.length - 1];
    await page.waitForTimeout(500);
  }
  return null;
}

/** True se la risposta "sembra contenere dati utili". */
function looksMeaningful(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  // risposta di errore / fallback
  if (t.includes("errore di rete")) return false;
  if (t.includes("non sono riuscito a interpretare")) return false;
  if (t.includes("non ho capito bene")) return false;
  // numeri, date, o parole-chiave di dato reale
  return /\d/.test(text) || /(email|inviata|richiesta|trovat|ares|charta|malvicino)/i.test(text);
}

// Descrittori test
const TESTS = [
  {
    id: 1,
    msg: "quante email urgenti ho?",
    screenshot: "nexus-test-1.png",
    check: (txt) => /urgent|email/i.test(txt),
    expectedColleague: "iris",
    notes: "Query diretta IRIS: deve rispondere con numero email urgenti o zero.",
  },
  {
    id: 2,
    msg: "email da Malvicino",
    screenshot: "nexus-test-2.png",
    check: (txt) => /malvicino|trovat|email/i.test(txt),
    expectedColleague: "iris",
    notes: "Ricerca mittente: deve listare email da Malvicino.",
  },
  {
    id: 3,
    msg: "apri intervento caldaia Via Roma 12",
    screenshot: "nexus-test-3.png",
    check: (txt) => /ares|intervento|non.*attivo|richiesta/i.test(txt),
    expectedColleague: "ares",
    notes: "Azione operativa: ARES non attivo → placeholder.",
  },
];

const results = [];

async function runTest(page, t) {
  log(C.b(`\n━━━ TEST #${t.id}: "${t.msg}" ━━━`));
  log(C.gray(`  ${t.notes}`));

  const before = (await readAssistantBubbles(page)).length;
  const input = page.locator("#nexusInput");
  await input.fill(t.msg);
  await input.press("Enter");
  log(C.gray("  messaggio inviato, aspetto risposta (max 15s)…"));

  const reply = await waitForNewAssistantReply(page, before, 15000);
  await page.waitForTimeout(500); // stabilizza UI per screenshot
  const shotPath = path.join(SCREENSHOT_DIR, t.screenshot);
  await page.screenshot({ path: shotPath, fullPage: false });
  log(C.gray(`  📸 screenshot: ${shotPath}`));

  if (!reply) {
    log(C.r(`  ✗ TIMEOUT — nessuna risposta entro 15s`));
    results.push({ ...t, passed: false, reason: "timeout", reply: null, shot: shotPath });
    return;
  }

  // Stampa la risposta in chat (tronca a 400 char)
  log(C.b("  NEXUS:"), reply.length > 400 ? reply.slice(0, 400) + "…" : reply);

  const meaningful = looksMeaningful(reply);
  const matchesCheck = t.check(reply);

  if (meaningful && matchesCheck) {
    log(C.g(`  ✓ TEST PASSED`));
    results.push({ ...t, passed: true, reply, shot: shotPath });
  } else {
    const why = !meaningful ? "risposta vuota/errore" : "check regex non match";
    log(C.r(`  ✗ TEST FAILED (${why})`));
    results.push({ ...t, passed: false, reason: why, reply, shot: shotPath });
  }
}

(async () => {
  log(C.b("=== NEXUS E2E TEST ==="));
  log(C.gray(`PWA: ${PWA_URL}`));
  log(C.gray(`Session ID di test: ${SESSION_ID}`));
  log(C.gray(`Screenshot dir: ${SCREENSHOT_DIR}`));

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      // iniezione session id deterministico per non inquinare sessioni reali
      storageState: {
        cookies: [],
        origins: [{
          origin: PWA_URL,
          localStorage: [{ name: "nexo.nexus.sessionId", value: SESSION_ID }],
        }],
      },
    });
    const page = await context.newPage();

    // raccolta errori console per diagnosi
    const consoleErrors = [];
    page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(`console.error: ${msg.text()}`);
    });

    log(C.b(`→ naviga a ${PWA_URL}`));
    // networkidle è troppo stringente: Firestore onSnapshot tiene socket aperti.
    // Uso domcontentloaded + poi aspetto il FAB.
    await page.goto(PWA_URL, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Attendi FAB
    await page.waitForSelector("#nexusFab", { timeout: 10000 });
    log(C.g("  ✓ FAB NEXUS trovato"));

    // Apri pannello
    await page.click("#nexusFab");
    await page.waitForSelector("#nexusPanel.open", { timeout: 5000 });
    await page.waitForSelector("#nexusInput", { timeout: 5000 });
    log(C.g("  ✓ pannello chat aperto"));

    // Screenshot iniziale del pannello aperto (utile se crasha sui test)
    const initShot = path.join(SCREENSHOT_DIR, "nexus-test-0-init.png");
    await page.screenshot({ path: initShot });
    log(C.gray(`  📸 init: ${initShot}`));

    // Run tests in sequence (stessa sessione, per verificare anche la history)
    for (const t of TESTS) {
      await runTest(page, t);
    }

    // Stampa errori console se ci sono
    if (consoleErrors.length) {
      log(C.y("\n⚠ console errors durante il test:"));
      for (const e of consoleErrors.slice(0, 10)) log(C.gray("  " + e));
    }

    await context.close();
    await browser.close();
  } catch (err) {
    console.error(C.r(`\n✗ ECCEZIONE: ${err.message}`));
    if (browser) {
      try {
        const errShot = path.join(SCREENSHOT_DIR, "nexus-error.png");
        // Screenshot di emergenza se il browser è ancora vivo
        const ctx = browser.contexts()[0];
        const pg = ctx?.pages()[0];
        if (pg) await pg.screenshot({ path: errShot });
        await browser.close();
      } catch {}
    }
    results.push({ id: 0, msg: "(setup)", passed: false, reason: err.message });
  }

  // Riassunto
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log("\n" + C.b("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  console.log(C.b("RIASSUNTO"));
  console.log(C.b("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  for (const r of results) {
    const badge = r.passed ? C.g("✓ PASS") : C.r("✗ FAIL");
    console.log(`  ${badge}  Test #${r.id}: ${r.msg}`);
    if (!r.passed) console.log(C.gray(`         motivo: ${r.reason || "—"}`));
  }
  console.log(C.b("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  console.log(`  Passati: ${C.g(passed)}   Falliti: ${failed ? C.r(failed) : failed}`);
  console.log(`  Screenshot: ${SCREENSHOT_DIR}`);
  console.log(C.b("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));

  process.exit(failed > 0 ? 1 : 0);
})();
