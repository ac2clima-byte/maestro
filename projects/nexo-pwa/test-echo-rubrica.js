#!/usr/bin/env node
import { chromium } from "/home/albertocontardi/node_modules/playwright/index.mjs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(__dirname, "test-screenshots", "echo-rubrica");
fs.mkdirSync(SHOTS, { recursive: true });
const PWA = "https://nexo-hub-15f2d.web.app";

const PROMPTS = [
  { key: "malvicino-ambiguo",   q: "manda whatsapp a Malvicino: test" },
  { key: "andrea-malvicino",    q: "manda whatsapp a Andrea Malvicino: test" },
  { key: "dellafiore-ambiguo",  q: "manda whatsapp a Dellafiore: domani Kristal ore 14" },
  { key: "alberto-titolare",    q: "manda whatsapp a Alberto: test nexo" },
  { key: "sara-admin",          q: "manda whatsapp a Sara: test" },
  { key: "numero-grezzo",       q: "manda whatsapp a 3339999999: spam" },
  { key: "inesistente",         q: "manda whatsapp a Pluto Topolino: test" },
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(PWA, { waitUntil: "domcontentloaded" });

  const results = [];
  for (const p of PROMPTS) {
    const sid = `rubrica_${p.key}_${Date.now().toString(36)}`;
    console.log(`\n→ [${p.key}] "${p.q}"`);
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

    const shot = path.join(SHOTS, `${p.key}.png`);
    await page.screenshot({ path: shot, fullPage: false });
    console.log(`  reply: ${(reply || "(vuota)").slice(0, 250).replace(/\s+/g, " ")}`);
    results.push({ key: p.key, q: p.q, reply: reply?.slice(0, 800), screenshot: shot });
  }
  await browser.close();

  fs.writeFileSync(path.join(SHOTS, "report.json"), JSON.stringify(results, null, 2));

  console.log("\n═══ SUMMARY ═══");
  for (const r of results) {
    const isSimulated = /📤 Simulato: WA a \*\*/i.test(r.reply || "");
    const isAmbiguous = /Trovo \d+ contatti/i.test(r.reply || "");
    const isRefused = /rifiuta|non trovo|senza cellulare|senza numero/i.test(r.reply || "");
    const isFallback = /non ancora attivo/i.test(r.reply || "");
    const emoji = isFallback ? "❌ FALLBACK" : (isSimulated || isAmbiguous || isRefused) ? "✅" : "⚠️";
    console.log(`${emoji} ${r.key.padEnd(22)}`);
    console.log(`      "${r.q}"`);
    console.log(`      → ${(r.reply || "").slice(0, 200).replace(/\s+/g, " ")}`);
  }
})();
