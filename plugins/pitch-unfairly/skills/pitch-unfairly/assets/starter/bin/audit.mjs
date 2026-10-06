// Layout audit for every mode the deck has to work in.
// Usage: node bin/audit.mjs [base-url]   (exits 1 when anything needs fixing)
import puppeteer from 'puppeteer';
import { countPdfPages, renderPdf } from './render-pdf.mjs';
import { assertThisDeck } from './this-deck.mjs';
import { clearStamp, stampPass } from './audit-stamp.mjs';

const base = (process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'http://localhost:4321').replace(/\/$/, '');
await assertThisDeck(base).catch((error) => {
  console.error(`✗ ${error.message}`);
  process.exit(1);
});

// name, viewport, query, minimum readable font size in CSS px.
// On the stage, 18px renders at ~12px on a 1280px-wide laptop window.
// The last value is the most lines a headline may wrap to before it reads as
// a paragraph: shorten it or give it a wider column.
const MODES = [
  ['stage', { width: 1920, height: 1080 }, '?pdf=1', 18, 3],
  ['mobile', { width: 393, height: 745, isMobile: true, hasTouch: true }, '', 11, 4],
  ['mobile-small', { width: 375, height: 667, isMobile: true, hasTouch: true }, '', 11, 5],
];

const problems = [];
let slideCount = 0;
const report = (mode, msg) => problems.push(`${mode}: ${msg}`);

