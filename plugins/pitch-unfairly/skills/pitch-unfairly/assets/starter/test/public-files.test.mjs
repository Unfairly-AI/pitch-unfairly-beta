// Bar 17: research, the story, brand references and seller understanding never
// publish. One allowlist (bin/site/public-files.mjs) is read by the build,
// site-manifest and upload.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildSite } from '../bin/site-build.mjs';
import { brandFileProblem, distFileProblem, siteAssetProblem } from '../bin/site/public-files.mjs';
import { pack } from '../bin/source.mjs';

const SITE = { title: 'A plan for Example Co', description: 'A plan.', model: {}, facts: {} };
const SECTION = `<section id="hero" data-section="hero">
  <img src="brand/logos/primary.svg" alt="Example Co"><img src="brand/imagery/site-1.jpg" alt=""><img src="assets/drawing.svg" alt="">
  <h1>A plan for Example Co</h1>
</section>`;
const KIT = {
  schema: 'brand-kit@1',
  identity: { name: 'Example Co', logos: { primary: 'logos/primary.svg' } },
  palette: { paper: '#ffffff', ink: '#222222', accent: '#aa3300' },
  typography: {
    display: { family: 'Brand Sans', source: 'files', license: 'user-supplied', files: [{ path: 'fonts/brand-sans.woff2', weight: 700 }] },
    body: { family: 'Arial', source: 'system' },
  },
};

async function write(root, files) {
  for (const [path, body] of Object.entries(files)) {
    await mkdir(join(root, path, '..'), { recursive: true });
    await writeFile(join(root, path), body);
  }
}

async function* walk(dir, prefix = '') {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) yield* walk(join(dir, e.name), `${prefix}${e.name}/`);
    else yield `${prefix}${e.name}`;
  }
}

/** A lead project: the page and its brand, plus everything the plan stage writes beside them. */
async function leadProject() {
  const root = await mkdtemp(join(tmpdir(), 'public-files-'));
  await write(root, {
    'site/site.json': JSON.stringify(SITE),
    'site/sections/01-hero.html': SECTION,
    'site/assets/drawing.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
    'site/assets/research.md': '# What we found about the buyer',
    'brand/brand.json': JSON.stringify(KIT),
    'brand/logos/primary.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
    'brand/imagery/site-1.jpg': 'jpg',
    'brand/fonts/brand-sans.woff2': 'woff2',
    'brand/seller-understanding.md': '# How the seller sells',
    'brand/references/x.jpg': 'reference screenshot',
    'brand/references/index.json': '[]',
    'brand/capture/capture.json': '{}',
    'story.md': '# The story',
    'facts.json': '{}',
    'buyers.json': '[]',
    'research.md': '# Research',
  });
  return root;
}

