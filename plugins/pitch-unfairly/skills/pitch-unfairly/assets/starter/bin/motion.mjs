// Filmstrips of each slide's entrance, so motion can be reviewed like layout.
// Usage: node bin/motion.mjs [base-url] [out-dir]
// Writes <out>/motion/NN-<slide>.png (one row of frames per slide) and
// <out>/motion-sheet.png (every slide's strip stacked).
import puppeteer from 'puppeteer';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { assertThisDeck } from './this-deck.mjs';

// Positional arguments, ignoring flags such as --quick.
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const base = (args[0] ?? 'http://localhost:4321').replace(/\/$/, '');
await assertThisDeck(base).catch((error) => {
  console.error(`✗ ${error.message}`);
  process.exit(1);
});
const out = args[1] ?? 'artifacts';
const FRAMES_MS = [0, 150, 350, 700, 1200, 2600];
const dir = join(out, 'motion');
await mkdir(dir, { recursive: true });

const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 810, deviceScaleFactor: 1 });
  await page.goto(`${base}/#1`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__deckReady === true, { timeout: 15000 });
  // Hide the controls so frames show only the slide.
  await page.addStyleTag({ content: '.deck-nav, .deck-notes { display: none !important; }' });
  const ids = await page.$$eval('.slide', (s) => s.map((x) => x.id.replace(/^slide-/, '')));
  const strips = [];
  for (const [i, id] of ids.entries()) {
    // Jump to the slide and replay its entrance from the start.
    const t0 = Date.now();
    await page.evaluate((n) => window.deckReplay(n), i);
    const frames = [];
    for (const at of FRAMES_MS) {
      const wait = t0 + at - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      // Never let the capture resize the viewport mid-animation.
      const shot = await page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 70, captureBeyondViewport: false });
      frames.push({ at: Date.now() - t0, src: `data:image/jpeg;base64,${shot}` });
    }
    const file = join(dir, `${String(i + 1).padStart(2, '0')}-${id}.png`);
    await sheet(frames, file, `${i + 1} · ${id}`);
    strips.push(file);
  }
  // Stack every strip into one sheet.
  const all = await Promise.all(strips.map(async (f) => `data:image/png;base64,${(await readFile(f)).toString('base64')}`));
  const p = await browser.newPage();
  await p.setViewport({ width: 6 * 240 + 7 * 8, height: 200 });
  await p.setContent(`<body style="margin:0;background:#222">${all.map((s) => `<img src="${s}" style="display:block;width:100%">`).join('')}</body>`);
  await p.screenshot({ path: join(out, 'motion-sheet.png'), fullPage: true });
  console.log(`motion: ${strips.length} strips in ${dir}, sheet at ${join(out, 'motion-sheet.png')}`);
} finally {
  await browser.close();
}

async function sheet(frames, file, label) {
  const p = await browser.newPage();
  await p.setViewport({ width: frames.length * 240 + (frames.length + 1) * 8, height: 200 });
  await p.setContent(`<body style="margin:0;padding:8px;background:#222;font:11px monospace;color:#bbb">
    <div style="padding:0 0 6px">${label}</div>
    <div style="display:grid;grid-template-columns:repeat(${frames.length},240px);gap:8px">
    ${frames.map((f) => `<figure style="margin:0"><img src="${f.src}" style="width:100%;display:block"><figcaption>${f.at} ms</figcaption></figure>`).join('')}
  </div></body>`);
  await p.screenshot({ path: file, fullPage: true });
  await p.close();
}
