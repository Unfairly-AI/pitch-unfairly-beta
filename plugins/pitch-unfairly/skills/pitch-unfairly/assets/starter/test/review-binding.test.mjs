// A page's design review is bound to one build: review-files -- --site --deck <slug> writes
// the deck and files deck_review sends, the hash is the deck host's manifestHash, upload
// refuses a build the review wasn't bound to, and a draft goes to the preview without one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { digestFromFiles, manifestHash } from '../bin/site/gate.mjs';

const STARTER = resolve(import.meta.dirname, '..');

test('the build hash is the deck host\'s manifestHash: sorted "path\\0sha256" lines joined by newlines', () => {
  const files = [
    { path: 'index.html', size: 10, sha256: 'AB'.repeat(32) },
    { path: 'assets/a.png', size: 5, sha256: 'cd'.repeat(32) },
  ];
  // unfairly-app src/lib/deck-host/review-verify.ts, manifestHash, verbatim.
  const host = (fs) => createHash('sha256').update(fs.map((f) => `${f.path}\0${String(f.sha256).toLowerCase()}`).sort().join('\n')).digest('hex');
  assert.equal(manifestHash(files), host(files));
  assert.equal(digestFromFiles([...files].reverse()), host(files), 'order of the list does not matter');
  assert.equal(manifestHash(files), 'ba976b638bb42deda533ba4088f2372899446751296f8321b20aa770544ed826', 'pinned, so a change on either side shows');
});

async function project() {
  const dir = await mkdtemp(join(tmpdir(), 'review-binding-'));
  await mkdir(join(dir, 'dist-site'), { recursive: true });
  await mkdir(join(dir, 'artifacts'), { recursive: true });
  await writeFile(join(dir, 'dist-site', 'index.html'), '<!doctype html><title>Page</title><h1>Page</h1>');
  return dir;
}
const inProject = (dir, code) => spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: dir, encoding: 'utf8' });

test('reviewBinding gives deck_review its deck and files; a different build or no binding is refused, a draft is not', async () => {
  const dir = await project();
  const mod = JSON.stringify(join(STARTER, 'bin/design-review.mjs'));
  const run = (body) => {
    const r = inProject(dir, `const m = await import(${mod}); ${body}`);
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  assert.match(run(`console.log(await m.reviewBindingProblem('dist-site'))`), /no review binding/);
  assert.equal(run(`console.log(await m.reviewBindingProblem('dist-site', { draft: true }))`), 'null');
  run(`const { writeFile } = await import('node:fs/promises'); await writeFile(m.REVIEW_BINDING, JSON.stringify(await m.reviewBinding('dist-site', ' CU-Dental ')))`);
  const binding = JSON.parse(run(`console.log(JSON.stringify(await m.reviewBinding('dist-site', ' CU-Dental ')))`));
  assert.equal(binding.deck, 'cu-dental', 'the slug as the host normalises it');
  assert.deepEqual(binding.files.map((f) => Object.keys(f).sort()), [['path', 'sha256', 'size']], 'files as deck_upload_start takes them');
  assert.equal(run(`console.log(await m.reviewBindingProblem('dist-site'))`), 'null');
  await writeFile(join(dir, 'dist-site', 'index.html'), '<!doctype html><title>Page</title><h1>Changed after review</h1>');
  assert.match(run(`console.log(await m.reviewBindingProblem('dist-site'))`), /bound to another build/);
});

test('upload: a site the host staged as a draft publishes to its preview without a review; without draft it needs one', async () => {
  const dir = await project();
  await mkdir(join(dir, 'site', 'sections'), { recursive: true });
  await writeFile(join(dir, 'site', 'site.json'), JSON.stringify({ title: 'Page', engine: 'sites@1.15' }));
  // A clean audit stamp for this exact source and build (what site:audit writes).
  const stamp = inProject(dir, `
    const { siteFingerprint } = await import(${JSON.stringify(join(STARTER, 'bin/site-audit.mjs'))});
    const { distDigest, GATE } = await import(${JSON.stringify(join(STARTER, 'bin/site/gate.mjs'))});
    const { writeFile } = await import('node:fs/promises');
    await writeFile('artifacts/site-audit-pass.json', JSON.stringify({ fingerprint: await siteFingerprint(), gate: { gate: GATE, clean: true, dist_digest: await distDigest('dist-site') } }));`);
  assert.equal(stamp.status, 0, stamp.stderr);
  const upload = () => spawnSync(process.execPath, [join(STARTER, 'bin/upload.mjs'), 'artifacts/uploads.json', 'dist-site'], { cwd: dir, encoding: 'utf8' });
  await writeFile(join(dir, 'artifacts', 'uploads.json'), JSON.stringify({ draft: true, uploads: [] }));
  const draft = upload();
  assert.equal(draft.status, 0, draft.stderr);
  assert.match(draft.stdout, /Uploaded 0 files/);
  await writeFile(join(dir, 'artifacts', 'uploads.json'), JSON.stringify({ uploads: [], review_verified: true }));
  const live = upload();
  assert.notEqual(live.status, 0);
  assert.match(live.stderr, /no design review/);
});
