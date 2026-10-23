import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CANDIDATE_FONTS, categoryOf, fitCorrection, fontsourcePackageFor, googleFontsUrl, matchConfidence,
  rankCandidates, shapeDistance, specimenTexts, standInEntry, strokeRatio, inkCoverage, weightForStroke,
} from '../bin/font-match.mjs';

// A stand-in "glyph run": vertical strokes of a given width, 48px tall.
const strokes = (xs, stroke, w = 120, h = 48) => {
  const data = new Array(w * h).fill(0);
  for (const x0 of xs) for (let y = 4; y < h - 4; y++) for (let x = x0; x < Math.min(w, x0 + stroke); x++) data[y * w + x] = 255;
  return { w, h, data };
};
const metrics = (over = {}) => ({ inkWidth: 1000, xHeight: 50, capHeight: 70, chars: 21, size: 96, ...over });
const specimen = (bitmap, m = {}) => ({ text: 'x', bitmap, metrics: metrics(m) });
const XS = [4, 20, 38, 52, 70, 88, 104];
const reference = [specimen(strokes(XS, 6)), specimen(strokes([6, 30, 60, 90], 8))];

// Grayscale letters for stroke tests: stems, optionally with crossbars as wide as the letter.
const letters = (stem, { letterWidth = 40, bars = false, invert = false } = {}) => {
  const w = 10 + 4 * (letterWidth + 12), h = 120, data = new Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const lx = (x - 10) % (letterWidth + 12), inLetter = x >= 10 && y >= 20 && y < 100 && lx < letterWidth;
    const ink = inLetter && (lx < stem || (bars && (y < 20 + stem || (y >= 58 && y < 58 + stem) || y >= 100 - stem)));
    const v = ink ? 20 : 235;
    data[y * w + x] = invert ? 255 - v : v;
  }
  return { w, h, data };
};

test('the brand font rendered as a candidate ranks first with no correction', () => {
  const ranked = rankCandidates(reference, [
    { family: 'Bolder', weight: 700, specimens: [specimen(strokes(XS, 12)), specimen(strokes([6, 30, 60, 90], 14))] },
    { family: 'Same', weight: 400, specimens: reference },
    { family: 'Broken', weight: 400, specimens: [null, null] },
  ]);
  assert.equal(ranked[0].family, 'Same');
  assert.ok(ranked[0].score < 1e-9);
  assert.ok(Math.abs(ranked[0].scale - 1) < 1e-9 && Math.abs(ranked[0].tracking) < 1e-9);
  assert.deepEqual(ranked.map((m) => m.family), ['Same', 'Bolder']);
});

test('a bolder weight does not win just because thick strokes overlap more', () => {
  const shifted = strokes(XS.map((x) => x + 2), 6), shiftedBold = strokes(XS.map((x) => x + 2), 12);
  assert.ok(shapeDistance(reference[0].bitmap, shifted) < shapeDistance(reference[0].bitmap, shiftedBold));
});

test('size comes from x-height (cap height for all caps) and the rest of the width goes into tracking', () => {
  const wider = fitCorrection(metrics(), metrics({ inkWidth: 1100 }));
  assert.equal(wider.scale, 1);
  assert.ok(Math.abs(wider.tracking - -100 / 20 / 96) < 1e-9);
  assert.ok(Math.abs(fitCorrection(metrics(), metrics({ xHeight: 40, inkWidth: 800 })).scale - 1.25) < 1e-9);
  assert.ok(Math.abs(fitCorrection(metrics(), metrics({ capHeight: 35 }), true).scale - 2) < 1e-9);
});

test('confidence is low when a stand-in only fits with heavy correction', () => {
  assert.equal(matchConfidence({ score: 0.25, fit: 0.07 }), 'high');
  assert.equal(matchConfidence({ score: 0.33, fit: 0.12 }), 'medium');
  assert.equal(matchConfidence({ score: 0.25, fit: 0.18 }), 'low');
});

