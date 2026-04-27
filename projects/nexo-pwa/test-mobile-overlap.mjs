import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto("https://nexo-hub-15f2d.web.app", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);

// Bypass auth + reveal globalBtn
await page.evaluate(() => {
  document.getElementById("authGate")?.setAttribute("hidden", "");
  document.getElementById("appRoot")?.removeAttribute("hidden");
  const rb = document.getElementById("reportBugBtn");
  if (rb) rb.hidden = false;
});
await page.waitForTimeout(300);

console.log("\n=== STATE 1: chat CHIUSA ===");
let s1 = await page.evaluate(() => {
  const g = document.getElementById("reportBugBtn");
  return { globalVisible: !!g && getComputedStyle(g).display !== "none", bodyHasClass: document.body.classList.contains("nexus-chat-open") };
});
console.log(JSON.stringify(s1));

console.log("\n=== STATE 2: chat APERTA (simulo nexusOpen) ===");
await page.evaluate(() => {
  document.getElementById("nexusPanel")?.classList.add("open");
  document.body.classList.add("nexus-chat-open");
});
await page.waitForTimeout(300);
let s2 = await page.evaluate(() => {
  const g = document.getElementById("reportBugBtn");
  const cb = document.getElementById("nexusBugBtn");
  const panel = document.getElementById("nexusPanel");
  return {
    bodyHasClass: document.body.classList.contains("nexus-chat-open"),
    globalDisplay: g ? getComputedStyle(g).display : null,
    globalVisible: !!g && getComputedStyle(g).display !== "none",
    chatBtnVisible: !!cb && getComputedStyle(cb).display !== "none",
    chatBtnRect: cb ? cb.getBoundingClientRect() : null,
    panelZ: panel ? getComputedStyle(panel).zIndex : null,
  };
});
console.log(JSON.stringify(s2));

console.log("\n=== STATE 3: tap su bottone chat 🐛 ===");
await page.tap("#nexusBugBtn");
await page.waitForTimeout(500);
let s3 = await page.evaluate(() => {
  const m = document.getElementById("nexusBugModal");
  return { modalAria: m?.getAttribute("aria-hidden"), display: m ? getComputedStyle(m).display : null };
});
console.log(JSON.stringify(s3));

const verdict = !s2.globalVisible && s2.chatBtnVisible && s2.panelZ === "80" && s3.modalAria === "false";
console.log("\nVERDICT:", verdict ? "PASS" : "FAIL");
await page.screenshot({ path: "/tmp/nexus-bug-test/mobile-after-fix.png" });
await browser.close();
process.exit(verdict ? 0 : 1);
