import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { campaignProblems, copyProblems } from '../bin/social/campaign.mjs';
import { loadRegistry } from '../bin/social/registry.mjs';
import { socialEngineProblem } from '../bin/social/version.mjs';

const example = JSON.parse(readFileSync(new URL('../social-kit/campaign.json', import.meta.url), 'utf8'));
const { formats } = loadRegistry();

test('the example campaign is clean', () => {
  assert.deepEqual(campaignProblems(example), []);
  assert.ok(existsSync(new URL(`../social-kit/moments/${example.angles.A.moment}.js`, import.meta.url)), 'the example moment ships with the kit');
  assert.deepEqual(copyProblems(example, formats).problems, []);
});

test('banned phrases are caught wherever they appear', () => {
  const c = structuredClone(example);
  c.angles.A.sub = 'A seamless way to sell.';
  assert.ok(campaignProblems(c).some((p) => /angle A\.sub: uses "seamless"/.test(p)));
});

test('copy over a platform limit fails with the format that sets the limit', () => {
  const c = structuredClone(example);
  c.copy = { 'facebook.ad.reels.*': { ad: { A: { primary: 'x'.repeat(41) } } } };
  const { problems } = copyProblems(c, formats);
  assert.ok(problems.some((p) => /41\/40 characters/.test(p)), problems.join('\n'));
});

test('Instagram captions over five hashtags fail', () => {
  const c = structuredClone(example);
  c.copy = { instagram: { organic: { A: { primary: 'Point. #a #b #c #d #e #f' } } } };
  assert.ok(copyProblems(c, formats).problems.some((p) => /6 hashtags; instagram allows 5/.test(p)));
});

test('unknown fields and platforms are named, not ignored', () => {
  const c = structuredClone(example);
  c.copy = { linkedn: { ad: { A: { primary: 'hi' } } }, linkedin: { ad: { A: { tagline: 'hi' } } } };
  const { problems } = copyProblems(c, formats);
  assert.ok(problems.some((p) => /no text limits for linkedn/.test(p)));
  assert.ok(problems.some((p) => /no "tagline" field/.test(p)));
});

test('angles need the copy every format size uses', () => {
  const c = structuredClone(example);
  delete c.angles.A.micro;
  assert.ok(campaignProblems(c).some((p) => /missing "micro"/.test(p)));
});

test('engine pins', () => {
  assert.equal(socialEngineProblem('social@1.0'), null);
  assert.match(socialEngineProblem('social@2.0'), /2\.x/);
  assert.match(socialEngineProblem('social@1.9'), /newer/);
  assert.match(socialEngineProblem('sites@1.0'), /should look like/);
});
