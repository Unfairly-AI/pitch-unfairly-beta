// The multi-width QA gate: every page of a built site, at every width, with
// every state opened, held to the geometry a reader sees. site:audit runs it on
// an engine site's dist-site; site:gate runs it on any built folder (a
// multi-page site, a hand-built page) and stamps the result, and nothing
// publishes without a clean stamp for those exact files.
//
// For each page (found by crawling internal links from "/") and each width it:
//   - loads the page, scrolls it through so lazy content and reveals arrive, and goes back to the top
//   - checks the first screen: sideways scroll, text off screen, clipped or colliding text, empty
//     grid cells, columns so narrow they set one word per line, tap targets under 44px (to 768 wide),
//     broken images, and the primary action below the first screen
//   - opens every <details>, then each menu, picker or disclosure ([aria-expanded]), each tab, each
//     pressed-state choice, and each form's empty submit, and checks the geometry again in each state
//   - screenshots the first screen for the contact sheet
// Per page it also runs the banned list (bin/site/banned.mjs) and finds the same photo twice, and the
// crawl reports every internal link or #fragment that doesn't resolve.
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { inPage } from './page-lint.mjs';
import { domBanned } from './banned.mjs';
import { ENGINE } from './version.mjs';
import { serveDir } from '../serve.mjs';

export const GATE = 'site-gate@1';
/** [width, height] of every screen the gate lays a page out on. */
export const GATE_SCREENS = [[320, 640], [360, 740], [390, 844], [768, 1024], [1024, 768], [1280, 800], [1440, 900], [1920, 1080]];
export const GATE_WIDTHS = GATE_SCREENS.map(([w]) => w);
/** Tap targets are held to 44px below this width (phones), as the CU QA rounds did. */
export const TOUCH_MAX = 767;
export const TAP_MIN = 44;
/** The checks a clean gate covers, by id. */
export const GATE_CHECKS = ['sideways-scroll', 'off-screen', 'clipped-text', 'colliding-text', 'empty-grid-cell', 'one-word-per-line', 'tap-target', 'primary-below-fold', 'duplicate-photo', 'broken-image', 'broken-link', 'script-error', 'banned'];
const STATE_LIMIT = 12;

// ---------- digests: what the stamp covers ----------

async function* walk(dir) {
  for (const e of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.name.startsWith('.')) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (e.isFile()) yield full;
  }
}
/**
 * sha256 over the sorted "path\0sha256" lines of a build's file list, joined by newlines: the
 * deck host's manifestHash (unfairly-app src/lib/deck-host/review-verify.ts), so the gate's
 * dist_digest and a review's binding are the same number, computable from the manifest alone.
 */
