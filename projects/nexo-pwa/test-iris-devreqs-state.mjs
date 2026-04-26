// Verifica stato dev-requests nella PWA IRIS:
// - 3 doc reali su Firestore con status pending/in_progress/completed
// - Apri la pagina Dev Requests, controlla i counter e le label
import { chromium } from "/home/albertocontardi/node_modules/playwright/index.mjs";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "test-screenshots", "iris-devreqs-state");
const URL = "https://nexo-hub-15f2d.web.app/iris/";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", e => errors.push(String(e)));
page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });

console.log("→ Apro PWA IRIS…");
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
await page.waitForTimeout(3500);

// Click sul bottone "Dev Requests" in topbar
console.log("→ Click su Dev Requests…");
const requestsBtn = await page.$("#requestsBtn");
if (!requestsBtn) {
  console.log("FAIL: bottone Dev Requests non trovato");
  process.exit(1);
}
await requestsBtn.click();
await page.waitForTimeout(2500);

// Leggi i counter
const state = await page.evaluate(() => ({
  rcAll: document.querySelector("#rcAll")?.textContent,
  rcPending: document.querySelector("#rcPending")?.textContent,
  rcProgress: document.querySelector("#rcProgress")?.textContent,
  rcCompleted: document.querySelector("#rcCompleted")?.textContent,
  visibleStatuses: Array.from(document.querySelectorAll(".request-status")).map(el => ({
    text: el.textContent.trim(),
    cls: el.className,
  })),
  itemCount: document.querySelectorAll(".request-item").length,
}));
console.log("State:", JSON.stringify(state, null, 2));

await page.screenshot({ path: path.join(OUT, "01-all-requests.png"), fullPage: true });

// Click tab "Completate"
const completedTab = await page.$('[data-rstatus="completed"]');
if (completedTab) {
  await completedTab.click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, "02-completed.png"), fullPage: true });
}

// Click tab "In corso"
const progressTab = await page.$('[data-rstatus="in_progress"]');
if (progressTab) {
  await progressTab.click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, "03-in-progress.png"), fullPage: true });
}

console.log("Errors:", errors.slice(0, 5));
fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify({ state, errors: errors.slice(0, 10) }, null, 2));
await browser.close();
console.log("OK");
