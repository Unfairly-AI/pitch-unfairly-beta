// The banned list: the house file is well formed, a kit's rules add to it, the
// source patterns block in site:check (from sites@1.15), and every DOM detector
// fires on the pattern it bans and stays quiet on a clean page.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer';
import { BANNED, DETECTORS, bannedEntries, bannedFileProblems, domBanned, rubric, sourceBanned } from '../bin/site/banned.mjs';
import { checkSite } from '../bin/site/check.mjs';
import { serveDir } from '../bin/serve.mjs';
import { stableLaunch } from '../bin/stable-shots.mjs';
import { buildSite } from '../bin/site-build.mjs';
import { scaffold } from '../bin/site-new.mjs';

test('the house banned list is well formed: ids, rules, sources, and a detector or a rubric line each', () => {
  assert.deepEqual(bannedFileProblems(), []);
  for (const e of BANNED.entries) assert.ok(e.detect || e.rubric, e.id);
  // The retro's list, each present (CU Anschutz, change 3).
  for (const id of ['eyebrow', 'accent-text-on-light', 'accent-underline-link', 'outlined-secondary', 'clip-art', 'hover-lift', 'blur-noise-decoration', 'image-reveal', 'on-this-page-bar', 'visible-placeholder', 'crowded-hero', 'wall-of-text']) {
    assert.ok(BANNED.entries.some((e) => e.id === id), `${id} is banned`);
  }
  assert.ok(bannedFileProblems({ schema: 'banned@1', entries: [{ id: 'x', rule: 'r', severity: 'block', source: ['s'] }] }).some((p) => /detector .* or a rubric/.test(p)), 'an entry with neither a detector nor a rubric is refused');
  assert.ok(bannedFileProblems({ schema: 'banned@1', entries: [{ id: 'x', rule: 'r', severity: 'block', source: ['s'], detect: { dom: 'nope' } }] }).some((p) => /unknown dom detector/.test(p)));
});

test('a kit adds rules: an object rule with a detector, an override, an opt-out, and prose for the critic', () => {
  const kit = {
    rules: [
      'Every piece carries both the Frame and the Grain.',
      { id: 'no-gold-text', rule: 'Never set text in CU Gold.', detect: { dom: 'accent-text', params: { colors: ['#CFB87C'] } } },
      { id: 'wall-of-text', detect: { dom: 'wall-of-text', params: { words: 40 } } },
      { id: 'native-select-desktop', off: true, why: "This client's form is OS-native by policy." },
      { id: 'Bad Id' },
      { id: 'mystery', rule: 'x', detect: { dom: 'not-a-detector' } },
    ],
  };
  const { entries, prose, problems } = bannedEntries(kit);
  assert.deepEqual(prose, ['Every piece carries both the Frame and the Grain.']);
  assert.equal(entries.find((e) => e.id === 'no-gold-text').client, true);
  assert.equal(entries.find((e) => e.id === 'wall-of-text').detect.params.words, 40);
  assert.ok(!entries.some((e) => e.id === 'native-select-desktop'), 'an opt-out drops the house entry for this client');
  assert.equal(problems.length, 2);
  const r = rubric(kit);
  assert.ok(r.judge.some((j) => j.id === 'clip-art'), 'undetectable entries go to the critic');
  assert.deepEqual(r.client, prose);
});

test('source patterns: eyebrow classes, hover lifts, generated noise, placeholders and jump bars are found', () => {
  const { entries } = bannedEntries(null);
  const found = sourceBanned([
    { name: 'sections/01.html', kind: 'html', text: '<section data-section="a"><p class="tb-eyebrow">Plans</p><h2>The plan.</h2><p>{{?CONFIRM PRICE}}</p><!-- <p class="eyebrow">in a comment</p> --></section>' },
    { name: 'sections/02.html', kind: 'html', text: '<section data-section="b"><nav><b>On this page</b></nav><svg><filter><feTurbulence baseFrequency=".8"/></filter></svg></section>' },
    { name: 'styles.css', kind: 'css', text: '.card:hover { transform: translateY(-4px); } /* .x:hover { transform: translateY(-2px) } */ .btn:active { transform: translateY(1px); }' },
  ], entries);
  const ids = found.map((f) => f.id);
  for (const id of ['eyebrow', 'visible-placeholder', 'on-this-page-bar', 'blur-noise-decoration', 'hover-lift']) assert.ok(ids.includes(id), id);
  assert.equal(found.filter((f) => f.id === 'eyebrow').length, 1, 'a commented-out eyebrow is not one');
  assert.equal(found.filter((f) => f.id === 'hover-lift').length, 1, 'a press-in on :active is fine, and a comment is skipped');
});

