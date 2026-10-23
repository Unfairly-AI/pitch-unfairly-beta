import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseStory, checkStory, compareStories, checkBuyers, hasCalendarDate } from '../bin/story-check.mjs';

const exampleUrl = new URL('../story-site.example.md', import.meta.url);
const example = await readFile(exampleUrl, 'utf8');
const check = (text, options) => checkStory(parseStory(text), null, options);
/** The example with one line replaced (or removed, with ''). */
const edit = (find, replace) => {
  assert.ok(example.includes(find), `example contains ${find}`);
  return example.replace(find, replace);
};

const buyers = {
  lexicon: [
    { phrase: 're-planning routes every morning', source: 'https://tidewater-routing.example/stories/northfield' },
    { phrase: 'dwell time', source: 'https://tidewater-routing.example/stories/harbor-dairy' },
    { phrase: 'fleet lease renewal', source: 'https://tidewater-routing.example/blog/lease' },
    { phrase: "drivers won't learn another app", source: 'https://tidewater-routing.example/faq' },
    { phrase: 'a new depot', source: 'https://tidewater-routing.example/pilot' },
  ],
  roles: ['VP of Operations'],
  triggers: ['fleet lease renewal'],
  objections: ["drivers won't learn another app"],
};

test('ACCEPTANCE: the example site plan passes with no errors or warnings', () => {
  const story = parseStory(example);
  assert.equal(story.format, 'site');
  const { errors, warnings, mode } = checkStory(story, null, { buyers });
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
  assert.equal(mode, 'lead');
});

test('site parsing collects repeated keys as lists and keeps fields as the last value', () => {
  const story = parseStory(example);
  assert.equal(story.lists.commitment.length, 3);
  assert.equal(story.lists.objection.length, 5);
  assert.equal(typeof story.header.commitment, 'string');
  assert.equal(story.header['scenario 2'].startsWith('a fleet manager'), true);
  assert.equal(story.sections, story.slides);
  const twoProofs = parseStory(edit('- Proof: dispatch-survey, northfield-quote', '- Proof: dispatch-survey\n- Proof: northfield-quote'));
  assert.deepEqual(twoProofs.slides[1].lists.proof, ['dispatch-survey', 'northfield-quote']);
  assert.equal(twoProofs.slides[1].fields.proof, 'northfield-quote');
});

test('deck stories keep their shape: no digits in keys, format deck', () => {
  const deck = parseStory('# D\nFormat: sent\nQ3 2024: revenue\n## 01 cover\n- Job: x\n');
  assert.equal(deck.format, 'deck');
  assert.deepEqual(deck.header, { format: 'sent' });
  assert.deepEqual(deck.slides[0].fields, { job: 'x' });
});

test('ACCEPTANCE: a section with no proof fails', () => {
  const { errors } = check(edit('- Proof: driver-app-compat\n', ''));
  assert.ok(errors.some((e) => e.startsWith('Section 05') && e.includes('"Proof:"')), errors.join('\n'));
});

test('the first section may go without proof', () => {
  const { errors } = check(example);
  assert.ok(!errors.some((e) => e.startsWith('Section 01')));
});

test('ACCEPTANCE: a plan with no Decision fails', () => {
  const { errors } = check(edit(/^Decision: .*\n/m.exec(example)[0], ''));
  assert.ok(errors.some((e) => e.includes('"Decision: ..."')), errors.join('\n'));
});

test('every required header field is enforced', () => {
  for (const key of ['Audience', 'Decider', 'Motion', 'Stage', 'Next step', 'Commits them to', 'Prerequisites', 'Angle', 'Showpiece', 'Chosen']) {
    const line = new RegExp(`^${key}: .*\\n`, 'm').exec(example)[0];
    const { errors } = check(example.replace(line, ''));
    assert.ok(errors.some((e) => e.includes(`"${key}: ..."`)), key);
  }
});

test('the motion must be a real sales motion', () => {
  assert.ok(check(edit('Motion: consultative', 'Motion: enterprise')).errors.some((e) => e.includes("isn't a sales motion")));
  assert.deepEqual(check(edit('Motion: consultative', 'Motion: self serve')).errors, []);
});

test('fewer than three scenarios fails; near-duplicate scenarios warn', () => {
  const two = check(edit(/^Scenario 3: .*\n/m.exec(example)[0], ''));
  assert.ok(two.errors.some((e) => e.includes('2 scenarios')));
  const dup = check(edit(/^Scenario 2: .*\n/m.exec(example)[0], 'Scenario 2: the VP of Operations at a regional distributor decides whether to pilot route planning on three depots before the fleet lease renews\n'));
  assert.ok(dup.warnings.some((w) => w.includes('scenarios 1 and 2')), dup.warnings.join('\n'));
});

