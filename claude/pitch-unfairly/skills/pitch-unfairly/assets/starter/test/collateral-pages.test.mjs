import { test } from 'node:test';
import assert from 'node:assert/strict';
import { batches, budget, eyebrow, groundFor, headlineOf, pending, planPages, specLine, titleOfHtml } from '../bin/collateral/pages.mjs';
import { resolveFormat } from '../bin/collateral/registry.mjs';

const set = {
  pieces: [
    { id: 'poster-1a', format: 'print.poster.24x36', variant: 'clinical' },
    { id: 'poster-1b', format: 'print.poster.24x36', variant: 'clinical' },
    { id: 'poster-2a', format: 'print.poster.24x36', variant: 'clinical' },
    { id: 'poster-2b', format: 'print.poster.24x36', variant: 'clinical' },
    { id: 'tee-art', format: 'merch.tshirt.back', variant: 'education' },
    { id: 'tee-mockup', mockup: true },
    { id: 'instagram-post', format: 'instagram.feed.portrait' },
  ],
  pages: {
    suffix: 'Acme',
    variants: { clinical: 'Clinical care' },
    links: [
      { slug: 'acme-poster-smiles', title: 'Poster: Transforming smiles', pieces: ['poster-1a', 'poster-1b'] },
      { slug: 'acme-poster-care', title: 'Poster: People who care', pieces: ['poster-2a', 'poster-2b'], caption: 'Dental care by people who care, over a soft field.' },
      { slug: 'acme-tee', title: 'T-shirt', pieces: ['tee-mockup', 'tee-art'], caption: 'The sliced repeat of transforming.' },
      { slug: 'acme-instagram', title: 'Instagram post', pieces: ['instagram-post'], caption: 'WE create over gold fleck.' },
    ],
  },
};
const titles = {
  'poster-1a': 'Poster 1a: Transforming smiles', 'poster-1b': 'Poster 1b: photo',
  'poster-2a': 'Poster 2a: Dental care by people who care', 'poster-2b': 'Poster 2b: photo',
  'tee-art': 'T-shirt back: transforming', 'tee-mockup': 'T-shirt mockup', 'instagram-post': 'Instagram: WE create',
};
const deps = { formatOf: (id) => (id ? resolveFormat(id) : null), titleOf: (id) => titles[id] };
const clone = (x) => JSON.parse(JSON.stringify(x));

test('headlines come from the piece source', () => {
  assert.equal(titleOfHtml('<html><head><title>Poster 1a: Transforming smiles</title>'), 'Poster 1a: Transforming smiles');
  assert.equal(headlineOf('Poster 1a: Transforming smiles'), 'Transforming smiles');
  assert.equal(headlineOf('Poster 1b: photo'), null);
  assert.equal(headlineOf('DDS 1-pager'), null);
});

test('ACCEPTANCE: a built set becomes one page per link, typed from its formats, view and download apart', () => {
  const { links, problems } = planPages(set, deps);
  assert.deepEqual(problems, []);
  assert.deepEqual(links.map((l) => [l.slug, l.type]), [['acme-poster-smiles', 'print'], ['acme-poster-care', 'print'], ['acme-tee', 'swag'], ['acme-instagram', 'social']]);
  const poster = links[0];
  assert.equal(poster.page_title, 'Poster: Transforming smiles · Acme');
  assert.equal(poster.eyebrow, 'Print · Clinical care');
  assert.equal(poster.spec, 'A pair · Poster · 24 × 36 in each, 0.125 in bleed');
  assert.deepEqual(poster.items.map((i) => [i.view, i.download, i.label]), [
    ['files/poster-1a-view.jpg', 'files/poster-1a.pdf', 'Print PDF · left'],
    ['files/poster-1b-view.jpg', 'files/poster-1b.pdf', 'Print PDF · right'],
  ]);
  const tee = links[2];
  assert.deepEqual(tee.items.map((i) => i.role), ['mockup', 'merch']);
  assert.equal(tee.items[0].download, undefined, 'a mockup is a view, not a download');
  assert.equal(tee.items[1].download, 'files/tee-art.png');
  assert.notEqual(tee.items[1].view, tee.items[1].download, 'the view image is never the download');
  assert.equal(links[3].items[0].label, 'Post image PNG · 1080 × 1350');
  for (const l of links) for (const i of l.items) if (i.download) assert.notEqual(i.view, i.download);
});

test('ACCEPTANCE: swapped poster titles fail before anything is published', () => {
  const s = clone(set);
  [s.pages.links[0].pieces, s.pages.links[1].pieces] = [s.pages.links[1].pieces, s.pages.links[0].pieces];
  const { problems } = planPages(s, deps);
  assert.ok(problems.some((p) => /acme-poster-smiles: piece "poster-2a" says "Dental care by people who care"/.test(p)), problems.join('\n'));
  assert.ok(problems.some((p) => /acme-poster-care: piece "poster-1a" says "Transforming smiles"/.test(p)));
});

