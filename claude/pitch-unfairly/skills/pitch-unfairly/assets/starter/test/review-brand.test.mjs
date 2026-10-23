import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

// review-files -- --site needs the screenshots to come from a clean audit of the current source.
async function stampCleanAudit(root) {
  const prior = process.cwd();
  process.chdir(root);
  try {
    const { siteFingerprint } = await import('../bin/site-audit.mjs');
    const { screenshotHashes } = await import('../bin/design-review.mjs');
    await writeFile('artifacts/site-audit-pass.json', JSON.stringify({ fingerprint: await siteFingerprint(), shots: await screenshotHashes() }));
  } finally { process.chdir(prior); }
}

test('ACCEPTANCE: existing review-files sends the kit and real reference files with slide screenshots', async () => {
  const root = await mkdtemp(join(tmpdir(), 'proposal-review-'));
  try {
    await mkdir(join(root, 'artifacts/stage'), { recursive: true });
    await mkdir(join(root, 'brand/capture'), { recursive: true });
    await writeFile(join(root, 'artifacts/stage/a.png'), 'slide');
    await writeFile(join(root, 'brand/brand.json'), '{"schema":"brand-kit@1"}');
    await writeFile(join(root, 'brand/capture/page1-screen1.jpg'), 'desktop reference');
    await writeFile(join(root, 'brand/capture/page1-mobile-screen1.jpg'), 'phone reference');
    const script = new URL('../bin/review-files.mjs', import.meta.url).pathname;
    const files = JSON.parse(execFileSync(process.execPath, [script], { cwd: root, encoding: 'utf8' }));
    assert.ok(files.some((f) => f.path === 'brand-kit.json'));
    assert.ok(files.some((f) => f.path === 'brand-reference-1.jpg'));
    assert.ok(files.some((f) => f.path === 'brand-reference-4.jpg'));
    assert.ok(files.some((f) => f.path === 'stage/a.png'));
    assert.equal(await readFile(join(root, 'artifacts/brand-reference-1.jpg'), 'utf8'), 'desktop reference');
  } finally { await rm(root, { recursive: true, force: true }); }
});


test('ACCEPTANCE: source backgrounds are restored after asset extraction, including failed captures', async () => {
  const { withTransparentBackground } = await import('../bin/brand-capture-evidence.mjs');
  let transparent = false;
  const page = { addStyleTag: async () => { transparent = true; return { evaluate: async () => { transparent = false; } }; } };
  await withTransparentBackground(page, async () => { assert.equal(transparent, true); });
  assert.equal(transparent, false, 'subsequent reference screenshots retain the source background');
  await assert.rejects(withTransparentBackground(page, async () => { throw new Error('cutout failed'); }), /cutout failed/);
  assert.equal(transparent, false);
});

test('ACCEPTANCE: proposal review-files maps existing site audit captures into the shared reviewer', async () => {
  const root = await mkdtemp(join(tmpdir(), 'proposal-site-review-'));
  try {
    for (const mode of ['laptop', 'phone']) {
      await mkdir(join(root, 'artifacts/site', mode), { recursive: true });
      await writeFile(join(root, 'artifacts/site', mode, '01-hero.png'), mode);
    }
    await stampCleanAudit(root);
    const script = new URL('../bin/review-files.mjs', import.meta.url).pathname;
    const files = JSON.parse(execFileSync(process.execPath, [script, '--site'], { cwd: root, encoding: 'utf8' }));
    assert.ok(files.some((f) => f.path === 'stage/01-hero.png'));
    assert.ok(files.some((f) => f.path === 'mobile/01-hero.png'));
    const context = JSON.parse(await readFile(join(root, 'artifacts/review-context.json'), 'utf8'));
    assert.equal(context.format, 'site');
    assert.deepEqual(context.coverage, { laptop: ['01-hero.png'], phone: ['01-hero.png'] });
    assert.equal(await readFile(join(root, 'artifacts/stage/01-hero.png'), 'utf8'), 'laptop');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('ACCEPTANCE: a new proposal cannot upload with a missing, blocked, stale, incomplete or deck-format review', async () => {
  const root = await mkdtemp(join(tmpdir(), 'proposal-upload-gate-'));
  const prior = process.cwd();
  try {
    process.chdir(root);
    await mkdir('site', { recursive: true });
    await mkdir('artifacts/site/laptop', { recursive: true });
    await mkdir('artifacts/site/phone', { recursive: true });
    await mkdir('dist-site');
    await writeFile('site/site.json', JSON.stringify({ engine: 'sites@1.7' }));
    // Every section on both devices, as a clean audit leaves them.
    await writeFile('artifacts/site/laptop/01-hero.png', 'hero');
    await writeFile('artifacts/site/phone/01-hero.png', 'hero on a phone');
    await stampCleanAudit(root);
    // review-files' copies for the reviewer.
    for (const [dir, body] of [['stage', 'hero'], ['mobile', 'hero on a phone']]) {
      await mkdir(join('artifacts', dir), { recursive: true });
      await writeFile(join('artifacts', dir, '01-hero.png'), body);
    }
    const { siteReviewContext } = await import('../bin/design-review.mjs');
    await writeFile('artifacts/review-context.json', JSON.stringify(await siteReviewContext()));
    const script = new URL('../bin/upload.mjs', import.meta.url).pathname;
    assert.throws(() => execFileSync(process.execPath, [script, 'uploads.json', 'dist-site'], { stdio: 'pipe' }), (error) => /there is no design review/.test(error.stderr.toString()));
    const { designReviewBlocker } = await import('../bin/design-review.mjs');
    const reviewedAt = new Date(Date.now() + 100).toISOString();
    const review = { review_id: '3f2b8c1e-9a4d-4e6b-8f1a-2c3d4e5f6a7b', format: 'site', reviewed_at: reviewedAt, ready_to_publish: true, slides: [{ slide: '01-hero.png', verdict: 'ship', severity: 'none' }] };
    const save = (overrides) => writeFile('artifacts/review.json', JSON.stringify({ ...review, ...overrides }));
    await save({});
    assert.equal(await designReviewBlocker({ site: true }), null);
    await save({ ready_to_publish: false });
    assert.match(await designReviewBlocker({ site: true }), /blocking/);
    await save({ slides: [] });
    assert.match(await designReviewBlocker({ site: true }), /no verdicts/);
    await save({ format: 'deck' });
    assert.match(await designReviewBlocker({ site: true }), /site-format/);
    await save({ reviewed_at: 'not a date' });
    assert.match(await designReviewBlocker({ site: true }), /valid completion time/);
    await save({ reviewed_at: '2020-01-01T00:00:00Z' });
    assert.match(await designReviewBlocker({ site: true }), /files changed/);
    await save({});
    await writeFile('artifacts/site/laptop/02-scope.png', 'scope');
    assert.match(await designReviewBlocker({ site: true }), /every proposal section/);
  } finally { process.chdir(prior); await rm(root, { recursive: true, force: true }); }
});
