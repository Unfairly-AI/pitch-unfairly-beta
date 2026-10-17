import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fillTokens } from '../bin/site/fill.mjs';
import { checkSite } from '../bin/site/check.mjs';
import { buildSite } from '../bin/site-build.mjs';
import { loadSite } from '../bin/site-check.mjs';

// A fictional bakery quoting a catering plan: hand-written sections over a model.
const SITE = {
  title: 'Catering for Example Co',
  description: 'A catering plan for Example Co.',
  model: {
    inputs: { people: 40, per_head: 12, days: 5 },
    formulas: { weekly: 'people * per_head * days', yearly: 'weekly * 48' },
    formats: { weekly: 'money', yearly: 'money', per_head: 'money' },
  },
  facts: { client: { name: 'Example Co' } },
};
const SECTION = `<section id="price" data-section="price">
  <h2>Lunch for {{facts.client.name}} is {{weekly}} a week.</h2>
  <p>That's {{per_head}} a head, or {{= yearly / 12 | money}} a month.</p>
  <input type="number" data-input="people" value="40" aria-label="People">
</section>`;

test('fills model values live, facts as text, and one-off formulas', () => {
  const { html, missing } = fillTokens(SECTION, SITE);
  assert.deepEqual(missing, []);
  assert.match(html, /Lunch for Example Co is <span data-v="weekly">\$2,400<\/span> a week\./);
  assert.match(html, /<span data-v="per_head">\$12<\/span>/);
  assert.match(html, /<span data-expr="yearly \/ 12" data-format="money">\$9,600<\/span>/);
});

test('tokens inside a tag fill as plain text', () => {
  const { html } = fillTokens('<img alt="{{facts.client.name}} pays {{weekly}}" src="a.png">', SITE);
  assert.equal(html, '<img alt="Example Co pays $2,400" src="a.png">');
});

test('reports tokens that resolve to nothing', () => {
  const { missing } = fillTokens('<p>{{nope}} {{facts.client.size}} {{= nope * 2}}</p>', SITE);
  assert.equal(missing.length, 3);
});

test('a clean hand-written section passes the check', () => {
  const { errors } = checkSite({ site: SITE, sections: [{ name: '01-price.html', html: SECTION }] });
  assert.deepEqual(errors, []);
});

test('figures typed into the page are refused, so a copied site stays right', () => {
  const html = SECTION.replace('{{weekly}}', '$2,400').replace('a head', 'a head (save 15%)');
  const { errors } = checkSite({ site: SITE, sections: [{ name: '01-price.html', html }] });
  assert.ok(errors.some((e) => e.includes('"$2,400" is typed in')));
  assert.ok(errors.some((e) => e.includes('"15%" is typed in')));
});

test('a fact typed in is refused (a copy would keep the old name); $0 is a term, not a figure', () => {
  const html = SECTION.replace('{{facts.client.name}}', 'Example Co').replace('a head', 'a head, $0 delivery');
  const { errors } = checkSite({ site: SITE, sections: [{ name: '01-price.html', html }] });
  assert.deepEqual(errors, ['sections/01-price.html: "Example Co" is typed in. Use {{facts.client.name}}.']);
  const alt = checkSite({ site: SITE, sections: [{ name: '01-price.html', html: SECTION.replace('</h2>', '</h2><img src="assets/l.svg" alt="Example Co">') }] });
  assert.ok(alt.errors.some((e) => e.includes('"Example Co" is typed in')));
});

test('a fact hiding in a link or a download name is caught too; a bare year is not policed', () => {
  const site = { ...SITE, facts: { ...SITE.facts, year: '2027' } };
  const html = SECTION.replace('</h2>', '</h2><a href="mailto:a@b.co?subject=Lunch%20for%20Example%20Co">Ask</a><p>Opening through 2027.</p>');
  const { errors } = checkSite({ site, sections: [{ name: '01-price.html', html }] });
  assert.deepEqual(errors, ['sections/01-price.html: "Example Co" is typed in. Use {{facts.client.name}}.']);
});

test('each section must report itself, and pages carry no scripts or em dashes', () => {
  const html = '<section id="a"><p>One — two</p><script>x()</script><img src="assets/x.png"></section>';
  const { errors } = checkSite({ site: SITE, sections: [{ name: '01-a.html', html }], exists: () => false });
  assert.ok(errors.some((e) => e.includes('data-section')));
  assert.ok(errors.some((e) => e.includes('em dash')));
  assert.ok(errors.some((e) => e.includes('<script>')));
  assert.ok(errors.some((e) => e.includes('no alt')));
  assert.ok(errors.some((e) => e.includes("assets/x.png doesn't exist")));
});

