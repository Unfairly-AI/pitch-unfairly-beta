// A site review covers one exact source state: the site fingerprint, story.md,
// the engine version, and every laptop and phone section screenshot.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const REVIEW_FILES = new URL('../bin/review-files.mjs', import.meta.url).pathname;
const OLD = new Date('2020-01-01T00:00:00Z');
const SECTIONS = ['01-hero.png', '02-scope.png'];
// What deck_review returns: the host's review_id travels in the JSON saved as artifacts/review.json.
const REVIEW_ID = '3f2b8c1e-9a4d-4e6b-8f1a-2c3d4e5f6a7b';

async function write(path, body) {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, body);
  await utimes(path, OLD, OLD); // so only the fingerprint, not mtimes, can tell an edit
}

/** What site-audit writes on a clean pass: the fingerprint and each device's screenshot hashes. */
async function stamp() {
  const { siteFingerprint } = await import('../bin/site-audit.mjs');
  const { screenshotHashes } = await import('../bin/design-review.mjs');
  await writeFile('artifacts/site-audit-pass.json', JSON.stringify({ fingerprint: await siteFingerprint(), shots: await screenshotHashes() }));
}

/** A project with a clean audit and review-files already run; cwd is the project. */
async function reviewed() {
  const root = await mkdtemp(join(tmpdir(), 'review-fresh-'));
  process.chdir(root);
  await write('site/site.json', JSON.stringify({ engine: 'sites@1.7' }));
  await write('site/sections/01-hero.html', '<section data-section="hero"></section>');
  await write('brand/brand.json', '{"schema":"brand-kit@1"}');
  await write('story.md', '# The story');
  for (const mode of ['laptop', 'phone']) for (const n of SECTIONS) await write(`artifacts/site/${mode}/${n}`, mode);
  await stamp();
  execFileSync(process.execPath, [REVIEW_FILES, '--site'], { encoding: 'utf8' });
  const context = JSON.parse(await readFile('artifacts/review-context.json', 'utf8'));
  const review = { review_id: REVIEW_ID, format: 'site', reviewed_at: new Date(Date.parse(context.created_at) + 1000).toISOString(), ready_to_publish: true, slides: SECTIONS.map((slide) => ({ slide, verdict: 'ship', severity: 'none' })) };
  await writeFile('artifacts/review.json', JSON.stringify(review));
  return { root, context, review };
}

async function inProject(fn) {
  const prior = process.cwd();
  let root;
  try {
    const p = await reviewed();
    root = p.root;
    const { designReviewBlocker } = await import('../bin/design-review.mjs');
    await fn({ ...p, blocker: () => designReviewBlocker({ site: true }) });
  } finally {
    process.chdir(prior);
    if (root) await rm(root, { recursive: true, force: true });
  }
}

test('ACCEPTANCE: review-files records the fingerprint, story hash, engine, time and full coverage', () => inProject(async ({ context }) => {
  const { ENGINE } = await import('../bin/site/version.mjs');
  assert.equal(context.format, 'site');
  assert.match(context.fingerprint, /^[0-9a-f]{64}$/);
  assert.match(context.story_sha256, /^[0-9a-f]{64}$/);
  assert.equal(context.engine, ENGINE);
  assert.ok(Number.isFinite(Date.parse(context.created_at)));
  assert.deepEqual(context.coverage, { laptop: SECTIONS, phone: SECTIONS });
}));

test('ACCEPTANCE: a full matching review passes', () => inProject(async ({ blocker }) => {
  assert.equal(await blocker(), null);
}));

