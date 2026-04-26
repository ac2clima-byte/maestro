#!/usr/bin/env node
// test-audit-ui-public.mjs — Audit UI pubblica (senza login).
// Verifica: bootstrap, auth gate, asset, console errors, network errors, SW registrato.
import { chromium } from "/home/albertocontardi/node_modules/playwright/index.mjs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SHOTS = path.join(REPO_ROOT, "results", "audit", "screenshots", "ui-public");
fs.mkdirSync(SHOTS, { recursive: true });
const PWA = "https://nexo-hub-15f2d.web.app";

const report = {
  ts: new Date().toISOString(),
  url: PWA,
  consoleErrors: [],
  pageErrors: [],
  failedRequests: [],
  bootstrap: null,
  authGate: null,
  assets: null,
  endpoints: [],
  responseHeaders: {},
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  page.on("pageerror", e => report.pageErrors.push(e.message));
  page.on("console", m => { if (m.type() === "error") report.consoleErrors.push(m.text()); });
  page.on("response", r => {
    if (r.status() >= 400 && r.url().includes("nexo-hub-15f2d")) {
      report.failedRequests.push({ url: r.url(), status: r.status() });
    }
  });

  console.log("→ Apro PWA…");
  const resp = await page.goto(PWA, { waitUntil: "networkidle", timeout: 30000 });
  report.responseHeaders = {
    status: resp?.status(),
    cacheControl: resp?.headers()["cache-control"],
    contentType: resp?.headers()["content-type"],
  };
  await page.waitForTimeout(2500);

  // Bootstrap state
  report.bootstrap = await page.evaluate(() => ({
    title: document.title,
    hasAppRoot: !!document.querySelector("#appRoot"),
    hasAuthGate: !!document.querySelector("#authGate"),
    hasNexusFab: !!document.querySelector("#nexusFab"),
    hasSidebar: !!document.querySelector(".sidebar, #sidebar, [role='navigation']"),
  }));

  report.authGate = await page.evaluate(() => {
    const gate = document.querySelector("#authGate");
    return {
      visible: gate && !gate.hasAttribute("hidden"),
      hasEmailInput: !!document.querySelector("#authEmail"),
      hasPasswordInput: !!document.querySelector("#authPassword"),
      hasSubmitBtn: !!document.querySelector("#authBtn"),
    };
  });

  // CSS / JS loaded?
  report.assets = await page.evaluate(() => {
    const cssLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(l => l.href);
    const scripts = Array.from(document.querySelectorAll('script[type="module"]')).map(s => s.src);
    return { cssLinks, scripts, scriptCount: scripts.length, cssCount: cssLinks.length };
  });

  // Service worker?
  const swState = await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return "unsupported";
    const reg = await navigator.serviceWorker.getRegistration();
    return reg ? `registered: ${reg.active?.scriptURL || "no-active"}` : "not-registered";
  });
  report.serviceWorker = swState;

  await page.screenshot({ path: path.join(SHOTS, "01-auth-gate.png"), fullPage: true });

  // Test endpoint health (deve dare 401 senza token, NON 404 o 5xx)
  console.log("\n→ Verifico health endpoint Cloud Functions…");
  const ENDPOINTS = [
    { name: "nexusRouter", url: "https://europe-west1-nexo-hub-15f2d.cloudfunctions.net/nexusRouter", method: "POST" },
    { name: "nexusTts", url: "https://europe-west1-nexo-hub-15f2d.cloudfunctions.net/nexusTts", method: "POST" },
    { name: "nexusTranscribeAudio", url: "https://europe-west1-nexo-hub-15f2d.cloudfunctions.net/nexusTranscribeAudio", method: "POST" },
    { name: "irisArchiveEmail", url: "https://europe-west1-nexo-hub-15f2d.cloudfunctions.net/irisArchiveEmail", method: "POST" },
    { name: "pharoRtiDashboard", url: "https://europe-west1-nexo-hub-15f2d.cloudfunctions.net/pharoRtiDashboard", method: "GET" },
    { name: "chronosCampagneDashboard", url: "https://europe-west1-nexo-hub-15f2d.cloudfunctions.net/chronosCampagneDashboard", method: "GET" },
    { name: "chronosAgendaDashboard", url: "https://europe-west1-nexo-hub-15f2d.cloudfunctions.net/chronosAgendaDashboard", method: "GET" },
    { name: "chronosScadenzeDashboard", url: "https://europe-west1-nexo-hub-15f2d.cloudfunctions.net/chronosScadenzeDashboard", method: "GET" },
    { name: "pharoResolveAlert", url: "https://europe-west1-nexo-hub-15f2d.cloudfunctions.net/pharoResolveAlert", method: "POST" },
    { name: "nexoPushSend", url: "https://europe-west1-nexo-hub-15f2d.cloudfunctions.net/nexoPushSend", method: "POST" },
  ];

  for (const ep of ENDPOINTS) {
    try {
      const r = await page.evaluate(async ({ url, method }) => {
        try {
          const res = await fetch(url, {
            method,
            headers: { "Content-Type": "application/json" },
            body: method === "POST" ? JSON.stringify({ test: true }) : undefined,
          });
          return { status: res.status, ok: res.ok };
        } catch (e) { return { error: String(e) }; }
      }, ep);
      const verdict = r.status === 401 || r.status === 400 ? "OK (auth required)" :
                      r.status === 404 ? "❌ NOT FOUND" :
                      r.status >= 500 ? "❌ SERVER ERROR" :
                      r.status === 200 ? "OK (public)" :
                      `?? ${r.status}`;
      report.endpoints.push({ ...ep, ...r, verdict });
      console.log(`  ${ep.name.padEnd(28)} → ${r.status || "ERR"} ${verdict}`);
    } catch (e) {
      report.endpoints.push({ ...ep, error: String(e) });
      console.log(`  ${ep.name.padEnd(28)} → ERR ${e.message.slice(0, 80)}`);
    }
  }

  // Verifica anche il login flow con creds invalide (per vedere che il backend Firebase Auth risponda)
  console.log("\n→ Test form login con credenziali invalide…");
  await page.fill("#authEmail", "test@invalid.test");
  await page.fill("#authPassword", "wrong");
  await page.click("#authBtn");
  await page.waitForTimeout(3500);
  const errText = await page.evaluate(() => document.querySelector("#authError")?.innerText || "");
  report.authFlowError = errText;
  console.log(`  Errore mostrato: "${errText}"`);
  await page.screenshot({ path: path.join(SHOTS, "02-after-fake-login.png"), fullPage: true });

  await browser.close();

  fs.writeFileSync(path.join(SHOTS, "report.json"), JSON.stringify(report, null, 2));
  console.log(`\n═══ AUDIT UI PUBBLICA — riassunto ═══`);
  console.log(`Page errors: ${report.pageErrors.length}`);
  console.log(`Console errors: ${report.consoleErrors.length}`);
  console.log(`Failed requests: ${report.failedRequests.length}`);
  console.log(`Endpoint sani: ${report.endpoints.filter(e => /OK/.test(e.verdict)).length}/${report.endpoints.length}`);
  console.log(`Endpoint problemi: ${report.endpoints.filter(e => /❌/.test(e.verdict)).map(e => e.name).join(", ") || "nessuno"}`);
  console.log(`Report JSON: ${path.join(SHOTS, "report.json")}`);
})().catch(e => { console.error(e); process.exit(1); });
