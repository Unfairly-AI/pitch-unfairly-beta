// Beta pipeline fixes (Nov 23): bugs a beta user hit in hosted deck builds.
// 3. A kit without its @fontsource packages (Kosli's) failed brand:apply. It is repaired, never refused.
// 4. A toolbox layout's text-length check threw while the page rendered, and a throw renders the deck blank. The
//    slide now renders, and the broken limit is flagged on the slide for the audit.
// 5. The audit failed whenever a fix pass reworded a slide's headline and left story.md behind. story.md now follows
//    the slides.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { repairKitFonts, validateKit, fallbackFor } from '../bin/brand-lib.mjs';
import { headlineOrderProblem, storyHeadlines, syncStoryHeadlines } from '../bin/deck-checks.mjs';
import { deckHeadlines } from '../bin/site/text.mjs';
import { buildDeckGallery, TOOLBOX } from '../bin/deck-gallery.mjs';

const STARTER = fileURLToPath(new URL('..', import.meta.url));

// ── 3. Fonts ──

const kosli = () => ({
  schema: 'brand-kit@1',
  identity: { name: 'Kosli' },
  palette: { paper: '#ffffff', ink: '#0b1b2b', accent: '#1f6feb' },
  typography: { display: { family: 'Space Grotesk', source: 'fontsource' }, body: { family: 'IBM Plex Sans' }, faces: [{ role: 'eyebrow', family: 'JetBrains Mono', source: 'fontsource' }] },
});

test('ACCEPTANCE: a kit missing its @fontsource packages is repaired so it applies, never refused (Kosli)', () => {
  const kit = kosli();
  assert.ok(validateKit(kit).some((e) => /package must be an @fontsource package/.test(e)), 'as saved, the kit was refused');
  const repairs = repairKitFonts(kit);
  assert.deepEqual(validateKit(kit), []);
  assert.equal(kit.typography.display.package, '@fontsource/space-grotesk');
  assert.deepEqual([kit.typography.body.source, kit.typography.body.package], ['fontsource', '@fontsource/ibm-plex-sans']);
  assert.equal(kit.typography.faces[0].package, '@fontsource/jetbrains-mono');
  assert.equal(repairs.length, 4, repairs.join('; '));
});

test('repair keeps good packages, files and system faces, and picks an open stand-in by class', () => {
  const kit = { typography: { display: { family: 'Inter', source: 'fontsource', package: '@fontsource-variable/inter' }, body: { family: 'Helvetica Neue' }, mono: { family: 'Brand Mono', files: [{ path: 'fonts/m.woff2' }] } } };
  repairKitFonts(kit);
  assert.equal(kit.typography.display.package, '@fontsource-variable/inter');
  assert.equal(kit.typography.body.source, 'system');
  assert.equal(kit.typography.mono.source, 'files');
  assert.equal(fallbackFor({ family: 'Tiempos Headline', fallback: 'serif' }, 'display').package, '@fontsource/source-serif-4');
  assert.equal(fallbackFor({ family: 'Brand Mono' }, 'mono').package, '@fontsource/jetbrains-mono');
  assert.equal(fallbackFor({ family: 'Brand Grotesk' }, 'body').package, '@fontsource/inter');
});

test('brand:apply repairs before it validates and falls back to an open face instead of exiting', async () => {
  const src = await readFile(join(STARTER, 'bin/brand-apply.mjs'), 'utf8');
  assert.ok(src.indexOf('repairKitFonts(kit)') < src.indexOf('validateKit(kit)'), 'repair runs first');
  assert.doesNotMatch(src, /Set "package": .* and rerun/, 'the other Fontsource package is written into the kit, not left to the builder');
  assert.match(src, /fallbackFor\(font, role\)/);
});

// ── 4. Layout limits ──

