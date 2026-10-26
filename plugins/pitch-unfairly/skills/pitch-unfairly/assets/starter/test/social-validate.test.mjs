import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkFile, imageSize } from '../bin/social/validate.mjs';

const png = (w, h) => { const b = Buffer.alloc(33); b.writeUInt32BE(0x89504e47, 0); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b; };
const jpeg = (w, h) => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

test('reads PNG and JPEG sizes from their headers', () => {
  assert.deepEqual(imageSize(png(1080, 1350)), { w: 1080, h: 1350 });
  assert.deepEqual(imageSize(jpeg(1440, 2560)), { w: 1440, h: 2560 });
  assert.equal(imageSize(Buffer.from('not an image')), null);
});

const spec = { canvas: { w: 300, h: 250 }, file: { types: ['jpg', 'png', 'gif'], max_kb: 150 }, video: { min_s: 6, max_s: 15, types: ['mp4'] } };
const bad = (r) => r.filter((x) => !x.ok).map((x) => x.m);

test('a still must match the canvas, the byte limit and the accepted types', () => {
  assert.deepEqual(bad(checkFile(spec, 'a.png', { ext: 'png', kb: 40, w: 300, h: 250 })), []);
  assert.match(bad(checkFile(spec, 'a.png', { ext: 'png', kb: 40, w: 600, h: 500 }))[0], /600×500, spec 300×250/);
  assert.match(bad(checkFile(spec, 'a.png', { ext: 'png', kb: 151, w: 300, h: 250 }))[0], /151KB, over 150KB/);
  assert.match(bad(checkFile({ ...spec, file: { types: ['png'] } }, 'a.jpg', { ext: 'jpg', kb: 10, w: 300, h: 250 }))[0], /\.jpg isn't among png/);
});

test('a video must fit the duration window', () => {
  assert.deepEqual(bad(checkFile(spec, 'v.mp4', { ext: 'mp4', kb: 900, w: 300, h: 250, duration: 8 })), []);
  assert.match(bad(checkFile(spec, 'v.mp4', { ext: 'mp4', kb: 900, w: 300, h: 250, duration: 4 }))[0], /under the 6s minimum/);
  assert.match(bad(checkFile(spec, 'v.mp4', { ext: 'mp4', kb: 900, w: 300, h: 250, duration: 20 }))[0], /over the 15s maximum/);
});

test('a video outside the recommended length passes with a warning', () => {
  const r = checkFile({ ...spec, video: { ...spec.video, recommended_s: [10, 15] } }, 'v.mp4', { ext: 'mp4', kb: 900, w: 300, h: 250, duration: 8 });
  assert.deepEqual(bad(r), []);
  assert.ok(r.some((x) => x.warn && /10–15s the platform recommends/.test(x.m)));
});

test('document pages are PDF pages: their image type is not checked', () => {
  const doc = { canvas: { w: 1080, h: 1350 }, file: { types: ['pdf'], max_mb: 100 } };
  assert.deepEqual(bad(checkFile(doc, 'card1.png', { ext: 'png', kb: 300, w: 1080, h: 1350 }, { page: true })), []);
});