// On brand: slides take every color from the brand kit's tokens. A raw color
// in a slide is a color the kit doesn't control.
{
  const { readdir, readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const walk = async (dir) => (await readdir(dir, { withFileTypes: true })).flatMap((e) =>
    e.isDirectory() ? [] : [join(dir, e.name)]);
  const files = [...await walk('src/slides'), ...await walk('src/components').catch(() => []), ...await walk('src/layouts')];
  for (const file of files.filter((f) => f.endsWith('.astro'))) {
    const lines = (await readFile(file, 'utf8')).split('\n');
    lines.forEach((line, i) => {
      const hit = line.match(/#[0-9a-fA-F]{3,8}\b(?![^"']*["']\s*\/?>)|\b(?:rgba?|hsla?)\(/);
      if (hit && !line.includes('brand-ok')) report('brand', `${file}:${i + 1} uses a raw color (${hit[0]}); use a brand token or derived tint`);
    });
  }
}

// A real brand: no deck ships in the starter's own house brand unless it is
// about Pitch Unfairly. Get the brand from its site, or write an art direction.
{
  const { readFile } = await import('node:fs/promises');
  const kit = JSON.parse(await readFile('brand/brand.json', 'utf8').catch(() => '{}'));
  // Renaming the kit or nudging the accent isn't a brand: the house look is its type pairing.
  const houseLook = kit.typography?.display?.family === 'Bricolage Grotesque' && kit.typography?.body?.family === 'Inter';
  if ((kit.identity?.name === 'Pitch Unfairly' || houseLook) && kit.house !== true) {
    report('brand', "the deck still wears the starter's house brand (brand/brand.json). Use the company's real brand, or write an art direction for it (SKILL step 3). Set \"house\": true only for a deck about Pitch Unfairly itself.");
  }
}

const browser = await puppeteer.launch({ headless: true });

try {
  for (const [mode, viewport, query, minFont, maxLines] of MODES) {
    const page = await browser.newPage();
    await page.setViewport(viewport);
    await page.goto(`${base}/${query}`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => window.__deckReady === true, { timeout: 15000 }).catch(() => {
      report(mode, 'deck never signalled ready (fonts or images still loading)');
    });
    await page.evaluate(() => document.querySelector('astro-dev-toolbar')?.remove());

    const result = await page.evaluate((minFont, maxLines, judgeLook) => {
      const out = { slides: 0, issues: [], boxed: [] };
      const slides = [...document.querySelectorAll('.slide')];
      out.slides = slides.length;
      if (!slides.length) out.issues.push('no .slide elements found');

      const ids = slides.map((s) => s.id);
      const dupes = ids.filter((id, i) => !id || ids.indexOf(id) !== i);
      if (dupes.length) out.issues.push(`missing or duplicate slide ids: ${dupes.join(', ') || '(empty)'}`);

      if (document.documentElement.scrollWidth > innerWidth + 1) {
        out.issues.push(`page scrolls horizontally (${document.documentElement.scrollWidth}px wide)`);
      }

      const describe = (el) => {
        const cls = typeof el.className === 'string' && el.className.trim()
          ? '.' + el.className.trim().split(/\s+/).filter((c) => !c.startsWith('astro-')).slice(0, 2).join('.')
          : '';
        const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
        return `<${el.tagName.toLowerCase()}${cls}>${text ? ` "${text}"` : ''}`;
      };

      // Decorative or intentionally bleeding elements opt out with
      // aria-hidden="true" or data-bleed.
      const skipped = (el) => el.closest('[aria-hidden="true"]:not(.slide), [data-bleed]');

      for (const slide of slides) {
        const name = slide.id;
        const box = slide.getBoundingClientRect();

        const headline = slide.querySelector('h1, h2');
        if (!headline) out.issues.push(`${name}: no h1/h2 headline`);
        else {
          const lines = Math.round(headline.getBoundingClientRect().height / parseFloat(getComputedStyle(headline).lineHeight));
          if (lines > maxLines) out.issues.push(`${name}: headline wraps to ${lines} lines (max ${maxLines}); shorten it or widen its column`);
        }

        // Content taller or wider than the slide.
        const v = slide.scrollHeight - slide.clientHeight;
        const h = slide.scrollWidth - slide.clientWidth;
        if (v > 2 || h > 2) out.issues.push(`${name}: content overflows the slide by ${h}px wide, ${v}px tall`);

        let worst = null;
        let tooSmall = null;
        for (const el of slide.querySelectorAll('*')) {
          if (skipped(el)) continue;
          if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
          const style = getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') continue;
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) continue;

          // Elements clipped by the slide edge. Slide-level scroll sizes miss
          // absolutely positioned children, so check each box.
          const over = Math.max(r.right - box.right, box.left - r.left, r.bottom - box.bottom, box.top - r.top);
          if (over > 2 && (!worst || over > worst.over)) worst = { over: Math.round(over), el: describe(el) };

          // Text too small to read in this mode.
          const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
          const size = parseFloat(style.fontSize);
          if (ownText && size < minFont && (!tooSmall || size < tooSmall.size)) {
            tooSmall = { size, el: describe(el) };
          }

          if (el.tagName === 'IMG' && !(el.complete && el.naturalWidth)) {
            out.issues.push(`${name}: image failed to load ${el.getAttribute('src')}`);
          }
        }
        // The generated look (stage only): content in boxes, equal-weight
        // grids, and paragraphs too small to read from the back of a room.
        if (judgeLook) {
          const area = box.width * box.height;
          const boxes = [];
          let smallPara = null;
          for (const el of slide.querySelectorAll('*')) {
            if (skipped(el)) continue;
            const style = getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') continue;
            const r = el.getBoundingClientRect();
            if (r.width * r.height < area * 0.02 || r.width * r.height > area * 0.9) continue;
            const borders = ['Top', 'Right', 'Bottom', 'Left'].filter((side) => parseFloat(style[`border${side}Width`]) >= 1.5).length;
            const filled = style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent';
            if (style.boxShadow !== 'none' || (borders >= 3 && filled)) boxes.push({ el, w: r.width, h: r.height });
          }
          // Outermost boxes only.
          const outer = boxes.filter((b) => !boxes.some((o) => o !== b && o.el.contains(b.el)));
          if (outer.length) out.boxed.push(name);
          const similar = outer.filter((b) => outer.filter((o) => Math.abs(o.w - b.w) < b.w * 0.15 && Math.abs(o.h - b.h) < b.h * 0.15).length >= 3);
          if (similar.length >= 3) out.issues.push(`${name}: ${similar.length} boxes of equal weight; make one of them the focal point and let the rest go quiet (or cut them)`);
          for (const el of slide.querySelectorAll('p, li, span, div')) {
            if (skipped(el)) continue;
            const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
            const size = parseFloat(getComputedStyle(el).fontSize);
            if (own.length > 60 && size < 26 && (!smallPara || size < smallPara.size)) smallPara = { size, el: describe(el) };
          }
          if (smallPara) out.issues.push(`${name}: a paragraph at ${smallPara.size}px (${smallPara.el}); body copy is 30px or larger on the stage, or cut it to a label`);
        }

        if (worst) out.issues.push(`${name}: ${worst.el} sticks out of the slide by ${worst.over}px`);

        // Text colliding with other text. Each line of each text run is a box;
        // two boxes from unrelated blocks may not cover each other. Runs in the
        // same block (a headline and its accent span) share leading and are
        // allowed to touch. Deliberate overlaps opt out with data-overlap-ok.
        const blockOf = (node) => {
          let el = node.parentElement;
          while (el !== slide && ['inline', 'contents'].includes(getComputedStyle(el).display)) el = el.parentElement;
          return el;
        };
        const runs = [];
        const walker = document.createTreeWalker(slide, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const el = node.parentElement;
          if (!node.textContent.trim() || skipped(el) || el.closest('svg, [data-overlap-ok]')) continue;
          const style = getComputedStyle(el);
          if (style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          // A glyph box runs from the font's ascent to its descent, far taller
          // than the ink in display type. Compare the band where letters
          // actually sit: about 0.7em, centered, never taller than the box.
          const band = 0.7 * parseFloat(style.fontSize);
          const rects = [...range.getClientRects()].filter((r) => r.width > 2 && r.height > 2).map((r) => {
            const h = Math.min(r.height, band);
            const top = r.top + (r.height - h) / 2;
            return { left: r.left, right: r.right, top, bottom: top + h, height: h };
          });
          if (rects.length) runs.push({ block: blockOf(node), el, rects });
        }
        let collision = null;
        for (let i = 0; i < runs.length && !collision; i++) {
          for (let j = i + 1; j < runs.length && !collision; j++) {
            const a = runs[i], b = runs[j];
            if (a.block === b.block || a.block.contains(b.block) || b.block.contains(a.block)) continue;
            for (const ra of a.rects) {
              for (const rb of b.rects) {
                const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
                const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
                if (w > 4 && h > 0.25 * Math.min(ra.height, rb.height)) {
                  collision = `${describe(a.el)} overlaps ${describe(b.el)}`;
                  break;
                }
              }
              if (collision) break;
            }
          }
        }
        if (collision) out.issues.push(`${name}: text collides: ${collision}; give one of them its own space`);
        if (tooSmall) out.issues.push(`${name}: text at ${tooSmall.size}px is below the ${minFont}px minimum, e.g. ${tooSmall.el}`);
      }

      // The display font actually rendered, not a fallback.
      const heading = document.querySelector('.slide h1, .slide h2');
      if (heading) {
        const style = getComputedStyle(heading);
        const family = style.fontFamily.split(',')[0].trim();
        if (!document.fonts.check(`${style.fontWeight} 40px ${family}`)) {
          out.issues.push(`headline font ${family} did not load`);
        }
      }
      return out;
    }, minFont, maxLines, mode === 'stage');

    if (mode === 'stage' && result.boxed.length > Math.ceil(result.slides / 2)) {
      result.issues.push(`${result.boxed.length} of ${result.slides} slides put their content in bordered or shadowed boxes (${result.boxed.join(', ')}). At most half may; let type, numbers, images, and color carry the rest`);
    }
    result.issues.forEach((issue) => report(mode, issue));
    slideCount = Math.max(slideCount, result.slides);
    if (!result.issues.length) console.log(`✓ ${mode}: ${result.slides} slides fit ${viewport.width}×${viewport.height}`);
    await page.close();
  }

  // Keyboard navigation on the scaled desktop stage.
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`${base}/`, { waitUntil: 'networkidle0' });
    await page.keyboard.press('ArrowRight');
    const nav = await page.evaluate(() => ({
      hash: location.hash,
      active: [...document.querySelectorAll('.slide')].findIndex((s) => s.classList.contains('is-active')),
    }));
    if (nav.hash !== '#2' || nav.active !== 1) report('present', `ArrowRight did not advance (hash ${nav.hash}, active ${nav.active})`);
    else console.log('✓ present: keyboard navigation works');
    await page.close();
  }

  // The real PDF: one 16:9 page per slide. --quick skips it while iterating.
  const bytes = process.argv.includes('--quick') ? null : await renderPdf(browser, base).catch((error) => {
    report('pdf', `export failed: ${error.message}`);
    return null;
  });
  if (bytes) {
    const pages = countPdfPages(bytes);
    const page = await browser.newPage();
    await page.goto(`${base}/?pdf=1`, { waitUntil: 'networkidle0' });
    const slides = await page.$$eval('.slide', (s) => s.length);
    await page.close();
    if (pages !== slides) report('pdf', `${pages} pages for ${slides} slides (a slide is spilling onto extra pages)`);
    else console.log(`✓ pdf: ${pages} pages, ${(bytes.length / 1024).toFixed(0)} KB`);
  }
} finally {
  await browser.close();
}

if (problems.length) {
  console.error(`\n${problems.length} problem${problems.length === 1 ? '' : 's'} to fix before shipping:`);
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  process.exitCode = 1;
  await clearStamp();
} else if (process.argv.includes('--quick')) {
  // A quick audit skips the PDF, so it never counts as the audit that publishing needs.
  console.log('\nQuick audit clean (PDF skipped). Run the full npm run audit before publishing.');
} else {
  await stampPass(slideCount);
  console.log('\nAll modes clean. Now look at the screenshots: npm run shots');
}
