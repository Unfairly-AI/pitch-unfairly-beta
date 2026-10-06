// Capture a brand from its live website into a draft kit.
// Usage: node bin/brand-capture.mjs <url> [more urls...]
// Writes brand/capture/ (evidence: capture.json, screenshots) and a draft
// brand/brand.json plus brand/logos/ and brand/imagery/. The draft is a
// starting point: read the screenshots, correct the roles and style, then
// confirm the brand board with the user before composing.
import puppeteer from 'puppeteer';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const urls = process.argv.slice(2).filter((a) => /^https?:\/\//.test(a));
if (!urls.length) {
  console.error('Usage: node bin/brand-capture.mjs https://example.com [https://example.com/about]');
  process.exit(2);
}
const OUT = 'brand';
await mkdir(join(OUT, 'capture'), { recursive: true });
await mkdir(join(OUT, 'logos'), { recursive: true });
await mkdir(join(OUT, 'imagery'), { recursive: true });

const browser = await puppeteer.launch({ headless: true });
const pages = [];
try {
  for (const [i, url] of urls.entries()) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
    await page.evaluate(() => document.fonts.ready);
    await new Promise((r) => setTimeout(r, 800));
    const data = await page.evaluate(extract);
    data.url = url;
    // Large visuals that aren't plain image files (inline SVG, canvas,
    // animation players): keep a transparent screenshot of each.
    data.visualShots = [];
    if (i === 0) {
      // Drop page backgrounds so visuals come out on transparency, not the site's white.
      await page.addStyleTag({ content: 'html, body { background: transparent !important; } body * { background-color: transparent !important; }' });
      await page.evaluate(() => window.scrollTo(0, 0));
      const handles = await page.$$('svg, canvas, video, lottie-player, dotlottie-player, [class*="illustration" i], [class*="lottie" i], picture');
      let n = 0;
      for (const handle of handles) {
        if (n >= 4) break;
        const box = await handle.boundingBox();
        if (!box || box.width < 280 || box.height < 220 || box.y > 1800 || box.width > 1400) continue;
        const inLogoArea = box.y < 120 && box.x < 400;
        if (inLogoArea) continue;
        const file = join(OUT, 'imagery', `visual-${++n}.png`);
        await handle.screenshot({ path: file, omitBackground: true, captureBeyondViewport: false }).catch(() => { n--; });
        if (n > 0) data.visualShots.push({ path: `imagery/visual-${n}.png`, width: Math.round(box.width), height: Math.round(box.height) });
      }
    }
    data.fontFiles = await page.evaluate(() =>
      performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /\.(woff2?|ttf|otf)(\?|$)/i.test(n)));
    // Screenshots of the first few screens, for judging style.
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    data.screenshots = [];
    for (let s = 0; s < Math.min(4, Math.ceil(height / 900)); s++) {
      await page.evaluate((y) => window.scrollTo(0, y), s * 900);
      await new Promise((r) => setTimeout(r, 400));
      const file = join(OUT, 'capture', `page${i + 1}-screen${s + 1}.jpg`);
      await page.screenshot({ path: file, type: 'jpeg', quality: 80, captureBeyondViewport: false });
      data.screenshots.push(file);
    }
    pages.push(data);
    await page.close();
  }
} finally {
  await browser.close();
}

