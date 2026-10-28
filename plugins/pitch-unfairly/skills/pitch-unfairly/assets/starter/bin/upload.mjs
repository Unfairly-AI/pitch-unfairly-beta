// Upload a built deck to the signed URLs a host returned.
// Usage: node bin/upload.mjs uploads.json [dist] [--gate artifacts/gate/gate.json]
// uploads.json is the host's response (or just its "uploads" array):
// [{ path, upload_url, content_type }, ...]
import { readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

const positional = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && all[i - 1] !== '--gate');
const [listFile, dir = 'dist'] = positional;
if (!listFile) {
  console.error('Usage: node bin/upload.mjs uploads.json [dist]');
  process.exit(2);
}
// Publishing a deck needs a design review newer than every edit, with every
// slide marked ready (SKILL step 5). Review uploads (artifacts) skip this.
const kind = basename(resolve(dir));
let reviewRequired = kind === 'dist';
if (kind === 'dist-site') {
  const site = JSON.parse(await readFile('site/site.json', 'utf8'));
  const minor = /^sites@1\.(\d+)/.exec(site.engine ?? '')?.[1];
  reviewRequired = minor === undefined || Number(minor) >= 7;
}
// A site the host staged as a draft (deck_upload_start with draft: true; its reply says draft) goes
// to the page's private preview, never its client link, so it publishes without a review.
const draftReply = kind === 'dist-site' && await readFile(listFile, 'utf8').then((t) => JSON.parse(t)?.draft === true).catch(() => false);
if (draftReply) reviewRequired = false;
if (reviewRequired) {
  const { designReviewBlocker } = await import('./design-review.mjs');
  const problem = await designReviewBlocker({ site: kind === 'dist-site' });
  if (problem) {
    console.error(`Not publishing: ${problem}. Run the audit and review-files${kind === 'dist-site' ? ' -- --site' : ''}, then deck_review_start and deck_review, fix the findings, and review again.`);
    process.exit(1);
  }
}

// A refusal comes back from the host as plain text, not JSON: saved as the list, it's the reason to stop.
const raw = await readFile(listFile, 'utf8');
let parsed;
try {
  parsed = JSON.parse(raw);
} catch {
  console.error(`Not publishing: ${listFile} isn't the deck host's upload list. If deck_upload_start refused the upload, that's its message:\n${raw.trim().slice(0, 800)}`);
  process.exit(1);
}
// The host verifies the review_id deck_upload_start was given; if it refused the review, stop here.
const refusal = Array.isArray(parsed) ? null : parsed?.review_refused ?? (parsed?.uploads ? null : parsed?.error);
if (refusal) {
  console.error(`Not publishing: the deck host refused this upload: ${typeof refusal === 'string' ? refusal : JSON.stringify(refusal)}`);
  process.exit(1);
}
const uploads = Array.isArray(parsed) ? parsed : parsed.uploads;
// A site on engine 1.8 is published only once the host has verified its design review.
if (kind === 'dist-site') {
  const { unverifiedSiteReview } = await import('./site/public-files.mjs');
  const problem = draftReply ? null : unverifiedSiteReview(JSON.parse(await readFile('site/site.json', 'utf8').catch(() => '{}')), parsed);
  if (problem) {
    console.error(`Not publishing: ${problem}`);
    process.exit(1);
  }
}
if (!Array.isArray(uploads)) throw new Error(`${listFile} has no uploads list`);
if (kind === 'dist-site') {
  // The same allowlist site-manifest applies (site/public-files.mjs).
  const { distFileProblem } = await import('./site/public-files.mjs');
  const refused = uploads.map((u) => distFileProblem(String(u.path))).filter(Boolean);
  if (refused.length) {
    console.error(`Not publishing: these files never publish with a site:\n${refused.map((r) => `  ${r}`).join('\n')}`);
    process.exit(1);
  }
}

// Last, before any byte leaves: any other folder of pages (a multi-page site built around the engine, a hand-built page)
// publishes only with a clean QA gate stamp for exactly these files (npm run site:gate -- <dir>).
// The review uploads (artifacts) and the collateral engine's piece pages (beside their pages.json,
// checked by collateral:pages) have their own gates. An engine site (dist-site) is held to its audit stamp.
{
  const { existsSync } = await import('node:fs');
  const { distDigest, stampProblem } = await import('./site/gate.mjs');
  // A site goes to its client link only on a review bound to these exact files (the host checks
  // too); a draft (the host's reply says draft) goes to the preview and needs none.
  const draft = draftReply;
  if (kind === 'dist-site') {
    const { siteAuditBlocker } = await import('./site-audit.mjs');
    const problem = await siteAuditBlocker();
    if (problem) { console.error(`Not publishing: ${problem}`); process.exit(1); }
    const { reviewBindingProblem } = await import('./design-review.mjs');
    const unbound = await reviewBindingProblem(dir, { draft });
    if (unbound) { console.error(`Not publishing: ${unbound}.`); process.exit(1); }
  } else if (!['dist', 'artifacts'].includes(kind) && !existsSync(join(dir, '..', 'pages.json'))) {
    const at = process.argv.indexOf('--gate');
    const stampPath = at >= 0 ? process.argv[at + 1] : join('artifacts', 'gate', 'gate.json');
    const stamp = JSON.parse(await readFile(stampPath, 'utf8').catch(() => 'null'));
    const problem = stampProblem(stamp, await distDigest(dir).catch(() => null));
    if (problem) { console.error(`Not publishing ${dir}: ${problem}`); process.exit(1); }
  }
}

let next = 0;
const failed = [];
async function worker() {
  while (next < uploads.length) {
    const { path, upload_url, content_type } = uploads[next++];
    const body = await readFile(join(dir, path));
    let response;
    for (let attempt = 1; attempt <= 3; attempt++) {
      response = await fetch(upload_url, { method: 'PUT', headers: { 'Content-Type': content_type }, body });
      // A retry after a lost response finds the file already stored.
      if (response.ok || (attempt > 1 && response.status === 409)) break;
    }
    if (!response.ok && response.status !== 409) failed.push(`${path}: HTTP ${response.status} ${await response.text().catch(() => '')}`.slice(0, 300));
  }
}
await Promise.all(Array.from({ length: 6 }, worker));

// The deck's project (npm run source:pack), kept with this version so the
// team can update the deck later from any machine.
let source = '';
if (!Array.isArray(parsed) && parsed.source_upload) {
  const body = await readFile(join('artifacts', 'source.json')).catch(() => null);
  if (!body) {
    failed.push('source bundle: artifacts/source.json is missing. Run npm run -s source:pack, then npm run upload again.');
  } else {
    const response = await fetch(parsed.source_upload.upload_url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body });
    if (response.ok || response.status === 409) source = ' and the project files';
    else failed.push(`source bundle: HTTP ${response.status} ${await response.text().catch(() => '')}`.slice(0, 300));
  }
}

if (failed.length) {
  console.error(`${failed.length} upload(s) failed:`);
  failed.forEach((f) => console.error(`  ✗ ${f}`));
  process.exitCode = 1;
} else {
  console.log(`Uploaded ${uploads.length} files${source}.`);
}
