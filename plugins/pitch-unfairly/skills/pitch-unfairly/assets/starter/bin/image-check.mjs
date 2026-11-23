// image-check: every image on every slide, measured against its own pixels on the 1920x1080 stage at 2x.
// The audit runs it (bin/audit.mjs) and writes artifacts/image-check.json, which review-files sends to the design
// review. On its own, with the dev server up: npm run image:check -- [base-url] [--json file] [--context file]
// The cloud build ships the same file as inputs/tools/image-check.mjs (unfairly-app image-check.ts).
// Blocking: an image shown more than 1.5x past its pixels on a 2x screen (it looks soft or blurry; 1.5 is how a laptop
// at 2x draws the stage), or one stretched out of its aspect. Each image is listed with its source tier from the
// sources.json beside it (workspace, press, original, site, capture, crop) when asset-grab saved it. A note: a cover crop that keeps less than 60% of the picture's width or height (it cuts through UI).
// --context adds the findings to the review context, so the hosted design review counts them as defects.
import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const DPR = 2;
// A 1440-wide laptop at 2x draws the 1920 stage at 1.5 screen pixels per stage pixel: up to 1.5x its pixels is sharp
// there (image-check.ts UPSCALE_LIMIT).
export const UPSCALE_LIMIT = 1.5;
export const STRETCH_LIMIT = 0.02;
export const COVER_KEEP_MIN = 0.6;

// How one image sits in its box. m: { mode, w, h, nw, nh }: the object-fit (or background size) mode, the box on
// the stage in CSS px, and the file's own pixels.
export function fitOf(m) {
  const sx = m.w / m.nw;
  const sy = m.h / m.nh;
  let scale;
  if (m.mode === 'contain') scale = Math.min(sx, sy);
  else if (m.mode === 'cover') scale = Math.max(sx, sy);
  else if (m.mode === 'none') scale = 1;
  else if (m.mode === 'scale-down') scale = Math.min(1, sx, sy);
  else scale = Math.max(sx, sy);
  const fill = !m.mode || m.mode === 'fill';
  const stretch = fill ? Math.abs(sx / sy - 1) : 0;
  const keepW = m.mode === 'cover' ? Math.min(1, m.w / (m.nw * scale)) : 1;
  const keepH = m.mode === 'cover' ? Math.min(1, m.h / (m.nh * scale)) : 1;
  return { scale, atDpr: scale * DPR, stretch, keepW, keepH };
}

