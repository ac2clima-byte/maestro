#!/usr/bin/env node
// audit-tecnici-context.mjs — verifica fix #1 (handler tecnici) + fix #2 (contesto).
import { chromium } from "/home/albertocontardi/node_modules/playwright/index.mjs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const SHOTS = path.join(REPO_ROOT, "results", "audit", "screenshots", "tecnici-context");
fs.mkdirSync(SHOTS, { recursive: true });
const PWA = "https://nexo-hub-15f2d.web.app";
const EMAIL = process.env.NEXO_TEST_EMAIL || "alberto.contardi@acgclimaservice.com";
const PASSWORD = process.env.NEXO_TEST_PASSWORD || "";
if (!PASSWORD) { console.error("NEXO_TEST_PASSWORD mancante"); process.exit(1); }

// 3 scenari:
//  1) "quali sono i tecnici di acg clima?"  → handler diretto memo/lista_tecnici
//  2) "tecnici guazzotti"                    → filtro azienda
//  3) Contesto: query A → query ambigua B che si riferisce ad A
const SCENARIOS = [
  {
    name: "tecnici-acg",
    sessionPrefix: "audit_tecn_acg",
    turns: [
      { q: "quali sono i tecnici di acg clima?", expectInReply: /tecnici acg sono/i },
    ],
  },
  {
    name: "tecnici-guazzotti",
    sessionPrefix: "audit_tecn_guaz",
    turns: [
      { q: "tecnici guazzotti", expectInReply: /tecnici (di )?guazzotti/i },
    ],
  },
  {
    name: "tecnici-contesto",
    sessionPrefix: "audit_tecn_ctx",
    turns: [
      { q: "quali sono i tecnici di acg?", expectInReply: /tecnici acg/i },
      // Frase ambigua di follow-up: deve essere risolta nel contesto della domanda precedente
      { q: "dovresti vederli su firestore", expectNotInReply: /non.*ho.*capito|riformul/i, expectInReply: /(tecnic|aime|albanesi|dellafiore|piparo|tosca|troise)/i },
    ],
  },
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const consoleErrs = [];
  page.on("pageerror", e => consoleErrs.push(`pageerror: ${e.message}`));
  page.on("console", m => { if (m.type() === "error") consoleErrs.push(`console.error: ${m.text()}`); });

  console.log("→ Login…");
  await page.goto(PWA, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForSelector("#authEmail", { timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.fill("#authEmail", EMAIL);
  await page.fill("#authPassword", PASSWORD);
  await page.click("#authBtn");
  try {
    await page.waitForFunction(() => {
      const g = document.getElementById("authGate");
      const r = document.getElementById("appRoot");
      return g && g.hidden && r && !r.hidden;
    }, { timeout: 30000 });
  } catch {}
  await page.waitForTimeout(1500);
  console.log("  login OK");

  const report = { ts: new Date().toISOString(), scenarios: [] };

  for (const sc of SCENARIOS) {
    console.log(`\n═══ ${sc.name} ═══`);
    const sid = `${sc.sessionPrefix}_${Date.now().toString(36)}`;
    await page.evaluate(s => localStorage.setItem("nexo.nexus.sessionId", s), sid);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector("#nexusFab", { timeout: 10000 });
    await page.click("#nexusFab");
    await page.waitForSelector("#nexusInput", { timeout: 5000 });
    await page.waitForTimeout(800);

    const turnResults = [];
    for (let i = 0; i < sc.turns.length; i++) {
      const turn = sc.turns[i];
      const before = await page.$$eval(".nexus-bubble.assistant", e => e.length);

      let routerResp = null;
      const respHandler = async r => {
        if (r.url().includes("/nexusRouter") && r.request().method() === "POST") {
          try { routerResp = await r.json(); } catch {}
        }
      };
      page.on("response", respHandler);

      await page.locator("#nexusInput").fill(turn.q);
      await page.locator("#nexusInput").press("Enter");

      let reply = null;
      const start = Date.now();
      while (Date.now() - start < 45000) {
        const bubbles = await page.$$eval(".nexus-bubble.assistant", e => e.map(x => x.textContent.trim()));
        if (bubbles.length > before) { reply = bubbles[bubbles.length - 1]; break; }
        await page.waitForTimeout(500);
      }
      page.off("response", respHandler);

      const shotName = `${sc.name}-turn${i + 1}.png`;
      await page.screenshot({ path: path.join(SHOTS, shotName), fullPage: false });

      const matchExpected = turn.expectInReply ? turn.expectInReply.test(reply || "") : true;
      const matchUnwanted = turn.expectNotInReply ? turn.expectNotInReply.test(reply || "") : false;
      const ok = !!reply && matchExpected && !matchUnwanted;

      const result = {
        turn: i + 1,
        q: turn.q,
        reply,
        replyPreview: (reply || "(no reply)").slice(0, 400),
        intent: routerResp?.intent || null,
        stato: routerResp?.stato || null,
        collegaActual: routerResp?.intent?.collega || null,
        azione: routerResp?.intent?.azione || null,
        matchExpected,
        matchUnwanted,
        ok,
        screenshot: shotName,
      };
      turnResults.push(result);
      const flag = ok ? "✅" : "❌";
      console.log(`  turn ${i + 1}: ${flag} "${turn.q}"`);
      console.log(`     coll=${result.collegaActual} azione=${result.azione} stato=${result.stato}`);
      console.log(`     reply: ${(reply || "(timeout)").slice(0, 200).replace(/\s+/g, " ")}`);
      if (!ok) {
        if (!reply) console.log(`     → motivo: NESSUNA RISPOSTA (timeout)`);
        else if (turn.expectInReply && !matchExpected) console.log(`     → motivo: NON matcha attesa ${turn.expectInReply}`);
        else if (turn.expectNotInReply && matchUnwanted) console.log(`     → motivo: contiene pattern indesiderato ${turn.expectNotInReply}`);
      }
    }
    report.scenarios.push({ name: sc.name, sid, turns: turnResults });
  }

  await browser.close();
  fs.writeFileSync(path.join(SHOTS, "report.json"), JSON.stringify(report, null, 2));

  console.log("\n═══ RISULTATO ═══");
  let totalTurns = 0, okTurns = 0;
  for (const sc of report.scenarios) {
    for (const t of sc.turns) { totalTurns++; if (t.ok) okTurns++; }
  }
  console.log(`${okTurns}/${totalTurns} turni OK`);
  console.log(`Report: ${path.join(SHOTS, "report.json")}`);
  process.exit(okTurns === totalTurns ? 0 : 1);
})().catch(e => { console.error("FATAL:", e); process.exit(1); });
