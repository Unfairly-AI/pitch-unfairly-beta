// The long-form engine's pure parts: reading longform/, the source checks, the
// paged CSS (page size, named pages per chapter for running headers, folios), the
// contents with page numbers, and the page body. No browser here, so the tests
// cover all of it; longform-build.mjs does the printing and the in-page checks.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cssFamily } from '../brand-lib.mjs';
import { esc, fillTokens, includeParts } from '../site/fill.mjs';
import { copyFindings } from '../site/copy.mjs';
import { sourceBanned } from '../site/banned.mjs';
import { siteAssetProblem } from '../site/public-files.mjs';
import { longformEngineProblem } from './version.mjs';

/** Page sizes in inches, portrait. */
export const PAGE_SIZES = { letter: { w: 8.5, h: 11 }, a4: { w: 8.27, h: 11.69 } };
export const DEFAULT_MARGINS = { top: 0.9, bottom: 0.85, left: 0.85, right: 0.85 };
/** A running title longer than this crowds the header: set data-running to a short one. */
export const RUNNING_MAX = 48;
export const CHAPTER_ID = /^[a-z][a-z0-9-]{0,40}$/;

export function pageGeometry(doc) {
  const size = PAGE_SIZES[doc.page ?? 'letter'];
  const m = { ...DEFAULT_MARGINS, ...(doc.margins ?? {}) };
  return { ...size, margins: m, content: { w: size.w - m.left - m.right, h: size.h - m.top - m.bottom } };
}

const plain = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/\s+/g, ' ').trim();
const attr = (tag, name) => new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tag)?.[1] ?? null;

/** A chapter file's section: { id, title, running, problems }. */
export function chapterMeta(html, file) {
  const problems = [];
  const opens = [...html.matchAll(/<section\b[^>]*\sdata-chapter\b[^>]*>/gi)];
  if (opens.length !== 1) {
    problems.push(`${file}: needs exactly one <section data-chapter>, found ${opens.length}`);
    return { id: null, title: '', running: '', problems };
  }
  const tag = opens[0][0];
  const id = attr(tag, 'id');
  if (!id || !CHAPTER_ID.test(id)) problems.push(`${file}: the chapter needs an id of lowercase letters, digits and dashes (it's the chapter's link and its page name), not ${id ? `"${id}"` : 'none'}`);
  const h2 = /<h2\b[^>]*>([\s\S]*?)<\/h2>/i.exec(html);
  if (!h2) problems.push(`${file}: the chapter has no <h2> title`);
  const title = h2 ? plain(h2[1]) : '';
  const running = attr(tag, 'data-running') ?? title;
  if (running.length > RUNNING_MAX) problems.push(`${file}: the running header "${running}" is ${running.length} characters; give the section a data-running under ${RUNNING_MAX}`);
  if (/\sdata-section\b/i.test(tag)) problems.push(`${file}: leave data-section off; the engine adds it`);
  return { id, title, running, problems };
}

/** Everything under longform/: the document, its parts, its chapters in file-name order. */
export function loadDocument(root = '.') {
  const dir = join(root, 'longform');
  if (!existsSync(join(dir, 'longform.json'))) throw new Error('No longform/longform.json. Start one with npm run longform:new.');
  const doc = JSON.parse(readFileSync(join(dir, 'longform.json'), 'utf8'));
  const read = (p) => (existsSync(join(dir, p)) ? readFileSync(join(dir, p), 'utf8') : '');
  const chapterDir = join(dir, 'chapters');
  const files = existsSync(chapterDir) ? readdirSync(chapterDir).filter((f) => f.endsWith('.html')).sort() : [];
  const chapters = files.map((file) => {
    const html = readFileSync(join(chapterDir, file), 'utf8');
    return { file: `chapters/${file}`, html, ...chapterMeta(html, `chapters/${file}`) };
  });
  const assets = [];
  const walk = (d, prefix = '') => {
    if (!existsSync(d)) return;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      if (e.isDirectory()) walk(join(d, e.name), `${prefix}${e.name}/`);
      else assets.push(`${prefix}${e.name}`);
    }
  };
  walk(join(dir, 'assets'));
  return { dir, doc, cover: read('cover.html'), back: read('back.html'), styles: read('styles.css'), chapters, assets: assets.sort(), readPart: (name) => read(`parts/${name.replace(/\.html$/, '')}.html`) || null };
}