export function digestFromFiles(files) {
  const lines = files.map((f) => `${f.path}\0${String(f.sha256).toLowerCase()}`).sort();
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}
export const manifestHash = digestFromFiles;
/** The files of a built folder as a manifest lists them, and their digest. */
export async function distFiles(dir) {
  const files = [];
  for await (const f of walk(dir)) {
    const bytes = await readFile(f);
    files.push({ path: relative(dir, f).split(sep).join('/'), size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  return files.sort((a, b) => (a.path < b.path ? -1 : 1));
}
export const distDigest = async (dir) => digestFromFiles(await distFiles(dir));

/** Why a stamp doesn't let this folder publish, or null. */
export function stampProblem(stamp, digest) {
  if (!stamp) return 'there is no gate stamp. Run the gate (npm run site:gate, or site:audit for an engine site) until it says "Gate clean".';
  if (stamp.gate !== GATE) return `the stamp is from ${stamp.gate ?? 'an unknown gate'}, not ${GATE}. Run the gate again.`;
  if (!stamp.clean) return `the last gate run found ${stamp.counts?.errors ?? 'some'} problem(s). Fix them and run it again.`;
  if (stamp.dist_digest !== digest) return 'the built files changed after the last clean gate run. Run the gate again on this build.';
  return null;
}

// ---------- in-page checks ----------

// Geometry of the page as it stands (one state at one width). Runs in the page with the page-lint helpers.
const GEOMETRY = (H, { width, touch, tapMin }) => {
  const out = [];
  const add = (check, msg) => out.push({ check, msg });
  const { cs, visible } = H;
  const vw = document.documentElement.clientWidth;
  const label = (el) => `${H.where(el)} "${(el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('alt') || '').trim().replace(/\s+/g, ' ').slice(0, 36)}"`;
  const srOnly = (el) => { const r = el.getBoundingClientRect(); return r.width <= 2 && r.height <= 2; };
  const hidden = (el) => !!el.closest('[hidden], [aria-hidden="true"], .sr-only, .visually-hidden, [inert]') || srOnly(el);
  const pinned = (el) => { for (let n = el; n && n !== document.body; n = n.parentElement) { const p = cs(n).position; if (p === 'fixed' || p === 'sticky') return true; } return false; };
  const scroller = (el) => { for (let n = el.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) { const s = cs(n); if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) return true; } return false; };
  const ownText = (el) => H.ownText(el);
  const all = [...document.body.querySelectorAll('*')].filter((el) => !(el.closest('svg') && el.tagName.toLowerCase() !== 'svg') && !el.matches('script, style, noscript, template'));
  const shown = all.filter((el) => visible(el) && !hidden(el));

  // Sideways scroll, and what runs off the screen.
  if (document.documentElement.scrollWidth > vw + 1) add('sideways-scroll', `the page scrolls sideways (${document.documentElement.scrollWidth}px wide in ${vw}px)`);
  let off = 0;
  for (const el of shown) {
    if (pinned(el) || scroller(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 || r.left < -1) {
      // Report the outermost element that runs off, not each of its children.
      const parent = el.parentElement?.getBoundingClientRect();
      if (parent && (parent.right > vw + 1 || parent.left < -1) && el.parentElement !== document.body) continue;
      add('off-screen', `${label(el)} runs off the screen (${Math.round(r.left)} to ${Math.round(r.right)} in ${vw}px)`);
      if (++off >= 6) break;
    }
  }

  // Text that is cut off: its glyphs run past a box that hides overflow (its own or an ancestor's),
  // or a line clamp or ellipsis hides part of it. Judged by where the text is, not by scrollHeight,
  // so a button's off-box hover fill doesn't count.
  const leaves = shown.filter((el) => ownText(el) && /[\p{L}\p{N}]/u.test(ownText(el)));
  const textRect = (el) => {
    const rg = document.createRange();
    let box = null;
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || !n.textContent.trim()) continue;
      rg.selectNodeContents(n);
      for (const r of rg.getClientRects()) {
        if (r.width < 1) continue;
        box = box ? { left: Math.min(box.left, r.left), right: Math.max(box.right, r.right), top: Math.min(box.top, r.top), bottom: Math.max(box.bottom, r.bottom) } : { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      }
    }
    return box;
  };
  let clipped = 0;
  for (const el of leaves) {
    const s = cs(el);
    const t = textRect(el);
    if (!t) continue;
    let why = null;
    if (s.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) why = 'an ellipsis hides the end';
    else if (s.webkitLineClamp && s.webkitLineClamp !== 'none' && el.scrollHeight > el.clientHeight + 2) why = 'a line clamp hides the rest';
    else {
      for (let n = el, depth = 0; n && n !== document.body && depth < 6; n = n.parentElement, depth++) {
        const ns = cs(n);
        if (ns.display === 'inline') continue; // overflow doesn't apply to an inline box
        if (!/(hidden|clip)/.test(`${ns.overflowX} ${ns.overflowY}`) || /(auto|scroll)/.test(`${ns.overflowX} ${ns.overflowY}`)) continue;
        const b = n.getBoundingClientRect();
        // Glyph boxes overhang their line by a few pixels (descenders, tight leading): allow a quarter em.
        const slack = Math.max(2, parseFloat(s.fontSize) * 0.25);
        const outX = /(hidden|clip)/.test(ns.overflowX) && (t.right > b.right + slack || t.left < b.left - slack);
        const outY = /(hidden|clip)/.test(ns.overflowY) && (t.bottom > b.bottom + slack || t.top < b.top - slack);
        if (outX || outY) { why = `its text runs ${Math.round(outX ? Math.max(t.right - b.right, b.left - t.left) : Math.max(t.bottom - b.bottom, b.top - t.top))}px past ${n === el ? 'its own box' : H.where(n)}`; break; }
      }
    }
    if (why) { add('clipped-text', `${label(el)} is cut off: ${why}`); if (++clipped >= 6) break; }
  }

  // Text laid over other text.
  const boxes = [];
  for (const el of leaves) {
    if (pinned(el)) continue;
    const rg = document.createRange();
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || !n.textContent.trim()) continue;
      rg.selectNodeContents(n);
      for (const r of rg.getClientRects()) if (r.width > 2 && r.height > 2) boxes.push({ el, r });
    }
  }
  boxes.sort((a, b) => a.r.top - b.r.top);
  // An open menu, listbox, popover or dialog is meant to lie over the page.
  const overlay = (el) => !!el.closest('[role="listbox"], [role="menu"], [role="dialog"], [role="tooltip"], [popover], dialog, [aria-modal="true"]') || (() => { for (let n = el; n && n !== document.body; n = n.parentElement) { const st = cs(n); if (st.position === 'absolute' && st.zIndex !== 'auto' && +st.zIndex > 0) return true; } return false; })();
  const hit = new Set();
  for (let i = 0; i < boxes.length && hit.size < 6; i++) {
    const a = boxes[i];
    for (let j = i + 1; j < boxes.length; j++) {
      const b = boxes[j];
      if (b.r.top >= a.r.bottom) break;
      if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
      if (overlay(a.el) || overlay(b.el)) continue;
      const x = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const y = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (x > 4 && y > 4 && y > 0.4 * Math.min(a.r.height, b.r.height)) {
        const key = [a.el, b.el].map((e) => H.where(e)).sort().join('|');
        if (hit.has(key)) continue;
        hit.add(key);
        add('colliding-text', `${label(a.el)} overlaps ${label(b.el)} by ${Math.round(x)}×${Math.round(y)}px`);
        break;
      }
    }
  }

  // Grids with a hole: a cell no item covers, in any row (the last row included: a 3-up of 7 leaves two).
  let grids = 0;
  for (const g of shown) {
    const s = cs(g);
    if (!/grid/.test(s.display)) continue;
    const tracks = s.gridTemplateColumns.split(' ').filter((x) => /px$/.test(x)).map(parseFloat);
    const kids = [...g.children].filter((k) => visible(k) && !['absolute', 'fixed'].includes(cs(k).position));
    if (tracks.length < 2 || kids.length < 3 || tracks.some((w) => w < 24)) continue;
    // A carousel track scrolls or slides its items through a window; its cells aren't a layout.
    if ([g, g.parentElement].some((n) => n && /(auto|scroll|hidden|clip)/.test(cs(n).overflowX)) || /column/.test(s.gridAutoFlow)) continue;
    const gr = g.getBoundingClientRect();
    const gap = parseFloat(s.columnGap) || 0;
    const rtl = s.direction === 'rtl';
    let x = gr.left + parseFloat(s.borderLeftWidth) + parseFloat(s.paddingLeft);
    const cols = (rtl ? [...tracks].reverse() : tracks).map((w) => { const c = [x, x + w]; x += w + gap; return c; });
    const rects = kids.map((k) => k.getBoundingClientRect()).sort((a, b) => a.top - b.top);
    // Rows: items whose heights overlap (align-items: center staggers their tops).
    const rows = [];
    for (const r of rects) {
      const row = rows.find((w) => r.top < w.bottom - 2 && r.bottom > w.top + 2);
      if (row) { row.items.push(r); row.top = Math.min(row.top, r.top); row.bottom = Math.max(row.bottom, r.bottom); } else rows.push({ top: r.top, bottom: r.bottom, items: [r] });
    }
    let empty = 0;
    for (const row of rows) for (const [l, r] of cols) if (!row.items.some((k) => Math.min(k.right, r) - Math.max(k.left, l) > (r - l) * 0.5)) empty++;
    if (empty > 0) { add('empty-grid-cell', `${H.where(g)} (${tracks.length} columns, ${kids.length} items) leaves ${empty} empty cell${empty > 1 ? 's' : ''}`); if (++grids >= 6) break; }
  }

  // A column so narrow it sets about one word per line.
  let narrow = 0;
  const inlineOnly = (el) => [...el.children].every((c) => /^inline/.test(cs(c).display) || c.matches('br'));
  for (const el of leaves) {
    if (!inlineOnly(el)) continue;
    const words = (el.innerText || '').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
    if (words.length < 3 || words.length > 40) continue;
    const rg = document.createRange();
    rg.selectNodeContents(el);
    const tops = [...rg.getClientRects()].filter((r) => r.width > 1 && r.height > 1).map((r) => r.top).sort((a, b) => a - b);
    const step = parseFloat(cs(el).fontSize) * 0.6;
    const lines = tops.filter((t, i) => i === 0 || t - tops[i - 1] > step).length;
    // Short text: every word on its own line. Longer text: under one and a half words a line.
    if (lines >= 3 && (words.length <= 8 ? lines >= words.length : words.length / lines < 1.5)) { add('one-word-per-line', `${label(el)} sets ${words.length} words on ${lines} lines (${Math.round(el.getBoundingClientRect().width)}px wide)`); if (++narrow >= 6) break; }
  }

  // Tap targets on a touch screen.
  if (touch) {
    const small = [];
    for (const el of document.querySelectorAll('a[href], button, summary, input:not([type="hidden"]), select, textarea, [role="tab"], [role="button"], label[for]')) {
      if (!visible(el) || hidden(el)) continue;
      // A link inside running text is sized by its line; WCAG exempts it, and so do we.
      if (el.matches('a') && el.closest('p, li p, td, dd, blockquote, figcaption') && cs(el).display === 'inline') continue;
      if (el.matches('input[type="checkbox"], input[type="radio"]') && el.closest('label')) continue;
      const r = el.getBoundingClientRect();
      if (r.height < tapMin - 0.5 || r.width < tapMin - 0.5) small.push(`${label(el)} is ${Math.round(r.width)}×${Math.round(r.height)}px`);
    }
    small.slice(0, 8).forEach((x) => add('tap-target', `tap target under ${tapMin}px: ${x}`));
    if (small.length > 8) add('tap-target', `tap target under ${tapMin}px: ${small.length - 8} more`);
  }

  for (const img of document.images) if (img.complete && !img.naturalWidth && visible(img)) add('broken-image', `image ${img.getAttribute('src')} didn't load`);
  return out;
};

