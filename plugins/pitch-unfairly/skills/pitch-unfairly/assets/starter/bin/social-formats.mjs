// The format registry: every placement the social engine renders, with its canvas, safe zone,
// limits and sources.   npm run social:formats [-- linkedin instagram.feed.* --json --sources]
import { loadRegistry, safeRect, selectFormats } from './social/registry.mjs';

const args = process.argv.slice(2);
const patterns = args.filter((a) => !a.startsWith('--'));
const { formats, skipped } = loadRegistry();
const chosen = selectFormats(formats, patterns);
if (args.includes('--json')) {
  console.log(JSON.stringify(chosen, null, 1));
  process.exit(0);
}
let plat = '';
for (const s of chosen) {
  if (s.platform !== plat) { plat = s.platform; console.log(`\n${plat}`); }
  const r = s.safe_zone ? safeRect(s) : null;
  const zone = r ? ` safe ${Math.round(r.w)}×${Math.round(r.h)} at ${Math.round(r.x)},${Math.round(r.y)}${s.safe_zone_source?.startsWith('house') ? ' (house)' : ''}${s.crop ? ` crop ${s.crop.aspect.join(':')}` : ''}` : '';
  const vid = (s.media ?? []).includes('video') && s.video ? ` video ${s.video.min_s ?? '?'}–${s.video.max_s ?? '?'}s` : '';
  const file = s.file?.max_mb ? ` ≤${s.file.max_mb}MB` : s.file?.max_kb ? ` ≤${s.file.max_kb}KB` : '';
  console.log(`  ${s.id.padEnd(44)} ${`${s.canvas.w}×${s.canvas.h}`.padEnd(10)} ${s.kind.padEnd(7)} ${(s.media ?? []).join('/')}${vid}${file}${zone}${s.confidence && s.confidence !== 'official' ? ` [${s.confidence}]` : ''}`);
  if (args.includes('--sources')) for (const src of s.sources ?? []) console.log(`      ${src.url} (${src.checked ?? ''})`);
}
console.log(`\n${chosen.length} formats${patterns.length ? ` matching ${patterns.join(' ')}` : ''}; ${skipped.length} not rendered (${skipped.map(([id, why]) => `${id}: ${why}`).join('; ')}).`);