test('a social caption describing another post fails', () => {
  const s = clone(set);
  s.pages.links[3].caption = 'Transforming health through compassionate care.';
  assert.match(planPages(s, deps).problems.join('\n'), /acme-instagram: piece "instagram-post" says "WE create"/);
});

test('every piece is on a link, once, and a link is one type', () => {
  const s = clone(set);
  s.pages.links.pop();
  assert.match(planPages(s, deps).problems.join('\n'), /piece "instagram-post" is on no link/);
  s.pages.unlinked = ['instagram-post'];
  assert.deepEqual(planPages(s, deps).problems, []);
  const m = clone(set);
  m.pages.links[3].pieces.push('poster-1a');
  const out = planPages(m, deps).problems.join('\n');
  assert.match(out, /already on link acme-poster-smiles/);
  const t = clone(set);
  t.pages.links[2].type = 'print';
  assert.match(planPages(t, deps).problems.join('\n'), /says type print but its pieces are swag/);
});

test('labels never repeat the type as the area', () => {
  assert.equal(eyebrow('swag', 'swag'), 'Swag');
  assert.equal(eyebrow('swag', null), 'Swag');
  assert.equal(eyebrow('print', 'education'), 'Print · Education');
});

test('spec lines come from the registry', () => {
  assert.equal(specLine(resolveFormat('print.ooh.bus_shelter.47x68')), 'Bus shelter poster · 47.5 × 68.5 in (46 × 67 visible)');
  assert.equal(specLine(resolveFormat('merch.tshirt.back')), 'T-shirt back · art 12 × 16 in, 300 dpi transparent PNG');
});

test('white ink shows on a dark ground, dark ink on white', () => {
  assert.equal(groundFor(0.95), '#151515');
  assert.equal(groundFor(0.1), '#ffffff');
});

test('ACCEPTANCE: publishing stays inside 30 versions an hour', () => {
  const now = Date.parse('2026-10-27T12:00:00Z');
  const at = (min) => new Date(now - min * 60_000).toISOString();
  const ledger = Array.from({ length: 28 }, (_, i) => ({ slug: `s${i}`, digest: 'd', at: at(50 - i) }));
  ledger.push({ slug: 'old', digest: 'd', at: at(90) });
  assert.deepEqual(budget(ledger, now), { free: 2, used: 28, next_at: null });
  const full = [...ledger, { at: at(1) }, { at: at(1) }];
  const b = budget(full, now);
  assert.equal(b.free, 0);
  assert.equal(b.next_at, new Date(Date.parse(at(50)) + 3_600_000).toISOString(), 'the next slot opens when the oldest counted start ages out');
  const todo = Array.from({ length: 33 }, (_, i) => ({ slug: `l${i}` }));
  assert.deepEqual(batches(todo, 2).map((x) => x.length), [2, 30, 1]);
  assert.deepEqual(batches(todo, 0).map((x) => x.length), [30, 3]);
});

test('a link is pending until its current build is recorded', () => {
  const links = [{ slug: 'a', digest: '1' }, { slug: 'b', digest: '2' }];
  assert.deepEqual(pending(links, [{ slug: 'a', digest: '1' }, { slug: 'b', digest: 'old' }]).map((l) => l.slug), ['b']);
});

test('the starter example set plans clean', async () => {
  const { readFileSync } = await import('node:fs');
  const ex = JSON.parse(readFileSync(new URL('../collateral-kit/collateral.json', import.meta.url), 'utf8'));
  const t = (id) => readFileSync(new URL(`../collateral-kit/pieces/${id}.html`, import.meta.url), 'utf8');
  const { problems, links } = planPages(ex, { formatOf: (id) => (id ? resolveFormat(id) : null), titleOf: (id) => titleOfHtml(t(id)) });
  assert.deepEqual(problems, []);
  assert.deepEqual(links.map((l) => l.type), ['print', 'print']);
});

test('ACCEPTANCE: the seam check finds a half-transparent row between solid ink, and passes clean art', async () => {
  const { deflateSync } = await import('node:zlib');
  const { decodePng, hairlineRows } = await import('../bin/collateral/seams.mjs');
  const png = (w, h, alphaAt) => {
    const raw = Buffer.alloc((w * 4 + 1) * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 4 + 1) + 1 + x * 4; raw[o + 3] = alphaAt(x, y); }
    const chunk = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(t, 4); d.copy(b, 8); return b; };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  };
  assert.deepEqual(hairlineRows(decodePng(png(60, 9, (x, y) => (y === 4 ? 128 : 255)))), [4]);
  assert.deepEqual(hairlineRows(decodePng(png(60, 9, () => 255))), []);
});
