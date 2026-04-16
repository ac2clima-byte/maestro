const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.goto('file://' + path.resolve(__dirname, 'pagina.html'));
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.resolve(__dirname, 'screenshot.png'), fullPage: false });
  await browser.close();
  console.log('OK');
})();
