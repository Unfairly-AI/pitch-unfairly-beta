// The existing design-review artifact gates both decks and new proposal sites.
import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { ENGINE } from './site/version.mjs';

const pngs = async (dir) => (await readdir(dir).catch(() => [])).filter((n) => n.endsWith('.png')).sort();

/** The exact source a site review looks at: the site fingerprint (site/ and brand/) and story.md. */
export async function siteSourceState() {
  const { siteFingerprint } = await import('./site-audit.mjs');
  const story = await readFile('story.md').catch(() => null);
  return { fingerprint: await siteFingerprint(), story_sha256: story ? createHash('sha256').update(story).digest('hex') : null };
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SERVER_REVIEW_MISSING = "artifacts/review.json isn't a server review (no review_id). Run deck_review_start/deck_review and save the JSON it returns.";

export const DEVICES = ['laptop', 'phone'];
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** { laptop: { name: sha256 }, phone: {...} } for the section screenshots in artifacts/site/. */
// Where review-files puts each device's copies for the shared deck reviewer.
export const REVIEW_DIRS = { laptop: 'stage', phone: 'mobile' };
export async function screenshotHashes(root = 'artifacts/site', dirs = { laptop: 'laptop', phone: 'phone' }) {
  const shots = {};
  for (const device of DEVICES) {
    shots[device] = {};
    for (const name of await pngs(join(root, dirs[device]))) shots[device][name] = sha256(await readFile(join(root, dirs[device], name)));
  }
  return shots;
}

/** The clean audit's stamp (site-audit.mjs), or null. */
export async function auditStamp() {
  return JSON.parse(await readFile('artifacts/site-audit-pass.json', 'utf8').catch(() => 'null'));
}

const sameKeys = (a, b) => JSON.stringify(Object.keys(a).sort()) === JSON.stringify(Object.keys(b).sort());
const sameShots = (a, b) => DEVICES.every((d) => a?.[d] && b?.[d] && sameKeys(a[d], b[d]) && Object.keys(a[d]).every((n) => a[d][n] === b[d][n]));

/**
 * Why a set of section screenshots isn't one complete audited set, or null:
 * laptop and phone each hold a screenshot of every section, the same names on
 * both, and every file is byte-identical to what the clean audit recorded.
 */
export function shotsProblem(shots, stampShots) {
  if (!stampShots || DEVICES.some((d) => typeof stampShots[d] !== 'object')) return 'the clean audit recorded no section screenshots (run npm run site:audit again)';
  for (const set of [shots, stampShots]) {
    if (DEVICES.some((d) => !Object.keys(set?.[d] ?? {}).length)) return 'the screenshots must include every section on both laptop and phone';
    if (!sameKeys(set.laptop, set.phone)) return 'the laptop and phone screenshots must cover the same sections';
  }
  if (!sameKeys(shots.laptop, stampShots.laptop)) return 'the screenshots are not the section set the clean audit took';
  if (!sameShots(shots, stampShots)) return 'a screenshot differs from the one the clean audit took';
  return null;
}

/**
 * artifacts/review-context.json for a site: one review covers one source state,
 * one engine version, and every laptop and phone section screenshot (names and hashes).
 */
/** { story: { decision, next_step, motion, audience } } from a site-format story.md, or nothing. */
async function storyHeader() {
  const text = await readFile('story.md', 'utf8').catch(() => '');
  if (!text) return {};
  const { parseStory } = await import('./story-check.mjs');
  const parsed = parseStory(text);
  if (parsed.format !== 'site') return {};
  const h = parsed.header;
  const story = Object.fromEntries(Object.entries({ decision: h.decision, next_step: h['next step'], motion: h.motion, audience: h.audience }).filter(([, v]) => v));
  return Object.keys(story).length ? { story } : {};
}

/**
 * { sample: true } for a sample site (site.json "sample"), so the reviewer knows
 * its band is the required disclosure, not the seller's design. Without it the
 * reviewer only learns that from the band's text, on a round that judges the
 * section the band sits in (core Clorox sample, review a12d4a61: 01-hero blocked
 * for "the yellow utility strip").
 */
async function sampleFlag() {
  const site = await readFile('site/site.json', 'utf8').then(JSON.parse).catch(() => null);
  return site?.sample ? { sample: true } : {};
}

export async function siteReviewContext({ now = new Date() } = {}) {
  return {
    format: 'site',
    ...await siteSourceState(),
    engine: ENGINE,
    created_at: now.toISOString(),
    coverage: { laptop: await pngs('artifacts/site/laptop'), phone: await pngs('artifacts/site/phone') },
    shots: await screenshotHashes(),
    ...(await sampleFlag()),
    // The plan's header, so the page judges can hold the page to its decision and next step.
    ...(await storyHeader()),
  };
}

async function newest(path) {
  const s = await stat(path).catch(() => null);
  if (!s) return 0;
  if (!s.isDirectory()) return s.mtimeMs;
  const children = (await readdir(path)).filter((n) => n !== 'capture' && join(path, n) !== join('src', 'brand'));
  return Math.max(s.mtimeMs, ...await Promise.all(children.map((n) => newest(join(path, n)))));
}

export async function designReviewBlocker({ site = false } = {}) {
  let review;
  try { review = JSON.parse(await readFile('artifacts/review.json', 'utf8')); }
  catch { return 'there is no design review (artifacts/review.json)'; }
  // Only the deck host's reviewer writes a review: deck_review returns the JSON to save,
  // with the review_id the host issued. A review an agent wrote for itself doesn't count.
  if (site && (!UUID.test(String(review?.review_id ?? '')) || /\b(local|self)\b/i.test(String(review?.reviewer ?? '')))) return SERVER_REVIEW_MISSING;
  if (review?.ready_to_publish !== true || !review.slides?.length || review.slides.some((s) => s.verdict !== 'ship' && s.severity !== 'polish')) return 'the last review has unresolved blocking findings or no verdicts';
  const reviewed = Date.parse(review.reviewed_at);
  if (!Number.isFinite(reviewed)) return 'the design review has no valid completion time';
  const edits = await Promise.all((site ? ['site', 'brand', 'story.md'] : ['src', 'brand', 'story.md']).map(newest));
  if (reviewed < Math.max(...edits)) return 'files changed after the last review';
  if (site) {
    const names = await pngs('artifacts/site/laptop');
    if (!names.length || names.some((n) => !review.slides.some((s) => s.slide === n))) return 'the design review does not cover every proposal section';
    let context;
    try { context = JSON.parse(await readFile('artifacts/review-context.json', 'utf8')); } catch {}
    if (context?.format !== 'site' || review.format !== 'site') return 'the proposal needs a site-format review';
    const coverage = context.coverage;
    if (typeof context.fingerprint !== 'string' || !context.engine || !Array.isArray(coverage?.laptop) || !Array.isArray(coverage?.phone) || !Number.isFinite(Date.parse(context.created_at))) {
      return 'the review evidence has no source fingerprint, engine, or coverage (artifacts/review-context.json is from an older review-files)';
    }
    if (context.engine !== ENGINE) return `the review was taken with sites engine ${context.engine} and this is ${ENGINE}`;
    const now = await siteSourceState();
    if (now.fingerprint !== context.fingerprint || (now.story_sha256 ?? null) !== (context.story_sha256 ?? null)) return "the site changed after the review's evidence was taken";
    // Both device sets complete and equal, and exactly the screenshots of the current clean audit.
    const shots = context.shots;
    if (!shots || DEVICES.some((d) => JSON.stringify(Object.keys(shots[d] ?? {}).sort()) !== JSON.stringify([...coverage[d]].sort()))) return "the review evidence's coverage and screenshot hashes disagree (run review-files -- --site again)";
    const stampShots = (await auditStamp())?.shots;
    const problem = shotsProblem(shots, stampShots) ?? shotsProblem(await screenshotHashes(), stampShots);
    if (problem) return `the review's evidence is not the current audit: ${problem}`;
    // The copies review-files sent to the reviewer are those same files.
    if (shotsProblem(await screenshotHashes('artifacts', REVIEW_DIRS), stampShots)) return "the screenshots sent for review (artifacts/stage, artifacts/mobile) aren't the audited ones (run review-files -- --site again)";
    const missing = coverage.laptop.filter((n) => !review.slides.some((s) => s.slide === n));
    if (missing.length) return `the design review does not cover every section in its evidence (missing ${missing.join(', ')})`;
    if (reviewed < Date.parse(context.created_at)) return 'the design review predates its evidence (reviewed_at is earlier than review-context.json)';
  }
  return null;
}
