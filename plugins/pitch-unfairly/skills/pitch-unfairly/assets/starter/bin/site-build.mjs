// Build a site: site/ (hand-written sections, styles, model, assets) plus the
// brand kit, into dist-site/, a static folder that works on any host, with
// index.txt beside index.html: the page as plain text for AI agents (site/text.mjs).
//
//   site/site.json         title, description, sample, model, facts
//   site/header.html       optional, before the sections
//   site/sections/*.html   the page, one <section data-section> per file, in file-name order
//   site/footer.html       optional, after the sections
//   site/toolbox.css       optional: the site toolbox's components (site-toolbox/), loaded before styles.css
//   site/styles.css        the site's own design (brand tokens are already set)
//   site/assets/           images and drawings, referenced as assets/... (no notes or data: the build refuses them)
//
// A site is self-contained: copy the site/ folder into another project, change
// the inputs and facts in site.json, and every figure follows.
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brandCss, fontFaceCss, validateKit } from './brand-lib.mjs';
import { fillTokens, includeParts, pageShell } from './site/fill.mjs';
import { readFileSync } from 'node:fs';
import { engineProblem } from './site/version.mjs';
import { isLocked, variantCss } from './site/variants.mjs';
import { siteText } from './site/text.mjs';
import { brandFileProblem, siteAssetProblem } from './site/public-files.mjs';

const here = dirname(fileURLToPath(import.meta.url));

/** Every file under a folder, as paths relative to it with "/", skipping dotfiles. */
async function filesUnder(dir, prefix = '') {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    if (e.isDirectory()) out.push(...await filesUnder(join(dir, e.name), `${prefix}${e.name}/`));
    else if (e.isFile()) out.push(`${prefix}${e.name}`);
  }
  return out.sort();
}

/** Where a Fontsource package is: installed, or saved in the project by site:vendor. */
export function fontDir(root, pkg) {
  for (const dir of [join(root, 'node_modules', pkg), join(root, 'vendor', 'fonts', pkg)]) if (existsSync(join(dir, 'index.css'))) return dir;
  return null;
}

/** Fontsource CSS with its file URLs pointed at fonts/<package>/, and the files to copy. */
async function fontsourceCss(root, pkg) {
  const dir = fontDir(root, pkg);
  const css = await readFile(join(dir, 'index.css'), 'utf8');
  const name = pkg.replace(/^@/, '').replace(/\//g, '-');
  const files = new Set();
  const out = css.replace(/url\(\.\/files\/([^)]+)\)/g, (m, f) => {
    files.add(f);
    return `url(fonts/${name}/${f})`;
  });
  // Browsers that read woff2 never fetch the woff fallback, so leave it out.
  return { css: out.replace(/,\s*url\([^)]+\.woff\) format\('woff'\)/g, ''), name, files: [...files].filter((f) => f.endsWith('.woff2')), dir };
}

export async function buildSite({ root = '.', out = 'dist-site' } = {}) {
  const at = (p) => join(root, p);
  const site = JSON.parse(await readFile(at('site/site.json'), 'utf8'));
  const pinProblem = engineProblem(site.engine);
  if (pinProblem) throw new Error(pinProblem);
  const kit = JSON.parse(await readFile(at('brand/brand.json'), 'utf8'));
  const kitErrors = validateKit(kit);
  if (kitErrors.length) throw new Error(`brand/brand.json: ${kitErrors.join('; ')}`);

  const names = (await readdir(at('site/sections'))).filter((f) => f.endsWith('.html')).sort();
  if (!names.length) throw new Error('site/sections has no .html files');
  const part = async (p) => (existsSync(at(p)) ? readFile(at(p), 'utf8') : '');
  const sections = await Promise.all(names.map((n) => readFile(at(`site/sections/${n}`), 'utf8')));
  const raw = `${await part('site/header.html')}\n<main id="top">\n${sections.join('\n')}\n</main>\n${await part('site/footer.html')}`;
  const partsMissing = [];
  const readPart = (name) => {
    const path = at(`site/${name.replace(/\.html$/, '')}.html`);
    return existsSync(path) ? readFileSync(path, 'utf8') : null;
  };
  const { html: body, missing: tokenMissing } = fillTokens(includeParts(raw, readPart, partsMissing), site);
  const missing = [...partsMissing, ...tokenMissing];

  const assetProblems = (await filesUnder(at('site/assets'))).map(siteAssetProblem).filter(Boolean);
  if (assetProblems.length) throw new Error(`Not building: site/assets/ is published as is, and it holds private files:\n${assetProblems.map((p) => `  ${p}`).join('\n')}`);

  const outDir = at(out);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(join(outDir, 'js'), { recursive: true });

  // Fonts: Fontsource packages are bundled; font files in the kit are copied.
  let fontCss = '';
  for (const pkg of new Set(['display', 'body', 'mono'].map((r) => kit.typography?.[r]).filter((t) => t?.source === 'fontsource').map((t) => t.package))) {
    if (!fontDir(root, pkg)) throw new Error(`Font package ${pkg} isn't installed or saved in vendor/fonts. Run npm run brand:apply.`);
    const f = await fontsourceCss(root, pkg);
    fontCss += f.css;
    for (const file of f.files) await cp(join(f.dir, 'files', file), join(outDir, 'fonts', f.name, file));
  }
  // Only public kinds leave the project (site/public-files.mjs): brand/ images and
  // fonts, and site/assets/ without notes or data. brand.json, capture and
  // references stay behind; they travel in the private source bundle.
  for (const rel of await filesUnder(at('brand'))) {
    if (!brandFileProblem(rel)) await cp(join(at('brand'), rel), join(outDir, 'brand', rel));
  }
  for (const rel of await filesUnder(at('site/assets'))) await cp(join(at('site/assets'), rel), join(outDir, 'assets', rel));

  // A site in production reads its locked variants (site/variants); one still being built, the live toolbox.
  const toolbox = isLocked(at('site/variants')) ? variantCss(at('site/variants')) : await part('site/toolbox.css');
  const css = [fontCss, brandCss(kit, fontFaceCss(kit, 'brand/')), await readFile(join(here, 'site/base.css'), 'utf8'), toolbox, await part('site/styles.css')].join('\n');
  await writeFile(join(outDir, 'index.html'), pageShell({ site, body, css, model: site.model ?? {} }));
  // The page as plain text for agents; the host serves it at <link>/index.txt behind the link's gates.
  await writeFile(join(outDir, 'index.txt'), siteText({ site, body }));
  await cp(join(here, 'site/app.js'), join(outDir, 'js/app.js'));
  await cp(join(here, 'site/model.mjs'), join(outDir, 'js/model.mjs'));
  return { site, sections: names, missing, out: outDir };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const r = await buildSite({ out: process.argv[2] ?? 'dist-site' });
    if (r.missing.length) {
      console.error(`✗ ${r.missing.length} token(s) didn't resolve:\n${r.missing.map((m) => `  ${m}`).join('\n')}`);
      process.exit(1);
    }
    console.log(`Built ${r.out}/index.html: ${r.sections.length} sections.`);
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  }
}
