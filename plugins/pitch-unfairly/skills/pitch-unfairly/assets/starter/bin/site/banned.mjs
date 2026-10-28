// The banned list, enforced. banned.json holds the house entries; a client's
// brand/brand.json `rules` adds its own (an object rule) and keeps prose ones
// for the critic (a string rule). Three readers:
//
//   sourceBanned(files, entries)   site:check: regexes over the site's HTML and CSS
//   domBanned(page, entries, opts) site:audit and site:gate: detectors on the rendered page
//   rubric(entries, kit)           the critic: every entry without a detector, plus prose rules
//
// A detector is named in an entry's `detect.dom` and defined in DETECTORS below,
// as a function that runs in the page with the page-lint helpers (H). Generic
// detectors (`selector`, `text`, `accent-text` with `colors`) let a client rule
// need no code at all. guide/banned.md says how to add an entry.
import { readFileSync } from 'node:fs';
import { inPage } from './page-lint.mjs';

export const BANNED = JSON.parse(readFileSync(new URL('./banned.json', import.meta.url), 'utf8'));

/**
 * The house entries merged with a kit's `rules`. An object rule with a house id
 * overrides that entry's fields (params, severity; `"off": true` drops it for this
 * client, and says why in `why`); a new id adds an entry. String rules are prose
 * for the critic. Returns { entries, prose, problems } where problems are malformed rules.
 */
export function bannedEntries(kit = null, house = BANNED.entries) {
  const byId = new Map(house.map((e) => [e.id, structuredClone(e)]));
  const prose = [];
  const problems = [];
  for (const [i, r] of (kit?.rules ?? []).entries()) {
    if (typeof r === 'string') { if (r.trim()) prose.push(r.trim()); continue; }
    if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(r.id)) { problems.push(`brand.json rules[${i}]: an object rule needs an "id" in kebab-case.`); continue; }
    const base = byId.get(r.id);
    if (!base && !r.rule) { problems.push(`brand.json rules[${i}] "${r.id}": a new rule needs a "rule" sentence.`); continue; }
    const merged = { ...(base ?? { severity: 'block', source: ['brand.json rules'] }), ...r, detect: r.detect ?? base?.detect, client: !base };
    if (merged.detect?.dom && !DETECTORS[merged.detect.dom]) problems.push(`brand.json rules[${i}] "${r.id}": no detector named "${merged.detect.dom}" (have: ${Object.keys(DETECTORS).join(', ')}).`);
    for (const s of merged.detect?.source ?? []) {
      try { new RegExp(s.pattern, s.flags ?? ''); } catch (e) { problems.push(`brand.json rules[${i}] "${r.id}": bad pattern: ${e.message}`); }
    }
    byId.set(r.id, merged);
  }
  return { entries: [...byId.values()].filter((e) => !e.off), prose, problems };
}

/** Validate the house file itself: unique ids, a rule each, a detector or a rubric each, known detectors. */
export function bannedFileProblems(file = BANNED) {
  const out = [];
  const ids = new Set();
  if (file.schema !== 'banned@1') out.push('schema must be "banned@1"');
  for (const e of file.entries ?? []) {
    if (!e.id || ids.has(e.id)) out.push(`duplicate or missing id: ${e.id}`);
    ids.add(e.id);
    if (!e.rule) out.push(`${e.id}: no rule`);
    if (!['block', 'warn'].includes(e.severity)) out.push(`${e.id}: severity is block or warn`);
    if (!e.source?.length) out.push(`${e.id}: say where the rule came from (source)`);
    if (!e.detect && !e.rubric) out.push(`${e.id}: needs a detector (detect) or a rubric line for the critic`);
    if (e.detect?.dom && !DETECTORS[e.detect.dom]) out.push(`${e.id}: unknown dom detector "${e.detect.dom}"`);
    for (const s of e.detect?.source ?? []) {
      if (!['html', 'css'].includes(s.in)) out.push(`${e.id}: source pattern "in" is html or css`);
      try { new RegExp(s.pattern, s.flags ?? ''); } catch (err) { out.push(`${e.id}: ${err.message}`); }
    }
  }
  return out;
}

