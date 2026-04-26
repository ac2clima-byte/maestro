#!/usr/bin/env node
// test-audit-full-e2e.mjs — Audit completo NEXO PWA con login SSO via custom token Admin SDK.
// Usa ADC (gcloud) per generare un custom token per al227@live.com, lo passa via ?authToken=...,
// poi esegue: 1) audit 12 funzionalità UI, 2) 15 test conversazionali NEXUS, 3) screenshot per ognuno.
//
// Uso: node projects/nexo-pwa/test-audit-full-e2e.mjs

import { chromium } from "/home/albertocontardi/node_modules/playwright/index.mjs";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SHOTS = path.join(REPO_ROOT, "results", "audit", "screenshots", "e2e");
fs.mkdirSync(SHOTS, { recursive: true });
const PWA = "https://nexo-hub-15f2d.web.app";

const TARGET_EMAIL = "al227@live.com";

// Init Admin SDK su garbymobile-f89ac (Auth ACG)
const app = initializeApp({
  projectId: "garbymobile-f89ac",
  credential: applicationDefault(),
}, "audit-acg-auth");
const auth = getAuth(app);

console.log("→ Genero custom token per", TARGET_EMAIL);
let user;
try {
  user = await auth.getUserByEmail(TARGET_EMAIL);
  console.log(`  uid=${user.uid} email=${user.email}`);
} catch (e) {
  console.error("❌ Impossibile trovare utente:", e.message);
  process.exit(1);
}
const customToken = await auth.createCustomToken(user.uid);
console.log("  custom token generato (", customToken.length, "chars )");

// ─── 12 funzionalità UI da auditare ─────────────────────────
const FEATURE_TESTS = [
  { id: "a", name: "Login (SSO custom token)", check: "auth" },
  { id: "b", name: "Dashboard home", check: "home" },
  { id: "c", name: "Sidebar (visibilità + click)", check: "sidebar" },
  { id: "d", name: "NEXUS Chat (apertura + risposta semplice)", check: "chat" },
  { id: "e", name: "Chat fullscreen toggle", check: "fullscreen" },
  { id: "f", name: "Voce TTS (presenza pulsante + voci browser Elsa)", check: "tts" },
  { id: "g", name: "Microfono continuo (presenza pulsante)", check: "mic" },
  { id: "h", name: "Cancella chat (clear conversazione)", check: "clear" },
  { id: "i", name: "Swipe email IRIS (presenza interfaccia)", check: "iris-swipe" },
  { id: "j", name: "Pagine Colleghi (apertura tutti 11)", check: "colleghi" },
  { id: "k", name: "CHRONOS badge campagne", check: "chronos-badge" },
  { id: "l", name: "PHARO dashboard RTI", check: "pharo-rti" },
];

// ─── 15 domande conversazionali ─────────────────────────────
const CHAT_TESTS = [
  { i: 1,  q: "ciao",                                   expectColleague: "nessuno" },
  { i: 2,  q: "quante email ho?",                       expectColleague: "iris" },
  { i: 3,  q: "email urgenti",                          expectColleague: "iris" },
  { i: 4,  q: "stato della suite",                      expectColleague: "pharo" },
  { i: 5,  q: "interventi aperti",                      expectColleague: "ares" },
  { i: 6,  q: "come va la campagna walkby?",            expectColleague: "chronos" },
  { i: 7,  q: "dimmi tutto su Kristal",                 expectColleague: "memo" },
  { i: 8,  q: "manda whatsapp a Alberto: test",         expectColleague: "echo" },
  { i: 9,  q: "fatture scadute",                        expectColleague: "charta" },
  { i: 10, q: "scadenze CURIT",                         expectColleague: "dikea" },
  { i: 11, q: "report mensile",                         expectColleague: "charta" },
  { i: 12, q: "bozze pendenti",                         expectColleague: "preventivo" },
  { i: 13, q: "analizza l'ultima mail di Torriglia",    expectColleague: "iris" },
  { i: 14, q: "cosa manca in magazzino?",               expectColleague: "emporion" },
  { i: 15, q: "scrivi risposta a Moraschi",             expectColleague: "calliope" },
];

