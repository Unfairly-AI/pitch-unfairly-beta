// Start a site from a proposal template: npm run site:new -- <template> [--force]
//   npm run site:new -- --list     the templates and what each is for
// Writes site/ from the site toolbox (site-toolbox/): the template's sections in
// order, the header, footer and sample line, toolbox.css, the example model as
// site.json, and the example drawing. Then make it yours: change site.json's
// inputs and facts, rewrite every section for this reader, and cut what they don't need.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TOOLBOX = join(dirname(fileURLToPath(import.meta.url)), '..', 'site-toolbox');

export function templates(toolbox = TOOLBOX) {
  const { $comment, ...all } = JSON.parse(readFileSync(join(toolbox, 'templates.json'), 'utf8'));
  return all;
}

/** The template's section files: [{ file, html }], each entry's components joined. */
export function templateSections(name, toolbox = TOOLBOX) {
  const t = templates(toolbox)[name];
  if (!t) throw new Error(`No template "${name}". Choose one of: ${Object.keys(templates(toolbox)).join(', ')}.`);
  return t.sections.map((entry, i) => {
    const parts = [entry].flat();
    const html = parts.map((c) => readFileSync(join(toolbox, 'components', `${c}.html`), 'utf8').replace(/^<!--[\s\S]*?-->\s*/, '')).join('');
    return { file: `${String(i + 1).padStart(2, '0')}-${parts[0]}.html`, html };
  });
}

/** Writes site/ under root from a template. Refuses to overwrite sections unless force. */
export function scaffold(root, name, { force = false, toolbox = TOOLBOX } = {}) {
  const site = join(root, 'site');
  const sectionsDir = join(site, 'sections');
  if (!force && existsSync(sectionsDir) && readdirSync(sectionsDir).some((f) => f.endsWith('.html'))) {
    throw new Error('site/sections already has sections. Pass --force to replace them with the template.');
  }
  const sections = templateSections(name, toolbox);
  mkdirSync(sectionsDir, { recursive: true });
  // --force: the template replaces every section file there was.
  for (const f of readdirSync(sectionsDir)) if (f.endsWith('.html')) rmSync(join(sectionsDir, f));
  for (const { file, html } of sections) writeFileSync(join(sectionsDir, file), html);
  const { $comment, ...example } = JSON.parse(readFileSync(join(toolbox, 'example.json'), 'utf8'));
  writeFileSync(join(site, 'site.json'), `${JSON.stringify(example, null, 2)}\n`);
  // The header's nav keeps only the sections this template has.
  const ids = new Set(sections.flatMap(({ html }) => [...html.matchAll(/<section\b[^>]*\sid="([^"]+)"/g)].map((m) => m[1])));
  for (const f of ['header', 'footer']) {
    const html = readFileSync(join(toolbox, 'components', `${f}.html`), 'utf8').replace(/^<!--[\s\S]*?-->\s*/, '');
    writeFileSync(join(site, `${f}.html`), html.replace(/<a href="#([^"]+)">[^<]*<\/a>/g, (a, id) => (id === 'top' || ids.has(id) ? a : '')));
  }
  cpSync(join(toolbox, 'parts'), join(site, 'parts'), { recursive: true });
  cpSync(join(toolbox, 'assets'), join(site, 'assets'), { recursive: true });
  cpSync(join(toolbox, 'toolbox.css'), join(site, 'toolbox.css'));
  if (!existsSync(join(site, 'styles.css'))) writeFileSync(join(site, 'styles.css'), '/* This site\'s own design. toolbox.css loads first; adapt its components here (spacing, a section\'s layout, the art), reading the brand tokens. */\n');
  return sections.map((s) => s.file);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const all = templates();
  const name = args.find((a) => !a.startsWith('--'));
  if (args.includes('--list') || !name) {
    for (const [id, t] of Object.entries(all)) console.log(`${id}: ${t.for}\n  ${t.sections.map((s) => [s].flat().join(' + ')).join(' → ')}`);
    if (!name) console.log('\nUsage: npm run site:new -- <template> [--force]');
    process.exit(name || args.includes('--list') ? 0 : 1);
  }
  try {
    const files = scaffold('.', name, { force: args.includes('--force') });
    console.log(`Wrote site/ from the ${name} template: ${files.join(', ')}.\nNext: change site/site.json to this reader's inputs and facts, rewrite each section for them, and run npm run site:check.`);
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  }
}
