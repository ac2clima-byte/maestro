// Test E2E: click Archivia su email di test FORGE.
import { chromium } from "/home/albertocontardi/node_modules/playwright/index.mjs";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import admin from "firebase-admin";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "test-screenshots", "iris-archive-e2e");
const URL = "https://nexo-hub-15f2d.web.app/iris/";
fs.mkdirSync(OUT, { recursive: true });

admin.initializeApp({ projectId: "nexo-hub-15f2d" });
const db = admin.firestore();

// Crea due email di test fresche
const archiveId = "forge_test_archive_" + Date.now();
const deleteId = "forge_test_delete_" + Date.now();
console.log("Creo email test:", archiveId, deleteId);
for (const [id, suffix] of [[archiveId, "ARCHIVIA"], [deleteId, "ELIMINA"]]) {
  await db.collection("iris_emails").doc(id).set({
    raw: {
      subject: `FORGE TEST · click ${suffix}`,
      sender: "forge@test.local",
      sender_name: "FORGE TEST E2E",
      received_time: new Date().toISOString(),
      body_text: `Email di test FORGE per click ${suffix}. Non è reale.`,
    },
    classification: { category: "ALTRO", confidence: "low", summary: `Test click ${suffix}` },
    score: 1,
    source: "forge_test_e2e",
  });
}
console.log("Aspetto qualche secondo che la PWA veda i nuovi doc…");
await new Promise(r => setTimeout(r, 4000));

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const consoleErrors = [];
const responses = [];
page.on("pageerror", e => consoleErrors.push(String(e)));
page.on("console", msg => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
page.on("response", async r => {
  if (r.url().includes("Archive") || r.url().includes("Delete")) {
    let body;
    try { body = (await r.text()).slice(0, 200); } catch { body = ""; }
    responses.push({ status: r.status(), url: r.url().slice(-50), body });
  }
});

const summary = { steps: [], archiveId, deleteId };
function step(name, status, detail) { summary.steps.push({ name, status, detail }); console.log(`[${status.toUpperCase()}] ${name} — ${detail || ""}`); }

console.log("→ Apro PWA IRIS…");
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
// Forziamo no-cache (params garantiscono fresh fetch)
await page.evaluate(() => { try { caches?.keys?.().then(k => k.forEach(c => caches.delete(c))); } catch {} });
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(4500);

// 1. Trova bottone archive per archiveId
const found = await page.evaluate((id) => {
  const btn = document.querySelector(`[data-archive="${id}"]`);
  return { found: !!btn, html: btn ? btn.outerHTML.slice(0, 200) : null };
}, archiveId);
step("Bottone archivia trovato per email test", found.found ? "ok" : "fail", found.html || "non presente nel DOM");

if (!found.found) {
  await page.screenshot({ path: path.join(OUT, "00-no-button.png"), fullPage: true });
  fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify({ ...summary, consoleErrors }, null, 2));
  await browser.close();
  process.exit(1);
}

await page.screenshot({ path: path.join(OUT, "01-before-archive.png"), fullPage: false });

// 2. Click Archivia
console.log(`→ Click Archivia su ${archiveId}…`);
await page.click(`[data-archive="${archiveId}"]`);
await page.waitForTimeout(4000);

// 3. Verifica toast + risposta backend
const archiveResp = responses.find(r => r.url.includes("Archive"));
step("Endpoint Archive chiamato", archiveResp ? "ok" : "fail",
  archiveResp ? `HTTP ${archiveResp.status} · body: ${archiveResp.body.slice(0, 100)}` : "nessuna chiamata di rete");
step("Toast archivio visibile",
  await page.evaluate(() => !!document.querySelector(".iris-toast")) ? "ok" : "warn",
  await page.evaluate(() => document.querySelector(".iris-toast")?.textContent || ""));
await page.screenshot({ path: path.join(OUT, "02-after-archive.png"), fullPage: false });

// 4. Verifica Firestore aggiornato
await new Promise(r => setTimeout(r, 1500));
const archDoc = await db.collection("iris_emails").doc(archiveId).get();
const archData = archDoc.data() || {};
step("Firestore status=archived",
  archData.status === "archived" ? "ok" : "fail",
  `status=${archData.status || "(none)"} · cartella=${archData.cartella || "(none)"}`);

// 5. Click Elimina (con dialog accept)
console.log(`→ Click Elimina su ${deleteId}…`);
page.once("dialog", d => d.accept());
const deleteBtn = await page.$(`[data-delete="${deleteId}"]`);
if (!deleteBtn) {
  step("Bottone elimina trovato", "fail", "non presente");
} else {
  step("Bottone elimina trovato", "ok", "");
  await deleteBtn.click();
  await page.waitForTimeout(4000);
  const delResp = responses.find(r => r.url.includes("Delete"));
  step("Endpoint Delete chiamato", delResp ? "ok" : "fail",
    delResp ? `HTTP ${delResp.status} · body: ${delResp.body.slice(0, 100)}` : "nessuna chiamata");
  await page.screenshot({ path: path.join(OUT, "03-after-delete.png"), fullPage: false });

  await new Promise(r => setTimeout(r, 1500));
  const delDoc = await db.collection("iris_emails").doc(deleteId).get();
  const delData = delDoc.data() || {};
  step("Firestore status=deleted",
    delData.status === "deleted" ? "ok" : "fail",
    `status=${delData.status || "(none)"}`);
}

step("Console errors", consoleErrors.length === 0 ? "ok" : "warn", consoleErrors.slice(0, 3).join(" | "));

console.log("\n=== RESPONSES ===");
responses.forEach(r => console.log(`  HTTP ${r.status}  ${r.url}  body=${r.body.slice(0, 80)}`));

fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify({
  ...summary, responses, consoleErrors,
}, null, 2));

await browser.close();

const fails = summary.steps.filter(s => s.status === "fail").length;
const oks = summary.steps.filter(s => s.status === "ok").length;
const warns = summary.steps.filter(s => s.status === "warn").length;
console.log(`\n=== ${oks} OK · ${warns} WARN · ${fails} FAIL ===`);
process.exit(fails > 0 ? 1 : 0);
