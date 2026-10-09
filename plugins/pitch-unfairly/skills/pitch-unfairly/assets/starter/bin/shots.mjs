// Screenshots for visual review: every slide on the stage and on a phone,
// contact sheets of each, and the real exported PDF.
// Usage: node bin/shots.mjs [base-url] [out-dir]
import puppeteer from 'puppeteer';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { renderPdf } from './render-pdf.mjs';
import { assertThisDeck } from './this-deck.mjs';

// Positional arguments, ignoring flags such as --quick.
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const base = (args[0] ?? 'http://localhost:4321').replace(/\/$/, '');
await assertThisDeck(base).catch((error) => {
  console.error(`✗ ${error.message}`);
  process.exit(1);
});
const out = args[1] ?? 'artifacts';
const run = promisify(execFile);

await rm(out, { recursive: true, force: true });
const browser = await puppeteer.launch({ headless: true });

// The deck's own controls (slide counter, arrows, Notes, PDF) sit over the
// slides on a phone. They aren't part of any slide, so they stay out of the
// screenshots: a reviewer once flagged the PDF button as a slide defect 37 times.
const HIDE_CHROME = '.deck-nav, .deck-notes, astro-dev-toolbar { display: none !important; }';

async function capture(name, viewport, query) {
  const dir = join(out, name);
  await mkdir(dir, { recursive: true });
  const page = await browser.newPage();
  await page.setViewport(viewport);
  // Reduced motion: every entrance jumps to its end state, which is what the
  // review judges, so the phone pass doesn't wait out each slide's animation.
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.goto(`${base}/${query}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__deckReady === true, { timeout: 15000 }).catch(() => {});
  await page.addStyleTag({ content: HIDE_CHROME });
  const ids = await page.$$eval('.slide', (slides) => slides.map((s) => s.id));
  const files = [];
  for (const [i, id] of ids.entries()) {
    const file = join(dir, `${String(i + 1).padStart(2, '0')}-${id.replace(/^slide-/, '')}.png`);
    if (name === 'mobile') {
      // Scroll the slide into place. With reduced motion, CSS entrances finish
      // at once; a scripted one that ignores it (a counter, typed text) gets
      // until the slide stops changing, capped so a loop can't stall.
      await page.evaluate((id) => document.getElementById(id).scrollIntoView(), id);
      await page.evaluate(async (id) => {
        const slide = document.getElementById(id);
        const pause = (ms) => new Promise((r) => setTimeout(r, ms));
        const snapshot = () => slide.innerHTML;
        for (let last = snapshot(), still = 0, t = 0; still < 2 && t < 4000; t += 100) {
          await pause(100);
          const now = snapshot();
          still = now === last ? still + 1 : 0;
          last = now;
        }
      }, id);
    }
    await (await page.$(`[id="${id}"]`)).screenshot({ path: file });
    files.push(file);
  }
  await page.close();
  console.log(`${name}: ${files.length} screenshots in ${dir}`);
  return files;
}

async function contactSheet(files, file, columns, width) {
  const imgs = await Promise.all(files.map(async (f) => `data:image/png;base64,${(await readFile(f)).toString('base64')}`));
  const page = await browser.newPage();
  await page.setViewport({ width: columns * width + (columns + 1) * 16, height: 400 });
  await page.setContent(`<body style="margin:0;padding:16px;background:#222;display:grid;grid-template-columns:repeat(${columns},${width}px);gap:16px;font:12px monospace;color:#bbb">
    ${imgs.map((src, i) => `<figure style="margin:0"><img src="${src}" style="width:100%;display:block;outline:1px solid #444"><figcaption style="padding-top:4px">${files[i].split('/').pop()}</figcaption></figure>`).join('')}
  </body>`);
  await page.screenshot({ path: file, fullPage: true });
  await page.close();
  console.log(`contact sheet: ${file}`);
}

try {
  // Stage at half resolution: 960x540 per slide, the same render the PDF prints.
  // The stage and the phone are separate pages, so they run side by side.
  const [stage, mobile] = await Promise.all([
    capture('stage', { width: 1920, height: 1080, deviceScaleFactor: 0.5 }, '?pdf=1'),
    capture('mobile', { width: 393, height: 745, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }, ''),
  ]);
  await Promise.all([
    contactSheet(stage, join(out, 'contact-sheet.png'), 3, 480),
    contactSheet(mobile, join(out, 'contact-sheet-mobile.png'), 6, 197),
  ]);

  // --quick skips the PDF (the slowest part) for fast iteration; the full run and the build still make it.
  const bytes = process.argv.includes('--quick') ? null : await renderPdf(browser, base).catch((error) => {
    console.error(`PDF export failed: ${error.message}`);
    process.exitCode = 1;
    return null;
  });
  if (bytes) {
    const pdf = join(out, 'deck.pdf');
    await writeFile(pdf, bytes);
    console.log(`pdf: ${pdf}`);
    try {
      await mkdir(join(out, 'pdf'), { recursive: true });
      await run('pdftoppm', ['-png', '-scale-to', '960', pdf, join(out, 'pdf', 'page')]);
      console.log(`pdf pages: ${join(out, 'pdf')}`);
    } catch {
      console.log('pdftoppm not found; open deck.pdf to check the pages (poppler provides pdftoppm)');
    }
  }
} finally {
  await browser.close();
}
