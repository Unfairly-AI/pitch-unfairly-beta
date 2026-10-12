// Turn brand/brand.json into the files the deck reads:
//   src/brand/brand.css  tokens (colors, type, physical style, motion)
//   src/brand/fonts.ts   Fontsource imports
//   src/brand/assets.ts  logo and imagery URLs
// Installs any Fontsource package the kit names. Run after every kit change.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { assetModule, brandCss, fontFaceCss, fontImports, validateKit } from './brand-lib.mjs';

const kitPath = process.argv[2] ?? 'brand/brand.json';
const kit = JSON.parse(await readFile(kitPath, 'utf8'));
const errors = validateKit(kit);
for (const role of ['display', 'body', 'mono']) {
  for (const f of kit.typography?.[role]?.files ?? []) {
    if (!existsSync(join('brand', f.path))) errors.push(`missing font file brand/${f.path}`);
  }
}
for (const [key, path] of Object.entries(kit.identity?.logos ?? {})) {
  if (path && !existsSync(join('brand', path))) errors.push(`missing logo ${key}: brand/${path}`);
}
for (const img of kit.imagery ?? []) if (!existsSync(join('brand', img.path))) errors.push(`missing image brand/${img.path}`);
if (errors.length) {
  console.error(`brand/brand.json has ${errors.length} problem(s):`);
  errors.forEach((e) => console.error(`  ✗ ${e}`));
  process.exit(1);
}

const packages = [...new Set(['display', 'body', 'mono']
  .map((r) => kit.typography[r])
  .filter((t) => t?.source === 'fontsource')
  .map((t) => t.package))];
const missing = packages.filter((p) => !existsSync(join('node_modules', p, 'package.json')));
// Fontsource publishes some families only as static (@fontsource/x) or only
// as variable (@fontsource-variable/x); try the other before giving up.
for (const pkg of missing) {
  const other = pkg.startsWith('@fontsource-variable/') ? pkg.replace('@fontsource-variable/', '@fontsource/') : pkg.replace('@fontsource/', '@fontsource-variable/');
  for (const candidate of [pkg, other]) {
    try {
      console.log(`Installing ${candidate}`);
      execFileSync('npm', ['install', '--save', '--no-audit', '--no-fund', candidate], { stdio: ['ignore', 'ignore', 'inherit'] });
      if (candidate !== pkg) {
        console.error(`  ${pkg} isn't published; installed ${candidate}. Set "package": "${candidate}" in brand/brand.json and rerun.`);
        process.exit(1);
      }
      break;
    } catch {
      if (candidate === other) {
        console.error(`  Neither ${pkg} nor ${other} exists on npm. Pick a font that Fontsource publishes, or supply font files.`);
        process.exit(1);
      }
    }
  }
}

await mkdir('src/brand', { recursive: true });
await writeFile('src/brand/brand.css', brandCss(kit, fontFaceCss(kit, '../../brand/')));
await writeFile('src/brand/fonts.ts', fontImports(kit));
await writeFile('src/brand/assets.ts', assetModule(kit, '../../brand/'));
console.log(`Applied ${kit.identity?.name ?? 'brand'}: src/brand/brand.css, fonts.ts, assets.ts`);