// ---------- Merge evidence across pages ----------
const tally = (key) => {
  const m = new Map();
  for (const p of pages) for (const [color, weight] of p[key]) m.set(color, (m.get(color) ?? 0) + weight);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
const backgrounds = tally('backgrounds');
const texts = tally('texts');
const buttons = pages.flatMap((p) => p.buttons);
const cards = pages.flatMap((p) => p.cards);
const home = pages[0];

const rgb = (s) => (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
const hex = (s) => `#${rgb(s).map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')}`;
const lum = (s) => { const [r, g, b] = rgb(s).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const chroma = (s) => { const c = rgb(s); return Math.max(...c) - Math.min(...c); };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

// Roles: paper = the background covering the most area; ink = the dominant
// text color; accent = the most used saturated button or link color.
const paper = backgrounds[0]?.[0] ?? 'rgb(255,255,255)';
const ink = texts.find(([c]) => contrast(c, paper) > 7)?.[0] ?? (lum(paper) > 0.5 ? 'rgb(17,17,17)' : 'rgb(245,245,245)');
const saturated = [...buttons.map((b) => b.background), ...pages.flatMap((p) => p.links)]
  .filter((c) => c && chroma(c) > 40);
const accentCounts = new Map();
for (const c of saturated) accentCounts.set(hex(c), (accentCounts.get(hex(c)) ?? 0) + 1);
const accent = [...accentCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  ?? (backgrounds.find(([c]) => chroma(c) > 40) ? hex(backgrounds.find(([c]) => chroma(c) > 40)[0]) : hex(ink));
const surface = backgrounds.slice(1).find(([c]) => Math.abs(lum(c) - lum(paper)) > 0.01 && Math.abs(lum(c) - lum(paper)) < 0.25)?.[0];
const muted = texts.find(([c]) => hex(c) !== hex(ink) && contrast(c, paper) > 3 && contrast(c, paper) < contrast(ink, paper))?.[0];
const primaryButton = buttons.find((b) => b.background && hex(b.background) === accent);

// Physical style from buttons and cards.
const median = (xs) => { const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
// Pills use huge radii (9999px); keep them apart from card corners.
const cardRadius = median(cards.map((c) => c.radius).filter((r) => r < 200));
const buttonRadii = buttons.map((b) => b.radius);
const pillButtons = buttonRadii.filter((r) => r >= 200).length > buttonRadii.length / 2;
const radius = cardRadius ?? median(buttonRadii.filter((r) => r < 200));
const borderWidth = median(cards.map((c) => c.borderWidth)) ?? 0;
const shadows = cards.map((c) => c.shadow).filter((s) => s && s !== 'none');
const hardShadow = shadows.some((s) => /\b0px\s*(?:0px\s*)?(?:rgb|#)|\s0px\)?$/.test(s.replace(/rgba?\([^)]*\)/g, '').trim()) && !/\d+px \d+px [1-9]\d*px/.test(s));
const shadow = !shadows.length ? 'none' : hardShadow ? 'hard' : 'soft';

// Fonts: prefer an open release on Fontsource; otherwise a stand-in.
const firstFamily = (stack) => (stack ?? '').split(',')[0].trim().replace(/^["']|["']$/g, '');
// Framework font loaders mangle names (__GeistSans_a1b2c3, geistSans
// Fallback): strip them and try a few spellings before giving up.
const familyIds = (family) => {
  const clean = family.replace(/^_+/, '').replace(/_[a-f0-9]{5,}$/i, '').replace(/\s*Fallback$/i, '');
  const spaced = clean.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim();
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const base = slug(spaced);
  const trimmed = slug(spaced.replace(/\s+(display|text|variable|vf|web)$/i, ''));
  const noSans = slug(spaced.replace(/\s+sans$/i, ''));
  return [...new Set([base, trimmed, noSans].filter(Boolean))];
};
const fontsourcePackage = (family) => {
  for (const pkg of familyIds(family).flatMap((id) => [`@fontsource-variable/${id}`, `@fontsource/${id}`])) {
    try {
      execFileSync('npm', ['view', pkg, 'name'], { stdio: ['ignore', 'pipe', 'ignore'] });
      return pkg;
    } catch { /* not published */ }
  }
  return null;
};
const typeFor = (sample, role, fallbackFamily, fallbackPkg) => {
  const family = firstFamily(sample?.fontFamily);
  const pkg = family ? fontsourcePackage(family) : null;
  const base = {
    weight: Number(sample?.fontWeight) || (role === 'display' ? 700 : 400),
    tracking: sample ? Number((parseFloat(sample.letterSpacing) / parseFloat(sample.fontSize) || 0).toFixed(3)) : 0,
    line_height: sample ? Number((parseFloat(sample.lineHeight) / parseFloat(sample.fontSize) || 1.2).toFixed(2)) : 1.2,
    case: sample?.textTransform === 'uppercase' ? 'uppercase' : 'none',
  };
  if (pkg) {
    // Use the family name Fontsource registers, not the site's mangled one.
    const registered = pkg.split('/')[1].split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
    return { family: registered, source: 'fontsource', package: pkg, license: 'open', ...base };
  }
  return {
    family: fallbackFamily, source: 'fontsource', package: fallbackPkg, license: 'stand-in',
    stand_in_for: family || null, ...base,
  };
};
const display = typeFor(home.type.heading, 'display', 'Inter Tight', '@fontsource-variable/inter-tight');
const body = typeFor(home.type.body, 'body', 'Inter', '@fontsource-variable/inter');

// Logo and imagery: download what the site serves.
// Name files by what the server actually sent; a .jpg URL often serves WebP,
// and hosting serves by extension with no sniffing.
const EXT_BY_TYPE = { 'image/svg+xml': 'svg', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/avif': 'avif', 'image/gif': 'gif' };
const download = async (url, stem) => {
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 brand-capture' } });
    if (!res.ok) return null;
    const ext = EXT_BY_TYPE[(res.headers.get('content-type') ?? '').split(';')[0].trim()];
    if (!ext) return null;
    const file = `${stem}.${ext}`;
    await writeFile(join(OUT, file), Buffer.from(await res.arrayBuffer()));
    return file;
  } catch { return null; }
};
const logos = {};
if (home.logo?.svg) {
  await writeFile(join(OUT, 'logos', 'primary.svg'), home.logo.svg);
  logos.primary = 'logos/primary.svg';
} else if (home.logo?.src) {
  const file = await download(home.logo.src, 'logos/primary');
  if (file) logos.primary = file;
}
const imagery = [];
for (const [i, img] of pages.flatMap((p) => p.images).slice(0, 8).entries()) {
  const file = await download(img.src, `imagery/site-${i + 1}`);
  if (file) imagery.push({ path: file, role: 'reference', alt: img.alt ?? '', notes: `From ${img.page}; ${img.width}×${img.height}` });
}

for (const shot of home.visualShots ?? []) {
  imagery.push({ path: shot.path, role: 'reference', alt: '', notes: `Screenshot of a ${shot.width}×${shot.height} visual on the homepage (inline SVG, canvas, or animation)` });
}

const kit = {
  schema: 'brand-kit@1',
  identity: { name: home.siteName || home.title, domain: new URL(urls[0]).hostname.replace(/^www\./, ''), wordmark: home.siteName || home.title, logos },
  palette: {
    paper: hex(paper),
    ...(surface ? { surface: hex(surface) } : {}),
    ink: hex(ink),
    ...(muted ? { ink_muted: hex(muted) } : {}),
    accent,
    ...(primaryButton?.color ? { on_accent: hex(primaryButton.color) } : {}),
    extras: [],
    data: [accent, hex(ink)],
  },
  typography: { display, body, mono: { family: 'JetBrains Mono', source: 'fontsource', package: '@fontsource-variable/jetbrains-mono', license: 'open' } },
  style: {
    radius: Math.min(64, radius ?? 12),
    button_shape: pillButtons ? 'pill' : 'rounded',
    border_width: Math.min(4, borderWidth),
    shadow,
    shadow_offset: shadow === 'hard' ? 8 : 16,
    texture: 'none',
    density: 'balanced',
    motion: 'crisp',
    tilt: 0,
    photo_treatment: null,
    illustration_style: null,
    layout_notes: null,
  },
  imagery,
  voice: [],
  rules: [],
  sources: {
    palette: { from: `computed styles on ${urls.join(', ')}`, confidence: 'medium' },
    typography: { from: 'computed styles on headings and body text', confidence: display.license === 'stand-in' ? 'low' : 'high' },
    style: { from: 'buttons and cards', confidence: 'medium' },
    unreviewed: ['style.illustration_style', 'style.photo_treatment', 'style.motion', 'style.tilt', 'voice', 'rules'],
  },
};

const evidence = {
  urls,
  meta: pages.map((p) => ({ url: p.url, title: p.title, description: p.description, themeColor: p.themeColor })),
  cssVariables: home.cssVariables,
  backgrounds: backgrounds.slice(0, 12).map(([c, w]) => ({ color: hex(c), share: Number(w.toFixed(3)) })),
  texts: texts.slice(0, 10).map(([c, w]) => ({ color: hex(c), weight: Math.round(w) })),
  buttons: buttons.slice(0, 12),
  cards: cards.slice(0, 12),
  type: pages.map((p) => p.type),
  fontFiles: [...new Set(pages.flatMap((p) => p.fontFiles))],
  logoCandidates: home.logoCandidates,
  screenshots: pages.flatMap((p) => p.screenshots),
};
await writeFile(join(OUT, 'capture', 'capture.json'), `${JSON.stringify(evidence, null, 2)}\n`);
await writeFile(join(OUT, 'brand.json'), `${JSON.stringify(kit, null, 2)}\n`);

console.log(`Draft kit for ${kit.identity.name} → brand/brand.json`);
console.log(`  palette: paper ${kit.palette.paper}, ink ${kit.palette.ink}, accent ${kit.palette.accent}`);
console.log(`  display: ${display.family}${display.stand_in_for ? ` (stand-in for ${display.stand_in_for})` : ''}; body: ${body.family}${body.stand_in_for ? ` (stand-in for ${body.stand_in_for})` : ''}`);
console.log(`  style: radius ${kit.style.radius}px, border ${kit.style.border_width}px, shadow ${shadow}`);
console.log(`  logo: ${logos.primary ?? 'not found'}; imagery: ${imagery.length} files`);
console.log(`Evidence and screenshots: brand/capture/. Review them, fix the kit, then npm run brand:apply && npm run brand:board.`);

// ---------- Runs in the page ----------
function extract() {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 2 && r.height > 2 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
  };
  const transparent = (c) => !c || c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c);
  const area = innerWidth * Math.max(innerHeight, document.documentElement.scrollHeight);
  const backgrounds = new Map();
  const texts = new Map();
  const add = (m, k, w) => m.set(k, (m.get(k) ?? 0) + w);

  const rootBg = getComputedStyle(document.body).backgroundColor;
  add(backgrounds, transparent(rootBg) ? getComputedStyle(document.documentElement).backgroundColor || 'rgb(255,255,255)' : rootBg, 0.3);
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (!transparent(cs.backgroundColor)) add(backgrounds, cs.backgroundColor, (r.width * r.height) / area);
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('');
    if (own) add(texts, cs.color, own.length * parseFloat(cs.fontSize));
  }
  // Without explicit backgrounds the page is the browser default white.
  if (transparent(rootBg) && transparent(getComputedStyle(document.documentElement).backgroundColor)) add(backgrounds, 'rgb(255, 255, 255)', 0.5);

  const styleOf = (el) => {
    const cs = getComputedStyle(el);
    return {
      text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40),
      background: transparent(cs.backgroundColor) ? null : cs.backgroundColor,
      color: cs.color,
      radius: parseFloat(cs.borderTopLeftRadius),
      borderWidth: parseFloat(cs.borderTopWidth),
      borderColor: cs.borderTopColor,
      shadow: cs.boxShadow,
      fontFamily: cs.fontFamily,
      fontWeight: cs.fontWeight,
    };
  };
  const buttons = [...document.querySelectorAll('a, button, [role="button"]')]
    .filter((el) => visible(el) && /btn|button|cta/i.test(`${el.className} ${el.getAttribute('role') ?? ''} ${el.tagName}`))
    .map(styleOf).filter((b) => b.background).slice(0, 24);
  const cards = [...document.querySelectorAll('article, section > div, li, [class*="card" i], [class*="tile" i]')]
    .filter((el) => { const r = el.getBoundingClientRect(); return visible(el) && r.width > 200 && r.height > 120 && r.width < innerWidth * 0.9; })
    .map(styleOf).filter((c) => c.background || c.borderWidth > 0 || (c.shadow && c.shadow !== 'none')).slice(0, 24);
  const links = [...document.querySelectorAll('main a, article a, p a')].filter(visible).map((a) => getComputedStyle(a).color).slice(0, 40);

  const sample = (sel) => {
    const el = [...document.querySelectorAll(sel)].find((e) => visible(e) && e.textContent.trim().length > 3);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { text: el.textContent.trim().slice(0, 60), fontFamily: cs.fontFamily, fontWeight: cs.fontWeight, fontSize: cs.fontSize, letterSpacing: cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing, lineHeight: cs.lineHeight === 'normal' ? `${parseFloat(cs.fontSize) * 1.2}px` : cs.lineHeight, textTransform: cs.textTransform };
  };

  // Logo: an SVG or image in the header/nav that links home or says "logo".
  // Logo: the home link's mark nearest the top-left, else anything named logo.
  const home = new Set(['/', `${location.origin}/`, location.origin]);
  const candidates = [
    ...document.querySelectorAll('a svg, a img, [class*="logo" i] svg, [class*="logo" i] img, img[alt*="logo" i], [aria-label*="logo" i] svg'),
  ]
    .filter((el) => visible(el) && el.getBoundingClientRect().top < 200)
    .map((el) => {
      const r = el.getBoundingClientRect();
      const link = el.closest('a');
      const homeLink = link && home.has(link.getAttribute('href') === '/' ? '/' : link.href);
      const named = /logo/i.test(`${el.getAttribute('class') ?? ''} ${el.getAttribute('alt') ?? ''} ${el.closest('[class*="logo" i],[aria-label*="logo" i]') ? 'logo' : ''}`);
      return { el, score: (homeLink ? 0 : 400) + (named ? 0 : 200) + r.top + r.left * 0.3 };
    })
    .sort((a, b) => a.score - b.score)
    .map((c) => c.el)
    .slice(0, 6);
  const logoEl = candidates[0];
  let logo = null;
  if (logoEl?.tagName.toLowerCase() === 'svg') {
    const clone = logoEl.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    if (!clone.getAttribute('viewBox')) { const b = logoEl.getBBox(); clone.setAttribute('viewBox', `${b.x} ${b.y} ${b.width} ${b.height}`); }
    // Resolve currentColor to the rendered color so the file stands alone.
    const svg = clone.outerHTML.replace(/currentColor/g, getComputedStyle(logoEl).color);
    logo = { svg };
  } else if (logoEl) {
    logo = { src: logoEl.currentSrc || logoEl.src };
  }

  const images = [...document.querySelectorAll('img')]
    .filter((img) => visible(img) && img.naturalWidth >= 600 && !candidates.includes(img))
    .map((img) => ({ src: img.currentSrc || img.src, alt: img.alt, width: img.naturalWidth, height: img.naturalHeight, page: location.href }))
    .slice(0, 8);

  const cssVariables = {};
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }
    for (const rule of rules ?? []) {
      if (rule.selectorText === ':root' || rule.selectorText === 'html') {
        for (const prop of rule.style) if (prop.startsWith('--')) cssVariables[prop] = rule.style.getPropertyValue(prop).trim();
      }
    }
  }

  return {
    title: document.title,
    siteName: document.querySelector('meta[property="og:site_name"]')?.content ?? '',
    description: document.querySelector('meta[name="description"]')?.content ?? '',
    themeColor: document.querySelector('meta[name="theme-color"]')?.content ?? null,
    backgrounds: [...backgrounds.entries()],
    texts: [...texts.entries()],
    buttons,
    cards,
    links,
    type: { heading: sample('h1, h2'), body: sample('p'), label: sample('nav a, button') },
    logo,
    logoCandidates: candidates.map((c) => c.tagName.toLowerCase() === 'svg' ? 'inline svg' : (c.currentSrc || c.src)),
    images,
    cssVariables: Object.fromEntries(Object.entries(cssVariables).slice(0, 80)),
  };
}
