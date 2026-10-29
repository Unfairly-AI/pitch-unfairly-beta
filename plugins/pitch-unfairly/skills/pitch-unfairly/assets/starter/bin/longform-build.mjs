// Build a long-form document (an e-book, whitepaper, report or guidebook) from longform/:
// the web version, the print PDF, and the checks on both.
//   npm run longform:build              everything: web, PDF, print checks, page images, the QA gate
//   npm run longform:build -- --web     the web version only (fast, for layout work)
//   npm run longform:build -- --no-gate skip the web QA gate (never publishable)
// Writes dist-longform/ (index.html, deck.pdf, index.txt, assets, fonts), artifacts/longform/
// (report.json, REPORT.md, pages/ and contact-sheet.png when poppler's pdftoppm is installed)
// and artifacts/gate/ (the gate stamp the upload needs). Fails when anything has a problem.
import puppeteer from 'puppeteer';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brandCss, cssFamily, fontFaceCss } from './brand-lib.mjs';
import { fontDir, fontsourceCss } from './site-build.mjs';
import { pageShell } from './site/fill.mjs';
import { htmlToText } from './site/text.mjs';
import { brandFileProblem } from './site/public-files.mjs';
import { bannedEntries } from './site/banned.mjs';
import { GATE_SCREENS, distDigest, gateStamp, runGate, writeGateFiles } from './site/gate.mjs';
import { allowedColors } from './collateral/rules.mjs';
import { decodePng } from './collateral/seams.mjs';
import { countPdfPages } from './render-pdf.mjs';
import { serveDir } from './serve.mjs';
import { refuseInCodexSandbox } from './browser-guard.mjs';
import { stableLaunch } from './stable-shots.mjs';
import { resolveBrand } from './longform/brand.mjs';
import { documentBody, loadDocument, pageCss, pageGeometry, sourceChecks, startPages } from './longform/doc.mjs';
import { PRINT_CHECK } from './longform/print-check.mjs';
import { LONGFORM_ENGINE } from './longform/version.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const OUT = 'dist-longform';
export const ART = 'artifacts/longform';
export const PPI = { warn: 200, min: 120 };
// The web version is also shot this wide: big screens hide bugs the gate's widths don't reach.
const WIDE = [2560, 1440];

async function filesUnder(dir, prefix = '') {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    if (e.isDirectory()) out.push(...await filesUnder(join(dir, e.name), `${prefix}${e.name}/`));
    else out.push(`${prefix}${e.name}`);
  }
  return out.sort();
}

