import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { asPart, chapterMeta, contentsHtml, documentBody, loadDocument, pageCss, pageGeometry, sourceChecks, startPages } from '../bin/longform/doc.mjs';
import { longformEngineProblem } from '../bin/longform/version.mjs';
import { emailBrand, resolveBrand, voiceOf } from '../bin/longform/brand.mjs';
import { scaffold } from '../bin/longform-new.mjs';

const starter = join(dirname(fileURLToPath(import.meta.url)), '..');
const kit = JSON.parse(readFileSync(join(starter, 'brand/brand.json'), 'utf8'));

/** A project with brand/ and the example document, in a temp folder. */
function project() {
  const root = mkdtempSync(join(tmpdir(), 'longform-'));
  cpSync(join(starter, 'brand'), join(root, 'brand'), { recursive: true });
  scaffold(root);
  return root;
}

test('chapterMeta reads the id, title and running header, and refuses what breaks paging', () => {
  const ok = chapterMeta('<section data-chapter id="why" data-running="Why"><h2>Why it <span>works</span></h2></section>', 'c.html');
  assert.deepEqual([ok.id, ok.title, ok.running, ok.problems], ['why', 'Why it works', 'Why', []]);
  assert.equal(chapterMeta('<section data-chapter id="a"><h2>Short</h2></section>', 'c').running, 'Short');
  assert.match(chapterMeta('<section data-chapter><h2>x</h2></section>', 'c').problems.join(), /needs an id/);
  assert.match(chapterMeta('<section data-chapter id="a"></section>', 'c').problems.join(), /no <h2>/);
  assert.match(chapterMeta('<section data-chapter id="a"><h2>x</h2></section><section data-chapter id="b"><h2>y</h2></section>', 'c').problems.join(), /exactly one/);
  assert.match(chapterMeta(`<section data-chapter id="a"><h2>${'Long words '.repeat(6)}</h2></section>`, 'c').problems.join(), /running header/);
});

test('pageCss gives every chapter its own named page with its running title, and the cover none', () => {
  const css = pageCss({ title: 'The title', page: 'a4' }, kit, [{ id: 'why', running: 'Why it works' }, { id: 'how', running: 'How "it" runs' }]);
  assert.match(css, /@page \{ size: 8\.27in 11\.69in;/);
  assert.match(css, /background-color: #faf5eb/);
  assert.match(css, /@page cover \{ margin: 0; @bottom-right \{ content: none; \} \}/);
  assert.match(css, /@page ch-1 \{[^}]*content: "The title"[^}]*\}[^}]*content: "Why it works"/);
  assert.match(css, /@page ch-2 [^\n]*content: "How \\"it\\" runs"/);
  assert.match(css, /#why \{ page: ch-1; \}/);
  assert.match(css, /counter\(page\)/);
});