test('stroke weight: heavier reads heavier, light-on-dark reads the same, crossbars on wide letters do not count', () => {
  const r = (g) => strokeRatio(inkCoverage(g));
  assert.ok(r(letters(6)) < r(letters(9)) && r(letters(9)) < r(letters(13)));
  assert.ok(Math.abs(r(letters(9, { invert: true })) - r(letters(9))) < 1e-9);
  // Same stems, much wider letters with crossbars: a wide design must not read as a heavy one.
  const narrow = r(letters(9, { letterWidth: 30, bars: true })), wide = r(letters(9, { letterWidth: 70, bars: true }));
  assert.ok(Math.abs(Math.log(wide / narrow)) < 0.05, `narrow ${narrow} vs wide ${wide}`);
});

test('weight for a stroke: interpolated on variable families, nearest on static ones', () => {
  const s = [{ weight: 400, ratio: 0.1171 }, { weight: 500, ratio: 0.1445 }, { weight: 600, ratio: 0.1701 }];
  assert.equal(weightForStroke(0.1374, s, true), 470);
  assert.equal(weightForStroke(0.1374, s, false), 500);
  assert.equal(weightForStroke(0.05, s, true), 400);
  assert.equal(weightForStroke(0.3, s, true), 600);
  assert.equal(weightForStroke(0.1, [], true), null);
});

test('Google Fonts gets a weight range for variable families, so in-between weights render exactly', () => {
  const inter = CANDIDATE_FONTS.find((c) => c.family === 'Inter Tight');
  const dmMono = CANDIDATE_FONTS.find((c) => c.family === 'DM Mono');
  assert.equal(googleFontsUrl(inter, [600, 300, 400]), 'https://fonts.googleapis.com/css2?family=Inter+Tight:wght@300..600&display=block');
  assert.equal(googleFontsUrl(inter, [400]), 'https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400&display=block');
  assert.equal(googleFontsUrl(dmMono, [300, 500]), 'https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;500&display=block');
  assert.match(googleFontsUrl(inter, [300, 500], true), /ital,wght@1,300\.\.500/);
  assert.equal(fontsourcePackageFor(inter), '@fontsource-variable/inter-tight');
  assert.equal(fontsourcePackageFor(dmMono), '@fontsource/dm-mono');
});

test('the kit entry is a labeled stand-in with the site tracking plus the correction, and scale only on display', () => {
  const match = { family: 'Albert Sans', package: '@fontsource-variable/albert-sans', weight: 470, scale: 1.04, tracking: 0.014 };
  const base = { weight: 500, tracking: -0.06, line_height: 1.1, case: 'none' };
  assert.deepEqual(standInEntry('display', 'Euclid Circular A', base, match), {
    family: 'Albert Sans', source: 'fontsource', package: '@fontsource-variable/albert-sans', license: 'stand-in',
    stand_in_for: 'Euclid Circular A', weight: 470, tracking: -0.046, line_height: 1.1, case: 'none', scale: 1.04,
  });
  const body = standInEntry('body', 'Euclid Circular A', base, { ...match, scale: 3, tracking: 0.9 });
  assert.equal(body.scale, undefined);
  assert.equal(body.tracking, 0.5);
});

test('specimens use the headline words plus shape coverage, and the kind comes from the stack and name', () => {
  const t = specimenTexts('Get the right butts in seats.');
  assert.equal(t[0], 'Get the right butts in seats.');
  assert.ok(t.includes('seats') && t.includes('Hamburgefonstiv'));
  assert.ok(specimenTexts('Categories', true).every((x) => x === x.toUpperCase()));
  assert.equal(categoryOf('"Onsite Mono", monospace', 'Onsite Mono'), 'mono');
  assert.equal(categoryOf('EBGaramond, Georgia, serif', 'EBGaramond'), 'serif');
  assert.equal(categoryOf('aktiv-grotesk, ui-sans-serif, sans-serif', 'aktiv-grotesk'), 'sans');
});

// Through the real capture code, with a stand-in browser and matcher (offline).
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captureBrand } from '../bin/brand-capture.mjs';

