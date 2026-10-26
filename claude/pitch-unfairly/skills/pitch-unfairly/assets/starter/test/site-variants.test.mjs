// A production site's toolbox components are variants, locked at the engine version it went
// live on: the live toolbox can change under it without moving it, until one variant is upgraded.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scaffold } from '../bin/site-new.mjs';
import { buildSite } from '../bin/site-build.mjs';
import { lock, usedComponents } from '../bin/site-variants.mjs';
import { ownerOf, readManifest, sliceToolbox } from '../bin/site/variants.mjs';
import { ENGINE } from '../bin/site/version.mjs';

const CLI = fileURLToPath(new URL('../bin/site-variants.mjs', import.meta.url));
const BRAND = { schema: 'brand-kit@1', identity: { name: 'Northline' }, palette: { paper: '#ffffff', ink: '#1d1d1d', accent: '#2f5bd3', surface: '#f3f5fb', night: '#14203d' }, typography: { display: { family: 'Georgia', source: 'system', fallback: 'serif' }, body: { family: 'Arial', source: 'system' } } };
async function site(template = 'proposal') {
  const root = await mkdtemp(join(tmpdir(), 'variants-'));
  await mkdir(join(root, 'brand'), { recursive: true });
  await writeFile(join(root, 'brand/brand.json'), JSON.stringify(BRAND));
  scaffold(root, template);
  return root;
}
const page = async (root) => { await buildSite({ root }); return readFile(join(root, 'dist-site/index.html'), 'utf8'); };
// A newer toolbox in which the scope's columns change.
const newer = (css) => css.replace(/\.tb-scope-col \{ padding: 28px;/, '.tb-scope-col { letter-spacing: .2em; padding: 28px;');

test('ACCEPTANCE: locking takes exactly the components the site uses, at this engine, and the build reads them', async () => {
  const root = await site();
  const used = usedComponents(root);
  for (const c of ['hero', 'glance', 'scope', 'close', 'price']) assert.ok(used.includes(c), c);
  assert.ok(!used.includes('calculator') && !used.includes('base'));
  const done = lock(root);
  assert.deepEqual(done, ['base', ...used]);
  const m = readManifest(join(root, 'site/variants'));
  assert.deepEqual(Object.keys(m.components), ['base', ...used]);
  for (const v of Object.values(m.components)) assert.equal(v.from, ENGINE);
  const html = await page(root);
  assert.match(html, /Variant of the sites toolbox "scope" component, locked from engine/);
  assert.doesNotMatch(html, /\.tb-calc \{/, 'only what the site uses ships');
});

test('ACCEPTANCE: once locked, a newer toolbox in the project changes nothing until that one variant is upgraded, and the skin survives', async () => {
  const root = await site();
  lock(root);
  const skin = '.tb-scope-col { color: var(--accent); }\n';
  await appendFile(join(root, 'site/variants/scope.css'), skin);
  const before = await page(root);
  const toolbox = join(root, 'site/toolbox.css');
  await writeFile(toolbox, newer(await readFile(toolbox, 'utf8')));
  assert.equal(await page(root), before, 'the live toolbox no longer reaches the page');
  const status = JSON.parse(execFileSync('node', [CLI, 'status', '--json', toolbox], { cwd: root, encoding: 'utf8' }).trim());
  assert.deepEqual(Object.entries(status.components).filter(([, v]) => v.changed).map(([k]) => k), ['scope']);
  assert.deepEqual(Object.keys(status.components.scope).sort(), ['changed', 'current', 'from', 'upstream']);
  const cards = await readFile(join(root, 'site/variants/cards.css'), 'utf8');
  execFileSync('node', [CLI, 'upgrade', 'scope', toolbox], { cwd: root });
  const scope = await readFile(join(root, 'site/variants/scope.css'), 'utf8');
  assert.match(scope, /letter-spacing: \.2em; padding: 28px/);
  assert.ok(scope.endsWith(skin), 'the site\'s skin is kept');
  assert.equal(await readFile(join(root, 'site/variants/cards.css'), 'utf8'), cards, 'the other variants stay locked');
  assert.match(await page(root), /letter-spacing: \.2em; padding: 28px/);
});

test('a site that was never locked keeps building from the live toolbox', async () => {
  const root = await site();
  assert.ok(!existsSync(join(root, 'site/variants')));
  assert.match(await page(root), /\.tb-hero \{/);
});

test('each class lands in its component: look-alike names stay where they belong', () => {
  assert.equal(ownerOf('.tb-table thead th'), 'base', 'tables are not tabs');
  assert.equal(ownerOf('.tb-tab.is-on::after'), 'tabs');
  assert.equal(ownerOf('.tb-step-b:hover'), 'price', 'the stepper button is the price, not the timeline');
  assert.equal(ownerOf('.tb-step.is-now'), 'timeline');
  const slices = sliceToolbox('.tb-hero-grid, .tb-faq { display: grid; }\n@media (max-width: 720px) { .tb-faq { gap: 0; } }');
  assert.equal(slices.hero.trim(), '.tb-hero-grid { display: grid; }');
  assert.match(slices.faq, /\.tb-faq \{ display: grid; \}\n@media \(max-width: 720px\) \{\n {2}\.tb-faq \{ gap: 0; \}\n\}/);
});
