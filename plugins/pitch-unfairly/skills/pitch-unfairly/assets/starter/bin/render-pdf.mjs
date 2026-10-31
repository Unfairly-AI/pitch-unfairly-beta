import { stampPdf } from './pdf-meta.mjs';

// The starter's own placeholder description says nothing about the deck.
const PLACEHOLDER = 'A deck built with Pitch Unfairly.';

// A PDF is one paint: whatever a viewer would only see by hovering is shown as
// its caption, and every entrance, loop and counter sits at its end.
const STILL = `
  .hover-only { opacity: 1 !important; visibility: visible !important; }
  *, *::before, *::after { transition: none !important; }
`;

/** Settle the page in the state the PDF should show: animations finished, loops at rest, counters at their value. */
export function settle() {
  for (const a of document.getAnimations()) {
    try {
      if (a.effect?.getTiming().iterations === Infinity) a.cancel();
      else a.finish();
    } catch {}
  }
  for (const el of document.querySelectorAll('.count-up[data-to]')) {
    const d = el.dataset;
    el.textContent = `${d.prefix ?? ''}${Number(d.to).toFixed(Number(d.decimals) || 0)}${d.suffix ?? ''}`;
  }
}

/** Title, author (the company), subject (the story's kernel, from index.txt beside the page) and keywords, from the page itself. */
async function documentInfo() {
  const txt = await fetch('index.txt').then((r) => (r.ok ? r.text() : '')).catch(() => '');
  const kernel = /^Kernel:[ \t]*(.+)$/m.exec(txt)?.[1].trim() ?? '';
  const meta = (name) => document.querySelector(`meta[name="${name}"]`)?.getAttribute('content')?.trim() ?? '';
  const author = meta('author');
  const labels = [...document.querySelectorAll('.slide')].map((s) => s.getAttribute('aria-label')?.trim()).filter(Boolean);
  const keywords = meta('keywords') || [...new Set([author, ...labels].filter(Boolean))].join(', ');
  // One outline entry per slide: its headline, or its label when it has none.
  const outline = [...document.querySelectorAll('.slide')].map((slide, page) => {
    const head = [...slide.querySelectorAll('h1, h2')].find((h) => h.getClientRects().length);
    return { title: (head?.innerText ?? '').replace(/\s+/g, ' ').trim() || slide.getAttribute('aria-label') || '', page };
  });
  return { info: { title: document.title.trim(), author, subject: kernel || meta('description'), keywords }, outline };
}

// Render a deck's 1920x1080 stage to PDF, one page per slide, tagged, with an
// outline of its headlines and its document info filled in.
export async function renderPdf(browser, base) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    await page.goto(`${base.replace(/\/$/, '')}/?pdf=1`, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForFunction(() => window.__deckReady === true, { timeout: 15000 });
    // The dev toolbar otherwise adds a trailing blank page.
    await page.evaluate(() => document.querySelector('astro-dev-toolbar')?.remove());
    await page.addStyleTag({ content: STILL });
    await page.evaluate(settle);
    const doc = await page.evaluate(documentInfo);
    if (doc.info.subject === PLACEHOLDER) doc.info.subject = '';
    const pdf = await page.pdf({
      width: '1920px',
      height: '1080px',
      printBackground: true,
      preferCSSPageSize: true,
      // Puppeteer's defaults (tagged on, outline off) are experimental and can flip.
      tagged: true,
      outline: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    return stampPdf(Buffer.from(pdf), doc);
  } finally {
    await page.close();
  }
}

export function countPdfPages(bytes) {
  return (bytes.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) || []).length;
}