const fileOf = (src) => {
  // A published deck's files sit under d/<deck>/v<n>/ on the CDN: name them as the deck folder does.
  try { return decodeURIComponent(new URL(src).pathname).replace(/^\/+/, '').replace(/^d\/[0-9a-f-]{36}\/v\d+\//, '') || src; } catch { return String(src).slice(0, 120); }
};
const px = (n) => Math.round(n);

// Findings for measured images: [{ slide, shot, src, mode, w, h, nw, nh }] -> [{ slide, shot, blocking, problem, fix }].
export function imageProblems(images) {
  const out = [];
  for (const m of images) {
    if (!(m.nw > 0 && m.nh > 0 && m.w > 0 && m.h > 0)) continue;
    const f = fitOf(m);
    const file = fileOf(m.src);
    const base = { slide: m.slide, shot: m.shot, src: file };
    if (f.atDpr > UPSCALE_LIMIT) {
      // The box scales the image in proportion, so the sharp box is this one shrunk by how far over the limit it is.
      const maxW = Math.floor((m.w * UPSCALE_LIMIT) / f.atDpr);
      const maxH = Math.floor((m.h * UPSCALE_LIMIT) / f.atDpr);
      out.push({ ...base, blocking: true, kind: 'upscaled',
        problem: file + ' is shown ' + px(m.w) + 'x' + px(m.h) + ' on the slide from ' + m.nw + 'x' + m.nh + ' pixels: ' + f.atDpr.toFixed(1) + 'x its pixels on a 2x screen (over ' + UPSCALE_LIMIT + 'x), so it looks soft',
        fix: 'Show it at ' + maxW + 'x' + maxH + ' or smaller, or use a sharper source of at least ' + Math.ceil((m.nw * f.atDpr) / UPSCALE_LIMIT) + 'x' + Math.ceil((m.nh * f.atDpr) / UPSCALE_LIMIT) + ' pixels (the original file: asset-grab original <url>, press kit, or shot --fit ' + px(m.w) + '), never an enlarged crop.' });
    }
    if (f.stretch > STRETCH_LIMIT) {
      out.push({ ...base, blocking: true, kind: 'stretched',
        problem: file + ' is stretched ' + Math.round(f.stretch * 100) + '%: its box is ' + px(m.w) + 'x' + px(m.h) + ' but the image is ' + m.nw + 'x' + m.nh,
        fix: 'Keep its aspect: height auto, or object-fit: contain in a frame.' });
    }
    if (Math.min(f.keepW, f.keepH) < COVER_KEEP_MIN) {
      const axis = f.keepW < f.keepH ? 'width' : 'height';
      out.push({ ...base, blocking: false, kind: 'cropped',
        problem: file + ' is cover-cropped to ' + Math.round(Math.min(f.keepW, f.keepH) * 100) + '% of its ' + axis + ', which cuts through whatever is at its edges',
        fix: 'If it is product UI, show it whole (object-fit: contain, in a frame) or crop the source to the panel that matters, at this box\'s shape.' });
    }
  }
  return out;
}

// In the page: every image on every slide, with the file's own pixels. Runs with animations finished, like the audit.
export async function measureInPage() {
  for (const a of document.getAnimations()) {
    try { if (a.effect && a.effect.getTiming().iterations !== Infinity) a.finish(); } catch {}
  }
  const vector = (src) => /^data:image\/svg/i.test(src) || /\.svg(?:[?#]|$)/i.test(src);
  const pixels = new Map();
  const natural = (src) => {
    if (!pixels.has(src)) pixels.set(src, new Promise((ok) => {
      const i = new Image();
      i.onload = () => ok({ nw: i.naturalWidth, nh: i.naturalHeight });
      i.onerror = () => ok(null);
      i.src = src;
    }));
    return pixels.get(src);
  };
  // Transforms inside the slide (a zoom, a tilt) change the size on screen; the stage's own fit to the window doesn't.
  const scaleWithin = (el, slide) => {
    let s = 1;
    for (let n = el; n && n !== slide; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.transform && cs.transform !== 'none') { const t = new DOMMatrix(cs.transform); s *= Math.hypot(t.a, t.b); }
      if (cs.scale && cs.scale !== 'none') s *= parseFloat(cs.scale) || 1;
    }
    return s;
  };
  const bgBox = (size, w, h, nw, nh) => {
    const first = size.split(',')[0].trim();
    if (first === 'cover' || first === 'contain') return { mode: first, w, h };
    const parts = first.split(/\s+/);
    const one = (v, whole) => (v.endsWith('%') ? (parseFloat(v) / 100) * whole : v.endsWith('px') ? parseFloat(v) : null);
    const bw = one(parts[0] || 'auto', w);
    const bh = one(parts[1] || 'auto', h);
    if (bw == null && bh == null) return { mode: 'none', w: nw, h: nh };
    if (bw != null && bh != null) return { mode: 'fill', w: bw, h: bh };
    if (bw != null) return { mode: 'fill', w: bw, h: (bw * nh) / nw };
    return { mode: 'fill', w: (bh * nw) / nh, h: bh };
  };
  const out = [];
  const slides = [...document.querySelectorAll('.slide')];
  for (const [i, slide] of slides.entries()) {
    const shot = String(i + 1).padStart(2, '0') + '-' + String(slide.id || 'slide').replace(/^slide-/, '') + '.png';
    for (const img of slide.querySelectorAll('img')) {
      const src = img.currentSrc || img.src;
      if (!src || vector(src) || img.offsetWidth < 24 || img.offsetHeight < 24) continue;
      const n = await natural(src);
      if (!n || !n.nw) continue;
      const s = scaleWithin(img, slide);
      const cs = getComputedStyle(img);
      const cw = img.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const ch = img.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      out.push({ slide: slide.id, shot, src, kind: 'img', mode: cs.objectFit || 'fill', w: cw * s, h: ch * s, nw: n.nw, nh: n.nh });
    }
    for (const el of [slide, ...slide.querySelectorAll('*')]) {
      const cs = getComputedStyle(el);
      const m = /url\(["']?([^"')]+)["']?\)/.exec(cs.backgroundImage || '');
      if (!m || vector(m[1]) || el.offsetWidth < 24 || el.offsetHeight < 24) continue;
      const n = await natural(m[1]);
      if (!n || !n.nw) continue;
      const s = scaleWithin(el, slide);
      const box = bgBox(cs.backgroundSize || 'auto', el.clientWidth, el.clientHeight, n.nw, n.nh);
      out.push({ slide: slide.id, shot, src: m[1], kind: 'background', mode: box.mode, w: box.w * s, h: box.h * s, nw: n.nw, nh: n.nh });
    }
  }
  return out;
}

// The audit's entry: measure the deck with the audit's own browser, on a 2x page (a srcset picks its 2x file there).
export async function auditImages(browser, base) {
  const lists = [];
  for (const url of renderUrls(base)) {
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: DPR });
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__deckReady === true, { timeout: 15000 }).catch(() => {});
      lists.push(await page.evaluate(measureInPage));
    } finally {
      await page.close().catch(() => {});
    }
  }
  const images = worstOf(lists);
  for (const m of images) m.tier = tierOf(m.src);
  return { images, findings: imageProblems(images) };
}

