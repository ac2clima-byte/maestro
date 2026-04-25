#!/usr/bin/env node
// Test E2E v0.3 stabilizzazione: verifica modularizzazione PWA + naturalizzazione NEXUS
import { chromium } from "/home/albertocontardi/node_modules/playwright/index.mjs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(__dirname, "test-screenshots", "v03-stabilizzazione");
fs.mkdirSync(SHOTS, { recursive: true });
const PWA = "https://nexo-hub-15f2d.web.app";

const EMAIL = "al227@live.com";
const PASSWORD = process.env.NEXO_TEST_PASSWORD || "";

const COLLEGHI = ["iris", "echo", "ares", "chronos", "memo", "charta", "emporion", "dikea", "delphi", "pharo", "calliope"];

const NEXUS_QUESTIONS = [
  "ciao",
  "quante email urgenti ho?",
  "dimmi tutto su Kristal",
  "fatture scadute totale",
  "stato della suite",
];

const robottimoRegex = /[*]{2}|^[-•·]\s|📧|📊|📋|🚨|🔔|✅\s+\w+|^\s*-\s+/m;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("pageerror", e => consoleErrors.push(`pageerror: ${e.message}`));
  page.on("console", m => { if (m.type() === "error") consoleErrors.push(`console.error: ${m.text()}`); });

  const report = { steps: [], colleghi: [], nexus: [], errors: [], moduleLoad: null, ts: new Date().toISOString() };

  // STEP 1: load + verify modules loaded
  console.log("\n═══ STEP 1: Caricamento PWA + moduli ═══");
  await page.goto(PWA, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1500);
  const cssLoaded = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
    return links.some(l => l.href.includes("/css/main.css"));
  });
  const jsLoaded = await page.evaluate(() => {
    const scripts = Array.from(document.querySelectorAll('script[type="module"]'));
    return scripts.some(s => s.src.includes("/js/app.js"));
  });
  const authGateVisible = await page.$eval("#authGate", el => !el.hidden).catch(() => false);
  report.moduleLoad = { cssLoaded, jsLoaded, authGateVisible };
  console.log(`  CSS modulare: ${cssLoaded ? "✅" : "❌"}`);
  console.log(`  JS modulare: ${jsLoaded ? "✅" : "❌"}`);
  console.log(`  Auth gate visibile: ${authGateVisible ? "✅" : "❌"}`);
  await page.screenshot({ path: path.join(SHOTS, "01-auth.png"), fullPage: true });

  // STEP 2: login (skip se mancano credenziali, segna warning)
  if (!PASSWORD) {
    console.log("\n⚠️ NEXO_TEST_PASSWORD non impostata, login skippato. Test E2E parziali.");
    report.steps.push({ step: "login", status: "skipped", reason: "no_password" });
  } else {
    console.log("\n═══ STEP 2: Login ═══");
    await page.fill("#authEmail", EMAIL);
    await page.fill("#authPassword", PASSWORD);
    await page.click("#authBtn");
    try {
      await page.waitForFunction(() => {
        const gate = document.getElementById("authGate");
        const root = document.getElementById("appRoot");
        return gate && gate.hidden && root && !root.hidden;
      }, { timeout: 30000 });
      console.log("  ✅ login ok");
      report.steps.push({ step: "login", status: "ok" });
    } catch (e) {
      const err = await page.$eval("#authError", el => el.textContent).catch(() => "?");
      console.log(`  ❌ login failed: ${err}`);
      report.steps.push({ step: "login", status: "failed", error: err });
    }
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SHOTS, "02-home.png"), fullPage: true });

    // STEP 3: navigazione Colleghi
    console.log("\n═══ STEP 3: Navigazione 11 Colleghi ═══");
    for (const id of COLLEGHI) {
      try {
        await page.goto(`${PWA}/#collega:${id}`, { waitUntil: "networkidle" });
        await page.waitForTimeout(800);
        const hasPage = await page.$(".collega-page, .collega-wip, .iris-frame");
        const ok = !!hasPage;
        await page.screenshot({ path: path.join(SHOTS, `collega-${id}.png`), fullPage: false });
        console.log(`  ${ok ? "✅" : "❌"} ${id}`);
        report.colleghi.push({ id, ok });
      } catch (e) {
        console.log(`  ❌ ${id}: ${e.message.slice(0, 80)}`);
        report.colleghi.push({ id, ok: false, error: e.message.slice(0, 200) });
      }
    }

    // STEP 4: chat NEXUS naturale
    console.log("\n═══ STEP 4: NEXUS chat (verifica linguaggio naturale) ═══");
    await page.goto(PWA, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.click("#nexusFab");
    await page.waitForTimeout(800);
    for (const q of NEXUS_QUESTIONS) {
      console.log(`\n  → "${q}"`);
      await page.fill("#nexusInput", q);
      await page.click("#nexusSendBtn");
      await page.waitForTimeout(8000); // attendi risposta
      const lastMsg = await page.evaluate(() => {
        const msgs = document.querySelectorAll(".nexus-msg");
        const last = msgs[msgs.length - 1];
        return last ? last.textContent.trim() : "";
      });
      const isRobotic = robottimoRegex.test(lastMsg);
      console.log(`    risposta: ${lastMsg.slice(0, 200)}`);
      console.log(`    naturale: ${isRobotic ? "❌ robotica" : "✅ naturale"}`);
      report.nexus.push({ q, response: lastMsg.slice(0, 500), natural: !isRobotic });
    }
    await page.screenshot({ path: path.join(SHOTS, "nexus-chat.png"), fullPage: true });
  }

  report.errors = consoleErrors.slice(0, 30);
  await browser.close();
  fs.writeFileSync(path.join(SHOTS, "report.json"), JSON.stringify(report, null, 2));
  console.log(`\n═══ Report salvato in ${SHOTS}/report.json ═══`);
})();
