// The audit's machine-reading checks: one real-text headline, alt on images,
// no near-invisible text, DOM order as reading order, the PDF showing what the
// screen shows, and every story headline in order in index.txt and the PDF.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { READ_CONTRAST, dimmedByAnimation, headlineOrderProblem, keyframeBlocks, keyframeCollisions, listOrderProblem, missingInPdf, readability, storyHeadlines, visibleWords } from '../bin/deck-checks.mjs';

let browser = null;
let launchError = null;
before(async () => {
  try {
    const { default: puppeteer } = await import('puppeteer');
    browser = await puppeteer.launch({ headless: true });
  } catch (e) {
    launchError = e;
  }
});
after(async () => browser?.close());

/** The readability problems of slides laid out on a 1920x1080 stage. */
async function problems(slides) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setContent(`<!doctype html><html><head><style>
      body { margin: 0; background: #fff; color: #111; font: 36px/1.25 sans-serif }
      .slide { position: relative; width: 1920px; height: 1080px; padding: 100px; box-sizing: border-box; overflow: hidden; display: flex; flex-direction: column }
    </style></head><body>${slides}</body></html>`);
    await page.addScriptTag({ content: READ_CONTRAST });
    return await page.evaluate(readability);
  } finally {
    await page.close();
  }
}

function browserTest(name, fn) {
  test(name, async (t) => {
    if (!browser) return t.skip(`no browser: ${launchError?.message ?? 'unavailable'}`);
    await fn();
  });
}

const slide = (inner, id = 'one') => `<section class="slide" id="slide-${id}">${inner}</section>`;

browserTest('ACCEPTANCE: a clean slide passes every reading check', async () => {
  assert.deepEqual(await problems(slide('<h2>Bookings close 42% faster.</h2><p>Across example lanes.</p><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="" width="40" height="40"><h2 style="display:none">Phone-only headline</h2>')), []);
});

browserTest('exactly one real-text h1/h2 per slide', async () => {
  assert.match((await problems(slide('<p>No headline here.</p>')))[0], /no h1\/h2 headline/);
  assert.match((await problems(slide('<h2>One point.</h2><h2>A second point.</h2>')))[0], /2 h1\/h2 headlines/);
  assert.match((await problems(slide('<h2><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="Our headline" width="400" height="80"></h2>')))[0], /the headline has no text/);
});

browserTest('every image has alt (empty for decoration)', async () => {
  const out = await problems(slide('<h2>Point.</h2><img src="logo.png" width="40" height="40">'));
  assert.equal(out.length, 1);
  assert.match(out[0], /<img src="logo\.png"> has no alt/);
});

browserTest('ACCEPTANCE: near-invisible text is flagged: faded out, under 4px, background-colored, clipped away or off the slide', async () => {
  const cases = {
    'opacity 0.03': '<p style="opacity:0.03">keywords for robots</p>',
    'at 3px': '<p style="font-size:3px">keywords for robots</p>',
    'color of its background': '<p style="color:#fefefe">keywords for robots</p>',
    'visually hidden': '<p style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap">keywords for robots</p>',
    'sr-only with clip': '<span style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">keywords for robots</span>',
    'off the slide': '<p style="position:absolute;left:2400px;top:100px">keywords for robots</p>',
  };
  for (const [why, html] of Object.entries(cases)) {
    const out = await problems(slide(`<h2>Point.</h2>${html}`));
    assert.equal(out.length, 1, `${why}: ${out.join(' | ')}`);
    assert.match(out[0], /near-invisible text/, why);
  }
  // Muted but readable, text over a photo (its background can't be measured), and a phone-only copy that isn't rendered, pass.
  assert.deepEqual(await problems(slide('<h2>Point.</h2><ul style="display:none"><li>Phone-only list</li></ul><p style="color:#999">A muted caption.</p><div style="background:url(data:image/gif;base64,R0lGODlhAQABAAAAACw=);padding:20px"><p style="color:#fff">Over a photo</p></div>')), []);
});

browserTest('DOM order must match reading order: a later block above an earlier one is flagged, side-by-side columns are not', async () => {
  const flipped = await problems(slide('<div style="display:flex;flex-direction:column-reverse"><h2>The headline</h2><p>The eyebrow, shown above it</p></div>'));
  assert.equal(flipped.length, 1);
  assert.match(flipped[0], /"The eyebrow, shown above it" sits above <h2> "The headline"/);
  assert.deepEqual(await problems(slide('<h2>The headline</h2><div style="display:flex;gap:100px"><div><p>Left column, first</p><p>Left column, second</p></div><div><p>Right column, first</p></div></div>')), []);
});

