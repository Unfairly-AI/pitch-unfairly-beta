// The arguments for deck_upload_start when publishing a site:
//   node bin/site-manifest.mjs > artifacts/site-start.json
// {"kind":"site","title","story","review_id","engine","audit","files":[{path,size,sha256}]}. Add the
// workspace (and a slug, if you want one) before passing it on; then save the
// reply as artifacts/uploads.json and run: node bin/upload.mjs artifacts/uploads.json dist-site
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { siteAuditBlocker } from './site-audit.mjs';
import { distFileProblem } from './site/public-files.mjs';
import { ENGINE } from './site/version.mjs';
import { digestFromFiles } from './site/gate.mjs';

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
// Defense in depth: the build copies only public files, but a stale dist-site or a
// hand-copied file would otherwise publish as is (site/public-files.mjs).
const refused = files.map((f) => distFileProblem(f.path)).filter(Boolean);
if (refused.length) {
  console.error(`✗ Not publishing: dist-site/ holds files a site never publishes:\n${refused.map((r) => `  ${r}`).join('\n')}\nRun npm run site:audit to rebuild dist-site from the project, and keep research, the story and brand evidence out of site/assets.`);
  process.exit(1);
}
const site = JSON.parse(await readFile('site/site.json', 'utf8'));
const story = await readFile('story.md', 'utf8').catch(() => '');
// The host checks the review it issued (review_id) and the engine that built the site.
const review = JSON.parse(await readFile('artifacts/review.json', 'utf8').catch(() => '{}'));
// The audit result the host can check: the gate that ran and the digest of the files it passed
// (digestFromFiles over this same file list, so the host recomputes it without the bytes).
const stamp = JSON.parse(await readFile('artifacts/site-audit-pass.json', 'utf8'));
const audit = stamp.gate ? { gate: stamp.gate.gate, clean: stamp.gate.clean, dist_digest: stamp.gate.dist_digest, widths: stamp.gate.widths, at: stamp.at } : null;
if (audit && audit.dist_digest !== digestFromFiles(files)) {
  console.error('✗ Not publishing: dist-site changed after its last clean audit. Run npm run site:audit again.');
  process.exit(1);
}
// The slug the review was bound to, so deck_upload_start publishes the page the review covers.
const binding = JSON.parse(await readFile('artifacts/review-binding.json', 'utf8').catch(() => 'null'));
console.log(JSON.stringify({ kind: 'site', ...(binding?.deck ? { deck: binding.deck } : {}), title: `${site.sample ? 'Sample: ' : ''}${site.title}`, story, review_id: review.review_id ?? null, engine: ENGINE, audit, files }, null, 2));
