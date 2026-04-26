// Test fix dettatura vocale.
// Caso A: Chromium supporta SpeechRecognition (webkitSpeechRecognition) →
//   bottone visibile, click chiama preflight (mocked), pulse animation.
// Caso B: window.SpeechRecognition forzato a undefined →
//   bottone visibile in stato disabled, click mostra messaggio "Usa Chrome o Edge".
import { chromium } from 'playwright';

const PWA = "https://nexo-hub-15f2d.web.app";
const SCREENSHOT_DIR = "/tmp/nexus-bug-test";

const browser = await chromium.launch({ headless: true });
let testsPassed = 0, testsTotal = 0;

async function caseA() {
  testsTotal++;
  console.log("\n=== Caso A: SR supportato (Chromium webkitSpeechRecognition) ===");
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on("console", m => console.log("  cb:", m.type(), m.text().slice(0,200)));

  await page.goto(PWA, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  // Bypass auth + apri pannello
  await page.evaluate(() => {
    document.getElementById("authGate")?.setAttribute("hidden", "");
    document.getElementById("appRoot")?.removeAttribute("hidden");
    document.getElementById("nexusPanel")?.classList.add("open");
  });
  await page.waitForTimeout(500);

  const state = await page.evaluate(() => {
    const mic = document.getElementById("nexusMicBtn");
    return {
      micExists: !!mic,
      micHidden: mic ? mic.hidden : null,
      micVisible: mic ? getComputedStyle(mic).display !== "none" : false,
      micWired: mic ? !!mic._nexusMicWired : false,
      micClasses: mic ? mic.className : null,
      hasSpeechRecognition: typeof window.SpeechRecognition !== "undefined" || typeof window.webkitSpeechRecognition !== "undefined",
    };
  });
  console.log("  state:", JSON.stringify(state));
  await page.screenshot({ path: `${SCREENSHOT_DIR}/voice-A-loaded.png`, fullPage: true });

  const ok = state.micExists && state.micWired && state.micVisible && state.hasSpeechRecognition && !state.micClasses.includes("nexus-btn-disabled");
  if (ok) { testsPassed++; console.log("  → PASS"); }
  else console.log("  → FAIL");
  await ctx.close();
}

async function caseB() {
  testsTotal++;
  console.log("\n=== Caso B: SR non supportato (override) ===");
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on("console", m => console.log("  cb:", m.type(), m.text().slice(0,200)));
  page.on("pageerror", e => console.log("  ERR:", String(e).slice(0, 200)));
  // Override BEFORE the script loads: blocca SR sul context
  await page.addInitScript(() => {
    Object.defineProperty(window, "SpeechRecognition", { value: undefined, configurable: true });
    Object.defineProperty(window, "webkitSpeechRecognition", { value: undefined, configurable: true });
  });

  await page.goto(PWA, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    document.getElementById("authGate")?.setAttribute("hidden", "");
    document.getElementById("appRoot")?.removeAttribute("hidden");
    document.getElementById("nexusPanel")?.classList.add("open");
  });
  await page.waitForTimeout(500);

  const state = await page.evaluate(() => {
    const mic = document.getElementById("nexusMicBtn");
    return {
      micExists: !!mic,
      micVisible: mic ? getComputedStyle(mic).display !== "none" : false,
      micClasses: mic ? mic.className : null,
      micTitle: mic ? mic.title : null,
      hasSR: typeof window.SpeechRecognition !== "undefined" || typeof window.webkitSpeechRecognition !== "undefined",
    };
  });
  console.log("  state:", JSON.stringify(state));

  // Click sul bottone → deve mostrare messaggio "Usa Chrome o Edge"
  await page.click("#nexusMicBtn", { force: true });
  await page.waitForTimeout(1500);

  const after = await page.evaluate(() => {
    const status = document.getElementById("nexusVoiceStatus");
    return {
      statusText: status ? status.textContent : null,
      statusHasError: status ? status.classList.contains("error") : false,
      statusOuter: status ? status.outerHTML.slice(0, 200) : null,
    };
  });
  console.log("  after click:", JSON.stringify(after));
  await page.screenshot({ path: `${SCREENSHOT_DIR}/voice-B-not-supported.png`, fullPage: true });

  const ok = state.micExists && state.micVisible && state.micClasses.includes("nexus-btn-disabled") && !state.hasSR
    && /chrome|edge/i.test(after.statusText || "");
  if (ok) { testsPassed++; console.log("  → PASS"); }
  else console.log("  → FAIL");
  await ctx.close();
}

await caseA();
await caseB();
await browser.close();

console.log(`\n=== ${testsPassed}/${testsTotal} test PASS ===`);
process.exit(testsPassed === testsTotal ? 0 : 1);