test('ACCEPTANCE: no toolbox layout throws on a too-long or too-many fill; each flags it instead', async () => {
  const layouts = join(TOOLBOX, 'layouts');
  for (const f of (await readdir(layouts)).filter((x) => x.endsWith('.astro'))) {
    for (const line of (await readFile(join(layouts, f), 'utf8')).split('\n')) {
      const m = /if \((.*)\) throw new Error\(/.exec(line);
      if (!m) continue;
      const upperBoundOnly = /\.length\s*>\s*\d/.test(m[1]) && !/\|\||<|!(?!=)/.test(m[1]);
      assert.ok(!upperBoundOnly, `${f}: a length limit still throws: ${line.trim()}`);
    }
  }
});

test('layoutRule keeps each broken limit for its slide once, and splitHl degrades to no emphasis', async () => {
  const lib = await import('../slide-toolbox/lib.ts');
  lib.layoutRule('ask-line-button "close"', 'ask-line-button "close": the button label is 31 characters; a button is 24 or fewer.');
  assert.deepEqual(lib.splitHl('Start the pilot', 'three crews', 'ask-line-button "close"'), ['Start the pilot', '', '']);
  assert.equal(lib.takeLayoutRules('close').length, 2);
  assert.deepEqual(lib.takeLayoutRules('close'), []);
});

test('ACCEPTANCE: a fill over a layout limit renders its slide (not a blank page), flagged with the rule', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'toolbox-over-limit-'));
  try {
    const toolbox = join(tmp, 'slide-toolbox');
    await cp(TOOLBOX, toolbox, { recursive: true });
    const example = JSON.parse(await readFile(join(toolbox, 'example.json'), 'utf8'));
    example.slides['ask-line-button'][0].button.label = 'Book the kickoff call with Dana today';
    await writeFile(join(toolbox, 'example.json'), JSON.stringify(example, null, 2));
    const { entries } = await buildDeckGallery({ root: STARTER, out: join(tmp, 'out'), toolbox });
    const html = await readFile(join(tmp, 'out', 'index.html'), 'utf8');
    const id = entries.find((e) => e.id === 'ask-line-button-1')?.id;
    assert.ok(id, 'the ask slide is built');
    const section = new RegExp(`<section id="slide-${id}"[^>]*data-layout-rule="([^"]*)"`).exec(html);
    assert.ok(section, 'the slide carries the broken rule');
    assert.match(section[1], /the button label is 37 characters; a button is 24 or fewer/);
    assert.match(html, /Book the kickoff call with Dana today/, 'the slide renders its fill');
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('the audit reports a flagged layout rule as a problem to fix', async () => {
  const src = await readFile(join(STARTER, 'bin/audit.mjs'), 'utf8');
  assert.match(src, /\.slide\[data-layout-rule\]/);
  assert.match(src, /report\('layout'/);
});

// ── 5. Headline drift ──

const story = `# Ramp

Kernel: close faster
Audience: controllers

<!--
## 01 cover
- Headline: the point itself, stated as a sentence.
-->

## 01 cover
- Headline: Close the books in three days

## 02 problem
- Headline: Month-end eats a week of every quarter (Set big.)

## 03 ask
- Headline: Start a two-week pilot
`;
const deck = (heads) => `<main>${heads.map((h, i) => `<section class="slide" id="slide-s${i + 1}" aria-label="S${i + 1}"><p class="eyebrow">Ramp</p><h2>${h}</h2><p>Body copy</p></section>`).join('')}</main>`;

test('ACCEPTANCE: a fix pass that rewords a headline no longer fails the audit: story.md takes the slide\'s headline', () => {
  const html = deck(['Close the books in three days', 'Month-end close eats a week each quarter', 'Start a two-week pilot']);
  const slides = deckHeadlines(html);
  assert.equal(headlineOrderProblem(storyHeadlines(story), slides.map((s) => s.words).join('\n'))?.why, 'missing', 'drift as before');
  const synced = syncStoryHeadlines(story, slides);
  assert.deepEqual(synced.changed, [{ slide: '02 problem', from: 'Month-end eats a week of every quarter', to: 'Month-end close eats a week each quarter' }]);
  assert.equal(headlineOrderProblem(storyHeadlines(synced.story), slides.map((s) => s.words).join('\n')), null);
  assert.match(synced.story, /<!--\n## 01 cover\n- Headline: the point itself, stated as a sentence\.\n-->/, 'the instructions comment is untouched');
});

test('story.md is left alone when its blocks and the slides don\'t line up one to one', () => {
  const synced = syncStoryHeadlines(story, deckHeadlines(deck(['Close the books in three days', 'Something else'])));
  assert.deepEqual(synced.changed, []);
  assert.equal(synced.story, story);
});

test('the audit syncs story.md before it checks the headlines', async () => {
  const src = await readFile(join(STARTER, 'bin/audit.mjs'), 'utf8');
  assert.ok(src.indexOf('syncStoryHeadlines(story') < src.indexOf('headlineOrderProblem(headlines, text)'));
});
