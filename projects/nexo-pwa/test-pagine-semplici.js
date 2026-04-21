#!/usr/bin/env node
import { chromium } from "/home/albertocontardi/node_modules/playwright/index.mjs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(__dirname, "test-screenshots", "pagine-semplici");
fs.mkdirSync(SHOTS, { recursive: true });
const PWA = "https://nexo-hub-15f2d.web.app";

const IDS = ["ares","chronos","memo","charta","echo","emporion","dikea","delphi","pharo","calliope"];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
  const results = [];

  for (const id of IDS) {
    await page.goto(`${PWA}/#collega:${id}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".collega-page", { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(500);

    const badge = await page.$eval(".collega-header .badge", el => el.className + "|" + el.textContent.trim()).catch(() => "MISSING");
    const btn = await page.$eval("#openNexusBtn", el => el.textContent.trim()).catch(() => "MISSING");
    const hasWip = await page.$(".collega-wip").then(el => !!el);
    const shot = path.join(SHOTS, `${id}.png`);
    await page.screenshot({ path: shot, fullPage: true });

    const ok = !hasWip && btn.includes("via NEXUS") && !badge.includes("MISSING");
    console.log(`${ok ? "✅" : "❌"} ${id.padEnd(10)} badge=[${badge.slice(0, 40)}]  btn=[${btn.slice(0, 60)}]  wip=${hasWip}`);
    results.push({ id, badge, btn, hasWip, ok });
  }

  await browser.close();
  fs.writeFileSync(path.join(SHOTS, "report.json"), JSON.stringify(results, null, 2));
})();
