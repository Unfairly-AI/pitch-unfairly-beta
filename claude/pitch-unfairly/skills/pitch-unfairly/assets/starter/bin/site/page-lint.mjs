// Checks on a built site that need the rendered page: layout at the extra
// widths (and what a phone must keep visible), visual AI slop scored by count,
// motion (present, and quiet under reduced motion), the link preview and page
// weight, and the brand as the browser actually drew it.
//
// Each browser check takes a puppeteer Page already at the built site and
// returns { errors, warnings }. previewProblems reads the built folder instead.
// site-audit.mjs wires these in; nothing here writes files or exits.
//
// Data attributes these checks read (on top of the engine's data-section,
// data-input, data-v and data-expr):
//   data-cta         a buying action (exists; site/check.mjs validates its id)
//   data-conditional a proposed date or term marked conditional, beside its CTA
//   data-excludes    what a partial total leaves out, beside the total
// A phone must show every one of them (a duplicate with the same value that is
// visible counts; one hidden by the `hidden` attribute is a state, not layout;
// the sample band's own links, inside [data-sample], only warn).
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { cssFamily, resolvePalette } from '../brand-lib.mjs';

/** Widths site:audit adds to its phone, laptop and wide modes. */
export const EXTRA_WIDTHS = [320, 430, 768, 2560];
/** Below this width a page is judged as a phone. */
export const PHONE_MAX = 600;
/** Visual slop: this many distinct tells is an error, SLOP_WARN a warning. */
export const SLOP_ERROR = 4;
export const SLOP_WARN = 2;
/** Lead samples must move: pass { strict: MOTION_REQUIRED_FOR_LEADS } to motionProblems for them. */
export const MOTION_REQUIRED_FOR_LEADS = true;
export const PREVIEW_LIMITS = { warnBytes: 5 * 1024 * 1024, errorBytes: 15 * 1024 * 1024, imageBytes: 1.5 * 1024 * 1024 };

