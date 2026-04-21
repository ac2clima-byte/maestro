#!/usr/bin/env node
/** test-pagine-colleghi.js — naviga a ogni pagina Collega e verifica dati reali. */
import { chromium } from "/home/albertocontardi/node_modules/playwright/index.mjs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = path.join(__dirname, "test-screenshots", "pagine");
const PWA_URL = "https://nexo-hub-15f2d.web.app";
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const PAGES = [
  { id: "ares",     wait: "#aresInterventi" },
  { id: "chronos",  wait: "#chrScadenze" },
  { id: "memo",     wait: "#memoQuery" },
  { id: "charta",   wait: "#chartaFatt" },
  { id: "echo",     wait: "#echoMsgs" },
  { id: "emporion", wait: "#empSottoScorta" },
  { id: "dikea",    wait: "#dikeaCurit" },
  { id: "delphi",   wait: "#delKpi" },
  { id: "pharo",    wait: "#pharoStato" },
  { id: "calliope", wait: "#calBozze" },
];

function waitForContent(page, sel, maxMs = 35000) {
  return page.waitForFunction(
    (s) => {
      const el = document.querySelector(s);
      if (!el) return false;
      const t = el.textContent || "";
      return t.length > 10 && !/Caricamento|Cerco/.test(t);
    },
    sel,
    { timeout: maxMs, polling: 600 },
  );
}

async function testPage(page, { id, wait }) {
  const url = `${PWA_URL}/#collega:${id}`;
  console.log(`\n→ [${id}] ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(wait, { timeout: 15000 });

  // Per MEMO, non ha auto-load: verifico solo la presenza dell'input
  let content = "";
  if (id === "memo") {
    const present = await page.$$eval(".collega-search", els => els.length > 0);
    content = present ? "MEMO: input di ricerca presente." : "";
  } else {
    try {
      await waitForContent(page, wait);
      content = await page.$eval(wait, el => (el.textContent || "").trim());
    } catch {
      content = await page.$eval(wait, el => (el.textContent || "").trim()).catch(() => "");
    }
  }

  // Verifica pallino (classe status sull'header)
  const badgeOk = await page.$$eval(".collega-header .badge", els =>
    els.map(e => e.className + "|" + e.textContent).join("\n"),
  );

  // Verifica bottone NEXUS presente
  const nexusBtns = await page.$$eval("[data-nexus-prompt]", els => els.length);

  const shot = path.join(SCREENSHOT_DIR, `${id}.png`);
  await page.screenshot({ path: shot, fullPage: true });

  console.log(`  badge: ${badgeOk || "?"}`);
  console.log(`  bottoni NEXUS: ${nexusBtns}`);
  console.log(`  contenuto (primi 120): ${content.slice(0, 120).replace(/\s+/g, " ")}`);

  return {
    id,
    url,
    badge: badgeOk,
    nexusBtns,
    contentPreview: content.slice(0, 500),
    hasContent: content.length > 20,
    screenshot: shot,
  };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();

  const results = [];
  for (const p of PAGES) {
    try {
      const r = await testPage(page, p);
      results.push(r);
    } catch (e) {
      console.error(`  ERROR: ${e.message}`);
      results.push({ id: p.id, error: e.message });
    }
  }
  await browser.close();

  const reportPath = path.join(SCREENSHOT_DIR, "report.json");
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));

  console.log("\n═══ SUMMARY ═══");
  for (const r of results) {
    const ok = r.hasContent && r.nexusBtns > 0 && !r.error;
    console.log(`${ok ? "✅" : r.error ? "❌" : "⚠️ "} ${r.id.padEnd(10)} btn:${r.nexusBtns || 0}  ${(r.contentPreview || r.error || "").replace(/\s+/g, " ").slice(0, 90)}`);
  }
  console.log(`\nReport: ${reportPath}`);
})();
