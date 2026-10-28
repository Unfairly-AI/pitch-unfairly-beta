// Print the files a design review needs, for deck_review_start (a site: -- --site --deck <slug>,
// which also writes artifacts/review-binding.json, the deck and files deck_review binds to):
// [{ path, size }] for artifacts/stage/*.png, each slide's phone screenshot
// (artifacts/mobile/*.png, same names), and both contact sheets.
import { copyFile, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { auditStamp, shotsProblem, siteReviewContext } from './design-review.mjs';

const files = [];
const site = process.argv.includes('--site');
let context = { format: 'deck' };
if (site) {
  // One review covers one revision: the screenshots must come from a clean
  // audit of the source as it is now, never a mix of revisions.
  context = await siteReviewContext();
  const stamp = await auditStamp();
  if (stamp?.fingerprint !== context.fingerprint) {
    console.error(stamp
      ? 'The screenshots in artifacts/site are from another revision: the site changed after its last clean audit. Run npm run site:audit, then review-files -- --site again.'
      : 'No clean site audit to review. Run npm run site:audit until it says "All modes clean", then review-files -- --site.');
    process.exit(1);
  }
  // Exactly the audited section set on laptop and phone, byte for byte.
  const problem = shotsProblem(context.shots, stamp.shots);
  if (problem) {
    console.error(`Not a complete audited set of screenshots: ${problem}. Run npm run site:audit, then review-files -- --site again.`);
    process.exit(1);
  }
  // Reuse the deck review protocol with the site's real section screenshots.
  for (const [from, to] of [['laptop', 'stage'], ['phone', 'mobile']]) {
    const source = join('artifacts/site', from);
    const names = (await readdir(source).catch(() => [])).filter((n) => n.endsWith('.png')).sort();
    if (!names.length) throw new Error('No site screenshots. Run npm run site:audit first.');
    await rm(join('artifacts', to), { recursive: true, force: true });
    await mkdir(join('artifacts', to), { recursive: true });
    for (const name of names) await copyFile(join(source, name), join('artifacts', to, name));
  }
}
await mkdir('artifacts', { recursive: true });
// For a site: the binding the host records on the review's first deck_review call (deck and files).
if (site) {
  const { REVIEW_BINDING, reviewBinding } = await import('./design-review.mjs');
  const at = process.argv.indexOf('--deck');
  const binding = await reviewBinding('dist-site', at >= 0 ? process.argv[at + 1] : null);
  await writeFile(REVIEW_BINDING, JSON.stringify(binding, null, 2));
  console.error(binding.deck
    ? `Pass deck "${binding.deck}" and the files in ${REVIEW_BINDING} on this review's first deck_review call; publish with the same deck slug.`
    : `Pass --deck <the page's slug> so the review can be bound to this build (${REVIEW_BINDING} has the files but no deck).`);
}
// For a site: the fingerprint, story hash, engine, time and section list this review covers (design-review.mjs).
await writeFile('artifacts/review-context.json', JSON.stringify(context));
files.push({ path: 'review-context.json', size: (await stat('artifacts/review-context.json')).size });
// The local reviewer uses the same evidence as studio_check. These copies are
// review inputs under artifacts/, not additions to the published website.
await mkdir('artifacts', { recursive: true });
const evidence = [
  ['brand/brand.json', 'brand-kit.json'],
  ['brand/capture/page1-screen1.jpg', 'brand-reference-1.jpg'],
  ['brand/capture/page1-screen2.jpg', 'brand-reference-2.jpg'],
  ['brand/capture/page2-screen1.jpg', 'brand-reference-3.jpg'],
  ['brand/capture/page1-mobile-screen1.jpg', 'brand-reference-4.jpg'],
];
for (const [candidate, name] of evidence) {
  const retained = candidate.replace('brand/capture/', 'brand/references/');
  const retainedSet = await stat('brand/references/index.json').catch(() => null);
  const source = retainedSet ? retained : candidate;
  const info = await stat(source).catch(() => null);
  if (!info?.isFile()) { await rm(join('artifacts', name), { force: true }); continue; }
  await copyFile(source, join('artifacts', name));
  files.push({ path: name, size: info.size });
}
for (const dir of ['stage', 'mobile']) {
  for (const name of (await readdir(join('artifacts', dir)).catch(() => [])).filter((n) => n.endsWith('.png')).sort()) {
    files.push({ path: `${dir}/${name}`, size: (await stat(join('artifacts', dir, name))).size });
  }
}
for (const sheet of ['contact-sheet.png', 'contact-sheet-mobile.png']) {
  const s = site ? null : await stat(join('artifacts', sheet)).catch(() => null);
  if (s) files.push({ path: sheet, size: s.size });
}
if (!files.some((f) => f.path.startsWith('stage/'))) {
  console.error('No screenshots yet. Run npm run shots first.');
  process.exit(1);
}
console.log(JSON.stringify(files, null, 2));
