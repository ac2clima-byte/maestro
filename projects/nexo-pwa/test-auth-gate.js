#!/usr/bin/env node
// test-auth-gate.js — verifica che PWA NEXO mostri login se non autenticato
import { chromium } from "/home/albertocontardi/node_modules/playwright/index.mjs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "test-screenshots", "auth");
const URL = "https://nexo-hub-15f2d.web.app/";
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  console.log("→ Apro PWA senza login (clear storage)…");
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  // Clear storage per simulare utente mai loggato
  await page.evaluate(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
      indexedDB.databases().then(dbs => dbs.forEach(d => indexedDB.deleteDatabase(d.name)));
    } catch {}
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);

  // Cattura stato
  const state = await page.evaluate(() => {
    const gate = document.querySelector("#authGate");
    const app = document.querySelector("#appRoot");
    const hasForm = !!document.querySelector("#authForm");
    const gateVisible = gate && !gate.hasAttribute("hidden");
    const appVisible = app && !app.hasAttribute("hidden");
    const emailLabel = document.querySelector('label[for], .auth-card label')?.innerText || "";
    const btn = document.querySelector("#authBtn")?.innerText || "";
    return { gateVisible, appVisible, hasForm, emailLabel, btn, title: document.title };
  });
  console.log("Stato iniziale:", JSON.stringify(state, null, 2));

  const screenshot1 = path.join(OUT, "gate-logged-out.png");
  await page.screenshot({ path: screenshot1, fullPage: false });
  console.log("📸", screenshot1);

  // Verifica CTA login funzionale — compila con credenziali fake per vedere errore
  console.log("\n→ Provo credenziali fake…");
  await page.fill("#authEmail", "test@invalid.test");
  await page.fill("#authPassword", "invalid");
  await page.click("#authBtn");
  await page.waitForTimeout(3500);
  const errText = await page.evaluate(() => document.querySelector("#authError")?.innerText || "");
  console.log("Errore atteso (credenziali fake):", errText);

  const screenshot2 = path.join(OUT, "gate-invalid-login.png");
  await page.screenshot({ path: screenshot2, fullPage: false });
  console.log("📸", screenshot2);

  // Test apertura con authToken fake
  console.log("\n→ Apro con authToken=fake…");
  await page.goto(URL + "?authToken=fake-bogus-token", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);
  const state3 = await page.evaluate(() => {
    return {
      gateVisible: !document.querySelector("#authGate").hasAttribute("hidden"),
      err: document.querySelector("#authError")?.innerText || "",
      urlAfter: location.href,
    };
  });
  console.log("Con token fake:", JSON.stringify(state3, null, 2));

  const screenshot3 = path.join(OUT, "gate-fake-sso.png");
  await page.screenshot({ path: screenshot3, fullPage: false });
  console.log("📸", screenshot3);

  // Scrivi summary
  fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify({
    logged_out: state, after_invalid_login: { errorText: errText }, fake_sso: state3,
  }, null, 2));

  await browser.close();
  console.log("\n✅ Test completato. Output in", OUT);
})().catch(e => {
  console.error("❌ Test fallito:", e);
  process.exit(1);
});
