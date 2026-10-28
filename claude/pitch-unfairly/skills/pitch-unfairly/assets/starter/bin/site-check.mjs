// Check a site's source: node bin/site-check.mjs
import { existsSync, readFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CURRENT_PIN, checkAgainstLatest, checkSite } from './site/check.mjs';
import { includeParts } from './site/fill.mjs';

export async function loadSite(root = '.') {
  const read = (p) => readFile(join(root, p), 'utf8');
  const opt = (p) => (existsSync(join(root, p)) ? read(p) : '');
  const site = JSON.parse(await read('site/site.json'));
  const names = (await readdir(join(root, 'site/sections'))).filter((f) => f.endsWith('.html')).sort();
  const readPart = (name) => {
    const path = join(root, `site/${name.replace(/\.html$/, '')}.html`);
    return existsSync(path) ? readFileSync(path, 'utf8') : null;
  };
  // Parts are checked where they're used, with the section around them.
  const sections = await Promise.all(names.map(async (name) => {
    const missing = [];
    const html = includeParts(await read(`site/sections/${name}`), readPart, missing);
    return { name, html, missingParts: missing };
  }));
  const exists = (ref) => {
    if (ref.startsWith('assets/')) return existsSync(join(root, 'site', ref));
    if (ref.startsWith('brand/')) return existsSync(join(root, ref));
    return false;
  };
  // The kit's `rules` add to the banned list (site/banned.mjs).
  const kit = JSON.parse((await opt('brand/brand.json')) || 'null');
  return { site, sections, header: await opt('site/header.html'), footer: await opt('site/footer.html'), styles: await opt('site/styles.css'), exists, kit };
}

if (process.argv[1]?.endsWith('site-check.mjs')) {
  const loaded = await loadSite();
  // --latest: the newest engine's rules, all blocking, without re-pinning; marks what's new.
  const latest = process.argv.includes('--latest');
  let errors;
  let warnings;
  let fresh = new Set();
  if (latest) {
    const r = checkAgainstLatest(loaded);
    ({ errors, warnings } = r.latest);
    fresh = new Set(r.fresh);
    console.log(`Checking against ${CURRENT_PIN}, every rule blocking${loaded.site.engine && loaded.site.engine !== CURRENT_PIN ? ` (this site is pinned ${loaded.site.engine})` : ''}.`);
  } else ({ errors, warnings } = checkSite(loaded));
  warnings.forEach((w) => console.log(`  ! ${w}`));
  errors.forEach((e) => console.error(`  ✗ ${fresh.has(e) ? `[new in ${CURRENT_PIN}] ` : ''}${e}`));
  if (errors.length) {
    console.error(`${errors.length} error(s)${fresh.size ? `, ${fresh.size} of them new against the pin (a warning there; npm run site:upgrade re-pins)` : ''}.`);
    process.exit(1);
  }
  console.log(`Site source is clean${latest ? ` on ${CURRENT_PIN}` : ''}${warnings.length ? ` (${warnings.length} warning(s) to read)` : ''}.`);
}
