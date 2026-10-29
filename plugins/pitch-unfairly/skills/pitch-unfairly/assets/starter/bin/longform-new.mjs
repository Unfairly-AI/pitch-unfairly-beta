// Start a long-form document: npm run longform:new [-- --force]
// Writes longform/ from the example (longform-kit/): longform.json, a cover, two placeholder
// chapters, the back page and an empty styles.css. They show the structure and carry no look:
// write the cover and chapters from the brand's own examples and the reader's question.
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LONGFORM_ENGINE } from './longform/version.mjs';

export const KIT = join(dirname(fileURLToPath(import.meta.url)), '..', 'longform-kit');

export function scaffold(root, { force = false, kit = KIT } = {}) {
  const dir = join(root, 'longform');
  if (!force && existsSync(join(dir, 'longform.json'))) throw new Error('longform/longform.json already exists. Pass --force to replace it with the example.');
  cpSync(kit, dir, { recursive: true });
  const doc = JSON.parse(readFileSync(join(dir, 'longform.json'), 'utf8'));
  doc.engine = `longform@${LONGFORM_ENGINE.split('.').slice(0, 2).join('.')}`;
  writeFileSync(join(dir, 'longform.json'), `${JSON.stringify(doc, null, 2)}\n`);
  return dir;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    scaffold('.', { force: process.argv.includes('--force') });
    console.log('Wrote longform/ from the example. Next: set the title and page size in longform/longform.json, write the cover and one file per chapter, design it in styles.css, then npm run longform:build -- --web and look at it.');
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  }
}
