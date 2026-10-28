// The gate between a site and a link: checks the source, builds, then opens
// the page in a browser at phone, laptop, and wide widths. It screenshots each
// section, works every control, looks for overflow, broken images, and script
// errors, writes the PDF (dist-site/deck.pdf, one 16:9 page per section, like
// a deck), and stamps a clean pass.
//
//   node bin/site-audit.mjs            screenshots land in artifacts/site/
//   node bin/site-audit.mjs --latest   as if pinned to this engine: every rule blocks, and
//                                      what the site's own pin doesn't block is marked new
import puppeteer from 'puppeteer';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CURRENT_PIN, checkAgainstLatest, checkSite, pinnedMinorOf } from './site/check.mjs';
import { loadSite } from './site-check.mjs';
import { buildSite } from './site-build.mjs';
import { serveDir } from './serve.mjs';
import { refuseInCodexSandbox } from './browser-guard.mjs';
import { settleForShots, stableLaunch } from './stable-shots.mjs';
import { exerciseControls, printStateProblems, selectPdfState } from './site/interact.mjs';
import { EXTRA_WIDTHS, PHONE_MAX, boxedTextProblems, brandDiff, layoutProblems, motionProblems, previewProblems, qualifierProblems, sampleBandProblems, sampleNames, visualSlop } from './site/page-lint.mjs';

const STAMP = 'artifacts/site-audit-pass.json';
const OUT = 'artifacts/site';
const MODES = [
  { name: 'phone', width: 390, height: 844, mobile: true },
  { name: 'laptop', width: 1280, height: 800 },
  { name: 'wide', width: 1920, height: 1080 },
];

async function* walk(path) {
  const entries = await readdir(path, { withFileTypes: true }).catch(() => []);
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = join(path, e.name);
    if (e.name.startsWith('.') || full === join('brand', 'capture')) continue;
    if (e.isDirectory()) yield* walk(full);
    else yield full;
  }
}
/** A fingerprint of everything that changes the site. */
export async function siteFingerprint() {
  const hash = createHash('sha256');
  for (const top of ['site', 'brand']) for await (const f of walk(top)) hash.update(f).update('\0').update(await readFile(f)).update('\0');
  return hash.digest('hex');
}
export async function siteAuditBlocker() {
  const stamp = JSON.parse(await readFile(STAMP, 'utf8').catch(() => 'null'));
  if (!stamp) return 'This site has no clean audit. Run `npm run site:audit` until it says "All modes clean".';
  if (stamp.fingerprint !== (await siteFingerprint())) return 'The site changed after its last clean audit. Run `npm run site:audit` again.';
  return null;
}

