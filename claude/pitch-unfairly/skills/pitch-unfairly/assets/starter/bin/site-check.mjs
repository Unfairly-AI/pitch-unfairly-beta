// Check a site's source: node bin/site-check.mjs
import { existsSync, readFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { checkSite } from './site/check.mjs';
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
  return { site, sections, header: await opt('site/header.html'), footer: await opt('site/footer.html'), exists };
}

if (process.argv[1]?.endsWith('site-check.mjs')) {
  const { errors, warnings } = checkSite(await loadSite());
  warnings.forEach((w) => console.log(`  ! ${w}`));
  errors.forEach((e) => console.error(`  ✗ ${e}`));
  if (errors.length) {
    console.error(`${errors.length} error(s).`);
    process.exit(1);
  }
  console.log(`Site source is clean${warnings.length ? ` (${warnings.length} warning(s) to read)` : ''}.`);
}
