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
import { stateMap } from './site/map.mjs';

const { values } = parseArgs({
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
const byState = census.by_state ?? {};
const ranked = Object.entries(byState).sort((a, b) => b[1] - a[1]);
const pick = values.states ? values.states.split(',').map((s) => s.trim().toUpperCase()) : ranked.slice(0, 3).map(([s]) => s);
const counts = Object.fromEntries(pick.filter((s) => byState[s]).map((s) => [s, byState[s]]));
const others = ranked.filter(([s]) => !pick.includes(s));
const shown = others.slice(0, 8).map(([s, n]) => `${s} ${n}`);
const html = stateMap({
  id: values.id,
  title: values.title,
  counts,
  frame: values.frame ? values.frame.split(',').map(Number) : undefined,
  callouts: existsSync(values.callouts) ? JSON.parse(readFileSync(values.callouts, 'utf8')) : {},
  other: others.length ? { count: others.reduce((t, [, n]) => t + n, 0), states: others.length, detail: `${shown.join(', ')}${others.length > 8 ? `, and ${others.length - 8} more` : ''}.` } : undefined,
});
write(html, `: ${Object.entries(counts).map(([s, n]) => `${s} ${n}`).join(', ')}${others.length ? `; ${others.length} other states` : ''}`);