// The page's primary action and where it starts, at the top of the page.
const PRIMARY = (H) => {
  if (document.querySelector('[data-no-primary]')) return null;
  const { cs, visible } = H;
  // The header's own action counts: a filled button there is on every first screen it shows on.
  const main = document.querySelector('main') ?? document.body;
  const header = document.querySelector('body > header, header[role="banner"]');
  const filled = (el) => { const s = cs(el); return (H.color.parse(s.backgroundColor)?.alpha ?? 0) > 0.3 || /gradient\(/.test(s.backgroundImage); };
  // A form's own controls (a custom select's button) aren't actions; its submit is.
  const inHeader = header ? [...header.querySelectorAll('[data-cta], [data-primary], a[href], button')].filter((el) => visible(el) && filled(el) && el.getBoundingClientRect().bottom + scrollY <= innerHeight) : [];
  if (inHeader.length) return null;
  const cands = [...main.querySelectorAll('[data-cta], [data-primary], a[href], button, input[type="submit"]')].filter((el) => visible(el) && !el.closest('nav, [hidden], details:not([open]), [aria-hidden="true"]') && (!el.closest('form') || el.matches('[type="submit"], button:not([type])')));
  const primary = cands.find((el) => el.matches('[data-primary]')) ?? cands.find((el) => el.matches('[data-cta]') && filled(el)) ?? cands.find((el) => filled(el) && parseFloat(cs(el).paddingLeft) >= 8 && el.getBoundingClientRect().height >= 28);
  if (!primary) return null;
  const r = primary.getBoundingClientRect();
  // On a form page the form is the action: its first field in the first screen is enough.
  const form = primary.closest('form');
  const field = form && [...form.querySelectorAll('input:not([type="hidden"]), select, textarea, [role="combobox"]')].find(visible);
  if (field && field.getBoundingClientRect().top + scrollY < innerHeight) return null;
  return { label: `${H.where(primary)} "${(primary.innerText || primary.value || '').trim().slice(0, 36)}"`, bottom: Math.round(r.bottom + scrollY), screen: innerHeight };
};

// Photos shown twice on the page, by file (size variants and formats of one photo count as one).
const PHOTOS = (H) => {
  const { cs, visible } = H;
  const key = (url) => {
    try {
      const u = new URL(url, location.href);
      if (u.protocol === 'data:') return null;
      let name = decodeURIComponent(u.pathname.split('/').pop() ?? '').toLowerCase();
      if (/\.svg$/.test(name) || /logo|icon|favicon|sprite|grain|texture|noise|pattern/.test(name)) return null;
      name = name.replace(/\.(jpe?g|png|webp|avif|gif)$/, '').replace(/([-_@](\d{2,4}w?|\d+x\d+|\dx|lqip|thumb|small|medium|large|sm|md|lg|xl))+$/g, '');
      return name || null;
    } catch { return null; }
  };
  const seen = new Map();
  const note = (k, el) => { if (!k) return; seen.set(k, [...(seen.get(k) ?? []), H.where(el)]); };
  for (const img of document.images) {
    if (!visible(img) || img.closest('[aria-hidden="true"], [hidden]')) continue;
    const r = img.getBoundingClientRect();
    if (r.width < 120 || r.height < 80) continue;
    note(key(img.currentSrc || img.src), img);
  }
  for (const el of document.querySelectorAll('main *, body > section, body > div')) {
    const s = cs(el);
    if (!s.backgroundImage || s.backgroundImage === 'none' || /repeat/.test(s.backgroundRepeat) && !/no-repeat/.test(s.backgroundRepeat)) continue;
    const r = el.getBoundingClientRect();
    if (!visible(el) || r.width < 200 || r.height < 150) continue;
    for (const m of s.backgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/g)) note(key(m[1]), el);
  }
  return [...seen.entries()].filter(([, w]) => w.length > 1).map(([k, w]) => `the photo "${k}" appears ${w.length} times (${w.slice(0, 3).join(', ')})`);
};

