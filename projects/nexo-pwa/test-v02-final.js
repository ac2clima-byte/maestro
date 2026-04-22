#!/usr/bin/env node
// test-v02-final.js — screenshot PWA dopo refactor (caso rappresentativo: gate login).
import { chromium } from "/home/albertocontardi/node_modules/playwright/index.mjs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "test-screenshots", "v02-final");
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();

  console.log("→ Apro PWA NEXO v0.2…");
  await page.goto("https://nexo-hub-15f2d.web.app/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(3500);

  const gateShown = await page.evaluate(() => {
    const gate = document.querySelector("#authGate");
    return gate && !gate.hasAttribute("hidden");
  });
  console.log("Gate auth visibile:", gateShown ? "✅" : "❌");

  const s1 = path.join(OUT, "01-gate-auth.png");
  await page.screenshot({ path: s1, fullPage: false });
  console.log("📸", s1);

  // Modifichiamo il DOM per bypass gate (solo visualizzazione UI, no dati reali)
  console.log("\n→ Bypass gate per screenshot UI dashboard…");
  await page.evaluate(() => {
    document.querySelector("#authGate")?.setAttribute("hidden", "");
    document.querySelector("#appRoot")?.removeAttribute("hidden");
    if (window._nexoInited) return;
    window._nexoInited = true;
    if (typeof init === "function") init();
  });
  await page.waitForTimeout(2000);
  const s2 = path.join(OUT, "02-home-dashboard.png");
  await page.screenshot({ path: s2, fullPage: false });
  console.log("📸", s2);

  // PHARO page (usa endpoint protetto: mostrerà banner errore ma UI renderizza)
  console.log("\n→ PHARO page…");
  await page.goto("https://nexo-hub-15f2d.web.app/#collega:pharo", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  await page.evaluate(() => {
    document.querySelector("#authGate")?.setAttribute("hidden", "");
    document.querySelector("#appRoot")?.removeAttribute("hidden");
  });
  await page.waitForTimeout(2000);
  const s3 = path.join(OUT, "03-pharo-page.png");
  await page.screenshot({ path: s3, fullPage: false });
  console.log("📸", s3);

  // ARES page
  console.log("\n→ ARES page…");
  await page.goto("https://nexo-hub-15f2d.web.app/#collega:ares", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    document.querySelector("#authGate")?.setAttribute("hidden", "");
    document.querySelector("#appRoot")?.removeAttribute("hidden");
  });
  await page.waitForTimeout(2000);
  const s4 = path.join(OUT, "04-ares-page.png");
  await page.screenshot({ path: s4, fullPage: false });
  console.log("📸", s4);

  await browser.close();
  console.log("\n✅ Screenshot in", OUT);
})().catch(e => { console.error("Fatal:", e); process.exit(1); });
