// The copy lock: source sentences both ways, source typos kept and listed,
// a page that "fixes" the source caught as a change, and {{?…}} placeholders
// failing a production build while a draft only lists them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { checkPage, htmlSegments, jsonSegments, lockErrors, sourceSentences, sourceTypos } from '../bin/site/copy-lock.mjs';

const STARTER = resolve(import.meta.dirname, '..');
const SOURCE = `Title Tag: Teeth Cleanings | Example Dental
[Hero Header] Teeth Cleanings
Regular cleanings keep teeth and gums healthy. Book a visit twice a year.
[Clinic widget] Call (303) 555-0100 to schedule.
What to expect
A student dentist cleans your teeth under faculty supervision. See teh dentist the the same day if it hurts.`;

const page = (over = {}) => ({
  slug: 'cleanings',
  title: 'Teeth Cleanings | Example Dental',
  h1: 'Teeth Cleanings',
  intro: ['Regular cleanings keep teeth and gums healthy. Book a visit twice a year.'],
  blocks: [{ type: 'prose', heading: 'What to expect', paragraphs: ['A student dentist cleans your teeth under faculty supervision. See teh dentist the the same day if it hurts.'] }],
  info: { phone: 'Call (303) 555-0100 to schedule.' },
  ...over,
});

test('copy that matches its draft both ways is clean, with a sidebar out of order and annotations dropped', () => {
  const res = checkPage(SOURCE, jsonSegments(page({ info: undefined, blocks: page().blocks, sidebar: undefined })).concat(jsonSegments({ info: page().info })), {});
  assert.deepEqual(lockErrors(res), []);
  assert.equal(res.counts.sidebar, 1, 'the widget copy may sit anywhere');
  assert.ok(!sourceSentences(SOURCE).some((s) => /Hero Header|Title Tag/.test(s.text)), 'editor annotations are not copy');
});

test('both directions: a dropped sentence, one out of order, and an added line each fail', () => {
  const dropped = page({ intro: ['Regular cleanings keep teeth and gums healthy.'] });
  assert.ok(lockErrors(checkPage(SOURCE, jsonSegments(dropped))).some((e) => /^MISSING .*twice a year/.test(e)));
  const reordered = page({ h1: 'Teeth Cleanings', intro: [], blocks: [...page().blocks, { type: 'prose', paragraphs: ['Regular cleanings keep teeth and gums healthy. Book a visit twice a year.'] }] });
  assert.ok(lockErrors(checkPage(SOURCE, jsonSegments(reordered))).some((e) => /^ORDER /.test(e)));
  const added = page({ blocks: [...page().blocks, { type: 'cta', heading: 'Unlock a brighter smile today' }] });
  assert.ok(lockErrors(checkPage(SOURCE, jsonSegments(added))).some((e) => /^EXTRA .*Unlock a brighter smile/.test(e)));
});

test('a source typo is kept and listed; a page that fixes it in silence fails as a change', () => {
  const typos = sourceTypos(sourceSentences(SOURCE));
  assert.equal(typos.length, 1);
  assert.match(typos[0].why.join(' '), /"the the" repeats a word/);
  assert.match(typos[0].why.join(' '), /"teh" \(usually "the"\)/);
  const fixed = page({ blocks: [{ type: 'prose', heading: 'What to expect', paragraphs: ['A student dentist cleans your teeth under faculty supervision. See the dentist the same day if it hurts.'] }] });
  const res = checkPage(SOURCE, jsonSegments(fixed));
  assert.equal(res.changed.length, 1);
  assert.equal(res.missing.length, 0, 'reported once, as a change, not as missing plus extra');
  assert.equal(res.extra.length, 0);
  assert.match(lockErrors(res)[0], /^CHANGED .*the source says "See teh dentist the the same day.*Keep the source's words/);
});

test('{{?…}} placeholders fail a production build and are only listed in a draft', () => {
  const held = page({ blocks: [...page().blocks, { type: 'prose', paragraphs: ['{{?CONFIRM HOURS}}'] }] });
  const src = `${SOURCE}\n[CONFIRM HOURS]`;
  const res = checkPage(src, jsonSegments(held));
  assert.equal(res.placeholders.length, 1);
  assert.ok(lockErrors(res).some((e) => /^PLACEHOLDER .*CONFIRM HOURS.*production/.test(e)));
  assert.deepEqual(lockErrors(res, { draft: true }), []);
});

test('a design label joins the copy only when it is itself a source sentence; removed text agreed with the client is not missing', () => {
  const labelled = page({ eyebrow: 'Preventive care' });
  assert.deepEqual(lockErrors(checkPage(SOURCE, jsonSegments(labelled))), [], 'an eyebrow that is not copy is ignored');
  const dropped = page({ intro: ['Regular cleanings keep teeth and gums healthy.'] });
  assert.deepEqual(lockErrors(checkPage(SOURCE, jsonSegments(dropped), { removed: ['Book a visit twice a year.'] })), []);
});

test('HTML copy: the text of each block, entities decoded, scripts and comments skipped', () => {
  const segs = htmlSegments('<section><h1>Teeth Cleanings</h1><!-- note --><p>Regular cleanings keep teeth &amp; gums healthy.</p><script>var x = "Not copy."</script><ul><li>Twice a year</li></ul></section>');
  assert.deepEqual(segs.map((s) => s.text), ['Teeth Cleanings', 'Regular cleanings keep teeth & gums healthy.', 'Twice a year']);
});

test('site:copy-lock reads its config, writes the report and the to-confirm list, and exits 1 on a production placeholder', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'copy-lock-'));
  await mkdir(join(dir, 'drafts'));
  await mkdir(join(dir, 'site', 'content'), { recursive: true });
  await writeFile(join(dir, 'drafts', 'Cleanings.txt'), `${SOURCE}\n[CONFIRM HOURS]`);
  await writeFile(join(dir, 'site', 'content', 'cleanings.json'), JSON.stringify(page({ blocks: [...page().blocks, { type: 'prose', paragraphs: ['{{?CONFIRM HOURS}}'] }] })));
  await writeFile(join(dir, 'site', 'copy-lock.json'), JSON.stringify({ schema: 'copy-lock@1', sources: '../drafts', copy: 'content', pages: [{ source: 'Cleanings.txt', copy: 'cleanings.json' }] }));
  const run = (...args) => spawnSync(process.execPath, [join(STARTER, 'bin/site-copy-lock.mjs'), ...args], { cwd: dir, encoding: 'utf8' });
  const prod = run();
  assert.equal(prod.status, 1, prod.stdout + prod.stderr);
  assert.match(prod.stderr, /PLACEHOLDER/);
  const draft = run('--draft');
  assert.equal(draft.status, 0, draft.stderr);
  const list = await readFile(join(dir, 'artifacts', 'copy-lock', 'to-confirm.md'), 'utf8');
  assert.match(list, /"the the" repeats a word/);
  assert.match(list, /open question "CONFIRM HOURS"/);
  // A typo the client confirmed drops off the list.
  const cfg = JSON.parse(await readFile(join(dir, 'site', 'copy-lock.json'), 'utf8'));
  cfg.confirmed = ['See teh dentist the the same day if it hurts.'];
  await writeFile(join(dir, 'site', 'copy-lock.json'), JSON.stringify(cfg));
  run('--draft');
  assert.doesNotMatch(await readFile(join(dir, 'artifacts', 'copy-lock', 'to-confirm.md'), 'utf8'), /repeats a word/);
});