// ---------- driving a page ----------

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Hold navigation still while the gate clicks: no submit leaves, no link opens another page. */
const HOLD = () => {
  window.addEventListener('submit', (e) => { if (!e.defaultPrevented) e.preventDefault(); window.__gateSubmitted = (window.__gateSubmitted ?? 0) + 1; });
  window.addEventListener('click', (e) => {
    const a = e.target instanceof Element ? e.target.closest('a[href]') : null;
    if (!a || e.defaultPrevented) return;
    const href = a.getAttribute('href') ?? '';
    if (!href.startsWith('#')) e.preventDefault();
  });
};

async function scrollThrough(page) {
  await page.evaluate(async () => {
    const pause = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let y = 0; y < document.documentElement.scrollHeight; y += Math.round(innerHeight * 0.6)) { scrollTo(0, y); await pause(60); }
    scrollTo(0, document.documentElement.scrollHeight);
    await pause(250);
    for (const img of document.images) if (img.loading === 'lazy') img.loading = 'eager';
    await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); setTimeout(r, 3000); }))));
    await document.fonts.ready;
    scrollTo(0, 0);
    await pause(200);
  });
}

const geometry = (page, width) => inPage(page, GEOMETRY, { width, touch: width <= TOUCH_MAX, tapMin: TAP_MIN });

