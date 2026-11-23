// asset-grab: find a brand's real visuals for a slide, original files first. Run it from the deck folder (it uses
// In the starter: npm run asset:grab -- <command> (workflow step 3b). The cloud build ships this same file as inputs/tools/asset-grab.mjs.
// the deck's own headless browser). Every file it saves is recorded with its source and its tier in
// <out>/sources.json. Get each slide's visual from the first tier that has it:
//   1 workspace  the workspace's own uploads and brand book assets (inputs/brand, brand_assets):
//                node asset-grab.mjs adopt <file> --from "<where it came from>"   records it as tier workspace
//   2 press      the brand's press or media kit, linked from its site:
//                node asset-grab.mjs press <site>          finds /press, /media, /brand, /newsroom pages, saves their images
//   3 original   a site image at its original resolution, not the resized copy the page shows:
//                node asset-grab.mjs page <url>            og:image and the page's large images, each at its original file
//                node asset-grab.mjs original <image-url>  one image, resolved to its original file
//   4 capture    a re-shoot at the pixels the slide needs, only when no file exists (a screen built in HTML):
//                node asset-grab.mjs shot <url> --selector "<css>" --fit <width on the slide> [--scale 2] [--full]
//   5 smaller    otherwise show the best file smaller, or whole in a frame.
//   node asset-grab.mjs crop <image> <x> <y> <w> <h> [--out file.png]   x y w h as fractions (0-1) or pixels
// Every saved file prints "sharp up to WxH": the largest it can be shown on the 1920x1080 slide and stay sharp
// (3/4 of its pixels: a laptop at 2x draws the stage at 1.5 screen pixels per stage pixel). Show it no larger.
// It honours robots.txt and stops at a block (401, 403, 429, a challenge page); it never retries around one.
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  if (i < 0) return dflt;
  const v = argv[i + 1];
  argv.splice(i, v && !v.startsWith('--') ? 2 : 1);
  return v && !v.startsWith('--') ? v : true;
};
const today = new Date().toISOString().slice(0, 10);
// The share of its pixel width an image can be shown at on the slide (image-check UPSCALE_LIMIT 1.5 / 2x).
export const SHARP_SHARE = 0.75;

async function browser() {
  const require = createRequire(join(process.cwd(), 'package.json'));
  const puppeteer = require('puppeteer');
  let opts = { headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] };
  const stable = join(process.cwd(), 'bin', 'stable-shots.mjs');
  if (existsSync(stable)) {
    try {
      const m = await import(pathToFileURL(stable).href);
      if (m.stableLaunch) opts = { ...m.stableLaunch(), headless: true };
    } catch {}
  }
  return puppeteer.launch(opts);
}

function record(out, entry) {
  const file = join(out, 'sources.json');
  let list = [];
  try { list = JSON.parse(readFileSync(file, 'utf8')); } catch {}
  list = list.filter((e) => e.file !== entry.file);
  list.push({ ...entry, observed_at: today });
  writeFileSync(file, JSON.stringify(list, null, 2) + '\n');
}