// ---------- Color math, shared by Node (the kit's hex) and the page (computed styles) ----------
// Written as one self-contained function so it can be sent into the page as source.
function colorLib() {
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const fromSrgb = (r, g, b, alpha = 1) => {
    const [R, G, B] = [r, g, b].map(lin);
    const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
    const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
    const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
    return fromOklab(0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s, alpha);
  };
  const fromOklab = (L, a, b, alpha = 1) => {
    const C = Math.hypot(a, b);
    let h = (Math.atan2(b, a) * 180) / Math.PI;
    if (h < 0) h += 360;
    return { L, a, b, C, h, alpha };
  };
  const num = (s, scale = 1) => (s == null || s === 'none' ? 0 : s.endsWith('%') ? (parseFloat(s) / 100) * scale : parseFloat(s));
  /** A CSS color string (as computed styles print them, or a hex) to OKLab/OKLCH, or null. */
  const parse = (input) => {
    const c = String(input ?? '').trim().toLowerCase();
    if (!c || c === 'transparent' || c === 'none') return c === 'transparent' ? { L: 0, a: 0, b: 0, C: 0, h: 0, alpha: 0 } : null;
    let m = /^#([0-9a-f]{3,8})$/.exec(c);
    if (m) {
      let hex = m[1];
      if (hex.length <= 4) hex = [...hex].map((x) => x + x).join('');
      const n = (i) => parseInt(hex.slice(i, i + 2), 16) / 255;
      return fromSrgb(n(0), n(2), n(4), hex.length === 8 ? n(6) : 1);
    }
    m = /^(rgba?|oklab|oklch|color)\((.*)\)$/.exec(c);
    if (!m) return null;
    let body = m[2].replace(/,/g, ' ').replace(/\s*\/\s*/, ' / ');
    let space = m[1];
    if (space === 'color') {
      const [sp, ...rest] = body.trim().split(/\s+/);
      if (sp !== 'srgb') return null;
      body = rest.join(' ');
      space = 'srgb';
    }
    const [main, alphaPart] = body.split(' / ');
    const p = main.trim().split(/\s+/);
    const alpha = alphaPart != null ? num(alphaPart.trim()) : p.length === 4 ? num(p[3]) : 1;
    if (space === 'rgb' || space === 'rgba') return fromSrgb(num(p[0], 255) / 255, num(p[1], 255) / 255, num(p[2], 255) / 255, alpha);
    if (space === 'srgb') return fromSrgb(num(p[0]), num(p[1]), num(p[2]), alpha);
    if (space === 'oklab') return fromOklab(num(p[0]), num(p[1], 0.4), num(p[2], 0.4), alpha);
    if (space === 'oklch') {
      const L = num(p[0]);
      const C = num(p[1], 0.4);
      const h = num(p[2]);
      return { ...fromOklab(L, C * Math.cos((h * Math.PI) / 180), C * Math.sin((h * Math.PI) / 180), alpha), h };
    }
    return null;
  };
  /** Every color inside a gradient or shadow value, in order. */
  const colorsIn = (value) => String(value ?? '').match(/(?:rgba?|oklab|oklch|color)\([^()]*\)|#[0-9a-f]{3,8}\b/gi) ?? [];
  const hueDist = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
  const dist = (x, y) => Math.hypot(x.L - y.L, x.a - y.a, x.b - y.b);
  return { parse, colorsIn, hueDist, dist };
}
const COLOR = colorLib();

// ---------- In-page helpers ----------
// Sent into the page as source with colorLib; returns the shared helpers.
function pageLib(color) {
  const cs = (el, pseudo) => getComputedStyle(el, pseudo);
  const visible = (el) => {
    if (!el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    return el.checkVisibility ? el.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true }) : cs(el).visibility !== 'hidden';
  };
  const sectionOf = (el) => el.closest('[data-section]')?.dataset.section || el.closest('section')?.id || 'page';
  const where = (el) => {
    const cls = typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/)[0]}` : '';
    return `<${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls}> in "${sectionOf(el)}"`;
  };
  const ownText = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
  /** The page's top-level sections: main's children that are sections or report one. */
  const sections = () => {
    const main = document.querySelector('main') ?? document.body;
    let list = [...main.children].filter((el) => el.matches('section, [data-section]'));
    if (!list.length) list = [...document.querySelectorAll('section')].filter((s) => !s.parentElement.closest('section'));
    return list.filter(visible);
  };
  const firstFamily = (f) => String(f ?? '').split(',')[0].trim().replace(/^["']|["']$/g, '');
  const normFamily = (f) => firstFamily(f).toLowerCase().replace(/\s+variable$/, '').trim();
  /** The background an element sits on: its own, or the nearest ancestor's. */
  const backdrop = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const s = cs(n);
      if (s.backgroundImage && s.backgroundImage !== 'none') return { image: s.backgroundImage, color: s.backgroundColor, el: n };
      const c = color.parse(s.backgroundColor);
      if (c && c.alpha > 0.5) return { color: s.backgroundColor, el: n };
    }
    return { color: 'rgb(255, 255, 255)', el: document.documentElement };
  };
  const bodySize = parseFloat(cs(document.body).fontSize) || 16;
  return { cs, visible, sectionOf, where, ownText, sections, firstFamily, normFamily, backdrop, bodySize };
}

/** Run fn(helpers, arg) in the page, with the color and page helpers in scope. */
export function inPage(page, fn, arg) {
  return page.evaluate(`(() => { const color = (${colorLib})(); const H = { color, ...(${pageLib})(color) }; return (${fn})(H, ${JSON.stringify(arg ?? null)}); })()`);
}

const settle = (page) => page.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))));

// ---------- 1. Layout at a width ----------

/**
 * Layout at `width`: no sideways scroll, nothing off screen (the audit's own
 * rules), no text under 12px (labels and table cells included), and on a phone
 * every buying term visible and every control's result near the control.
 * Sets the viewport (and reloads when its kind changes) and leaves it there.
 */
export async function layoutProblems(page, { width, height } = {}) {
  if (!width) throw new Error('layoutProblems needs { width }');
  const mobile = width < PHONE_MAX;
  const before = page.viewport();
  await page.setViewport({ width, height: height ?? (mobile ? 844 : Math.min(1080, Math.round(width * 0.6))), isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  if (!before || !!before.isMobile !== mobile || before.width !== width) await page.reload({ waitUntil: 'networkidle0' });
  await settle(page);
  const found = await inPage(page, (H, { phone }) => {
    const errors = [];
    const warnings = [];
    // Same rules as site-audit.mjs, so the two agree.
    const vw = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > vw + 1) errors.push(`the page scrolls sideways (${document.documentElement.scrollWidth}px wide in ${vw}px)`);
    let off = 0;
    for (const el of document.querySelectorAll('main *')) {
      const r = el.getBoundingClientRect();
      if (el.ownerSVGElement) continue;
      if (r.width && (r.right > vw + 1 || r.left < -1) && !el.closest('.table-wrap, [data-scroll]') && getComputedStyle(el).position !== 'fixed') {
        const sec = el.closest('[data-section]')?.dataset.section;
        errors.push(`<${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? ` class="${el.className}"` : ''}> in section "${sec}" runs off the screen`);
        if (++off > 6) break;
      }
    }
    // Text under 12px, labels included: the audit's p/li/headings plus the
    // elements labels live in, and any span or div that holds text itself.
    const small = [];
    const textSel = 'main :is(p, li, h1, h2, h3, h4, label, small, figcaption, caption, dt, dd, th, td, span, div, a, b, strong, em)';
    for (const el of document.querySelectorAll(textSel)) {
      if (el.ownerSVGElement || el.closest('svg, [aria-hidden="true"], .sr, .sr-only')) continue;
      const own = H.ownText(el);
      if (!own || !/[\p{L}\p{N}]/u.test(own)) continue;
      if (!H.visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 2 && r.height <= 2) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs && fs < 12) small.push(`${H.where(el)} "${own.slice(0, 30)}" is ${Math.round(fs * 10) / 10}px`);
    }
    small.slice(0, 6).forEach((s) => errors.push(`text under 12px: ${s}`));
    if (small.length > 6) errors.push(`text under 12px: ${small.length - 6} more`);

    if (phone) {
      // Buying terms: a phone that hides one sells a different deal.
      const terms = [...document.querySelectorAll('[data-cta], [data-conditional], [data-excludes]')];
      const attrOf = (el) => (el.hasAttribute('data-cta') ? 'data-cta' : el.hasAttribute('data-conditional') ? 'data-conditional' : 'data-excludes');
      const shown = new Set(terms.filter(H.visible).map((el) => `${attrOf(el)}=${el.getAttribute(attrOf(el))}`));
      for (const el of terms) {
        if (H.visible(el)) continue;
        if (el.closest('[hidden]')) continue; // a state (data-when), not the layout
        const attr = attrOf(el);
        const value = el.getAttribute(attr);
        if (value && shown.has(`${attr}=${value}`)) continue; // the same term shows elsewhere
        const label = `[${attr}${value ? `="${value}"` : ''}] ${H.where(el)} "${(el.textContent || '').trim().slice(0, 40)}"`;
        // The sample band's own links are Unfairly's, not the deal's: a warning.
        if (el.closest('[data-sample]')) warnings.push(`the phone hides the sample band's ${label}`);
        else if (el.closest('details:not([open])')) warnings.push(`${label} is folded inside a closed <details> on the phone; keep buying terms in view`);
        else errors.push(`the phone hides a buying term: ${label} isn't visible at ${vw}px`);
      }
      // A control's result stays near it: within 1.5 screens.
      const reach = innerHeight * 1.5;
      for (const input of document.querySelectorAll('input[data-input]')) {
        if (!H.visible(input) || input.closest('[hidden]')) continue;
        const scope = input.closest('[data-section]') ?? input.closest('section') ?? document.body;
        const outs = [...scope.querySelectorAll('[data-v], [data-expr]')].filter((o) => H.visible(o) && !input.contains(o));
        const ir = input.getBoundingClientRect();
        const near = outs.some((o) => {
          const r = o.getBoundingClientRect();
          return Math.abs(r.top + r.height / 2 - (ir.top + ir.height / 2)) <= reach;
        });
        if (!near) warnings.push(`the result of input[data-input="${input.dataset.input}"] in "${H.sectionOf(input)}" is ${outs.length ? 'more than 1.5 screens away from it' : 'nowhere in its section'} on the phone; keep the answer beside the control`);
      }
    }
    return { errors, warnings };
  }, { phone: mobile });
  const tag = (s) => `${width}px: ${s}`;
  return { errors: found.errors.map(tag), warnings: found.warnings.map(tag) };
}

// ---------- 2. Visual slop ----------

const DEFAULT_SANS = ['inter', 'inter tight', 'geist', 'roboto', 'open sans', 'lato', 'arial', 'helvetica', 'helvetica neue', 'system-ui', 'ui-sans-serif', '-apple-system', 'blinkmacsystemfont', 'segoe ui', 'sans-serif'];

/** The kit's real colors and families: values that are the brand's own choice, never a tell. */
function brandAllowlist(kit) {
  const families = [];
  const colors = [];
  if (kit?.typography) {
    for (const role of ['display', 'body', 'mono']) {
      const t = kit.typography[role];
      // A stand-in is the capture's default for a font it couldn't get: still a default.
      if (!t?.family || t.license === 'stand-in') continue;
      families.push(t.family, cssFamily(t));
    }
  }
  const p = kit?.palette ?? {};
  // A gradient's hex stops are the brand's colors too (named stops resolve to colors already listed).
  const hexes = [...Object.values(p).filter((v) => typeof v === 'string'), ...(p.extras ?? []).map((e) => e.hex), ...(p.data ?? []), ...(p.gradients ?? []).flatMap((g) => (g?.stops ?? []).map((s) => s?.color)).filter((c) => typeof c === 'string' && c.startsWith('#'))];
  for (const hex of hexes) {
    const c = COLOR.parse(hex);
    if (c) colors.push(c);
  }
  return { families: [...new Set(families.map((f) => f.toLowerCase().replace(/\s+variable$/, '')))], colors };
}

