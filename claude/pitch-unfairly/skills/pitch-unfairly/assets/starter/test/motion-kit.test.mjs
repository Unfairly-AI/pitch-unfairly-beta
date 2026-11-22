// The motion kit: its tokens come from the brand's preset, its source rules
// catch a slide's own timing and layout-property animation, its live checks
// catch two showpieces, an endless loop, moving paragraphs, a slow entrance,
// a carry with no partner, and anything not at rest in the PDF or with
// reduced motion; and every toolbox layout passes them. Browser parts skip
// when no headless browser launches.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MOTION, brandCss } from '../bin/brand-lib.mjs';
import { auditMotion, FEATURES, keyframesIn, motionSourceProblems, stripCalls } from '../bin/motion-check.mjs';
import { carryTransform } from '../src/scripts/motion.js';
import { serveDir } from '../bin/serve.mjs';

const STARTER = fileURLToPath(new URL('..', import.meta.url));

test('every motion preset is one curve family and one duration ladder, written into brand.css', () => {
  for (const [name, m] of Object.entries(MOTION)) {
    for (const k of ['ease', 'exit', 'move', 'pop']) assert.match(m[k], /^cubic-bezier\(/, `${name}.${k}`);
    assert.equal(m.ladder.length, 4, `${name}: micro, small, medium, large`);
    assert.ok(m.ladder.every((v, i) => i === 0 || v > m.ladder[i - 1]), `${name}: the ladder grows with distance`);
    assert.ok(m.dwell > m.enter, `${name}: a step holds longer than an entrance`);
    const exit = m.exit.match(/-?\d*\.?\d+/g).map(Number);
    assert.ok(exit[0] > exit[1], `${name}: the exit curve starts slow (accelerates)`);
  }
  // calm no longer writes CSS's own "ease" keyword curve.
  assert.notEqual(MOTION.calm.ease, 'cubic-bezier(0.25, 0.1, 0.25, 1)');
  const kit = { palette: { paper: '#ffffff', ink: '#111111', accent: '#2255ff' }, typography: { display: { family: 'Inter', source: 'system' }, body: { family: 'Inter', source: 'system' } }, style: { motion: 'crisp' } };
  const css = brandCss(kit, '', '../../brand/', { fundamentals: false });
  for (const token of ['--ease', '--ease-exit', '--ease-move', '--ease-pop', '--dur-enter', '--stagger', '--dur-micro', '--dur-small', '--dur-medium', '--dur-large', '--dwell']) {
    assert.match(css, new RegExp(`\\s${token}: `), token);
  }
  assert.match(css, /--dur-large: 400ms;/, 'crisp takes Carbon\'s ladder');
});

test('ACCEPTANCE: the source check catches a slide\'s own easing, raw durations and layout-property animation', () => {
  const bad = `<div style="--d: 300ms"></div>
<style>
  .a { animation: grow 640ms var(--ease) var(--d, 0ms) both; }
  .b { transition: width 220ms var(--ease); }
  .c { animation: rise var(--dur-enter) cubic-bezier(0.2, 0, 0, 1) both; }
  @keyframes grow {
    from { height: 0; }
    to { height: 100%; }
  }
</style>`;
  const p = motionSourceProblems([{ path: 'src/slides/04.astro', text: bad }]);
  assert.ok(p.some((x) => /:3: animation with a raw duration \(640ms\)/.test(x)), p.join('\n'));
  assert.ok(p.some((x) => /:4: transition with a raw duration \(220ms\)/.test(x)), p.join('\n'));
  assert.ok(p.some((x) => /:4: a transition on width/.test(x)), p.join('\n'));
  assert.ok(p.some((x) => /:5: an easing of the slide's own \(cubic-bezier/.test(x)), p.join('\n'));
  assert.ok(p.some((x) => /:6: @keyframes grow animates height/.test(x)), p.join('\n'));
  assert.ok(!p.some((x) => /:1:/.test(x)), 'a custom property holding a delay is not an animation');

  const good = `<style>
  .a { animation: grow var(--dur-grow) var(--ease) calc(var(--d, 0ms) + 260ms) both; }
  .b { transition: transform var(--dur-small) var(--ease), opacity var(--dur-small) var(--ease); }
  .c { transition: opacity 400ms linear; } /* motion-ok: a deliberate exception */
  @keyframes grow { from { transform: scaleY(0); } to { transform: none; } }
</style>`;
  assert.deepEqual(motionSourceProblems([{ path: 'x.astro', text: good }]), []);
  assert.equal(stripCalls('calc(var(--d, 0ms) + 260ms) 300ms').trim(), '300ms');
  assert.deepEqual(keyframesIn('@keyframes a { from { opacity: 0 } to { opacity: 1 } }').map((k) => k.name), ['a']);
});

test('ACCEPTANCE: every toolbox layout and component times its motion with the brand\'s tokens', async () => {
  const files = [];
  for (const dir of ['slide-toolbox/layouts', 'src/slides']) {
    for (const name of (await readdir(join(STARTER, dir))).filter((n) => n.endsWith('.astro'))) files.push({ path: `${dir}/${name}`, text: await readFile(join(STARTER, dir, name), 'utf8') });
  }
  assert.deepEqual(motionSourceProblems(files), []);
});

test('a carry lines the arriving element up with where it was, in slide coordinates', () => {
  const frame = { left: 0, top: 0 };
  const t = carryTransform({ left: 100, top: 100, width: 400, height: 200 }, frame, { left: 500, top: 300, width: 800, height: 400 }, { left: 0, top: 1080 - 1080 }, 0.5);
  // Centers 300,200 and 900,500 on screen; at half scale that is 1200px and 600px on the stage.
  assert.equal(Math.round(t.dx), -1200);
  assert.equal(Math.round(t.dy), -600);
  assert.equal(t.kx, 0.5);
  assert.equal(t.ky, 0.5);
  assert.match(t.css, /^translate\(-1200\.0px, -600\.0px\) scale\(0\.5000, 0\.5000\)$/);
});

// ── In a browser ─────────────────────────────────────────────────────────

const slide = (id, inner) => `<div class="deck-frame"><section class="slide" id="slide-${id}">${inner}</section></div>`;
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><script>
  if (/[?&]pdf=1/.test(location.search)) document.documentElement.classList.add('is-pdf', 'is-static');
</script><style>
  :root { --dur-enter: 600ms; --ease: cubic-bezier(0.05, 0.7, 0.1, 1); --ease-move: cubic-bezier(0.2, 0, 0, 1); --dur-large: 500ms; --stagger: 110ms; }
  body { margin: 0; font: 28px/1.3 sans-serif; }
  .deck-frame { position: relative; width: 1920px; height: 1080px; overflow: hidden; }
  .slide { position: relative; width: 1920px; height: 1080px; padding: 96px; box-sizing: border-box; }
  .is-active .rise { animation: rise var(--dur-enter) var(--ease) var(--d, 0ms) both; }
  @keyframes rise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
  .is-active .spin { animation: spin 2s linear infinite; }
  @keyframes spin { to { transform: rotate(1turn); } }
  .box { width: 200px; height: 120px; background: #ccd; }
  #slide-pdf-hidden .ghost { opacity: 0; }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: 1ms !important; animation-delay: 0s !important; animation-iteration-count: 1 !important; }
  }
  html.is-static *, html.is-static *::before, html.is-static *::after { animation-delay: -60s !important; animation-iteration-count: 1 !important; }
  @media (prefers-reduced-motion: reduce) { #slide-reduce-ignored .box { animation: rise 3s linear 0s 1 both !important; } }
</style></head><body><main class="stage">
${slide('good', '<h2 data-m="words" class="rise">Plans land before the vans start.</h2><ul data-m="stagger"><li class="rise">One</li><li class="rise">Two</li></ul>')}
${slide('two', '<span class="count-up" data-m="count" data-to="41" data-decimals="0" data-prefix="" data-suffix="">41</span><figure data-m="focus"><div class="box"></div></figure>')}
${slide('chart', '<div data-m="grow"><div class="box"></div><span class="count-up" data-m="count" data-to="9" data-decimals="0" data-prefix="" data-suffix="">9</span></div>')}
${slide('loop', '<div class="box spin">Always turning</div>')}
${slide('paragraph', '<p data-m="words">Every one of these twenty words rises on its own while the buyer is trying to read the sentence through to its end.</p>')}
${slide('slow', '<p class="rise" style="--d: 4200ms">Late</p>')}
${slide('ambient-chart', '<div data-m="ambient" aria-hidden="true"></div><div data-m="grow"><div class="box"></div></div>')}
${slide('carry-a', '<div class="box" data-carry="board" style="margin-left: 0">Board</div>')}
${slide('carry-b', '<div class="box" data-carry="board" style="margin-left: 1200px; width: 600px">Board</div>')}
${slide('orphan', '<p class="rise">Gap</p><div class="box" data-carry="lonely">Alone</div>')}
${slide('pdf-hidden', '<div data-m="grow"><p class="ghost">Never shown</p></div>')}
${slide('reduce-ignored', '<div data-m="grow"><div class="box">Keeps moving</div></div>')}
</main><script type="module">
  import { playCarry } from './motion.js';
  const frames = [...document.querySelectorAll('.deck-frame')];
  const slides = frames.map((f) => f.firstElementChild);
  let current = -1;
  window.deckStill = () => document.documentElement.classList.contains('is-static') || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const enter = (i) => {
    const from = current;
    current = i;
    slides.forEach((s, k) => s.classList.toggle('is-active', k === i));
    document.scrollingElement.scrollTo(0, frames[i].offsetTop);
    if (from >= 0) playCarry(slides[from], slides[i]);
  };
  window.deckReplay = (i) => { current = -1; slides.forEach((s) => s.classList.remove('is-active')); void document.body.offsetWidth; enter(i); };
  addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') enter(Math.min(current + 1, slides.length - 1)); });
  window.__deckReady = true;
</script></body></html>`;

let browser = null;
let server = null;
let result = null;
before(async () => {
  try {
    const { default: puppeteer } = await import('puppeteer');
    browser = await puppeteer.launch({ headless: true });
    const dir = await mkdtemp(join(tmpdir(), 'motion-kit-'));
    await writeFile(join(dir, 'index.html'), PAGE);
    await copyFile(join(STARTER, 'src/scripts/motion.js'), join(dir, 'motion.js'));
    server = await serveDir(dir);
  } catch {
    browser = null;
  }
});
after(async () => {
  await browser?.close();
  await server?.close();
});

const of = (id) => result.problems.filter((p) => p.includes(`: ${id}: `));
function browserTest(name, fn) {
  test(name, async (t) => {
    if (!browser) return t.skip('no headless browser here (npm run setup:browser)');
    result ??= await auditMotion(browser, server.url);
    await fn();
  });
}

browserTest('a slide with one showpiece and short moving words passes', () => {
  assert.deepEqual(of('good'), []);
});

browserTest('ACCEPTANCE: two showpieces on one slide fail; a count inside a growing chart is one', () => {
  assert.ok(of('two').some((p) => /two showpieces \(count and focus\)/.test(p)), of('two').join('\n'));
  assert.deepEqual(of('chart'), []);
  assert.ok(FEATURES.includes('focus') && !FEATURES.includes('stagger'));
});

browserTest('ACCEPTANCE: a loop with no pause button fails', () => {
  assert.ok(of('loop').some((p) => /loops forever with no pause button/.test(p)), of('loop').join('\n'));
});

browserTest('ACCEPTANCE: moving words in a paragraph fail', () => {
  assert.ok(of('paragraph').some((p) => /moves 23 words; words being read stay still/.test(p)), of('paragraph').join('\n'));
});

browserTest('ACCEPTANCE: an entrance past the brand\'s budget fails', () => {
  assert.ok(of('slow').some((p) => /lands at 4800ms .* everything lands by 3000ms/.test(p)), of('slow').join('\n'));
});

browserTest('ambient light under a chart fails', () => {
  assert.ok(of('ambient-chart').some((p) => /an ambient field under grow/.test(p)), of('ambient-chart').join('\n'));
});

browserTest('ACCEPTANCE: a carry travels when stepping in from its partner; one with no partner fails', () => {
  assert.deepEqual(of('carry-b'), []);
  assert.ok(of('orphan').some((p) => /data-carry="lonely" has no partner/.test(p)), of('orphan').join('\n'));
});

browserTest('ACCEPTANCE: a primitive left transparent in the PDF fails, and so does motion that ignores reduced motion', () => {
  assert.ok(of('pdf-hidden').some((p) => p.startsWith('motion-pdf:') && /leaves p "Never shown" at 0\.00 opacity in the PDF/.test(p)), of('pdf-hidden').join('\n'));
  assert.ok(of('reduce-ignored').some((p) => p.startsWith('motion-reduced:') && /still moves/.test(p)), of('reduce-ignored').join('\n'));
  assert.ok(!of('good').length);
});
