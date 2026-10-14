// Draw where people live as a part a section includes:
//   node bin/site-map.mjs [--census site/data/census.json] [--states VA,DC,MD]
//        [--frame -79.6,37.55,-75.35,39.78] [--callouts site/data/map-callouts.json]
//        [--title "Where the enrolled live"] [--id where] [--out site/parts/where-map.html]
//   node bin/site-map.mjs --spec site/data/map.json [--out ...]
// Counts come from the census tool's by_state; --states picks the ones to draw
// (default: the census region, or the top three). Everyone else becomes the
// "N in M other states" button. Callouts are {"VA": {"head", "body"}, ...}.
// A spec file skips the census and is passed as is: {counts, frame, callouts,
// other: {count, states, detail}, title, id}; text may hold {{tokens}}.
// Then put {{> parts/where-map}} in a section.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { mapSpec, stateMap } from './site/map.mjs';

// "--frame -79.6,..." starts with a minus, which parseArgs reads as a flag: join it.
const args = process.argv.slice(2).map((a, i, all) => (all[i - 1] === '--frame' && /^-\d/.test(a) ? null : a === '--frame' && /^-\d/.test(all[i + 1] ?? '') ? `--frame=${all[i + 1]}` : a)).filter((a) => a !== null);
const { values } = parseArgs({
  args,
  options: {
    census: { type: 'string', default: 'site/data/census.json' },
    spec: { type: 'string' },
    states: { type: 'string' },
    frame: { type: 'string' },
    callouts: { type: 'string', default: 'site/data/map-callouts.json' },
    title: { type: 'string', default: 'Where the enrolled live' },
    id: { type: 'string', default: 'where' },
    out: { type: 'string', default: 'site/parts/where-map.html' },
  },
});
const write = (html, note) => {
  mkdirSync(dirname(values.out), { recursive: true });
  writeFileSync(values.out, html + '\n');
  console.log(`Wrote ${values.out}${note}. Include it with {{> ${values.out.replace(/^site\//, '').replace(/\.html$/, '')}}}.`);
};
if (values.spec) {
  const spec = JSON.parse(readFileSync(values.spec, 'utf8'));
  write(stateMap({ id: values.id, title: values.title, ...spec }), ` from ${values.spec}`);
  process.exit(0);
}
if (!existsSync(values.census)) {
  console.error(`No ${values.census}. Run the census tool first: node bin/site-census.mjs <census.csv> --out ${values.census}`);
  process.exit(2);
}
const { census } = JSON.parse(readFileSync(values.census, 'utf8'));
const html = stateMap(
  mapSpec(census, {
    states: values.states?.split(','),
    id: values.id,
    title: values.title,
    frame: values.frame ? values.frame.split(',').map(Number) : undefined,
    callouts: existsSync(values.callouts) ? JSON.parse(readFileSync(values.callouts, 'utf8')) : {},
  }),
);
const shownCounts = Object.entries(census.by_state ?? {}).filter(([st]) => html.includes(`id="${values.id}-co-${st}"`) || html.includes(`aria-describedby="${values.id}-co-${st}"`));
write(html, `: ${shownCounts.map(([st, n]) => `${st} ${n}`).join(', ')}`);