/**
 * Visual AI slop, scored by count of distinct tells (docs/proposal-components/
 * research/visual-slop.md, the high-severity tells readable from the DOM, plus
 * eyebrows and stat tiles). score >= 4 is an error, 2-3 a warning. A font or
 * color the kit (brand/brand.json) names is the brand's choice and never
 * counts. Read at a desktop width: phone layouts center things on purpose.
 */
export async function visualSlop(page, kit = null) {
  await settle(page);
  const allow = brandAllowlist(kit);
  const hits = await inPage(page, (H, { defaults, allow, softShadow }) => {
    const { color, cs, visible, where } = H;
    const out = [];
    const hit = (tell, w) => out.push({ tell, where: w });
    const brandFamily = (f) => allow.families.includes(f);
    // A color the brand uses on purpose: same hue as a saturated kit color.
    const brandColor = (c) => allow.colors.some((b) => b.C > 0.06 && color.hueDist(b.h, c.h) <= 15 && Math.abs(b.L - c.L) < 0.35) || allow.colors.some((b) => color.dist(b, c) < 0.03);
    const purple = (c) => c && c.alpha >= 0.35 && c.C > 0.1 && c.h >= 250 && c.h <= 290;
    const main = document.querySelector('main') ?? document.body;
    const all = [...document.body.querySelectorAll('*')].filter((el) => !el.closest('svg') || el.tagName.toLowerCase() === 'svg');
    const shown = all.filter(visible);
    const vwArea = innerWidth * innerHeight;

    // 1. Default sans as the only face.
    const fam = (sel) => {
      const el = [...document.querySelectorAll(sel)].find((e) => visible(e) && e.textContent.trim().length > 2);
      return el ? H.normFamily(cs(el).fontFamily) : null;
    };
    const faces = { h1: fam('h1'), h2: fam('h2'), body: fam('main p') ?? H.normFamily(cs(document.body).fontFamily) };
    const used = Object.values(faces).filter(Boolean);
    const defaultUsed = Object.entries(faces).filter(([, f]) => f && defaults.includes(f) && !brandFamily(f));
    const single = new Set(used).size === 1 && used.length > 1 && !brandFamily(used[0]);
    if (defaultUsed.length || single) hit('default-sans', defaultUsed.length ? defaultUsed.map(([k, f]) => `${k} in ${f}`).join(', ') : `one family (${used[0]}) for headings and body`);

    // 2. AI purple on accents and buttons.
    const purples = [];
    const rootStyle = cs(document.documentElement);
    for (const v of ['--accent', '--primary', '--color-primary']) {
      const c = color.parse(rootStyle.getPropertyValue(v).trim());
      if (purple(c) && !brandColor(c)) purples.push(`${v} on :root`);
    }
    const buttonish = 'button, [role="button"], input[type="submit"], [data-cta], a[class*="btn" i], a[class*="button" i], .btn';
    for (const el of shown) {
      const s = cs(el);
      const isButton = el.matches(buttonish);
      const isAccent = el.matches('.hl, mark, h1 *, h2 *, main a, main em, main strong') || el.matches('h1, h2');
      const r = el.getBoundingClientRect();
      const bigSurface = r.width * r.height > vwArea * 0.05;
      const checks = [];
      if (isButton || bigSurface) checks.push(s.backgroundColor, ...color.colorsIn(s.backgroundImage));
      if (isButton) checks.push(s.borderTopWidth !== '0px' ? s.borderTopColor : null);
      if (isButton || isAccent) checks.push(H.ownText(el) ? s.color : null);
      for (const value of checks) {
        const c = color.parse(value);
        if (purple(c) && !brandColor(c)) { purples.push(where(el)); break; }
      }
      if (purples.length > 4) break;
    }
    if (purples.length) hit('ai-purple', [...new Set(purples)].slice(0, 3).join(', '));

    // 3. Gradient text.
    const gradText = shown.find((el) => {
      const s = cs(el);
      const clip = s.webkitBackgroundClip || s.backgroundClip;
      return /text/.test(clip ?? '') && /gradient\(/.test(s.backgroundImage) && (color.parse(s.webkitTextFillColor)?.alpha === 0 || color.parse(s.color)?.alpha === 0);
    });
    if (gradText) hit('gradient-text', where(gradText));

    // 4/5. Gradients: purple to blue, or on more than two surfaces; and glow.
    const surfaces = [];
    const purpleBlue = [];
    const glows = [];
    for (const el of shown) {
      const r = el.getBoundingClientRect();
      for (const pseudo of [null, '::before', '::after']) {
        const s = cs(el, pseudo);
        if (pseudo && (s.content === 'none' || s.content === 'normal')) continue;
        const img = s.backgroundImage;
        if (!img || !/gradient\(/.test(img) || /repeating-/.test(img)) continue;
        // A texture (dots, lines) tiles small; that's tell 13, not a gradient surface.
        const tile = parseFloat(s.backgroundSize);
        if (s.backgroundSize !== 'auto' && tile && tile < 80) continue;
        if (r.width < 40 || r.height < 40) continue;
        const stops = color.colorsIn(img).map(color.parse).filter((c) => c && c.alpha > 0.15);
        const chroma = stops.filter((c) => c.C > 0.08);
        if (!chroma.length && stops.every((c) => c.C < 0.03)) continue; // a neutral fade, a scrim over a photo
        surfaces.push(where(el) + (pseudo ?? ''));
        const hues = chroma.map((c) => c.h);
        if (chroma.length >= 2 && hues.every((h) => h >= 200 && h <= 300) && Math.max(...hues) - Math.min(...hues) >= 12 && !chroma.every(brandColor)) purpleBlue.push(where(el));
        // A halo: a saturated radial gradient on a large surface.
        if (/radial-gradient/.test(img) && (r.width * r.height >= Math.min(300 * 300, vwArea * 0.2)) && chroma.some((c) => c.C >= 0.08)) glows.push(`radial halo ${where(el)}${pseudo ?? ''}`);
      }
      const s = cs(el);
      // Colored glow shadows: wide blur in a saturated color.
      if (s.boxShadow && s.boxShadow !== 'none') {
        for (const layer of s.boxShadow.split(/,(?![^()]*\))/)) {
          if (/inset/.test(layer)) continue;
          const c = color.parse(color.colorsIn(layer)[0]);
          const lengths = layer.replace(/(?:rgba?|oklab|oklch|color)\([^()]*\)/g, '').match(/-?[\d.]+px/g)?.map(parseFloat) ?? [];
          const blur = lengths[2] ?? 0;
          const spread = lengths[3] ?? 0;
          if (c && c.C >= 0.1 && c.alpha >= 0.25 && blur + Math.max(spread, 0) >= 20 && !(softShadow && brandColor(c))) { glows.push(`glow shadow ${where(el)}`); break; }
        }
      }
      // Blurred decorative blobs.
      const blur = /blur\(([\d.]+)px\)/.exec(s.filter ?? '');
      if (blur && parseFloat(blur[1]) >= 20 && !el.textContent.trim()) {
        const c = color.parse(s.backgroundColor);
        if ((c && c.C >= 0.08 && c.alpha > 0.2) || /gradient\(/.test(s.backgroundImage)) glows.push(`blurred blob ${where(el)}`);
      }
    }
    if (purpleBlue.length || surfaces.length > 2) hit('gradients', purpleBlue.length ? `purple-to-blue on ${purpleBlue.slice(0, 2).join(', ')}` : `gradients on ${surfaces.length} surfaces (${surfaces.slice(0, 3).join(', ')})`);
    if (glows.length) hit('glow', [...new Set(glows)].slice(0, 3).join(', '));

    const sections = H.sections();

    // 6. Centered hero with a pill badge over the h1 and two buttons.
    const h1 = document.querySelector('main h1') ?? document.querySelector('h1');
    if (h1 && visible(h1)) {
      const hero = h1.closest('section, [data-section], header') ?? h1.parentElement;
      const centered = cs(h1).textAlign === 'center';
      const pill = (el) => {
        if (!el || !visible(el)) return false;
        const r = el.getBoundingClientRect();
        const s = cs(el);
        const radius = parseFloat(s.borderTopLeftRadius);
        const filled = (color.parse(s.backgroundColor)?.alpha ?? 0) > 0.05 || parseFloat(s.borderTopWidth) >= 1;
        return r.height <= 56 && el.textContent.trim().length <= 80 && radius >= r.height / 2 - 1 && filled;
      };
      let before = null;
      for (let n = h1; n && n !== hero && !before; n = n.parentElement) before = n.previousElementSibling;
      const badge = pill(before) || (before?.children.length === 1 && pill(before.children[0]));
      const buttonLike = (el) => {
        const s = cs(el);
        return visible(el) && ((color.parse(s.backgroundColor)?.alpha ?? 0) > 0.1 || /gradient\(/.test(s.backgroundImage) || parseFloat(s.borderTopWidth) >= 1 && parseFloat(s.borderBottomWidth) >= 1) && parseFloat(s.paddingLeft) >= 8;
      };
      const after = [...hero.querySelectorAll('a, button')].filter((el) => h1.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING && buttonLike(el));
      const groups = new Map();
      after.forEach((el) => groups.set(el.parentElement, (groups.get(el.parentElement) ?? 0) + 1));
      const twoButtons = [...groups.values()].some((n) => n >= 2);
      if (centered && badge && twoButtons) hit('hero-badge', `${where(h1)}: centered, a pill above it, two buttons below`);
    }

    // 7. Three or four identical cards, each an icon in a tinted rounded square, then a heading.
    const cardRows = [];
    for (const parent of main.querySelectorAll('*')) {
      const kids = [...parent.children].filter(visible);
      if (kids.length < 3 || kids.length > 4 || new Set(kids.map((k) => k.tagName)).size > 1) continue;
      const rects = kids.map((k) => k.getBoundingClientRect());
      const sameWidth = rects.every((r) => Math.abs(r.width - rects[0].width) <= 2);
      const hs = rects.map((r) => r.height);
      if (!sameWidth || Math.max(...hs) > Math.min(...hs) * 1.15) continue;
      const iconCard = (card) => {
        const first = card.firstElementChild;
        if (!first) return false;
        const box = [first, first.firstElementChild].find((b) => {
          if (!b) return false;
          const r = b.getBoundingClientRect();
          const s = cs(b);
          const bg = color.parse(s.backgroundColor);
          const cardBg = color.parse(H.backdrop(card).color);
          const tinted = bg && bg.alpha > 0.05 && (!cardBg || color.dist(bg, cardBg) > 0.02);
          return Math.abs(r.width - r.height) <= 3 && r.width >= 20 && r.width <= 120 && parseFloat(s.borderTopLeftRadius) >= 4 && tinted && (b.matches('svg, img') || b.querySelector('svg, img, i, [class*="icon" i]'));
        });
        if (!box) return false;
        const next = [...card.children].slice(1, 3);
        return next.some((n) => n.matches('h2, h3, h4, h5') || parseFloat(cs(n).fontWeight) >= 600);
      };
      if (kids.every(iconCard)) cardRows.push(where(parent));
    }
    if (cardRows.length) hit('icon-cards', cardRows.slice(0, 2).join(', '));

    // 8. Eyebrow kickers: a small tracked caps or mono label directly above most headings.
    let headed = 0;
    const kicked = [];
    for (const sec of sections) {
      const heading = sec.querySelector('h1, h2');
      if (!heading || !visible(heading)) continue;
      headed++;
      const prev = heading.previousElementSibling;
      if (!prev || !visible(prev)) continue;
      const text = prev.textContent.trim();
      const s = cs(prev);
      const size = parseFloat(s.fontSize);
      const tracking = (parseFloat(s.letterSpacing) || 0) / size;
      const caps = s.textTransform === 'uppercase' || (/[A-Za-z]/.test(text) && text === text.toUpperCase());
      const mono = /mono|courier|consolas|menlo/i.test(s.fontFamily);
      if (text && text.length <= 48 && size <= Math.max(14, H.bodySize * 0.85) && ((caps && tracking >= 0.04) || mono)) kicked.push(where(prev));
    }
    if (kicked.length >= 2 && kicked.length / Math.max(headed, 1) > 0.5) hit('eyebrows', `${kicked.length} of ${headed} section headings have a kicker (${kicked.slice(0, 2).join(', ')})`);

    // 9. Oversized stat tiles: 3+ siblings whose main text is a big number.
    const NUM = /^[~≈<>+−\-$€£¥]?\s*\d[\d,.]*\s*(%|x|×|k|m|mo|yr|yrs|hrs?|h|min|days?|weeks?|wks?|bn|b|pts?|\+)?\s*$/i;
    const statRows = [];
    for (const parent of main.querySelectorAll('*')) {
      const kids = [...parent.children].filter(visible);
      if (kids.length < 3 || kids.length > 6) continue;
      const tiles = kids.filter((k) => [k, ...k.querySelectorAll('*')].some((e) => {
        const t = e.textContent.trim();
        return t.length <= 14 && NUM.test(t) && parseFloat(cs(e).fontSize) >= 32 && visible(e);
      }));
      if (tiles.length >= 3 && new Set(tiles.map((t) => t.tagName)).size === 1) statRows.push(where(parent));
    }
    // A row nested in another row is one row.
    const rows = [...new Set(statRows)];
    if (rows.length) hit('stat-tiles', rows.slice(0, 2).join(', '));

    // 10. Every section on the same skeleton.
    if (sections.length >= 4) {
      const sig = (sec) => {
        let el = sec;
        for (let i = 0; i < 4 && el.children.length === 1; i++) el = el.children[0];
        return [...el.children].slice(0, 3).map((c) => `${c.tagName.toLowerCase()}.${(typeof c.className === 'string' && c.className.trim().split(/\s+/)[0]) || ''}`).join(' ');
      };
      const counts = new Map();
      sections.forEach((s) => counts.set(sig(s), (counts.get(sig(s)) ?? 0) + 1));
      const [top, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      if (top && n >= 4 && n / sections.length >= 0.75) hit('same-skeleton', `${n} of ${sections.length} sections open with ${top}`);
    }

    // 11. Side-stripe accent borders on cards.
    const stripe = shown.find((el) => {
      const s = cs(el);
      const sides = ['Top', 'Right', 'Bottom', 'Left'].map((k) => ({ w: parseFloat(s[`border${k}Width`]) || 0, c: s[`border${k}Color`] }));
      const thick = sides.filter((x) => x.w >= 3);
      if (thick.length !== 1 || sides.some((x) => x !== thick[0] && x.w > 1)) return false;
      const c = color.parse(thick[0].c);
      const r = el.getBoundingClientRect();
      return c && c.C >= 0.06 && c.alpha > 0.5 && r.height >= 40 && r.width >= 120 && (thick[0] === sides[0] || thick[0] === sides[3]);
    });
    if (stripe) hit('side-stripe', where(stripe));

    // 12. Emoji as icons, and the sparkle.
    const EMOJI = /[\u{1F000}-\u{1FAFF}✨⚡⭐]/u;
    const emoji = shown.find((el) => {
      const own = H.ownText(el);
      if (!own || !EMOJI.test(own)) return false;
      return /✨/.test(own) || el.matches('h1, h2, h3, h4, button, a, li, [class*="icon" i]') || el.closest('h1, h2, h3, h4, button, li');
    });
    if (emoji) hit('emoji-icons', where(emoji));
    return out;
  }, { defaults: DEFAULT_SANS, allow, softShadow: kit?.style?.shadow === 'soft' });

  const score = hits.length;
  const list = hits.map((h) => `${h.tell} (${h.where})`).join('; ');
  const errors = [];
  const warnings = [];
  if (score >= SLOP_ERROR) errors.push(`visual slop: ${score} tells: ${list}. Replace the defaults with the brand's own type, color and layout.`);
  else if (score >= SLOP_WARN) warnings.push(`visual slop: ${score} tells: ${list}.`);
  return { score, hits, errors, warnings };
}

// ---------- 3. Motion ----------

/**
 * With motion allowed, the page must move as it scrolls (entrances, count-ups,
 * chart wipes, or any animation); none is a warning, or an error with
 * { strict: true } (lead samples). With reduced motion, nothing may loop
 * forever. Changes prefers-reduced-motion and reloads, then puts it back.
 */
export async function motionProblems(page, { strict = false } = {}) {
  const errors = [];
  const warnings = [];
  const wasReduced = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const scrollThrough = () => page.evaluate(async () => {
    const step = Math.max(200, innerHeight * 0.7);
    for (let y = 0; y <= document.documentElement.scrollHeight; y += step) {
      scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    await new Promise((r) => setTimeout(r, 250));
  });
  let moving = { count: 0, kinds: [] };
  try {
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
    await page.reload({ waitUntil: 'networkidle0' });
    await settle(page);
    // Entrances below the fold are set up at load, before any scroll.
    const atLoad = await page.evaluate(() => {
      const timed = (el) => getComputedStyle(el).transitionDuration.split(',').some((d) => parseFloat(d) > 0);
      return {
        reveal: [...document.querySelectorAll('.reveal')].filter(timed).length,
        count: document.documentElement.classList.contains('has-motion') ? document.querySelectorAll('[data-count]').length : 0,
      };
    });
    await scrollThrough();
    const afterScroll = await page.evaluate(() => {
      const kit = [...document.querySelectorAll('.wipe, .grow, .rise, .draw, .pop, .type, [data-grow], .to-draw, .drawing')].filter((el) => getComputedStyle(el).animationName !== 'none' || getComputedStyle(el).transitionDuration.split(',').some((d) => parseFloat(d) > 0)).length;
      const animated = [...document.querySelectorAll('body *')].filter((el) => getComputedStyle(el).animationName !== 'none').length;
      const played = document.getAnimations().length;
      return { kit, animated, played };
    });
    const kinds = Object.entries({ ...atLoad, ...afterScroll }).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`);
    moving = { count: atLoad.reveal + atLoad.count + afterScroll.kit + afterScroll.animated, kinds };
    if (!moving.count) {
      const msg = 'the page has no motion: nothing enters as it scrolls (no .reveal entrance, [data-count] figure, chart .wipe/.grow, or CSS animation). Give the showpiece and the figures their entrance.';
      (strict ? errors : warnings).push(msg);
    }

    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.reload({ waitUntil: 'networkidle0' });
    await settle(page);
    await scrollThrough();
    const loops = await page.evaluate(() => {
      const out = [];
      for (const a of document.getAnimations()) {
        const t = a.effect?.getComputedTiming?.();
        if (a.playState === 'running' && t && t.iterations === Infinity) {
          const el = a.effect.target;
          const name = a.animationName ?? a.id ?? 'animation';
          out.push(`${name} on <${el?.tagName?.toLowerCase() ?? '?'}${el?.className && typeof el.className === 'string' ? ` class="${el.className.split(/\s+/)[0]}"` : ''}>`);
        }
      }
      return [...new Set(out)];
    });
    loops.slice(0, 5).forEach((l) => errors.push(`with reduced motion, ${l} still loops forever; stop it under @media (prefers-reduced-motion: reduce)`));
  } finally {
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: wasReduced ? 'reduce' : 'no-preference' }]);
    await page.reload({ waitUntil: 'networkidle0' });
    await page.evaluate(() => scrollTo(0, 0));
  }
  return { errors, warnings, hasMotion: moving.count > 0, motion: moving };
}

// ---------- 3b. Qualifiers stay beside what they qualify ----------

/**
 * A qualifier hidden by CSS passes the source check, so check the drawn page:
 * every visible [data-basis="proposed"] needs a visible [data-conditional] in
 * the same [data-section] within 1.5 viewport heights, and every visible
 * [data-v="X"] where X is in the model's `excludes` (the #site-model JSON)
 * needs a visible [data-excludes] naming X (a space- or comma-separated list)
 * there too. Visible: not display:none, visibility:hidden, opacity 0, zero
 * size, or clipped like .sr-only. Reads the page at its current viewport.
 */
export async function qualifierProblems(page) {
  await settle(page);
  return inPage(page, (H) => {
    const errors = [];
    const warnings = [];
    const shown = (el) => {
      if (!el.isConnected) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      if (el.checkVisibility && !el.checkVisibility({ checkVisibilityCSS: true })) return false;
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
        const s = getComputedStyle(n);
        if (s.display === 'none' || s.visibility === 'hidden') return false;
        // An entrance not yet played (.reveal before is-in) is shown once scrolled to.
        if (parseFloat(s.opacity) === 0 && !(n.classList.contains('reveal') && !n.classList.contains('is-in'))) return false;
        const clip = s.clip && s.clip !== 'auto' && /rect\(\s*0(px)?[\s,]+0(px)?[\s,]+0(px)?[\s,]+0(px)?\s*\)/.test(s.clip);
        if (clip || /inset\(\s*(50|100)%/.test(s.clipPath)) return false;
        if (s.overflow === 'hidden' && (parseFloat(s.width) <= 1 || parseFloat(s.height) <= 1)) return false;
      }
      return true;
    };
    const mid = (el) => {
      const r = el.getBoundingClientRect();
      return r.top + scrollY + r.height / 2;
    };
    const reach = innerHeight * 1.5;
    const scopeOf = (el) => el.closest('[data-section]') ?? el.closest('section') ?? document.body;
    const near = (el, candidates) => {
      const scope = scopeOf(el);
      return candidates.some((c) => scopeOf(c) === scope && shown(c) && Math.abs(mid(c) - mid(el)) <= reach);
    };
    const label = (el) => `${H.where(el)} "${(el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)}"`;
    const vw = document.documentElement.clientWidth;

    const conditionals = [...document.querySelectorAll('[data-conditional]')];
    for (const el of document.querySelectorAll('[data-basis="proposed"]')) {
      if (!shown(el)) continue;
      if (!near(el, conditionals)) errors.push(`${vw}px: the proposed ${label(el)} has no visible [data-conditional] note beside it in its section; a proposed date or term says it's conditional next to it, on every screen`);
    }

    let model = {};
    try { model = JSON.parse(document.getElementById('site-model')?.textContent || '{}'); } catch { /* no model */ }
    const excludes = model?.excludes ?? {};
    const marks = [...document.querySelectorAll('[data-excludes]')];
    const marking = (name) => marks.filter((m) => m.getAttribute('data-excludes').split(/[\s,]+/).includes(name));
    for (const name of Object.keys(excludes)) {
      for (const el of document.querySelectorAll(`[data-v="${CSS.escape(name)}"]`)) {
        if (!shown(el)) continue;
        if (!near(el, marking(name))) errors.push(`${vw}px: ${label(el)} is a partial total (it leaves out ${String(excludes[name]).replace(/\.$/, '')}), and no visible [data-excludes="${name}"] line beside it in its section says so`);
      }
    }
    return { errors: [...new Set(errors)], warnings };
  });
}

// ---------- 3b. The sample band on a phone (engine 1.11) ----------

/**
 * A sample's band on a phone still says whose proposal it is: its visible text names
 * the seller and the buyer (any of the names given), its text isn't cut off, and its
 * link is in view (not display:none, zero-size, off screen or clipped by the band).
 * The real failure: at 390 the band collapsed to "Example Salesforce plan." and hid
 * its link. Reads the page at its current viewport; checks only a screen band.
 * names: { seller: [...], buyer: [...] }.
 */
export async function sampleBandProblems(page, { seller = [], buyer = [] } = {}) {
  await settle(page);
  return inPage(page, (H, names_) => {
    const errors = [];
    const warnings = [];
    const vw = document.documentElement.clientWidth;
    const bands = [...document.querySelectorAll('[data-sample]')].filter((b) => !b.classList.contains('pdf-only') && !b.closest('.pdf-only'));
    if (!bands.length) return { errors, warnings };
    const band = bands.find(H.visible);
    if (!band) {
      errors.push(`${vw}px: the sample band is hidden. On a phone it still says, in one short line, whose proposal this is and that it's a sample`);
      return { errors, warnings };
    }
    const said = (band.innerText || '').replace(/\s+/g, ' ').trim();
    const norm = (t) => t.toLowerCase().replace(/[’']/g, "'");
    const names = (list) => list.filter((n) => typeof n === 'string' && n.trim().length >= 2);
    const missing = [];
    for (const [role, list] of [['seller', names(names_.seller)], ['buyer', names(names_.buyer)]]) {
      if (list.length && !list.some((n) => norm(said).includes(norm(n.trim())))) missing.push(`the ${role} (${list[0]})`);
    }
    if (missing.length) errors.push(`${vw}px: the sample band reads "${said.slice(0, 80)}", which doesn't name ${missing.join(' or ')}. On a phone the short line still says whose proposal it is, for whom ("Sample: ${names(names_.seller)[0] ?? '<seller>'} for ${names(names_.buyer)[0] ?? '<buyer>'}.")`);
    // Text cut off with an ellipsis or by the band's own overflow reads as a different line.
    for (const el of band.querySelectorAll('*')) {
      if (!H.visible(el) || !H.ownText(el)) continue;
      const s = getComputedStyle(el);
      if (/hidden|clip/.test(s.overflowX + s.overflow) && el.scrollWidth > el.clientWidth + 1) {
        errors.push(`${vw}px: the sample band's text is cut off ("${H.ownText(el).slice(0, 60)}"): it runs ${el.scrollWidth - el.clientWidth}px past its box. Let it wrap or shorten it`);
        break;
      }
    }
    // Its link (Made by Unfairly) stays in view.
    for (const a of band.querySelectorAll('a[href]')) {
      const label = `"${(a.textContent || '').trim().slice(0, 30)}"`;
      if (!H.visible(a)) { errors.push(`${vw}px: the sample band hides its link ${label}. Keep it in view on a phone`); continue; }
      const r = a.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) { errors.push(`${vw}px: the sample band's link ${label} is ${Math.round(r.width)}×${Math.round(r.height)}px. Keep it in view on a phone`); continue; }
      if (r.left < -1 || r.right > vw + 1) { errors.push(`${vw}px: the sample band's link ${label} runs off the screen`); continue; }
      for (let n = a.parentElement; n && n !== document.documentElement; n = n.parentElement) {
        const s = getComputedStyle(n);
        if (!/hidden|clip|auto|scroll/.test(`${s.overflowX} ${s.overflowY}`)) continue;
        const b = n.getBoundingClientRect();
        if (r.left < b.left - 1 || r.right > b.right + 1 || r.top < b.top - 1 || r.bottom > b.bottom + 1) {
          errors.push(`${vw}px: the sample band's link ${label} is clipped by ${H.where(n)}. Keep it in view on a phone`);
          break;
        }
        if (n === band) break;
      }
    }
    return { errors: [...new Set(errors)], warnings };
  }, { seller, buyer });
}

/** The seller's and the buyer's names a sample band can say, from site.json. */
export function sampleNames(site) {
  const f = site?.facts ?? {};
  const s = site?.sample && typeof site.sample === 'object' ? site.sample : {};
  const proper = (n) => typeof n === 'string' && /^[A-Z0-9]/.test(n.trim()) && !/^(?:A|An|The|Any|One|Some)\s/.test(n.trim());
  return {
    seller: [f.vendor?.name, f.vendor?.short, f.seller?.name, f.seller?.short, s.seller].filter(proper),
    buyer: [f.client?.name, f.client?.short, f.buyer?.name, f.buyer?.short, s.buyer].filter(proper),
  };
}

// ---------- 3c. Boxed text (engine 1.11) ----------

/**
 * Running text (more than BOXED_WORDS words) set inside a box: a container with a visible
 * border on three or more sides, or a tinted panel that differs from what it sits on.
 * It reads as a template's callout. Not a box: a card in a row of like cards, a figure,
 * the product's own UI ([data-ui], a form or calculator with inputs, a table), a quote,
 * a toggle, a full-width band (that's a section background). Warnings only, at a laptop width.
 */
export const BOXED_WORDS = 12;
export async function boxedTextProblems(page) {
  await settle(page);
  return inPage(page, (H, { minWords }) => {
    const { color, cs, visible, where } = H;
    const warnings = [];
    const main = document.querySelector('main') ?? document.body;
    const vw = document.documentElement.clientWidth;
    const words = (t) => (t.match(/[A-Za-z0-9$€£][\w$€£%'’.,-]*/g) ?? []).length;
    const sides = (s) => ['Top', 'Right', 'Bottom', 'Left'].filter((k) => {
      const w = parseFloat(s[`border${k}Width`]) || 0;
      const c = color.parse(s[`border${k}Color`]);
      return w >= 1 && s[`border${k}Style`] !== 'none' && c && c.alpha >= 0.25;
    }).length;
    const boxOf = (el) => {
      const s = cs(el);
      if (sides(s) >= 3) return 'a bordered box';
      const bg = color.parse(s.backgroundColor);
      if (!bg || bg.alpha < 0.5 || (s.backgroundImage && s.backgroundImage !== 'none')) return null;
      const under = el.parentElement ? H.backdrop(el.parentElement) : null;
      if (!under || under.image) return null;
      const base = color.parse(under.color);
      return base && color.dist(bg, base) > 0.03 ? 'a tinted panel' : null;
    };
    const exempt = (el) =>
      el.matches('[data-section], section, header, footer, nav, figure, blockquote, details, summary, table, form, pre, code, button, a, label, [data-ui], [data-sample], [role="img"], [role="dialog"], [data-calc]') ||
      el.closest('figure, blockquote, [data-ui], [data-sample], [data-calc], form, table, details, nav, header, footer') ||
      el.querySelector('input, select, textarea, table, img, video, canvas, svg, [data-v], [data-expr]');
    const sameBox = (a, b) => {
      const x = cs(a);
      const y = cs(b);
      return a.tagName === b.tagName && x.backgroundColor === y.backgroundColor && x.borderTopWidth === y.borderTopWidth && x.borderTopColor === y.borderTopColor;
    };
    const reported = [];
    for (const el of main.querySelectorAll('div, aside, p, article, li, ul, ol, dl')) {
      if (!visible(el) || reported.some((r) => r.contains(el) || el.contains(r))) continue;
      const r = el.getBoundingClientRect();
      if (r.width >= vw * 0.9) continue; // a band across the page is the section's background
      const kind = boxOf(el);
      if (!kind || exempt(el)) continue;
      const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
      const all = words(text);
      // Running text: sentences (blocks of 8+ words) making up most of the box. A contact
      // card or a stat with a caption is labels and names around one line.
      const blocks = el.matches('p, li') ? [el] : [...el.querySelectorAll('p, li, dd')].filter((b) => visible(b) && !b.querySelector('p, li, dd'));
      const n = blocks.map((b) => words((b.innerText || '').trim())).filter((k) => k >= 8).reduce((a, k) => a + k, 0);
      if (n <= minWords || n < all * 0.7) continue;
      // A card in a row of like cards is a card (a featured one that's styled apart included).
      const first = (e) => (typeof e.className === 'string' ? e.className.trim().split(/\s+/)[0] : '') || null;
      const kin = [...(el.parentElement?.children ?? [])].filter((k) => k !== el && visible(k) && k.tagName === el.tagName && (sameBox(k, el) || (first(k) && first(k) === first(el))));
      if (kin.length >= 1) continue;
      reported.push(el);
      warnings.push(`boxed text: ${where(el)} sets ${n} words of running text in ${kind} ("${text.slice(0, 60)}${text.length > 60 ? '...' : ''}"). Say it in the section's own flow; keep a box for a card in a row, a figure or the product's own UI`);
      if (reported.length >= 4) break;
    }
    return { errors: [], warnings };
  }, { minWords: BOXED_WORDS });
}

// ---------- 4. Link preview and weight ----------

async function* files(dir) {
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const full = join(dir, e.name);
    if (e.isDirectory()) yield* files(full);
    else if (e.isFile()) yield full;
  }
}
const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;

/**
 * The built folder: index.html carries a title, a description and the Open
 * Graph preview (title, description, image); the folder's weight stays under
 * 5 MB (15 MB is an error); no single image over 1.5 MB. The engine's page
 * shell doesn't emit Open Graph tags yet, so those are warnings.
 */
export async function previewProblems(distDir) {
  const errors = [];
  const warnings = [];
  const html = await readFile(join(distDir, 'index.html'), 'utf8').catch(() => null);
  if (html == null) return { errors: [`${distDir}/index.html doesn't exist; build the site first`], warnings, bytes: 0 };
  const head = (/<head[^>]*>([\s\S]*?)<\/head>/i.exec(html)?.[1] ?? html).replace(/<style[\s\S]*?<\/style>/gi, '');
  const metaContent = (attr, name) => {
    for (const [tag] of head.matchAll(/<meta\b[^>]*>/gi)) {
      if (new RegExp(`\\s${attr}\\s*=\\s*["']${name}["']`, 'i').test(tag)) return /\scontent\s*=\s*"([^"]*)"|\scontent\s*=\s*'([^']*)'/i.exec(tag)?.slice(1).find((v) => v != null)?.trim() ?? '';
    }
    return null;
  };
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1]?.trim();
  if (!title || /^(sample: )?site$/i.test(title)) errors.push('link preview: the page has no real <title> (set "title" in site/site.json)');
  const description = metaContent('name', 'description');
  if (!description) errors.push('link preview: the page has no meta description (set "description" in site/site.json)');
  for (const prop of ['og:title', 'og:description', 'og:image']) {
    const v = metaContent('property', prop);
    if (!v) warnings.push(`link preview: no <meta property="${prop}">, so chat apps and email show a bare link`);
    else if (prop === 'og:image' && !/^https?:\/\//i.test(v)) warnings.push(`link preview: og:image "${v}" is relative; previews need an absolute URL`);
  }
  let bytes = 0;
  const sizes = [];
  for await (const f of files(distDir)) {
    const { size } = await stat(f);
    bytes += size;
    sizes.push({ path: relative(distDir, f), size });
    if (/\.(png|jpe?g|webp|avif|gif|svg)$/i.test(f) && size > PREVIEW_LIMITS.imageBytes) warnings.push(`page weight: image ${relative(distDir, f)} is ${mb(size)}; keep each image under 1.5 MB`);
  }
  const biggest = sizes.sort((a, b) => b.size - a.size).slice(0, 3).map((s) => `${s.path} ${mb(s.size)}`).join(', ');
  if (bytes > PREVIEW_LIMITS.errorBytes) errors.push(`page weight: the built site is ${mb(bytes)}, over 15 MB (largest: ${biggest})`);
  else if (bytes > PREVIEW_LIMITS.warnBytes) warnings.push(`page weight: the built site is ${mb(bytes)}, over 5 MB (largest: ${biggest})`);
  return { errors, warnings, bytes };
}

// ---------- 5. Brand diff ----------

/**
 * The brand as drawn: h1, h2 and body text are set in the kit's display and
 * body families and those fonts actually loaded (not a fallback); measured
 * fonts and colors from brand/references/index.json, when it records any, are
 * compared; and the sections' backgrounds mix the brand's colors.
 *
 * referencesIndex may carry measured values as `fonts: { display, body }` and
 * `colors: [css colors]`, at the top level or on any entry of an array. Today's
 * brand-capture writes only screenshot entries, so that part is usually idle.
 */
export async function brandDiff(page, kit, referencesIndex = null) {
  const errors = [];
  const warnings = [];
  await settle(page);
  const expect = {};
  for (const role of ['display', 'body']) {
    const t = kit?.typography?.[role];
    if (t?.family) expect[role] = { family: cssFamily(t), name: t.family, source: t.source };
  }
  const palette = kit?.palette?.paper ? resolvePalette(kit.palette) : {};
  const kitColors = [...Object.values(palette), ...(kit?.palette?.extras ?? []).map((e) => e.hex)].filter((v) => /^#/.test(v));

  const seen = await inPage(page, async (H, { expect }) => {
    const pick = (sel) => [...document.querySelectorAll(sel)].find((e) => H.visible(e) && e.textContent.trim().length > 2);
    const targets = { h1: [pick('main h1') ?? pick('h1'), 'display'], h2: [pick('main h2') ?? pick('h2'), 'display'], body: [pick('main p') ?? document.body, 'body'] };
    const used = {};
    for (const [k, [el, role]] of Object.entries(targets)) if (el) used[k] = { role, family: H.firstFamily(getComputedStyle(el).fontFamily), where: H.where(el) };
    // Did the kit's font load? Faces registered under its family, else a width test.
    const loaded = {};
    for (const [role, e] of Object.entries(expect)) {
      const norm = (f) => f.replace(/^["']|["']$/g, '').toLowerCase();
      const faces = [...document.fonts].filter((f) => norm(f.family) === norm(e.family));
      if (faces.length) {
        loaded[role] = { faces: faces.length, ok: faces.some((f) => f.status === 'loaded'), status: [...new Set(faces.map((f) => f.status))].join('/') };
      } else {
        const ctx = document.createElement('canvas').getContext('2d');
        const w = (font) => { ctx.font = `40px ${font}`; return ctx.measureText('Hamburgefonstiv 0123').width; };
        const ok = ['monospace', 'serif', 'sans-serif'].some((fb) => w(`"${e.family}", ${fb}`) !== w(fb));
        loaded[role] = { faces: 0, ok, status: ok ? 'installed' : 'missing' };
      }
    }
    // Colors on the page, for the reference comparison.
    const colors = new Set();
    for (const el of document.querySelectorAll('body, body *')) {
      if (!H.visible(el)) continue;
      const s = getComputedStyle(el);
      colors.add(s.backgroundColor);
      if (H.ownText(el)) colors.add(s.color);
    }
    // Section backgrounds.
    const backgrounds = H.sections().map((sec) => {
      const b = H.backdrop(sec);
      return { section: H.sectionOf(sec), color: b.color, image: b.image ? (/url\(/.test(b.image) ? 'image' : 'gradient') : null };
    });
    return { used, loaded, colors: [...colors], backgrounds };
  }, { expect });

  // Rendered fonts, as Chrome reports them: catches a fallback drawing the text.
  const rendered = {};
  try {
    const cdp = await page.createCDPSession();
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
    for (const [k, sel] of [['h1', 'main h1'], ['h2', 'main h2'], ['body', 'main p']]) {
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: sel });
      if (!nodeId) continue;
      const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
      if (fonts?.length) rendered[k] = fonts.sort((a, b) => b.glyphCount - a.glyphCount)[0];
    }
    await cdp.detach();
  } catch { /* not every browser exposes this; the FontFaceSet check stands alone */ }

  const norm = (f) => String(f ?? '').toLowerCase().replace(/^["']|["']$/g, '').replace(/\s+variable$/, '').trim();
  for (const [k, u] of Object.entries(seen.used)) {
    const e = expect[u.role];
    if (!e) continue;
    if (norm(u.family) !== norm(e.family) && norm(u.family) !== norm(e.name)) {
      errors.push(`brand: ${k} (${u.where}) is set in "${u.family}", but the kit's ${u.role} face is "${e.name}"; the page overrides the brand font`);
      continue;
    }
    const r = rendered[k];
    if (r && e.source !== 'system' && !r.isCustomFont) errors.push(`brand: ${k} is drawn in ${r.familyName}, a fallback, because the kit's ${u.role} font "${e.name}" didn't load`);
  }
  for (const [role, l] of Object.entries(seen.loaded)) {
    if (l.ok) continue;
    const e = expect[role];
    const msg = `brand: the kit's ${role} font "${e.name}" ${l.faces ? `failed to load (${l.status})` : "isn't available"}, so the reader sees a fallback`;
    if (e.source === 'system') warnings.push(msg);
    else if (!errors.some((x) => x.includes(`"${e.name}" didn't load`))) errors.push(msg);
  }

  // References from the brand's own site, when they carry measurements.
  const refs = Array.isArray(referencesIndex) ? referencesIndex : referencesIndex ? [referencesIndex, ...(referencesIndex.references ?? [])] : [];
  const refFonts = {};
  const refColors = [];
  for (const r of refs) {
    for (const role of ['display', 'body']) if (r?.fonts?.[role] && !refFonts[role]) refFonts[role] = r.fonts[role];
    for (const c of r?.colors ?? []) refColors.push(c);
  }
  for (const [role, fam] of Object.entries(refFonts)) {
    const u = Object.values(seen.used).find((x) => x.role === role);
    if (u && norm(u.family) !== norm(fam)) warnings.push(`brand: the brand's site sets ${role} text in "${fam}"; this page uses "${u.family}"`);
  }
  if (refColors.length) {
    const onPage = seen.colors.map(COLOR.parse).filter((c) => c && c.alpha > 0.5);
    const missing = refColors.filter((rc) => {
      const c = COLOR.parse(rc);
      return c && !onPage.some((p) => COLOR.dist(p, c) < 0.03);
    });
    if (missing.length > refColors.length / 2) warnings.push(`brand: ${missing.length} of the ${refColors.length} colors measured on the brand's site don't appear on the page (${missing.slice(0, 4).join(', ')})`);
  }

  // Section backgrounds: brand color, near-white, or other.
  const kitParsed = kitColors.map(COLOR.parse).filter(Boolean);
  const share = { sections: seen.backgrounds.length, brand: 0, white: 0, image: 0, other: 0 };
  for (const b of seen.backgrounds) {
    if (b.image === 'image') { share.image++; continue; }
    const c = COLOR.parse(b.color);
    if (c && c.L > 0.97 && c.C < 0.02) share.white++;
    else if (c && kitParsed.some((k) => COLOR.dist(k, c) < 0.03)) share.brand++;
    else share.other++;
  }
  const distinct = new Set(seen.backgrounds.map((b) => `${b.color}|${b.image ?? ''}`));
  if (seen.backgrounds.length >= 3 && distinct.size === 1) warnings.push(`brand: every section has the same background (${seen.backgrounds[0].color}); mix section backgrounds the way the brand's site does`);
  return { errors, warnings, fonts: seen.used, loaded: seen.loaded, rendered, backgrounds: share };
}
