#!/usr/bin/env node
// test-sso-verifica.js — verifica end-to-end SSO post-fix:
//   1. acgsuite.web.app: card NEXO senza noSSO → usa openApp/custom token
//   2. nexo-hub-15f2d.web.app: gate login garbymobile-f89ac
import { chromium } from "/home/albertocontardi/node_modules/playwright/index.mjs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "test-screenshots", "sso-verifica");
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();

  // 1. Landing ACG
  console.log("→ Landing ACG Suite…");
  await page.goto("https://acgsuite.web.app/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2500);

  const landingCheck = await page.evaluate(() => {
    const app = (window.APPS || []).find(a => a.key === "nexo");
    return {
      nexoCardFound: !!app,
      noSSOFlag: app?.noSSO || false,
      nexoUrl: app?.url,
    };
  }).catch(e => ({ error: String(e) }));
  console.log("  →", JSON.stringify(landingCheck));

  await page.screenshot({ path: path.join(OUT, "01-landing-acgsuite.png"), fullPage: false });
  console.log("  📸 01-landing-acgsuite.png");

  // 2. PWA NEXO
  console.log("\n→ PWA NEXO…");
  await page.goto("https://nexo-hub-15f2d.web.app/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  const pwaCheck = await page.evaluate(() => {
    const gate = document.querySelector("#authGate");
    const app = document.querySelector("#appRoot");
    return {
      gateVisible: gate && !gate.hasAttribute("hidden"),
      appHidden: app && app.hasAttribute("hidden"),
      hasEmailInput: !!document.querySelector("#authEmail"),
      hasPasswordInput: !!document.querySelector("#authPassword"),
      hasAccediButton: !!document.querySelector("#authBtn"),
      configProjectId: window.ACG_AUTH_CONFIG?.projectId || null,
    };
  });
  console.log("  →", JSON.stringify(pwaCheck));

  await page.screenshot({ path: path.join(OUT, "02-pwa-nexo-gate.png"), fullPage: false });
  console.log("  📸 02-pwa-nexo-gate.png");

  // 3. NEXUS chat senza login = inaccessibile (gate non permette)
  const nexusFabVisible = await page.evaluate(() => {
    const fab = document.querySelector("#nexusFab");
    return fab ? getComputedStyle(fab).display !== "none" : false;
  });
  console.log("  NEXUS FAB visibile senza login?", nexusFabVisible, "(atteso: false)");

  // 4. Verifica endpoint nexusRouter
  console.log("\n→ nexusRouter endpoint check…");
  const endpointCheck = await page.evaluate(async () => {
    try {
      const r = await fetch("https://europe-west1-nexo-hub-15f2d.cloudfunctions.net/nexusRouter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage: "test", sessionId: "x" }),
      });
      return { status: r.status, text: (await r.text()).slice(0, 100) };
    } catch (e) { return { error: String(e) }; }
  });
  console.log("  →", JSON.stringify(endpointCheck));

  await browser.close();

  // Summary
  fs.writeFileSync(
    path.join(OUT, "results.json"),
    JSON.stringify({
      timestamp: new Date().toISOString(),
      landing: landingCheck,
      pwa: pwaCheck,
      nexusFabVisibleWithoutLogin: nexusFabVisible,
      endpoint: endpointCheck,
    }, null, 2),
  );

  // Pass/fail check
  const allPass =
    !landingCheck.noSSOFlag &&
    landingCheck.nexoCardFound &&
    pwaCheck.gateVisible &&
    pwaCheck.appHidden &&
    pwaCheck.hasEmailInput &&
    pwaCheck.configProjectId === "garbymobile-f89ac" &&
    !nexusFabVisible &&
    endpointCheck.status === 401;

  console.log("\n" + (allPass ? "✅ TUTTI I CHECK PASSATI" : "⚠️ Alcuni check non sono passati"));
  process.exit(allPass ? 0 : 1);
})().catch(e => { console.error("Fatal:", e); process.exit(1); });
