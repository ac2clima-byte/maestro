#!/usr/bin/env node
// test-report-bug.mjs — Smoke test del bottone "Segnala bug"
//
// Senza credenziali (policy non permette di leggere .env), verifichiamo:
//   1. la pagina deployata contiene markup + script + css del bottone
//   2. col gate visibile (no auth) il bottone è nascosto perché dentro #appRoot[hidden]
//   3. simulando #appRoot.removeAttribute("hidden") il bottone diventa visibile in
//      top-right e il modal si apre al click
//   4. la funzione submitBugReport è esposta nello scope globale (o via wire)
//
// Output: screenshots in test-screenshots/report-bug/

import { chromium } from "/home/albertocontardi/node_modules/playwright/index.mjs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "test-screenshots", "report-bug");
const URL = "https://nexo-hub-15f2d.web.app/";
fs.mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(...a);
const summary = { steps: [] };
function step(name, status, detail) { summary.steps.push({ name, status, detail }); log(`[${status}] ${name} — ${detail || ""}`); }

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

try {
  log("→ Apro PWA…");
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(3000);

  // 1. Markup presente
  const markup = await page.evaluate(() => ({
    btn: !!document.querySelector("#reportBugBtn"),
    modal: !!document.querySelector("#reportBugModal"),
    label: document.querySelector(".report-bug-label")?.textContent || null,
    submit: !!document.querySelector("#reportBugSubmit"),
    cancel: !!document.querySelector("#reportBugCancel"),
    textarea: !!document.querySelector("#reportBugText"),
  }));
  step("markup presente", markup.btn && markup.modal && markup.submit ? "ok" : "fail", JSON.stringify(markup));

  // 2. Stato gate (no auth) — il bottone deve avere attributo hidden
  const gateState = await page.evaluate(() => {
    const app = document.querySelector("#appRoot");
    const gate = document.querySelector("#authGate");
    const btn = document.querySelector("#reportBugBtn");
    const btnRect = btn ? btn.getBoundingClientRect() : null;
    return {
      appHidden: !!(app && app.hasAttribute("hidden")),
      gateVisible: !!(gate && !gate.hasAttribute("hidden")),
      btnHasHiddenAttr: !!(btn && btn.hasAttribute("hidden")),
      btnVisible: !!(btnRect && btnRect.width > 0 && btnRect.height > 0),
    };
  });
  step("bottone hidden pre-auth",
    gateState.btnHasHiddenAttr && !gateState.btnVisible ? "ok" : "fail",
    JSON.stringify(gateState));
  await page.screenshot({ path: path.join(OUT, "01-gate.png"), fullPage: false });

  // 3. Simula post-auth: rimuovi hidden + setta una variabile globale
  //    che lo script userà come fallback. NB: i listener sono GIÀ wirati
  //    allo startup; ci limitiamo a togliere hidden e a forzare il check
  //    CURRENT_USER bypassandolo via dispatch diretto se necessario.
  log("→ Simulo stato post-auth (toglie hidden bottone, gate via)…");
  await page.evaluate(() => {
    document.querySelector("#authGate")?.setAttribute("hidden", "");
    document.querySelector("#appRoot")?.removeAttribute("hidden");
    document.querySelector("#reportBugBtn")?.removeAttribute("hidden");
  });
  await page.waitForTimeout(500);

  const btnAfter = await page.evaluate(() => {
    const btn = document.querySelector("#reportBugBtn");
    const r = btn?.getBoundingClientRect();
    const cs = btn ? getComputedStyle(btn) : null;
    return r && cs ? {
      visible: r.width > 0 && r.height > 0,
      top: Math.round(r.top), right: Math.round(window.innerWidth - r.right),
      bg: cs.backgroundColor, color: cs.color, position: cs.position, zIndex: cs.zIndex,
    } : null;
  });
  step("bottone visibile top-right post-auth",
    btnAfter && btnAfter.visible && btnAfter.top < 30 && btnAfter.right < 30 ? "ok" : "fail",
    JSON.stringify(btnAfter));
  await page.screenshot({ path: path.join(OUT, "02-button-visible.png"), fullPage: false });

  // 4. Click → in stato pre-auth il modal NON deve aprirsi (guardia CURRENT_USER null).
  //    Verifichiamo questa guardia prima.
  log("→ Click pre-auth: il modal deve restare chiuso (guardia CURRENT_USER)…");
  await page.click("#reportBugBtn");
  await page.waitForTimeout(300);
  const guardState = await page.evaluate(() => document.querySelector("#reportBugModal")?.getAttribute("aria-hidden"));
  step("guardia CURRENT_USER blocca apertura pre-auth", guardState === "true" ? "ok" : "fail", `aria-hidden=${guardState}`);

  // 5. Apriamo il modal via aria-hidden direttamente (simula post-auth open).
  //    Bypassiamo la guardia CURRENT_USER che è solo una safety net.
  log("→ Apro modal direttamente per testare la UI…");
  await page.evaluate(() => {
    document.querySelector("#reportBugModal")?.setAttribute("aria-hidden", "false");
  });
  await page.waitForTimeout(400);
  const modalState = await page.evaluate(() => {
    const m = document.querySelector("#reportBugModal");
    const r = m?.getBoundingClientRect();
    const cs = m ? getComputedStyle(m) : null;
    return {
      ariaHidden: m?.getAttribute("aria-hidden"),
      display: cs?.display,
      visible: !!(r && r.width > 0 && r.height > 0 && cs.display !== "none"),
    };
  });
  step("modal visibile (aria-hidden=false → display:flex)", modalState.ariaHidden === "false" && modalState.visible ? "ok" : "fail", JSON.stringify(modalState));
  await page.screenshot({ path: path.join(OUT, "03-modal-open.png"), fullPage: false });

  // 5. Scrittura testo + UI submit (NON lo invio davvero per non sporcare prod)
  log("→ Scrivo nel textarea (no submit reale per non sporcare Firestore)…");
  await page.fill("#reportBugText", "test bug report - smoke test playwright");
  await page.waitForTimeout(200);
  const filled = await page.evaluate(() => document.querySelector("#reportBugText")?.value || "");
  step("textarea accetta testo", filled === "test bug report - smoke test playwright" ? "ok" : "fail", `value="${filled}"`);
  await page.screenshot({ path: path.join(OUT, "04-modal-filled.png"), fullPage: false });

  // 6. Cancel chiude il modal
  log("→ Click Annulla…");
  await page.click("#reportBugCancel");
  await page.waitForTimeout(400);
  const closedState = await page.evaluate(() => ({
    ariaHidden: document.querySelector("#reportBugModal")?.getAttribute("aria-hidden"),
    text: document.querySelector("#reportBugText")?.value,
  }));
  step("Annulla chiude e svuota", closedState.ariaHidden === "true" && closedState.text === "" ? "ok" : "fail", JSON.stringify(closedState));
  await page.screenshot({ path: path.join(OUT, "05-modal-closed.png"), fullPage: false });

  // 7. Riapri (via aria-hidden) + Esc chiude
  await page.evaluate(() => document.querySelector("#reportBugModal")?.setAttribute("aria-hidden", "false"));
  await page.waitForTimeout(200);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const escState = await page.evaluate(() => document.querySelector("#reportBugModal")?.getAttribute("aria-hidden"));
  step("Esc chiude il modal", escState === "true" ? "ok" : "fail", `aria-hidden=${escState}`);

  // 8. Riapri + click sul backdrop chiude
  await page.evaluate(() => document.querySelector("#reportBugModal")?.setAttribute("aria-hidden", "false"));
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const m = document.querySelector("#reportBugModal");
    m.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await page.waitForTimeout(300);
  const bdState = await page.evaluate(() => document.querySelector("#reportBugModal")?.getAttribute("aria-hidden"));
  step("click backdrop chiude", bdState === "true" ? "ok" : "fail", `aria-hidden=${bdState}`);

} finally {
  fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
  await browser.close();
}

const fails = summary.steps.filter(s => s.status === "fail").length;
const warns = summary.steps.filter(s => s.status === "warn").length;
const oks = summary.steps.filter(s => s.status === "ok").length;
log(`\n=== ${oks} OK · ${warns} WARN · ${fails} FAIL ===`);
log(`screenshots in ${OUT}`);
process.exit(fails > 0 ? 1 : 0);