test('ACCEPTANCE: an edit after review-files invalidates the review, even with an old mtime', () => inProject(async ({ blocker }) => {
  await write('site/sections/01-hero.html', '<section data-section="hero"><h1>Changed</h1></section>');
  assert.match(await blocker(), /site changed after the review's evidence was taken/);
}));

test('ACCEPTANCE: a story.md edit after review-files invalidates the review', () => inProject(async ({ blocker }) => {
  await write('story.md', '# A different story');
  assert.match(await blocker(), /site changed after the review's evidence was taken/);
}));

test('ACCEPTANCE: a review.json missing one section fails', () => inProject(async ({ blocker, review }) => {
  await writeFile('artifacts/review.json', JSON.stringify({ ...review, slides: review.slides.slice(0, 1) }));
  assert.match(await blocker(), /does not cover every/);
}));

test('coverage that disagrees with the recorded screenshots is refused', () => inProject(async ({ blocker, context }) => {
  await writeFile('artifacts/review-context.json', JSON.stringify({ ...context, coverage: { ...context.coverage, phone: [...SECTIONS, '03-cta.png'] } }));
  assert.match(await blocker(), /coverage and screenshot hashes disagree/);
}));

test('a review from another engine version, or one predating its evidence, is refused', () => inProject(async ({ blocker, context, review }) => {
  await writeFile('artifacts/review-context.json', JSON.stringify({ ...context, engine: '0.0.1' }));
  assert.match(await blocker(), /sites engine 0\.0\.1/);
  await writeFile('artifacts/review-context.json', JSON.stringify(context));
  await writeFile('artifacts/review.json', JSON.stringify({ ...review, reviewed_at: new Date(Date.parse(context.created_at) - 1).toISOString() }));
  assert.match(await blocker(), /predates its evidence/);
}));

test('a context without a fingerprint (an older review-files) is refused', () => inProject(async ({ blocker }) => {
  await writeFile('artifacts/review-context.json', JSON.stringify({ format: 'site' }));
  assert.match(await blocker(), /no source fingerprint/);
}));

test('ACCEPTANCE: review-files refuses screenshots from another revision (a mixed batch)', () => inProject(async () => {
  await write('site/sections/01-hero.html', '<section data-section="hero"><h1>Edited after the audit</h1></section>');
  assert.throws(() => execFileSync(process.execPath, [REVIEW_FILES, '--site'], { stdio: 'pipe' }), (e) => /another revision/.test(e.stderr.toString()));
  await rm('artifacts/site-audit-pass.json');
  assert.throws(() => execFileSync(process.execPath, [REVIEW_FILES, '--site'], { stdio: 'pipe' }), (e) => /No clean site audit/.test(e.stderr.toString()));
}));

test('a site-format story.md puts its decision, next step, motion and audience in the review context for the page judges', async () => {
  const prior = process.cwd();
  const root = await mkdtemp(join(tmpdir(), 'review-story-'));
  try {
    process.chdir(root);
    await write('site/site.json', JSON.stringify({ engine: 'sites@1.8' }));
    await write('site/sections/01-hero.html', '<section data-section="hero"></section>');
    await write('brand/brand.json', '{"schema":"brand-kit@1"}');
    await write('story.md', 'Format: site\nAudience: the operations lead at a regional grocer\nDecision: pilot route planning, or keep the spreadsheet\nMotion: evaluation\nNext step: book a scoping call\n\n## 01 hero\nJob: x\n');
    for (const mode of ['laptop', 'phone']) await write(`artifacts/site/${mode}/01-hero.png`, mode);
    const { siteReviewContext } = await import('../bin/design-review.mjs');
    const context = await siteReviewContext();
    assert.deepEqual(context.story, { decision: 'pilot route planning, or keep the spreadsheet', next_step: 'book a scoping call', motion: 'evaluation', audience: 'the operations lead at a regional grocer' });
    // A deck story carries none.
    await write('story.md', 'Audience: investors\n\n## 01 cover\nJob: x\n');
    assert.equal((await siteReviewContext()).story, undefined);
  } finally {
    process.chdir(prior);
    await rm(root, { recursive: true, force: true });
  }
});

test('ACCEPTANCE: ten desktop sections with one phone shot fail, in review-files and at publish', () => inProject(async ({ blocker, context }) => {
  const ten = Array.from({ length: 10 }, (_, i) => `${String(i + 1).padStart(2, '0')}-s.png`);
  await rm('artifacts/site', { recursive: true });
  for (const n of ten) await write(`artifacts/site/laptop/${n}`, `laptop ${n}`);
  await write('artifacts/site/phone/01-s.png', 'phone');
  await stamp();
  assert.throws(() => execFileSync(process.execPath, [REVIEW_FILES, '--site'], { stdio: 'pipe' }), (e) => /same sections/.test(e.stderr.toString()));
  // A context and review written by hand for that set are refused too.
  const { screenshotHashes } = await import('../bin/design-review.mjs');
  const shots = await screenshotHashes();
  await writeFile('artifacts/review-context.json', JSON.stringify({ ...context, coverage: { laptop: ten, phone: ['01-s.png'] }, shots }));
  await writeFile('artifacts/review.json', JSON.stringify({ review_id: REVIEW_ID, format: 'site', reviewed_at: new Date(Date.parse(context.created_at) + 1000).toISOString(), ready_to_publish: true, slides: ten.map((slide) => ({ slide, verdict: 'ship', severity: 'none' })) }));
  assert.match(await blocker(), /same sections/);
}));

test('ACCEPTANCE: a substituted screenshot (hash mismatch) fails, in review-files and at publish', () => inProject(async ({ blocker }) => {
  await write('artifacts/mobile/02-scope.png', 'a different picture sent for review');
  assert.match(await blocker(), /sent for review/);
  await write('artifacts/mobile/02-scope.png', 'phone');
  assert.equal(await blocker(), null);
  await write('artifacts/site/phone/02-scope.png', 'a different picture');
  assert.match(await blocker(), /differs from the one the clean audit took/);
  assert.throws(() => execFileSync(process.execPath, [REVIEW_FILES, '--site'], { stdio: 'pipe' }), (e) => /differs from the one the clean audit took/.test(e.stderr.toString()));
}));

test('a re-audit after the review (new screenshots) invalidates it', () => inProject(async ({ blocker }) => {
  await write('artifacts/site/laptop/01-hero.png', 'a fresh audit');
  await stamp();
  assert.match(await blocker(), /not the current audit/);
}));

test('a clean audit stamp without screenshot hashes is refused', () => inProject(async () => {
  const { siteFingerprint } = await import('../bin/site-audit.mjs');
  await writeFile('artifacts/site-audit-pass.json', JSON.stringify({ fingerprint: await siteFingerprint() }));
  assert.throws(() => execFileSync(process.execPath, [REVIEW_FILES, '--site'], { stdio: 'pipe' }), (e) => /recorded no section screenshots/.test(e.stderr.toString()));
}));

test('ACCEPTANCE: a review.json the agent wrote itself is refused, even marked ready (the Garner forgery)', () => inProject(async ({ blocker, review }) => {
  const SERVER = /isn't a server review \(no review_id\)\. Run deck_review_start\/deck_review and save the JSON it returns\./;
  const { review_id, ...forged } = review;
  await writeFile('artifacts/review.json', JSON.stringify(forged));
  assert.match(await blocker(), SERVER);
  await writeFile('artifacts/review.json', JSON.stringify({ ...review, review_id: 'local-1' }));
  assert.match(await blocker(), SERVER);
  await writeFile('artifacts/review.json', JSON.stringify({ ...review, reviewer: 'local self-review by the builder' }));
  assert.match(await blocker(), SERVER);
  await writeFile('artifacts/review.json', JSON.stringify(review));
  assert.equal(await blocker(), null);
}));
