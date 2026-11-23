// A deck review covers one source state by content: story.md, src/ and brand/ as review-files saw them.
// Pirsch test build (Nov 23 2026): the agent edited story.md after its final review and reset the file's mtime
// so the old mtime check passed. Publishing now compares content, so that no longer works.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, stat, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const REVIEW_FILES = new URL('../bin/review-files.mjs', import.meta.url).pathname;
const OLD = new Date('2020-01-01T00:00:00Z');
const REVIEW_ID = '3f2b8c1e-9a4d-4e6b-8f1a-2c3d4e5f6a7b';

async function write(path, body) {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, body);
  await utimes(path, OLD, OLD);
}

/** A deck with screenshots, review-files run, and a passing review saved; cwd is the deck. */
async function inDeck(fn) {
  const prior = process.cwd();
  const root = await mkdtemp(join(tmpdir(), 'deck-review-'));
  try {
    process.chdir(root);
    await write('src/slides/01-cover.astro', '<h1>Analytics without cookies</h1>');
    await write('src/brand/brand.css', ':root{--a:#111}');
    await write('brand/brand.json', '{"schema":"brand-kit@1"}');
    await write('story.md', '# Pirsch\n\n## 1. Cover\nAnalytics without cookies');
    await write('artifacts/stage/01-cover.png', 'png');
    execFileSync(process.execPath, [REVIEW_FILES], { encoding: 'utf8' });
    const context = JSON.parse(await readFile('artifacts/review-context.json', 'utf8'));
    await writeFile('artifacts/review.json', JSON.stringify({ review_id: REVIEW_ID, format: 'deck', reviewed_at: new Date(Date.parse(context.created_at) + 1000).toISOString(), ready_to_publish: true, slides: [{ slide: '01-cover.png', verdict: 'ship', severity: 'none' }] }));
    const { designReviewBlocker } = await import('../bin/design-review.mjs');
    await fn({ context, blocker: () => designReviewBlocker() });
  } finally {
    process.chdir(prior);
    await rm(root, { recursive: true, force: true });
  }
}

test('ACCEPTANCE: review-files records the deck source fingerprint', () => inDeck(async ({ context }) => {
  assert.equal(context.format, 'deck');
  assert.match(context.source_sha256, /^[0-9a-f]{64}$/);
}));

test('ACCEPTANCE: an unchanged file passes', () => inDeck(async ({ blocker }) => {
  assert.equal(await blocker(), null);
  // A touch (new mtime, same bytes) changes nothing: content is what counts.
  await utimes('story.md', new Date(), new Date());
  assert.equal(await blocker(), null);
}));

test('ACCEPTANCE: a file edited after review with its mtime reset is refused at publish', () => inDeck(async ({ blocker }) => {
  const before = (await stat('story.md')).mtimeMs;
  await write('story.md', '# Pirsch\n\n## 1. Cover\nAnalytics without cookies, now certified');
  assert.equal((await stat('story.md')).mtimeMs, before);
  assert.match(await blocker(), /files changed after the last review/);
  await write('story.md', '# Pirsch\n\n## 1. Cover\nAnalytics without cookies');
  assert.equal(await blocker(), null);
  await write('src/slides/01-cover.astro', '<h1>Analytics without cookies for 10,000 sites</h1>');
  assert.match(await blocker(), /files changed after the last review/);
}));

test('the files brand:apply writes (src/brand) and brand captures are not part of the fingerprint', () => inDeck(async ({ blocker }) => {
  await write('src/brand/brand.css', ':root{--a:#222}');
  await write('brand/capture/page1-screen1.jpg', 'jpg');
  assert.equal(await blocker(), null);
}));

test('a review context without a source fingerprint (an older review-files) is refused', () => inDeck(async ({ blocker }) => {
  await writeFile('artifacts/review-context.json', JSON.stringify({ format: 'deck' }));
  assert.match(await blocker(), /no source fingerprint/);
}));
