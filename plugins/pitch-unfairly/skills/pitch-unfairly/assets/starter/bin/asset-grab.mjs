// asset-grab: find, capture and crop a brand's real visuals for a slide (workflow step 3b). Run it from the deck
// folder (npm run asset:grab -- ...); it uses the deck's own headless browser. Every file it saves is recorded with
// its source in <out>/sources.json. The cloud build ships the same file as inputs/tools/asset-grab.mjs.
//   node asset-grab.mjs page <url> [--out public/research]      og:image, the page's large images, a fold and full-page screenshot
//   node asset-grab.mjs shot <url> [--selector css] [--full] [--width 1440] [--height 900] [--out public/research/x.png]
//   node asset-grab.mjs crop <image> <x> <y> <w> <h> [--out file.png]   x y w h as fractions (0-1) or pixels; 2x output
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

const slug = (u) => {
  try {
    const x = new URL(u);
    return (x.hostname.replace(/^www\./, '') + x.pathname).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 60) || 'page';
  } catch { return 'page'; }
};

async function open(b, url, width, height) {
  const page = await b.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width, height, deviceScaleFactor: 2 });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
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

async function pageCmd(url) {
  const out = resolve(flag('out', 'public/research/' + slug(url)));
  mkdirSync(out, { recursive: true });
  const b = await browser();
  try {
    const page = await open(b, url, 1440, 900);
    const found = await page.evaluate(() => {
      const abs = (u) => { try { return new URL(u, location.href).href; } catch { return null; } };
      const meta = (sel) => document.querySelector(sel)?.getAttribute('content');
      const near = (el) => {
        for (let n = el, i = 0; n && i < 6; n = n.parentElement, i++) {
          const h = n.querySelector?.('h1,h2,h3');
          if (h && h.textContent.trim()) return h.textContent.trim().slice(0, 120);
        }
        return '';
      };
      const imgs = [...document.images]
        .filter((i) => i.currentSrc && Math.max(i.naturalWidth, i.naturalHeight) >= 400)
        .map((i) => ({ kind: 'img', url: abs(i.currentSrc), alt: i.alt || '', width: i.naturalWidth, height: i.naturalHeight, near: near(i), shown: Math.round(i.getBoundingClientRect().width) }));
      const og = [meta('meta[property="og:image"]'), meta('meta[name="twitter:image"]')].filter(Boolean).map((u) => ({ kind: 'og', url: abs(u), alt: document.title, near: '' }));
      return { title: document.title, items: [...og, ...imgs] };
    });
    const seen = new Set();
    const items = found.items.filter((x) => x.url && !x.url.startsWith('data:') && !seen.has(x.url) && seen.add(x.url))
      .sort((a, b) => (b.kind === 'og') - (a.kind === 'og') || (b.width * b.height || 0) - (a.width * a.height || 0)).slice(0, 14);
    let n = 0;
    for (const x of items) {
      const res = await fetch(x.url, { headers: { 'user-agent': UA, referer: url } }).catch(() => null);
      const type = res?.ok ? res.headers.get('content-type') || '' : '';
      if (!/^image\//.test(type)) continue;
      const body = Buffer.from(await res.arrayBuffer());
      if (body.length < 4000) continue;
      const ext = (type.split('/')[1] || 'jpg').replace('jpeg', 'jpg').replace('svg+xml', 'svg').split(';')[0];
      const file = join(out, (x.kind === 'og' ? 'og' : 'img-' + String(++n).padStart(2, '0')) + '.' + ext);
      writeFileSync(file, body);
      record(out, { file: basename(file), kind: x.kind, url: x.url, page: url, alt: x.alt, near: x.near, width: x.width, height: x.height });
      console.log(basename(file).padEnd(12), (x.width ? x.width + 'x' + x.height : '').padEnd(11), (x.alt || x.near || '').slice(0, 80));
    }
    await page.screenshot({ path: join(out, 'fold.png') });
    record(out, { file: 'fold.png', kind: 'screenshot', url, page: url, alt: 'first screen of ' + found.title });
    const h = await page.evaluate(() => Math.min(document.body.scrollHeight, 8000));
    await page.setViewport({ width: 1440, height: h, deviceScaleFactor: 1 });
    await new Promise((r) => setTimeout(r, 800));
    await page.screenshot({ path: join(out, 'full.png') });
    record(out, { file: 'full.png', kind: 'screenshot', url, page: url, alt: 'full page of ' + found.title });
    console.log('fold.png, full.png (1440 wide, ' + h + 'px)\nsaved in ' + out + ' with sources.json. Look at each file before you use it.');
  } finally { await b.close(); }
}

async function shotCmd(url) {
  const selector = flag('selector', null);
  const full = flag('full', false) === true;
  const width = Number(flag('width', 1440));
  const height = Number(flag('height', 900));
  const outFile = resolve(flag('out', 'public/research/' + slug(url) + '/' + (selector ? 'element' : full ? 'full' : 'fold') + '.png'));
  mkdirSync(dirname(outFile), { recursive: true });
  const b = await browser();
  try {
    const page = await open(b, url, width, height);
    if (selector) {
      const el = await page.waitForSelector(selector, { timeout: 15000 });
      await el.evaluate((n) => n.scrollIntoView({ block: 'center' }));
      await new Promise((r) => setTimeout(r, 600));
      await el.screenshot({ path: outFile });
    } else {
      await page.screenshot({ path: outFile, fullPage: full });
    }
    record(dirname(outFile), { file: basename(outFile), kind: 'screenshot', url, page: url, selector: selector || undefined });
    console.log('saved ' + outFile);
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
    record(dirname(outFile), { file: basename(outFile), kind: 'crop', crop_of: basename(input), box: clip, url: from.url, page: from.page });
    console.log('saved ' + outFile + ' (' + clip.width + 'x' + clip.height + ' from ' + size.w + 'x' + size.h + ')');
  } finally { await b.close(); }
}

const [cmd, ...rest] = argv;
try {
  if (cmd === 'page' && rest[0]) await pageCmd(rest[0]);
  else if (cmd === 'shot' && rest[0]) await shotCmd(rest[0]);
  else if (cmd === 'crop' && rest.length >= 5) await cropCmd(...rest.slice(0, 5));
  else {
    console.log('usage: asset-grab page <url> | shot <url> [--selector css] [--full] | crop <image> <x> <y> <w> <h> [--out file]');
    process.exit(2);
  }
} catch (e) {
  console.error('asset-grab: ' + (e && e.message ? e.message : e));
  process.exit(1);
}
