// The deck's PDF as a machine reads it: document info, a flat outline of the
// headlines, tags, one paint at its end state, and text in reading order.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pdfString, stampPdf } from '../bin/pdf-meta.mjs';
import { countPdfPages, renderPdf } from '../bin/render-pdf.mjs';
import { pdfPagesText } from '../bin/deck-checks.mjs';
import { serveDir } from '../bin/serve.mjs';

/** A minimal PDF the way Chrome lays one out: a classic xref table, an Info dictionary, two pages. */
function tinyPdf() {
  const objs = [
    '<</Type /Catalog\n/Pages 2 0 R\n/MarkInfo <</Type /MarkInfo\n/Marked true>>\n/Lang (en)>>',
    '<</Type /Pages\n/Kids [3 0 R 4 0 R]\n/Count 2>>',
    '<</Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 1440 810]>>',
    '<</Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 1440 810]>>',
    '<</Creator (Mozilla/5.0 \\(KHTML, like Gecko\\) HeadlessChrome)\n/Producer (Skia/PDF m153)\n/Title (Old title)>>',
  ];
  let out = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<</Size ${objs.length + 1}\n/Root 1 0 R\n/Info 5 0 R\n/ID [<AB12> <AB12>]>>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

/** Each object's latest body, by following the last xref chain the way a reader does. */
function readObjects(bytes) {
  const text = bytes.toString('latin1');
  const seen = new Map();
  let at = Number(/startxref\s+(\d+)\s+%%EOF\s*$/.exec(text)[1]);
  while (Number.isFinite(at)) {
    assert.equal(text.slice(at, at + 4), 'xref', `startxref points at an xref table (${at})`);
    const table = text.slice(at, text.indexOf('trailer', at));
    const lines = table.split('\n').slice(1).filter(Boolean);
    for (let i = 0; i < lines.length;) {
      const [first, count] = lines[i++].split(' ').map(Number);
      for (let n = first; n < first + count; n++, i++) {
        const [off, , kind] = lines[i].split(' ');
        if (kind !== 'n' || seen.has(n)) continue;
        assert.ok(text.startsWith(`${n} `, Number(off)), `object ${n} sits at its xref offset`);
        seen.set(n, /obj\s*<<([\s\S]*?)>>\s*endobj/.exec(text.slice(Number(off)))[1]);
      }
    }
    const trailer = /trailer\s*<<([\s\S]*?)>>\s*startxref/.exec(text.slice(at))[1];
    if (!seen.has('trailer')) seen.set('trailer', trailer);
    at = Number(/\/Prev\s+(\d+)/.exec(trailer)?.[1] ?? NaN);
  }
  return seen;
}

const hex = (s) => pdfString(s);

test('PDF text strings are UTF-16BE hex with a byte-order mark, so any character survives', () => {
  assert.equal(pdfString('Aé'), '<FEFF004100E9>');
  assert.equal(pdfString('→ 🚚'), '<FEFF21920020D83DDE9A>');
});

test('ACCEPTANCE: stamping sets Title, Author, Subject and Keywords and keeps what Chrome wrote', () => {
  const src = tinyPdf();
  const out = stampPdf(src, { info: { title: 'Acme deck', author: 'Acme', subject: 'Freight in minutes.', keywords: 'Acme, Cover' } });
  assert.ok(out.subarray(0, src.length).equals(src), 'the original bytes are untouched (an incremental update)');
  const objs = readObjects(out);
  const trailer = objs.get('trailer');
  assert.match(trailer, /\/Root 1 0 R/);
  assert.match(trailer, /\/ID \[<AB12> <AB12>\]/);
  const info = objs.get(Number(/\/Info (\d+) 0 R/.exec(trailer)[1]));
  assert.ok(info.includes(`/Title ${hex('Acme deck')}`));
  assert.ok(info.includes(`/Author ${hex('Acme')}`));
  assert.ok(info.includes(`/Subject ${hex('Freight in minutes.')}`));
  assert.ok(info.includes(`/Keywords ${hex('Acme, Cover')}`));
  assert.match(info, /\/Creator \(Mozilla\/5\.0 \\\(KHTML, like Gecko\\\) HeadlessChrome\)/);
  assert.match(info, /\/Producer \(Skia\/PDF m153\)/);
  assert.ok(!info.includes('Old title'));
});

test('ACCEPTANCE: the outline is flat, one entry per slide headline, each opening its page', () => {
  const out = stampPdf(tinyPdf(), { info: { title: 'T' }, outline: [{ title: 'Acme books\nfreight  fast.', page: 0 }, { title: 'The ask', page: 1 }, { title: '', page: 1 }] });
  const objs = readObjects(out);
  const catalog = objs.get(1);
  assert.match(catalog, /\/MarkInfo <<\/Type \/MarkInfo\n\/Marked true>>/, 'the catalog keeps its tags');
  const root = objs.get(Number(/\/Outlines (\d+) 0 R/.exec(catalog)[1]));
  assert.match(root, /\/Type \/Outlines/);
  assert.match(root, /\/Count 2/);
  const first = objs.get(Number(/\/First (\d+) 0 R/.exec(root)[1]));
  assert.ok(first.includes(`/Title ${hex('Acme books freight fast.')}`), 'wrapped words keep their spaces');
  assert.match(first, /\/Dest \[3 0 R \/Fit\]/);
  const second = objs.get(Number(/\/Next (\d+) 0 R/.exec(first)[1]));
  assert.ok(second.includes(`/Title ${hex('The ask')}`));
  assert.match(second, /\/Dest \[4 0 R \/Fit\]/);
  assert.doesNotMatch(second, /\/Next/);
});

test('the outline finds every page when Chrome groups them under intermediate page-tree nodes', () => {
  const objs = [
    '<</Type /Catalog\n/Pages 2 0 R>>',
    '<</Type /Pages\n/Count 3\n/Kids [3 0 R 4 0 R]>>',
    '<</Type /Pages\n/Count 2\n/Kids [5 0 R 6 0 R]\n/Parent 2 0 R>>',
    '<</Type /Pages\n/Count 1\n/Kids [7 0 R]\n/Parent 2 0 R>>',
    '<</Type /Page\n/Parent 3 0 R>>', '<</Type /Page\n/Parent 3 0 R>>', '<</Type /Page\n/Parent 4 0 R>>',
  ];
  let pdf = '%PDF-1.4\n';
  const offs = objs.map((o, i) => { const at = pdf.length; pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; return at; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<</Size ${objs.length + 1}\n/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
  const read = readObjects(stampPdf(Buffer.from(pdf, 'latin1'), { outline: [{ title: 'One', page: 0 }, { title: 'Two', page: 1 }, { title: 'Three', page: 2 }] }));
  const root = read.get(Number(/\/Outlines (\d+) 0 R/.exec(read.get(1))[1]));
  let item = read.get(Number(/\/First (\d+) 0 R/.exec(root)[1]));
  const dests = [];
  for (;;) {
    dests.push(/\/Dest \[(\d+) 0 R/.exec(item)[1]);
    const next = /\/Next (\d+) 0 R/.exec(item);
    if (!next) break;
    item = read.get(Number(next[1]));
  }
  assert.deepEqual(dests, ['5', '6', '7']);
});

test('a PDF without an xref table to extend comes back unchanged', () => {
  const stream = Buffer.from('%PDF-1.7\n1 0 obj\n<</Type /XRef>>\nstream\nendstream\nendobj\nstartxref\n9\n%%EOF\n', 'latin1');
  assert.ok(stampPdf(stream, { info: { title: 'T' } }).equals(stream));
});

// ---------- In a real browser ----------

let browser = null;
let launchError = null;
const cleanup = [];
before(async () => {
  try {
    const { default: puppeteer } = await import('puppeteer');
    browser = await puppeteer.launch({ headless: true });
  } catch (e) {
    launchError = e;
  }
});
after(async () => {
  await browser?.close();
  for (const fn of cleanup) await fn();
});

const hasTool = (bin) => { try { execFileSync(bin, ['-v'], { stdio: 'ignore' }); return true; } catch { return false; } };

/** Serve a one-file deck: slides on a 1920x1080 stage, ready once loaded, like the starter. */
async function serveDeck(slides, head = '') {
  const dir = await mkdtemp(join(tmpdir(), 'deck-pdf-test-'));
  await writeFile(join(dir, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Acme deck</title>
    <meta name="description" content="Freight in minutes."><meta name="author" content="Acme">${head}
    <script>if (/[?&]pdf=1/.test(location.search)) document.documentElement.classList.add('is-pdf', 'is-static');</script>
    <style>@page { size: 1920px 1080px; margin: 0 } body { margin: 0; font: 36px/1.25 sans-serif }
      .slide { width: 1920px; height: 1080px; box-sizing: border-box; padding: 100px; overflow: hidden; break-after: page; position: relative }
      .slide:last-child { break-after: auto } ul { list-style: none; padding: 0 }
      .hover-host .hover-only { opacity: 0 } html.is-static .hover-only { opacity: 1 }</style></head>
    <body><main>${slides}</main><script>addEventListener('load', () => { window.__deckReady = true; });</script></body></html>`);
  const server = await serveDir(dir);
  cleanup.push(() => server.close(), () => rm(dir, { recursive: true, force: true }));
  return server.url;
}

function browserTest(name, fn, { needs = [] } = {}) {
  test(name, async (t) => {
    if (!browser) return t.skip(`no browser: ${launchError?.message ?? 'unavailable'}`);
    const missing = needs.filter((bin) => !hasTool(bin));
    if (missing.length) return t.skip(`not installed: ${missing.join(', ')}`);
    await fn();
  });
}

const pages = (...inner) => inner.map((html, i) => `<section class="slide" id="slide-${i + 1}" aria-label="Slide ${i + 1}">${html}</section>`).join('');

browserTest('ACCEPTANCE: the rendered PDF is tagged, carries its info, and its outline lists each slide headline', async () => {
  const url = await serveDeck(pages('<h1 style="width:600px">Acme books your freight in minutes.</h1>', '<h2>Every booking takes seven steps.</h2><h3>Not in the outline</h3>'));
  const bytes = await renderPdf(browser, url);
  assert.equal(countPdfPages(bytes), 2);
  const text = bytes.toString('latin1');
  assert.match(text, /\/StructTreeRoot \d+ 0 R/, 'tagged');
  const objs = readObjects(bytes);
  const info = objs.get(Number(/\/Info (\d+) 0 R/.exec(objs.get('trailer'))[1]));
  for (const [key, value] of [['Title', 'Acme deck'], ['Author', 'Acme'], ['Subject', 'Freight in minutes.'], ['Keywords', 'Acme, Slide 1, Slide 2']]) {
    assert.ok(info.includes(`/${key} ${hex(value)}`), `${key} is ${value}`);
  }
  const catalog = objs.get(Number(/\/Root (\d+) 0 R/.exec(objs.get('trailer'))[1]));
  const root = objs.get(Number(/\/Outlines (\d+) 0 R/.exec(catalog)[1]));
  assert.match(root, /\/Count 2/);
  const first = objs.get(Number(/\/First (\d+) 0 R/.exec(root)[1]));
  assert.ok(first.includes(hex('Acme books your freight in minutes.')), 'a wrapped headline keeps its spaces');
  if (hasTool('pdfinfo')) assert.match(execFileSync('pdfinfo', ['-'], { input: bytes, encoding: 'utf8' }), /Author:\s+Acme/);
});

browserTest('ACCEPTANCE: the PDF prints one settled paint: hover-only captions shown, counters at their value, entrances at their end', async () => {
  const url = await serveDeck(pages(`<h2>Bookings close 42% faster.</h2>
    <p class="hover-host"><span class="count-up" data-to="42" data-decimals="0" data-suffix="%">0%</span>
      <span class="hover-only">median across example lanes</span></p>
    <p style="animation: in 5s both">Arrives after an entrance</p>`), '<style>@keyframes in { from { opacity: 0 } to { opacity: 1 } }</style>');
  const [page] = await pdfPagesText(await renderPdf(browser, url));
  assert.match(page, /42%/);
  assert.doesNotMatch(page, /\b0%/);
  assert.match(page, /median across example lanes/);
  assert.match(page, /Arrives after an entrance/);
}, { needs: ['pdftotext'] });

// Reading order, as measured October 31, 2026 (poppler 26.06): extractors that
// follow the content stream (pdftotext -raw, PyMuPDF's default) read DOM
// order; pdftotext's default sorts by position and reads a wrapped grid of
// pills column-wise. One column, one row, or items under 0.8em apart read in order.
const steps = ['Rate requests', 'Carrier calls', 'Spot quotes', 'Load tendering', 'Dock scheduling', 'Paperwork', 'Status emails'];
const list = (style, item = 'padding:22px 40px;border:1px solid #999;border-radius:99px') => `<ul style="${style}">${steps.map((s) => `<li style="${item}">${s}</li>`).join('')}</ul>`;
const inOrder = (text) => steps.map((s) => text.indexOf(s)).every((at, i, all) => at >= 0 && (i === 0 || at > all[i - 1]));

browserTest('PROOF: a wrapped pill grid reads out of order in pdftotext; one column, one row, or tight spacing read in order', async () => {
  const url = await serveDeck(pages(
    `<h2>Wrapped grid</h2>${list('display:flex;flex-wrap:wrap;gap:22px;max-width:1560px')}`,
    `<h2>One column</h2>${list('display:grid;gap:14px', 'padding:8px 40px;border:1px solid #999;border-radius:99px;width:max-content')}`,
    `<h2>One row</h2>${list('display:flex;gap:22px;font-size:26px', 'padding:16px 24px;border:1px solid #999;border-radius:99px')}`,
    `<h2>Tight rows</h2>${list('display:flex;flex-wrap:wrap;gap:22px 24px;max-width:1300px', 'padding:16px 0')}`,
  ));
  const bytes = await renderPdf(browser, url);
  const geometric = await pdfPagesText(bytes);
  const raw = await pdfPagesText(bytes, ['-raw']);
  assert.equal(inOrder(geometric[0]), false, 'the wrapped grid reads column-wise');
  for (const i of [1, 2, 3]) assert.ok(inOrder(geometric[i]), `layout ${i + 1} reads in list order:\n${geometric[i]}`);
  for (const i of [0, 1, 2, 3]) assert.ok(inOrder(raw[i]), `content order is DOM order on page ${i + 1}`);
}, { needs: ['pdftotext'] });
