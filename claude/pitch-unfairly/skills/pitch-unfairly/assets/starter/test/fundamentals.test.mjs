// The design fundamentals as math: the same reference values unfairly-app's
// src/lib/brand/fundamentals pins, so the two repos can't drift.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeKit, apcaLc, apcaMinFontSize, buildTypeScale, contrastRatio, detectSpacingScale, fundamentalsCss, recommendedLeading, recommendedTracking, RAMP_STEPS, toOklch, tonalRamp } from '../bin/fundamentals.mjs';
import { apcaLc as pageApca, contrastRatio as pageRatio, parseColor } from '../bin/contrast.mjs';

const close = (a, b, d = 0.1) => assert.ok(Math.abs(a - b) <= d, `${a} is not within ${d} of ${b}`);

test('WCAG 2.2 and APCA 0.0.98G-4g match the reference values', () => {
  close(contrastRatio('#000000', '#FFFFFF'), 21, 1e-6);
  close(contrastRatio('#777777', '#FFFFFF'), 4.48, 0.01);
  close(apcaLc('#000000', '#FFFFFF'), 106.04);
  close(apcaLc('#FFFFFF', '#000000'), -107.88);
  close(apcaLc('#888888', '#FFFFFF'), 63.06);
  close(apcaLc('#777777', '#000000'), -30.6);
  close(apcaLc('#FFFFFF', '#e26a00'), -65.5);
  assert.equal(apcaMinFontSize(75, 400), 18);
});

test('the in-page helper agrees with the kit math', () => {
  const rgb = (h) => parseColor(`rgb(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)})`);
  for (const [t, g] of [['#000000', '#FFFFFF'], ['#777777', '#000000'], ['#FFFFFF', '#e26a00'], ['#5A534B', '#F4EFE7']]) {
    close(pageApca(rgb(t), rgb(g)), apcaLc(t, g), 1e-6);
    close(pageRatio(rgb(t), rgb(g)), contrastRatio(t, g), 1e-6);
  }
});

test('a ramp keeps the brand hex at its anchor and darkens monotonically', () => {
  const ramp = tonalRamp('accent', '#E4572E');
  assert.equal(ramp.steps[ramp.anchor], '#E4572E');
  const l = RAMP_STEPS.map((s) => toOklch(ramp.steps[s]).l);
  for (let i = 1; i < l.length; i++) assert.ok(l[i] < l[i - 1] - 0.02);
});

test('type tightens leading and tracking as size grows, and no step drops under 12px', () => {
  assert.equal(recommendedLeading(16), 1.5);
  close(recommendedTracking(64), -0.022, 0.001);
  for (const s of buildTypeScale(17, 1.25)) { assert.ok(s.desktop >= 12); assert.ok(s.phone >= 12); }
});

test('spacing: finds a base unit, and reports none for noise', () => {
  assert.equal(detectSpacingScale([8, 16, 24, 32, 48, 64, 96, 40, 80]).base, 8);
  assert.equal(detectSpacingScale([7, 11, 13, 19, 23, 29, 31, 37]).base, null);
});

test('a kit with a light accent gets a passing button fill that keeps its own label', () => {
  const kit = { palette: { paper: '#ffffff', ink: '#2b2e33', accent: '#e4572e', accent_dark: '#c2441f', on_accent: '#ffffff' }, typography: { display: { family: 'A' }, body: { family: 'B' } } };
  const { system, findings } = analyzeKit(kit);
  assert.equal(system.color.accent_fill, '#C2441F');
  assert.equal(system.color.on_accent, '#FFFFFF');
  assert.ok(findings.some((f) => f.where === 'palette.on_accent on palette.accent'));
  assert.match(fundamentalsCss(system), /--accent-fill: #C2441F;/);
});
