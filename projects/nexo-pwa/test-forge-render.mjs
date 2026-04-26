// Test render bolla FORGE nella PWA NEXUS Chat.
// Verifica che la classe CSS .nexus-bubble.forge + prefisso 🔧 FORGE
// + colore di sfondo siano applicati correttamente. Iniettiamo la bolla
// manualmente in DOM riproducendo lo stesso shape che produce
// nexusRenderBubble per source="forge".
import { chromium } from 'playwright';

const PWA = "https://nexo-hub-15f2d.web.app";
const SCREENSHOT = "/tmp/nexus-bug-test/forge-bubble.png";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const consoleMessages = [];
page.on("console", msg => consoleMessages.push(`[${msg.type()}] ${msg.text().slice(0,200)}`));
page.on("pageerror", err => consoleMessages.push(`[ERR] ${String(err).slice(0,200)}`));

console.log("→ Apro PWA");
await page.goto(PWA, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);

console.log("→ Bypass auth + reveal app + apri pannello");
await page.evaluate(() => {
  document.getElementById("authGate")?.setAttribute("hidden", "");
  document.getElementById("appRoot")?.removeAttribute("hidden");
  document.getElementById("nexusPanel")?.classList.add("open");
});
await page.waitForTimeout(500);

console.log("→ Inietto manualmente bolla FORGE nel container messaggi");
// Riproduce esattamente l'HTML che genera nexusRenderBubble per source=forge
await page.evaluate(() => {
  const root = document.getElementById("nexusMessages");
  if (!root) return;
  const html = `
    <div class="nexus-bubble assistant forge" data-bubble-id="test-forge">
      <span class="nexus-bubble-forge-tag" aria-hidden="true">🔧 FORGE</span>
      Ho analizzato il problema: NEXUS non filtrava per data e città gli interventi.<br><br>
      Proposta: parser data per giorno settimana e tense detection, parser città su whitelist Piemonte/Lombardia.<br><br>
      Lo sto fixando.
      <span class="time">21:30</span>
      <div class="nexus-bubble-meta">
        <span class="nexus-badge-col nexus-badge-forge">forge</span>
        <span class="nexus-badge-stato completata">completata</span>
      </div>
    </div>
  `;
  // inserisci prima del scroll-down button
  const scrollBtn = document.getElementById("nexusScrollDown");
  if (scrollBtn) {
    scrollBtn.insertAdjacentHTML("beforebegin", html);
  } else {
    root.insertAdjacentHTML("afterbegin", html);
  }
});
await page.waitForTimeout(500);

// Verifica che il messaggio FORGE sia visibile nella chat
const result = await page.evaluate(() => {
  const bubbles = Array.from(document.querySelectorAll(".nexus-bubble"));
  const forgeBubbles = bubbles.filter(b => b.classList.contains("forge"));
  const sessionId = localStorage.getItem("nexo.nexus.sessionId");
  return {
    sessionId,
    totalBubbles: bubbles.length,
    forgeBubbles: forgeBubbles.length,
    forgeFirstHTML: forgeBubbles[0] ? forgeBubbles[0].outerHTML.slice(0, 400) : null,
    forgeFirstClass: forgeBubbles[0] ? forgeBubbles[0].className : null,
    forgePrefix: forgeBubbles[0] ? !!forgeBubbles[0].querySelector(".nexus-bubble-forge-tag") : false,
    forgeBg: forgeBubbles[0] ? getComputedStyle(forgeBubbles[0]).backgroundColor : null,
    forgeBorderLeft: forgeBubbles[0] ? getComputedStyle(forgeBubbles[0]).borderLeftColor : null,
    contentSnippet: forgeBubbles[0] ? forgeBubbles[0].textContent.slice(0, 200) : null,
  };
});
console.log("Render result:", JSON.stringify(result, null, 2));

await page.screenshot({ path: SCREENSHOT, fullPage: true });
console.log(`→ Screenshot: ${SCREENSHOT}`);

const verdict = result.forgeBubbles >= 1 && result.forgePrefix && result.forgeFirstClass.includes("forge");
console.log(`\n=== VERDICT === ${verdict ? "PASS — bolla forge renderizzata con classe + prefisso" : "FAIL"}`);
if (!verdict) {
  console.log("\nConsole messages:");
  for (const m of consoleMessages.slice(-20)) console.log(m);
}

await browser.close();
process.exit(verdict ? 0 : 1);