browserTest('the words a slide shows are counted only when they are painted and visible', async () => {
  const page = await browser.newPage();
  try {
    await page.setContent(`<section class="slide" id="slide-a"><h2>Shown</h2><p style="opacity:0">faded</p><p hidden>gone</p><span aria-hidden="true">decor</span></section>`);
    assert.deepEqual(await page.evaluate(visibleWords), { 'slide-a': ['Shown'] });
  } finally {
    await page.close();
  }
});

test('ACCEPTANCE: words shown on screen but missing from the PDF are reported per slide', () => {
  const screen = { 'slide-a': ['Bookings', 'close', '42%', 'faster.'], 'slide-b': ['Ask'] };
  assert.deepEqual(missingInPdf(screen, { 'slide-a': ['Bookings', 'close', 'faster'], 'slide-b': ['ask'] }), [{ id: 'slide-a', words: ['42%'] }]);
  assert.deepEqual(missingInPdf(screen, { 'slide-a': ['bookings', 'close', '42%', 'faster'], 'slide-b': ['Ask', 'more'] }), []);
});

const story = `# Deck

Kernel: k

<!-- ## 00 example
- Headline: ignored in a comment -->

## 01 cover
- Headline: Northwind books your freight in minutes.

## 02 steps
- Job: x
- Headline: Every booking still takes *seven* manual steps.

## 03 number
- Headline: That's what a booking costs today. (Set under $40 at poster scale.)
`;

test('story.md headlines come out in order, with their slides', () => {
  assert.deepEqual(storyHeadlines(story), [
    { slide: '01 cover', headline: 'Northwind books your freight in minutes.' },
    { slide: '02 steps', headline: 'Every booking still takes *seven* manual steps.' },
    { slide: '03 number', headline: "That's what a booking costs today." },
  ]);
});

test('ACCEPTANCE: every story headline must appear, in order, in the text (index.txt or the PDF\'s)', () => {
  const heads = storyHeadlines(story).slice(0, 2);
  assert.equal(headlineOrderProblem(heads, '# Deck\n\n### Northwind books your\nfreight in minutes.\n\n#### Every booking still takes seven manual steps.'), null, 'line breaks, case and markup don\'t matter');
  assert.equal(headlineOrderProblem(heads, 'Northwind books your freight in minutes. Every booking still takes seven manual-steps'), null, 'nor punctuation');
  assert.deepEqual(headlineOrderProblem(heads, 'Every booking still takes seven manual steps. Northwind books your freight in minutes.'), { ...heads[1], why: 'out of order' });
  assert.deepEqual(headlineOrderProblem(heads, 'Northwind books your freight in minutes. Bookings take steps.'), { ...heads[1], why: 'missing' });
});

test('a list read out of order comes back in the order it was read; one read in order, or not found, is fine', () => {
  const items = ['Rate requests', 'Carrier calls', 'Spot quotes'];
  assert.equal(listOrderProblem(items, 'Rate requests\nCarrier calls Spot quotes'), null);
  assert.deepEqual(listOrderProblem(items, 'Rate requests\nSpot quotes\nCarrier calls'), ['rate requests', 'spot quotes', 'carrier calls']);
  assert.equal(listOrderProblem(items, 'Rate requests only'), null);
});

const astro = (css) => `---\nconst up = '@keyframes up { nope }';\n---\n<section class="slide"></section>\n<style>${css}</style>\n`;
const SCROLL = '@keyframes up { from { transform: translateY(0) } to { transform: translateY(-50%) } }';
const FADE = '@keyframes up { from { opacity: 0 } to { opacity: 1 } }';

test('ACCEPTANCE: two slides giving one keyframe name different bodies fail', () => {
  assert.deepEqual(keyframeCollisions([
    { path: 'src/slides/01-cover.astro', text: astro(SCROLL) },
    { path: 'src/slides/04-proof.astro', text: astro(FADE) },
  ]), [{ name: 'up', paths: ['src/slides/01-cover.astro', 'src/slides/04-proof.astro'] }]);
});

