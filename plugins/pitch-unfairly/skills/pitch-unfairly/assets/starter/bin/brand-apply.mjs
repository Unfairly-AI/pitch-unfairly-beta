// Turn brand/brand.json into the files the deck reads:
//   src/brand/brand.css  tokens (colors, type, physical style, motion)
//   src/brand/fonts.ts   Fontsource imports
//   src/brand/assets.ts  logo, imagery, lockup, texture, and element URLs
//   src/brand/sub-brands.ts  each sub-brand kit in brand/sub-brands/<id>.json (a slide with brand="<id>")
// Installs any Fontsource package the kit names. Run after every kit change.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { assetModule, brandCss, fontFaceCss, fontImports, kitFaces, kitFilePaths, kitWarnings, SUB_BRAND_DIR, SUB_BRAND_ID, subBrandCss, subBrandModule, validateKit } from './brand-lib.mjs';

const kitPath = process.argv[2] ?? 'brand/brand.json';
const kit = JSON.parse(await readFile(kitPath, 'utf8'));
const errors = validateKit(kit);
// Fonts, logos, imagery, lockups, textures, and element examples must all be in brand/.
for (const { what, path } of kitFilePaths(kit)) {
  if (typeof path === 'string' && path && !existsSync(join('brand', path))) errors.push(`missing ${what}: brand/${path}`);
}
for (const w of kitWarnings(kit)) console.warn(`  ! ${w}`);
// Sub-brands: brand/sub-brands/<id>.json, each a brand-kit@1 with paths relative to brand/.
const subs = [];
for (const name of (await readdir(SUB_BRAND_DIR).catch(() => [])).filter((n) => n.endsWith('.json')).sort()) {
  const id = name.replace(/\.json$/, '');
  const at = `${SUB_BRAND_DIR}/${name}`;
  if (!SUB_BRAND_ID.test(id)) { errors.push(`${at}: the file name is the sub-brand's id and must be kebab-case`); continue; }
  let sub;
  try { sub = JSON.parse(await readFile(at, 'utf8')); } catch (e) { errors.push(`${at}: ${e.message}`); continue; }
  errors.push(...validateKit(sub).map((e) => `${at}: ${e}`));
  for (const { what, path } of kitFilePaths(sub)) {
    if (typeof path === 'string' && path && !existsSync(join('brand', path))) errors.push(`${at}: missing ${what}: brand/${path}`);
  }
  subs.push({ id, kit: sub });
}
if (errors.length) {
  console.error(`brand/brand.json has ${errors.length} problem(s):`);
  errors.forEach((e) => console.error(`  ✗ ${e}`));
  process.exit(1);
}

const packages = [...new Set([kit, ...subs.map((s) => s.kit)].flatMap(kitFaces)
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
// Every font file once, the main kit's and each sub-brand's: @font-face can't be scoped to a slide.
const faces = [...new Set([kit, ...subs.map((s) => s.kit)].flatMap((k) => fontFaceCss(k, '../../brand/').split(/\n(?=@font-face)/)).filter(Boolean))].join('\n');
const css = [brandCss(kit, faces, '../../brand/'), ...subs.map(({ id, kit: sub }) => subBrandCss(id, sub, '../../brand/'))].join('\n');
await writeFile('src/brand/brand.css', css);
const fontsourceKit = { typography: { faces: [kit, ...subs.map((s) => s.kit)].flatMap(kitFaces) } };
await writeFile('src/brand/fonts.ts', fontImports(fontsourceKit));
await writeFile('src/brand/assets.ts', assetModule(kit, '../../brand/'));
await writeFile('src/brand/sub-brands.ts', subBrandModule(subs, '../../brand/'));
console.log(`Applied ${kit.identity?.name ?? 'brand'}${subs.length ? ` with sub-brand${subs.length > 1 ? 's' : ''} ${subs.map((s) => s.id).join(', ')}` : ''}: src/brand/brand.css, fonts.ts, assets.ts, sub-brands.ts`);