test('ACCEPTANCE: a commitment with no kind fails', () => {
  const { errors } = check(edit('| kind: sourced | source: pilot-terms', '| source: pilot-terms'));
  assert.ok(errors.some((e) => e.includes('the pilot covers up to two depots') && e.includes('kind:')), errors.join('\n'));
});

test('ACCEPTANCE: a commitment of kind unknown fails', () => {
  const { errors } = check(edit('Cut: a feature tour', 'Commitment: pilot length | kind: unknown\nCut: a feature tour'));
  assert.ok(errors.some((e) => e.includes('pilot length') && e.includes("unknown can't go on the page")), errors.join('\n'));
});

test('sourced and supplied commitments need a source; proposed calendar dates warn', () => {
  const unsourced = check(edit('| kind: sourced | source: pilot-terms', '| kind: supplied'));
  assert.ok(unsourced.errors.some((e) => e.includes('a supplied commitment needs')));
  const dated = check(edit('the pilot starts after IT\'s security review and the stop-data export', 'the pilot starts on November 18'));
  assert.deepEqual(dated.errors, []);
  assert.ok(dated.warnings.some((w) => w.includes('calendar date')));
  assert.ok(hasCalendarDate('Dec 7 rollout') && hasCalendarDate('2026-11-02') && hasCalendarDate('portfolio in January'));
  assert.ok(!hasCalendarDate('after the security review') && !hasCalendarDate('may need approval') && !hasCalendarDate('within 30 days'));
});

test('an assumption needs a valid value type', () => {
  assert.ok(check(edit('| type: time |', '|')).errors.some((e) => e.includes('add "| type:')));
  assert.ok(check(edit('| type: time |', '| type: dollars |')).errors.some((e) => e.includes('type "dollars"')));
});

test('objections must point at a real section, and two or more are expected', () => {
  const missing = check(edit('| answered in: 05', '| answered in: 12'));
  assert.ok(missing.errors.some((e) => e.includes("there's no section 12")));
  const few = check(example.replace(/^Objection: .*\n/gm, '').replace('Cut: a glance', 'Objection: price | answered in: 07\nCut: a glance'));
  assert.ok(few.warnings.some((w) => w.startsWith('1 objection.')));
});

test('a plan with nothing cut warns', () => {
  const { warnings } = check(example.replace(/^Cut: .*\n/gm, ''));
  assert.ok(warnings.some((w) => w.includes('Nothing cut')));
});

test('ACCEPTANCE: an interactive section without Prints fails', () => {
  const { errors } = check(edit(/^- Prints: .*\n/m.exec(example)[0], ''));
  assert.ok(errors.some((e) => e.startsWith('Section 03') && e.includes('"Prints:"')), errors.join('\n'));
});

test('Prints that tells the reader to move a slider fails; a unit-free showpiece warns', () => {
  const prints = check(edit(/^- Prints: .*\n/m.exec(example)[0], '- Prints: move the slider to see your hours\n'));
  assert.ok(prints.errors.some((e) => e.includes('is an instruction')));
  const unit = check(edit(/^Showpiece: .*\n/m.exec(example)[0], 'Showpiece: a savings model\n'));
  assert.ok(unit.warnings.some((w) => w.includes('names a tool, not its unit')));
});

test('ACCEPTANCE: an invitation headline is an error in lead mode and a warning otherwise', () => {
  const garner = 'Explore provider guidance alongside your existing health plan.';
  const hero = edit("- Headline: Marlow's two busiest depots can test route planning before the lease renews.", `- Headline: ${garner}`);
  const lead = check(hero);
  assert.ok(lead.errors.some((e) => e.startsWith('Section 01') && e.includes('invites instead of claiming')), lead.errors.join('\n'));
  const user = check(hero.replace('Mode: lead', 'Mode: user'));
  assert.ok(!user.errors.some((e) => e.includes('invites instead of claiming')));
  assert.ok(user.warnings.some((w) => w.startsWith('Section 01') && w.includes('invites instead of claiming')));
  for (const opener of ['Discover', 'Learn how', 'See how', 'Consider', 'Imagine', 'Find out how', 'Unlock', 'Meet', 'Introducing', 'Welcome to']) {
    const later = check(edit('- Headline: Drivers keep their handhelds and only the stop order changes.', `- Headline: ${opener} the handhelds drivers already carry.`));
    assert.ok(later.errors.some((e) => e.startsWith('Section 05') && e.includes('invites')), opener);
  }
  assert.ok(!check(edit('- Headline: Drivers keep their handhelds and only the stop order changes.', '- Headline: Seeing the route order early saves drivers a call.')).errors.some((e) => e.includes('invites')), 'a claim that merely starts with "Seeing" is fine');
});

