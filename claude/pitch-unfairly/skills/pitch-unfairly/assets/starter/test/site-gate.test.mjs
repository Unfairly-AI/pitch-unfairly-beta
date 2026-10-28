// The multi-width QA gate: a small multi-page site with one known bug per check,
// and a clean page, run through the gate. Each check must fire where the bug is
// (including bugs only an opened state shows), stay quiet on the clean page, and
// the stamp must let exactly the gated files publish.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer';
import { GATE, GATE_CHECKS, GATE_WIDTHS, digestFromFiles, distDigest, distFiles, gateStamp, runGate, stampProblem, writeGateFiles } from '../bin/site/gate.mjs';
import { bannedEntries } from '../bin/site/banned.mjs';
import { serveDir } from '../bin/serve.mjs';
import { stableLaunch } from '../bin/stable-shots.mjs';

const STARTER = resolve(import.meta.dirname, '..');
const SCREENS = [[320, 640], [1280, 800]];
const PHOTO = (fill) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="${fill}"/></svg>`)}`;

const shell = (title, body, css = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<style>*{box-sizing:border-box} body{margin:0;font:16px/1.5 Georgia,serif;color:#111;background:#fff} main{padding:0 16px;max-width:1100px;margin:0 auto}
nav a{display:inline-block;padding:12px;min-height:44px;min-width:44px} .btn{display:inline-block;padding:12px 20px;min-height:48px;background:#0f6b4f;color:#fff;text-decoration:none} ${css}</style></head>
<body><header><nav><a href="/">Home</a> <a href="/broken.html">Broken</a> <a href="/clean.html">Clean</a></nav></header><main>${body}</main></body></html>`;

let root;
let server;
let browser;
let result;
before(async () => {
  root = await mkdtemp(join(tmpdir(), 'site-gate-'));
  await mkdir(join(root, 'img'));
  // A real photo file, used twice on the broken page (once at a size variant).
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await writeFile(join(root, 'img', 'clinic.jpg'), png);
  await writeFile(join(root, 'img', 'clinic-800w.jpg'), png);
  await writeFile(join(root, 'index.html'), shell('Home', `<section><h1>Example Dental</h1><p>A short page.</p><a class="btn" href="/clean.html">Book a visit</a></section>
    <section><h2>Links</h2><p><a href="/clean.html#hours">Hours</a>, <a href="/clean.html#nowhere">a dead anchor</a> and <a href="/missing.html">a missing page</a>.</p></section>`));
  await writeFile(join(root, 'clean.html'), shell('Clean', `<h1>Cleanings</h1><p>Plain copy that fits every width.</p><a class="btn" href="/">Book a visit</a>
    <section id="hours"><h2>Hours</h2><div class="g"><p>Monday</p><p>Tuesday</p><p>Wednesday</p><p>Thursday</p></div>
    <details><summary>More about cleanings</summary><p>Short detail.</p></details>
    <button aria-expanded="false" aria-controls="m1" onclick="this.setAttribute('aria-expanded', this.getAttribute('aria-expanded') !== 'true'); document.getElementById('m1').hidden = !document.getElementById('m1').hidden">Menu</button>
    <ul id="m1" hidden><li><a href="/">Home</a></li></ul>
    <img alt="" src="/img/clinic.jpg" style="width:300px;height:200px"></section>`,
  `.g{display:grid;grid-template-columns:repeat(2,1fr);gap:12px} button, summary{min-height:44px;min-width:44px;padding:10px 0} #m1 a{display:inline-block;min-height:44px;padding:12px}`));
  await writeFile(join(root, 'broken.html'), shell('Broken', `<div class="spacer"></div><h1>Root canals</h1><a class="btn" href="/">Request an appointment</a>
    <div class="wide">This line is far wider than a phone.</div>
    <div class="grid"><div>One</div><div>Two</div><div>Three</div><div>Four</div></div>
    <div class="narrow">Schedule a consultation appointment today</div>
    <p class="clip">A label that is cut off by its box at every width we check</p>
    <div class="stack"><span class="a">First line of text</span><span class="b">Second line on top</span></div>
    <a class="tiny" href="/">x</a>
    <img alt="" src="/img/clinic.jpg" style="width:300px;height:200px"><img alt="" src="/img/clinic-800w.jpg" style="width:300px;height:200px">
    <details><summary>Open me</summary><div class="hidden-wide">Only wide when opened: ${'w'.repeat(10)}</div></details>
    <button class="menu" aria-expanded="false" onclick="this.setAttribute('aria-expanded','true');document.querySelector('.panel').hidden=false">Menu</button>
    <div class="panel" hidden><p>Opened menu text that runs off the right edge of the screen</p></div>
    <p><a href="/nope.html">another missing page</a></p>`,
  `.spacer{height:1400px} .wide{width:1600px;background:#eee}
   .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px} .narrow{width:60px;font-size:16px}
   .clip{width:120px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
   .stack{position:relative;height:40px} .stack span{position:absolute;left:0;top:0;font-size:20px}
   .tiny{display:inline-block;font-size:12px}
   .hidden-wide{width:2000px} .menu{min-height:44px;min-width:44px} .panel{position:relative;left:200px;width:1500px}`));
  server = await serveDir(root);
  browser = await puppeteer.launch(stableLaunch());
  result = await runGate(browser, server.url, { screens: SCREENS, entries: bannedEntries(null).entries, out: join(root, '..', `${root.split('/').pop()}-out`) });
});
after(async () => {
  await browser?.close();
  await server?.close();
});

const on = (page, check) => result.findings.filter((f) => f.page === page && f.check === check);

test('the crawl finds every page from /, and every link or #fragment that does not resolve', () => {
  assert.deepEqual([...result.pages].sort(), ['/', '/broken.html', '/clean.html']);
  const links = result.findings.filter((f) => f.check === 'broken-link').map((f) => f.message).join('\n');
  assert.match(links, /missing\.html returns 404/);
  assert.match(links, /nope\.html returns 404/);
  assert.match(links, /#nowhere.*fragment/);
  assert.doesNotMatch(links, /#hours/);
});

test('each geometry check fires on the page that has the bug, at the width it shows', () => {
  const at = (check, width) => on('/broken.html', check).filter((f) => !width || f.widths.includes(width));
  assert.ok(at('sideways-scroll', 320).length, 'sideways scroll at 320');
  assert.ok(at('off-screen', 320).length, 'text off screen');
  assert.ok(at('empty-grid-cell', 1280).some((f) => /2 empty cells/.test(f.message)), 'a 3-up of 4 leaves two empty cells');
  assert.ok(at('one-word-per-line').some((f) => /Schedule a consultation/.test(f.message)), 'one word per line');
  assert.ok(at('clipped-text').some((f) => /A label that is cut off/.test(f.message)), 'clipped text');
  assert.ok(at('colliding-text').some((f) => /First line of text/.test(f.message)), 'colliding text');
  assert.ok(at('tap-target', 320).some((f) => /"x"/.test(f.message)), 'a small tap target on a phone');
  assert.ok(!at('tap-target', 1280).length, 'tap targets are a phone rule');
  assert.ok(at('primary-below-fold', 1280).some((f) => /Request an appointment/.test(f.message)), 'the primary action below the first screen');
  assert.ok(at('duplicate-photo').some((f) => /clinic/.test(f.message)), 'the same photo twice, size variants included');
});

test('states are opened: a bug inside a closed <details> or a closed menu is found in that state', () => {
  const opened = on('/broken.html', 'off-screen').flatMap((f) => f.states);
  assert.ok(opened.includes('details open'), `details state (got ${opened.join(', ')})`);
  assert.ok(opened.some((s) => /"Menu" open/.test(s)), 'menu state');
});

test('the clean page and the home page have no findings', () => {
  const noisy = result.findings.filter((f) => f.page === '/clean.html' || (f.page === '/' && f.check !== 'broken-link'));
  assert.deepEqual(noisy.map((f) => `${f.page} [${f.check}] ${f.message}`), []);
});

test('the gate writes a contact sheet and a report, and covers every width by default', async () => {
  assert.ok(result.sheet && existsSync(result.sheet), 'contact-sheet.png');
  assert.deepEqual(GATE_WIDTHS, [320, 360, 390, 768, 1024, 1280, 1440, 1920]);
  for (const c of ['sideways-scroll', 'clipped-text', 'colliding-text', 'empty-grid-cell', 'one-word-per-line', 'tap-target', 'primary-below-fold', 'duplicate-photo', 'broken-link', 'banned']) assert.ok(GATE_CHECKS.includes(c), c);
});

test('the stamp lets exactly the gated files publish', async () => {
  const files = await distFiles(root);
  const digest = await distDigest(root);
  assert.equal(digest, digestFromFiles(files), 'the host can recompute the digest from the manifest file list');
  const dirty = gateStamp({ digest, pages: result.pages, findings: result.findings });
  assert.match(stampProblem(dirty, digest), /found \d+ problem/);
  const clean = gateStamp({ digest, pages: result.pages, findings: [] });
  assert.equal(clean.gate, GATE);
  assert.equal(stampProblem(clean, digest), null);
  assert.match(stampProblem(clean, 'other'), /changed after the last clean gate run/);
  assert.match(stampProblem(null, digest), /no gate stamp/);

  // upload.mjs refuses a folder of pages with no stamp, or a stale one, and goes on with a clean matching one.
  const work = await mkdtemp(join(tmpdir(), 'site-gate-upload-'));
  await writeFile(join(work, 'uploads.json'), '[]');
  const upload = (extra = []) => spawnSync(process.execPath, [join(STARTER, 'bin/upload.mjs'), 'uploads.json', root, ...extra], { cwd: work, encoding: 'utf8' });
  const none = upload();
  assert.notEqual(none.status, 0);
  assert.match(none.stderr, /no gate stamp/);
  await writeGateFiles(join(work, 'artifacts', 'gate'), dirty, result);
  assert.match(upload().stderr, /found \d+ problem/);
  await writeGateFiles(join(work, 'artifacts', 'gate'), clean, { pages: result.pages, findings: [] });
  const ok = upload();
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /Uploaded 0 files/);
  await writeGateFiles(join(work, 'elsewhere'), clean, { pages: result.pages, findings: [] });
  assert.equal(upload(['--gate', join(work, 'elsewhere', 'gate.json')]).status, 0, '--gate names the stamp');
});
