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
import { assetModule, brandCss, fallbackFor, fontFaceCss, fontImports, kitFaces, kitFilePaths, kitWarnings, repairKitFonts, SUB_BRAND_DIR, SUB_BRAND_ID, subBrandCss, subBrandModule, validateKit } from './brand-lib.mjs';

const kitPath = process.argv[2] ?? 'brand/brand.json';
const kit = JSON.parse(await readFile(kitPath, 'utf8'));
// A kit missing a font's source or @fontsource package is repaired, never refused: the repair is written back.
const kitRepairs = repairKitFonts(kit);
if (kitRepairs.length) {
  await writeFile(kitPath, `${JSON.stringify(kit, null, 2)}\n`);
  kitRepairs.forEach((r) => console.warn(`  ↻ ${kitPath}: ${r}`));
}
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
  const subRepairs = repairKitFonts(sub);
  if (subRepairs.length) {
    await writeFile(at, `${JSON.stringify(sub, null, 2)}\n`);
    subRepairs.forEach((r) => console.warn(`  ↻ ${at}: ${r}`));
  }
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

const kits = [{ path: kitPath, kit }, ...subs.map((s) => ({ path: `${SUB_BRAND_DIR}/${s.id}.json`, kit: s.kit }))];
const fontsourceFaces = () => kits.flatMap(({ path, kit: k }) => {
  const t = k?.typography ?? {};
  return [...['display', 'body', 'mono'].map((role) => [role, t[role]]), ...(Array.isArray(t.faces) ? t.faces.map((f) => [f.role, f]) : [])]
    .filter(([, f]) => f?.source === 'fontsource').map(([role, font]) => ({ path, role, font }));
});
const install = (pkg) => {
  try {
    console.log(`Installing ${pkg}`);
    execFileSync('npm', ['install', '--save', '--no-audit', '--no-fund', pkg], { stdio: ['ignore', 'ignore', 'inherit'] });
    return true;
  } catch {
    return false;
  }
};
const changedKits = new Set();
const missing = [...new Set(fontsourceFaces().map((f) => f.font.package))].filter((p) => !existsSync(join('node_modules', p, 'package.json')));
// Fontsource publishes some families only as static (@fontsource/x) or only as variable (@fontsource-variable/x):
// the other one is used and written into the kit. A family it publishes neither way gets a matching open face (sans,
// serif or mono), recorded as the stand-in for the original. The kit is repaired, never refused.
for (const pkg of missing) {
  const other = pkg.startsWith('@fontsource-variable/') ? pkg.replace('@fontsource-variable/', '@fontsource/') : pkg.replace('@fontsource/', '@fontsource-variable/');
  const users = fontsourceFaces().filter((f) => f.font.package === pkg);
  if (install(pkg)) continue;
  if (install(other)) {
    users.forEach(({ path, role, font }) => { font.package = other; changedKits.add(path); console.warn(`  ↻ ${path}: ${role} uses ${other} (${pkg} isn't published)`); });
    continue;
  }
  for (const { path, role, font } of users) {
    const open = fallbackFor(font, role);
    if (!existsSync(join('node_modules', open.package, 'package.json')) && !install(open.package)) {
      console.error(`  Couldn't install ${pkg}, ${other} or the open stand-in ${open.package}. Check the network, then rerun npm run brand:apply.`);
      process.exit(1);
    }
    console.warn(`  ↻ ${path}: ${role} "${font.family}" isn't on Fontsource; using the open face ${open.family} in its place`);
    font.stand_in_for = font.stand_in_for ?? font.family;
    font.family = open.family;
    font.package = open.package;
    font.license = 'open';
    changedKits.add(path);
  }
}
for (const { path, kit: k } of kits) if (changedKits.has(path)) await writeFile(path, `${JSON.stringify(k, null, 2)}\n`);

await mkdir('src/brand', { recursive: true });
// Every font file once, the main kit's and each sub-brand's: @font-face can't be scoped to a slide.
const faces = [...new Set([kit, ...subs.map((s) => s.kit)].flatMap((k) => fontFaceCss(k, '../../brand/').split(/\n(?=@font-face)/)).filter(Boolean))].join('\n');
const css = [brandCss(kit, faces, '../../brand/'), ...subs.map(({ id, kit: sub }) => subBrandCss(id, sub, '../../brand/'))].join('\n');
// Write a generated file only when it changed: a running dev server reloads the page on any
// write to a module the slides import, and a build during an audit (the studio's publish)
// would navigate the audited page away mid-check.
const writeIfChanged = async (path, content) => {
  if ((await readFile(path, 'utf8').catch(() => null)) !== content) await writeFile(path, content);
};
await writeIfChanged('src/brand/brand.css', css);
const fontsourceKit = { typography: { faces: [kit, ...subs.map((s) => s.kit)].flatMap(kitFaces) } };
await writeIfChanged('src/brand/fonts.ts', fontImports(fontsourceKit));
await writeIfChanged('src/brand/assets.ts', assetModule(kit, '../../brand/'));
await writeIfChanged('src/brand/sub-brands.ts', subBrandModule(subs, '../../brand/'));
console.log(`Applied ${kit.identity?.name ?? 'brand'}${subs.length ? ` with sub-brand${subs.length > 1 ? 's' : ''} ${subs.map((s) => s.id).join(', ')}` : ''}: src/brand/brand.css, fonts.ts, assets.ts, sub-brands.ts`);
