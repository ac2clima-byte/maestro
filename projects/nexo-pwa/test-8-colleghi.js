#!/usr/bin/env node
/** test-8-colleghi.js — verifica NEXUS su tutti gli 8 Colleghi implementati. */
import { chromium } from "/home/albertocontardi/node_modules/playwright/index.mjs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = path.join(__dirname, "test-screenshots");
const PWA_URL = "https://nexo-hub-15f2d.web.app";
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const PROMPTS = [
  { key: "ares-interventi",     q: "interventi aperti oggi" },
  { key: "chronos-scadenze",    q: "scadenze prossime" },
  { key: "chronos-agenda",      q: "agenda di Malvicino domani" },
  { key: "charta-fatture",      q: "fatture scadute" },
  { key: "charta-report",       q: "report mensile 2026-04" },
  { key: "emporion-sottoscorta", q: "cosa manca in magazzino?" },
  { key: "emporion-giacenza",   q: "c'è il pezzo codice 00001?" },
  { key: "dikea-curit",         q: "scadenze CURIT" },
  { key: "dikea-targa",         q: "impianti senza targa" },
  { key: "delphi-kpi",          q: "come siamo andati questo mese?" },
  { key: "delphi-costo",        q: "costo AI ultimi 30 giorni" },
  { key: "pharo-stato",         q: "stato della suite, tutto ok?" },
  { key: "calliope-bozza",      q: "scrivi una bozza cordiale a Moraschi Roberto" },
];

async function testOne(page, prompt, key) {
  console.log(`\n→ [${key}] "${prompt.q}"`);
  const sessionId = `test8_${key}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  await page.evaluate((sid) => localStorage.setItem("nexo.nexus.sessionId", sid), sessionId);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#nexusFab");
  await page.click("#nexusFab");
  await page.waitForSelector("#nexusInput");
  await page.waitForTimeout(500);

  const before = await page.$$eval(".nexus-bubble.assistant", (els) => els.length);
  await page.locator("#nexusInput").fill(prompt.q);
  await page.locator("#nexusInput").press("Enter");

  let reply = null;
  const start = Date.now();
  while (Date.now() - start < 40000) {
    const bubbles = await page.$$eval(".nexus-bubble.assistant",
      (els) => els.map(e => e.textContent.trim()));
    if (bubbles.length > before) { reply = bubbles[bubbles.length - 1]; break; }
    await page.waitForTimeout(500);
  }

  const screenshotPath = path.join(SCREENSHOT_DIR, `nexus-${key}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`  reply: ${reply ? reply.split("\n")[0].slice(0, 120) : "(nessuna)"}`);
  return { key, q: prompt.q, reply: reply ? reply.slice(0, 800) : null, screenshot: screenshotPath };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(PWA_URL, { waitUntil: "domcontentloaded", timeout: 30000 });

  const results = [];
  for (const p of PROMPTS) {
    try {
      const r = await testOne(page, p, p.key);
      results.push(r);
    } catch (e) {
      console.error(`  ERROR: ${e.message}`);
      results.push({ key: p.key, q: p.q, error: e.message });
    }
  }
  await browser.close();

  const reportPath = path.join(SCREENSHOT_DIR, "report-8-colleghi.json");
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));

  console.log("\n═══ SUMMARY ═══");
  for (const r of results) {
    const ok = r.reply && !r.error && !/non ancora attivo|non è ancora attivo/i.test(r.reply);
    const first = r.reply ? r.reply.split("\n")[0].slice(0, 100) : "(vuota)";
    console.log(`${ok ? "✅" : "⚠️"} ${r.key.padEnd(22)} ${first}`);
  }
  console.log(`\nReport: ${reportPath}`);
})();
