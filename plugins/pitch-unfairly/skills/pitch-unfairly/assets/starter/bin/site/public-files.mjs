// What a published site may contain. site-build copies only these files into
// dist-site/, and site-manifest and upload refuse anything else, so a stale
// dist folder or a hand-copied file can't publish research, the story, or the
// brand's evidence. One list, read by all three, so they can't drift.
//
//   dist-site/index.html, index.txt, deck.pdf   the page, its text for agents, the PDF
//   dist-site/js/*.js|*.mjs                     the engine's script and model
//   dist-site/fonts/**                          bundled font files
//   dist-site/assets/**                         site/assets/: images, fonts, mp4/webm/mp3, pdf (anything else refused at build)
//   dist-site/brand/**                          brand/ images and fonts only; never capture/ or references/
//
// Nothing in the built page reads brand/brand.json or any other brand data file:
// brand tokens are inlined into index.html, and the page loads only logos,
// imagery, and font files (fontFaceCss) from brand/.

export const IMAGE_EXT = ['svg', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'ico'];
export const FONT_EXT = ['woff2', 'woff', 'ttf', 'otf'];
export const MEDIA_EXT = ['mp4', 'webm', 'mp3'];
// site/assets/ publishes as is, so it takes only these kinds: no html, md, json, txt, csv, js or css.
export const ASSET_EXT = [...IMAGE_EXT, ...FONT_EXT, ...MEDIA_EXT, 'pdf'];
// brand/ publishes only what the page loads from it: images and fonts.
export const BRAND_EXT = [...IMAGE_EXT, ...FONT_EXT];
// A folder or document named for the private plan or the brand's evidence, at any depth:
// research/strategy.pdf, seller-understanding/overview.png, story.md, facts-v2.json...
// A folder with such a name is private whatever it holds. In site/assets, a file is judged
// by its name only when it is a document or data (md, json, txt, pdf, csv, html...): page art
// named for what it shows (assets/story-roastery.webp, assets/notes-product.png) is page art.
// brand/ keeps the strict rule: an image there named research-1.png is the capture's evidence.
const PRIVATE_NAME = /^(research|story|facts|buyers|notes|seller[-_ ]?understanding|references|capture)([-_. ].*)?$/i;
const ART_EXT = [...IMAGE_EXT, ...FONT_EXT, ...MEDIA_EXT];
const ROOT_FILES = ['index.html', 'index.txt', 'deck.pdf'];

const ext = (path) => (/\.([^./]+)$/.exec(path)?.[1] ?? '').toLowerCase();

/**
 * Why a relative path is unsafe or names private material in any segment, or null.
 * art: the path is under site/assets, where image, video, audio and font files are page art.
 */
export function pathProblem(path, { art = false } = {}) {
  if (typeof path !== 'string' || !path) return 'an empty path';
  if (path.includes('\\') || path.includes('\0')) return `${path}: backslashes and NUL never appear in a published path`;
  if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) return `${path}: an absolute path`;
  const segments = path.split('/');
  for (const [i, seg] of segments.entries()) {
    if (!seg || seg === '.' || seg === '..') return `${path}: "${seg}" segments never appear in a published path`;
    if (seg.startsWith('.')) return `${path}: dotfiles and dot-folders stay private`;
    const last = i === segments.length - 1;
    if (art && last && ART_EXT.includes(ext(seg))) continue;
    const name = last ? seg.replace(/\.[^.]+$/, '') : seg;
    if (PRIVATE_NAME.test(name)) return `${path}: "${seg}" is named like private material (research, story, facts, buyers, notes, seller understanding, references, capture), which never publishes. Move it out of the site, or rename it if it is really page art`;
  }
  return null;
}

/** Why a file under brand/ (path relative to brand/, with "/") doesn't publish, or null when it does. */
export function brandFileProblem(rel) {
  const unsafe = pathProblem(rel);
  if (unsafe) return `brand/${unsafe}`;
  if (!BRAND_EXT.includes(ext(rel))) return `brand/${rel}: only images and fonts from brand/ publish (brand.json, notes, and research stay in the project)`;
  return null;
}

/** Why a file under site/assets/ (path relative to it) can't publish, or null when it can. */
export function siteAssetProblem(rel) {
  const unsafe = pathProblem(rel, { art: true });
  if (unsafe) return `site/assets/${unsafe}; everything in site/assets is published`;
  if (!ASSET_EXT.includes(ext(rel))) return `site/assets/${rel}: site/assets takes only images, fonts, video (mp4, webm), audio (mp3) and PDFs, because everything there is published. Keep notes and research outside site/, data in site/data or site.json, and styles in site/styles.css`;
  return null;
}

/** Why a file in dist-site/ (path relative to it, with "/") must not be published, or null when it may. */
export function distFileProblem(path) {
  const unsafe = pathProblem(path, { art: path.startsWith('assets/') });
  if (unsafe) return unsafe;
  if (ROOT_FILES.includes(path)) return null;
  const [top, ...restParts] = path.split('/');
  const rest = restParts.join('/');
  if (!rest) return `${path}: not a file a site publishes`;
  if (top === 'js') return ['js', 'mjs'].includes(ext(rest)) && !rest.includes('/') ? null : `${path}: not one of the engine's scripts`;
  if (top === 'fonts') return FONT_EXT.includes(ext(rest)) ? null : `${path}: only font files belong in fonts/`;
  if (top === 'assets') return siteAssetProblem(rest);
  if (top === 'brand') return brandFileProblem(rest);
  return `${path}: not a file a site publishes`;
}

/**
 * Why the deck host's upload reply doesn't let a site publish, or null. A site on
 * engine 1.8 (pinned sites@1.8+ or unpinned) needs the host to have verified its
 * design review (review_verified: true); an older pin publishes as before.
 */
export function unverifiedSiteReview(site, reply) {
  if (Array.isArray(reply) || reply?.review_verified === true) return null;
  const pin = String(site?.engine ?? '');
  const minor = /^sites@1\.(\d+)/.exec(pin)?.[1];
  const major = /^sites@(\d+)/.exec(pin)?.[1];
  const current = !pin || (major !== undefined && Number(major) > 1) || (minor !== undefined && Number(minor) >= 8);
  return current ? "the deck host didn't confirm this site's design review (no review_verified). Run site:manifest again so deck_upload_start gets the review_id, and use the reply it returns." : null;
}
