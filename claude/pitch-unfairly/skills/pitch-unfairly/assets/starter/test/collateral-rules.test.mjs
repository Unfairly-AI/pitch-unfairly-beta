import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { accentProblems, allowedColors, clip, effectiveDpi, hexOf, outside, paletteProblems } from '../bin/collateral/rules.mjs';
import { setProblems } from '../bin/collateral/set.mjs';
import { collateralEngineProblem } from '../bin/collateral/version.mjs';

const kit = JSON.parse(readFileSync(new URL('../brand/brand.json', import.meta.url), 'utf8'));

test('colors: only the brand palette passes', () => {
  assert.equal(hexOf('rgb(207, 184, 124)'), '#cfb87c');
  assert.equal(hexOf('rgba(0, 0, 0, 0)'), null);
  const allowed = allowedColors(kit, ['#f6f1e8']);
  assert.ok(allowed.has(kit.palette.accent.toLowerCase()) && allowed.has('#f6f1e8'));
  assert.deepEqual(paletteProblems([kit.palette.ink.toLowerCase()], allowed), []);
  assert.match(paletteProblems(['#123456'], allowed)[0], /#123456/);
});

test('ACCEPTANCE: a variant capped at one accent fails with two', () => {
  const rule = { colors: ['#40ADF7', '#C2D961'], max: 2, max_by_variant: { education: 1 } };
  assert.deepEqual(accentProblems(['#40adf7', '#c2d961'], rule, 'clinical'), []);
  assert.match(accentProblems(['#40adf7', '#c2d961'], rule, 'education')[0], /education pieces use at most 1 accent color; found #40adf7 \+ #c2d961/);
  assert.deepEqual(accentProblems(['#40adf7'], rule, 'education'), []);
});

test('safe area: clipped type is checked only where it shows', () => {
  const box = { left: 10, top: 10, right: 100, bottom: 100 };
  assert.ok(outside({ left: 5, top: 20, right: 50, bottom: 40 }, box));
  const sliced = clip({ left: 20, top: 0, right: 90, bottom: 40 }, [{ left: 0, top: 15, right: 200, bottom: 30 }]);
  assert.equal(outside(sliced, box), false);
});

test('photo resolution at finished size', () => {
  // 1600 px across a 24 in poster (24 × 48 CSS px) prints at about 67 ppi.
  assert.equal(effectiveDpi({ naturalW: 1600, naturalH: 1067, boxW: 24 * 48, boxH: 16 * 48, pxIn: 48 }), 67);
});

test('the example set is clean and names real formats', () => {
  const set = JSON.parse(readFileSync(new URL('../collateral-kit/collateral.json', import.meta.url), 'utf8'));
  assert.deepEqual(setProblems(set, { dir: new URL('../collateral-kit/', import.meta.url).pathname }), []);
  assert.deepEqual(setProblems({ ...set, pieces: [{ id: 'x', file: 'a.html', format: 'print.nope' }] }).filter((p) => !/doesn't exist/.test(p)), ['piece x: unknown format "print.nope"']);
  assert.match(collateralEngineProblem('collateral@2.0'), /2\.x/);
});