test('ACCEPTANCE: site copy is held to the deck rules, read with its tokens filled', () => {
  const html = `<section data-section="a">
  <span class="eyebrow">Overview</span>
  <h2>Our catering platform: lunch for {{facts.client.name}} that unlocks a seamless week of eating together at the office, five days a week</h2>
  <p>20 minutes · video · with the chef</p>
  <p><strong>Delivery:</strong> every weekday by noon.</p>
  <p>It's not just lunch, but a reason to stop.</p>
  <blockquote>“Best lunch we’ve had — truly.”</blockquote>
</section>`;
  const { errors, warnings } = checkSite({ site: SITE, sections: [{ name: '01-a.html', html }] });
  assert.ok(errors.some((e) => /middle dots \("20 minutes · video · with the chef"\)/.test(e)), errors.join('\n'));
  assert.ok(errors.some((e) => e.includes('bold label and a colon ("Delivery:")')));
  assert.ok(!errors.some((e) => e.includes('em dash')), 'a blockquote is someone else’s words');
  assert.ok(warnings.some((w) => w.includes('"unlocks"') && w.includes('Example Co')), 'read with the fact filled in');
  assert.ok(warnings.some((w) => w.includes('"not X but Y"')));
  assert.ok(warnings.some((w) => /headline runs 1\d\d characters/.test(w)));
  assert.ok(warnings.some((w) => w.includes('"Title: subtitle"')));
  assert.ok(warnings.some((w) => w.includes('the label "Overview"')));
  // A spaced en dash used as one is an em dash; a numeric range is not.
  const ranges = checkSite({ site: SITE, sections: [{ name: '01-a.html', html: '<section data-section="a"><p>Open 9–5, Monday to Friday.</p><p>Lunch – then a nap.</p></section>' }] });
  assert.equal(ranges.errors.filter((e) => e.includes('em dash')).length, 1);
  assert.match(ranges.errors.find((e) => e.includes('em dash')), /then a nap/);
});

test('a site pinned before sites@1.2 gets the new copy rules as warnings, as its pin promises', () => {
  const html = '<section data-section="a"><p>20 minutes · video</p><p>One — two</p></section>';
  const { errors, warnings } = checkSite({ site: { ...SITE, engine: 'sites@1.1' }, sections: [{ name: '01-a.html', html }] });
  assert.ok(!errors.some((e) => e.includes('middle dots')));
  assert.ok(warnings.some((w) => w.includes('middle dots')));
  assert.equal(errors.filter((e) => e.includes('em dash')).length, 1, 'the em dash already blocked in 1.1');
  assert.ok(!warnings.some((w) => w.includes('em dash')));
});

test('the engine pin: same major and at least the pinned minor builds; anything else is refused', async () => {
  const { engineProblem } = await import('../bin/site/version.mjs');
  assert.equal(engineProblem('sites@1.1', '1.1.0'), null);
  assert.equal(engineProblem('sites@1.0', '1.3.0'), null);
  assert.match(engineProblem('sites@1.4', '1.1.0'), /needs sites engine 1.4/);
  assert.match(engineProblem('sites@2.0', '1.1.0'), /built for sites engine 2.x/);
  assert.match(engineProblem('latest', '1.1.0'), /should look like/);
  const { errors } = checkSite({ site: { ...SITE, engine: 'sites@9.0' }, sections: [{ name: '01-price.html', html: SECTION }] });
  assert.ok(errors.some((e) => e.includes('engine')));
});

test('parts: a section can include a reusable part, filled like the section', async () => {
  const { includeParts } = await import('../bin/site/fill.mjs');
  const parts = { 'parts/price': '<p>{{weekly}} a week</p>{{> parts/note}}', 'parts/note': '<small>for {{facts.client.name}}</small>' };
  const missing = [];
  const html = includeParts('<section data-section="a">{{> parts/price}}{{> parts/gone}}</section>', (n) => parts[n] ?? null, missing);
  assert.equal(html, '<section data-section="a"><p>{{weekly}} a week</p><small>for {{facts.client.name}}</small></section>');
  assert.deepEqual(missing, ['{{> parts/gone}} (no site/parts/gone.html)']);
  assert.match(fillTokens(html, SITE).html, /\$2,400.*Example Co/);
});

