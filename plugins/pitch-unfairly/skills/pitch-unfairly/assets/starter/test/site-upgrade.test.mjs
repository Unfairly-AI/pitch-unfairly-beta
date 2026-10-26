import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { CURRENT_PIN, checkAgainstLatest } from '../bin/site/check.mjs';
import { ENGINE } from '../bin/site/version.mjs';
import { repin, upgradeSite } from '../bin/site-upgrade.mjs';

// Engine 1.11: a site pinned to an older engine can run the newest engine's checks without
// re-pinning (site:check -- --latest, site:audit -- --latest), and site:upgrade re-pins it,
// printing what newly blocks first.
const BIN = resolve(import.meta.dirname, '../bin');
const SITE_JSON = (engine) => `{\n  "title": "Northline for Harlow",\n  "engine": "${engine}",\n  "description": "A proposal.",\n  "facts": { "vendor": { "name": "Northline" } }\n}\n`;
async function project(engine = 'sites@1.10', body = '<p>A scenario, not an estimate.</p>') {
  const root = await mkdtemp(join(tmpdir(), 'site-upgrade-'));
  await mkdir(join(root, 'site/sections'), { recursive: true });
  await writeFile(join(root, 'site/site.json'), SITE_JSON(engine));
  await writeFile(join(root, 'site/sections/01-hero.html'), `<section id="hero" data-section="hero"><h1>Routes for Harlow.</h1>${body}</section>`);
  return root;
}
const run = (root, script, ...args) => spawnSync(process.execPath, [join(BIN, script), ...args], { cwd: root, encoding: 'utf8' });

test('the current pin is this engine\'s major.minor', () => {
  assert.equal(CURRENT_PIN, `sites@${ENGINE.split('.').slice(0, 2).join('.')}`);
});

test('ACCEPTANCE: site:check -- --latest blocks on the newest rules for an older pin and marks them new', async () => {
  const root = await project();
  try {
    const pinned = run(root, 'site-check.mjs');
    assert.equal(pinned.status, 0, pinned.stderr);
    assert.match(pinned.stdout, /! sections\/01-hero\.html: "A scenario, not an estimate\." is an "X, not Y" contrast line/);
    const latest = run(root, 'site-check.mjs', '--latest');
    assert.equal(latest.status, 1);
    assert.match(latest.stdout, new RegExp(`Checking against ${CURRENT_PIN.replace('.', '\\.')}, every rule blocking \\(this site is pinned sites@1\\.10\\)`));
    assert.match(latest.stderr, new RegExp(`✗ \\[new in ${CURRENT_PIN.replace('.', '\\.')}\\] sections/01-hero\\.html: "A scenario, not an estimate\\."`));
    assert.match(latest.stderr, /1 error\(s\), 1 of them new against the pin/);
    assert.match(await readFile(join(root, 'site/site.json'), 'utf8'), /"engine": "sites@1\.10"/, '--latest never re-pins');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('an error the pin already blocks is not marked new', async () => {
  const root = await project('sites@1.10', '<p>An em dash — here.</p>');
  try {
    const { loadSite } = await import('../bin/site-check.mjs');
    const r = checkAgainstLatest(await loadSite(root));
    assert.ok(r.latest.errors.some((e) => /em dash/.test(e)));
    assert.deepEqual(r.fresh, []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('ACCEPTANCE: site:upgrade prints what newly blocks as a dry run, and --write re-pins', async () => {
  const root = await project();
  try {
    const dry = run(root, 'site-upgrade.mjs');
    assert.equal(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, new RegExp(`Pinned sites@1\\.10; this engine is ${CURRENT_PIN.replace('.', '\\.')}\\.`));
    assert.match(dry.stdout, /these 1 finding\(s\) block[\s\S]*"A scenario, not an estimate\." is an "X, not Y" contrast line/);
    assert.match(dry.stdout, /Dry run: nothing changed\. Run `npm run site:upgrade -- --write`/);
    assert.equal(await readFile(join(root, 'site/site.json'), 'utf8'), SITE_JSON('sites@1.10'), 'a dry run changes nothing');
    const wrote = run(root, 'site-upgrade.mjs', '--write');
    assert.equal(wrote.status, 0, wrote.stderr);
    assert.match(wrote.stdout, new RegExp(`site\\.json now pins ${CURRENT_PIN.replace('.', '\\.')}\\. Fix the findings above`));
    assert.equal(await readFile(join(root, 'site/site.json'), 'utf8'), SITE_JSON(CURRENT_PIN), 'only the pin changes; the file keeps its layout');
    assert.match(run(root, 'site-upgrade.mjs').stdout, /already pinned/);
    assert.equal(run(root, 'site-check.mjs').status, 1, 'on the new pin the finding blocks');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('upgradeSite on a clean site reports nothing new; repin adds a pin to an unpinned site.json', async () => {
  const root = await project('sites@1.10', '<p>One plan by Monday.</p>');
  try {
    const r = await upgradeSite(root);
    assert.deepEqual(r.fresh, []);
    assert.equal(r.from, 'sites@1.10');
  } finally { await rm(root, { recursive: true, force: true }); }
  assert.deepEqual(JSON.parse(repin('{"title":"x"}')), { engine: CURRENT_PIN, title: 'x' });
});

test('the starter wires the commands', async () => {
  const pkg = JSON.parse(await readFile(resolve(import.meta.dirname, '../package.json'), 'utf8'));
  assert.equal(pkg.scripts['site:upgrade'], 'node bin/site-upgrade.mjs');
  assert.match(pkg.scripts['site:check'], /site-check\.mjs$/, 'npm run site:check -- --latest reaches the script');
  assert.match(pkg.scripts['site:audit'], /site-audit\.mjs$/, 'npm run site:audit -- --latest reaches the script');
});