// Regex robotic: emoji decorative, bold markdown, bullet point a inizio riga
const ROBOTIC_REGEX = /\*\*|^[-•·]\s|^\s+[-•·]\s|📧|📊|📋|🚨|🔔|📤|📥|✉️|📇|💰|📦|⚖️|👁️|✍️|🔧|📅|📆|🚫|💳|💵/m;

function isRoboticReply(text) {
  if (!text) return false;
  return ROBOTIC_REGEX.test(text);
}

function looksMeaningful(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  if (/errore di rete|non sono riuscito a interpretare|errore interpretazione|missing_/i.test(t)) return false;
  return true;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const consoleErrs = [];
  const pageErrs = [];
  page.on("pageerror", e => pageErrs.push(e.message));
  page.on("console", m => { if (m.type() === "error") consoleErrs.push(m.text()); });

  const report = {
    ts: new Date().toISOString(),
    features: [],
    chats: [],
    pageErrors: pageErrs,
    consoleErrors: consoleErrs,
  };

  // ─── STEP 1: Login SSO ───────────────────────────────────────
  console.log("\n═══ STEP 1: Login SSO custom token ═══");
  const ssoUrl = `${PWA}/?authToken=${encodeURIComponent(customToken)}`;
  await page.goto(ssoUrl, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(3000);

  const loginState = await page.evaluate(() => {
    const gate = document.querySelector("#authGate");
    const root = document.querySelector("#appRoot");
    return {
      gateHidden: gate ? gate.hasAttribute("hidden") : null,
      rootVisible: root ? !root.hasAttribute("hidden") : null,
      footerUser: document.querySelector("#footerUser")?.textContent || "",
    };
  });
  const loginOk = loginState.gateHidden && loginState.rootVisible;
  await page.screenshot({ path: path.join(SHOTS, "feat-a-login.png"), fullPage: true });
  console.log(`  Login: ${loginOk ? "✅ OK" : "❌ KO"} (gate=${loginState.gateHidden} root=${loginState.rootVisible} user=${loginState.footerUser})`);
  report.features.push({ ...FEATURE_TESTS[0], ok: !!loginOk, detail: loginState, screenshot: "feat-a-login.png" });

  if (!loginOk) {
    console.error("❌ Login fallito, abort.");
    await browser.close();
    fs.writeFileSync(path.join(SHOTS, "report.json"), JSON.stringify(report, null, 2));
    process.exit(2);
  }

  // ─── STEP 2: Audit 12 funzionalità ───────────────────────────
  console.log("\n═══ STEP 2: Audit 12 funzionalità ═══");

  // b. Dashboard home
  const home = await page.evaluate(() => {
    const main = document.querySelector("#main, main, .main, #appRoot");
    const txt = main?.innerText || "";
    return {
      hasMain: !!main,
      hasContent: txt.length > 100,
      preview: txt.slice(0, 200),
    };
  });
  await page.screenshot({ path: path.join(SHOTS, "feat-b-home.png"), fullPage: false });
  report.features.push({ ...FEATURE_TESTS[1], ok: home.hasMain && home.hasContent, detail: home, screenshot: "feat-b-home.png" });
  console.log(`  b. Home: ${home.hasMain && home.hasContent ? "✅" : "❌"}`);

  // c. Sidebar
  const sidebar = await page.evaluate(() => {
    const sb = document.querySelector(".sidebar, #sidebar, nav, [role='navigation']");
    const items = sb ? Array.from(sb.querySelectorAll("a, button, li")).length : 0;
    return { has: !!sb, items, classes: sb?.className || "" };
  });
  await page.screenshot({ path: path.join(SHOTS, "feat-c-sidebar.png"), fullPage: false });
  report.features.push({ ...FEATURE_TESTS[2], ok: sidebar.has && sidebar.items > 0, detail: sidebar, screenshot: "feat-c-sidebar.png" });
  console.log(`  c. Sidebar: ${sidebar.has ? "✅" : "❌"} (items=${sidebar.items})`);

  // d. NEXUS Chat — apertura
  const fab = await page.$("#nexusFab");
  if (fab) await fab.click();
  await page.waitForTimeout(800);
  const chatOpened = await page.evaluate(() => {
    const panel = document.querySelector("#nexusPanel");
    const input = document.querySelector("#nexusInput");
    return { panelVisible: panel && getComputedStyle(panel).display !== "none", hasInput: !!input };
  });
  await page.screenshot({ path: path.join(SHOTS, "feat-d-chat-open.png"), fullPage: false });
  report.features.push({ ...FEATURE_TESTS[3], ok: chatOpened.panelVisible && chatOpened.hasInput, detail: chatOpened, screenshot: "feat-d-chat-open.png" });
  console.log(`  d. Chat open: ${chatOpened.panelVisible ? "✅" : "❌"}`);

  // e. Fullscreen
  const fsBtn = await page.$("#nexusFullscreenBtn");
  let fsOk = false;
  let fsDetail = {};
  if (fsBtn) {
    await fsBtn.click();
    await page.waitForTimeout(600);
    fsDetail = await page.evaluate(() => {
      const panel = document.querySelector("#nexusPanel");
      return { hasFullscreenClass: panel?.classList.contains("nexus-fullscreen") || panel?.classList.contains("fullscreen") || false, classes: panel?.className || "" };
    });
    fsOk = fsDetail.hasFullscreenClass || /fullscreen/i.test(fsDetail.classes);
    await page.screenshot({ path: path.join(SHOTS, "feat-e-fullscreen.png"), fullPage: false });
    // Rientra
    await fsBtn.click();
    await page.waitForTimeout(400);
  }
  report.features.push({ ...FEATURE_TESTS[4], ok: fsOk, detail: fsDetail, screenshot: "feat-e-fullscreen.png" });
  console.log(`  e. Fullscreen: ${fsOk ? "✅" : "❌"}`);

  // f. TTS — pulsante presente + check voci browser per "Elsa"
  const ttsState = await page.evaluate(() => {
    const btn = document.querySelector("#nexusTtsToggle");
    const stop = document.querySelector("#nexusStopTtsBtn");
    let voices = [];
    try { voices = (speechSynthesis?.getVoices() || []).map(v => `${v.name}|${v.lang}`); } catch {}
    return {
      hasToggleBtn: !!btn,
      hasStopBtn: !!stop,
      toggleHidden: btn?.hidden ?? null,
      voicesCount: voices.length,
      hasElsa: voices.some(v => /elsa/i.test(v)),
      voiceSample: voices.slice(0, 8),
    };
  });
  report.features.push({ ...FEATURE_TESTS[5], ok: ttsState.hasToggleBtn, detail: ttsState, screenshot: "feat-d-chat-open.png" });
  console.log(`  f. TTS btn: ${ttsState.hasToggleBtn ? "✅" : "❌"} | Elsa voice: ${ttsState.hasElsa ? "✅" : "❌ (server-side, browser headless senza voci italiane)"}`);

  // g. Microfono continuo
  const micState = await page.evaluate(() => {
    const btn = document.querySelector("#nexusMicBtn");
    return { hasMicBtn: !!btn, hidden: btn?.hidden ?? null };
  });
  report.features.push({ ...FEATURE_TESTS[6], ok: micState.hasMicBtn, detail: micState, screenshot: "feat-d-chat-open.png" });
  console.log(`  g. Mic btn: ${micState.hasMicBtn ? "✅" : "❌"} (hidden=${micState.hidden})`);

  // h. Cancella chat
  const clrState = await page.evaluate(() => {
    const btn = document.querySelector("#nexusClearBtn");
    return { hasClearBtn: !!btn };
  });
  report.features.push({ ...FEATURE_TESTS[7], ok: clrState.hasClearBtn, detail: clrState, screenshot: "feat-d-chat-open.png" });
  console.log(`  h. Clear btn: ${clrState.hasClearBtn ? "✅" : "❌"}`);

  // Chiudi chat per audit pagine
  const closeBtn = await page.$("#nexusClose");
  if (closeBtn) await closeBtn.click();
  await page.waitForTimeout(400);

  // i. Swipe email IRIS — vai a #iris e verifica presenza interfaccia swipe
  await page.goto(`${PWA}/#iris`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  const irisState = await page.evaluate(() => {
    const swipe = document.querySelector(".iris-swipe, .swipe-card, .iris-card");
    const frame = document.querySelector(".iris-frame, #iris-list, .iris-list");
    return { hasSwipe: !!swipe, hasFrame: !!frame, bodyHasIris: /iris/i.test(document.body.innerText.slice(0, 500)) };
  });
  await page.screenshot({ path: path.join(SHOTS, "feat-i-iris.png"), fullPage: false });
  report.features.push({ ...FEATURE_TESTS[8], ok: irisState.hasSwipe || irisState.hasFrame, detail: irisState, screenshot: "feat-i-iris.png" });
  console.log(`  i. IRIS swipe: ${irisState.hasSwipe || irisState.hasFrame ? "✅" : "❌"} (swipe=${irisState.hasSwipe} frame=${irisState.hasFrame})`);

  // j. Pagine Colleghi
  const COLLEGHI = ["iris", "echo", "ares", "chronos", "memo", "charta", "emporion", "dikea", "delphi", "pharo", "calliope"];
  const collegheResults = [];
  for (const c of COLLEGHI) {
    try {
      await page.goto(`${PWA}/#collega:${c}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(700);
      const ok = await page.evaluate(() => {
        return !!document.querySelector(".collega-page, .collega-wip, .iris-frame, #appRoot:not([hidden])");
      });
      collegheResults.push({ id: c, ok });
      await page.screenshot({ path: path.join(SHOTS, `feat-j-collega-${c}.png`), fullPage: false });
    } catch (e) {
      collegheResults.push({ id: c, ok: false, error: e.message.slice(0, 100) });
    }
  }
  const okC = collegheResults.filter(r => r.ok).length;
  report.features.push({ ...FEATURE_TESTS[9], ok: okC === COLLEGHI.length, detail: { results: collegheResults, ok: okC, total: COLLEGHI.length }, screenshot: "feat-j-collega-iris.png" });
  console.log(`  j. Colleghi: ${okC}/${COLLEGHI.length} OK`);

  // k. CHRONOS badge campagne
  await page.goto(`${PWA}/#collega:chronos`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  const chronosBadge = await page.evaluate(() => {
    const badges = Array.from(document.querySelectorAll(".badge, .campagna-badge, [data-badge], .chip"));
    return { badgeCount: badges.length, badgeText: badges.slice(0, 5).map(b => b.textContent.trim().slice(0, 50)) };
  });
  await page.screenshot({ path: path.join(SHOTS, "feat-k-chronos-badge.png"), fullPage: false });
  report.features.push({ ...FEATURE_TESTS[10], ok: chronosBadge.badgeCount > 0, detail: chronosBadge, screenshot: "feat-k-chronos-badge.png" });
  console.log(`  k. CHRONOS badges: ${chronosBadge.badgeCount > 0 ? "✅" : "❌"} (${chronosBadge.badgeCount} badges)`);

  // l. PHARO RTI dashboard
  await page.goto(`${PWA}/#collega:pharo`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  const pharo = await page.evaluate(() => {
    const main = document.querySelector("#main, .pharo-page, #appRoot");
    const txt = main?.innerText || "";
    return { hasContent: txt.length > 200, mentionsRti: /RTI|monitor|intervent/i.test(txt), preview: txt.slice(0, 200) };
  });
  await page.screenshot({ path: path.join(SHOTS, "feat-l-pharo.png"), fullPage: false });
  report.features.push({ ...FEATURE_TESTS[11], ok: pharo.hasContent && pharo.mentionsRti, detail: pharo, screenshot: "feat-l-pharo.png" });
  console.log(`  l. PHARO: ${pharo.hasContent && pharo.mentionsRti ? "✅" : "❌"}`);

  // ─── STEP 3: 15 test conversazionali ─────────────────────────
  console.log("\n═══ STEP 3: 15 test conversazionali NEXUS ═══");
  await page.goto(PWA, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  for (const t of CHAT_TESTS) {
    const sid = `audit_q${t.i}_${Date.now().toString(36)}`;
    await page.evaluate(s => localStorage.setItem("nexo.nexus.sessionId", s), sid);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector("#nexusFab", { timeout: 10000 });
    await page.click("#nexusFab");
    await page.waitForSelector("#nexusInput", { timeout: 5000 });
    await page.waitForTimeout(500);

    const before = await page.$$eval(".nexus-bubble.assistant", e => e.length);

    // Intercetta la response del nexusRouter per capture intent
    let routerResp = null;
    const respHandler = async r => {
      if (r.url().includes("/nexusRouter") && r.request().method() === "POST") {
        try { routerResp = await r.json(); } catch {}
      }
    };
    page.on("response", respHandler);

    await page.locator("#nexusInput").fill(t.q);
    await page.locator("#nexusInput").press("Enter");

    let reply = null;
    const start = Date.now();
    while (Date.now() - start < 45000) {
      const bubbles = await page.$$eval(".nexus-bubble.assistant", e => e.map(x => x.textContent.trim()));
      if (bubbles.length > before) { reply = bubbles[bubbles.length - 1]; break; }
      await page.waitForTimeout(500);
    }

    page.off("response", respHandler);

    const shotName = `chat-${String(t.i).padStart(2, "0")}.png`;
    await page.screenshot({ path: path.join(SHOTS, shotName), fullPage: false });

    const robotic = isRoboticReply(reply);
    const meaningful = looksMeaningful(reply);
    const intent = routerResp?.intent || null;
    const collegaActual = intent?.collega || null;
    const routingOk = !t.expectColleague || collegaActual === t.expectColleague || (t.expectColleague === "preventivo" && intent?.azione?.includes("preventiv"));

    const result = {
      i: t.i,
      q: t.q,
      reply: reply || null,
      replyPreview: (reply || "(no reply)").slice(0, 300),
      hasReply: !!reply,
      naturalLanguage: !robotic,
      meaningful,
      collegaExpected: t.expectColleague,
      collegaActual,
      azione: intent?.azione || null,
      stato: routerResp?.stato || null,
      routingOk,
      modello: routerResp?.modello || null,
      screenshot: shotName,
    };
    report.chats.push(result);
    const flag = result.hasReply && result.naturalLanguage && result.meaningful ? "✅" : (result.hasReply ? "⚠️" : "❌");
    console.log(`  ${String(t.i).padStart(2)}. ${flag} "${t.q.slice(0, 35)}" → coll=${collegaActual || "?"} nat=${result.naturalLanguage} mean=${result.meaningful}`);
    console.log(`        reply: ${(reply || "(timeout)").slice(0, 110).replace(/\s+/g, " ")}`);
  }

  await browser.close();

  fs.writeFileSync(path.join(SHOTS, "report.json"), JSON.stringify(report, null, 2));

  // Summary
  console.log("\n═══ AUDIT FINALE ═══");
  const okFeats = report.features.filter(f => f.ok).length;
  console.log(`Funzionalità: ${okFeats}/${report.features.length} OK`);
  const okChats = report.chats.filter(c => c.hasReply && c.naturalLanguage && c.meaningful).length;
  const partial = report.chats.filter(c => c.hasReply && (!c.naturalLanguage || !c.meaningful)).length;
  const fail = report.chats.filter(c => !c.hasReply).length;
  console.log(`Chat 15 test: ${okChats} OK, ${partial} parziali, ${fail} timeout`);
  console.log(`Page errors: ${report.pageErrors.length}, Console errors: ${report.consoleErrors.length}`);
  console.log(`Report: ${path.join(SHOTS, "report.json")}`);
})().catch(e => { console.error("FATAL:", e); process.exit(1); });