const finding = (e, message) => ({ id: e.id, severity: e.severity, message: `banned "${e.id}": ${message}. ${e.rule}` });

/**
 * Source patterns. files: [{ name, kind: 'html'|'css', text }]. Returns findings
 * { id, severity, message }. HTML comments are skipped.
 */
export function sourceBanned(files, entries) {
  const out = [];
  for (const e of entries) {
    for (const s of e.detect?.source ?? []) {
      const re = new RegExp(s.pattern, `${(s.flags ?? '').replace('g', '')}g`);
      for (const f of files) {
        if (f.kind !== s.in) continue;
        const text = f.kind === 'html' ? f.text.replace(/<!--[\s\S]*?-->/g, '') : f.text.replace(/\/\*[\s\S]*?\*\//g, '');
        const hits = [...text.matchAll(re)];
        if (hits.length) out.push(finding(e, `${f.name} has ${hits.length === 1 ? '' : `${hits.length}× `}"${hits[0][0].replace(/\s+/g, ' ').slice(0, 60)}"`));
      }
    }
  }
  return out;
}

// ---------- DOM detectors ----------
// Each runs in the page: (H, params, ctx) => [message, ...]. ctx: { width, kit }.
// Shared bits (buttonLike, textLeaves, contrast) come from PRELUDE.
const PRELUDE = (H) => {
  const { cs, visible, color } = H;
  // WCAG luminance from what the browser actually paints: any CSS colour (oklab, color-mix) drawn to one pixel.
  const px = document.createElement('canvas');
  px.width = px.height = 1;
  const pctx = px.getContext('2d', { willReadFrequently: true });
  const lum = (c) => {
    pctx.clearRect(0, 0, 1, 1);
    pctx.fillStyle = '#fff';
    pctx.fillRect(0, 0, 1, 1);
    pctx.fillStyle = c;
    pctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = pctx.getImageData(0, 0, 1, 1).data;
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const solidBg = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const s = cs(n);
      if (s.backgroundImage && s.backgroundImage !== 'none' && !/gradient/.test(s.backgroundImage)) return null; // over a photo or texture: not judged here
      const c = color.parse(s.backgroundColor);
      if (c && c.alpha > 0.9) return s.backgroundColor;
    }
    return 'rgb(255, 255, 255)';
  };
  const hidden = (el) => !!el.closest('[hidden], [aria-hidden="true"], .sr-only, .sr, .visually-hidden, details:not([open]) > :not(summary)');
  const textLeaves = (root = document.body) => [...root.querySelectorAll('*')].filter((el) => !el.closest('svg, script, style, noscript') && H.ownText(el) && /[\p{L}\p{N}]/u.test(H.ownText(el)) && visible(el) && !hidden(el));
  const filled = (el) => { const s = cs(el); return (color.parse(s.backgroundColor)?.alpha ?? 0) > 0.3 || /gradient\(/.test(s.backgroundImage); };
  const bordered = (el) => { const s = cs(el); return ['Top', 'Right', 'Bottom', 'Left'].every((k) => parseFloat(s[`border${k}Width`]) >= 1 && s[`border${k}Style`] !== 'none' && (color.parse(s[`border${k}Color`])?.alpha ?? 0) > 0.2); };
  const actions = (root) => [...root.querySelectorAll('a[href], button, [role="button"], input[type="submit"]')].filter((el) => visible(el) && !hidden(el) && !el.closest('nav, .crumbs, .breadcrumb, .breadcrumbs, [aria-label*="breadcrumb" i]'));
  const buttonLike = (el) => { const s = cs(el); return (filled(el) || bordered(el)) && parseFloat(s.paddingLeft) >= 8 && el.getBoundingClientRect().height >= 28; };
  const heroOf = () => {
    const h1 = [...document.querySelectorAll('main h1, h1')].find(visible);
    if (!h1) return null;
    return h1.closest('[data-section], section, .hero, header:not(body > header)') ?? h1.parentElement;
  };
  const describe = (el) => `${H.where(el)} "${(el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40)}"`;
  return { lum, contrast, solidBg, hidden, textLeaves, filled, bordered, actions, buttonLike, heroOf, describe };
};

export const DETECTORS = {
  // A short uppercase or tracked label right before a heading, in the content.
  eyebrow: (H, p, X) => {
    const out = [];
    for (const h of document.querySelectorAll('main h1, main h2, main h3, h1, h2')) {
      if (!H.visible(h) || h.closest('footer, nav')) continue;
      let prev = h.previousElementSibling;
      if (!prev && h.parentElement?.matches('hgroup, header, div')) prev = h.parentElement.previousElementSibling;
      if (!prev || !H.visible(prev) || prev.matches('h1, h2, h3, h4, img, picture, figure, svg, nav, ul, ol')) continue;
      const t = (prev.textContent || '').trim();
      const words = t.split(/\s+/).filter(Boolean).length;
      if (!t || words > 7 || t.length > 60) continue;
      const s = H.cs(prev);
      const caps = s.textTransform === 'uppercase' || (t === t.toUpperCase() && /[A-Z]{3}/.test(t));
      const tracked = parseFloat(s.letterSpacing) >= 0.5;
      const small = parseFloat(s.fontSize) < parseFloat(H.cs(h).fontSize) * 0.6;
      if (caps && (tracked || small)) out.push(`eyebrow "${t.slice(0, 40)}" over ${X.describe(h)}`);
    }
    return out.slice(0, 6);
  },
  // Text in an accent (chromatic, or one of params.colors) on a light, solid ground below min contrast.
  'accent-text': (H, p, X) => {
    const out = [];
    const listed = (p.colors ?? []).map((c) => H.color.parse(c)).filter(Boolean);
    for (const el of X.textLeaves(document.querySelector('main') ?? document.body)) {
      const s = H.cs(el);
      const c = H.color.parse(s.color);
      if (!c || c.alpha < 0.5) continue;
      const accent = listed.length ? listed.some((l) => H.color.dist(l, c) < 0.04) : c.C >= 0.06;
      if (!accent) continue;
      const bg = X.solidBg(el);
      if (!bg) continue;
      const g = H.color.parse(bg);
      if (!g || g.L < 0.8) continue; // dark grounds are judged by contrast elsewhere
      const ratio = X.contrast(s.color, bg);
      // Large text (24px, or 18.66px bold) is held to 3:1, as WCAG does; body text to min_contrast.
      const size = parseFloat(s.fontSize);
      const large = size >= 24 || (size >= 18.66 && parseFloat(s.fontWeight) >= 700);
      if (listed.length || ratio < (large ? Math.min(3, p.min_contrast ?? 4.5) : p.min_contrast ?? 4.5)) out.push(`${X.describe(el)} is ${s.color} on ${bg} (${ratio.toFixed(2)}:1)`);
      if (out.length >= 6) break;
    }
    return out;
  },
  // A link or label underlined (decoration, border or a thin bar) in a colour that isn't its text colour.
  'accent-underline': (H, p, X) => {
    const out = [];
    for (const el of document.querySelectorAll('main a, main .link, main [class*="link" i]')) {
      if (!H.visible(el) || X.hidden(el)) continue;
      const s = H.cs(el);
      const text = H.color.parse(s.color);
      const chroma = (v) => { const c = H.color.parse(v); return c && c.alpha > 0.4 && c.C >= 0.06 && (!text || H.color.dist(c, text) > 0.08); };
      let how = null;
      if (/underline/.test(s.textDecorationLine) && chroma(s.textDecorationColor)) how = `text-decoration in ${s.textDecorationColor}`;
      else if (parseFloat(s.borderBottomWidth) >= 1 && s.borderBottomStyle !== 'none' && chroma(s.borderBottomColor) && !X.bordered(el)) how = `border-bottom in ${s.borderBottomColor}`;
      else {
        for (const pseudo of ['::after', '::before']) {
          const ps = H.cs(el, pseudo);
          if (ps.content === 'none' || ps.content === 'normal') continue;
          const hgt = parseFloat(ps.height);
          if (hgt > 0 && hgt <= 4 && chroma(ps.backgroundColor) && (parseFloat(ps.width) || 0) >= el.getBoundingClientRect().width * 0.4) { how = `a ${hgt}px ${pseudo} bar in ${ps.backgroundColor}`; break; }
        }
      }
      if (how) out.push(`${X.describe(el)}: ${how}`);
      if (out.length >= 6) break;
    }
    return out;
  },
  // A link or button with a border all round and no fill (ghost), or text wrapped in brackets.
  'outlined-button': (H, p, X) => {
    const out = [];
    for (const el of document.querySelectorAll('main a[href], main button, body > header a[href], body > header button')) {
      if (!H.visible(el) || X.hidden(el) || el.closest('form, nav, [role="tablist"], [role="menu"]') || el.matches('[aria-expanded], [aria-haspopup], [role="tab"]')) continue;
      const t = (el.textContent || '').trim();
      if (!t) continue;
      const s = H.cs(el);
      const r = el.getBoundingClientRect();
      const ghost = !X.filled(el) && X.bordered(el) && parseFloat(s.paddingLeft) >= 8 && r.height >= 28;
      const before = H.cs(el, '::before').content;
      const after = H.cs(el, '::after').content;
      const bracketed = /^\[.*\]$/.test(t) || (/["'][\[(]["']/.test(before) && /["'][\])]["']/.test(after));
      if (ghost) out.push(`${X.describe(el)} is an outlined button`);
      else if (bracketed) out.push(`${X.describe(el)} is a bracketed action`);
      if (out.length >= 6) break;
    }
    return out;
  },
  // A :hover rule that moves the element up (read from the stylesheets the page loaded).
  'hover-lift': (H) => {
    const out = [];
    const up = /translateY\(\s*-|translate\([^,)]+,\s*-|translate3d\([^,)]+,\s*-/;
    const walk = (rules) => {
      for (const r of rules) {
        if (r.cssRules && !r.selectorText) { walk(r.cssRules); continue; }
        if (!r.selectorText || !/:hover/.test(r.selectorText)) continue;
        const tf = r.style?.transform ?? '';
        const tr = r.style?.translate ?? '';
        if (up.test(tf) || /^\S+\s+-/.test(tr.trim())) {
          const sel = r.selectorText.split(',').map((x) => x.replace(/:hover/g, '').trim());
          // An arrow nudging inside a link isn't a lift; a card, tile, image or button rising is.
          const live = sel.some((x) => { try { return [...document.querySelectorAll(x)].some((el) => H.visible(el) && !el.closest('svg') && el.getBoundingClientRect().width >= 40 && el.getBoundingClientRect().height >= 24); } catch { return false; } });
          if (live) out.push(`${r.selectorText.slice(0, 80)} { transform: ${tf || `translate ${tr}`} }`);
        }
      }
    };
    for (const sheet of document.styleSheets) { try { walk(sheet.cssRules); } catch { /* a cross-origin sheet */ } }
    return [...new Set(out)].slice(0, 6);
  },
  // Blurred decorative shapes, and generated noise (feTurbulence) anywhere.
  'blur-noise': (H, p, X) => {
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
      if (!H.visible(el)) continue;
      const s = H.cs(el);
      const b = /blur\(([\d.]+)px\)/.exec(s.filter ?? '');
      const r = el.getBoundingClientRect();
      if (b && parseFloat(b[1]) >= 8 && !H.ownText(el) && !el.querySelector('img, video') && r.width * r.height > 4000) out.push(`${H.where(el)} is blurred ${b[1]}px`);
      for (const pseudo of ['::before', '::after']) {
        const ps = H.cs(el, pseudo);
        if (ps.content === 'none' || ps.content === 'normal') continue;
        const pb = /blur\(([\d.]+)px\)/.exec(ps.filter ?? '');
        if (pb && parseFloat(pb[1]) >= 8) out.push(`${H.where(el)}${pseudo} is blurred ${pb[1]}px`);
        if (/feTurbulence/i.test(ps.backgroundImage)) out.push(`${H.where(el)}${pseudo} draws generated noise (feTurbulence)`);
      }
      if (/feTurbulence/i.test(s.backgroundImage)) out.push(`${H.where(el)} draws generated noise (feTurbulence)`);
      if (out.length >= 6) break;
    }
    if (document.querySelector('feTurbulence, feturbulence')) out.push('the page draws generated noise with an SVG feTurbulence filter');
    return [...new Set(out)].slice(0, 6);
  },
  // Photos that animate in: clip-path, mask or transform transitions or animations on an image or its frame.
  'image-reveal': (H) => {
    const out = [];
    const animated = (s) => (s.animationName && s.animationName !== 'none' && parseFloat(s.animationDuration) > 0) ? `animation ${s.animationName}` : null;
    const moving = (s) => {
      const props = s.transitionProperty.split(',').map((x) => x.trim());
      const dur = s.transitionDuration.split(',').map(parseFloat);
      return props.some((x, i) => /^(clip-path|mask|mask-position|-webkit-mask|transform|scale|translate|all)$/.test(x) && (dur[i] ?? dur[0]) > 0) ? `transition ${s.transitionProperty}` : null;
    };
    for (const img of document.querySelectorAll('main img, main picture, main video, main [style*="background-image"]')) {
      if (!H.visible(img)) continue;
      const r = img.getBoundingClientRect();
      if (r.width < 120 || r.height < 80) continue;
      for (let n = img, depth = 0; n && n !== document.body && depth < 3; n = n.parentElement, depth++) {
        const s = H.cs(n);
        // A transform transition is a reveal when the photo sits displaced, waiting to move into place.
        const displaced = s.transform !== 'none' && !/^matrix\(1, 0, 0, 1, 0, 0\)$/.test(s.transform);
        const how = animated(s) ?? (moving(s) && (displaced || /clip|mask/.test(s.transitionProperty)) ? `${moving(s)} from ${s.transform}` : null) ?? (s.clipPath !== 'none' && /inset\((?!0(px|%)?\s*\))/.test(s.clipPath) && !/^inset\(0(px)?( 0(px)?)*\)$/.test(s.clipPath) ? `clip-path ${s.clipPath} (a reveal waiting to run)` : null);
        if (how) { out.push(`${H.where(n)}: ${how}`); break; }
      }
      if (out.length >= 6) break;
    }
    return [...new Set(out)];
  },
  // A bar of three or more same-page jump links, or one labelled "On this page".
  'jump-bar': (H) => {
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!H.visible(el) || el.closest('footer')) continue;
      const own = H.ownText(el);
      if (/^(on this page|jump to|in this section)\b/i.test(own)) { out.push(`${H.where(el)} "${own.slice(0, 40)}"`); continue; }
    }
    for (const nav of document.querySelectorAll('nav, [role="navigation"], main ul, main div')) {
      if (!H.visible(nav) || nav.closest('footer') || nav.closest('body > header')) continue;
      const links = [...nav.children].flatMap((c) => (c.matches('a') ? [c] : [...c.querySelectorAll(':scope > a')])).filter(H.visible);
      if (links.length >= 3 && links.every((a) => (a.getAttribute('href') || '').startsWith('#') && a.getAttribute('href').length > 1)) out.push(`${H.where(nav)} is a strip of ${links.length} jump links`);
    }
    return [...new Set(out)].slice(0, 4);
  },
  // Placeholders a reader can see.
  placeholder: (H, p, X) => {
    const out = [];
    const re = /\{\{\??[^}]*\}\}|\blorem ipsum\b|\bTBD\b|\bTODO\b|\bXXX\b|^to confirm\b|\bplaceholder\b|\bcoming soon\b/i;
    for (const el of X.textLeaves()) {
      const t = H.ownText(el);
      if (re.test(t)) out.push(`${X.describe(el)}`);
      if (out.length >= 8) break;
    }
    for (const el of document.querySelectorAll('mark.confirm, .confirm, .tbc, .placeholder, [data-placeholder]')) if (H.visible(el) && !X.hidden(el)) out.push(`${X.describe(el)} is a placeholder chip`);
    return [...new Set(out)].slice(0, 8);
  },
  // More than one button-like action in the hero, or chips there.
  'crowded-hero': (H, p, X) => {
    const hero = X.heroOf();
    if (!hero) return [];
    const acts = X.actions(hero).filter((el) => !el.closest('body > header') || hero.matches('body > header'));
    const buttons = acts.filter(X.buttonLike);
    const out = [];
    const pill = (el) => { const r = el.getBoundingClientRect(); const s = H.cs(el); return r.height <= 44 && (el.textContent || '').trim().length <= 40 && parseFloat(s.borderTopLeftRadius) >= r.height / 2 - 2 && (X.filled(el) || X.bordered(el)); };
    const chips = [...hero.querySelectorAll('a, button, span, li')].filter((el) => H.visible(el) && !X.hidden(el) && pill(el));
    const chipRow = chips.filter((c) => !buttons.includes(c) && !chips.some((o) => o !== c && o.contains(c)));
    if (buttons.length > 1) out.push(`the hero has ${buttons.length} buttons (${buttons.slice(0, 3).map((b) => `"${b.textContent.trim().slice(0, 24)}"`).join(', ')}); keep one, make the rest text links`);
    if (chipRow.length >= 2) out.push(`the hero carries ${chipRow.length} chips (${chipRow.slice(0, 3).map((b) => `"${b.textContent.trim().slice(0, 20)}"`).join(', ')})`);
    if (acts.length > 2) out.push(`the hero has ${acts.length} actions (${acts.slice(0, 4).map((b) => `"${(b.textContent || b.getAttribute('aria-label') || '').trim().slice(0, 24)}"`).join(', ')}); one primary and at most one text link`);
    return out;
  },
  // A paragraph over the word limit that isn't inside a disclosure.
  'wall-of-text': (H, p, X) => {
    const limit = p.words ?? 60;
    const out = [];
    for (const el of document.querySelectorAll('main p, main li, main dd, main blockquote')) {
      if (!H.visible(el) || el.closest('details, blockquote p, small, footer, [data-fine-print]')) continue;
      // Text inside a disclosure doesn't count, even when the reader has opened it; its summary does.
      const count = (t) => (t || '').trim().split(/\s+/).filter(Boolean).length;
      let words = count(el.innerText);
      for (const d of el.querySelectorAll('details')) words -= count(d.innerText) - count(d.querySelector(':scope > summary')?.innerText);
      if (words > limit) out.push(`${X.describe(el)} is ${words} words`);
      if (out.length >= 6) break;
    }
    return out;
  },
  'native-select': (H, p, X, ctx) => {
    if (ctx.width < (p.min_width ?? 768)) return [];
    return [...document.querySelectorAll('select')].filter((s) => H.visible(s) && !X.hidden(s)).map((s) => `${X.describe(s)} is a native select at ${ctx.width}px`).slice(0, 4);
  },
  // Two logo images in the header or first screen.
  'double-logo': (H) => {
    const header = document.querySelector('body > header, header, [role="banner"]');
    const scope = header ?? document.body;
    const logos = [...scope.querySelectorAll('img, svg')].filter((el) => H.visible(el) && el.getBoundingClientRect().top < innerHeight && /logo|lockup|wordmark|brand/i.test(`${el.getAttribute('alt') ?? ''} ${el.getAttribute('src') ?? ''} ${el.getAttribute('class') ?? ''} ${el.getAttribute('aria-label') ?? ''} ${el.closest('a')?.className ?? ''}`));
    const srcs = new Set(logos.map((l) => l.getAttribute('src') ?? l.outerHTML.slice(0, 80)));
    return logos.length >= 2 ? [`${logos.length} logos in the ${header ? 'header' : 'first screen'} (${[...srcs].slice(0, 2).join(', ')})`] : [];
  },
  'draft-banner': (H, p, X) => {
    const out = [];
    for (const el of X.textLeaves()) {
      if (el.closest('[data-sample]')) continue;
      const r = el.getBoundingClientRect();
      if (r.top > innerHeight * 0.5 + scrollY) continue;
      if (/^\s*(draft|preview|work in progress|not final|for review)\b/i.test(H.ownText(el))) out.push(X.describe(el));
    }
    return out.slice(0, 3);
  },
  // Generic, for client rules: any visible element matching params.selector (and params.text, a regex).
  selector: (H, p, X) => {
    let els = [];
    try { els = [...document.querySelectorAll(p.selector)]; } catch { return [`bad selector ${p.selector}`]; }
    const re = p.text ? new RegExp(p.text, p.flags ?? 'i') : null;
    return els.filter((el) => H.visible(el) && !X.hidden(el) && (!re || re.test(el.textContent || ''))).slice(0, 6).map((el) => X.describe(el));
  },
  // Generic: visible text matching params.pattern.
  text: (H, p, X) => {
    const re = new RegExp(p.pattern, p.flags ?? 'i');
    return X.textLeaves().filter((el) => re.test(H.ownText(el))).slice(0, 6).map((el) => X.describe(el));
  },
};