/** Fill tokens and parts in one fragment: { html, missing }. */
export function fill(html, loaded) {
  const missing = [];
  const withParts = includeParts(html, loaded.readPart, missing);
  const r = fillTokens(withParts, loaded.doc);
  return { html: r.html, missing: [...missing, ...r.missing] };
}

/**
 * The source checks, before anything renders: { problems, warnings }.
 * entries: the banned list with the brand's rules (bannedEntries(kit)).
 */
export function sourceChecks(loaded, entries = []) {
  const problems = [];
  const warnings = [];
  const { doc, chapters } = loaded;
  const pin = longformEngineProblem(doc.engine);
  if (pin) problems.push(pin);
  if (!doc.title) problems.push('longform.json has no "title"');
  if (doc.page && !PAGE_SIZES[doc.page]) problems.push(`longform.json "page" is "${doc.page}"; use ${Object.keys(PAGE_SIZES).join(' or ')}`);
  if (!loaded.cover.trim()) problems.push('longform/cover.html is missing: a document opens on its cover');
  if (!chapters.length) problems.push('longform/chapters/ has no chapter files');
  const ids = new Map();
  for (const c of chapters) {
    problems.push(...c.problems);
    if (c.id && ids.has(c.id)) problems.push(`${c.file}: id "${c.id}" is also ${ids.get(c.id)}'s`);
    if (c.id) ids.set(c.id, c.file);
  }
  const parts = [['cover.html', loaded.cover], ...chapters.map((c) => [c.file, c.html]), ['back.html', loaded.back]].filter(([, h]) => h.trim());
  const filled = [];
  for (const [name, html] of parts) {
    const f = fill(html, loaded);
    for (const m of f.missing) problems.push(`${name}: ${m} didn't resolve`);
    filled.push({ name, kind: 'html', text: f.html });
    const copy = copyFindings(f.html);
    for (const x of [...copy.blocking, ...copy.strict]) problems.push(`${name} ${x}`);
    for (const x of copy.advisory) warnings.push(`${name} ${x}`);
    if (/\sstyle\s*=\s*"[^"]*background(?:-image)?\s*:[^"]*(?:url\(|gradient\()/i.test(f.html)) problems.push(`${name}: an inline background image or gradient prints as nothing in the PDF. Use a solid background-color, and an <img> for a photo.`);
  }
  if (loaded.styles) filled.push({ name: 'styles.css', kind: 'css', text: loaded.styles });
  for (const b of sourceBanned(filled, entries)) (b.severity === 'error' ? problems : warnings).push(b.message);
  for (const a of loaded.assets) {
    const p = siteAssetProblem(a);
    if (p) problems.push(`longform/assets/${a}: ${p}`);
  }
  return { problems, warnings };
}

const cssString = (s) => JSON.stringify(String(s ?? ''));

/**
 * The paged CSS: one @page per part. Margin boxes don't read custom properties,
 * so fonts and colors are written out from the kit.
 */
export function pageCss(doc, kit, chapters) {
  const g = pageGeometry(doc);
  const m = g.margins;
  const body = kit.typography?.body ?? {};
  const font = `"${cssFamily(body)}", sans-serif`;
  const muted = kit.palette.ink_muted ?? kit.palette.ink;
  const box = `font-family: ${font}; font-size: 8.5pt; letter-spacing: 0.02em; color: ${muted};`;
  const short = doc.short_title ?? doc.title;
  const lines = [
    '/* Generated by the long-form engine from longform.json and brand/brand.json. */',
    // The page itself takes the paper color, so the margins aren't white around a colored text block.
    `@page { size: ${g.w}in ${g.h}in; margin: ${m.top}in ${m.right}in ${m.bottom}in ${m.left}in; background-color: ${doc.paper ?? kit.palette.paper};`,
    `  @bottom-right { content: counter(page); ${box} vertical-align: top; padding-top: 0.25in; }`,
    '}',
    // The cover bleeds to the edge and carries no header or folio.
    '@page cover { margin: 0; @bottom-right { content: none; } }',
    `@page front { @top-left { content: ${cssString(short)}; ${box} vertical-align: bottom; padding-bottom: 0.2in; } }`,
    ...chapters.map((c, i) => `@page ch-${i + 1} { @top-left { content: ${cssString(short)}; ${box} vertical-align: bottom; padding-bottom: 0.2in; } @top-right { content: ${cssString(c.running)}; ${box} vertical-align: bottom; padding-bottom: 0.2in; } }`),
    `@page back { @top-left { content: ${cssString(short)}; ${box} vertical-align: bottom; padding-bottom: 0.2in; } }`,
    '@media print {',
    `  .lf-cover { page: cover; height: ${g.h}in; width: ${g.w}in; overflow: hidden; break-after: page; }`,
    '  .lf-contents { page: front; break-after: page; }',
    ...chapters.map((c, i) => `  #${c.id} { page: ch-${i + 1}; }`),
    '  .lf-back { page: back; break-before: page; }',
    '}',
  ];
  return `${lines.join('\n')}\n`;
}

/** The printed contents. pages: { [chapter id]: first page } or null while counting (placeholders the same width). */
export function contentsHtml(doc, chapters, pages = null) {
  const items = chapters
    .map((c, i) => `<li><a href="#${esc(c.id)}"><span class="lf-toc-n">${String(i + 1).padStart(2, '0')}</span><span class="lf-toc-t">${esc(c.title)}</span><span class="lf-toc-p">${pages ? pages[c.id] : '00'}</span></a></li>`)
    .join('\n');
  return `<section class="lf-contents print-only" aria-label="Contents">\n<h2 class="lf-contents-h">${esc(doc.contents_title ?? 'Contents')}</h2>\n<ol class="lf-toc">\n${items}\n</ol>\n</section>`;
}

/** The web contents: a rail on wide screens, a disclosure on phones. */
export function webNav(doc, chapters) {
  const list = chapters.map((c, i) => `<li><a href="#${esc(c.id)}"><span class="lf-toc-n">${String(i + 1).padStart(2, '0')}</span> ${esc(c.title)}</a></li>`).join('\n');
  return {
    rail: `<nav class="lf-rail" aria-label="Contents" data-print-hide>\n<p class="lf-rail-h">${esc(doc.contents_title ?? 'Contents')}</p>\n<ol>\n${list}\n</ol>\n</nav>`,
    mobile: `<details class="lf-toc-mobile" data-print-hide>\n<summary>${esc(doc.contents_title ?? 'Contents')}</summary>\n<ol>\n${list}\n</ol>\n</details>`,
  };
}

/** The top bar: the document's name and its PDF, the page's one primary action. */
export function topBar(doc) {
  return `<header class="lf-bar top" data-print-hide>\n<a class="lf-bar-title" href="#top">${esc(doc.short_title ?? doc.title)}</a>\n<a class="lf-download" href="deck.pdf" target="_blank" rel="noopener" data-cta="download_pdf" data-primary>${esc(doc.download_label ?? 'Download the PDF')}</a>\n</header>`;
}

/** Adds data-section (analytics count chapters as sections) to the chapter's opening tag. */
export const markChapter = (html) => html.replace(/<section\b([^>]*\sdata-chapter\b[^>]*)>/i, '<section$1 data-section>');

/** The first <section> of a part gets the engine's class and data-section. */
export function asPart(html, cls) {
  return html.replace(/<section\b([^>]*)>/i, (m, a) => {
    let attrs = /\sclass="/i.test(a) ? a.replace(/\sclass="/i, ` class="${cls} `) : `${a} class="${cls}"`;
    if (!/\sdata-section\b/i.test(attrs)) attrs += ' data-section';
    return `<section${attrs}>`;
  });
}

/** The page body, parts filled. pages: the contents' numbers, or null while counting. */
export function documentBody(loaded, pages = null) {
  const { doc, chapters } = loaded;
  const nav = webNav(doc, chapters);
  const cover = asPart(fill(loaded.cover, loaded).html, 'lf-cover');
  const back = loaded.back.trim() ? asPart(fill(loaded.back, loaded).html, 'lf-back') : '';
  const body = [
    topBar(doc),
    '<div class="lf-layout">',
    nav.rail,
    `<main id="top" class="lf-main">`,
    cover,
    nav.mobile,
    contentsHtml(doc, chapters, pages),
    ...chapters.map((c) => markChapter(fill(c.html, loaded).html)),
    back,
    '</main>',
    '</div>',
  ];
  return body.filter(Boolean).join('\n');
}

/**
 * First pages from the counts: front = cover + contents, then each chapter in order, then the back.
 * Page 1 is the cover, so a chapter's number is the physical page the reader turns to.
 */
export function startPages(frontPages, chapterPages, chapters, backPages = 0) {
  const out = {};
  let at = frontPages + 1;
  chapters.forEach((c, i) => {
    out[c.id] = at;
    at += chapterPages[i];
  });
  return { pages: out, total: at - 1 + backPages };
}
