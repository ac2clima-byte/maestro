#!/usr/bin/env node
/** test-echo-memo.js — verifica lookup contatti via MEMO/CRM. */
import { chromium } from "/home/albertocontardi/node_modules/playwright/index.mjs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(__dirname, "test-screenshots", "echo-memo");
fs.mkdirSync(SHOTS, { recursive: true });
const PWA = "https://nexo-hub-15f2d.web.app";

const PROMPTS = [
  // Tecnico esistente ma probabilmente senza telefono in tecnici_acg
  "manda whatsapp a Malvicino: domani intervento Kristal ore 14",
  // Alberto - il proprietario è in tecnici_acg, potrebbe non avere tel
  "manda whatsapp a Alberto: NEXO funziona",
  // Numero grezzo: deve essere rifiutato (non in CRM)
  "manda whatsapp a 3339999999: spam",
  // Nome che non esiste
  "manda whatsapp a Pluto Topolino: prova",
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(PWA, { waitUntil: "domcontentloaded" });

  const results = [];
  for (let i = 0; i < PROMPTS.length; i++) {
    const prompt = PROMPTS[i];
    const sid = `echo_memo_${i}_${Date.now().toString(36)}`;
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
    console.log(`  reply: ${(reply || "(vuota)").slice(0, 250).replace(/\n/g, " ")}`);
    results.push({ prompt, reply: reply?.slice(0, 800), screenshot: shot });
  }
  await browser.close();

  fs.writeFileSync(path.join(SHOTS, "report.json"), JSON.stringify(results, null, 2));

  console.log("\n═══ SUMMARY ═══");
  for (const r of results) {
    const isSimulated = /simulato|WA a \*\*/i.test(r.reply || "");
    const isRefused = /rifiuta|non.*trovo|senza numero|senza telefono/i.test(r.reply || "");
    const isFallback = /non ancora attivo|whitelist_vuota/i.test(r.reply || "");
    const emoji = isFallback ? "❌ FALLBACK" : (isSimulated || isRefused) ? "✅" : "⚠️";
    console.log(`${emoji} ${r.prompt.slice(0, 55)}`);
    console.log(`    → ${(r.reply || "").slice(0, 160).replace(/\n/g, " ")}`);
  }
})();
