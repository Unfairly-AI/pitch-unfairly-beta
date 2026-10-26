import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cropMargins, loadRegistry, rawFormats, safeRect, selectFormats, textLimits } from '../bin/social/registry.mjs';

const { formats, skipped } = loadRegistry();
const byId = (id) => formats.find((f) => f.id === id);

test('every researched format traces to a source with a checked date', () => {
  const raw = rawFormats();
  assert.ok(raw.length >= 190, `only ${raw.length} researched formats`);
  for (const f of raw) {
    assert.ok(f.sources?.length, `${f.id} has no source`);
    assert.ok(f.sources.every((s) => /^https?:\/\//.test(s.url)), `${f.id} has a source without a URL`);
    assert.ok(['official', 'secondary', 'unverified'].includes(f.confidence), `${f.id} confidence "${f.confidence}"`);
  }
});

test('every renderable format has a canvas, a kind and media we can make', () => {
  assert.ok(formats.length >= 180);
  for (const f of formats) {
    assert.ok(f.canvas.w > 0 && f.canvas.h > 0, f.id);
    assert.ok(['ad', 'post', 'cover', 'thumb', 'avatar', 'logo', 'banner'].includes(f.kind), `${f.id} kind ${f.kind}`);
  }
  assert.ok(skipped.some(([id]) => id === 'google.search.rsa'), 'text-only formats are skipped, not rendered');
});

test('overrides apply with their reason', () => {
  assert.equal(byId('instagram.reels.cover').kind, 'thumb');
  assert.match(byId('instagram.reels.cover').overridden, /thumbnail/);
  assert.equal(byId('google.display.responsive.logo_wide').kind, 'logo');
  assert.ok(skipped.some(([id]) => id === 'instagram.profile.grid_preview'));
});

test('house safe zones fill in only where the platform publishes none, and say so', () => {
  const t = byId('tiktok.feed.video');
  assert.equal(t.safe_zone_source, 'house');
  assert.ok(t.safe_zone.bottom > 0 && t.safe_zone.right > 0);
  assert.equal(byId('snapchat.ads.single').safe_zone_source, 'platform');
});

test('the Instagram grid crop becomes safe-zone margins', () => {
  assert.deepEqual(cropMargins(1080, 1080, [3, 4]), [0, 135]);
  assert.deepEqual(cropMargins(1080, 1350, [3, 4]), [0, 34]);
  assert.deepEqual(cropMargins(1080, 1920, [3, 4]), [240, 0]);
  const sq = byId('instagram.feed.square');
  assert.equal(sq.safe_zone.left, 135);
  assert.equal(sq.safe_zone_source, 'crop');
  const reels = byId('instagram.reels');
  assert.ok(reels.safe_zone.bottom >= 672, 'the larger of Meta zone and crop wins');
});

test('safeRect converts percent and pixel zones', () => {
  assert.deepEqual(safeRect({ canvas: { w: 1000, h: 2000 }, safe_zone: { top: 10, bottom: 20, left: 5, right: 5, units: '%' } }), { x: 50, y: 200, w: 900, h: 1400 });
  assert.deepEqual(safeRect({ canvas: { w: 2560, h: 1440 }, safe_zone: { top: 509, bottom: 509, left: 508, right: 508, units: 'px' } }), { x: 508, y: 509, w: 1544, h: 422 });
});

test('selectFormats matches platforms, prefixes and wildcards', () => {
  assert.ok(selectFormats(formats, ['tiktok']).every((f) => f.platform === 'tiktok'));
  assert.ok(selectFormats(formats, ['linkedin.ad']).every((f) => f.id.startsWith('linkedin.ad.')));
  assert.deepEqual(selectFormats(formats, ['instagram.feed.portrait']).map((f) => f.id), ['instagram.feed.portrait']);
  assert.ok(selectFormats(formats, ['facebook.ad.*']).length > 3);
});

test('copy limits come from the formats the copy runs in', () => {
  // A text ad's 25-character headline doesn't constrain image ads...
  assert.ok(textLimits(formats, 'linkedin', 'ad').headline.max > 25);
  // ...unless the pattern names it.
  assert.equal(textLimits(formats, 'linkedin.ad.text', 'ad').headline.max, 25);
  assert.equal(textLimits(formats, 'instagram', 'organic').hashtags.max, 5);
  assert.equal(textLimits(formats, 'facebook.ad.reels.*', 'ad').primary.max, 40);
});