/** Every state a reader can open, one at a time; calls check(stateName) in each. */
async function exerciseStates(page, check) {
  // 1. Every disclosure open at once.
  await page.evaluate(async () => {
    for (const s of document.querySelectorAll('details:not([open]) > summary')) { s.click(); await new Promise((r) => setTimeout(r, 20)); }
    for (const d of document.querySelectorAll('details')) d.open = true;
  });
  await scrollThrough(page);
  await check('details open');
  // 2. Menus, pickers and disclosures that aren't <details>, each on its own.
  const toggles = await page.$$eval('[aria-expanded="false"]', (els) => els.map((el, i) => (el.dataset.gateToggle = String(i))).length);
  for (let i = 0; i < Math.min(toggles, STATE_LIMIT); i++) {
    const sel = `[data-gate-toggle="${i}"]`;
    const name = await page.$eval(sel, (el) => (el.getAttribute('aria-label') || el.innerText || el.className || 'toggle').trim().replace(/\s+/g, ' ').slice(0, 30)).catch(() => null);
    if (!name) continue;
    const opened = await page.$eval(sel, (el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || el.closest('[hidden]')) return false;
      el.scrollIntoView({ block: 'center' });
      el.click();
      return true;
    }).catch(() => false);
    if (!opened) continue;
    await wait(250);
    await check(`"${name}" open`);
    await page.$eval(sel, (el) => { if (el.getAttribute('aria-expanded') === 'true') el.click(); }).catch(() => {});
    await page.keyboard.press('Escape').catch(() => {});
    await wait(120);
  }
  // 3. Each tab, and each pressed-state choice (a picker's options).
  for (const [attr, what] of [['[role="tab"][aria-selected="false"]', 'tab'], ['[aria-pressed="false"]', 'choice']]) {
    const n = await page.$$eval(attr, (els, k) => els.map((el, i) => el.setAttribute(`data-gate-${k}`, String(i))).length, what);
    for (let i = 0; i < Math.min(n, STATE_LIMIT); i++) {
      const name = await page.$eval(`[data-gate-${what}="${i}"]`, (el) => {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return null;
        el.scrollIntoView({ block: 'center' });
        el.click();
        return (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 30);
      }).catch(() => null);
      if (name == null) continue;
      await wait(200);
      await check(`${what} "${name}"`);
    }
  }
  // 4. Each form, submitted empty: its error state.
  const forms = await page.$$eval('form', (fs) => fs.map((f, i) => (f.dataset.gateForm = String(i))).length);
  for (let i = 0; i < Math.min(forms, 3); i++) {
    const did = await page.evaluate((i) => {
      const f = document.querySelector(`form[data-gate-form="${i}"]`);
      const btn = f?.querySelector('[type="submit"], button:not([type="button"])');
      if (!btn) return false;
      f.setAttribute('novalidate', '');
      btn.scrollIntoView({ block: 'center' });
      btn.click();
      return true;
    }, i).catch(() => false);
    if (!did) continue;
    await wait(300);
    await check(`form ${i + 1} submitted empty`);
  }
}

