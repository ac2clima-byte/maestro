#!/usr/bin/env node
/** test-ares.js — verifica NEXUS chat su query ARES. */
import { chromium } from "/home/albertocontardi/node_modules/playwright/index.mjs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = path.join(__dirname, "test-screenshots");
const PWA_URL = "https://nexo-hub-15f2d.web.app";
const SESSION_ID = "ares_test_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const PROMPT = "interventi aperti";

(async () => {
  console.log(`PWA: ${PWA_URL}\nSession: ${SESSION_ID}\nPrompt: "${PROMPT}"`);
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    storageState: { cookies: [], origins: [{
      origin: PWA_URL,
      localStorage: [{ name: "nexo.nexus.sessionId", value: SESSION_ID }],
    }] },
  });
  const page = await ctx.newPage();
  await page.goto(PWA_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("#nexusFab");
  await page.click("#nexusFab");
  await page.waitForSelector("#nexusInput");
  const before = await page.$$eval(".nexus-bubble.assistant", (els) => els.length);
  await page.locator("#nexusInput").fill(PROMPT);
  await page.locator("#nexusInput").press("Enter");

  let reply = null;
  const start = Date.now();
  while (Date.now() - start < 20000) {
    const bubbles = await page.$$eval(".nexus-bubble.assistant", (els) => els.map(e => e.textContent.trim()));
    if (bubbles.length > before) { reply = bubbles[bubbles.length - 1]; break; }
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(800);
  const shotPath = path.join(SCREENSHOT_DIR, "ares-interventi-aperti.png");
  await page.screenshot({ path: shotPath });
  console.log(`📸 ${shotPath}`);
  console.log("\n──── RISPOSTA NEXUS ────");
  console.log(reply || "(nessuna)");
  console.log("─────────────────────────");
  await ctx.close();
  await browser.close();
  process.exit(reply ? 0 : 1);
})();
