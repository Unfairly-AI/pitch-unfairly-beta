// Start an email or newsletter: npm run email:new [-- --force]
// Writes email/ from the example (email-kit/): email.json and three placeholder blocks
// (masthead, story, footer). They carry no look: write the blocks from the brand's own emails.
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EMAIL_ENGINE } from './email/version.mjs';

export const KIT = join(dirname(fileURLToPath(import.meta.url)), '..', 'email-kit');

export function scaffold(root, { force = false, kit = KIT } = {}) {
  const dir = join(root, 'email');
  if (!force && existsSync(join(dir, 'email.json'))) throw new Error('email/email.json already exists. Pass --force to replace it with the example.');
  cpSync(kit, dir, { recursive: true });
  const e = JSON.parse(readFileSync(join(dir, 'email.json'), 'utf8'));
  e.engine = `email@${EMAIL_ENGINE.split('.').slice(0, 2).join('.')}`;
  writeFileSync(join(dir, 'email.json'), `${JSON.stringify(e, null, 2)}\n`);
  return dir;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    scaffold('.', { force: process.argv.includes('--force') });
    console.log('Wrote email/ from the example. Next: set the subject, preheader and platform in email/email.json, write one block per file from the brand\'s own emails, then npm run email:build -- --html.');
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  }
}
