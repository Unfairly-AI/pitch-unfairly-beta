import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildSite } from '../bin/site-build.mjs';
import { serveDir } from '../bin/serve.mjs';
import { EXTRA_WIDTHS, layoutProblems, visualSlop, motionProblems, previewProblems, brandDiff, qualifierProblems } from '../bin/site/page-lint.mjs';

const STARTER = resolve(import.meta.dirname, '..');

// A kit in the starter's installed fonts (Sora, DM Sans), so the restrained page loads its brand.
const KIT = {
  schema: 'brand-kit@1',
  identity: { name: 'Fieldwork' },
  palette: { paper: '#ffffff', surface: '#f1ede4', ink: '#1d1b16', accent: '#0f6b4f', night: '#14231d', on_night: '#f4f1ea' },
  typography: {
    display: { family: 'Sora', source: 'fontsource', package: '@fontsource-variable/sora', license: 'open' },
    body: { family: 'DM Sans', source: 'fontsource', package: '@fontsource-variable/dm-sans', license: 'open' },
  },
  style: { shadow: 'none', radius: 6 },
};

/** Build a site from sections and styles into a temp project, and serve it. */
async function makeSite(name, { sections, styles = '', kit = KIT, site = {}, files = {} }) {
  const root = await mkdtemp(join(tmpdir(), `page-lint-${name}-`));
  await mkdir(join(root, 'site/sections'), { recursive: true });
  await mkdir(join(root, 'brand'), { recursive: true });
  await symlink(join(STARTER, 'node_modules'), join(root, 'node_modules'));
  await writeFile(join(root, 'site/site.json'), JSON.stringify({ title: `${name} for Example Co`, description: `A plan for Example Co (${name}).`, model: { inputs: { seats: 40 }, formulas: { total: 'seats * 12' }, formats: { total: 'money' } }, facts: {}, ...site }));
  await writeFile(join(root, 'brand/brand.json'), JSON.stringify(kit));
  await writeFile(join(root, 'site/styles.css'), styles);
  for (const [i, html] of sections.entries()) await writeFile(join(root, `site/sections/${String(i + 1).padStart(2, '0')}.html`), html);
  for (const [path, body] of Object.entries(files)) {
    await mkdir(join(root, path, '..'), { recursive: true });
    await writeFile(join(root, path), body);
  }
  await buildSite({ root, out: 'dist-site' }); // out is relative to root
  const out = join(root, 'dist-site');
  const server = await serveDir(out);
  servers.push(server);
  roots.push(root);
  return { root, out, url: server.url, kit };
}

const servers = [];
const roots = [];
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
after(async () => {
  await browser?.close();
  for (const s of servers) await s.close();
  for (const r of roots) await rm(r, { recursive: true, force: true });
});

/** A browser test: skipped cleanly when Chrome can't start here. */
function browserTest(name, fn) {
  test(name, async (t) => {
    if (!browser) return t.skip(`no browser: ${launchError?.message ?? 'unavailable'}`);
    const page = await browser.newPage();
    try {
      await fn(page);
    } finally {
      await page.close();
    }
  });
}
async function open(page, site, { width = 1280, height = 800, reduce = true } = {}) {
  await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: width < 600, hasTouch: width < 600 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: reduce ? 'reduce' : 'no-preference' }]);
  await page.goto(`${site.url}/`, { waitUntil: 'networkidle0' });
}

// ---------- Fixtures ----------