// ---------- the crawl ----------

/** Pages reachable from start through internal links, and every internal link or #fragment that doesn't resolve. */
export async function crawl(browser, base, { start = '/', maxPages = 200 } = {}) {
  const page = await browser.newPage();
  const origin = new URL(base).origin;
  // /a/ and /a/index.html are one page.
  const canonical = (p) => p.replace(/\/index\.html$/, '/');
  const queue = [canonical(new URL(start, base).pathname)];
  const pages = [];
  const seen = new Set();
  const status = new Map();
  const fragments = [];
  const ids = new Map();
  const head = async (path) => {
    if (!status.has(path)) {
      const res = await fetch(origin + path).catch(() => null);
      status.set(path, res ? { code: res.status, html: /text\/html/.test(res.headers.get('content-type') ?? ''), body: /text\/html/.test(res.headers.get('content-type') ?? '') ? await res.text() : null } : { code: 0 });
    }
    return status.get(path);
  };
  const broken = [];
  while (queue.length && pages.length < maxPages) {
    const path = queue.shift();
    if (seen.has(path)) continue;
    seen.add(path);
    const res = await head(path);
    if (!res.html || res.code >= 400) continue;
    pages.push(path);
    await page.goto(origin + path, { waitUntil: 'networkidle0', timeout: 45000 }).catch(() => {});
    const found = await page.evaluate(() => ({
      links: [...document.querySelectorAll('a[href]')].map((a) => ({ href: a.href, raw: a.getAttribute('href'), text: (a.innerText || a.textContent || a.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 30) })),
      ids: [...document.querySelectorAll('[id], a[name]')].map((e) => e.id || e.getAttribute('name')),
    })).catch(() => ({ links: [], ids: [] }));
    ids.set(path, new Set(found.ids));
    for (const l of found.links) {
      let u;
      try { u = new URL(l.href); } catch { continue; }
      if (u.origin !== origin || !/^https?:$/.test(u.protocol)) continue;
      const target = canonical(u.pathname);
      const r = await head(target);
      if (r.code >= 400 || r.code === 0) broken.push({ from: path, href: l.raw, text: l.text, code: r.code });
      else if (r.html && !seen.has(target)) queue.push(target);
      if (u.hash.length > 1) fragments.push({ from: path, target, id: decodeURIComponent(u.hash.slice(1)), href: l.raw, text: l.text });
    }
  }
  for (const f of fragments) {
    const known = ids.get(f.target) ?? new Set([...(status.get(f.target)?.body ?? '').matchAll(/\s(?:id|name)="([^"]+)"/g)].map((m) => m[1]));
    if (!known.has(f.id) && f.id !== 'top') broken.push({ from: f.from, href: f.href, text: f.text, code: '#' });
  }
  await page.close();
  return { pages, broken };
}

// ---------- the gate ----------

/**
 * Run the gate on a served site. base: its URL. Options:
 *   pages      paths to check (default: everything the crawl reaches)
 *   screens    [[width, height], ...] (default GATE_SCREENS)
 *   entries    banned entries (bannedEntries(kit).entries); [] skips the banned list
 *   out        a folder for screenshots and the contact sheet (default: none written)
 *   workers    pages checked at once (default 3)
 * Returns { pages, findings: [{ page, check, message, widths, states }], broken, sheet }.
 */
export async function runGate(browser, base, { pages: only = null, screens = GATE_SCREENS, entries = [], out = null, workers = 3, log = () => {} } = {}) {
  if (out) await mkdir(join(out, 'shots'), { recursive: true });
  const { pages: crawled, broken } = await crawl(browser, base);
  const pages = only ?? crawled;
  const found = new Map();
  const add = (page, check, message, width, state) => {
    const k = `${page}\0${check}\0${message.replace(/\d+(\.\d+)?px/g, 'Npx').replace(/\(\d+ to \d+ in \d+px\)/, '')}`;
    const f = found.get(k) ?? { page, check, message, widths: new Set(), states: new Set() };
    if (width) f.widths.add(width);
    if (state) f.states.add(state);
    found.set(k, f);
  };
  for (const b of broken) add(b.from, 'broken-link', `link "${b.text}" to ${b.href} ${b.code === '#' ? 'points at a #fragment the page doesn\'t have' : `returns ${b.code || 'nothing'}`}`);
  const shots = [];
  const jobs = [];
  for (const p of pages) for (const s of screens) jobs.push([p, s]);
  for (const p of pages) jobs.push([p, 'banned']);
  let next = 0;
  const one = async ([path, screen]) => {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(HOLD);
    const errs = new Set();
    page.on('pageerror', (e) => errs.add(e.message.split('\n')[0]));
    page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.add(m.text().slice(0, 160)));
    page.on('response', (r) => r.status() >= 400 && r.url().startsWith(base) && errs.add(`${r.status()} for ${r.url().slice(base.length)}`));
    try {
      if (screen === 'banned') {
        // The banned list reads motion and hover rules, so this visit keeps motion on: laptop, then phone.
        for (const [w, h] of [[1280, 800], [390, 844]]) {
          await page.setViewport({ width: w, height: h, isMobile: w < 768, hasTouch: w < 768 });
          await page.goto(base + path, { waitUntil: 'networkidle0', timeout: 45000 });
          // Reveals are caught before the scroll runs them: a photo still displaced, clipped or masked.
          const before = entries.filter((e) => e.detect?.dom === 'image-reveal');
          for (const f of await domBanned(page, before, { width: w })) add(path, 'banned', f.message, w, 'load');
          await scrollThrough(page);
          await wait(400);
          for (const f of await domBanned(page, entries.filter((e) => !before.includes(e)), { width: w })) add(path, 'banned', f.message, w, 'load');
          if (w === 1280) {
            await page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)));
            for (const f of await domBanned(page, entries.filter((e) => ['placeholder', 'wall-of-text', 'text', 'selector', 'accent-text', 'accent-underline'].includes(e.detect?.dom)), { width: w })) add(path, 'banned', f.message, w, 'details open');
          }
        }
        return;
      }
      const [width, height] = screen;
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      await page.setViewport({ width, height, isMobile: width < 768, hasTouch: width < 768, deviceScaleFactor: 1 });
      await page.goto(base + path, { waitUntil: 'networkidle0', timeout: 45000 });
      await scrollThrough(page);
      for (const g of await geometry(page, width)) add(path, g.check, g.msg, width, 'load');
      const primary = await inPage(page, PRIMARY);
      if (primary && primary.bottom > primary.screen) add(path, 'primary-below-fold', `the primary action ${primary.label} ends ${primary.bottom}px down, below the first screen`, width, 'load');
      if (out) {
        const file = join(out, 'shots', `${path.replace(/^\//, '').replace(/\/$/, '/index').replace(/\.html$/, '').replace(/[^\w-]+/g, '_') || 'index'}-${width}.jpg`);
        await page.screenshot({ path: file, type: 'jpeg', quality: 70 });
        shots.push({ page: path, width, file });
      }
      await exerciseStates(page, async (state) => {
        for (const g of await geometry(page, width)) add(path, g.check, g.msg, width, state);
        if (state === 'details open' && (width === 390 || width === 1280)) for (const d of await inPage(page, PHOTOS)) add(path, 'duplicate-photo', d, width, state);
      });
      for (const e of errs) add(path, 'script-error', e, width);
    } catch (e) {
      add(path, 'script-error', `the gate couldn't check this page: ${e.message.split('\n')[0]}`, Array.isArray(screen) ? screen[0] : null);
    } finally {
      await page.close().catch(() => {});
    }
  };
  await Promise.all(Array.from({ length: workers }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      log(`${job[0]} ${Array.isArray(job[1]) ? job[1][0] : job[1]}`);
      await one(job);
    }
  }));
  const findings = [...found.values()].map((f) => ({ ...f, widths: [...f.widths].sort((a, b) => a - b), states: [...f.states] })).sort((a, b) => a.page.localeCompare(b.page) || a.check.localeCompare(b.check));
  let sheet = null;
  if (out) sheet = await contactSheet(browser, out, pages, screens, shots, findings);
  return { pages, findings, broken, sheet };
}