test('a sample site has to say so on the page', () => {
  const { errors } = checkSite({ site: { ...SITE, sample: true }, sections: [{ name: '01-price.html', html: SECTION }] });
  assert.ok(errors.some((e) => e.includes('sample')));
});

async function project() {
  const root = await mkdtemp(join(tmpdir(), 'site-'));
  await mkdir(join(root, 'site/sections'), { recursive: true });
  await mkdir(join(root, 'site/assets'), { recursive: true });
  await mkdir(join(root, 'brand'), { recursive: true });
  await writeFile(join(root, 'site/site.json'), JSON.stringify(SITE));
  await writeFile(join(root, 'site/sections/01-price.html'), SECTION);
  await writeFile(join(root, 'site/styles.css'), 'h2 { color: var(--accent); }');
  await writeFile(join(root, 'site/assets/dot.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  await writeFile(
    join(root, 'brand/brand.json'),
    JSON.stringify({
      schema: 'brand-kit@1',
      identity: { name: 'Example Bakery' },
      palette: { paper: '#ffffff', ink: '#222222', accent: '#aa3300' },
      typography: { display: { family: 'Georgia', source: 'system', fallback: 'serif' }, body: { family: 'Arial', source: 'system' } },
    }),
  );
  return root;
}

test('builds a self-contained page: brand tokens, the site styles, the model, and the script', async () => {
  const root = await project();
  const r = await buildSite({ root });
  assert.deepEqual(r.missing, []);
  const html = await readFile(join(root, 'dist-site/index.html'), 'utf8');
  assert.match(html, /--accent: #aa3300/);
  assert.match(html, /h2 \{ color: var\(--accent\); \}/);
  assert.match(html, /<main id="top">[\s\S]*data-section="price"/);
  assert.match(html, /"per_head":12/);
  assert.ok(!/https?:\/\/(?!www\.w3\.org)/.test(html), 'no third-party requests');
  for (const f of ['js/app.js', 'js/model.mjs', 'assets/dot.svg', 'brand/brand.json']) assert.ok(existsSync(join(root, 'dist-site', f)), f);
});

test('a copied site with new inputs recomputes every figure', async () => {
  const root = await project();
  const copy = await mkdtemp(join(tmpdir(), 'site-copy-'));
  await cp(join(root, 'site'), join(copy, 'site'), { recursive: true });
  await cp(join(root, 'brand'), join(copy, 'brand'), { recursive: true });
  const site = JSON.parse(await readFile(join(copy, 'site/site.json'), 'utf8'));
  site.model.inputs.people = 100;
  site.facts.client.name = 'Other Co';
  await writeFile(join(copy, 'site/site.json'), JSON.stringify(site));
  assert.deepEqual(checkSite(await loadSite(copy)).errors, []);
  await buildSite({ root: copy });
  const html = await readFile(join(copy, 'dist-site/index.html'), 'utf8');
  assert.match(html, /Lunch for Other Co is <span data-v="weekly">\$6,000<\/span>/);
});

test('a site builds from fonts saved in vendor/ when nothing is installed', async () => {
  const { fontDir } = await import('../bin/site-build.mjs');
  const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const root = mkdtempSync(join(tmpdir(), 'vendor-'));
  assert.equal(fontDir(root, '@fontsource-variable/newsreader'), null);
  mkdirSync(join(root, 'vendor/fonts/@fontsource-variable/newsreader'), { recursive: true });
  writeFileSync(join(root, 'vendor/fonts/@fontsource-variable/newsreader/index.css'), '');
  assert.equal(fontDir(root, '@fontsource-variable/newsreader'), join(root, 'vendor/fonts/@fontsource-variable/newsreader'));
});

test('a typed number equal to a model value is called out', async () => {
  const { checkSite } = await import('../bin/site/check.mjs');
  const site = { title: 't', description: 'd', engine: 'sites@1.1', model: { inputs: { enrolled: 133, eligible: 192 }, formulas: { waived: 'eligible - enrolled' } }, facts: {} };
  const { warnings } = checkSite({ site, sections: [{ name: 'a.html', html: '<section id="a" data-section="a"><p>92 of 133 enrolled, and 59 waived, since 2026. {{enrolled}}</p></section>' }] });
  assert.ok(warnings.some((w) => /"133" is the model's enrolled/.test(w)), warnings.join('\n'));
  assert.ok(warnings.some((w) => /"59" is the model's waived/.test(w)));
  assert.ok(!warnings.some((w) => /"92"|"2026"/.test(w)));
});

test('a month on its own as a fact is ordinary text, not a typed fact', async () => {
  const { checkSite } = await import('../bin/site/check.mjs');
  const site = { title: 't', description: 'd', engine: 'sites@1.1', model: {}, facts: { months: { live: 'January' }, broker: 'Meltzer Group' } };
  const { errors } = checkSite({ site, sections: [{ name: 'a.html', html: '<section id="a" data-section="a"><p>Our rooms open in January. Meltzer Group knows.</p></section>' }] });
  assert.ok(!errors.some((e) => /"January"/.test(e)), errors.join('\n'));
  assert.ok(errors.some((e) => /"Meltzer Group" is typed in/.test(e)));
});

// ── Simple copy (voice.md): long lines and a crowded hero are warnings with clear messages ──
const MODEL_SITE = { ...SITE, model: { ...SITE.model, inputs: { ...SITE.model.inputs, fee: 900, saved: 4000 }, formats: { ...SITE.model.formats, fee: 'money', saved: 'money' } } };
const CALM_HERO = `<section id="hero" data-section="hero">
  <p class="for">Prepared for {{facts.client.name}}</p>
  <h1>Lunch, handled. <span class="hl">Every weekday.</span></h1>
  <p class="lede">A catering plan for {{facts.client.name}}'s {{people}} people, from {{per_head}} a head.</p>
  <a class="tb-btn tb-btn-primary" href="#next">Book a tasting</a> <a class="tb-link" href="#price">See the numbers</a>
</section>
<section class="tb-glance-band"><p>Year one: {{yearly}}, {{weekly}} a week, {{fee}} to start, {{saved}} saved.</p></section>`;
const CROWDED_HERO = `<section id="hero" data-section="hero">
  <h1>Lunch for {{facts.client.name}} every weekday, delivered hot, without the volatility of ordering in.</h1>
  <p class="lede">For the {{people}} people at {{facts.client.name}}, here is a plan that feeds everyone well. It costs {{weekly}} a week and {{yearly}} a year.</p>
  <p>What we're asking you to decide: start on Monday at {{per_head}} a head.</p>
  <a class="pill pill-solid" href="#a">Say yes</a> <a class="pill" href="#b">See the price</a> <a class="pill pill-ghost" href="deck.pdf">Save as PDF</a>
</section>`;
const heroWarnings = (html) => checkSite({ site: MODEL_SITE, sections: [{ name: '01-hero.html', html }, { name: '02-price.html', html: SECTION }] }).warnings.filter((w) => w.startsWith('sections/01-hero'));

test('ACCEPTANCE: a crowded hero is called out: its headline, lede, buttons and figures', () => {
  const w = heroWarnings(CROWDED_HERO);
  assert.ok(w.some((x) => /the headline has 14 words/.test(x)), w.join('\n'));
  assert.ok(w.some((x) => /the hero lede is 2 sentences/.test(x)));
  assert.ok(w.some((x) => /the hero has 3 buttons\. Keep one primary action/.test(x)));
  assert.ok(w.some((x) => /the hero shows 4 figures\. Keep it to 2 or fewer and put the numbers that matter in a glance band/.test(x)));
});

test('a calm hero passes, and the glance band beside it can hold the numbers', () => {
  assert.deepEqual(heroWarnings(CALM_HERO), []);
});

test('long headlines, ledes, paragraphs and sentences are warnings, not errors', () => {
  const long = (n, w = 'word') => Array.from({ length: n }, () => w).join(' ');
  const html = `<section id="a" data-section="a"><h2>${long(20)}.</h2><p class="lede">${long(40)}.</p><p>${long(70)}.</p><p>${long(34)}. Short one.</p><details><p>${long(120)}.</p></details><blockquote><p>${long(90)}.</p></blockquote></section>`;
  const { errors, warnings } = checkSite({ site: SITE, sections: [{ name: '01-price.html', html: SECTION }, { name: '02-a.html', html }] });
  assert.deepEqual(errors, []);
  const mine = warnings.filter((w) => w.startsWith('sections/02-a'));
  assert.ok(mine.some((w) => /the headline has 20 words.*Cut it to 18/.test(w)));
  assert.ok(mine.some((w) => /the lede has 40 words.*under 35/.test(w)));
  assert.ok(mine.some((w) => /a paragraph has 70 words.*under 60/.test(w)));
  assert.ok(mine.some((w) => /a sentence has 34 words.*one idea per sentence/.test(w)));
  assert.ok(mine.some((w) => /a quote is typed into the page/.test(w)), 'a quote belongs in the facts');
  assert.equal(mine.filter((w) => !/quote is typed/.test(w)).length, 4, 'the detail in a toggle and a quote are not held to the limits');
});

test('choices and presets: the page script scopes presets to their calculator and ships data-choice', async () => {
  const app = await readFile(new URL('../bin/site/app.js', import.meta.url), 'utf8');
  assert.match(app, /closest\('\[data-calc\]'\)/);
  assert.match(app, /\[data-choice\]/);
  const audit = await readFile(new URL('../bin/site-audit.mjs', import.meta.url), 'utf8');
  assert.match(audit, /\[data-choice\] button/, 'the audit works every choice button');
});

test('words marked data-copy-ok (a verbatim quote with its own dash) are not held to the copy rules', () => {
  const html = `<section id="a" data-section="a"><p>As one customer put it, <span data-copy-ok>“it was easy – just a new card”</span>.</p></section>`;
  const { errors } = checkSite({ site: SITE, sections: [{ name: '01-price.html', html: SECTION }, { name: '02-a.html', html }] });
  assert.deepEqual(errors, []);
  const bad = checkSite({ site: SITE, sections: [{ name: '01-price.html', html: SECTION }, { name: '02-a.html', html: html.replace(' data-copy-ok', '') }] });
  assert.ok(bad.errors.some((e) => e.includes('em dash')));
});

test('ACCEPTANCE: charts and big figures without motion are called out; a bad step date is refused', () => {
  const html = `<section id="m" data-section="m"><div data-scale><i data-bar="weekly"></i><i class="wipe" data-bar="yearly"></i></div>
    <p class="tb-answer-n">{{weekly}}</p><p class="tb-stat-n" data-count>{{yearly}}</p><p class="tb-g-n">{{facts.client.name}}</p><p class="tb-vs-n">$0</p>
    <ol data-dates><li data-date="2026-11-20"></li><li data-date="Dec 1"></li></ol></section>`;
  const { errors, warnings } = checkSite({ site: SITE, sections: [{ name: '01-price.html', html: SECTION }, { name: '02-m.html', html }] });
  const mine = warnings.filter((w) => w.startsWith('sections/02-m'));
  assert.ok(mine.some((w) => /chart bar \(weekly\) has no entrance/.test(w)));
  assert.ok(!mine.some((w) => /\(yearly\)/.test(w)), 'a bar with wipe is fine');
  assert.ok(mine.some((w) => /the figure "\$2,400" doesn't count up/.test(w)));
  assert.equal(mine.filter((w) => /count up/.test(w)).length, 1, 'counted figures and words are left alone');
  assert.ok(errors.some((e) => /data-date="Dec 1"/.test(e)));
});

test('the page script tweens SVG columns by style and places the dated path', async () => {
  const app = await readFile(new URL('../bin/site/app.js', import.meta.url), 'utf8');
  assert.match(app, /b\.style\.height = /);
  assert.match(app, /\[data-dates\]/);
  assert.match(app, /pathProgress/);
  assert.match(app, /dataset\.scaleTo/, 'a chart can scale against a model value, so it grows as a whole');
});

test('ACCEPTANCE: calls to action report deck:cta to the frame (the decks contract), and bad ids are refused', async () => {
  const app = await readFile(new URL('../bin/site/app.js', import.meta.url), 'utf8');
  const block = app.slice(app.indexOf('// Calls to action'), app.indexOf('const jump'));
  assert.match(block, /if \(window\.parent !== window\)/, 'only when framed');
  assert.match(block, /e\.target\.closest\?\.\('\[data-cta\]'\)/);
  assert.match(block, /\/\^\[A-Za-z0-9_-\]\{1,40\}\$\//, 'the contract\'s id rule');
  assert.match(block, /postMessage\(\{ type: 'deck:cta', id: el\.dataset\.cta \}, '\*'\)/);
  assert.match(block, /\}, true\);/, 'a capturing listener, so it posts before the link opens');
  const html = `<section id="c" data-section="c"><a data-cta="accept" href="mailto:a@b.example">Yes</a><a data-cta="book a call" href="#x">Book</a></section>`;
  const { errors, warnings } = checkSite({ site: SITE, sections: [{ name: '01-price.html', html: SECTION }, { name: '02-c.html', html }] });
  assert.ok(errors.some((e) => /data-cta="book a call" isn't a valid id/.test(e)));
  assert.ok(warnings.some((w) => /"accept" leaves the page in the same tab/.test(w)));
});
