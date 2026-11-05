// The design fundamentals, checked on the rendered page: what a reader actually
// sees, at the width it runs at. Thresholds and sources are unfairly-app's
// docs/brand/design-fundamentals.md, and bin/fundamentals.mjs holds the same
// numbers for the kit.
//
// Errors (objectively broken for a reader):
//   - text contrast under WCAG 2.2 AA: 4.5:1, or 3:1 for large text (24px, or 18.66px bold),
//     measured against what is painted behind the text (stacked translucent layers composited;
//     text over a photo, video or gradient is skipped because it can't be measured reliably)
//   - running text over 100 characters a line
//   - running text under 14px on a phone (fine print and legal text excepted)
// Warnings (craft a design director sends back):
//   - running text at 14px on a phone (15px is the deck phone floor)
//   - text that passes WCAG 2 but reads weak by APCA (dark grounds, mid greys)
//   - running text over 85 characters a line
//   - a section with no dominant headline (under 1.2x the next size with under 200 weight between)
//   - a heading sitting closer to what precedes it than to what follows it
//   - a headline or lede whose last line is one short word
import { contrastScript } from '../contrast.mjs';

/** The engine minor these rules came with: they block sites unpinned or pinned 1.21+, and warn on older pins. */
export const FUNDAMENTALS_SINCE = 21;

const LIMIT = 6;

