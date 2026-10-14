// Save the brand's fonts into the project (vendor/fonts/<package>/), so the
// site builds with plain Node and no npm install: in a sandbox with no
// network, or from a plain copy of the project.
//   node bin/site-vendor.mjs
import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const kit = JSON.parse(readFileSync('brand/brand.json', 'utf8'));
const pkgs = [...new Set(['display', 'body', 'mono'].map((r) => kit.typography?.[r]).filter((t) => t?.source === 'fontsource').map((t) => t.package))];
for (const pkg of pkgs) {
  const from = join('node_modules', pkg);
  if (!existsSync(join(from, 'index.css'))) {
    console.error(`✗ ${pkg} isn't installed. Run npm run brand:apply first.`);
    process.exit(1);
  }
  const to = join('vendor', 'fonts', pkg);
  await rm(to, { recursive: true, force: true });
  await mkdir(join(to, 'files'), { recursive: true });
  await cp(join(from, 'index.css'), join(to, 'index.css'));
  for (const f of await readdir(join(from, 'files'))) if (f.endsWith('.woff2')) await cp(join(from, 'files', f), join(to, 'files', f));
  console.log(`Saved ${pkg} to ${to}.`);
}
if (!pkgs.length) console.log('The brand uses no Fontsource packages; nothing to save.');
