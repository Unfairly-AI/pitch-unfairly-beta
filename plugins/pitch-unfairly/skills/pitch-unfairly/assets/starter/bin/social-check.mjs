// Check social/campaign.json without rendering: the angles, the cards, the banned phrases,
// and every line of copy against the registry's text limits for its platform.   npm run social:check
import { readFileSync } from 'node:fs';
import { campaignProblems, copyProblems } from './social/campaign.mjs';
import { chooseFormats } from './social/page.mjs';

let c;
try { c = JSON.parse(readFileSync('social/campaign.json', 'utf8')); } catch (e) { console.error(`✗ social/campaign.json: ${e.message}. Start one with npm run social:new.`); process.exit(1); }
const { formats } = chooseFormats(c);
const { formats: all } = chooseFormats({ formats: {} });
const problems = [...campaignProblems(c, { root: '.' }), ...copyProblems(c, all).problems];
const { rows } = copyProblems(c, all);
for (const r of rows) console.log(`  ${r.n <= r.max ? '✓' : '✗'} ${r.where}: ${r.n}/${r.max}${r.truncates_at ? ` (about ${r.truncates_at} show before "more")` : ''}`);
console.log(`${formats.length} formats selected: ${[...new Set(formats.map((s) => s.platform))].join(', ')}.`);
if (problems.length) { console.error(`✗ ${problems.length} problem(s):\n${problems.map((p) => `  ${p}`).join('\n')}`); process.exit(1); }
console.log('✓ campaign.json is ready to render.');
