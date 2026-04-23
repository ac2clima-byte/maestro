#!/usr/bin/env node
// test-chronos-campagne.js — screenshot pagina CHRONOS campagne PWA.
import { chromium } from "/home/albertocontardi/node_modules/playwright/index.mjs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "test-screenshots", "chronos-campagne");
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  const page = await ctx.newPage();

  console.log("→ CHRONOS page…");
  await page.goto("https://nexo-hub-15f2d.web.app/#collega:chronos", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(4000);
  const s1 = path.join(OUT, "01-chronos-gate.png");
  await page.screenshot({ path: s1, fullPage: false });
  console.log("📸", s1);

  // Verifica che la pagina esista (dopo il gate login reale si vedrebbe il contenuto)
  const hasChronosElements = await page.evaluate(() => {
    return {
      gate: !document.querySelector("#authGate")?.hasAttribute("hidden"),
      hasChronosCampagne: !!document.querySelector("#chronosCampagne"),
      hasChronosRefresh: !!document.querySelector("#chronosRefresh"),
    };
  });
  console.log("Stato DOM:", hasChronosElements);

  await browser.close();
  console.log("\n✅ Screenshot in", OUT);
})().catch(e => { console.error("Fatal:", e); process.exit(1); });
