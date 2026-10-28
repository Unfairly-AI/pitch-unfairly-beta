// The print and merch formats collateral pieces can name, with finished size, bleed, safe area,
// resolution and sources. Social formats (npm run social:formats) work too.
//   npm run collateral:formats [-- print.poster merch --json --sources]
import { printFormats, resolveFormat, selectPrint } from './collateral/registry.mjs';

const args = process.argv.slice(2);
const patterns = args.filter((a) => !a.startsWith('--'));
const chosen = selectPrint(printFormats(), patterns);
if (args.includes('--json')) {
  console.log(JSON.stringify(chosen, null, 1));
  process.exit(0);
}
const inch = (n) => `${+n.toFixed(3)}`;
for (const s of chosen) {
  const f = resolveFormat(s.id, { print: chosen });
  const safe = [f.safe.t, f.safe.r, f.safe.b, f.safe.l].every((x) => x === f.safe.t) ? inch(f.safe.t) : [f.safe.t, f.safe.r, f.safe.b, f.safe.l].map(inch).join('/');
  console.log(`  ${s.id.padEnd(46)} ${`${inch(f.trim.w)}×${inch(f.trim.h)} in`.padEnd(16)} bleed ${inch(f.bleed)}  safe ${safe}  ${f.dpi.rec} ppi${s.most_common ? '  ★' : ''}${s.confidence !== 'official' ? ` [${s.confidence}]` : ''}`);
  if (args.includes('--sources')) for (const src of s.sources ?? []) console.log(`      ${src.url}`);
}
console.log(`\n${chosen.length} formats. ★ = the most common size of its kind. Use the printer's or vendor's template when they have one.`);