test('ACCEPTANCE: a clean deck passes', () => {
  assert.deepEqual(keyframeCollisions([
    { path: 'src/slides/01-cover.astro', text: astro(SCROLL.replace('up', 'columns')) },
    { path: 'src/slides/04-proof.astro', text: astro(FADE.replace('up', 'fade')) },
    { path: 'src/styles/deck.css', text: '@keyframes rise { to { opacity: 1 } }' },
  ]), []);
});

test('collisions cross components and stylesheets', () => {
  assert.deepEqual(keyframeCollisions([
    { path: 'src/components/motion/Ticker.astro', text: astro(SCROLL) },
    { path: 'src/styles/deck.css', text: FADE },
  ]).map((c) => c.paths), [['src/components/motion/Ticker.astro', 'src/styles/deck.css']]);
});

test('a file may override its own keyframes under @media', () => {
  const css = `@keyframes deal { to { transform: translateX(10px) } }
    @media (max-width: 700px) { @keyframes deal { to { transform: translateY(10px) } } }`;
  assert.deepEqual(keyframeCollisions([{ path: 'src/slides/05-deal.astro', text: astro(css) }]), []);
});

test('files agreeing on a name are one motion, whatever the spacing', () => {
  assert.deepEqual(keyframeCollisions([
    { path: 'a.astro', text: astro('@keyframes up { from { opacity: 0; } to { opacity: 1; } }') },
    { path: 'b.astro', text: astro('@keyframes up{0%{opacity:0}\n100%{opacity:1}}') },
  ]), []);
});

test('a phone override in one file still differs from a file without it', () => {
  const base = '@keyframes up { to { opacity: 1 } }';
  assert.equal(keyframeCollisions([
    { path: 'a.astro', text: astro(`${base} @media (max-width: 700px) { @keyframes up { to { opacity: .5 } } }`) },
    { path: 'b.astro', text: astro(base) },
  ]).length, 1);
});

test('one file defining a name twice outside @media fails', () => {
  assert.deepEqual(keyframeCollisions([{ path: 'a.astro', text: astro(`${SCROLL} ${FADE}`) }]), [{ name: 'up', paths: ['a.astro'] }]);
});

test('keyframes are read from styles, not comments or frontmatter', () => {
  assert.deepEqual(keyframeCollisions([
    { path: 'a.astro', text: astro(FADE) },
    { path: 'b.astro', text: `---\nconst css = \`${SCROLL}\`;\n---\n<style>/* ${SCROLL} */</style>` },
  ]), []);
  assert.deepEqual(keyframeBlocks('@media print { a { color: red } } @-webkit-keyframes "x" { to { top: 0 } } b { content: "}" } @keyframes y { to { top: 1px } }').map((b) => b.name), ['x', 'y']);
});

/** What dimmedByAnimation reports for slides with these styles. */
async function dimmed(css, html) {
  const page = await browser.newPage();
  try {
    await page.setContent(`<!doctype html><style>${css}</style><section class="slide" id="slide-one">${html}</section>`);
    return await page.evaluate(dimmedByAnimation);
  } finally {
    await page.close();
  }
}

const FADE_IN = '@keyframes up { from { opacity: 0 } to { opacity: 1 } }';

browserTest('ACCEPTANCE: a slow loop that picked up a fade-in shows as dim on the live page', async () => {
  const found = await dimmed(`${FADE_IN} .col { animation: up 60s linear infinite }`, '<div class="col">Acme</div>');
  assert.equal(found.length, 1);
  assert.match(found[0], /slide-one: <div> "Acme" stays under 0.25 opacity for 15s of each 60s loop \(@keyframes up\)/);
});

browserTest('ACCEPTANCE: a reveal that plays once and fades out passes', async () => {
  assert.deepEqual(await dimmed('@keyframes out { to { opacity: 0 } } p { animation: out .35s ease-in 2.3s forwards }', '<p>Logo reveal</p>'), []);
});

browserTest('entrances, quick pulses and marked fades pass', async () => {
  assert.deepEqual(await dimmed(`${FADE_IN}
    @keyframes pulse { 50% { opacity: 0 } }
    .in { animation: up 1s both } .pulse { animation: pulse 2s infinite } .slow { animation: up 60s infinite }
    .quiet { opacity: .1; animation: up 60s infinite }`,
  '<p class="in">In</p><p class="pulse">Pulse</p><p class="slow" data-fade-ok>Slow</p><p class="quiet">Rests dim</p><div class="slow"></div>'), []);
});
