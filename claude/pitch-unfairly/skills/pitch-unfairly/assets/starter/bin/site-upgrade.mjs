// Re-pin a site to this engine: node bin/site-upgrade.mjs [--write]
//
// Prints what the newer engine's rules find that the site's current pin only warns
// about (or doesn't check), then, with --write, sets site.json "engine" to this
// engine's pin. A dry run by default. The browser checks a pin adds show with
// `npm run site:audit -- --latest`.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CURRENT_PIN, checkAgainstLatest } from './site/check.mjs';
import { loadSite } from './site-check.mjs';

/** site.json's text with "engine" set to pin, keeping the rest of the file as it is where it can. */
export function repin(text, pin = CURRENT_PIN) {
  if (/"engine"\s*:\s*"[^"]*"/.test(text)) return text.replace(/("engine"\s*:\s*)"[^"]*"/, `$1"${pin}"`);
  const { engine, ...rest } = JSON.parse(text);
  return `${JSON.stringify({ engine: pin, ...rest }, null, 2)}\n`;
}

/** What re-pinning finds: { from, to, fresh, latest }. write: also rewrite site.json. */
export async function upgradeSite(root = '.', { write = false } = {}) {
  const loaded = await loadSite(root);
  const from = loaded.site.engine ?? null;
  const { fresh, latest } = checkAgainstLatest(loaded);
  if (write && from !== CURRENT_PIN) {
    const path = join(root, 'site/site.json');
    writeFileSync(path, repin(readFileSync(path, 'utf8')));
  }
  return { from, to: CURRENT_PIN, fresh, latest };
}

if (process.argv[1]?.endsWith('site-upgrade.mjs')) {
  const write = process.argv.includes('--write');
  const { from, to, fresh, latest } = await upgradeSite('.', { write });
  if (from === to) {
    console.log(`site.json is already pinned ${to}.`);
    process.exit(0);
  }
  console.log(`${from ? `Pinned ${from}` : 'Unpinned'}; this engine is ${to}.`);
  if (fresh.length) {
    console.log(`On ${to} these ${fresh.length} finding(s) block (today they're warnings, or not checked):`);
    fresh.forEach((e) => console.log(`  ✗ ${e}`));
  } else console.log(`Nothing new blocks on ${to}.`);
  const old = latest.errors.length - fresh.length;
  if (old) console.log(`(${old} error(s) block on the current pin too; npm run site:check lists them.)`);
  console.log(write
    ? `site.json now pins ${to}.${fresh.length ? ' Fix the findings above, then run npm run site:audit.' : ' Run npm run site:audit.'}`
    : `Dry run: nothing changed. Run \`npm run site:upgrade -- --write\` to pin ${to}, and \`npm run site:audit -- --latest\` to see what its browser checks add.`);
}