const ICON = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12l5 5L20 7"/></svg>';
const SLOP = {
  sections: [
    `<section data-section="hero" class="hero">
      <span class="badge">New: routing that plans itself</span>
      <h1>Supercharge your <span class="grad">field team</span></h1>
      <p class="lede">The all-in-one platform that transforms how modern teams work.</p>
      <div class="actions"><a class="btn primary" href="#features" data-cta="start">Get started</a><a class="btn ghost" href="#stats">Learn more</a></div>
    </section>`,
    `<section data-section="features" class="band">
      <p class="eyebrow">Features</p>
      <h2>Everything you need</h2>
      <div class="cards">
        ${['Fast', 'Secure', 'Simple'].map((t) => `<div class="card"><div class="icon">${ICON}</div><h3>${t}</h3><p>Built for teams that move quickly and want more.</p></div>`).join('')}
      </div>
    </section>`,
    `<section data-section="stats" class="band">
      <p class="eyebrow">By the numbers</p>
      <h2>Trusted by teams everywhere</h2>
      <div class="stats">
        <div class="stat"><p class="n">98%</p><p class="l">uptime</p></div>
        <div class="stat"><p class="n">3x</p><p class="l">faster</p></div>
        <div class="stat"><p class="n">10,000+</p><p class="l">teams</p></div>
      </div>
    </section>`,
  ],
  styles: `
    body, h1, h2, h3 { font-family: Inter, system-ui, sans-serif; }
    .hero { text-align: center; padding: 96px 24px; background: radial-gradient(circle at 50% 0%, rgba(99, 102, 241, .55), transparent 60%), #0b0b1a; color: #fff; }
    .badge { display: inline-block; padding: 6px 14px; border-radius: 999px; background: #eef2ff; color: #4f46e5; font-size: 14px; animation: pulse 2s ease-in-out infinite; }
    @keyframes pulse { 50% { opacity: .6; } }
    .grad { background: linear-gradient(90deg, #6366f1, #3b82f6); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .actions { display: flex; gap: 12px; justify-content: center; margin-top: 32px; }
    .btn { display: inline-block; padding: 12px 22px; border-radius: 10px; text-decoration: none; }
    .btn.primary { background: linear-gradient(90deg, #6366f1, #8b5cf6); color: #fff; box-shadow: 0 0 40px rgba(99, 102, 241, .6); }
    .btn.ghost { border: 1px solid #6366f1; color: #c7d2fe; }
    .band { padding: 80px 24px; text-align: center; }
    .eyebrow { font-size: 12px; text-transform: uppercase; letter-spacing: .14em; color: #6366f1; }
    .cards, .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; max-width: 960px; margin: 40px auto 0; }
    .card { padding: 28px; border-radius: 16px; background: linear-gradient(180deg, #ffffff, #eef2ff); box-shadow: 0 1px 2px rgba(0,0,0,.06); text-align: left; }
    .icon { width: 48px; height: 48px; border-radius: 12px; background: #eef2ff; color: #4f46e5; display: grid; place-items: center; }
    .n { font-size: 56px; font-weight: 800; }
    .l { color: #6b7280; }
  `,
};

const RESTRAINED = {
  sections: [
    `<section data-section="hero" class="hero">
      <div class="wrap">
        <h1>Forty crews, one route plan by Monday.</h1>
        <p class="lede">Fieldwork plans each van's day overnight, so dispatch starts with a schedule instead of a whiteboard.</p>
        <a class="cta" href="#price" data-cta="book_meeting">Book the walkthrough</a>
      </div>
    </section>`,
    `<section data-section="problem" class="night">
      <div class="wrap two">
        <h2>Your vans drive 31 minutes between jobs.</h2>
        <figure><img src="assets/route.svg" alt="A route map with long gaps between stops" width="600" height="360"></figure>
      </div>
    </section>`,
    `<section data-section="price" class="surface">
      <div class="wrap">
        <h2>The plan costs {{total}} a month at your size.</h2>
        <label class="field">Crews <input type="number" data-input="seats" value="40" aria-label="Crews"></label>
        <p class="answer">Monthly: {{total}}</p>
        <p class="term" data-conditional="start">Start date proposed for March 3, if the pilot is approved.</p>
      </div>
    </section>`,
    `<section data-section="quote" class="quote">
      <blockquote><p>We stopped re-routing by phone in the first week.</p><footer>Operations lead, a regional HVAC firm</footer></blockquote>
    </section>`,
    `<section data-section="next" class="next">
      <div class="wrap"><h2>Pick a pilot week.</h2><p>Two crews for a week, then you decide.</p></div>
    </section>`,
  ],
  styles: `
    .wrap { max-width: 1040px; margin: 0 auto; padding: 0 24px; }
    section { padding: 88px 0; }
    .hero h1 { font-size: clamp(40px, 6vw, 76px); max-width: 14ch; }
    .lede { margin-top: 20px; font-size: 20px; max-width: 34em; }
    .cta { display: inline-flex; align-items: center; min-height: 48px; margin-top: 28px; padding: 0 22px; background: var(--accent); color: var(--paper); text-decoration: none; border-radius: 6px; }
    .night { background: var(--night); color: var(--on-night); }
    .night h2 { color: var(--on-night); }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; align-items: center; }
    .surface { background: var(--surface); }
    .field { display: flex; gap: 12px; align-items: center; margin-top: 24px; font-size: 16px; }
    .field input { min-height: 44px; width: 120px; font-size: 16px; }
    .answer { margin-top: 16px; font-size: 22px; }
    .term { margin-top: 12px; font-size: 15px; }
    .quote blockquote { margin: 0 auto; max-width: 760px; padding: 0 24px; font-size: 28px; }
    .quote footer { margin-top: 16px; font-size: 15px; }
    @media (max-width: 700px) { .two { grid-template-columns: 1fr; } }
  `,
  files: { 'site/assets/route.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 360"><path d="M20 300 C200 40 400 340 580 60" fill="none" stroke="#0f6b4f" stroke-width="4"/></svg>' },
};

