#!/usr/bin/env node
// test-memo-dossier.js — testa MEMO dossier su La Bussola, Kristal, Malvicino
import { chromium } from "/home/albertocontardi/node_modules/playwright/index.mjs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = path.join(__dirname, "test-screenshots", "memo");
const PWA_URL = "https://nexo-hub-15f2d.web.app";
const NEXUS_URL = "https://europe-west1-nexo-hub-15f2d.cloudfunctions.net/nexusRouter";
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

// Test diretto via API nexusRouter — più veloce e meno fragile del chat UI
async function testViaAPI() {
  const queries = [
    "dimmi tutto su La Bussola",
    "dimmi tutto su Kristal",
    "dimmi tutto su Malvicino",
  ];

  const results = [];
  for (const userMessage of queries) {
    const sessionId = `test-memo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    console.log(`\n→ Query: "${userMessage}"`);
    try {
      const resp = await fetch(NEXUS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage, sessionId, userId: "test-memo" }),
      });
      const data = await resp.json();
      const content = data.assistant?.content || data.content || JSON.stringify(data).slice(0, 200);
      console.log("← Risposta (primi 600 char):");
      console.log(String(content).slice(0, 600));
      console.log("   ...");
      results.push({ query: userMessage, ok: resp.ok, response: content, raw: data });
    } catch (e) {
      console.log("❌ Errore:", e.message);
      results.push({ query: userMessage, ok: false, error: String(e) });
    }
  }
  return results;
}

// Test chat UI via Playwright per screenshot
async function testViaPlaywright(query, filename) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  const page = await ctx.newPage();

  try {
    await page.goto(PWA_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000);

    // Apri chat NEXUS tramite FAB
    await page.click(".nexus-fab");
    await page.waitForTimeout(800);

    // Scrivi + invia
    const input = await page.$("#nexusInput");
    if (!input) throw new Error("Input chat non trovato");
    await input.fill(query);
    await page.keyboard.press("Enter");

    // Aspetta risposta
    await page.waitForTimeout(12000);

    const out = path.join(SCREENSHOT_DIR, filename);
    await page.screenshot({ path: out, fullPage: false });
    console.log("📸", out);

    const txt = await page.evaluate(() => document.body.innerText.slice(-2000));
    return { screenshot: out, bodyTail: txt };
  } catch (e) {
    console.log("⚠️ Playwright:", e.message);
    return { error: e.message };
  } finally {
    await browser.close();
  }
}

(async () => {
  console.log("=== TEST 1: via API diretta ===");
  const apiResults = await testViaAPI();

  console.log("\n\n=== TEST 2: via Playwright (screenshot) ===");
  const kristal = await testViaPlaywright("dimmi tutto su Kristal", "memo-kristal.png");

  // Salva report
  fs.writeFileSync(
    path.join(SCREENSHOT_DIR, "results.json"),
    JSON.stringify({ apiResults, kristal }, null, 2)
  );
  console.log("\n✅ Report:", path.join(SCREENSHOT_DIR, "results.json"));
})().catch(e => {
  console.error("❌ Test fallito:", e);
  process.exit(1);
});
