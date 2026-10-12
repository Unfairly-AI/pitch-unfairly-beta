// Print the files a design review needs, for deck_review_start:
// [{ path, size }] for artifacts/stage/*.png, each slide's phone screenshot
// (artifacts/mobile/*.png, same names), and both contact sheets.
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const files = [];
for (const dir of ['stage', 'mobile']) {
  for (const name of (await readdir(join('artifacts', dir)).catch(() => [])).filter((n) => n.endsWith('.png')).sort()) {
    files.push({ path: `${dir}/${name}`, size: (await stat(join('artifacts', dir, name))).size });
  }
}
for (const sheet of ['contact-sheet.png', 'contact-sheet-mobile.png']) {
  const s = await stat(join('artifacts', sheet)).catch(() => null);
  if (s) files.push({ path: sheet, size: s.size });
}
if (!files.some((f) => f.path.startsWith('stage/'))) {
  console.error('No screenshots yet. Run npm run shots first.');
  process.exit(1);
}
console.log(JSON.stringify(files, null, 2));
