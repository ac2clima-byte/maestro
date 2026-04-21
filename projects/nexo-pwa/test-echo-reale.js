#!/usr/bin/env node
/** test-echo-reale.js — PRIMO INVIO WHATSAPP REALE via NEXUS. */
import { chromium } from "/home/albertocontardi/node_modules/playwright/index.mjs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(__dirname, "test-screenshots", "echo-reale");
fs.mkdirSync(SHOTS, { recursive: true });
const PWA = "https://nexo-hub-15f2d.web.app";

const PROMPT = "manda whatsapp a Alberto: Ciao, questo è un test di NEXO. ECHO funziona!";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(PWA, { waitUntil: "domcontentloaded" });

  const sid = `reale_${Date.now().toString(36)}`;
  console.log(`\n→ "${PROMPT}"`);
  console.log(`  session: ${sid}`);

  await page.evaluate(sid => localStorage.setItem("nexo.nexus.sessionId", sid), sid);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#nexusFab");
  await page.click("#nexusFab");
  await page.waitForSelector("#nexusInput");
  await page.waitForTimeout(500);

  const before = await page.$$eval(".nexus-bubble.assistant", e => e.length);
  await page.locator("#nexusInput").fill(PROMPT);
  await page.locator("#nexusInput").press("Enter");

  let reply = null;
  const start = Date.now();
  while (Date.now() - start < 60000) {
    const bubbles = await page.$$eval(".nexus-bubble.assistant", e => e.map(x => x.textContent.trim()));
    if (bubbles.length > before) { reply = bubbles[bubbles.length - 1]; break; }
    await page.waitForTimeout(500);
  }

  const shot = path.join(SHOTS, "invio-reale.png");
  await page.screenshot({ path: shot, fullPage: false });

  console.log(`\n═══ REPLY ═══`);
  console.log(reply || "(nessuna risposta entro 60s)");
  console.log(`\n═══ VERDETTO ═══`);

  const outcome = !reply ? "TIMEOUT"
    : /✅ WA inviato|inviato/i.test(reply) ? "INVIATO_REALE"
    : /Simulato|DRY_RUN/i.test(reply) ? "ANCORA_SIMULATO"
    : /ECHO: invio fallito|❌/.test(reply) ? "FALLITO_WAHA"
    : /rifiuta|non trovo/i.test(reply) ? "RIFIUTATO"
    : "INATTESO";

  console.log(outcome);
  fs.writeFileSync(path.join(SHOTS, "result.json"), JSON.stringify({
    prompt: PROMPT, reply, outcome, screenshot: shot, timestamp: new Date().toISOString(),
  }, null, 2));

  await browser.close();
  // Exit code: 0 = INVIATO_REALE, 1 = altro
  process.exit(outcome === "INVIATO_REALE" ? 0 : 1);
})();
