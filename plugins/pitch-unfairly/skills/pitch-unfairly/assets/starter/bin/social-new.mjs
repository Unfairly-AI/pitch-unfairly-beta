// Start a campaign: npm run social:new [-- --force]
// Writes social/ from the example (social-kit/): campaign.json, styles.css and one example moment.
// Then make it this brand's: rewrite each angle, draw real product moments, pick the formats.
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOCIAL_ENGINE } from './social/version.mjs';

export const KIT = join(dirname(fileURLToPath(import.meta.url)), '..', 'social-kit');

export function scaffold(root, { force = false, kit = KIT } = {}) {
  const dir = join(root, 'social');
  if (!force && existsSync(join(dir, 'campaign.json'))) throw new Error('social/campaign.json already exists. Pass --force to replace it with the example.');
  cpSync(kit, dir, { recursive: true });
  const c = JSON.parse(readFileSync(join(dir, 'campaign.json'), 'utf8'));
  c.engine = `social@${SOCIAL_ENGINE.split('.').slice(0, 2).join('.')}`;
  writeFileSync(join(dir, 'campaign.json'), `${JSON.stringify(c, null, 2)}\n`);
  return dir;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    scaffold('.', { force: process.argv.includes('--force') });
    console.log('Wrote social/ from the example. Next: rewrite social/campaign.json for this brand, replace social/moments/metric.js with a real product moment, then npm run social:check and npm run social:build -- --stills.');
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  }
}
