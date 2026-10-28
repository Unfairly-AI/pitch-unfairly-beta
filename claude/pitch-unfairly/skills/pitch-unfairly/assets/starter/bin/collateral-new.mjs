// Start a collateral set: npm run collateral:new [-- --force]
// Writes collateral/ from the example (collateral-kit/): collateral.json and two placeholder pieces
// that show the canvas contract. Then make it the brand's: one file per piece, laid out from the
// brand's own examples, each naming its format.
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COLLATERAL_ENGINE } from './collateral/version.mjs';

export const KIT = join(dirname(fileURLToPath(import.meta.url)), '..', 'collateral-kit');

export function scaffold(root, { force = false, kit = KIT } = {}) {
  const dir = join(root, 'collateral');
  if (!force && existsSync(join(dir, 'collateral.json'))) throw new Error('collateral/collateral.json already exists. Pass --force to replace it with the example.');
  cpSync(kit, dir, { recursive: true });
  const c = JSON.parse(readFileSync(join(dir, 'collateral.json'), 'utf8'));
  c.engine = `collateral@${COLLATERAL_ENGINE.split('.').slice(0, 2).join('.')}`;
  writeFileSync(join(dir, 'collateral.json'), `${JSON.stringify(c, null, 2)}\n`);
  return dir;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    scaffold('.', { force: process.argv.includes('--force') });
    console.log('Wrote collateral/ from the example. Next: pick formats (npm run collateral:formats), write one piece per file from the brand\'s own examples, then npm run collateral:build -- --proofs and look at every proof.');
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  }
}
