import { test as nodeTest } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseStory, checkStory } from '../bin/story-check.mjs';

// The library lives in the plugin repo's guide/ (served by deck_guide); a deck
// copied out of the repo doesn't carry it, so these tests only run inside the repo.
const library = await readFile(new URL('../../../../../../../guide/templates.json', import.meta.url), 'utf8').then(JSON.parse, () => null);
const test = library ? nodeTest : nodeTest.skip;

const story = (slides, header = {}) => {
  const h = {
    Kernel: 'decks as websites',
    Audience: 'seed investors',
    'After the last slide they should': 'take the meeting',
    Format: 'sent, then presented',
    Template: 'airbnb',
    Angle: 'people already do this the hard way',
    ...header,
  };
  return [
    '# Test deck',
    ...Object.entries(h).filter(([, v]) => v !== null).map(([k, v]) => `${k}: ${v}`),
    '',
    ...slides.flatMap((s, i) => [`## ${String(i + 1).padStart(2, '0')} slide`, ...Object.entries(s).map(([k, v]) => `- ${k}: ${v}`), '']),
  ].join('\n');
};

const good = [
  { Beat: 'One-line promise', Job: 'make the promise', Headline: 'Book rooms with locals, not hotels.', Proof: 'three listing cards' },
  { Beat: 'Problem', Job: 'show the pain', Headline: 'Hotels cost a fortune and show you nothing.', Proof: 'a $282 receipt', Source: 'example' },
];

test('a sound story has no errors', () => {
  const { errors, template } = checkStory(parseStory(story(good)), library);
  assert.deepEqual(errors, []);
  assert.equal(template.id, 'airbnb');
});

test('topic-label headlines are errors', () => {
  const { errors } = checkStory(parseStory(story([...good, { Beat: 'Team', Job: 'introduce us', Headline: 'Team', Proof: 'three faces' }])), library);
  assert.ok(errors.some((e) => e.includes('topic label')));
});

test('a slide without proof is an error', () => {
  const { errors } = checkStory(parseStory(story([...good, { Job: 'say more', Headline: 'We are going to be very big.' }])), library);
  assert.ok(errors.some((e) => e.includes('"Proof:"')));
});

test('the header must name a template from the library', () => {
  const missing = checkStory(parseStory(story(good, { Template: null })), library);
  assert.ok(missing.errors.some((e) => e.includes('Template')));
  const unknown = checkStory(parseStory(story(good, { Template: 'not-a-template' })), library);
  assert.ok(unknown.errors.some((e) => e.includes('not in the library')));
});

test('uncovered template beats and unsourced numbers are warnings', () => {
  const { warnings, errors } = checkStory(parseStory(story([{ ...good[0] }, { ...good[1], Source: undefined, Proof: '630,000 members' }].map((s) => Object.fromEntries(Object.entries(s).filter(([, v]) => v))))), library);
  assert.deepEqual(errors, []);
  assert.ok(warnings.some((w) => w.startsWith('Template airbnb')));
  assert.ok(warnings.some((w) => w.includes('no "Source:"')));
});

test('every library template has beats and a known category', () => {
  const ids = new Set(library.categories.map((c) => c.id));
  for (const t of library.templates) {
    assert.ok(t.beats.length >= 5, t.id);
    assert.ok(ids.has(t.category), t.id);
  }
});