// A file's own pixels, from its header (PNG, JPEG, WebP, GIF); null for anything else (SVG scales freely).
export function pixelSize(b) {
  if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b.length >= 10 && /^GIF8[79]a$/.test(b.toString('ascii', 0, 6))) return { w: b.readUInt16LE(6), h: b.readUInt16LE(8) };
  if (b.length >= 30 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const kind = b.toString('ascii', 12, 16);
    if (kind === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
    if (kind === 'VP8L') { const bits = b.readUInt32LE(21); return { w: 1 + (bits & 0x3fff), h: 1 + ((bits >> 14) & 0x3fff) }; }
    if (kind === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
    return null;
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const m = b[i + 1];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return null;
}
const sharp = (size) => (size ? size.w + 'x' + size.h + ' px, sharp up to ' + Math.floor(size.w * SHARP_SHARE) + 'x' + Math.floor(size.h * SHARP_SHARE) + ' on a slide' : 'vector');

// ---------- original files ----------

// Resize parameters image CDNs put in the query string (imgix, Contentful, Sanity, Storyblok, Jetpack, Shopify, ...),
// split into size (safe to drop: same framing, more pixels) and framing (dropping it can change the picture).
const SIZE_PARAMS = ['w', 'h', 'width', 'height', 'dpr', 'q', 'quality', 'max-w', 'max-h', 'min-w', 'min-h', 'sz', 'size', 'resize', 'fm', 'format', 'auto'];
const FRAME_PARAMS = ['fit', 'crop', 'rect', 'ar'];

// Candidate URLs for an image's original file, best first, from how known image CDNs encode a resize. The caller
// fetches each and keeps one only when it is the same picture at more pixels (resolveOriginal).
export function originalCandidates(raw) {
  let u;
  try { u = new URL(raw); } catch { return []; }
  const out = [];
  const add = (x) => { if (x && x !== raw && !out.includes(x)) out.push(x); };
  const path = u.pathname;
  // Next.js and Vercel image optimizers: the source file is the url parameter.
  if (/\/_(?:next|vercel)\/image\/?$/.test(path) && u.searchParams.get('url')) {
    let inner;
    try { inner = new URL(u.searchParams.get('url'), u.origin).href; } catch { return out; }
    add(inner);
    for (const c of originalCandidates(inner)) add(c);
    return out;
  }
  // Cloudinary: transformation segments (w_800,c_fill,q_auto ...) between /upload/ and the version or public id.
  const cl = path.match(/^(.*\/(?:image|video)\/(?:upload|fetch)\/)(.+)$/);
  if (cl) {
    const segs = cl[2].split('/');
    let i = 0;
    while (i < segs.length - 1 && /^[a-z]{1,3}_[^,/]+(?:,[a-z]{1,3}_[^,/]+)*$/.test(segs[i])) i++;
    if (i > 0) add(u.origin + cl[1] + segs.slice(i).join('/') + u.search);
  }
  // Webflow: name-p-800.jpeg is a resized copy of name.jpeg.
  if (/-p-\d+(\.\w+)$/.test(path)) add(u.origin + path.replace(/-p-\d+(\.\w+)$/, '$1') + u.search);
  // Shopify: name_800x.jpg, name_800x600.jpg, name_large.jpg are resized copies of name.jpg.
  if (/(^|\.)shopify\.com$/.test(u.hostname) || path.includes('/cdn/shop/')) {
    const p = path.replace(/_(?:\d+x\d*|\d*x\d+|pico|icon|thumb|small|compact|medium|large|grande|master)(?:@\dx)?(\.\w+)$/, '$1');
    if (p !== path) add(u.origin + p + u.search);
  }
  // WordPress: name-1024x768.jpg is a resized copy of name.jpg.
  if (path.includes('/wp-content/uploads/') && /-\d+x\d+(\.(?:jpe?g|png|webp|gif))$/i.test(path)) add(u.origin + path.replace(/-\d+x\d+(\.\w+)$/, '$1') + u.search);
  // Query-string resizers: drop the size parameters first (same framing), then the framing ones too.
  const keys = [...u.searchParams.keys()].map((k) => k.toLowerCase());
  if (keys.some((k) => SIZE_PARAMS.includes(k) || FRAME_PARAMS.includes(k))) {
    for (const drop of [SIZE_PARAMS, [...SIZE_PARAMS, ...FRAME_PARAMS]]) {
      for (const base of [...out.filter((x) => x.includes('?')), u.href]) {
        const c = new URL(base);
        for (const k of [...c.searchParams.keys()]) if (drop.includes(k.toLowerCase())) c.searchParams.delete(k);
        add(c.href.replace(/\?$/, ''));
      }
    }
  }
  return out;
}

// robots.txt, per origin: the rules for any user agent (*). Longest match wins; Allow wins a tie.
const robotsCache = new Map();
export function robotsAllows(robotsText, path) {
  const rules = [];
  let mine = false;
  let inAgents = false;
  for (const raw of String(robotsText).split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'user-agent') {
      if (!inAgents) mine = false;
      inAgents = true;
      if (val === '*') mine = true;
      continue;
    }
    inAgents = false;
    if (mine && (key === 'allow' || key === 'disallow') && val) rules.push({ allow: key === 'allow', val });
  }
  let best = null;
  for (const r of rules) {
    const re = new RegExp('^' + r.val.replace(/[.+?^(){}|[\]\\]/g, '\\$&').replace(/\*/g, '.*'));
    if (re.test(path) && (!best || r.val.length > best.val.length || (r.val.length === best.val.length && r.allow))) best = r;
  }
  return !best || best.allow;
}
async function allowed(url) {
  let u;
  try { u = new URL(url); } catch { return false; }
  if (!robotsCache.has(u.origin)) {
    robotsCache.set(u.origin, fetch(u.origin + '/robots.txt', { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(8000) })
      .then((r) => (r.ok ? r.text() : ''))
      .catch(() => ''));
  }
  return robotsAllows(await robotsCache.get(u.origin), u.pathname + u.search);
}

// One fetch, as a browser would ask. A block (401, 403, 429, a challenge or an HTML page where an image was asked
// for) is reported and left alone: never retried with other headers, never worked around.
async function fetchImage(url, referer) {
  if (!(await allowed(url))) return { skip: 'robots.txt disallows it' };
  const res = await fetch(url, { headers: { 'user-agent': UA, ...(referer ? { referer } : {}) }, signal: AbortSignal.timeout(30000) }).catch(() => null);
  if (!res) return { skip: 'unreachable' };
  if (res.status === 401 || res.status === 403 || res.status === 429 || res.headers.get('cf-mitigated')) return { skip: 'blocked (' + res.status + ')' };
  const type = res.ok ? res.headers.get('content-type') || '' : '';
  if (!/^image\//.test(type)) return { skip: res.ok ? 'not an image (' + type.split(';')[0] + ')' : 'HTTP ' + res.status };
  if (Number(res.headers.get('content-length') || 0) > 40e6) return { skip: 'over 40 MB' };
  const body = Buffer.from(await res.arrayBuffer());
  return { body, type };
}

// Same picture? Both drawn at 16x16 grey: the mean difference, 0 to 255. Under 14 is the same image re-encoded or
// resized; a different crop or picture scores far higher.
async function difference(b, x, y) {
  const page = await b.newPage();
  try {
    const url = (f) => 'data:' + f.type.split(';')[0] + ';base64,' + f.body.toString('base64');
    return await page.evaluate(async (p, q) => {
      const load = (s) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = s; });
      const grey = (img) => {
        const c = document.createElement('canvas');
        c.width = 16; c.height = 16;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0, 16, 16);
        const d = g.getImageData(0, 0, 16, 16).data;
        const v = [];
        for (let k = 0; k < d.length; k += 4) v.push((d[k] * 299 + d[k + 1] * 587 + d[k + 2] * 114) / 1000);
        return v;
      };
      const [a, c] = [grey(await load(p)), grey(await load(q))];
      let s = 0;
      for (let k = 0; k < a.length; k++) s += Math.abs(a[k] - c[k]);
      return s / a.length;
    }, url(x), url(y));
  } catch { return 999; } finally { await page.close().catch(() => {}); }
}