const SITE = { title: 'Plan for Example Co', description: 'A plan.', model: { inputs: {}, formulas: {} }, facts: {} };
test('site:check blocks a banned pattern from sites@1.15, and warns on an older pin', () => {
  const sections = [{ name: '01.html', html: '<section data-section="hero"><p class="eyebrow">Overview</p><h1>One plan for Example Co.</h1></section>' }];
  const unpinned = checkSite({ site: SITE, sections });
  assert.ok(unpinned.errors.some((e) => /banned "eyebrow"/.test(e)), unpinned.errors.join('\n'));
  const old = checkSite({ site: { ...SITE, engine: 'sites@1.14' }, sections });
  assert.ok(!old.errors.some((e) => /banned/.test(e)));
  assert.ok(old.warnings.some((w) => /banned "eyebrow"/.test(w)));
  const kit = { rules: [{ id: 'no-swoosh', rule: 'No swoosh art.', detect: { source: [{ in: 'html', pattern: 'swoosh' }] } }] };
  const withKit = checkSite({ site: SITE, sections: [{ name: '01.html', html: '<section data-section="hero"><h1>One plan.</h1><img src="assets/swoosh.png" alt=""></section>' }], kit });
  assert.ok(withKit.errors.some((e) => /banned "no-swoosh"/.test(e)), 'a kit rule blocks too');
});

// ---------- DOM detectors, in a browser ----------