const heading = { text: 'Get the right butts in seats.', fontFamily: '"Euclid Circular A", sans-serif', fontWeight: '500', fontStyle: 'normal', fontSize: '52px', letterSpacing: '-3.12px', lineHeight: '57.2px', textTransform: 'none' };
const body = { text: 'Hire faster.', fontFamily: 'Inter, sans-serif', fontWeight: '400', fontStyle: 'normal', fontSize: '16px', letterSpacing: '0px', lineHeight: '24px', textTransform: 'none' };
const pageData = () => ({
  title: 'Metaview', siteName: 'Metaview', description: '', themeColor: null,
  backgrounds: [['rgb(255, 255, 255)', 1]], texts: [['rgb(0, 8, 5)', 100]], buttons: [], cards: [], links: [],
  type: { heading, body, label: null }, logo: null, logoCandidates: [], images: [], cssVariables: {},
});
const fakeBrowser = () => {
  const page = {
    setViewport: async () => {}, goto: async () => {}, close: async () => {}, $$: async () => [],
    addStyleTag: async () => ({ evaluate: async () => {} }),
    screenshot: async ({ path }) => writeFile(path, 'shot'),
    evaluate: async (fn) => (fn.name === 'extract' ? pageData() : String(fn).includes('scrollHeight') ? 900 : String(fn).includes('performance') ? [] : undefined),
  };
  return { newPage: async () => page, close: async () => {} };
};
const fakeFonts = (calls) => ({
  reference: async (_page, ref) => { calls.push(`reference ${ref.family}`); return { ...ref, texts: [], specimens: [], stroke: 0.15 }; },
  match: async () => ({ family: 'Albert Sans', package: '@fontsource-variable/albert-sans', category: 'sans', weight: 470, scale: 1.04, tracking: 0.014, score: 0.229, fit: 0.04, confidence: 'high', alternatives: [{ family: 'Albert Sans', weight: 470, score: 0.229 }], proof: {} }),
  proof: async () => Buffer.from('png'),
});
const captureOptions = (out, calls, extra = {}) => ({
  out, launch: async () => fakeBrowser(), log: () => {}, pause: async () => {}, fetchImpl: async () => { throw new Error('offline'); },
  findFontPackage: (pkgs) => (pkgs.some((p) => p.endsWith('/inter')) ? '@fontsource-variable/inter' : null), fonts: fakeFonts(calls), ...extra,
});

test('ACCEPTANCE: a commercial heading font is captured as a labeled stand-in; an open body font stays itself', async () => {
  const root = await mkdtemp(join(tmpdir(), 'capture-fonts-'));
  const out = join(root, 'brand'), calls = [];
  try {
    const { kit } = await captureBrand(['https://www.metaview.ai/'], captureOptions(out, calls));
    assert.deepEqual(calls, ['reference Euclid Circular A'], 'only the font that is not open gets matched');
    assert.deepEqual(kit.typography.display, {
      family: 'Albert Sans', source: 'fontsource', package: '@fontsource-variable/albert-sans', license: 'stand-in', stand_in_for: 'Euclid Circular A',
      weight: 470, tracking: -0.046, line_height: 1.1, case: 'none', scale: 1.04,
    });
    assert.equal(kit.typography.body.license, 'open');
    assert.equal(kit.sources.typography.confidence, 'high');
    assert.equal(kit.sources.typography.stand_ins.display.matched, 'Albert Sans 470');
    assert.equal(String(await readFile(join(out, 'capture/font-display.png'))), 'png');
    const evidence = JSON.parse(await readFile(join(out, 'capture/capture.json'), 'utf8'));
    assert.equal(evidence.fontMatches.display.proof, 'capture/font-display.png');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('an evidence-only capture never runs the font matcher', async () => {
  const root = await mkdtemp(join(tmpdir(), 'capture-fonts-'));
  const out = join(root, 'brand'), calls = [];
  try {
    const { kit } = await captureBrand(['https://www.metaview.ai/'], captureOptions(out, calls, { evidenceOnly: true }));
    assert.equal(kit, null);
    assert.deepEqual(calls, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