async function launch() {
  const require = createRequire(join(process.cwd(), 'package.json'));
  let opts = { headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] };
  const stable = join(process.cwd(), 'bin', 'stable-shots.mjs');
  if (existsSync(stable)) {
    try { const m = await import(pathToFileURL(stable).href); if (m.stableLaunch) opts = { ...m.stableLaunch(), headless: true }; } catch {}
  }
  try {
    const puppeteer = require('puppeteer');
    const b = await puppeteer.launch(opts);
    return { close: () => b.close(), page: async () => { const p = await b.newPage(); await p.setViewport({ width: 1920, height: 1080, deviceScaleFactor: DPR }); return p; } };
  } catch (e) {
    let pw;
    try { pw = require('playwright'); } catch { throw e; }
    const b = await pw.chromium.launch({ headless: true });
    return { close: () => b.close(), page: () => b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: DPR }) };
  }
}

// The static render (what the PDF and the screenshots show) and the deck as presented: a layout can differ between them.
// The tier a file was saved at (asset-grab's sources.json), looked up by its path under public/; null when unrecorded.
export function tierOf(src, root = 'public') {
  const file = fileOf(src);
  const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '';
  try {
    const list = JSON.parse(readFileSync(join(root, dir, 'sources.json'), 'utf8'));
    const hit = list.find((e) => e.file === file.slice(dir ? dir.length + 1 : 0));
    return hit ? hit.tier || (hit.kind === 'crop' ? 'crop' : hit.kind === 'screenshot' ? 'capture' : 'site') : null;
  } catch { return null; }
}

function renderUrls(base) {
  const b = base.replace(/\/$/, '');
  if (b.includes('?')) return [b];
  const root = /\.html$/.test(b) ? b : b + '/';
  return [root + '?pdf=1', root];
}

// One entry per slide and file: the larger of its sizes across renders.
export function worstOf(lists) {
  const by = new Map();
  for (const m of lists.flat()) {
    const key = m.shot + '|' + m.kind + '|' + m.src;
    const had = by.get(key);
    if (!had || fitOf(m).atDpr > fitOf(had).atDpr || (m.mode === 'cover' && Math.min(fitOf(m).keepW, fitOf(m).keepH) < Math.min(fitOf(had).keepW, fitOf(had).keepH))) by.set(key, m);
  }
  return [...by.values()];
}

async function main() {
  const argv = process.argv.slice(2);
  const flag = (name) => { const i = argv.indexOf('--' + name); if (i < 0) return undefined; const v = argv[i + 1]; argv.splice(i, 2); return v; };
  const jsonOut = flag('json');
  const contextFile = flag('context');
  const base = argv.find((a) => !a.startsWith('--')) || 'http://localhost:4321';
  let browser;
  let images;
  try {
    browser = await launch();
    const lists = [];
    for (const url of renderUrls(base)) {
      const page = await browser.page();
      await page.goto(url, { waitUntil: 'load', timeout: 60000 });
      await page.waitForFunction(() => window.__deckReady === true, { timeout: 15000 }).catch(() => {});
      // A hosted deck sits in a frame: measure the frame that holds the slides.
      let frame = page.mainFrame();
      for (const f of page.frames()) {
        if (await f.evaluate(() => document.querySelectorAll('.slide').length).catch(() => 0)) { frame = f; break; }
      }
      lists.push(await frame.evaluate(measureInPage));
      await page.close().catch(() => {});
    }
    images = worstOf(lists);
  } catch (e) {
    console.log('image-check could not measure ' + base + ': ' + (e && e.message ? e.message : e));
    process.exit(2);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  // Where each image came from: the tier asset-grab recorded in the sources.json beside it (public/<dir>/sources.json).
  for (const m of images) m.tier = tierOf(m.src);
  const found = imageProblems(images);
  const blocking = found.filter((f) => f.blocking);
  for (const f of found) console.log((f.blocking ? '✗ stage: ' : '  note: ') + f.slide + ': image ' + f.problem + '. ' + f.fix);
  console.log(found.length
    ? blocking.length + ' image' + (blocking.length === 1 ? '' : 's') + ' to fix, ' + (found.length - blocking.length) + ' note' + (found.length - blocking.length === 1 ? '' : 's') + ' (' + images.length + ' measured).'
    : 'Images sharp: ' + images.length + ' measured, none shown above its pixels on a 2x screen or stretched.');
  for (const m of images) {
    const f = fitOf(m);
    console.log('  ' + m.shot + ': ' + fileOf(m.src) + ' ' + m.nw + 'x' + m.nh + ' shown ' + px(m.w) + 'x' + px(m.h) + ', ' + f.atDpr.toFixed(2) + 'x on 2x, tier ' + (m.tier || 'unknown'));
  }
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ checked: images.length, images, findings: found }, null, 2) + '\n');
  if (contextFile && existsSync(contextFile)) {
    try {
      const ctx = JSON.parse(readFileSync(contextFile, 'utf8'));
      ctx.images = found.map((f) => ({ shot: f.shot, problem: f.problem, fix: f.fix, blocking: f.blocking }));
      writeFileSync(contextFile, JSON.stringify(ctx));
    } catch (e) {
      console.log('image-check could not add its findings to ' + contextFile + ': ' + (e && e.message ? e.message : e));
    }
  }
  process.exit(blocking.length ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