/** Writes dist-longform/: fonts, brand images, assets, scripts, index.txt, and index.html with these contents numbers. */
export async function writeWeb({ root = '.', out = OUT, loaded, brand, pages = null }) {
  const { kit } = brand;
  const at = (p) => join(root, p);
  await rm(at(out), { recursive: true, force: true });
  await mkdir(join(at(out), 'js'), { recursive: true });
  let fontCss = '';
  for (const pkg of new Set(['display', 'body', 'mono'].map((r) => kit.typography?.[r]).filter((t) => t?.source === 'fontsource').map((t) => t.package))) {
    if (!fontDir(root, pkg)) throw new Error(`Font package ${pkg} isn't installed or saved in vendor/fonts. Run npm run brand:apply.`);
    const f = await fontsourceCss(root, pkg);
    fontCss += f.css;
    for (const file of f.files) await cp(join(f.dir, 'files', file), join(at(out), 'fonts', f.name, file));
  }
  for (const rel of await filesUnder(at('brand'))) if (!brandFileProblem(rel)) await cp(join(at('brand'), rel), join(at(out), 'brand', rel));
  for (const rel of loaded.assets) await cp(join(loaded.dir, 'assets', rel), join(at(out), 'assets', rel));
  const css = [fontCss, brandCss(kit, fontFaceCss(kit, 'brand/'), 'brand/'), await readFile(join(here, 'site/base.css'), 'utf8'), await readFile(join(here, 'longform/base.css'), 'utf8'), pageCss(loaded.doc, kit, loaded.chapters), loaded.styles].join('\n');
  const body = documentBody(loaded, pages);
  await writeFile(join(at(out), 'index.html'), pageShell({ site: { ...loaded.doc, sample: false }, body, css, model: loaded.doc.model ?? {} }));
  await writeFile(join(at(out), 'index.txt'), `${[`# ${loaded.doc.title}`, loaded.doc.description ?? '', htmlToText(body)].filter(Boolean).join('\n\n')}\n`);
  await cp(join(here, 'site/app.js'), join(at(out), 'js/app.js'));
  await cp(join(here, 'site/model.mjs'), join(at(out), 'js/model.mjs'));
}

const PDF_OPTS = { preferCSSPageSize: true, printBackground: true, outline: true, tagged: true };

/** Opens the document for print: print media, the page's text-block width, fonts loaded, html.is-print. */
async function openForPrint(browser, url, geometry) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewport({ width: Math.round(geometry.content.w * 96), height: Math.round(geometry.content.h * 96), deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.emulateMediaType('print');
  await page.evaluate(async () => {
    document.documentElement.classList.add('is-print');
    await document.fonts.ready;
    await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
  });
  return { page, errors };
}

/** Pages each part prints on alone: front (cover + contents), each chapter, back. */
async function countParts(page, chapters) {
  const only = async (selector) => {
    await page.evaluate((sel) => {
      const keep = [...document.querySelectorAll(sel)];
      for (const el of document.querySelectorAll('main > *')) if (!keep.includes(el)) el.style.setProperty('display', 'none', 'important');
      // Printed alone, a part's own page break would open on a blank page.
      if (keep[0]) keep[0].style.breakBefore = 'auto';
    }, selector);
    const n = countPdfPages(Buffer.from(await page.pdf(PDF_OPTS)));
    await page.evaluate(() => { for (const el of document.querySelectorAll('main > *')) { el.style.removeProperty('display'); el.style.breakBefore = ''; } });
    return n;
  };
  const front = await only('.lf-cover, .lf-contents');
  const parts = [];
  for (const c of chapters) parts.push(await only(`#${c.id}`));
  const back = (await page.$('.lf-back')) ? await only('.lf-back') : 0;
  return { front, parts, back };
}

/** Each PDF page as a PNG, and a contact sheet; null when pdftoppm isn't installed. */
async function pageImages(browser, pdfPath, outDir) {
  try { execFileSync('pdftoppm', ['-v'], { stdio: 'ignore' }); } catch { return null; }
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  execFileSync('pdftoppm', ['-png', '-r', '60', pdfPath, join(outDir, 'page')]);
  const files = (await readdir(outDir)).filter((f) => f.endsWith('.png')).sort();
  const blank = [];
  for (const [i, f] of files.entries()) {
    const img = decodePng(await readFile(join(outDir, f)));
    const { data, channels } = img;
    let min = 255, max = 0;
    for (let p = 0; p < data.length; p += channels * 7) { const v = data[p] + data[p + 1] + data[p + 2]; if (v < min) min = v; if (v > max) max = v; }
    if (max - min < 12) blank.push(i + 1);
  }
  const sheet = join(dirname(outDir), 'contact-sheet.png');
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });
  const imgs = await Promise.all(files.map(async (f, i) => `<figure><img src="data:image/png;base64,${(await readFile(join(outDir, f))).toString('base64')}"><figcaption>${i + 1}</figcaption></figure>`));
  await page.setContent(`<style>body{margin:16px;background:#888;font:12px sans-serif;display:grid;grid-template-columns:repeat(6,1fr);gap:14px}figure{margin:0}img{width:100%;display:block;box-shadow:0 1px 4px #0006}figcaption{text-align:center;color:#fff;padding-top:4px}</style>${imgs.join('')}`, { waitUntil: 'load' });
  await page.screenshot({ path: sheet, fullPage: true });
  await page.close();
  return { files: files.map((f) => join(outDir, f)), blank, sheet };
}

