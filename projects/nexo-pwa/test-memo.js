#!/usr/bin/env node
/**
 * test-memo.js — verifica che NEXUS risponda alla query MEMO
 * "dimmi tutto su Kristal" sulla PWA in produzione, salva screenshot,
 * legge la risposta dal DOM.
 */
import { chromium } from "/home/albertocontardi/node_modules/playwright/index.mjs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = path.join(__dirname, "test-screenshots");
const PWA_URL = "https://nexo-hub-15f2d.web.app";
const SESSION_ID = "memo_test_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const PROMPT = "dimmi tutto sul condominio Kristal";

function log(...a) {
  console.log(new Date().toISOString().slice(11, 19), ...a);
}

(async () => {
  log(`PWA: ${PWA_URL}`);
  log(`Session ID di test: ${SESSION_ID}`);
  log(`Prompt: "${PROMPT}"`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    storageState: {
      cookies: [],
      origins: [{
        origin: PWA_URL,
        localStorage: [{ name: "nexo.nexus.sessionId", value: SESSION_ID }],
      }],
    },
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => log("pageerror:", e.message));

  await page.goto(PWA_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("#nexusFab", { timeout: 10000 });
  await page.click("#nexusFab");
  await page.waitForSelector("#nexusPanel.open", { timeout: 5000 });
  await page.waitForSelector("#nexusInput", { timeout: 5000 });

  const before = await page.$$eval(".nexus-bubble.assistant", (els) => els.length);
  await page.locator("#nexusInput").fill(PROMPT);
  await page.locator("#nexusInput").press("Enter");
  log("inviato, aspetto fino a 20s…");

  let reply = null;
  const start = Date.now();
  while (Date.now() - start < 20000) {
    const bubbles = await page.$$eval(".nexus-bubble.assistant", (els) =>
      els.map((e) => e.textContent.trim()),
    );
    if (bubbles.length > before) {
      reply = bubbles[bubbles.length - 1];
      break;
    }
    await page.waitForTimeout(500);
  }

  await page.waitForTimeout(800);
  const shotPath = path.join(SCREENSHOT_DIR, "memo-dimmi-tutto-kristal.png");
  await page.screenshot({ path: shotPath, fullPage: false });
  log(`📸 ${shotPath}`);

  if (!reply) {
    log("❌ NESSUNA RISPOSTA entro 20s");
    process.exit(1);
  }

  console.log("\n────────── RISPOSTA NEXUS ──────────");
  console.log(reply);
  console.log("─────────────────────────────────────\n");

  await context.close();
  await browser.close();

  const looksGood = /memo|dossier|email|kristal|cliente|condominio/i.test(reply);
  console.log(looksGood ? "✅ TEST PASSED (risposta coerente con MEMO)" : "⚠️ Risposta ricevuta ma non sembra MEMO");
  process.exit(looksGood ? 0 : 1);
})();
