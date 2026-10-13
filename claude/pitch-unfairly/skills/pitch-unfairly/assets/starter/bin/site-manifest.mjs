// The arguments for deck_upload_start when publishing a site:
//   node bin/site-manifest.mjs > artifacts/site-start.json
// {"kind":"site","title","story","files":[{path,size,sha256}]}. Add the
// workspace (and a slug, if you want one) before passing it on; then save the
// reply as artifacts/uploads.json and run: node bin/upload.mjs artifacts/uploads.json dist-site
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { siteAuditBlocker } from './site-audit.mjs';

const blocker = await siteAuditBlocker();
if (blocker) {
  console.error(`✗ Not publishing: ${blocker}`);
  process.exit(1);
}
if (!existsSync('dist-site/deck.pdf')) {
  console.error('✗ dist-site/deck.pdf is missing. Run npm run site:audit (it writes the PDF).');
  process.exit(1);
}
async function* walk(folder) {
  for (const e of await readdir(folder, { withFileTypes: true })) {
    const full = join(folder, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (e.isFile() && !e.name.startsWith('.')) yield full;
  }
}
const files = [];
for await (const f of walk('dist-site')) {
  const bytes = await readFile(f);
  files.push({ path: relative('dist-site', f).split(sep).join('/'), size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
files.sort((a, b) => a.path.localeCompare(b.path));
const site = JSON.parse(await readFile('site/site.json', 'utf8'));
const story = await readFile('story.md', 'utf8').catch(() => '');
console.log(JSON.stringify({ kind: 'site', title: `${site.sample ? 'Sample: ' : ''}${site.title}`, story, files }, null, 2));