/** One image: a row per page, a column per width, each the first screen, outlined red where the gate found something. */
async function contactSheet(browser, out, pages, screens, shots, findings) {
  const count = (p, w) => findings.filter((f) => f.page === p && (f.widths.includes(w) || !f.widths.length)).length;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const cell = 150;
  const rows = pages.map((p) => `<tr><th>${esc(p)}<br><small>${findings.filter((f) => f.page === p).length} finding(s)</small></th>${screens.map(([w, h]) => {
    const s = shots.find((x) => x.page === p && x.width === w);
    const n = count(p, w);
    return `<td class="${n ? 'bad' : 'ok'}"><div class="frame" style="width:${cell}px;height:${Math.round((cell * h) / w)}px">${s ? `<img src="${esc(relative(out, s.file).split(sep).join('/'))}">` : ''}</div><span>${w}${n ? ` · ${n}` : ''}</span></td>`;
  }).join('')}</tr>`).join('\n');
  const html = `<!doctype html><meta charset="utf-8"><title>Gate contact sheet</title><style>
    body { font: 13px/1.3 system-ui, sans-serif; margin: 16px; background: #fff; color: #111; }
    table { border-collapse: collapse; } th { text-align: left; vertical-align: top; padding: 6px 10px 6px 0; max-width: 220px; word-break: break-all; }
    td { vertical-align: top; padding: 4px; } .frame { overflow: hidden; outline: 1px solid #ccc; background: #f4f4f4; }
    .frame img { width: 100%; display: block; } td.bad .frame { outline: 3px solid #d00; } td span { display: block; font-size: 11px; color: #555; } td.bad span { color: #d00; font-weight: 600; }
  </style><h1 style="font-size:16px">${pages.length} pages × ${screens.length} widths, first screen. Red: the gate found something at that width.</h1><table>${rows}</table>`;
  const htmlFile = join(out, 'contact-sheet.html');
  await writeFile(htmlFile, html);
  const server = await serveDir(out);
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 260 + screens.length * (cell + 10), height: 800, deviceScaleFactor: 1 });
    await page.goto(`${server.url}/contact-sheet.html`, { waitUntil: 'networkidle0' });
    const png = join(out, 'contact-sheet.png');
    await page.screenshot({ path: png, fullPage: true });
    return png;
  } finally {
    await page.close();
    await server.close();
  }
}

