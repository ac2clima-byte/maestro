#!/usr/bin/env node
// test-pharo-dashboard.js — verifica dashboard PHARO (4 sezioni + alert RTI).
import { chromium } from "/home/albertocontardi/node_modules/playwright/index.mjs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = path.join(__dirname, "test-screenshots", "pharo");
const PWA_URL = "https://nexo-hub-15f2d.web.app";
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  const page = await ctx.newPage();

  // Disable cache
  await ctx.route("**/*", (route) => {
    const h = { ...route.request().headers(), "Cache-Control": "no-cache" };
    route.continue({ headers: h });
  });

  console.log("→ Apro PWA…");
  await page.goto(PWA_URL + "/#collega:pharo", { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(6000); // lascia tempo di caricare i dati da pharoRtiDashboard

  // Aspetta che la dashboard PHARO sia renderizzata
  try {
    await page.waitForSelector("#pharoKpi", { timeout: 20000 });
    await page.waitForSelector("#pharoRtiTable", { timeout: 20000 });
    await page.waitForSelector("#pharoRulesBody", { timeout: 10000 });
    await page.waitForTimeout(4000); // lascia che fetch si completi
  } catch (e) {
    console.error("❌ PHARO dashboard non renderizzata:", e.message);
  }

  const full = path.join(SCREENSHOT_DIR, "pharo-dashboard-full.png");
  await page.screenshot({ path: full, fullPage: true });
  console.log("📸", full);

  const viewport = path.join(SCREENSHOT_DIR, "pharo-dashboard-viewport.png");
  await page.screenshot({ path: viewport, fullPage: false });
  console.log("📸", viewport);

  // Analisi testuale: estrae tutti i contenuti principali
  const analisi = await page.evaluate(() => {
    const get = (sel) => document.querySelector(sel)?.innerText || "(assente)";
    const h2 = document.querySelector(".collega-header h2")?.innerText || "";
    const banner = document.querySelector("#pharoBanner")?.innerText || "(nessun banner)";
    const kpi = document.querySelector("#pharoKpi")?.innerText || "";
    const alerts = document.querySelector("#pharoAlertsBody")?.innerText || "";
    const summary = document.querySelector("#pharoRtiSummary")?.innerText || "";
    const rules = document.querySelector("#pharoRulesBody")?.innerText || "";
    const stats = document.querySelector("#pharoTecnici")?.innerText || "";
    const tempo = document.querySelector("#pharoTempoMedio")?.innerText || "";
    const rtiRows = document.querySelectorAll("#pharoRtiTable tr").length;
    const chartBars = document.querySelectorAll("#pharoChart .pharo-bar").length;
    const kpiCards = document.querySelectorAll("#pharoKpi .pharo-kpi").length;
    const alertRows = document.querySelectorAll("#pharoAlertsBody .pharo-alert-row").length;
    const ruleRows = document.querySelectorAll("#pharoRulesBody .pharo-rule-row").length;
    return {
      titolo: h2, banner, kpi, alerts, summary, rules, stats, tempo,
      counts: { rtiRows, chartBars, kpiCards, alertRows, ruleRows },
    };
  });

  console.log("\n=== ANALISI PAGINA PHARO ===");
  console.log("Titolo:", analisi.titolo);
  console.log("\nBanner:\n", analisi.banner);
  console.log("\n--- KPI ---\n", analisi.kpi);
  console.log("\n--- ALERT ATTIVI ---\n", analisi.alerts);
  console.log("\n--- SUMMARY RTI ---\n", analisi.summary);
  console.log("\n--- REGOLE ---\n", analisi.rules);
  console.log("\n--- STATS (tempo medio) ---\n", analisi.tempo);
  console.log("\n--- TOP TECNICI ---\n", analisi.stats);
  console.log("\n--- COUNTS ---", JSON.stringify(analisi.counts));

  // Scrivi report JSON
  fs.writeFileSync(
    path.join(SCREENSHOT_DIR, "analisi.json"),
    JSON.stringify(analisi, null, 2)
  );

  await browser.close();
  console.log("\n✅ Test completo. Screenshot in", SCREENSHOT_DIR);
})().catch((e) => {
  console.error("❌ Test fallito:", e);
  process.exit(1);
});