test('startPages numbers each chapter from the counted parts, cover as page 1', () => {
  const chapters = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(startPages(2, [3, 1, 2], chapters, 1), { pages: { a: 3, b: 6, c: 7 }, total: 9 });
  assert.match(contentsHtml({}, [{ id: 'a', title: 'A' }], { a: 3 }), /lf-toc-p">3</);
  assert.match(contentsHtml({}, [{ id: 'a', title: 'A' }], null), /lf-toc-p">00</);
});

test('asPart marks the cover and back as parts without losing their classes', () => {
  assert.equal(asPart('<section class="x"><h1>t</h1></section>', 'lf-cover'), '<section class="lf-cover x" data-section><h1>t</h1></section>');
  assert.equal(asPart('<section id="b">', 'lf-back'), '<section id="b" class="lf-back" data-section>');
});

test('the example document passes the source checks, and the copy checks hold its chapters', () => {
  const root = project();
  try {
    const loaded = loadDocument(root);
    assert.deepEqual(sourceChecks(loaded).problems, []);
    assert.equal(longformEngineProblem(loaded.doc.engine), null);
    writeFileSync(join(root, 'longform/chapters/03-bad.html'), '<section data-chapter id="bad"><h2>Bad</h2><p>One thing — then another.</p><p style="background: linear-gradient(red, blue)">x</p></section>');
    const problems = sourceChecks(loadDocument(root)).problems.join('\n');
    assert.match(problems, /03-bad\.html has an em dash/);
    assert.match(problems, /03-bad\.html: an inline background image or gradient prints as nothing/);
    const body = documentBody(loadDocument(root), null);
    assert.match(body, /<section data-chapter id="first"[^>]*data-section>/);
    assert.match(body, /href="deck\.pdf"[^>]*data-cta="download_pdf"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('engine pins and the brand seam', () => {
  assert.equal(longformEngineProblem('longform@1.0'), null);
  assert.match(longformEngineProblem('longform@2.0'), /2\.x/);
  assert.match(longformEngineProblem('longform@1.9'), /needs long-form engine 1\.9/);
  const brand = resolveBrand(starter);
  assert.equal(brand.schema, 'brand-kit@1');
  assert.equal(brand.source, 'brand/brand.json');
  assert.deepEqual(brand.voice.rules, kit.rules);
  assert.deepEqual(brand.email, { logo: null, logo_dark: null, fallback: { display: null, body: null, mono: null } });
  assert.ok(Math.abs(pageGeometry({}).content.w - 6.8) < 1e-9);
});

test('brand-kit@2 email pieces come from lockups and fallback stacks, and voice from voice.rules and voice.banned', () => {
  const kit = {
    identity: { lockups: [
      { name: 'horizontal', file: 'logos/h.svg', use: ['general'] },
      { name: 'email', file: 'logos/email@2x.png', format: 'png', scale: 2, use: ['email'] },
      { name: 'email-dark', file: 'logos/email-dark@2x.png', format: 'png', scale: 2, on: 'dark', use: ['email'] },
      { name: 'svg-email', file: 'logos/e.svg', format: 'svg', use: ['email'] },
    ] },
    typography: { display: { family: 'Sora', fallback_stack: 'Arial, Helvetica, sans-serif' }, body: { family: 'DM Sans' } },
    voice: { notes: ['Short.'], rules: ['No em dashes.'], banned: ['synergy'] },
  };
  const e = emailBrand(kit);
  assert.equal(e.logo.name, 'email');
  assert.equal(e.logo_dark.name, 'email-dark');
  assert.equal(e.fallback.display, 'Arial, Helvetica, sans-serif');
  assert.equal(e.fallback.body, null);
  assert.deepEqual(voiceOf(kit), { rules: ['No em dashes.'], banned: ['synergy'], notes: ['Short.'] });
  assert.deepEqual(voiceOf({ rules: ['One accent.'], voice: ['Cocky.'] }), { rules: ['One accent.'], banned: [], notes: ['Cocky.'] });
});

// ACCEPTANCE: a document builds to a print PDF whose contents page gives each chapter's real page,
// with every chapter on its own page, and a web version beside it.
test('ACCEPTANCE: longform:build writes the PDF with a true contents and the web version', { timeout: 180000 }, async () => {
  const root = project();
  const cwd = process.cwd();
  try {
    symlinkSync(join(starter, 'node_modules'), join(root, 'node_modules'));
    // A chapter long enough to run onto a second page, so the numbers aren't trivial.
    writeFileSync(join(root, 'longform/chapters/01-chapter.html'), `<section data-chapter id="first" data-running="First chapter"><h2>A long first chapter</h2>${'<p>Each paragraph says one thing about the reader and what they do next with it, in plain words.</p>'.repeat(40)}</section>`);
    process.chdir(root);
    const { buildLongform } = await import('../bin/longform-build.mjs');
    const report = await buildLongform({ root: '.', gate: false, log: () => {} });
    assert.deepEqual(report.problems, []);
    assert.equal(report.pages.front, 2);
    assert.ok(report.pages.chapters.first.count >= 2);
    assert.equal(report.pages.chapters.first.first, 3);
    assert.equal(report.pages.chapters.second.first, 3 + report.pages.chapters.first.count);
    assert.equal(report.pdf.pages, 2 + report.pages.chapters.first.count + report.pages.chapters.second.count + report.pages.back);
    const html = readFileSync('dist-longform/index.html', 'utf8');
    assert.match(html, new RegExp(`href="#second"><span class="lf-toc-n">02</span><span class="lf-toc-t">The second chapter</span><span class="lf-toc-p">${report.pages.chapters.second.first}</span>`));
    assert.ok(readFileSync('dist-longform/deck.pdf').length > 10000);
    assert.match(readFileSync('dist-longform/index.txt', 'utf8'), /^# The document's title/);
  } finally {
    process.chdir(cwd);
    rmSync(root, { recursive: true, force: true });
  }
});