let slop, restrained;
async function slopSite() { return (slop ??= await makeSite('slop', SLOP)); }
async function restrainedSite() { return (restrained ??= await makeSite('restrained', RESTRAINED)); }

// ---------- Visual slop ----------

browserTest('the classic slop page (centered pill hero, Inter, indigo gradients, icon cards, stat tiles) scores 4+ and errors', async (page) => {
  const site = await slopSite();
  await open(page, site);
  const r = await visualSlop(page, site.kit);
  const tells = r.hits.map((h) => h.tell);
  for (const t of ['default-sans', 'ai-purple', 'gradient-text', 'gradients', 'glow', 'hero-badge', 'icon-cards', 'stat-tiles']) assert.ok(tells.includes(t), `expected ${t} in ${tells.join(', ')}`);
  assert.ok(r.score >= 4, `score ${r.score}`);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /visual slop: \d+ tells/);
});

browserTest('a restrained page in its brand scores 0 or 1', async (page) => {
  const site = await restrainedSite();
  await open(page, site);
  const r = await visualSlop(page, site.kit);
  assert.ok(r.score <= 1, `score ${r.score}: ${JSON.stringify(r.hits)}`);
  assert.deepEqual(r.errors, []);
});

browserTest("a purple the brand chose doesn't count, and neither does the brand's own default-looking font", async (page) => {
  const site = await slopSite();
  await open(page, site);
  const kit = {
    ...KIT,
    palette: { ...KIT.palette, accent: '#6366f1', extras: [{ name: 'violet', hex: '#8b5cf6' }, { name: 'blue', hex: '#3b82f6' }, { name: 'indigo-dark', hex: '#4f46e5' }] },
    typography: { display: { family: 'Inter', source: 'system', license: 'open' }, body: { family: 'Inter', source: 'system', license: 'open' } },
  };
  const r = await visualSlop(page, kit);
  const tells = r.hits.map((h) => h.tell);
  assert.ok(!tells.includes('ai-purple'), tells.join(', '));
  assert.ok(!tells.includes('default-sans'), tells.join(', '));
  assert.ok(tells.includes('hero-badge'));
});

// ---------- Layout ----------

browserTest('extra widths are 320, 430, 768 and 2560, and the restrained page is clean at each', async (page) => {
  assert.deepEqual(EXTRA_WIDTHS, [320, 430, 768, 2560]);
  const site = await restrainedSite();
  await open(page, site);
  for (const width of EXTRA_WIDTHS) {
    const r = await layoutProblems(page, { width });
    assert.deepEqual(r.errors, [], `${width}: ${r.errors.join('; ')}`);
  }
});

browserTest('sideways scroll at 320 and a 10px label are errors', async (page) => {
  const site = await makeSite('wide', {
    sections: ['<section data-section="a"><h1>Plan</h1><div class="row">A row wider than a small phone.</div><p>Terms <span class="tiny">Billed yearly</span></p></section>'],
    styles: '.row { width: 380px; background: #eee; } .tiny { font-size: 10px; }',
  });
  await open(page, site, { width: 390, height: 844 });
  const r = await layoutProblems(page, { width: 320 });
  assert.ok(r.errors.some((e) => /^320px: the page scrolls sideways|runs off the screen/.test(e)), r.errors.join('; '));
  assert.ok(r.errors.some((e) => /text under 12px: <span\.tiny> in "a" "Billed yearly" is 10px/.test(e)), r.errors.join('; '));
});