// The largest verified original of an image the page served: same aspect (within 2%), the same picture, more pixels.
async function resolveOriginal(b, served, url, referer) {
  const size = pixelSize(served.body);
  if (!size) return null;
  let best = null;
  const notes = [];
  for (const cand of originalCandidates(url).slice(0, 6)) {
    const got = await fetchImage(cand, referer);
    if (got.skip) { notes.push(cand + ': ' + got.skip); continue; }
    const s = pixelSize(got.body);
    // The same size counts too: the untouched file, not the re-encoded copy (Next.js serves q=75).
    if (!s || (best ? s.w <= best.size.w : s.w < size.w)) continue;
    if (Math.abs(s.w / s.h - size.w / size.h) > 0.02 * (size.w / size.h)) { notes.push(cand + ': a different framing'); continue; }
    const d = await difference(b, served, got);
    if (d >= 14) { notes.push(cand + ': a different picture'); continue; }
    best = { url: cand, body: got.body, type: got.type, size: s };
  }
  return { best, notes };
}

const slug = (u) => {
  try {
    const x = new URL(u);
    return (x.hostname.replace(/^www\./, '') + x.pathname).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 60) || 'page';
  } catch { return 'page'; }
};
const extOf = (type) => (type.split('/')[1] || 'jpg').replace('jpeg', 'jpg').replace('svg+xml', 'svg').split(';')[0];

