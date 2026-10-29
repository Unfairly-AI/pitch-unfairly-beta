// E010: a capture must not overwrite a curated brand. --evidence-only writes
// only evidence (brand/capture/ and brand/references/), never the kit or assets.
// The browser is a stand-in, so this runs offline through the real capture code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captureBrand, capturePlan, mayWrite, mergeReferences } from '../bin/brand-capture.mjs';

const PAGE_DATA = {
  title: 'Example Co', siteName: 'Example Co', description: '', themeColor: null,
  backgrounds: [['rgb(255, 255, 255)', 1]], texts: [['rgb(20, 20, 20)', 100]],
  buttons: [{ background: 'rgb(200, 40, 40)', color: 'rgb(255, 255, 255)', radius: 8, borderWidth: 0, shadow: 'none' }],
  cards: [], links: [], type: { heading: null, body: null, label: null },
  logo: { svg: '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>' }, logoCandidates: ['inline svg'], images: [], cssVariables: {},
};

/** A stand-in for puppeteer: canned page data, and screenshots written as small files. */
function fakeBrowser() {
  const page = {
    setViewport: async () => {},
    goto: async () => {},
    close: async () => {},
    $$: async () => [],
    addStyleTag: async () => ({ evaluate: async () => {} }),
    screenshot: async ({ path }) => writeFile(path, `screenshot ${path}`),
    evaluate: async (fn) => {
      if (fn.name === 'extract') return structuredClone(PAGE_DATA);
      const src = String(fn);
      if (src.includes('scrollHeight')) return 1800;
      if (src.includes('performance')) return [];
      return undefined;
    },
  };
  return { newPage: async () => page, close: async () => {} };
}

const options = (out, extra = {}) => ({
  out, launch: async () => fakeBrowser(), findFontPackage: () => null, log: () => {}, pause: async () => {},
  fetchImpl: async () => { throw new Error('no network in tests'); }, ...extra,
});
const URLS = ['https://example.com/', 'https://example.com/about'];
const sha = async (path) => createHash('sha256').update(await readFile(path)).digest('hex');

async function* walk(dir, prefix = '') {
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (e.isDirectory()) yield* walk(join(dir, e.name), `${prefix}${e.name}/`);
    else yield `${prefix}${e.name}`;
  }
}
/** Hashes of everything in brand/ that isn't evidence. */
async function curated(out) {
  const hashes = {};
  for await (const f of walk(out)) if (!/^(capture|references)\//.test(f)) hashes[f] = await sha(join(out, f));
  return hashes;
}

test('ACCEPTANCE: an evidence-only capture leaves brand.json, logos and imagery byte-identical and adds references with URL, size and date', async () => {
  const root = await mkdtemp(join(tmpdir(), 'capture-evidence-'));
  const out = join(root, 'brand');
  try {
    await mkdir(join(out, 'logos'), { recursive: true });
    await mkdir(join(out, 'imagery'), { recursive: true });
    await mkdir(join(out, 'references'), { recursive: true });
    await writeFile(join(out, 'brand.json'), '{"schema":"brand-kit@1","identity":{"name":"Curated"}}\n');
    await writeFile(join(out, 'logos/primary.svg'), '<svg>curated</svg>');
    await writeFile(join(out, 'imagery/site-1.jpg'), 'curated photo');
    await writeFile(join(out, 'imagery/visual-1.png'), 'curated cutout');
    await writeFile(join(out, 'references/pricing.jpg'), 'earlier reference');
    await writeFile(join(out, 'references/index.json'), JSON.stringify([{ file: 'pricing.jpg', source_url: 'https://example.com/pricing', viewport: { width: 1440, height: 900 }, captured_at: '2026-01-01T00:00:00.000Z' }]));
    const before = await curated(out);

    const at = new Date('2026-10-23T12:00:00.000Z');
    const result = await captureBrand(URLS, options(out, { evidenceOnly: true, now: () => at }));
    assert.equal(result.kit, null);
    assert.deepEqual(await curated(out), before, 'nothing outside capture/ and references/ changed');

    const index = JSON.parse(await readFile(join(out, 'references/index.json'), 'utf8'));
    assert.deepEqual(index.map((r) => r.file).sort(), ['page1-mobile-screen1.jpg', 'page1-screen1.jpg', 'page1-screen2.jpg', 'page2-screen1.jpg', 'pricing.jpg']);
    for (const r of index.filter((x) => x.file !== 'pricing.jpg')) {
      assert.ok(URLS.includes(r.source_url), r.file);
      assert.ok(r.viewport.width > 0 && r.viewport.height > 0, r.file);
      assert.ok(r.bytes > 0, r.file);
      assert.equal(r.captured_at, at.toISOString());
    }
    assert.equal(index.find((r) => r.file === 'page2-screen1.jpg').source_url, URLS[1]);
    assert.equal(await readFile(join(out, 'references/pricing.jpg'), 'utf8'), 'earlier reference', 'earlier references are kept');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('a full capture still writes the draft kit, the logo and the references', async () => {
  const root = await mkdtemp(join(tmpdir(), 'capture-full-'));
  const out = join(root, 'brand');
  try {
    const result = await captureBrand(URLS, options(out));
    const kit = JSON.parse(await readFile(join(out, 'brand.json'), 'utf8'));
    assert.equal(kit.schema, 'brand-kit@1');
    assert.equal(kit.identity.name, 'Example Co');
    assert.equal(kit.palette.accent, '#c82828');
    assert.equal(kit.identity.logos.primary, 'logos/primary.svg');
    assert.match(await readFile(join(out, 'logos/primary.svg'), 'utf8'), /<rect\/>/);
    const gaps = kit.sources.gaps.map((g) => g.field);
    for (const field of ['positioning.statement', 'messaging.pillars', 'voice.rules', 'design.icon_style', 'design.motion']) assert.ok(gaps.includes(field), field);
    assert.equal(result.references.length, 4);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('the write plan: evidence-only may write only capture/ and references/', () => {
  const evidence = capturePlan({ evidenceOnly: true });
  for (const ok of ['capture/page1-screen1.jpg', 'capture/capture.json', 'references/index.json', 'references/page1-screen1.jpg']) assert.equal(mayWrite(evidence, ok), true, ok);
  for (const no of ['brand.json', 'logos/primary.svg', 'imagery/site-1.jpg', 'imagery/visual-1.png', 'fonts/a.woff2', 'seller-understanding.md', 'capture', 'references']) assert.equal(mayWrite(evidence, no), false, no);
  const full = capturePlan();
  for (const ok of ['brand.json', 'logos/primary.svg', 'imagery/site-1.jpg', 'references/index.json']) assert.equal(mayWrite(full, ok), true, ok);
  assert.equal(mayWrite(full, 'seller-understanding.md'), false);
  assert.deepEqual(mergeReferences([{ file: 'a.jpg', v: 1 }, { file: 'b.jpg' }], [{ file: 'a.jpg', v: 2 }]), [{ file: 'b.jpg' }, { file: 'a.jpg', v: 2 }]);
});