browserTest('a phone that hides a [data-conditional] term errors; the laptop showing it is fine', async (page) => {
  const site = await makeSite('phone', {
    sections: [`<section data-section="offer"><h2>Start with two crews.</h2>
      <a class="cta" href="#x" data-cta="accept">Accept the pilot</a>
      <p class="term" data-conditional="start">Proposed start March 3, if approved by February 1.</p>
      <p class="later" data-excludes="travel" hidden>Excludes travel.</p>
      <label>Crews <input type="number" data-input="seats" value="40"></label>
      <div class="spacer"></div><p>Total {{total}}</p></section>`],
    styles: '.cta { display: inline-block; min-height: 44px; padding: 12px; } .spacer { height: 3000px; } @media (max-width: 600px) { .term { display: none; } }',
  });
  await open(page, site, { width: 1280 });
  const laptop = await layoutProblems(page, { width: 1280 });
  assert.ok(!laptop.errors.some((e) => /buying term/.test(e)), laptop.errors.join('; '));
  const phone = await layoutProblems(page, { width: 390 });
  assert.equal(phone.errors.filter((e) => /the phone hides a buying term/.test(e)).length, 1, phone.errors.join('; '));
  assert.match(phone.errors.find((e) => /buying term/.test(e)), /\[data-conditional="start"\]/);
  // The answer is 3000px below its control: more than 1.5 screens.
  assert.ok(phone.warnings.some((w) => /input\[data-input="seats"\].*more than 1\.5 screens/.test(w)), phone.warnings.join('; '));
});

// ---------- Motion ----------

browserTest('a long page moves on scroll; a still one warns (errors when strict); a loop under reduced motion errors', async (page) => {
  const moving = await restrainedSite();
  await open(page, moving);
  const ok = await motionProblems(page);
  assert.equal(ok.hasMotion, true, JSON.stringify(ok.motion));
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.warnings, []);
  // Restored: reduced motion again, as the test opened it.
  assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);

  const still = await makeSite('still', { sections: ['<section data-section="a"><h1>One screen.</h1><p>Nothing moves here.</p></section>'] });
  await open(page, still);
  const lax = await motionProblems(page);
  assert.equal(lax.hasMotion, false);
  assert.ok(lax.warnings.some((w) => /no motion/.test(w)));
  const strict = await motionProblems(page, { strict: true });
  assert.ok(strict.errors.some((e) => /no motion/.test(e)));

  const loud = await slopSite();
  await open(page, loud);
  const r = await motionProblems(page);
  assert.ok(r.errors.some((e) => /reduced motion, pulse on <span class="badge"> still loops forever/.test(e)), r.errors.join('; '));
});

// ---------- Brand ----------

browserTest('the brand fonts load and match on the restrained page; mixed backgrounds pass', async (page) => {
  const site = await restrainedSite();
  await open(page, site);
  const r = await brandDiff(page, site.kit);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.fonts.h1.family, 'Sora Variable');
  assert.ok(r.backgrounds.brand >= 2, JSON.stringify(r.backgrounds));
});

