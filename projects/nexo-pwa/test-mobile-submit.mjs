import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const consoleMessages = [];
page.on("console", m => { if (/nexus-bug/.test(m.text())) consoleMessages.push(m.text()); });

await page.goto("https://nexo-hub-15f2d.web.app", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
await page.evaluate(() => {
  document.getElementById("authGate")?.setAttribute("hidden", "");
  document.getElementById("appRoot")?.removeAttribute("hidden");
  document.getElementById("nexusPanel")?.classList.add("open");
  document.body.classList.add("nexus-chat-open");
});
await page.waitForTimeout(500);

console.log("→ tap su 🐛 chat");
await page.tap("#nexusBugBtn");
await page.waitForTimeout(500);

console.log("→ scrivo nota");
await page.fill("#nexusBugNote", "test mobile - bug button chat from playwright");

console.log("→ tap su Invia");
await page.tap("#nexusBugSubmit");
await page.waitForTimeout(2000);

const errText = await page.textContent("#nexusBugError").catch(() => null);
console.log("Error text after submit:", errText);

console.log("\nConsole [nexus-bug]:");
for (const m of consoleMessages) console.log(" ", m);

await browser.close();
