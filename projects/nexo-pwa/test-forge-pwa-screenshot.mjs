// test-forge-pwa-screenshot.mjs — apre la PWA, forza la sessione "forge-test"
// in localStorage, apre il pannello NEXUS e screenshotta i messaggi visibili.
// Senza login: simuliamo post-auth rimuovendo hidden e attivando lo stato.
import { chromium } from "/home/albertocontardi/node_modules/playwright/index.mjs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "test-screenshots", "forge-pwa");
const URL = "https://nexo-hub-15f2d.web.app/";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

// Setta la sessione PRIMA che app.js parta
await page.addInitScript(() => {
  try { localStorage.setItem("nexo.nexus.sessionId", "forge-test"); } catch {}
});

console.log("→ Apro PWA con sessione forge-test pre-impostata…");
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
await page.waitForTimeout(3500);

// Senza credenziali siamo bloccati al gate. Forziamo lo stato post-auth
// per visualizzare la chat: l'app caricherà i messaggi via Firestore read
// pubblico (rules: read=true su nexus_chat).
console.log("→ Forzo stato post-auth (gate via, appRoot visibile)…");
await page.evaluate(() => {
  document.querySelector("#authGate")?.setAttribute("hidden", "");
  document.querySelector("#appRoot")?.removeAttribute("hidden");
  document.querySelector("#reportBugBtn")?.removeAttribute("hidden");
});
await page.waitForTimeout(800);

console.log("→ Apro pannello NEXUS…");
const opened = await page.evaluate(() => {
  const fab = document.querySelector("#nexusFab");
  const panel = document.querySelector("#nexusPanel");
  if (fab) fab.click();
  return { fabPresent: !!fab, panelPresent: !!panel };
});
console.log("  ", opened);
await page.waitForTimeout(1500);

// Verifica che il pannello sia aperto e prova ad espanderlo a fullscreen
await page.evaluate(() => {
  const panel = document.querySelector("#nexusPanel");
  if (panel) panel.classList.add("open");
  const fs = document.querySelector("#nexusFullscreenBtn");
  if (fs) fs.click();
});
await page.waitForTimeout(2000);

// Screenshot del pannello aperto
const shot1 = path.join(OUT, "01-nexus-panel-forge-test.png");
await page.screenshot({ path: shot1, fullPage: false });
console.log("📸", shot1);

// Conta i bubble nel pannello
const stats = await page.evaluate(() => {
  const messages = document.querySelectorAll("#nexusMessages .nexus-msg, #nexusMessages [data-role]");
  const all = Array.from(document.querySelectorAll("#nexusMessages > *")).filter(el => el.id !== "nexusScrollDown");
  const text = (document.querySelector("#nexusMessages")?.innerText || "").slice(0, 600);
  return {
    msgCount: messages.length,
    childCount: all.length,
    sessionId: localStorage.getItem("nexo.nexus.sessionId"),
    panelOpen: document.querySelector("#nexusPanel")?.classList.contains("open"),
    preview: text,
  };
});
console.log("  pannello:", JSON.stringify(stats, null, 2).slice(0, 400));

// Scroll giù e nuovo screenshot
await page.evaluate(() => {
  const m = document.querySelector("#nexusMessages");
  if (m) m.scrollTop = m.scrollHeight;
});
await page.waitForTimeout(500);
const shot2 = path.join(OUT, "02-nexus-bottom.png");
await page.screenshot({ path: shot2, fullPage: false });
console.log("📸", shot2);

// Scroll su a vedere primi messaggi
await page.evaluate(() => {
  const m = document.querySelector("#nexusMessages");
  if (m) m.scrollTop = 0;
});
await page.waitForTimeout(500);
const shot3 = path.join(OUT, "03-nexus-top.png");
await page.screenshot({ path: shot3, fullPage: false });
console.log("📸", shot3);

fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(stats, null, 2));
await browser.close();
console.log("✅ done");