/**
 * Run every entry's DOM detector on the page as it stands (no reload).
 * ctx: { width }. Returns findings { id, severity, message }.
 */
export async function domBanned(page, entries, ctx = {}) {
  const width = ctx.width ?? page.viewport()?.width ?? 1280;
  const jobs = entries.filter((e) => e.detect?.dom).map((e) => ({ id: e.id, name: e.detect.dom, params: e.detect.params ?? {} }));
  const src = `{${Object.entries(DETECTORS).map(([k, f]) => `${JSON.stringify(k)}: ${f}`).join(',\n')}}`;
  const results = await inPage(page, `(H, arg) => {
    const X = (${PRELUDE})(H);
    const D = ${src};
    const out = {};
    for (const j of arg.jobs) {
      try { out[j.id] = D[j.name](H, j.params, X, { width: arg.width }); } catch (e) { out[j.id] = ['detector failed: ' + e.message]; }
    }
    return out;
  }`, { jobs, width });
  const byId = new Map(entries.map((e) => [e.id, e]));
  return Object.entries(results).flatMap(([id, msgs]) => msgs.map((m) => finding(byId.get(id), m)));
}

/** The critic's rubric: entries with no detector (and the detectable ones, briefly), plus a kit's prose rules. */
export function rubric(kit = null) {
  const { entries, prose } = bannedEntries(kit);
  return {
    judge: entries.filter((e) => !e.detect).map((e) => ({ id: e.id, severity: e.severity, rule: e.rule, look_for: e.rubric })),
    enforced: entries.filter((e) => e.detect).map((e) => ({ id: e.id, rule: e.rule })),
    client: prose,
  };
}
