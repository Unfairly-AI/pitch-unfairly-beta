// Interactive slides are checked in their live state (bin/live-check.mjs), not
// only in the static render (?pdf=1, html.is-static) that hides their controls.
// The fixture's first slide is the Metaview / Halvorsen compare slider as it
// shipped (Nov 2026): `.compare::after` declared twice (top in one rule, bottom
// in the other) stretched the "Drag to compare" pill into a tall column over
// the scorecard, and the handle rested at 4%. Skipped when no browser launches.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serveDir } from '../bin/serve.mjs';
import { checkLiveStates } from '../bin/live-check.mjs';

const COMPARE = (id, value, pillRules) => `
<div class="deck-frame"><section class="slide" id="${id}">
  <h2>Notes fills the scorecard from each interview.</h2>
  <figure class="compare" data-compare style="--pos: ${value}%">
    <div class="layer before"><div class="card"><p class="c-title">Interview scorecard</p><p class="row">Awaiting feedback from the panel</p></div></div>
    <div class="layer after"><div class="card"><p class="c-title">Interview scorecard</p><p class="row">Built payments infra from zero as sole engineer</p><p class="row">Six years of backend engineering, distributed systems</p></div></div>
    <div class="handle"></div>
    <input class="range" type="range" min="2" max="98" value="${value}" aria-label="Compare today with Notes">
  </figure>
  <style>${pillRules.replaceAll('#ID', `#${id}`)}</style>
</section></div>`;

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
  body { margin: 0; font: 32px/1.3 sans-serif; color: #111; background: #fff; }
  .deck-frame { position: relative; width: 1920px; height: 1080px; overflow: hidden; }
  .slide { position: relative; width: 1920px; height: 1080px; padding: 96px; box-sizing: border-box; overflow: hidden; background: #f4f1ea; }
  h2 { font-size: 64px; margin: 0; max-width: 760px; }
  .compare { position: absolute; top: 0; right: 0; bottom: 0; width: 960px; margin: 0; background: #d9e7dd; }
  .layer { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
  .before { clip-path: inset(0 calc(100% - var(--pos)) 0 0); z-index: 2; }
  .card { width: 760px; background: #fff; border-radius: 16px; padding: 40px; box-sizing: border-box; }
  .c-title { font-size: 36px; font-weight: 600; margin: 0 0 24px; }
  .row { font-size: 28px; margin: 0 0 16px; }
  .handle { position: absolute; top: 0; bottom: 0; left: var(--pos); width: 2px; background: #2b6; z-index: 3; }
  .range { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: ew-resize; z-index: 4; }
  html.is-static .handle, html.is-static .compare::after { display: none; }
  .ghost { position: absolute; left: 2100px; top: 400px; font-size: 28px; }
</style></head><body><main class="stage">
${COMPARE('broken', 4, `
  #ID .compare::after { top: 120px; bottom: auto; }
  #ID .compare::after { content: 'Drag to compare'; position: absolute; z-index: 3; bottom: 48px; left: 50%; transform: translateX(-50%); font-size: 24px; background: #fff; padding: 8px 18px; border-radius: 999px; pointer-events: none; }`)}
${COMPARE('fixed', 50, `
  #ID .compare::after { content: 'Drag to compare'; position: absolute; z-index: 3; bottom: 48px; left: 50%; transform: translateX(-50%); font-size: 24px; background: #fff; padding: 8px 18px; border-radius: 999px; pointer-events: none; }`)}
<div class="deck-frame"><section class="slide" id="dead"><h2>Pick a plan.</h2><button type="button" style="font-size:32px;padding:16px 32px">Show the annual price</button></section></div>
<div class="deck-frame"><section class="slide" id="offstage"><h2>Pick a plan.</h2><button type="button" class="ghost" onclick="this.textContent='Picked'">Show the annual price</button></section></div>
<div class="deck-frame"><section class="slide" id="still"><h2>One headline, nothing to drag.</h2></section></div>
</main><script>
  const frames = [...document.querySelectorAll('.deck-frame')];
  for (const fig of document.querySelectorAll('[data-compare]')) {
    const range = fig.querySelector('.range');
    range.addEventListener('input', () => fig.style.setProperty('--pos', range.value + '%'));
  }
  window.deckReplay = (i) => { document.scrollingElement.scrollTo(0, frames[i].offsetTop); frames[i].firstElementChild.dispatchEvent(new CustomEvent('deck:enter')); };
  window.__deckReady = true;
</script></body></html>`;

let browser = null;
let server = null;
before(async () => {
  try {
    const { default: puppeteer } = await import('puppeteer');
    browser = await puppeteer.launch({ headless: true });
    const dir = await mkdtemp(join(tmpdir(), 'live-check-'));
    await writeFile(join(dir, 'index.html'), PAGE);
    server = await serveDir(dir);
  } catch {
    browser = null;
  }
});
after(async () => {
  await browser?.close();
  await server?.close();
});

let result = null;
const run = async () => (result ??= await (async () => {
  const out = await mkdtemp(join(tmpdir(), 'live-shots-'));
  return { out, ...(await checkLiveStates(browser, server.url, { out })) };
})());
const of = (r, id) => r.issues.filter((i) => i.startsWith(`${id}:`));

function browserTest(name, fn) {
  test(name, async (t) => {
    if (!browser) return t.skip('no headless browser here (npm run setup:browser)');
    await fn(await run());
  });
}

browserTest('finds the slides that hold a control, and only those', (r) => {
  assert.deepEqual(r.slides.map((s) => s.id), ['broken', 'fixed', 'dead', 'offstage']);
});

browserTest('the stretched "Drag to compare" pill fails: too tall, and covering the scorecard', (r) => {
  const issues = of(r, 'broken');
  assert.ok(issues.some((i) => /label "Drag to compare" \(figure::after\) is stretched to \d+px tall/.test(i) && /both top and bottom/.test(i)), issues.join('\n'));
  assert.ok(issues.some((i) => /"Drag to compare" \(figure::after\) covers/.test(i)), issues.join('\n'));
});

browserTest('a compare slider resting at its edge fails', (r) => {
  assert.ok(of(r, 'broken').some((i) => /rests at 2% of its range/.test(i)), of(r, 'broken').join('\n'));
});

browserTest('the same slider with one pill rule, resting mid-way, passes', (r) => {
  assert.deepEqual(of(r, 'fixed'), []);
});

browserTest('a control that changes nothing fails', (r) => {
  assert.ok(of(r, 'dead').some((i) => /clicking "Show the annual price" changed nothing/.test(i)), of(r, 'dead').join('\n'));
});

browserTest('a control off the slide fails', (r) => {
  assert.ok(of(r, 'offstage').some((i) => /control "Show the annual price" is off the slide/.test(i)), of(r, 'offstage').join('\n'));
});

browserTest('writes start, settled and after screenshots per interactive slide', async (r) => {
  const names = (await readdir(r.out)).sort();
  for (const n of ['01-broken', '02-fixed']) for (const s of ['start', 'settled', 'after']) assert.ok(names.includes(`${n}--${s}.png`), `${n}--${s}.png in ${names.join(', ')}`);
  assert.ok(!names.some((n) => n.startsWith('05-still')));
});
