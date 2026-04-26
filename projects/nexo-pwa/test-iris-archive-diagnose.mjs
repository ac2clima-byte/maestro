// Diagnostica il bottone "Archivia" della pagina IRIS in produzione.
// Cattura: console errors, network requests, status pre/post click.
import { chromium } from "/home/albertocontardi/node_modules/playwright/index.mjs";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "test-screenshots", "iris-archive-diagnose");
const URL = "https://nexo-hub-15f2d.web.app/iris/";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

const consoleLogs = [];
const consoleErrors = [];
page.on("console", msg => {
  const t = msg.type();
  const txt = `[${t}] ${msg.text()}`;
  consoleLogs.push(txt);
  if (t === "error") consoleErrors.push(txt);
});
page.on("pageerror", e => consoleErrors.push(`[pageerror] ${String(e)}`));

const requests = [];
page.on("request", r => {
  if (r.url().includes("iris") || r.url().includes("Archive") || r.url().includes("Delete")) {
    requests.push({ method: r.method(), url: r.url(), headers: r.headers() });
  }
});
const responses = [];
page.on("response", async r => {
  if (r.url().includes("Archive") || r.url().includes("Delete")) {
    let body;
    try { body = (await r.text()).slice(0, 200); } catch { body = "(no body)"; }
    responses.push({ status: r.status(), url: r.url(), body });
  }
});

console.log("→ Apro PWA IRIS…");
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
await page.waitForTimeout(3000);

// Verifica stato auth
const state = await page.evaluate(() => ({
  hasLoginGate: !!document.querySelector("#loginGate, #loginScreen, .login"),
  bodyText: (document.body.innerText || "").slice(0, 200),
  hasEmailCard: !!document.querySelector(".email-card"),
  emailCount: document.querySelectorAll(".email-card").length,
  hasArchiveBtn: !!document.querySelector(".btn-archive"),
  archiveBtnCount: document.querySelectorAll(".btn-archive").length,
  loggedIn: !!document.querySelector(".email-card") || !!document.querySelector("#emailList"),
  user: window.__irisCurrentUser ? window.__irisCurrentUser.email : null,
}));
console.log("State iniziale:", JSON.stringify(state, null, 2));
await page.screenshot({ path: path.join(OUT, "01-initial.png"), fullPage: false });

if (!state.hasArchiveBtn) {
  console.log("Nessun bottone Archivia trovato (probabilmente non loggato o nessuna email).");
  fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify({
    state, consoleLogs: consoleLogs.slice(-30), consoleErrors,
    note: "Cannot test click without active session.",
  }, null, 2));
  await browser.close();
  process.exit(0);
}

// 2. Catch the first archive button + first email id
const target = await page.evaluate(() => {
  const btn = document.querySelector(".btn-archive");
  const card = btn ? btn.closest(".email-card, .thread-email") : null;
  return {
    emailId: btn ? btn.dataset.archive : null,
    cardExists: !!card,
    btnHTML: btn ? btn.outerHTML : null,
  };
});
console.log("Target archivio:", JSON.stringify(target));

console.log("→ Click bottone Archivia…");
await page.click(".btn-archive", { force: true });
await page.waitForTimeout(4000);

await page.screenshot({ path: path.join(OUT, "02-after-click.png"), fullPage: false });

// 3. Stato del DOM e toast
const after = await page.evaluate(() => ({
  toastText: (document.querySelector(".iris-toast")?.textContent) || "",
  cardStillThere: !!document.querySelector(".email-card"),
  btnDisabled: document.querySelector(".btn-archive")?.disabled,
}));
console.log("Dopo click:", JSON.stringify(after, null, 2));

console.log("\n=== RESPONSES ===");
responses.forEach(r => console.log(`  ${r.status} ${r.url.slice(-50)} | ${r.body.slice(0, 120)}`));
console.log("\n=== ERRORS ===");
consoleErrors.forEach(e => console.log("  " + e));
console.log("\n=== Recent console ===");
consoleLogs.slice(-15).forEach(l => console.log("  " + l));

fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify({
  state, target, after, requests, responses, consoleErrors, consoleLogs: consoleLogs.slice(-30),
}, null, 2));
await browser.close();
