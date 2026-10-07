import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pack, safeSourcePath, unpack } from '../bin/source.mjs';

async function project(files) {
  const root = await mkdtemp(join(tmpdir(), 'deck-src-'));
  for (const [path, body] of Object.entries(files)) {
    await mkdir(join(root, path, '..'), { recursive: true });
    await writeFile(join(root, path), body);
  }
  return root;
}

test("a deck's project round-trips: packed on one machine, unpacked on another", async () => {
  const a = await project({
    'story.md': '# Q3 board',
    'src/slides/01-cover.astro': '<h1>Q3</h1>',
    'src/brand/brand.css': ':root{}',
    'brand/brand.json': '{}',
    'brand/capture/home.png': 'x',
    'node_modules/x/index.js': 'nope',
  });
  const { bundle, skipped } = await pack(a);
  assert.deepEqual(bundle.files.map((f) => f.path).sort(), ['brand/brand.json', 'src/slides/01-cover.astro', 'story.md']);
  assert.deepEqual(skipped, []);

  // A fresh starter with its own example slides: they're replaced, not mixed in.
  const b = await project({ 'src/slides/01-cover.astro': 'starter', 'src/slides/02-example.astro': 'starter', 'src/pages/index.astro': 'keep' });
  assert.deepEqual(await unpack(bundle, b), { written: 3, refused: 0 });
  assert.deepEqual(await readdir(join(b, 'src', 'slides')), ['01-cover.astro']);
  assert.equal(await readFile(join(b, 'story.md'), 'utf8'), '# Q3 board');
  assert.equal(await readFile(join(b, 'src', 'pages', 'index.astro'), 'utf8'), 'keep');
});

test('a bundle cannot write outside the deck project', async () => {
  for (const bad of ['../etc/passwd', '/etc/passwd', 'src/../../x', 'package.json', 'bin/upload.mjs', 'src\\slides\\x', '']) {
    assert.equal(safeSourcePath(bad), false, bad);
  }
  assert.equal(safeSourcePath('public/logo.svg'), true);
  const root = await project({});
  const { written, refused } = await unpack({ files: [{ path: '../evil.txt', b64: 'eA==' }, { path: 'story.md', b64: 'eA==' }] }, root);
  assert.deepEqual({ written, refused }, { written: 1, refused: 1 });
});

test('oversized files are left out and named', async () => {
  const root = await project({ 'story.md': 'x', 'public/huge.mp4': Buffer.alloc(3 * 1024 * 1024 + 1) });
  const { bundle, skipped } = await pack(root);
  assert.deepEqual(bundle.files.map((f) => f.path), ['story.md']);
  assert.deepEqual(skipped, ['public/huge.mp4']);
});
