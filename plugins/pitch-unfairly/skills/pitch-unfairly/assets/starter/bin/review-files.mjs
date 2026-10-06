// Print the files a design review needs, for deck_review_start:
// [{ path, size }] for artifacts/stage/*.png and both contact sheets (desktop for context, phone).
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const files = [];
for (const name of (await readdir('artifacts/stage').catch(() => [])).filter((n) => n.endsWith('.png')).sort()) {
  files.push({ path: `stage/${name}`, size: (await stat(join('artifacts/stage', name))).size });
}
for (const sheet of ['contact-sheet.png', 'contact-sheet-mobile.png']) {
  const s = await stat(join('artifacts', sheet)).catch(() => null);
  if (s) files.push({ path: sheet, size: s.size });
}
if (!files.length) {
  console.error('No screenshots yet. Run npm run shots first.');
  process.exit(1);
}
console.log(JSON.stringify(files, null, 2));