export async function buildLongform({ root = '.', web = false, gate = true, log = console.log } = {}) {
  const brand = resolveBrand(root);
  const loaded = loadDocument(root);
  const { entries, problems: bannedProblems } = bannedEntries(brand.kit);
  const source = sourceChecks(loaded, entries);
  const report = { engine: LONGFORM_ENGINE, brand: { schema: brand.schema, source: brand.source }, problems: [...bannedProblems, ...source.problems], warnings: [...source.warnings], chapters: loaded.chapters.map((c) => ({ id: c.id, title: c.title, running: c.running })) };
  if (report.problems.length) return finish(report, log);
  await writeWeb({ root, loaded, brand });
  if (web) { log(`Built ${OUT}/index.html (web only): ${loaded.chapters.length} chapters.`); return finish(report, log, { web: true }); }

  const g = pageGeometry(loaded.doc);
  const server = await serveDir(join(root, OUT));
  const browser = await puppeteer.launch(stableLaunch());
  try {
    // Count each part alone, write the numbers into the contents, and count again until the front settles.
    let counts = null;
    let pages = null;
    for (let round = 0; round < 3; round++) {
      const { page } = await openForPrint(browser, `${server.url}/`, g);
      const c = await countParts(page, loaded.chapters);
      await page.close();
      if (counts && c.front === counts.front && c.back === counts.back && c.parts.every((n, i) => n === counts.parts[i])) break;
      counts = c;
      pages = startPages(c.front, c.parts, loaded.chapters, c.back);
      await writeWeb({ root, loaded, brand, pages: pages.pages });
    }
    report.pages = { front: counts.front, back: counts.back, chapters: Object.fromEntries(loaded.chapters.map((c, i) => [c.id, { first: pages.pages[c.id], count: counts.parts[i] }])) };

    const { page, errors } = await openForPrint(browser, `${server.url}/`, g);
    const kit = brand.kit;
    const fonts = loaded.doc.fonts ?? ['display', 'body', 'mono'].map((r) => kit.typography?.[r]).filter((t) => t?.family).map((t) => cssFamily(t));
    const checks = await page.evaluate(PRINT_CHECK, { palette: [...allowedColors(kit, loaded.doc.neutrals ?? [])], fonts, contentPx: Math.round(g.content.w * 96), ...{ ppiWarn: PPI.warn, ppiMin: PPI.min } });
    report.problems.push(...checks.problems, ...errors.map((e) => `page error: ${e}`));
    report.warnings.push(...checks.warnings);
    // The contents must match what the reader finds: every chapter, in order, on its page.
    const toc = await page.evaluate(() => [...document.querySelectorAll('.lf-toc a')].map((a) => ({ id: a.getAttribute('href').slice(1), page: Number(a.querySelector('.lf-toc-p')?.textContent) })));
    const ids = loaded.chapters.map((c) => c.id);
    if (toc.map((t) => t.id).join() !== ids.join()) report.problems.push(`the contents lists ${toc.map((t) => t.id).join(', ')} but the chapters are ${ids.join(', ')}`);
    for (const t of toc) if (t.page !== pages.pages[t.id]) report.problems.push(`the contents says #${t.id} starts on page ${t.page}; it starts on ${pages.pages[t.id]}`);
    const pdf = Buffer.from(await page.pdf(PDF_OPTS));
    await page.close();
    const pdfPath = join(root, OUT, 'deck.pdf');
    await writeFile(pdfPath, pdf);
    const total = countPdfPages(pdf);
    report.pdf = { path: pdfPath, pages: total, bytes: pdf.length, size: loaded.doc.page ?? 'letter' };
    if (total !== pages.total) report.problems.push(`the PDF has ${total} pages but its parts add up to ${pages.total}: a chapter breaks differently in the whole document. Check the page before the mismatch.`);

    const images = await pageImages(browser, pdfPath, join(root, ART, 'pages'));
    if (!images) report.warnings.push('no page images: install poppler (pdftoppm) to get artifacts/longform/pages and a contact sheet, and the blank-page check');
    else {
      report.page_images = { dir: join(ART, 'pages'), sheet: images.sheet };
      for (const n of images.blank) report.problems.push(`PDF page ${n} is blank`);
    }

    if (gate) {
      const out = join(root, 'artifacts/gate');
      await rm(out, { recursive: true, force: true });
      await mkdir(join(out, 'shots'), { recursive: true });
      const result = await runGate(browser, server.url, { screens: GATE_SCREENS, entries, out, workers: 4 });
      const stamp = gateStamp({ digest: await distDigest(join(root, OUT)), pages: result.pages, screens: GATE_SCREENS, findings: result.findings, entries });
      await writeGateFiles(out, stamp, result);
      report.gate = { clean: stamp.clean, findings: result.findings.length, sheet: result.sheet };
      for (const f of result.findings) report.problems.push(`web gate [${f.check}] ${f.page}: ${f.message}${f.widths?.length ? ` @ ${f.widths.join(', ')}` : ''}`);
      // And the widest screens, by eye.
      const shot = await browser.newPage();
      await shot.setViewport({ width: WIDE[0], height: WIDE[1] });
      await shot.goto(`${server.url}/`, { waitUntil: 'networkidle0' });
      await shot.screenshot({ path: join(root, ART, `web-${WIDE[0]}.png`) });
      await shot.close();
    } else report.warnings.push('the web QA gate was skipped (--no-gate): this build can\'t publish');
  } finally {
    await browser.close();
    await server.close();
  }
  return finish(report, log);
}

async function finish(report, log, { web = false } = {}) {
  await mkdir(ART, { recursive: true });
  await writeFile(join(ART, 'report.json'), JSON.stringify(report, null, 2));
  const lines = ['# Long-form report', ''];
  if (report.pdf) lines.push(`PDF: ${report.pdf.pages} pages, ${report.pdf.size}, ${(report.pdf.bytes / 1024).toFixed(0)} KB.`, '');
  if (report.pages) {
    lines.push('| Chapter | Starts | Pages |', '|---|---|---|');
    for (const c of report.chapters) lines.push(`| ${c.title} | ${report.pages.chapters[c.id].first} | ${report.pages.chapters[c.id].count} |`);
    lines.push('');
  }
  lines.push(...report.problems.map((p) => `- ✗ ${p}`), ...report.warnings.map((w) => `- ! ${w}`));
  await writeFile(join(ART, 'REPORT.md'), `${lines.join('\n')}\n`);
  for (const p of report.problems) log(`✗ ${p}`);
  for (const w of report.warnings) log(`! ${w}`);
  if (!report.problems.length && !web) log(`\n✓ ${report.pdf ? `${report.pdf.pages}-page PDF, ` : ''}web version${report.gate ? ' and gate' : ''} clean. Look at ${ART}/contact-sheet.png and artifacts/gate/contact-sheet.png before handing it over.`);
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  refuseInCodexSandbox('longform:build');
  const args = process.argv.slice(2);
  buildLongform({ web: args.includes('--web'), gate: !args.includes('--no-gate') })
    .then((r) => { if (r.problems.length) process.exit(1); })
    .catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
}
