// Verifica post-deploy:
// 1) il bottone è wired anche senza auth (wireWhenReady)
// 2) clic apre il modal anche con CURRENT_USER null (logica spostata al submit)
// 3) submit fallisce con messaggio "Devi essere autenticato"
import { chromium } from 'playwright';

const PWA = "https://nexo-hub-15f2d.web.app";
const SCREENSHOT_DIR = "/tmp/nexus-bug-test";

const consoleMessages = [];
const pageErrors = [];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
page.on("console", msg => consoleMessages.push(`[${msg.type()}] ${msg.text()}`));
page.on("pageerror", err => pageErrors.push(String(err && err.stack || err)));

console.log("→ Apro PWA");
await page.goto(PWA, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);

console.log("→ Reveal app (bypass auth)");
await page.evaluate(() => {
  document.getElementById("authGate")?.setAttribute("hidden", "");
  document.getElementById("appRoot")?.removeAttribute("hidden");
  document.getElementById("nexusPanel")?.classList.add("open");
});
await page.waitForTimeout(500);

const wiringState = await page.evaluate(() => {
  const btn = document.getElementById("nexusBugBtn");
  return {
    exists: !!btn,
    wired: btn ? !!btn._nexusBugWired : null,
    visible: btn ? getComputedStyle(btn).display !== "none" : false,
  };
});
console.log("Wiring state:", JSON.stringify(wiringState));

console.log("→ Click sul bottone 🐛");
await page.click("#nexusBugBtn", { force: true });
await page.waitForTimeout(700);

const modalState = await page.evaluate(() => {
  const m = document.getElementById("nexusBugModal");
  const cs = m ? getComputedStyle(m) : null;
  return {
    aria: m ? m.getAttribute("aria-hidden") : null,
    display: cs?.display,
    zIndex: cs?.zIndex,
  };
});
console.log("Modal state after click:", JSON.stringify(modalState));
await page.screenshot({ path: `${SCREENSHOT_DIR}/01-after-click.png`, fullPage: true });

// Test 2: scrivo nota e clicco invia (deve fallire perché non auth)
console.log("→ Compilo textarea + click Invia");
await page.fill("#nexusBugNote", "test bug — pulsante non funzionava");
await page.click("#nexusBugSubmit");
await page.waitForTimeout(1500);
const submitErr = await page.textContent("#nexusBugError").catch(() => null);
console.log("Submit error msg:", submitErr);
await page.screenshot({ path: `${SCREENSHOT_DIR}/02-after-submit.png`, fullPage: true });

console.log("\n=== CONSOLE (rilevanti) ===");
for (const m of consoleMessages) {
  if (/nexus-bug|bug|error/i.test(m)) console.log(m);
}
console.log("\n=== PAGE ERRORS ===");
for (const e of pageErrors) console.log(e);

const verdict =
  wiringState.wired === true &&
  modalState.aria === "false" &&
  modalState.display === "flex" &&
  parseInt(modalState.zIndex || "0", 10) >= 250;

console.log(`\n=== VERDICT === ${verdict ? "PASS — bottone wired, modal apre con z-index 250+" : "FAIL"}`);
await browser.close();
process.exit(verdict ? 0 : 1);
