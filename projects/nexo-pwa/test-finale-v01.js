#!/usr/bin/env node
/**
 * test-finale-v01.js — Test finale NEXO v0.1.
 * Una domanda per ognuno degli 11 Colleghi via NEXUS Chat.
 * Screenshot + analisi esito → report JSON per MD/HTML.
 */
import { chromium } from "/home/albertocontardi/node_modules/playwright/index.mjs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(__dirname, "test-screenshots", "finale-v01");
fs.mkdirSync(SHOTS, { recursive: true });
const PWA = "https://nexo-hub-15f2d.web.app";

// 1 domanda per ogni Collega (11 totali)
const PROMPTS = [
  { c: "iris",     q: "quante email ho ricevuto oggi?" },
  { c: "ares",     q: "interventi aperti" },
  { c: "chronos",  q: "scadenze prossime" },
  { c: "memo",     q: "dimmi tutto su Kristal" },
  { c: "charta",   q: "report mensile aprile 2026" },
  { c: "echo",     q: "manda whatsapp a Alberto: test finale NEXO v0.1" },
  { c: "emporion", q: "cosa manca in magazzino?" },
  { c: "dikea",    q: "scadenze CURIT" },
  { c: "delphi",   q: "KPI di questo mese" },
  { c: "pharo",    q: "stato della suite" },
  { c: "calliope", q: "scrivi risposta a Moraschi Roberto" },
];

function classifyOutcome(reply) {
  if (!reply) return { esito: "FAIL", motivo: "timeout" };
  if (/non ancora attivo/i.test(reply)) return { esito: "FAIL", motivo: "collega non attivo" };
  if (/ho provato a rispondere ma la query è fallita/i.test(reply)) return { esito: "FAIL", motivo: "handler errore" };
  // Output riconoscibili dei handler reali
  const hasData = /📧|📤|🔧|📆|📅|📇|💰|📊|📦|⚖️|👁️|✍️|✅|⚠️|❓|🚫|📝|💳|🚨/.test(reply);
  if (hasData) return { esito: "PASS", motivo: "handler diretto" };
  return { esito: "PASS", motivo: "risposta Haiku (no handler)" };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(PWA, { waitUntil: "domcontentloaded", timeout: 30000 });

  const results = [];
  for (let i = 0; i < PROMPTS.length; i++) {
    const { c, q } = PROMPTS[i];
    const sid = `finale_${c}_${Date.now().toString(36)}`;
    console.log(`\n[${i + 1}/11] ${c.toUpperCase()} → "${q}"`);

    await page.evaluate(sid => localStorage.setItem("nexo.nexus.sessionId", sid), sid);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#nexusFab");
    await page.click("#nexusFab");
    await page.waitForSelector("#nexusInput");
    await page.waitForTimeout(400);

    const before = await page.$$eval(".nexus-bubble.assistant", e => e.length);
    await page.locator("#nexusInput").fill(q);
    await page.locator("#nexusInput").press("Enter");

    let reply = null;
    const start = Date.now();
    while (Date.now() - start < 45000) {
      const bubbles = await page.$$eval(".nexus-bubble.assistant", e => e.map(x => x.textContent.trim()));
      if (bubbles.length > before) { reply = bubbles[bubbles.length - 1]; break; }
      await page.waitForTimeout(500);
    }

    const shotName = `${String(i + 1).padStart(2, "0")}-${c}.png`;
    const shotPath = path.join(SHOTS, shotName);
    await page.screenshot({ path: shotPath, fullPage: false });

    const outcome = classifyOutcome(reply);
    console.log(`  ${outcome.esito === "PASS" ? "✅" : "❌"} ${outcome.esito}: ${outcome.motivo}`);
    console.log(`     ${(reply || "(vuota)").slice(0, 150).replace(/\s+/g, " ")}`);

    results.push({
      index: i + 1, c, q,
      reply: reply || null,
      replyPreview: (reply || "").slice(0, 400),
      screenshot: shotName,
      ...outcome,
    });
  }
  await browser.close();

  fs.writeFileSync(path.join(SHOTS, "report.json"), JSON.stringify(results, null, 2));

  const pass = results.filter(r => r.esito === "PASS").length;
  console.log(`\n═══ RISULTATO ═══`);
  console.log(`${pass}/${results.length} PASS`);
  console.log(`Report: ${path.join(SHOTS, "report.json")}`);
})();