// The PDF reads like a deck: each section (with any unmarked blocks after it,
// such as a stats band) on its own 16:9 page, laid out at slide size in the
// site's screen design. Each section loses its web padding, gets the same page
// margin, and is scaled to fill the page: up for a short section, down for a
// tall one. <html> carries class is-pdf meanwhile, so a site can design its
// pages on purpose. Toggles stay closed unless marked data-pdf-open.
export const PDF_PAGE = { width: 1280, height: 720, margin: 56, maxScale: 1.25 };
// report collects the print-state checks: an interactive page with no result,
// web-only instructions, no way to act (site/interact.mjs).
export async function writeDeckPdf(browser, base, path, report = { errors: [], warnings: [] }) {
  const page = await browser.newPage();
  await page.setViewport({ width: PDF_PAGE.width, height: PDF_PAGE.height, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.goto(`${base}/?static`, { waitUntil: 'networkidle0' });
  await page.emulateMediaType('screen');
  // data-pdf-state picks the scenario a section prints, before the page is cut into pages.
  const state = await selectPdfState(page);
  const fits = await page.evaluate(({ width, height, margin, maxScale }) => {
    document.documentElement.classList.add('is-pdf');
    // data-pdf-open opens a toggle on the page; data-pdf-hide leaves out what only works on the web.
    document.querySelectorAll('details[data-pdf-open]').forEach((d) => (d.open = true));
    document.querySelectorAll('[data-pdf-hide]').forEach((el) => el.remove());
    const main = document.querySelector('main') ?? document.body;
    const groups = [];
    for (const el of [...main.children]) {
      if (el.matches('[data-section]') || !groups.length) groups.push([el]);
      else groups[groups.length - 1].push(el);
    }
    const css = document.createElement('style');
    css.textContent = `@page { size: ${width}px ${height}px; margin: 0; }
      html, body { margin: 0 !important; background: none !important; overflow: visible !important; }
      body > *:not(.pdf-deck) { display: none !important; }
      .pdf-page { width: ${width}px; height: ${height}px; overflow: hidden; position: relative; break-after: page; display: flex; align-items: center; justify-content: center; }
      .pdf-fit { flex: none; transform-origin: center center; }
      .pdf-fit .wrap, .pdf-fit > * > .wrap { padding-inline: 0 !important; max-width: none !important; }
      .pdf-fit > * { margin-top: 0 !important; margin-bottom: 0 !important; padding-block: 0 !important; border-top: 0 !important; border-bottom: 0 !important; background: none !important; min-height: 0 !important; }
      .pdf-fit > * + * { margin-top: 40px !important; }
      /* Moving a section restarts its entrances; the page shows their end state. */
      *, *::before, *::after { animation: none !important; transition: none !important; }
      .reveal { opacity: 1 !important; transform: none !important; }`;
    document.head.appendChild(css);
    const deck = document.createElement('div');
    deck.className = 'pdf-deck';
    const out = [];
    for (const group of groups) {
      const pageEl = document.createElement('div');
      pageEl.className = 'pdf-page';
      const fit = document.createElement('div');
      fit.className = 'pdf-fit';
      pageEl.style.background = getComputedStyle(group[0]).backgroundColor;
      pageEl.dataset.tone = group[0].dataset.tone ?? '';
      group.forEach((el) => fit.appendChild(el));
      pageEl.appendChild(fit);
      deck.appendChild(pageEl);
      out.push({ fit, name: group[0].dataset.section ?? group[0].id ?? 'section' });
    }
    document.body.appendChild(deck);
    const room = height - 2 * margin;
    const across = width - 2 * margin;
    return out.map(({ fit, name }) => {
      // Lay the section out at the width it will fill once scaled, so every
      // page keeps the same margin: wider for a tall section (it shrinks less),
      // narrower for a short one (it grows without clipping). A different
      // width changes the height, so settle in a few steps.
      fit.style.width = `${across}px`;
      const natural = fit.getBoundingClientRect().height;
      let scale = Math.min(maxScale, room / natural);
      for (let i = 0; i < 6; i++) {
        fit.style.width = `${across / scale}px`;
        const next = Math.min(maxScale, room / fit.getBoundingClientRect().height);
        if (Math.abs(next - scale) < 0.005) break;
        scale = (scale + next) / 2;
      }
      fit.style.width = `${across / scale}px`;
      scale = Math.min(scale, room / fit.getBoundingClientRect().height);
      fit.style.transform = `scale(${scale})`;
      return { name, scale, pages: Math.round((natural / room) * 10) / 10 };
    });
  }, PDF_PAGE);
  const print = await printStateProblems(page);
  for (const r of [state, print]) {
    report.errors.push(...r.errors);
    report.warnings.push(...r.warnings);
  }
  await page.pdf({ path, width: `${PDF_PAGE.width}px`, height: `${PDF_PAGE.height}px`, printBackground: true, preferCSSPageSize: true });
  await page.close();
  return fits.filter((f) => f.scale < 0.7);
}

if (process.argv[1]?.endsWith('site-audit.mjs')) {
  refuseInCodexSandbox('The site audit');
  await rm(STAMP, { force: true });
  const loaded = await loadSite();
  // --latest: run this engine's checks as if the site were pinned to it, without re-pinning.
  const latest = process.argv.includes('--latest');
  const against = latest ? checkAgainstLatest(loaded) : null;
  const source = against ? against.latest : checkSite(loaded);
  const freshSource = new Set(against?.fresh ?? []);
  if (latest) console.log(`Auditing against ${CURRENT_PIN}, every rule blocking${loaded.site.engine && loaded.site.engine !== CURRENT_PIN ? ` (this site is pinned ${loaded.site.engine})` : ''}.`);
  // The browser checks that came with engine 1.8 (controls, the PDF's story, page
  // lint) block on a site that's unpinned or pinned 1.8+, and warn on an older
  // pin, as its pin promises; the sample band's phone check came with 1.11. A lead
  // sample is held to motion too.
  const pinnedMinor = pinnedMinorOf(loaded.site);
  const pinFrom = (minor) => pinnedMinor === undefined || Number(pinnedMinor) >= minor;
  const from = (minor) => latest || pinFrom(minor);
  const isNew = (minor) => latest && !pinFrom(minor);
  const lead = !!loaded.site.sample?.lead;
  const names = sampleNames(loaded.site);
  const kit = JSON.parse(await readFile('brand/brand.json', 'utf8').catch(() => 'null'));
  const references = JSON.parse(await readFile('brand/references/index.json', 'utf8').catch(() => 'null'));
  source.warnings.forEach((w) => console.log(`  ! ${w}`));
  if (source.errors.length) {
    source.errors.forEach((e) => console.error(`  ✗ ${freshSource.has(e) ? `[new in ${CURRENT_PIN}] ` : ''}${e}`));
    console.error(`Source: ${source.errors.length} error(s). Fix them, then run the audit again.`);
    process.exit(1);
  }
  const built = await buildSite();
  const server = await serveDir('dist-site');
  // Software raster, so a rebuild of the same page screenshots to the same bytes (stable-shots.mjs).
  const browser = await puppeteer.launch(stableLaunch());
  await rm(OUT, { recursive: true, force: true });
  const problems = [];
  // minor: the engine version whose rule this is (8 for the 1.8 browser checks).
  const gate = (label, r, minor = 8) => {
    const say = (m) => (m.startsWith(label) ? m : `${label}: ${m}`);
    for (const e of r.errors) if (from(minor)) problems.push(`${isNew(minor) ? `[new in ${CURRENT_PIN}] ` : ''}${say(e)}`); else console.log(`  ! ${say(e)}`);
    for (const w of r.warnings) console.log(`  ! ${say(w)}`);
  };
  try {
    gate('link preview', await previewProblems('dist-site'));
    for (const mode of MODES) {
      const dir = join(OUT, mode.name);
      await mkdir(dir, { recursive: true });
      const page = await browser.newPage();
      const errs = [];
      page.on('pageerror', (e) => errs.push(e.message));
      page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
      page.on('requestfailed', (r) => errs.push(`failed to load ${r.url().replace(server.url, '')}`));
      await page.setViewport({ width: mode.width, height: mode.height, isMobile: !!mode.mobile, hasTouch: !!mode.mobile, deviceScaleFactor: 1 });
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      await page.goto(`${server.url}/`, { waitUntil: 'networkidle0' });

      const found = await page.evaluate(() => {
        const out = [];
        const vw = document.documentElement.clientWidth;
        if (document.documentElement.scrollWidth > vw + 1) out.push(`the page scrolls sideways (${document.documentElement.scrollWidth}px wide in ${vw}px)`);
        for (const el of document.querySelectorAll('main *')) {
          const r = el.getBoundingClientRect();
          // Shapes inside an SVG are judged by the SVG itself, which clips them.
          if (el.ownerSVGElement) continue;
          if (r.width && (r.right > vw + 1 || r.left < -1) && !el.closest('.table-wrap, [data-scroll]') && getComputedStyle(el).position !== 'fixed') {
            const sec = el.closest('[data-section]')?.dataset.section;
            out.push(`<${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? ` class="${el.className}"` : ''}> in section "${sec}" runs off the screen`);
            if (out.length > 6) break;
          }
        }
        for (const img of document.images) if (img.complete && !img.naturalWidth) out.push(`image ${img.getAttribute('src')} didn't load`);
        // Anything a thumb taps is at least 40px each way on a phone.
        if (vw < 600) {
          const small = [];
          for (const el of document.querySelectorAll('button, summary, [role="tab"], input:not([type="hidden"]), select, a.pill, a[class]:not(p a, li a)')) {
            const r = el.getBoundingClientRect();
            if (!r.width || getComputedStyle(el).visibility === 'hidden') continue;
            const tall = el.matches('input[type="range"]') ? r.height >= 24 : r.height >= 40;
            if (!tall || r.width < 40) small.push(`${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)}" is ${Math.round(r.width)}×${Math.round(r.height)}px`);
          }
          small.slice(0, 8).forEach((x) => out.push(`tap target too small: ${x} (make it at least 40px)`));
        }
        for (const el of document.querySelectorAll('main p, main li, main h1, main h2, main h3')) {
          const fs = parseFloat(getComputedStyle(el).fontSize);
          if (fs && fs < 12) { out.push(`text under 12px in section "${el.closest('[data-section]')?.dataset.section}"`); break; }
        }
        return out;
      });
      found.forEach((f) => problems.push(`${mode.name}: ${f}`));

      // Every section, one screenshot each, without a sticky header laid over its top.
      const unstick = await page.addStyleTag({ content: 'body > header, header.top { position: static !important; }' });
      // Anything fixed to the screen (a booking bar) isn't part of a section.
      await page.evaluate(() => document.querySelectorAll('body *').forEach((el) => getComputedStyle(el).position === 'fixed' && el.setAttribute('data-shot-hidden', '')));
      const hideFixed = await page.addStyleTag({ content: '[data-shot-hidden] { visibility: hidden !important; }' });
      // Animations, videos, lazy images and fonts held still, so the shots hash the same every run.
      const unsettle = await settleForShots(page);
      const n = await page.$$eval('[data-section]', (s) => s.length);
      for (let i = 0; i < n; i++) {
        const el = (await page.$$('[data-section]'))[i];
        const name = await el.evaluate((s) => s.dataset.section || s.id);
        await el.screenshot({ path: join(dir, `${String(i + 1).padStart(2, '0')}-${String(name).replace(/[^\w-]/g, '')}.png`) });
      }
      await unstick.evaluate((n) => n.remove());
      await hideFixed.evaluate((n) => n.remove());
      await unsettle();

      // Work every control and watch for errors.
      await page.evaluate(async () => {
        const wait = () => new Promise((r) => setTimeout(r, 30));
        for (const b of document.querySelectorAll('[role="tab"], [data-toggle] button, [data-choice] button, [data-preset], [data-step]')) { b.click(); await wait(); }
        for (const inp of document.querySelectorAll('input[data-input]')) {
          const v = inp.value;
          inp.value = inp.type === 'range' ? inp.max : String(Number(v) + 10);
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          await wait();
          inp.value = v;
          inp.dispatchEvent(new Event('input', { bubbles: true }));
        }
        for (const d of document.querySelectorAll('details')) d.open = true;
      });
      const broken = await page.$$eval('[data-v], [data-expr]', (els) => els.filter((e) => /NaN|undefined|Infinity/.test(e.textContent)).map((e) => e.dataset.v || e.dataset.expr));
      broken.forEach((b) => problems.push(`${mode.name}: ${b} shows a broken number after a control changed`));
      // At one width, hold every control to what it promises: each input moves an
      // answer, all-off still reads, reset restores, presets are stable, and a
      // "Calculate" computes (site/interact.mjs). It reloads the page as it goes.
      if (mode.name === 'laptop') {
        // The page as a whole, at a laptop width (site/page-lint.mjs): the AI-template
        // tells counted, the brand's fonts actually rendering, and motion. Each may reload.
        gate('slop', await visualSlop(page, kit));
        gate('brand', await brandDiff(page, kit, references));
        gate('motion', await motionProblems(page, { strict: lead }));
        gate('controls', await exerciseControls(page));
        gate('boxed text', await boxedTextProblems(page), 11);
      }
      if (mode.mobile) gate(mode.name, await layoutProblems(page, { width: mode.width, height: mode.height }));
      if (mode.mobile && loaded.site.sample) gate(mode.name, await sampleBandProblems(page, names), 11);
      // A proposed promise and a partial total keep their qualifier in view at every width.
      gate(mode.name, await qualifierProblems(page));
      errs.forEach((e) => problems.push(`${mode.name}: ${e}`));

      await page.close();
    }
    // The widths between and beyond the screenshot modes: layout only.
    for (const width of EXTRA_WIDTHS) {
      const page = await browser.newPage();
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      await page.setViewport({ width, height: width < 600 ? 800 : 1000, isMobile: width < 600, hasTouch: width < 600, deviceScaleFactor: 1 });
      await page.goto(`${server.url}/`, { waitUntil: 'networkidle0' });
      gate(`${width}px`, await layoutProblems(page, { width }));
      if (width < PHONE_MAX && loaded.site.sample) gate(`${width}px`, await sampleBandProblems(page, names), 11);
      gate(`${width}px`, await qualifierProblems(page));
      await page.close();
    }
    const pdfReport = { errors: [], warnings: [] };
    const small = await writeDeckPdf(browser, server.url, 'dist-site/deck.pdf', pdfReport);
    gate('PDF', pdfReport);
    small.forEach((x) => console.log(`  ! PDF: section "${x.name}" is ${x.pages} screens tall, so its page is scaled to ${Math.round(x.scale * 100)}%. Lay it out for the page with .is-pdf rules, fold detail into a toggle, or split the section.`));
  } finally {
    await browser.close();
    await server.close();
  }
  if (problems.length) {
    [...new Set(problems)].forEach((p) => console.error(`  ✗ ${p}`));
    console.error(`${problems.length} problem(s). Screenshots: ${OUT}/`);
    process.exit(1);
  }
  // The section screenshots this clean pass took, per device, so a review can prove it saw exactly these.
  const { screenshotHashes } = await import('./design-review.mjs');
  await writeFile(STAMP, JSON.stringify({ fingerprint: await siteFingerprint(), sections: built.sections, shots: await screenshotHashes(OUT), at: new Date().toISOString() }, null, 2));
  console.log(`All modes clean: ${built.sections.length} sections at ${[...MODES.map((m) => m.width), ...EXTRA_WIDTHS].sort((a, b) => a - b).join(', ')}px. Look at every screenshot in ${OUT}/ before publishing. PDF: dist-site/deck.pdf`);
}
