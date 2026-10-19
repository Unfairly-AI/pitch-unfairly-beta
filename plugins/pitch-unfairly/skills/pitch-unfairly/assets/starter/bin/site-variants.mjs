// Lock a production site's toolbox components as variants, and manage them:
//   npm run site:variants -- lock [component...]     lock what the site's sections use (or the named ones) at this engine
//   npm run site:variants -- status [--json] [toolbox.css]   which locked components changed upstream since
//   npm run site:variants -- upgrade <component> [toolbox.css]   re-lock one variant to that toolbox, keeping its skin
// Run it from the project (or a proposal kit's) root; the variants live in site/variants.
// Once site/variants exists, site:build reads it instead of site/toolbox.css, so toolbox
// changes never reach the site unless a variant is upgraded on purpose. After an upgrade,
// rebuild and compare the sections that use it before publishing.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE } from './site/version.mjs';
import { componentsIn, lockVariant, readManifest, sliceToolbox, status } from './site/variants.mjs';

export const variantsDir = (root = '.') => join(root, 'site/variants');
const here = fileURLToPath(new URL('.', import.meta.url));
const defaultToolbox = (root) => [join(root, 'site-toolbox/toolbox.css'), join(here, '../site-toolbox/toolbox.css')].find((f) => existsSync(f));

/** The components the site's sections, header and footer use. */
export function usedComponents(root = '.') {
  const html = [];
  const dir = join(root, 'site/sections');
  if (existsSync(dir)) for (const f of readdirSync(dir)) if (f.endsWith('.html')) html.push(readFileSync(join(dir, f), 'utf8'));
  for (const f of ['site/header.html', 'site/footer.html']) if (existsSync(join(root, f))) html.push(readFileSync(join(root, f), 'utf8'));
  return componentsIn(html.join('\n'));
}

/** Locks the named components (or every one the site uses), plus the base the first time. Returns what it locked. */
export function lock(root = '.', components = [], toolboxFile = defaultToolbox(root), version = ENGINE) {
  const dir = variantsDir(root);
  const names = components.length ? components : usedComponents(root);
  const slices = sliceToolbox(readFileSync(toolboxFile, 'utf8'));
  const todo = [...(readManifest(dir).components.base ? [] : ['base']), ...names];
  for (const c of todo) lockVariant(dir, c, slices, version);
  return todo;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, ...args] = process.argv.slice(2);
  const root = '.';
  const dir = variantsDir(root);
  const fileArg = () => args.find((a) => a.endsWith('.css'));
  try {
    if (cmd === 'lock') {
      const done = lock(root, args.filter((a) => !a.endsWith('.css')), fileArg() ?? defaultToolbox(root));
      console.log(`Locked ${done.join(', ')} at engine ${ENGINE} in site/variants. site:build reads it from now on.`);
    } else if (cmd === 'status') {
      if (!existsSync(join(dir, 'variants.json'))) throw new Error('This site has no locked variants yet (npm run site:variants -- lock).');
      const rows = status(dir, readFileSync(fileArg() ?? defaultToolbox(root), 'utf8'));
      if (args.includes('--json')) console.log(JSON.stringify({ components: Object.fromEntries(rows.map(({ component, from, upstream, current, changed }) => [component, { from, upstream, current, changed }])) }));
      else for (const r of rows) console.log(`${r.component.padEnd(12)} locked at ${r.from}  ${r.changed ? 'upstream changed: review, then upgrade if wanted' : 'up to date'}`);
    } else if (cmd === 'upgrade') {
      const component = args.find((a) => !a.endsWith('.css'));
      if (!component || !readManifest(dir).components[component]) throw new Error(`Name a locked component to upgrade: ${Object.keys(readManifest(dir).components).join(', ')}.`);
      lockVariant(dir, component, sliceToolbox(readFileSync(fileArg() ?? defaultToolbox(root), 'utf8')), ENGINE);
      console.log(`Re-locked ${component} at engine ${ENGINE}, skin kept. Rebuild and compare the sections that use it before publishing.`);
    } else {
      console.log('Usage: npm run site:variants -- lock [component...] | status [--json] [toolbox.css] | upgrade <component> [toolbox.css]');
      process.exitCode = 1;
    }
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exitCode = 1;
  }
}