// Runs in the page. C is the shared contrast helper (bin/contrast.mjs).
const CHECK = ({ phone, limit, scope }) => {
  const C = window.__fundContrast;
  const errors = [];
  const warnings = [];
  const cs = (el) => getComputedStyle(el);
  const sectionOf = (el) => el.closest('[data-section]')?.dataset.section || el.closest('section')?.id || 'page';
  const where = (el) => {
    const cls = typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/)[0]}` : '';
    return `<${el.tagName.toLowerCase()}${cls}> in "${sectionOf(el)}"`;
  };
  const quote = (el) => `"${(el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)}"`;
  const visible = (el) => {
    if (!el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    return el.checkVisibility ? el.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true }) : cs(el).visibility !== 'hidden';
  };
  // Mock UI, decoration, disabled controls and screen-reader text aren't reading text (WCAG exempts them).
  const exempt = (el) => !!el.closest('[aria-hidden="true"], [hidden], [inert], [data-ui], [data-sample], [data-decor], .sr-only, .visually-hidden, svg, button:disabled, [aria-disabled="true"], script, style, noscript, template');
  const lines = (el) => {
    const rg = document.createRange();
    rg.selectNodeContents(el);
    const rects = [...rg.getClientRects()].filter((r) => r.width > 1 && r.height > 1);
    const step = (parseFloat(cs(el).lineHeight) || parseFloat(cs(el).fontSize) * 1.2) * 0.5;
    const rows = [];
    for (const r of rects.sort((a, b) => a.top - b.top || a.left - b.left)) {
      const row = rows.find((w) => Math.abs(w.top - r.top) < step);
      if (row) { row.left = Math.min(row.left, r.left); row.right = Math.max(row.right, r.right); } else rows.push({ top: r.top, left: r.left, right: r.right });
    }
    return rows;
  };

  // ---- Contrast: each run of text against what is painted behind it ----
  const media = (el, s) => ['IMG', 'VIDEO', 'CANVAS', 'PICTURE', 'IFRAME'].includes(el.tagName) || (s.backgroundImage && s.backgroundImage !== 'none');
  const layers = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
    const s = cs(el);
    if (s.display === 'none' || s.visibility === 'hidden') continue;
    const bg = C.toRgb(s.backgroundColor);
    const m = media(el, s);
    if (m || (bg && bg.a > 0)) layers.push({ el, rect: el.getBoundingClientRect(), media: m, bg });
  }
  let page = { r: 255, g: 255, b: 255, a: 1 };
  for (const el of [document.body, document.documentElement]) {
    const c = C.toRgb(cs(el).backgroundColor);
    if (c && c.a >= 0.99) { page = c; break; }
  }
  const PRECEDING = Node.DOCUMENT_POSITION_PRECEDING;
  const fails = new Map();
  const weak = new Map();
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = tw.nextNode(); node; node = tw.nextNode()) {
    const el = node.parentElement;
    if (!el || !/[\p{L}\p{N}]/u.test(node.textContent) || exempt(el) || !visible(el)) continue;
    const s = cs(el);
    if (/text/.test(`${s.backgroundClip} ${s.webkitBackgroundClip || ''}`)) continue;
    let opacity = 1;
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) opacity *= Number(cs(e).opacity);
    if (opacity < 0.05) continue;
    const fill = s.webkitTextFillColor && s.webkitTextFillColor !== s.color ? s.webkitTextFillColor : s.color;
    const fg0 = C.toRgb(fill);
    if (!fg0 || fg0.a < 0.05) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const r = [...range.getClientRects()].find((x) => x.width > 2 && x.height > 2);
    if (!r) continue;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const under = layers.filter((l) => (l.el === el || el.compareDocumentPosition(l.el) & PRECEDING) && cx >= l.rect.left && cx <= l.rect.right && cy >= l.rect.top && cy <= l.rect.bottom);
    let baseAt = -1;
    for (let i = under.length - 1; i >= 0; i--) if (!under[i].media && under[i].bg && under[i].bg.a >= 0.99) { baseAt = i; break; }
    if (under.slice(baseAt + 1).some((l) => l.media) || (baseAt < 0 && under.some((l) => l.media))) continue;
    let bg = baseAt >= 0 ? under[baseAt].bg : page;
    for (const l of under.slice(baseAt + 1)) if (l.bg) bg = C.blend(l.bg, bg);
    const fg = C.blend({ ...fg0, a: fg0.a * opacity }, bg);
    const px = parseFloat(s.fontSize);
    const weight = Number(s.fontWeight) || 400;
    const ratio = C.contrastRatio(fg, bg);
    const floor = C.contrastFloor(px, weight, { px: 24, boldPx: 18.66 });
    const hex = (c) => `#${[c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
    const key = `${hex(fg)} on ${hex(bg)}`;
    if (ratio < floor - 0.05) {
      const f = fails.get(key) ?? { ratio, floor, px, at: `${where(el)} ${quote(el)}`, n: 0 };
      f.n++;
      fails.set(key, f);
      continue;
    }
    // APCA second opinion, on running text only: it catches mid greys and dark grounds WCAG 2 overrates.
    const lc = Math.abs(C.apcaLc(fg, bg));
    if (node.textContent.trim().length >= 40 && lc < C.apcaMinimum(px, weight) - 15) {
      const w = weak.get(key) ?? { lc, px, at: `${where(el)} ${quote(el)}`, n: 0 };
      w.n++;
      weak.set(key, w);
    }
  }
  [...fails.entries()].sort((a, b) => a[1].ratio / a[1].floor - b[1].ratio / b[1].floor).slice(0, limit).forEach(([key, f]) =>
    errors.push(`text contrast ${f.ratio.toFixed(2)}:1 is under ${f.floor}:1 for ${Math.round(f.px)}px text: ${key}, e.g. ${f.at}${f.n > 1 ? ` (${f.n} runs)` : ''}. Use the kit's ink, on-accent, or --accent-text / --ink-muted-text.`));
  [...weak.entries()].slice(0, 3).forEach(([key, w]) =>
    warnings.push(`${key} passes WCAG 2 but reads weak (APCA Lc ${Math.round(w.lc)}) for ${Math.round(w.px)}px running text, e.g. ${w.at}. Lift the contrast or set it larger.`));

  // A fixed-format piece (a poster, a post, a print page) is judged on contrast and runts only:
  // its type is set to the canvas, not to a reading column.
  const fixed = scope === 'fixed';

  // ---- Line length, and body size on a phone ----
  let long = 0;
  let small = 0;
  for (const el of fixed ? [] : document.querySelectorAll('main p, main li, main dd, main blockquote, article p')) {
    if (exempt(el) || !visible(el)) continue;
    const text = (el.innerText || '').trim();
    if (text.length < 60) continue;
    const s = cs(el);
    const px = parseFloat(s.fontSize);
    // Fine print and legal text may run smaller (the rulebook allows 12px for it).
    const fine = !!el.closest('small, footer, .fine, .legal, [data-fine]') || /fine|legal|disclaim|footnote/i.test(typeof el.className === 'string' ? el.className : '');
    if (phone && !fine && px < 15 && text.length >= 90 && small < limit) {
      (px < 14 ? errors : warnings).push(`${where(el)} sets running text at ${px}px on a phone; body copy on a phone is 15px or larger${px < 14 ? '' : ' (14px reads small)'} ${quote(el)}`);
      small++;
    }
    const rows = lines(el);
    if (rows.length < 3 || long >= limit) continue;
    // Full lines plus the share of a line the last one fills.
    const full = Math.max(...rows.map((r) => r.right - r.left));
    const lastShare = Math.min(1, Math.max(0.05, (rows[rows.length - 1].right - rows[rows.length - 1].left) / full));
    const perLine = text.length / (rows.length - 1 + lastShare);
    if (perLine > 100) { errors.push(`${where(el)} runs about ${Math.round(perLine)} characters a line; hold running text to 45-75 (max-inline-size: var(--measure, 66ch)) ${quote(el)}`); long++; }
    else if (perLine > 85) { warnings.push(`${where(el)} runs about ${Math.round(perLine)} characters a line; 45-75 reads best ${quote(el)}`); long++; }
  }

  // ---- Hierarchy: one dominant headline per section ----
  const main = document.querySelector('main') ?? document.body;
  let sections = [...main.querySelectorAll('[data-section]')];
  if (!sections.length) sections = [...main.querySelectorAll('section')].filter((s) => !s.parentElement.closest('section'));
  let flat = 0;
  for (const sec of fixed ? [] : sections) {
    if (!visible(sec) || flat >= limit) continue;
    const heads = [...sec.querySelectorAll('h1, h2')].filter((h) => visible(h) && !exempt(h));
    if (!heads.length) continue;
    const top = heads.reduce((a, b) => (parseFloat(cs(b).fontSize) > parseFloat(cs(a).fontSize) ? b : a));
    const topPx = parseFloat(cs(top).fontSize);
    const topW = Number(cs(top).fontWeight) || 400;
    let next = null;
    for (const el of sec.querySelectorAll('h1, h2, h3, h4, p, li, blockquote, strong, span, div, a')) {
      if (el === top || top.contains(el) || el.contains(top) || exempt(el) || !visible(el)) continue;
      const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
      // A stat numeral (90px "83%") is meant to outsize the headline; only words compete with it.
      if ((own.match(/\p{L}/gu) ?? []).length < 6) continue;
      const px = parseFloat(cs(el).fontSize);
      if (!next || px > next.px) next = { px, w: Number(cs(el).fontWeight) || 400, el };
    }
    if (next && topPx / next.px < 1.2 && topW - next.w < 200) {
      warnings.push(`section "${sectionOf(sec)}" has no dominant headline: ${where(top)} is ${Math.round(topPx)}px and ${where(next.el)} is ${Math.round(next.px)}px; make the headline at least 1.25x the next level`);
      flat++;
    }
  }

  // ---- Proximity: a heading belongs to what follows it ----
  let near = 0;
  for (const h of fixed ? [] : main.querySelectorAll('h1, h2, h3')) {
    if (near >= limit || exempt(h) || !visible(h)) continue;
    const sib = (dir) => { let n = h[dir]; while (n && (!visible(n) || ['absolute', 'fixed'].includes(cs(n).position))) n = n[dir]; return n; };
    const prev = sib('previousElementSibling');
    const next = sib('nextElementSibling');
    if (!prev || !next) continue;
    // A kicker or eyebrow set just above a heading belongs to it.
    if (parseFloat(cs(prev).fontSize) < parseFloat(cs(h).fontSize) * 0.6 && (prev.innerText || '').trim().length < 60) continue;
    const hr = h.getBoundingClientRect();
    const pr = prev.getBoundingClientRect();
    const nr = next.getBoundingClientRect();
    // Only a vertical stack: siblings above and below.
    if (pr.bottom > hr.top + 1 || nr.top < hr.bottom - 1) continue;
    const above = hr.top - pr.bottom;
    const below = nr.top - hr.bottom;
    if (below > above + 2 && below > 8) { warnings.push(`${where(h)} ${quote(h)} sits ${Math.round(above)}px below what precedes it and ${Math.round(below)}px above what it heads; put more space above a heading than below it`); near++; }
  }

  // ---- Runts: a headline or lede ending on one short word ----
  let runts = 0;
  for (const el of (fixed ? document.body : main).querySelectorAll('h1, h2, h3, .lede, .lead, .intro')) {
    if (runts >= limit || exempt(el) || !visible(el)) continue;
    const rows = lines(el);
    if (rows.length < 2) continue;
    const last = rows[rows.length - 1];
    const words = (el.innerText || '').trim().split(/\s+/);
    const tail = words[words.length - 1] ?? '';
    const width = Math.max(...rows.map((r) => r.right - r.left));
    if (tail.length <= 9 && last.right - last.left < width * 0.2) { warnings.push(`${where(el)} ${quote(el)} ends on "${tail}" alone on its last line; rewrite or rebalance it (text-wrap: balance for headlines, pretty for ledes)`); runts++; }
  }

  return { errors, warnings };
};

/**
 * The fundamentals at the page's current viewport. phone: hold body copy to the phone floor.
 * scope 'fixed': a poster, post or print page, judged on contrast and runts only.
 */
export async function fundamentalsProblems(page, { phone = false, limit = LIMIT, scope = 'page' } = {}) {
  await page.evaluate(contrastScript('__fundContrast'));
  await page.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))));
  return page.evaluate(`(${CHECK})(${JSON.stringify({ phone, limit, scope })})`);
}

/**
 * Whether a rule that came with engine minor `since` blocks a piece pinned `pin` ("collateral@1.2"):
 * unpinned or pinned at that minor or later blocks; an older pin gets it as a warning.
 */
export function pinBlocks(pin, since) {
  const m = /@\d+\.(\d+)/.exec(String(pin ?? ''));
  return !m || Number(m[1]) >= since;
}

/** A fundamentals result split for a fixed-format engine: errors block when the pin allows, warnings never do. */
export function splitByPin(result, pin, since) {
  const blocks = pinBlocks(pin, since);
  return { problems: blocks ? result.errors : [], warnings: [...(blocks ? [] : result.errors), ...result.warnings] };
}
