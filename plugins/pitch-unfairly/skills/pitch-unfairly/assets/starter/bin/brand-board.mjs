// Screenshot the brand board for review: artifacts/brand-board.png
// Usage: node bin/brand-board.mjs [base-url]
import puppeteer from 'puppeteer';
import { mkdir } from 'node:fs/promises';

const base = (process.argv[2] ?? 'http://localhost:4321').replace(/\/$/, '');
await mkdir('artifacts', { recursive: true });
const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 0.75 });
  await page.goto(`${base}/brand-board`, { waitUntil: 'load', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 600));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: 'artifacts/brand-board.png', captureBeyondViewport: false });
  console.log('artifacts/brand-board.png');
} finally {
  await browser.close();
}