let browser;
let server;
let root;
before(async () => {
  browser = await puppeteer.launch(stableLaunch());
  root = await mkdtemp(join(tmpdir(), 'banned-'));
  const page = (body, css = '') => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>body{margin:0;font:16px/1.5 Georgia,serif;background:#fff;color:#111} main{padding:24px} ${css}</style></head><body>${body}</body></html>`;
  const files = {
    'clean.html': page(`<header><a href="/"><img alt="Example logo" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" width="120" height="30"></a></header>
      <main><section class="hero"><h1>One plan for Example Co.</h1><p>Short and plain.</p><a class="btn" href="#go">Book a call</a> <a href="#more">Read the plan</a></section>
      <section id="go"><h2>The plan</h2><p>Two sentences of plain copy. Nothing else.</p><details><summary>More</summary><p>${'word '.repeat(90)}</p></details>
      <ol><li><h3>A step</h3><p>Short step copy.</p><details open><summary>Details</summary><p>${'word '.repeat(90)}</p></details></li></ol></section></main>`,
    '.btn{display:inline-block;padding:12px 20px;background:#0f6b4f;color:#fff;text-decoration:none} .btn:active{transform:translateY(1px)}'),
    'dirty.html': page(`<header><img alt="University logo" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" width="120" height="30"><img alt="School logo" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" width="120" height="30"></header>
      <div class="draft">Draft for review, not final</div>
      <main><section class="hero"><p class="eb">Dental clinics</p><h1>Care that fits.</h1>
        <a class="btn" href="#a">Request an appointment</a><a class="ghost" href="#b">Find a clinic</a>
        <ul class="chips"><li><a class="chip" href="#c">Cleanings</a></li><li><a class="chip" href="#d">Implants</a></li><li><a class="chip" href="#e">Braces</a></li></ul></section>
        <nav class="jump"><a href="#one">One</a><a href="#two">Two</a><a href="#three">Three</a></nav>
        <section id="one"><h2>Gold copy</h2><p class="gold">Gold text on white.</p><p>See <a class="ul" href="#x">our clinics</a> today.</p></section>
        <section id="two"><h2>Walls</h2><p>${'word '.repeat(80)}</p><p>{{?CONFIRM HOURS}}</p><select><option>Pick</option></select></section>
        <section id="three"><h2>Motion</h2><div class="card">Lifts</div><div class="blob"></div><div class="pic"><img alt="" width="400" height="300" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Crect width='400' height='300' fill='%23888'/%3E%3C/svg%3E"></div></section>
        <svg width="0" height="0"><filter id="n"><feTurbulence baseFrequency=".9"/></filter></svg></main>`,
    `.eb{font-size:12px;text-transform:uppercase;letter-spacing:.14em} .btn{display:inline-block;padding:12px 20px;background:#0f6b4f;color:#fff}
     .ghost{display:inline-block;padding:12px 20px;border:2px solid #0f6b4f;color:#0f6b4f}
     .chip{display:inline-block;padding:4px 12px;border-radius:999px;background:#eee;font-size:14px;line-height:24px}
     .gold{color:#CFB87C} .ul{text-decoration:underline;text-decoration-color:#CFB87C;color:#111}
     .card{width:200px;height:120px;background:#eee} .card:hover{transform:translateY(-6px)}
     .blob{width:200px;height:200px;background:#f0a;filter:blur(40px)}
     .pic img{clip-path:inset(0 100% 0 0);transition:clip-path 1s}`),
  };
  for (const [name, html] of Object.entries(files)) await writeFile(join(root, name), html);
  server = await serveDir(root);
});
after(async () => {
  await browser?.close();
  await server?.close();
});

async function findingsFor(file, width = 1280, entries = bannedEntries(null).entries) {
  const page = await browser.newPage();
  await page.setViewport({ width, height: 800 });
  await page.goto(`${server.url}/${file}`, { waitUntil: 'networkidle0' });
  const found = await domBanned(page, entries, { width });
  await page.close();
  return found;
}

test('every DOM detector fires on the pattern it bans', async () => {
  const ids = new Set((await findingsFor('dirty.html')).map((f) => f.id));
  for (const id of ['eyebrow', 'accent-text-on-light', 'accent-underline-link', 'outlined-secondary', 'hover-lift', 'blur-noise-decoration', 'image-reveal', 'on-this-page-bar', 'visible-placeholder', 'crowded-hero', 'wall-of-text', 'native-select-desktop', 'double-logo', 'draft-banner']) {
    assert.ok(ids.has(id), `${id} fired (got ${[...ids].join(', ')})`);
  }
  for (const e of BANNED.entries.filter((x) => x.detect?.dom)) assert.ok(DETECTORS[e.detect.dom], e.id);
});

test('a clean page has no banned findings, and a native select is fine on a phone', async () => {
  assert.deepEqual(await findingsFor('clean.html'), []);
  const phone = (await findingsFor('dirty.html', 390)).map((f) => f.id);
  assert.ok(!phone.includes('native-select-desktop'));
});

test('a client rule needs no code: accent-text with the brand colour, and a selector rule', async () => {
  const { entries } = bannedEntries({ rules: [
    { id: 'no-gold-text', rule: 'Never gold text.', detect: { dom: 'accent-text', params: { colors: ['#CFB87C'] } } },
    { id: 'no-chips', rule: 'No chips.', detect: { dom: 'selector', params: { selector: '.chip' } } },
  ] }, []);
  const ids = (await findingsFor('dirty.html', 1280, entries)).map((f) => f.id);
  assert.ok(ids.includes('no-gold-text') && ids.includes('no-chips'));
  assert.deepEqual(await findingsFor('clean.html', 1280, entries), []);
});

test('the toolbox templates pass the banned list: a new site starts clean', async () => {
  const STARTER = join(import.meta.dirname, '..');
  for (const name of ['proposal', 'data-proposal']) {
    const dir = await mkdtemp(join(tmpdir(), `banned-${name}-`));
    await mkdir(join(dir, 'brand'), { recursive: true });
    await symlink(join(STARTER, 'node_modules'), join(dir, 'node_modules'));
    scaffold(dir, name);
    // site:new leaves no brand kit; the starter's own is enough to build.
    const kit = await readFile(join(STARTER, 'brand', 'brand.json'), 'utf8').catch(() => null);
    if (kit) await writeFile(join(dir, 'brand', 'brand.json'), kit);
    const sections = (await readdir(join(dir, 'site', 'sections'))).filter((f) => f.endsWith('.html'));
    const source = sourceBanned(await Promise.all(sections.map(async (f) => ({ name: f, kind: 'html', text: await readFile(join(dir, 'site', 'sections', f), 'utf8') }))), bannedEntries(null).entries);
    assert.deepEqual(source.map((f) => f.message), [], `${name}: source`);
    await buildSite({ root: dir, out: 'dist-site' });
    const srv = await serveDir(join(dir, 'dist-site'));
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(`${srv.url}/`, { waitUntil: 'networkidle0' });
    const found = await domBanned(page, bannedEntries(null).entries.filter((e) => ['eyebrow', 'outlined-secondary', 'hover-lift', 'blur-noise-decoration', 'on-this-page-bar', 'double-logo', 'draft-banner', 'image-reveal'].includes(e.id)), { width: 1280 });
    await page.close();
    await srv.close();
    assert.deepEqual(found.map((f) => f.message), [], `${name}: rendered`);
  }
});

test('the banned guide lists every house entry, so the critic and the builder read the same list', async (t) => {
  const guide = join(import.meta.dirname, '..', '..', '..', '..', '..', '..', '..', 'guide', 'banned.md');
  const { existsSync } = await import('node:fs');
  if (!existsSync(guide)) return t.skip('the guide lives in the plugin repo, not in a deck');
  const text = await readFile(guide, 'utf8');
  for (const e of BANNED.entries) assert.match(text, new RegExp(`\\| \`${e.id}\` \\|`), `guide/banned.md lists ${e.id}`);
});