async function open(b, url, width, height) {
  if (!(await allowed(url))) throw new Error('robots.txt disallows ' + url + '; use another source');
  const page = await b.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width, height, deviceScaleFactor: 2 });
  const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const status = res ? res.status() : 0;
  if (status === 401 || status === 403 || status === 429 || (res && res.headers()['cf-mitigated'])) throw new Error(url + ' answered ' + status + ' (blocked); use another source, never a way around it');
  await new Promise((r) => setTimeout(r, 2500));
  // Scroll through once so lazy images load, then back to the top.
  await page.evaluate(async () => {
    for (let y = 0; y < Math.min(document.body.scrollHeight, 12000); y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); }
    window.scrollTo(0, 0);
  });
  await new Promise((r) => setTimeout(r, 1000));
  // Cookie banners and chat bubbles are debris in a screenshot.
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('[id*="cookie" i],[class*="cookie" i],[id*="consent" i],[class*="consent" i],[id*="intercom" i],[class*="intercom" i],iframe[title*="chat" i]')) {
      const s = getComputedStyle(el);
      if (s.position === 'fixed' || s.position === 'sticky') el.remove();
    }
  });
  return page;
}

// The page's og:image, its large images and any image files it links to (a press kit's downloads), largest first.
async function pageImages(page) {
  return page.evaluate(() => {
    const abs = (u) => { try { return new URL(u, location.href).href; } catch { return null; } };
    const meta = (sel) => document.querySelector(sel)?.getAttribute('content');
    const near = (el) => {
      for (let n = el, i = 0; n && i < 6; n = n.parentElement, i++) {
        const h = n.querySelector?.('h1,h2,h3');
        if (h && h.textContent.trim()) return h.textContent.trim().slice(0, 120);
      }
      return '';
    };
    // The largest file the page offers (its srcset and <picture> sources), not the one this layout picked.
    const largest = (i) => {
      const pic = i.closest('picture');
      const sources = pic ? [...pic.querySelectorAll('source')].filter((s) => !s.type || /webp|jpe?g|png|avif/.test(s.type)) : [];
      const sets = [i.getAttribute('srcset'), ...sources.map((s) => s.getAttribute('srcset'))].filter(Boolean);
      let best = null;
      for (const set of sets) {
        for (const part of set.split(/,\s+(?=\S)/)) {
          const [u, d] = part.trim().split(/\s+/);
          const n = d ? parseFloat(d) * (d.endsWith('x') ? 10000 : 1) : 1;
          if (u && (!best || n > best.n)) best = { u, n };
        }
      }
      return best ? abs(best.u) : abs(i.currentSrc);
    };
    const imgs = [...document.images]
      .filter((i) => i.currentSrc && Math.max(i.naturalWidth, i.naturalHeight) >= 300)
      .map((i) => ({ kind: 'img', url: largest(i), alt: i.alt || '', near: near(i), shown: Math.round(i.getBoundingClientRect().width) }));
    const links = [...document.querySelectorAll('a[href]')]
      .filter((a) => /\.(?:png|jpe?g|webp)(?:[?#]|$)/i.test(a.getAttribute('href')))
      .map((a) => ({ kind: 'download', url: abs(a.getAttribute('href')), alt: (a.textContent || '').trim().slice(0, 80), near: near(a), shown: 0 }));
    const og = [meta('meta[property="og:image"]'), meta('meta[name="twitter:image"]')].filter(Boolean).map((u) => ({ kind: 'og', url: abs(u), alt: document.title, near: '' }));
    return { title: document.title, items: [...og, ...links, ...imgs] };
  });
}

// Save a page's images, each at its original file when one verifies. tier: 'press' for a press kit, else by file.
async function grabImages(b, page, url, out, tier, limit) {
  const found = await pageImages(page);
  const seen = new Set();
  const items = found.items.filter((x) => x.url && !x.url.startsWith('data:') && !seen.has(x.url) && seen.add(x.url))
    .sort((a, b) => (b.kind === 'og') - (a.kind === 'og') || (b.kind === 'download') - (a.kind === 'download') || (b.shown || 0) - (a.shown || 0)).slice(0, limit);
  let n = 0;
  for (const x of items) {
    const served = await fetchImage(x.url, url);
    if (served.skip) { console.log('skipped'.padEnd(12), x.url.slice(0, 90) + ': ' + served.skip); continue; }
    if (served.body.length < 4000) continue;
    const orig = /svg/.test(served.type) ? null : await resolveOriginal(b, served, x.url, url);
    const got = orig && orig.best ? orig.best : { url: x.url, body: served.body, type: served.type, size: pixelSize(served.body) };
    const size = got.size;
    if (size && Math.max(size.w, size.h) < 400) continue;
    const file = join(out, (x.kind === 'og' ? 'og' : 'img-' + String(++n).padStart(2, '0')) + '.' + extOf(got.type));
    writeFileSync(file, got.body);
    const servedSize = pixelSize(served.body);
    const t = tier || (orig && orig.best ? 'original' : 'site');
    // width and height are the file's own pixels; served_* is what the page showed, when an original replaced it.
    record(out, { file: basename(file), kind: x.kind, tier: t, url: got.url, page: url, alt: x.alt, near: x.near, ...(size ? { width: size.w, height: size.h } : {}), ...(got.url !== x.url ? { served_url: x.url, served_width: servedSize ? servedSize.w : undefined } : {}) });
    const up = got.url !== x.url && servedSize ? ' (original; the page served ' + servedSize.w + 'x' + servedSize.h + ')' : '';
    console.log(basename(file).padEnd(12), (t + ' ').padEnd(9), sharp(size).padEnd(44), (x.alt || x.near || '').slice(0, 60) + up);
  }
  return found.title;
}

async function pageCmd(url) {
  const out = resolve(flag('out', 'public/research/' + slug(url)));
  mkdirSync(out, { recursive: true });
  const b = await browser();
  try {
    const page = await open(b, url, 1440, 900);
    const title = await grabImages(b, page, url, out, null, 14);
    await page.screenshot({ path: join(out, 'fold.png') });
    record(out, { file: 'fold.png', kind: 'screenshot', tier: 'capture', url, page: url, scale: 2, width: 2880, height: 1800, alt: 'first screen of ' + title });
    const h = await page.evaluate(() => Math.min(document.body.scrollHeight, 8000));
    await page.setViewport({ width: 1440, height: h, deviceScaleFactor: 1 });
    await new Promise((r) => setTimeout(r, 800));
    await page.screenshot({ path: join(out, 'full.png') });
    record(out, { file: 'full.png', kind: 'screenshot', tier: 'capture', url, page: url, scale: 1, width: 1440, height: h, alt: 'full page of ' + title });
    console.log('fold.png'.padEnd(12), 'capture  ' + sharp({ w: 2880, h: 1800 }));
    console.log('full.png'.padEnd(12), 'capture  1440x' + h + ' at 1x: for finding things only, never for a slide.');
    console.log('saved in ' + out + ' with sources.json. Look at each file before you use it.');
  } finally { await b.close(); }
}

// A press or media kit linked from the site: its pages' images and downloads, saved as tier press.
const PRESS = /\b(?:press|media|newsroom|brand(?:[- ]?(?:assets|kit|guidelines|resources))?|media[- ]?kit|logos?)\b/i;
async function pressCmd(site) {
  const home = /^https?:/.test(site) ? site : 'https://' + site;
  const b = await browser();
  try {
    const page = await open(b, home, 1440, 900);
    const origin = new URL(page.url()).origin;
    const links = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => ({ href: a.href, text: (a.textContent || '').trim().slice(0, 60) })));
    const press = [...new Map(links
      .filter((l) => { try { const u = new URL(l.href); return u.origin === origin && (PRESS.test(u.pathname.replace(/[/_-]/g, ' ')) || PRESS.test(l.text)); } catch { return false; } })
      .map((l) => [l.href.split('#')[0], l])).values()].slice(0, 3);
    if (!press.length) { console.log('No press, media or brand kit page is linked from ' + home + '. Go on to page <url> for the product pages.'); return; }
    for (const l of press) {
      const out = resolve('public/research/press-' + slug(l.href));
      mkdirSync(out, { recursive: true });
      console.log('== ' + l.href + (l.text ? ' (' + l.text + ')' : ''));
      try {
        const p = await open(b, l.href, 1440, 900);
        await grabImages(b, p, l.href, out, 'press', 20);
        await p.close();
      } catch (e) { console.log('skipped: ' + (e && e.message ? e.message : e)); }
    }
  } finally { await b.close(); }
}

// One image URL, resolved to its original file.
async function originalCmd(url) {
  const out = resolve(flag('out', 'public/research/' + slug(url).split('-').slice(0, 2).join('-')));
  const page = flag('page', undefined);
  mkdirSync(out, { recursive: true });
  const b = await browser();
  try {
    const served = await fetchImage(url, page);
    if (served.skip) throw new Error(url + ': ' + served.skip);
    const orig = await resolveOriginal(b, served, url, page);
    const got = orig && orig.best ? orig.best : { url, body: served.body, type: served.type, size: pixelSize(served.body) };
    const name = flag('name', basename(new URL(got.url).pathname).replace(/\.[a-z0-9]+$/i, '').replace(/[^a-z0-9-]+/gi, '-').slice(0, 50) || 'image');
    const file = join(out, name + '.' + extOf(got.type));
    writeFileSync(file, got.body);
    const s0 = pixelSize(served.body);
    record(out, { file: basename(file), kind: 'img', tier: orig && orig.best ? 'original' : 'site', url: got.url, page, ...(got.size ? { width: got.size.w, height: got.size.h } : {}), ...(got.url !== url ? { served_url: url, served_width: s0 ? s0.w : undefined } : {}) });
    console.log('saved ' + file + ' (' + (orig && orig.best ? 'original' : 'site') + ', ' + sharp(got.size) + (got.url !== url && s0 ? '; the link served ' + s0.w + 'x' + s0.h : '') + ')');
    for (const n of (orig && orig.notes) || []) console.log('  not used: ' + n);
  } finally { await b.close(); }
}

// A workspace's own file (an upload, a brand book asset) recorded as tier workspace, with where it came from.
function adoptCmd(file) {
  const path = resolve(file);
  const from = flag('from', 'the workspace brand book');
  const size = pixelSize(readFileSync(path));
  record(dirname(path), { file: basename(path), kind: 'img', tier: 'workspace', url: String(from), ...(size ? { width: size.w, height: size.h } : {}) });
  console.log('recorded ' + path + ' (workspace, ' + sharp(size) + ')');
}

async function shotCmd(url) {
  const selector = flag('selector', null);
  const full = flag('full', false) === true;
  const width = Number(flag('width', 1440));
  const height = Number(flag('height', 900));
  const fit = Number(flag('fit', 0)) || 0;
  let scale = Math.min(4, Math.max(1, Number(flag('scale', 2)) || 2));
  const outFile = resolve(flag('out', 'public/research/' + slug(url) + '/' + (selector ? 'element' : full ? 'full' : 'fold') + '.png'));
  mkdirSync(dirname(outFile), { recursive: true });
  const b = await browser();
  let inner = null;
  try {
    const page = await open(b, url, width, height);
    if (selector) {
      const el = await page.waitForSelector(selector, { timeout: 15000 });
      // --fit: the element's width on the slide. A 2x screen needs twice that in pixels, so shoot at the scale that
      // gives it (re-rendered, not enlarged), up to 4x.
      const cssWidth = await el.evaluate((n) => n.getBoundingClientRect().width);
      if (fit && cssWidth) scale = Math.min(4, Math.max(scale, Math.ceil((fit * 2) / cssWidth)));
      if (scale !== 2) {
        await page.setViewport({ width, height, deviceScaleFactor: scale });
        await new Promise((r) => setTimeout(r, 800));
      }
      await el.evaluate((n) => n.scrollIntoView({ block: 'center' }));
      await new Promise((r) => setTimeout(r, 600));
      // A raster image inside the element has the pixels it has: a higher device scale enlarges it in the capture.
      // The capture is only as sharp as the element's largest raster image allows (its file's own pixels).
      inner = await el.evaluate(async (n, s, share) => {
        const box = n.getBoundingClientRect();
        let worst = null;
        for (const i of [n, ...n.querySelectorAll('img')].filter((x) => x.tagName === 'IMG')) {
          const r = i.getBoundingClientRect();
          const src = i.currentSrc || i.src;
          if (!src || /\.svg(?:[?#]|$)|^data:image\/svg/i.test(src) || r.width * r.height < 0.25 * box.width * box.height) continue;
          const nw = await new Promise((ok) => { const x = new Image(); x.onload = () => ok(x.naturalWidth); x.onerror = () => ok(0); x.src = src; });
          const density = nw / r.width;
          if (nw && density < s && (!worst || density < worst.density)) worst = { src: src.split('/').pop().split('?')[0].slice(0, 60), url: src, nw, density, sharpWidth: Math.floor(density * box.width * share) };
        }
        return worst;
      }, scale, SHARP_SHARE);
      await el.screenshot({ path: outFile });
    } else {
      if (scale !== 2) await page.setViewport({ width, height, deviceScaleFactor: scale });
      await page.screenshot({ path: outFile, fullPage: full });
    }
    const size = pixelSize(readFileSync(outFile));
    record(dirname(outFile), { file: basename(outFile), kind: 'screenshot', tier: 'capture', url, page: url, selector: selector || undefined, scale, ...(size ? { width: size.w, height: size.h } : {}), ...(inner ? { sharp_width: inner.sharpWidth } : {}) });
    const short = fit && size && size.w * SHARP_SHARE < fit;
    if (inner) console.log('saved ' + outFile + ' (' + (size ? size.w + 'x' + size.h + ' px' : '') + ', but its image ' + inner.src + ' has only ' + inner.nw + ' px across, so this capture is sharp up to ' + inner.sharpWidth + ' wide on a slide. That image is a file: get it whole with original ' + inner.url + ', or show this no wider.)');
    else console.log('saved ' + outFile + ' (capture, ' + sharp(size) + ')' + (short ? '. The page draws this element too small for ' + fit + ' wide even at 4x: show it smaller, or find a bigger source.' : ''));
  } finally { await b.close(); }
}

async function cropCmd(src, x, y, w, h) {
  const input = resolve(src);
  const outFile = resolve(flag('out', join(dirname(input), basename(input, extname(input)) + '-crop.png')));
  const b = await browser();
  try {
    const page = await b.newPage();
    const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.avif': 'image/avif' }[extname(input).toLowerCase()] || 'image/png';
    const data = 'data:' + mime + ';base64,' + readFileSync(input).toString('base64');
    await page.setContent('<html><body style="margin:0"><img id="i" style="display:block"></body></html>');
    const size = await page.evaluate((d) => new Promise((ok, no) => { const i = document.getElementById('i'); i.onload = () => ok({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => no(new Error('unreadable image')); i.src = d; }), data);
    const px = (v, whole) => { const n = Number(v); return n <= 1 ? Math.round(n * whole) : Math.round(n); };
    const clip = { x: px(x, size.w), y: px(y, size.h), width: px(w, size.w), height: px(h, size.h) };
    clip.width = Math.min(clip.width, size.w - clip.x);
    clip.height = Math.min(clip.height, size.h - clip.y);
    if (clip.width < 8 || clip.height < 8) throw new Error('the crop is empty: the image is ' + size.w + 'x' + size.h);
    await page.setViewport({ width: size.w, height: size.h, deviceScaleFactor: 1 });
    await page.screenshot({ path: outFile, clip, type: /\.jpe?g$/i.test(outFile) ? 'jpeg' : 'png', ...(/\.jpe?g$/i.test(outFile) ? { quality: 90 } : {}) });
    let from = {};
    try { from = JSON.parse(readFileSync(join(dirname(input), 'sources.json'), 'utf8')).find((e) => e.file === basename(input)) || {}; } catch {}
    record(dirname(outFile), { file: basename(outFile), kind: 'crop', tier: from.tier || 'crop', crop_of: basename(input), box: clip, width: clip.width, height: clip.height, url: from.url, page: from.page });
    console.log('saved ' + outFile + ' (' + sharp({ w: clip.width, h: clip.height }) + '; cut from ' + size.w + 'x' + size.h + ')');
    // A crop keeps the pixels it had: from a 1x full-page screenshot, or a small cut, it can only be shown small.
    if (from.scale === 1) console.log('This crop is from a 1x screenshot. To show it wider than ' + Math.floor(clip.width * SHARP_SHARE) + ', get the original file, or shoot the element: shot ' + (from.page || '<url>') + ' --selector "<css>" --fit <width on the slide>.');
  } finally { await b.close(); }
}

async function main() {
  const [cmd, ...rest] = argv;
  try {
    if (cmd === 'page' && rest[0]) await pageCmd(rest[0]);
    else if (cmd === 'press' && rest[0]) await pressCmd(rest[0]);
    else if (cmd === 'original' && rest[0]) await originalCmd(rest[0]);
    else if (cmd === 'adopt' && rest[0]) adoptCmd(rest[0]);
    else if (cmd === 'shot' && rest[0]) await shotCmd(rest[0]);
    else if (cmd === 'crop' && rest.length >= 5) await cropCmd(...rest.slice(0, 5));
    else {
      console.log('usage: asset-grab adopt <file> --from <source> | press <site> | page <url> | original <image-url> [--page <url>] | shot <url> --selector <css> --fit <width> | crop <image> <x> <y> <w> <h> [--out file]');
      process.exit(2);
    }
  } catch (e) {
    console.error('asset-grab: ' + (e && e.message ? e.message : e));
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
