#!/usr/bin/env node
/** test-echo-wa.js — verifica handler WhatsApp in NEXUS. */
import { chromium } from "/home/albertocontardi/node_modules/playwright/index.mjs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(__dirname, "test-screenshots", "echo-wa");
fs.mkdirSync(SHOTS, { recursive: true });
const PWA = "https://nexo-hub-15f2d.web.app";

const PROMPTS = [
  "manda whatsapp a Alberto: NEXO è operativo",
  "invia un whatsapp a Alberto con testo: test ECHO reale",
  "manda whatsapp a 3339999999: ciao", // dovrebbe essere rifiutato (non in whitelist)
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(PWA, { waitUntil: "domcontentloaded" });

  const results = [];
  for (let i = 0; i < PROMPTS.length; i++) {
    const prompt = PROMPTS[i];
    const sid = `wa_test_${i}_${Date.now().toString(36)}`;
    console.log(`\n→ [${i+1}] "${prompt}"`);
    await page.evaluate(sid => localStorage.setItem("nexo.nexus.sessionId", sid), sid);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#nexusFab");
    await page.click("#nexusFab");
    await page.waitForSelector("#nexusInput");
    await page.waitForTimeout(400);

    const before = await page.$$eval(".nexus-bubble.assistant", e => e.length);
    await page.locator("#nexusInput").fill(prompt);
    await page.locator("#nexusInput").press("Enter");

    let reply = null;
    const start = Date.now();
    while (Date.now() - start < 45000) {
      const bubbles = await page.$$eval(".nexus-bubble.assistant", e => e.map(x => x.textContent.trim()));
      if (bubbles.length > before) { reply = bubbles[bubbles.length - 1]; break; }
      await page.waitForTimeout(500);
    }

    const shot = path.join(SHOTS, `wa-${i+1}.png`);
    await page.screenshot({ path: shot, fullPage: false });
    console.log(`  reply: ${reply ? reply.slice(0, 200).replace(/\n/g, " ") : "(vuota)"}`);
    results.push({ prompt, reply: reply?.slice(0, 500), screenshot: shot });
  }
  await browser.close();

  fs.writeFileSync(path.join(SHOTS, "report.json"), JSON.stringify(results, null, 2));

  console.log("\n═══ SUMMARY ═══");
  for (const r of results) {
    const isReal = /inviato|WhatsApp.*simulato|DRY_RUN|whitelist|non autorizzato|rifiuto/i.test(r.reply || "");
    const isCollegaInactive = /non ancora attivo/i.test(r.reply || "");
    const ok = isReal && !isCollegaInactive;
    console.log(`${ok ? "✅" : isCollegaInactive ? "❌ FALLBACK" : "⚠️"} ${r.prompt.slice(0, 50)}`);
    console.log(`    → ${(r.reply || "").slice(0, 150).replace(/\n/g, " ")}`);
  }
})();
