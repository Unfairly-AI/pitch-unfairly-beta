// Build a site: site/ (hand-written sections, styles, model, assets) plus the
// brand kit, into dist-site/, a static folder that works on any host.
//
//   site/site.json         title, description, sample, model, facts
//   site/header.html       optional, before the sections
//   site/sections/*.html   the page, one <section data-section> per file, in file-name order
//   site/footer.html       optional, after the sections
//   site/styles.css        the site's own design (brand tokens are already set)
//   site/assets/           images and drawings, referenced as assets/...
//
// A site is self-contained: copy the site/ folder into another project, change
// the inputs and facts in site.json, and every figure follows.
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brandCss, fontFaceCss, validateKit } from './brand-lib.mjs';
import { fillTokens, pageShell } from './site/fill.mjs';

const here = dirname(fileURLToPath(import.meta.url));

/** Fontsource CSS with its file URLs pointed at fonts/<package>/, and the files to copy. */
async function fontsourceCss(root, pkg) {
  const dir = join(root, 'node_modules', pkg);
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
  const kit = JSON.parse(await readFile(at('brand/brand.json'), 'utf8'));
  const kitErrors = validateKit(kit);
  if (kitErrors.length) throw new Error(`brand/brand.json: ${kitErrors.join('; ')}`);

  const names = (await readdir(at('site/sections'))).filter((f) => f.endsWith('.html')).sort();
  if (!names.length) throw new Error('site/sections has no .html files');
  const part = async (p) => (existsSync(at(p)) ? readFile(at(p), 'utf8') : '');
  const sections = await Promise.all(names.map((n) => readFile(at(`site/sections/${n}`), 'utf8')));
  const raw = `${await part('site/header.html')}\n<main id="top">\n${sections.join('\n')}\n</main>\n${await part('site/footer.html')}`;
  const { html: body, missing } = fillTokens(raw, site);

  const outDir = at(out);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(join(outDir, 'js'), { recursive: true });

  // Fonts: Fontsource packages are bundled; font files in the kit are copied.
  let fontCss = '';
  for (const pkg of new Set(['display', 'body', 'mono'].map((r) => kit.typography?.[r]).filter((t) => t?.source === 'fontsource').map((t) => t.package))) {
    if (!existsSync(at(join('node_modules', pkg, 'index.css')))) throw new Error(`Font package ${pkg} isn't installed. Run npm run brand:apply.`);
    const f = await fontsourceCss(root, pkg);
    fontCss += f.css;
    for (const file of f.files) await cp(join(f.dir, 'files', file), join(outDir, 'fonts', f.name, file));
  }
  if (existsSync(at('brand'))) {
    await cp(at('brand'), join(outDir, 'brand'), { recursive: true, filter: (src) => !src.includes(`${join('brand', 'capture')}`) });
  }
  if (existsSync(at('site/assets'))) await cp(at('site/assets'), join(outDir, 'assets'), { recursive: true });

  const css = [fontCss, brandCss(kit, fontFaceCss(kit, 'brand/')), await readFile(join(here, 'site/base.css'), 'utf8'), await part('site/styles.css')].join('\n');
  await writeFile(join(outDir, 'index.html'), pageShell({ site, body, css, model: site.model ?? {} }));
  await cp(join(here, 'site/app.js'), join(outDir, 'js/app.js'));
  await cp(join(here, 'site/model.mjs'), join(outDir, 'js/model.mjs'));
  return { site, sections: names, missing, out: outDir };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const r = await buildSite();
    if (r.missing.length) {
      console.error(`✗ ${r.missing.length} token(s) didn't resolve:\n${r.missing.map((m) => `  ${m}`).join('\n')}`);
      process.exit(1);
    }
    console.log(`Built dist-site/index.html: ${r.sections.length} sections.`);
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  }
}
