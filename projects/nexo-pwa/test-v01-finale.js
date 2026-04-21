#!/usr/bin/env node
/** test-v01-finale.js — 11 Colleghi, una domanda ciascuno. */
import { chromium } from "/home/albertocontardi/node_modules/playwright/index.mjs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(__dirname, "test-screenshots", "v01-finale");
fs.mkdirSync(SHOTS, { recursive: true });
const PWA = "https://nexo-hub-15f2d.web.app";

const PROMPTS = [
  { c: "iris",     q: "quante email urgenti ho?" },
  { c: "echo",     q: "manda whatsapp a Alberto: NEXO v0.1 completo" },
  { c: "ares-read",  q: "interventi aperti oggi" },
  { c: "ares-write", q: "apri un intervento riparazione caldaia al Condominio Kristal urgente" },
  { c: "chronos",  q: "scadenze prossime" },
  { c: "memo",     q: "dimmi tutto su Kristal" },
  { c: "charta-read",  q: "report mensile" },
  { c: "charta-write", q: "registra incasso 500 euro da Condominio Kristal" },
  { c: "emporion", q: "c'è il pezzo codice 00001?" },
  { c: "dikea",    q: "scadenze CURIT" },
  { c: "delphi",   q: "come siamo andati questo mese rispetto al mese scorso?" },
  { c: "pharo",    q: "stato della suite" },
  { c: "calliope", q: "scrivi una bozza cordiale a Moraschi" },
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(PWA, { waitUntil: "domcontentloaded" });

  const results = [];
  for (const p of PROMPTS) {
    const sid = `v01_${p.c}_${Date.now().toString(36)}`;
    console.log(`\n→ [${p.c}] "${p.q}"`);
    await page.evaluate(sid => localStorage.setItem("nexo.nexus.sessionId", sid), sid);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#nexusFab");
    await page.click("#nexusFab");
    await page.waitForSelector("#nexusInput");
    await page.waitForTimeout(400);

    const before = await page.$$eval(".nexus-bubble.assistant", e => e.length);
    await page.locator("#nexusInput").fill(p.q);
    await page.locator("#nexusInput").press("Enter");

    let reply = null;
    const start = Date.now();
    while (Date.now() - start < 45000) {
      const bubbles = await page.$$eval(".nexus-bubble.assistant", e => e.map(x => x.textContent.trim()));
      if (bubbles.length > before) { reply = bubbles[bubbles.length - 1]; break; }
      await page.waitForTimeout(500);
    }

    const shot = path.join(SHOTS, `${p.c}.png`);
    await page.screenshot({ path: shot, fullPage: false });
    console.log(`  reply: ${(reply || "(vuota)").slice(0, 200).replace(/\s+/g, " ")}`);
    results.push({ c: p.c, q: p.q, reply: reply?.slice(0, 600), screenshot: shot });
  }
  await browser.close();

  fs.writeFileSync(path.join(SHOTS, "report.json"), JSON.stringify(results, null, 2));

  console.log("\n═══ REPORT v0.1 ═══");
  for (const r of results) {
    const fallback = /non ancora attivo/i.test(r.reply || "");
    const hasData = /\*\*|📤|✅|📅|📆|🔧|💰|📦|⚖️|📊|💳|⚠️|🚫|❓|📝/.test(r.reply || "");
    const emoji = fallback ? "❌" : hasData ? "✅" : "⚠️";
    console.log(`${emoji} ${r.c.padEnd(14)} ${(r.reply || "").slice(0, 100).replace(/\s+/g, " ")}`);
  }
})();