/** The stamp a clean (or not) run writes, and the host can check against the uploaded files. */
export function gateStamp({ digest, pages, screens = GATE_SCREENS, findings, entries = [], at = new Date() }) {
  const errors = findings.length;
  return {
    gate: GATE,
    engine: ENGINE,
    clean: errors === 0,
    dist_digest: digest,
    widths: screens.map(([w]) => w),
    checks: GATE_CHECKS,
    banned: entries.filter((e) => e.detect?.dom).map((e) => e.id),
    pages,
    counts: { pages: pages.length, errors },
    at: at.toISOString(),
  };
}

/** Plain-text report, grouped by page. */
export function gateReport({ pages, findings }) {
  const lines = [];
  for (const p of pages) {
    const fs = findings.filter((f) => f.page === p);
    if (!fs.length) continue;
    lines.push(`${p}  (${fs.length})`);
    for (const f of fs) lines.push(`  ✗ [${f.check}] ${f.message}${f.widths.length ? `  @ ${f.widths.length === GATE_WIDTHS.length ? 'every width' : f.widths.join(', ')}` : ''}${f.states.some((s) => s !== 'load') ? `  (${f.states.filter((s) => s !== 'load').slice(0, 3).join('; ')})` : ''}`);
  }
  const extra = findings.filter((f) => !pages.includes(f.page));
  for (const f of extra) lines.push(`${f.page}: ✗ [${f.check}] ${f.message}`);
  return lines.join('\n');
}

export async function writeGateFiles(out, stamp, result) {
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'gate.json'), JSON.stringify({ ...stamp, findings: result.findings }, null, 2));
  await writeFile(join(out, 'report.txt'), `${gateReport(result)}\n`);
}
