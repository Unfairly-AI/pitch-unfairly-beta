import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PX_IN, printFormats, resolveFormat, selectPrint } from '../bin/collateral/registry.mjs';

const formats = printFormats();

test('every print and merch format traces to a source and states its size', () => {
  assert.ok(formats.length >= 20);
  for (const f of formats) {
    assert.ok(['print', 'merch'].includes(f.platform), `${f.id} platform ${f.platform}`);
    assert.ok(f.trim?.w > 0 && f.trim?.h > 0, `${f.id} has no trim`);
    assert.ok(f.sources?.length && f.sources.every((s) => /^https?:\/\//.test(s.url)), `${f.id} sources`);
    assert.ok(['official', 'secondary', 'unverified'].includes(f.confidence), `${f.id} confidence`);
  }
});

test('the print canvas is (trim + 2 × bleed) × the recommended resolution', () => {
  for (const s of formats.filter((x) => x.canvas?.w && x.dpi?.recommended)) {
    const f = resolveFormat(s.id);
    assert.ok(Math.abs(f.out.w - s.canvas.w) <= 2 && Math.abs(f.out.h - s.canvas.h) <= 2, `${s.id}: ${f.out.w}×${f.out.h} vs ${s.canvas.w}×${s.canvas.h}`);
    assert.equal(f.layout.w, Math.round((s.trim.w + 2 * (s.bleed_in ?? 0)) * PX_IN));
  }
});

test('ACCEPTANCE: a framed display keeps copy inside what the frame shows', () => {
  // OAAA bus shelter: 47.5 × 68.5 in, 46 × 67 in visible, 1.75 in safety. The visible margin (0.75 in) plus half an inch is under the safety, so safety wins.
  const shelter = resolveFormat('print.ooh.bus_shelter.47x68');
  assert.equal(shelter.kind, 'print');
  assert.deepEqual(shelter.safe, { l: 1.75, r: 1.75, t: 1.75, b: 1.75 });
  // Airport diorama: no stated safety, 1 in hidden each side, so copy stays 1.5 in in.
  const dio = resolveFormat('print.ooh.airport.diorama.standard');
  assert.equal(dio.safe.l, 1.5);
  // Pole banners keep copy clear of the pockets: 4 in top and bottom.
  const pole = resolveFormat('print.ooh.pole_banner.30x60');
  assert.equal(pole.safe.t, 4);
  assert.equal(pole.safe.l, 1.25);
});

test('merch resolves as merch, social ids resolve through the social registry, unknown ids do not', () => {
  assert.equal(resolveFormat('merch.tshirt.back').kind, 'merch');
  const ig = resolveFormat('instagram.feed.portrait');
  assert.equal(ig.kind, 'screen');
  assert.deepEqual(ig.layout, { w: 1080, h: 1350 });
  assert.equal(resolveFormat('print.nope'), null);
  assert.ok(selectPrint(formats, ['merch']).every((f) => f.platform === 'merch'));
  assert.ok(selectPrint(formats, ['print.poster.*']).length >= 3);
});