test('a showpiece that names only one input warns', () => {
  const one = check(edit(/^Showpiece: .*\n/m.exec(example)[0], 'Showpiece: a model of weekly driver hours from stops per route\n'));
  assert.ok(one.warnings.some((w) => w.includes('names only one input') && w.includes('two controls')));
  for (const ok of ['a model of weekly driver hours from stops per route and dwell time', 'a model of driver hours with depot presets', 'a model of driver hours, by depot', 'driver hours from three inputs', 'a choice of depots']) {
    const r = check(edit(/^Showpiece: .*\n/m.exec(example)[0], `Showpiece: ${ok}\n`));
    assert.ok(!r.warnings.some((w) => w.includes('names only one input')), ok);
  }
});

test("the page's next step is never Unfairly's", () => {
  assert.ok(check(edit(/^Next step: .*\n/m.exec(example)[0], 'Next step: book a demo with Unfairly\n')).errors.some((e) => e.includes("Unfairly's CTA")));
});

test('ACCEPTANCE: two near-identical plans trip compareStories; different plans do not', () => {
  const twin = example
    .replaceAll('Marlow', 'Brackley')
    .replaceAll('Northfield', 'Eastgate')
    .replace('two busiest depots', 'three largest depots');
  const same = compareStories(example, twin);
  assert.ok(same.order > 0.6 && same.score > 0.6, JSON.stringify(same));
  const different = [
    '# Other', 'Format: site',
    '## 01 hero', '- Job: name the hospital formulary decision', '- Headline: Saint Ives can review the cleaning wipes before the contract renews.',
    '## 02 compatibility', '- Job: show which surfaces the wipe is cleared for', '- Headline: The wipe is cleared for every surface in the cath lab.', '- Proof: epa-list',
    '## 03 contract', '- Job: explain the group purchasing contract', '- Headline: The current GPO contract already covers this product line.', '- Proof: gpo-terms',
  ].join('\n');
  const apart = compareStories(example, different);
  assert.ok(apart.order <= 0.6, JSON.stringify(apart));
  const { warnings } = check(example, { others: [{ name: 'brackley/story.md', story: parseStory(twin) }, { name: 'other/story.md', story: parseStory(different) }] });
  assert.ok(warnings.some((w) => w.startsWith('Sameness (rule 9)') && w.includes('brackley')));
  assert.ok(!warnings.some((w) => w.includes('other/story.md')));
});

test('ACCEPTANCE: a lexicon entry without a source fails, and an unlisted buyer phrase warns', () => {
  const bad = { ...buyers, lexicon: [...buyers.lexicon, { phrase: 'route chaos' }, 'just a string'] };
  assert.equal(checkBuyers(bad).errors.length, 2);
  const { errors } = check(example, { buyers: bad });
  assert.ok(errors.some((e) => e.includes('"route chaos"') && e.includes('add "source"')));
  const short = { lexicon: buyers.lexicon.slice(0, 2) };
  const { warnings } = check(example, { buyers: short });
  assert.ok(warnings.some((w) => w.startsWith('Section 01') && w.includes("isn't in buyers.json")));
  assert.ok(!warnings.some((w) => w.startsWith('Section 03') && w.includes("isn't in buyers.json")), 'dwell time is in the lexicon');
});

test('the CLI: lead plans build without an approval stop; --against reads <dir>/*/story.md and */project/story.md', async () => {
  const run = promisify(execFile);
  const bin = fileURLToPath(new URL('../bin/story-check.mjs', import.meta.url));
  const dir = await mkdtemp(join(tmpdir(), 'story-site-'));
  try {
    await mkdir(join(dir, 'marlow', 'project'), { recursive: true });
    await mkdir(join(dir, 'brackley', 'project'), { recursive: true });
    await mkdir(join(dir, 'eastgate'), { recursive: true });
    const self = join(dir, 'marlow', 'project', 'story.md');
    await writeFile(self, example);
    await writeFile(join(dir, 'marlow', 'project', 'buyers.json'), JSON.stringify(buyers));
    await writeFile(join(dir, 'brackley', 'project', 'story.md'), example.replaceAll('Marlow', 'Brackley'));
    await writeFile(join(dir, 'eastgate', 'story.md'), example.replaceAll('Marlow', 'Eastgate'));
    const { stdout } = await run(process.execPath, [bin, '--against', dir, self]);
    assert.match(stdout, /compared with 2 other plans/);
    assert.match(stdout, /Sameness \(rule 9\).*brackley/);
    assert.match(stdout, /Sameness \(rule 9\).*eastgate/);
    assert.match(stdout, /Plan holds\. Build from it\./);
    assert.doesNotMatch(stdout, /Show the outline/);
    const user = join(dir, 'eastgate', 'story.md');
    await writeFile(user, example.replace('Mode: lead', 'Mode: user'));
    const out = await run(process.execPath, [bin, '--buyers', join(dir, 'marlow', 'project', 'buyers.json'), user]);
    assert.match(out.stdout, /Plan holds\. Show the user/);
    await writeFile(user, example.replace(/^Decision: .*\n/m, ''));
    await assert.rejects(run(process.execPath, [bin, user]), (e) => e.code === 1 && /to fix before designing/.test(e.stdout));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