browserTest("a brand font that failed to load errors, and one background everywhere warns", async (page) => {
  const kit = {
    ...KIT,
    typography: {
      display: { family: 'Brandface', source: 'files', license: 'open', files: [{ path: 'fonts/brandface.woff2', weight: 700 }] },
      body: KIT.typography.body,
    },
  };
  const site = await makeSite('badfont', {
    kit,
    sections: ['a', 'b', 'c'].map((s) => `<section data-section="${s}"><h2>Section ${s} makes its point.</h2><p>Its proof sits here.</p></section>`),
    files: { 'brand/fonts/brandface.woff2': 'not a font' },
  });
  await open(page, site);
  const r = await brandDiff(page, kit);
  assert.ok(r.errors.some((e) => /"Brandface"/.test(e) && /(didn't load|failed to load)/.test(e)), r.errors.join('; '));
  assert.ok(r.warnings.some((w) => /every section has the same background/.test(w)), r.warnings.join('; '));
});

browserTest('a page that overrides the brand font errors, and measured references are compared', async (page) => {
  const site = await slopSite();
  await open(page, site);
  const r = await brandDiff(page, site.kit, [{ file: 'page1-screen1.jpg', fonts: { display: 'Sora', body: 'DM Sans' }, colors: ['#0f6b4f', '#e8553a'] }]);
  assert.ok(r.errors.some((e) => /h1 .* is set in "Inter", but the kit's display face is "Sora"/.test(e)), r.errors.join('; '));
  assert.ok(r.warnings.some((w) => /brand's site sets display text in "Sora"/.test(w)));
  assert.ok(r.warnings.some((w) => /colors measured on the brand's site don't appear/.test(w)), r.warnings.join('; '));
});

// ---------- Qualifiers ----------

const QUALIFIED = (extraCss = '') => ({
  site: { model: { inputs: { seats: 40 }, formulas: { total: 'seats * 12' }, formats: { total: 'money' }, excludes: { total: 'travel and hardware' } } },
  sections: [
    `<section data-section="start"><h2>Start with two crews.</h2>
      <p>First routed day: <span data-commitment data-basis="proposed">March 3</span>.</p>
      <p class="cond" data-conditional>Proposed, if the pilot is approved by February 1.</p></section>`,
    `<section data-section="price"><h2>The plan is {{total}} a month.</h2>
      <p class="ex" data-excludes="total">Excludes travel and hardware.</p></section>`,
  ],
  styles: extraCss,
});

browserTest('a proposed date with its conditional note and a partial total with its excludes line, both visible, pass', async (page) => {
  const site = await makeSite('qualified', QUALIFIED());
  await open(page, site, { width: 1280 });
  assert.deepEqual(await qualifierProblems(page), { errors: [], warnings: [] });
});

browserTest('a conditional note hidden by a CSS class at 1280 fails, and so does a partial total with no visible excludes line', async (page) => {
  const site = await makeSite('unqualified', QUALIFIED('.cond { display: none; } .ex { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }'));
  await open(page, site, { width: 1280 });
  const r = await qualifierProblems(page);
  assert.ok(r.errors.some((e) => /^1280px: the proposed <span> in "start" "March 3" has no visible \[data-conditional\]/.test(e)), r.errors.join('; '));
  assert.ok(r.errors.some((e) => /<span> in "price" "\$480" is a partial total \(it leaves out travel and hardware\), and no visible \[data-excludes="total"\]/.test(e)), r.errors.join('; '));
  assert.equal(r.errors.length, 2, r.errors.join('; '));
});

browserTest('a qualifier in another section, or faded to opacity 0, does not count', async (page) => {
  const site = await makeSite('elsewhere', {
    ...QUALIFIED('.ex { opacity: 0; }'),
    sections: [
      '<section data-section="start"><h2>Start.</h2><p>Day one: <span data-basis="proposed">March 3</span>.</p></section>',
      '<section data-section="notes"><p data-conditional>Proposed, if approved.</p></section>',
      '<section data-section="price"><h2>{{total}} a month.</h2><p class="ex" data-excludes="total">Excludes travel.</p></section>',
    ],
  });
  await open(page, site, { width: 1280 });
  const r = await qualifierProblems(page);
  assert.equal(r.errors.length, 2, r.errors.join('; '));
});

// ---------- Preview and weight (no browser) ----------

test("the page shell's title and description pass; missing Open Graph tags warn; weight limits apply", async () => {
  const root = await mkdtemp(join(tmpdir(), 'page-lint-preview-'));
  roots.push(root);
  const page = (head) => `<!doctype html><html><head>${head}</head><body></body></html>`;
  await writeFile(join(root, 'index.html'), page('<title>Sample: Catering for Example Co</title><meta name="description" content="A catering plan.">'));
  let r = await previewProblems(root);
  assert.deepEqual(r.errors, []);
  assert.equal(r.warnings.filter((w) => /og:(title|description|image)/.test(w)).length, 3);

  await writeFile(join(root, 'index.html'), page('<title>Plan</title><meta name="description" content="x"><meta property="og:title" content="Plan"><meta property="og:description" content="x"><meta property="og:image" content="https://example.com/p.png">'));
  await mkdir(join(root, 'assets'));
  await writeFile(join(root, 'assets/hero.jpg'), Buffer.alloc(2 * 1024 * 1024));
  await writeFile(join(root, 'assets/video.mp4'), Buffer.alloc(4 * 1024 * 1024));
  r = await previewProblems(root);
  assert.deepEqual(r.errors, []);
  assert.ok(r.warnings.some((w) => /image assets\/hero\.jpg is 2\.0 MB/.test(w)));
  assert.ok(r.warnings.some((w) => /built site is 6\.0 MB, over 5 MB/.test(w)));

  await writeFile(join(root, 'assets/video.mp4'), Buffer.alloc(14 * 1024 * 1024));
  await writeFile(join(root, 'index.html'), page('<title>Site</title>'));
  r = await previewProblems(root);
  assert.ok(r.errors.some((e) => /no real <title>/.test(e)));
  assert.ok(r.errors.some((e) => /no meta description/.test(e)));
  assert.ok(r.errors.some((e) => /over 15 MB/.test(e)));
});

test('a real build carries a title and description but no Open Graph tags (the shell emits none)', async () => {
  const site = await makeSite('shell', { sections: ['<section data-section="a"><h1>Plan</h1></section>'] });
  const r = await previewProblems(site.out);
  assert.deepEqual(r.errors, []);
  assert.ok(r.warnings.some((w) => /og:image/.test(w)));
});
