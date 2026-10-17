// Every site toolbox component on one page, in this project's brand:
//   npm run site:gallery [-- <out>]     (default dist-gallery/)
// Each component is built from its snippet in site-toolbox/components with the
// worked example's model and facts, and labelled with its name, so you can see what
// each one looks like in the customer's colors and type before choosing one. It
// reads brand/brand.json and touches nothing in site/.
import { cp, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSite } from './site-build.mjs';
import { scaffold, templates, TOOLBOX } from './site-new.mjs';

const strip = (html) => html.replace(/^<!--[\s\S]*?-->\s*/, '');
const note = (html) => (/^<!--([\s\S]*?)-->/.exec(html)?.[1] ?? '').replace(/\s+/g, ' ').trim();

/** The components in page order: the hero and its glance band first, the close last. */
export async function galleryComponents(toolbox = TOOLBOX) {
  const all = (await readdir(join(toolbox, 'components'))).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, ''));
  const order = [...new Set(Object.values(templates(toolbox)).flatMap((t) => t.sections.flat()))];
  const rest = all.filter((c) => !order.includes(c) && !['header', 'footer'].includes(c)).sort();
  const close = order.filter((c) => c === 'close');
  return [...order.filter((c) => c !== 'close' && all.includes(c)), ...rest, ...close];
}

export async function buildGallery({ root = '.', out = 'dist-gallery', toolbox = TOOLBOX } = {}) {
  root = resolve(root);
  if (!existsSync(join(root, 'brand/brand.json'))) throw new Error('brand/brand.json is missing. Capture or apply a brand first (npm run brand:capture).');
  const tmp = await mkdtemp(join(tmpdir(), 'site-gallery-'));
  try {
    await cp(join(root, 'brand'), join(tmp, 'brand'), { recursive: true });
    for (const dir of ['node_modules', 'vendor']) if (existsSync(join(root, dir))) await symlink(join(root, dir), join(tmp, dir));
    scaffold(tmp, 'proposal', { toolbox });
    const sectionsDir = join(tmp, 'site/sections');
    for (const f of await readdir(sectionsDir)) await rm(join(sectionsDir, f));
    const list = await galleryComponents(toolbox);
    const notes = {};
    let i = 0;
    for (const c of list) {
      if (c === 'glance') continue;
      const raw = await readFile(join(toolbox, 'components', `${c}.html`), 'utf8');
      notes[c] = note(raw);
      let html = strip(raw);
      // The glance band shares the hero's file, as it does on a real page.
      if (c === 'hero' && list.includes('glance')) {
        const glance = await readFile(join(toolbox, 'components', 'glance.html'), 'utf8');
        notes.glance = note(glance);
        html += strip(glance);
      }
      await writeFile(join(sectionsDir, `${String(++i).padStart(2, '0')}-${c}.html`), `<!--tb-gallery:${c}${c === 'hero' && list.includes('glance') ? ' + glance' : ''}-->\n${html}`);
    }
    await writeFile(join(tmp, 'site/styles.css'), `.tb-gallery-tag { position: relative; z-index: 4; display: flex; flex-wrap: wrap; gap: 4px 14px; align-items: baseline; padding: 14px var(--tb-gutter); background: var(--ink); color: var(--paper); font: 600 13px/1.4 var(--font-body); }
.tb-gallery-tag b { font: 700 12px/1 var(--font-body); letter-spacing: .14em; text-transform: uppercase; color: var(--paper); }
.tb-gallery-tag span { opacity: .78; max-width: 110ch; }
`);
    const built = await buildSite({ root: tmp, out: 'dist' });
    if (built.missing.length) throw new Error(`tokens didn't resolve: ${built.missing.join(', ')}`);
    const page = join(tmp, 'dist/index.html');
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    let html = await readFile(page, 'utf8');
    html = html.replace(/<!--tb-gallery:([\w +-]+)-->/g, (m, name) => `<div class="tb-gallery-tag" data-pdf-hide><b>${esc(name)}</b><span>${esc(name.split(' + ').map((n) => notes[n]).filter(Boolean).join(' '))}</span></div>`);
    html = html.replace(/<title>[^<]*<\/title>/, '<title>Site toolbox gallery</title>');
    await writeFile(page, html);
    const dest = resolve(root, out);
    await rm(dest, { recursive: true, force: true });
    await cp(join(tmp, 'dist'), dest, { recursive: true, dereference: true });
    return { out: dest, components: list };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const r = await buildGallery({ out: process.argv[2] ?? 'dist-gallery' });
    console.log(`Built ${r.out}/index.html: ${r.components.length} components in this brand. Open it with npx serve ${process.argv[2] ?? 'dist-gallery'}.`);
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  }
}
