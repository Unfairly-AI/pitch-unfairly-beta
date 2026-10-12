import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blend, contrastFloor, contrastRatio, parseColor } from '../bin/contrast.mjs';

test('reads the color formats Chrome computes', () => {
  assert.deepEqual(parseColor('rgb(26, 22, 18)'), { r: 26, g: 22, b: 18, a: 1 });
  assert.deepEqual(parseColor('rgba(255, 255, 255, 0.5)'), { r: 255, g: 255, b: 255, a: 0.5 });
  assert.deepEqual(parseColor('rgb(10 20 30 / 40%)'), { r: 10, g: 20, b: 30, a: 0.4 });
  assert.deepEqual(parseColor('color(srgb 1 0 0)'), { r: 255, g: 0, b: 0, a: 1 });
  assert.equal(parseColor('oklch(0.7 0.1 30)'), null);
});

test('measures contrast as WCAG does', () => {
  const black = { r: 0, g: 0, b: 0, a: 1 };
  const white = { r: 255, g: 255, b: 255, a: 1 };
  assert.equal(contrastRatio(black, white).toFixed(1), '21.0');
  assert.equal(contrastRatio(white, white).toFixed(1), '1.0');
  // Pale lavender on purple, the kind of accent phrase the design review flagged.
  const purple = parseColor('rgb(94, 106, 210)');
  const lavender = parseColor('rgb(190, 196, 255)');
  assert.ok(contrastRatio(lavender, purple) < 3);
  // Half-white text on near-black still reads.
  const ink = parseColor('rgb(20, 20, 24)');
  assert.ok(contrastRatio(blend({ ...white, a: 0.6 }, ink), ink) > 4.5);
});

test('large text needs 3:1, everything else 4.5:1', () => {
  const stage = { px: 36, boldPx: 28 };
  assert.equal(contrastFloor(40, 400, stage), 3);
  assert.equal(contrastFloor(30, 700, stage), 3);
  assert.equal(contrastFloor(30, 400, stage), 4.5);
  assert.equal(contrastFloor(20, 700, stage), 4.5);
});
