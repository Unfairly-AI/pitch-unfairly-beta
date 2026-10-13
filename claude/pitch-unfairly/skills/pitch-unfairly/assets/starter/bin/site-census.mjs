// Turn a census into proposal facts:
//   node bin/site-census.mjs <census.csv|.xlsx> [--sites site/data/sites.json]
//        [--site "Your building:22209"] [--region DC,MD,VA] [--radii 3,5,10]
//        [--year 2026] [--as-of "October 8, 2026"] [--out site/data/census.json]
// --sites is the customer's own list ({"sites":[{"name","zip"}]}); --site adds
// the employer's places (their office first). Prints a summary; warnings are
// things it couldn't find, never guesses. Keep the census file itself out of
// site/: only the aggregates belong in the project.
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { basename } from 'node:path';
import { parseArgs } from 'node:util';
import { readCensus, analyzeCensus, loadZips } from './site/census.mjs';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    sites: { type: 'string', default: 'site/data/sites.json' },
    site: { type: 'string', multiple: true, default: [] },
    region: { type: 'string', default: '' },
    radii: { type: 'string', default: '3,5,10' },
    year: { type: 'string', default: String(new Date().getFullYear()) },
    'as-of': { type: 'string' },
    out: { type: 'string' },
  },
});
const file = positionals[0];
if (!file) {
  console.error('Usage: node bin/site-census.mjs <census.csv|.xlsx> [--site "Your building:22209"] [--out site/data/census.json]');
  process.exit(2);
}
if (/(^|\/)site\//.test(file)) console.error('warning: the census file is inside site/, which is published with the project. Keep it outside; only the aggregates belong there.');
const sites = existsSync(values.sites) ? JSON.parse(readFileSync(values.sites, 'utf8')).sites.map((s) => ({ name: s.name, zip: String(s.zip) })) : [];
// The employer's own places come first; one in the same ZIP as a site takes that site's row.
values.site
  .map((x) => x.split(':'))
  .filter(([n, z]) => n && z)
  .forEach(([n, z], i) => {
    const same = sites.findIndex((s) => s.zip === z.trim());
    if (same >= 0) sites.splice(same, 1);
    sites.splice(i, 0, { name: n.trim(), zip: z.trim(), home: true });
  });
const result = analyzeCensus(await readCensus(file), {
  year: Number(values.year),
  region: values.region ? values.region.split(',').map((s) => s.trim().toUpperCase()) : [],
  radii: values.radii.split(',').map(Number),
  sites,
  zips: loadZips(),
  sourceName: `De-identified census, ${basename(file)}`,
  asOf: values['as-of'],
});
const c = result.census;
console.error(`${c.enrolled} of ${c.eligible} enrolled. Tiers: ${Object.entries(c.tiers).map(([k, v]) => `${k} ${v}`).join(', ')}.`);
console.error(`By state: ${Object.entries(c.by_state).map(([s, n]) => `${s} ${n}`).join(', ')}`);
for (const s of result.proximity.sites) console.error(`  ${s.name} ${s.zip}: ${s.within.join(' / ')} within ${result.proximity.radii.join(' / ')} miles`);
for (const w of result.warnings) console.error(`warning: ${w}`);
const json = JSON.stringify(result, null, 2);
if (values.out) writeFileSync(values.out, json + '\n');
else console.log(json);
