// node --test test/site-census.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseCsv, tierOf, analyzeCensus, miles, loadZips } from '../bin/site/census.mjs';

const zips = loadZips();
const csv = `Employee ID,Coverage Tier,Gender,Date of Hire,Home State,Home Zip,Medical Plan
1,EE,F,03/01/2026,VA,22209,Choice POS II
2,Employee + Spouse,M,2019-04-02,DC,20009,Choice POS II
3,FAM,F,1/5/2026,MD,20814,POS HSA
4,Waived,F,2020-01-01,VA,22201,
4,EC,F,2020-01-01,VA,22201,POS HSA
5,Waive,M,2018-06-01,PA,19103,
6,"E+CH",M,2025-02-02,CA,94110,POS HSA
`;

test('ACCEPTANCE: a broker census becomes the proposal facts, counted by code', () => {
  const sites = [{ name: 'Downtown DC', zip: '20036' }, { name: 'Your office', zip: '22209', home: true }];
  const { census, proximity, warnings } = analyzeCensus(parseCsv(csv), { year: 2026, region: ['DC', 'MD', 'VA'], sites, zips, sourceName: 'test.csv' });
  assert.equal(census.eligible, 6);
  assert.equal(census.enrolled, 5);
  assert.deepEqual(census.tiers, { employee: 1, spouse: 1, children: 2, family: 1 });
  assert.equal(census.women, 3);
  assert.equal(census.joined_this_year, 2);
  assert.deepEqual(census.in_region, { enrolled: 4, waived: 0 });
  assert.equal(census.states.other.enrolled, 1);
  assert.match(census.source, /1 duplicate row merged/);
  // The enrolled tiers add up to enrolled, as the checker requires.
  assert.equal(Object.values(census.tiers).reduce((a, b) => a + b), census.enrolled);
  const office = proximity.sites.find((s) => s.home);
  assert.deepEqual(office.within.length, 3);
  assert.ok(office.within[0] >= 1, 'the employee in 22209 lives within 3 miles of the office');
  assert.ok(office.within.every((n, i) => i === 0 || n >= office.within[i - 1]));
  assert.deepEqual(warnings, []);
});

test('tiers read the way brokers write them', () => {
  for (const [raw, want] of [['EE', 'employee'], ['Employee Only', 'employee'], ['ES', 'spouse'], ['EE+SP', 'spouse'], ['Employee + Child(ren)', 'children'], ['FAM', 'family'], ['Family', 'family'], ['Waived', 'waived'], ['', 'waived'], ['Declined', 'waived']]) {
    assert.equal(tierOf(raw), want, raw);
  }
  assert.equal(tierOf('Platinum'), null);
});

test('distances use real ZIP centroids', () => {
  const d = miles(zips.get('22209'), zips.get('20036'));
  assert.ok(d > 1.5 && d < 2.5, `Rosslyn to Dupont is about 1.8 miles, got ${d}`);
});

test('missing columns are warnings, never guesses', () => {
  const { warnings, census } = analyzeCensus(parseCsv('Employee ID,Coverage Tier,Home Zip\n1,EE,22209\n'), { year: 2026, sites: [], zips });
  assert.equal(census.women, undefined);
  assert.ok(warnings.some((w) => /gender/.test(w)));
  assert.ok(warnings.some((w) => /hire date/.test(w)));
});

test('an Excel census reads the same as CSV, and the output is aggregates only', async () => {
  const { readCensus } = await import('../bin/site/census.mjs');
  const { xlsx } = await import('./fixtures/xlsx.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'census-'));
  writeFileSync(join(dir, 'census.xlsx'), xlsx([
    ['Employee ID', 'Coverage Tier', 'Gender', 'Date of Hire', 'Home State', 'Home Zip'],
    ['1', 'EE', 'F', '2026-03-01', 'VA', '22209'],
    ['2', 'Employee + Spouse', 'M', '2019-04-02', 'DC', '20009'],
    ['3', 'Waived', 'F', '2020-01-01', 'MD', '20814'],
  ]));
  const rows = await readCensus(join(dir, 'census.xlsx'));
  const { census, proximity } = analyzeCensus(rows, { year: 2026, region: ['DC', 'MD', 'VA'], sites: [{ name: 'Your office', zip: '22209', home: true }], zips, sourceName: 'census.xlsx' });
  assert.equal(census.eligible, 3);
  assert.equal(census.enrolled, 2);
  assert.equal(census.joined_this_year, 1);
  assert.deepEqual(census.by_state, { VA: 1, DC: 1 });
  assert.deepEqual(proximity.top_zips.map((z) => z.zip).sort(), ['20009', '22209']);
  // Nothing in the output names a person: no ids, no rows.
  assert.ok(!JSON.stringify({ census, proximity }).includes('"id"'));
});

test('the state map: real outlines, a label per state, hatching by count, callouts on hover', async () => {
  const { stateMap } = await import('../bin/site/map.mjs');
  const html = stateMap({ id: 'm', counts: { VA: 46, DC: 31, MD: 15 }, frame: [-79.6, 37.55, -75.35, 39.78], callouts: { VA: { head: '46 live in Virginia', body: 'Mostly Arlington.' } }, other: { count: 41, states: 15, detail: 'PA 7' } });
  for (const name of ['Virginia', 'Maryland', 'DC']) assert.ok(html.includes(`<span>${name}</span>`), name);
  assert.match(html, /class="sm-solid"/, 'DC is too small to hatch at this scale, so it is solid ink with a leader');
  assert.equal((html.match(/class="sm-h"/g) ?? []).length, 2, 'Virginia and Maryland are hatched');
  assert.match(html, /id="m-co-VA"[^>]*>.*46 live in Virginia/);
  assert.match(html, /41 live in 15 other states/);
  assert.ok(!/<script/i.test(html), 'parts carry no scripts');
});
