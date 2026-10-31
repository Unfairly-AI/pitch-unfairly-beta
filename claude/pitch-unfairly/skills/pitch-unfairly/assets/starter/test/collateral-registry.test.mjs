import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PX_IN, printFormats, resolveFormat, selectPrint } from '../bin/collateral/registry.mjs';

const formats = printFormats();

test('every print, merch and digital format traces to a source and states its size', () => {
  assert.ok(formats.length >= 60);
  assert.equal(new Set(formats.map((f) => f.id)).size, formats.length, 'format ids are unique across spec files');
  for (const f of formats) {
    assert.ok(['print', 'merch', 'digital'].includes(f.platform), `${f.id} platform ${f.platform}`);
    if (f.platform === 'digital') assert.ok(f.canvas?.w > 0 && f.canvas?.h > 0, `${f.id} has no pixel size`);
    else assert.ok(f.trim?.w > 0 && f.trim?.h > 0, `${f.id} has no trim`);
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

test('ACCEPTANCE: a city file adds its placements: every San Francisco format resolves, screens at their pixels', () => {
  const sf = formats.filter((f) => f.market === 'San Francisco');
  assert.ok(sf.length >= 40, `${sf.length} San Francisco formats`);
  for (const s of sf) {
    const f = resolveFormat(s.id);
    assert.ok(f, s.id);
    assert.ok(s.family && s.owner, `${s.id} names its family and media owner`);
    if (s.platform === 'digital') {
      assert.equal(f.kind, 'screen');
      assert.deepEqual(f.layout, { w: s.canvas.w, h: s.canvas.h });
    } else assert.equal(f.kind, 'print');
  }
  // Outfront's 14 x 48 bulletin: 48 ft viewable plus 8 in bleed, safety 23.25 x 6.25 in at 1/2 in = 1 ft.
  const b = resolveFormat('print.ooh.sf.bulletin_outfront');
  assert.deepEqual(b.trim, { w: 576, h: 168 });
  assert.equal(b.bleed, 8);
  assert.equal(b.safe.l, 9);
  assert.deepEqual(b.spec.mechanical, { scale: 1 / 24, label: '1/2 in = 1 ft' });
});

test('a mechanical stays under PDF\'s 200 in page limit', () => {
  for (const s of formats.filter((x) => x.trim)) {
    const f = resolveFormat(s.id);
    const k = s.mechanical?.scale ?? 1;
    assert.ok((f.trim.w + 2 * f.bleed) * k <= 200 && (f.trim.h + 2 * f.bleed) * k <= 200, `${s.id} prints ${(f.trim.w + 2 * f.bleed) * k} in wide: give it a mechanical scale`);
  }
});