test('ACCEPTANCE: the build refuses private files in site/assets with a clear message', async () => {
  const root = await leadProject();
  try {
    await assert.rejects(buildSite({ root }), (e) => /site\/assets\/research\.md/.test(e.message) && /published/.test(e.message));
    assert.ok(!existsSync(join(root, 'dist-site')), 'nothing is built');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('ACCEPTANCE: a lead project publishes none of its private files, and every logo, font and image the page uses', async () => {
  const root = await leadProject();
  try {
    await rm(join(root, 'site/assets/research.md'));
    await buildSite({ root });
    const published = [];
    for await (const f of walk(join(root, 'dist-site'))) published.push(f);
    for (const f of ['brand/logos/primary.svg', 'brand/imagery/site-1.jpg', 'brand/fonts/brand-sans.woff2', 'assets/drawing.svg', 'index.html', 'index.txt', 'js/app.js', 'js/model.mjs']) assert.ok(published.includes(f), f);
    for (const f of published) assert.equal(distFileProblem(f), null, f);
    assert.ok(!published.some((f) => /seller-understanding|references\/|capture\/|brand\.json|story|facts|buyers|research/.test(f)), published.join(', '));
    // The private source bundle still keeps the editable evidence.
    const { bundle } = await pack(root);
    const kept = bundle.files.map((f) => f.path);
    for (const f of ['story.md', 'brand/brand.json', 'brand/seller-understanding.md', 'brand/references/x.jpg', 'brand/references/index.json']) assert.ok(kept.includes(f), f);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('ACCEPTANCE: site-manifest refuses a dist-site with a planted brand/notes.md', async () => {
  const root = await leadProject();
  const prior = process.cwd();
  try {
    await rm(join(root, 'site/assets/research.md'));
    await buildSite({ root });
    await write(root, { 'dist-site/deck.pdf': 'pdf', 'dist-site/brand/notes.md': '# notes' });
    process.chdir(root);
    const { siteFingerprint } = await import('../bin/site-audit.mjs');
    await write(root, { 'artifacts/site-audit-pass.json': JSON.stringify({ fingerprint: await siteFingerprint() }) });
    const script = new URL('../bin/site-manifest.mjs', import.meta.url).pathname;
    assert.throws(() => execFileSync(process.execPath, [script], { stdio: 'pipe' }), (e) => /brand\/notes\.md/.test(e.stderr.toString()) && /never publishes/.test(e.stderr.toString()));
    await rm(join(root, 'dist-site/brand/notes.md'));
    const manifest = JSON.parse(execFileSync(process.execPath, [script], { encoding: 'utf8' }));
    assert.ok(manifest.files.some((f) => f.path === 'brand/logos/primary.svg'));
    // deck_upload_start gets the host's review_id and the engine, beside kind, title, story and files.
    const { ENGINE } = await import('../bin/site/version.mjs');
    assert.equal(manifest.review_id, null);
    assert.equal(manifest.engine, ENGINE);
    await write(root, { 'artifacts/review.json': JSON.stringify({ review_id: '3f2b8c1e-9a4d-4e6b-8f1a-2c3d4e5f6a7b' }) });
    assert.equal(JSON.parse(execFileSync(process.execPath, [script], { encoding: 'utf8' })).review_id, '3f2b8c1e-9a4d-4e6b-8f1a-2c3d4e5f6a7b');
  } finally { process.chdir(prior); await rm(root, { recursive: true, force: true }); }
});

test('upload refuses a host list naming a private file for a site', async () => {
  const root = await mkdtemp(join(tmpdir(), 'public-upload-'));
  try {
    await write(root, { 'site/site.json': JSON.stringify({ engine: 'sites@1.6' }), 'dist-site/index.html': 'x', 'uploads.json': JSON.stringify([{ path: 'brand/references/index.json', upload_url: 'http://127.0.0.1:9/x', content_type: 'application/json' }]) });
    const script = new URL('../bin/upload.mjs', import.meta.url).pathname;
    assert.throws(() => execFileSync(process.execPath, [script, 'uploads.json', 'dist-site'], { cwd: root, stdio: 'pipe' }), (e) => /brand\/references\/index\.json/.test(e.stderr.toString()));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('the allowlist rules', () => {
  for (const ok of ['logos/primary.svg', 'imagery/a.webp', 'fonts/x.woff2', 'icon.ico']) assert.equal(brandFileProblem(ok), null, ok);
  for (const bad of ['brand.json', 'seller-understanding.md', 'notes.txt', 'guide.pdf', 'board.html', 'palette.csv', 'references/x.jpg', 'capture/page1.jpg', 'imagery/research-1.png']) assert.ok(brandFileProblem(bad), bad);
  for (const ok of ['drawing.svg', 'fonts/a.woff2', 'customer-story.jpg', 'one-pager.pdf']) assert.equal(siteAssetProblem(ok), null, ok);
  for (const bad of ['research.md', 'data.json', 'buyers.csv', 'seller-understanding.pdf', 'notes/a.txt', 'story.pdf', 'facts-v2.pdf']) assert.ok(siteAssetProblem(bad), bad);
  for (const ok of ['index.html', 'index.txt', 'deck.pdf', 'js/app.js', 'js/model.mjs', 'fonts/sora/a.woff2', 'assets/a.png', 'brand/logos/a.svg']) assert.equal(distFileProblem(ok), null, ok);
  for (const bad of ['story.md', 'research.md', 'facts.json', 'notes.html', 'brand/notes.md', 'brand/brand.json', 'js/x.json', 'fonts/a.css', 'other/a.png']) assert.ok(distFileProblem(bad), bad);
});

test('ACCEPTANCE: a private name in any folder, an unsafe path, or a non-public kind never publishes', () => {
  // The cases Codex confirmed were accepted, through every gate that reads the list.
  for (const bad of ['research/strategy.pdf', 'seller-understanding/index.html', 'seller-understanding/overview.png', '../../.env', 'notes/2026/a.png', 'deep/story/hero.png', 'references/x.jpg', 'capture/a.png', '.env', 'img/.hidden.png', '/etc/a.png', 'a\\b.png', 'a//b.png', './a.png']) {
    assert.ok(siteAssetProblem(bad), `site/assets/${bad}`);
    assert.ok(distFileProblem(`assets/${bad}`), `dist assets/${bad}`);
  }
  for (const bad of ['seller-understanding/overview.png', 'research/a.svg', 'logos/../brand.json', 'imagery/notes/a.jpg']) {
    assert.ok(brandFileProblem(bad), `brand/${bad}`);
    assert.ok(distFileProblem(`brand/${bad}`), `dist brand/${bad}`);
  }
  for (const bad of ['assets/../../.env', '../index.html', '/index.html', 'brand\\x.png', '.env']) assert.ok(distFileProblem(bad), bad);
  // brand/ keeps the strict rule for its images: there they are the capture's evidence.
  for (const bad of ['imagery/research-1.png', 'story.png', 'notes-board.jpg']) assert.ok(brandFileProblem(bad), `brand/${bad}`);
  // site/assets is an explicit allowlist: media and documents yes, code, markup and data no.
  for (const ok of ['clip.mp4', 'clip.webm', 'jingle.mp3', 'one-pager.pdf', 'photo.avif', 'favicon.ico', 'fonts/a.woff2', 'customer-story.jpg']) assert.equal(siteAssetProblem(ok), null, ok);
  for (const bad of ['embed.html', 'readme.md', 'data.json', 'copy.txt', 'table.csv', 'widget.js', 'extra.css', 'archive.zip', 'noext']) assert.ok(siteAssetProblem(bad), bad);
});

test('ACCEPTANCE: the build refuses a private folder in site/assets, and leaves private brand folders behind', async () => {
  const root = await leadProject();
  try {
    await rm(join(root, 'site/assets/research.md'));
    await write(root, { 'site/assets/research/strategy.pdf': 'pdf' });
    await assert.rejects(buildSite({ root }), /site\/assets\/research\/strategy\.pdf/);
    await rm(join(root, 'site/assets/research'), { recursive: true });
    await write(root, { 'site/assets/seller-understanding/index.html': '<p>x</p>' });
    await assert.rejects(buildSite({ root }), /seller-understanding\/index\.html/);
    await rm(join(root, 'site/assets/seller-understanding'), { recursive: true });
    await write(root, { 'brand/seller-understanding/overview.png': 'png' });
    await buildSite({ root });
    assert.ok(!existsSync(join(root, 'dist-site/brand/seller-understanding')));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('ACCEPTANCE: upload refuses a host path that climbs out of dist-site', async () => {
  const root = await mkdtemp(join(tmpdir(), 'public-climb-'));
  try {
    await write(root, { 'site/site.json': JSON.stringify({ engine: 'sites@1.6' }), 'dist-site/index.html': 'x', 'uploads.json': JSON.stringify([{ path: 'assets/../../.env', upload_url: 'http://127.0.0.1:9/x', content_type: 'text/plain' }]) });
    const script = new URL('../bin/upload.mjs', import.meta.url).pathname;
    assert.throws(() => execFileSync(process.execPath, [script, 'uploads.json', 'dist-site'], { cwd: root, stdio: 'pipe' }), (e) => /\.env/.test(e.stderr.toString()));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('ACCEPTANCE: upload stops when the deck host refused the review', async () => {
  const root = await mkdtemp(join(tmpdir(), 'public-refused-'));
  try {
    const script = new URL('../bin/upload.mjs', import.meta.url).pathname;
    await write(root, { 'site/site.json': JSON.stringify({ engine: 'sites@1.6' }), 'dist-site/index.html': 'x' });
    for (const reply of [{ review_refused: 'review 3f2b… was not issued for this deck', uploads: [] }, { error: 'review_id is not a finished server review' }]) {
      await write(root, { 'uploads.json': JSON.stringify(reply) });
      assert.throws(() => execFileSync(process.execPath, [script, 'uploads.json', 'dist-site'], { cwd: root, stdio: 'pipe' }), (e) => /refused this upload/.test(e.stderr.toString()) && e.stderr.toString().includes(reply.review_refused ?? reply.error));
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('ACCEPTANCE: a plain-text refusal saved as the upload list stops the upload and prints the host\'s message', async () => {
  const root = await mkdtemp(join(tmpdir(), 'public-text-refusal-'));
  try {
    const script = new URL('../bin/upload.mjs', import.meta.url).pathname;
    await write(root, { 'site/site.json': JSON.stringify({ engine: 'sites@1.6' }), 'dist-site/index.html': 'x', 'uploads.json': 'The design review 9ebc… has blocking findings on 03-benchmark.png: fix them and run deck_review again.' });
    assert.throws(() => execFileSync(process.execPath, [script, 'uploads.json', 'dist-site'], { cwd: root, stdio: 'pipe' }), (e) => /isn't the deck host's upload list/.test(e.stderr.toString()) && /blocking findings on 03-benchmark/.test(e.stderr.toString()));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('ACCEPTANCE: a 1.8 site whose upload reply lacks review_verified isn\'t published; an older pin is unchanged', async () => {
  const { unverifiedSiteReview } = await import('../bin/site/public-files.mjs');
  assert.match(unverifiedSiteReview({ engine: 'sites@1.8' }, { uploads: [] }), /didn't confirm this site's design review/);
  assert.match(unverifiedSiteReview({}, { uploads: [] }), /didn't confirm/, 'unpinned builds on the current engine');
  assert.equal(unverifiedSiteReview({ engine: 'sites@1.8' }, { uploads: [], review_verified: true }), null);
  assert.equal(unverifiedSiteReview({ engine: 'sites@1.7' }, { uploads: [] }), null, 'an older pin publishes as before');
  assert.equal(unverifiedSiteReview({ engine: 'sites@1.8' }, [{ path: 'index.html' }]), null, 'a bare list (older host) is unchanged');
});

test('ACCEPTANCE (engine 1.11): page art named for what it shows publishes; documents, data and private folders still never do', () => {
  // The Oct 23 false positives: a roastery story photo and a product screenshot of the notes view.
  for (const ok of ['story-roastery.webp', 'notes-product.png', 'story.png', 'facts-v2.svg', 'capture-the-moment.jpg', 'research-lab.avif', 'references-wall.mp4', 'buyers-guide-cover.gif', 'fonts/story-serif.woff2']) {
    assert.equal(siteAssetProblem(ok), null, `site/assets/${ok}`);
    assert.equal(distFileProblem(`assets/${ok}`), null, `dist assets/${ok}`);
  }
  // Documents and data named for the plan, and anything inside a private folder, are refused as before.
  for (const bad of ['research.md', 'facts.json', 'buyers.json', 'story.md', 'story.pdf', 'notes.txt', 'buyers.csv', 'seller-understanding.pdf', 'research/hero.png', 'seller-understanding/overview.png', 'references/x.jpg', 'capture/page1.webp', 'deep/research/a.svg', 'story/hero.png']) {
    assert.ok(siteAssetProblem(bad), `site/assets/${bad}`);
    assert.ok(distFileProblem(`assets/${bad}`), `dist assets/${bad}`);
  }
  for (const bad of ['capture/page1.jpg', 'capture/capture.json', 'references/x.jpg', 'seller-understanding/overview.png', 'seller-understanding.md']) assert.ok(brandFileProblem(bad), `brand/${bad}`);
  for (const bad of ['story.md', 'research.md', 'facts.json', 'buyers.json']) assert.ok(distFileProblem(bad), bad);
});
