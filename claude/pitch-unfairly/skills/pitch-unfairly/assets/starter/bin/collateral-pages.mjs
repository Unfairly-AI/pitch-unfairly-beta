// Turn a built collateral set into one hosted page per link: the proof to look at, the print
// file to download, in the brand's own colors and type.
//
//   npm run collateral:pages                 every link in collateral.json pages.links
//   npm run collateral:pages -- --only <slug>
//
// Reads collateral/collateral.json, brand/brand.json and artifacts/collateral/{proof,print}
// (run npm run collateral:build first; a --proofs build has no print files). Writes
// artifacts/collateral/pages/<slug>/ (index.html, logo, files/) and pages.json: each link's type,
// title and file list with sizes and hashes, which collateral:publish turns into deck_upload_start.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { groundFor, planPages, titleOfHtml } from './collateral/pages.mjs';
import { resolveFormat } from './collateral/registry.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const SET = opt('--set', 'collateral/collateral.json');
const ART = opt('--artifacts', 'artifacts/collateral');
const BRAND = opt('--brand', 'brand/brand.json');
const OUT = opt('--out', join(ART, 'pages'));
const ONLY = opt('--only', null);
const VIEW_MAX = 2400; // px on the long side of a view image; the download keeps full size

const fail = (msg) => { console.error(`✗ ${msg}`); process.exit(1); };
const set = JSON.parse(await readFile(SET, 'utf8'));
const kit = JSON.parse(await readFile(BRAND, 'utf8'));
const setDir = dirname(SET);
const titles = new Map();
for (const p of set.pieces ?? []) titles.set(p.id, titleOfHtml(await readFile(join(setDir, p.file), 'utf8').catch(() => '')));

const { links: all, problems } = planPages(set, { formatOf: (id) => (id ? resolveFormat(id) : null), titleOf: (id) => titles.get(id) });
if (problems.length) fail(`The set's pages don't hold together:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
const links = ONLY ? all.filter((l) => l.slug === ONLY) : all;
if (!links.length) fail(`No link ${ONLY}.`);

const missing = links.flatMap((l) => l.items.flatMap((it) => [it.proof, it.source].filter(Boolean))).filter((f) => !existsSync(join(ART, f)));
if (missing.length) fail(`Missing build output (run npm run collateral:build, without --proofs):\n${[...new Set(missing)].map((f) => `  ${join(ART, f)}`).join('\n')}`);

// Merch print art must be clean before it's hosted: the engine's seam check, when this engine has it.
const seamsPath = new URL('./collateral/seams.mjs', import.meta.url);
if (existsSync(seamsPath)) {
  const { decodePng, hairlineRows } = await import(seamsPath.href);
  if (typeof decodePng !== 'function' || typeof hairlineRows !== 'function') fail('bin/collateral/seams.mjs no longer exports decodePng and hairlineRows; update collateral-pages.mjs with it.');
  for (const it of links.flatMap((l) => l.items).filter((i) => i.role === 'merch')) {
    const rows = hairlineRows(decodePng(await readFile(join(ART, it.source))));
    if (rows.length) fail(`${it.source} has ${rows.length} hairline seam row(s); fix the piece and rebuild (never clean the output up afterwards).`);
  }
  console.log('✓ merch print art: no hairline seams');
} else {
  console.log('! this engine has no seam check (bin/collateral/seams.mjs): zoom into every merch PNG at 100% for hairlines across sliced type');
}

const logoRel = kit.identity?.logos?.primary ?? kit.identity?.lockups?.find((l) => l.background === 'light')?.path;
const logoSrc = logoRel ? resolve(dirname(BRAND), logoRel) : null;
if (!logoSrc || !existsSync(logoSrc)) fail(`brand.json identity.logos.primary (${logoRel}) isn't a file next to ${BRAND}.`);
const pal = kit.palette ?? {};
const font = (r) => { const t = kit.typography?.[r] ?? {}; return `"${t.family ?? 'system-ui'}", ${t.fallback === 'serif' ? 'Georgia, serif' : 'Helvetica, Arial, sans-serif'}`; };
const css = `:root{--accent:${pal.accent ?? '#000'};--ink:${pal.ink ?? '#000'};--muted:${pal.ink_muted ?? pal.ink ?? '#444'};--paper:${pal.paper ?? '#fff'};--on-accent:${pal.on_accent ?? '#000'};font-family:${font('body')}}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink)}
header{padding:22px clamp(16px,5vw,56px);border-bottom:1px solid color-mix(in srgb,var(--ink) 8%,transparent)}.logo{height:30px;display:block}
main{max-width:1180px;margin:0 auto;padding:40px clamp(16px,5vw,56px) 72px}
.eyebrow{display:flex;align-items:center;gap:12px;margin:0 0 14px;font-size:12px;letter-spacing:.25em;text-transform:uppercase;color:var(--muted)}.eyebrow i{width:40px;height:1px;background:var(--accent)}
h1{margin:0;font-family:${font('display')};font-size:clamp(34px,5vw,60px);font-weight:${kit.typography?.display?.weight ?? 700};letter-spacing:-.02em;line-height:1.02}
.spec{margin:12px 0 32px;font-size:18px;color:var(--muted)}
.proofs{display:grid;gap:20px;align-items:start;background:color-mix(in srgb,var(--ink) 5%,var(--paper));padding:clamp(14px,3vw,36px)}.proofs.n2{grid-template-columns:1fr 1fr}
.proofs figure{margin:0;display:flex;justify-content:center}.proofs img{display:block;max-width:100%;max-height:78vh;box-shadow:0 10px 30px rgb(0 0 0/.14)}
.proofs figure.art img{box-shadow:none}.proofs.n2 figure img{max-height:70vh}
.note{margin:32px 0 22px;max-width:640px;padding:12px 20px;border-left:2px solid var(--accent);border-right:2px solid var(--accent)}.note p{margin:0;font-size:17px;line-height:1.45}
.dls{display:flex;flex-wrap:wrap;gap:12px}.dl{display:inline-flex;align-items:center;gap:12px;padding:13px 20px;background:var(--accent);color:var(--on-accent);font-weight:700;font-size:15px;text-decoration:none;border-radius:4px}.dl span{font-weight:400;font-size:13px}
@media(max-width:640px){.proofs.n2{grid-template-columns:1fr}}`;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const mb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

const { default: puppeteer } = await import('puppeteer');
const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();

/** Reads an image in the browser: its size and the mean luminance of its opaque pixels. */
async function inspect(file) {
  await page.goto(pathToFileURL(resolve(file)).href);
  return page.evaluate(async () => {
    const img = document.querySelector('img');
    await img.decode();
    const w = 200, h = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * 200));
    const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data;
    let sum = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) { sum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255; n++; }
    return { w: img.naturalWidth, h: img.naturalHeight, lum: n ? sum / n : 0 };
  });
}

/** A JPEG (or transparent PNG) view of a proof, at most VIEW_MAX on its long side. */
async function writeView(src, dest, { png = false } = {}) {
  const { w, h } = await inspect(src);
  const k = Math.min(1, VIEW_MAX / Math.max(w, h));
  const vw = Math.round(w * k), vh = Math.round(h * k);
  await page.setViewport({ width: vw, height: vh, deviceScaleFactor: 1 });
  // Still on the image's own file:// document (inspect loaded it): restyle it rather than load it again.
  await page.evaluate((vw, vh) => {
    document.documentElement.style.background = 'transparent';
    Object.assign(document.body.style, { margin: '0', background: 'transparent', display: 'block' });
    const img = document.querySelector('img');
    img.removeAttribute('style');
    Object.assign(img.style, { display: 'block', width: `${vw}px`, height: `${vh}px`, margin: '0', position: 'absolute', left: '0', top: '0' });
  }, vw, vh);
  await page.screenshot({ path: dest, type: png ? 'png' : 'jpeg', ...(png ? { omitBackground: true } : { quality: 86 }), clip: { x: 0, y: 0, width: vw, height: vh } });
}

async function* walk(folder) {
  for (const e of await readdir(folder, { withFileTypes: true })) {
    const full = join(folder, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (e.isFile() && !e.name.startsWith('.')) yield full;
  }
}

const out = [];
try {
  for (const l of links) {
    const dir = join(OUT, l.slug);
    await rm(dir, { recursive: true, force: true });
    await mkdir(join(dir, 'files'), { recursive: true });
    const logo = `logo${extname(logoSrc)}`;
    await copyFile(logoSrc, join(dir, logo));
    const figs = [];
    const dls = [];
    for (const it of l.items) {
      if (it.role === 'merch') {
        // Art shows on its garment: white ink vanishes on a light page.
        const ground = it.ground ?? groundFor((await inspect(join(ART, it.proof))).lum);
        await writeView(join(ART, it.proof), join(dir, it.view), { png: true });
        figs.push(`<figure class="art"><img src="${it.view}" alt="${esc(it.alt)}" style="background:${ground}"></figure>`);
      } else {
        await writeView(join(ART, it.proof), join(dir, it.view));
        figs.push(`<figure><img src="${it.view}" alt="${esc(it.alt)}"></figure>`);
      }
      if (it.download) {
        await copyFile(join(ART, it.source), join(dir, it.download));
        dls.push(`<a class="dl" href="${it.download}" download>${esc(it.label)}<span>${mb((await stat(join(dir, it.download))).size)}</span></a>`);
      }
    }
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(l.title)} · ${esc(kit.identity?.name ?? '')}</title><style>${css}</style></head>
<body><header><img class="logo" src="${logo}" alt="${esc(kit.identity?.name ?? '')}"></header>
<main><p class="eyebrow"><i></i>${esc(l.eyebrow)}</p><h1>${esc(l.title)}</h1><p class="spec">${esc(l.spec)}</p>
<div class="proofs n${figs.length}">${figs.join('')}</div>
${l.caption ? `<div class="note"><p>${esc(l.caption)}</p></div>` : ''}<div class="dls">${dls.join('')}</div></main></body></html>\n`;
    await writeFile(join(dir, 'index.html'), html);
    const files = [];
    for await (const f of walk(dir)) {
      const bytes = await readFile(f);
      files.push({ path: relative(dir, f).split(sep).join('/'), size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
    files.sort((a, b) => a.path.localeCompare(b.path));
    const digest = createHash('sha256').update(files.map((f) => `${f.path}:${f.sha256}`).join('\n')).digest('hex');
    out.push({ slug: l.slug, type: l.type, title: l.page_title, eyebrow: l.eyebrow, spec: l.spec, dir: relative('.', dir).split(sep).join('/'), digest, files });
    const total = files.reduce((s, f) => s + f.size, 0);
    console.log(`✓ ${l.slug}  ${l.type}  "${l.page_title}"  ${files.length} files, ${mb(total)}`);
  }
} finally {
  await browser.close();
}
// --only refreshes one entry and keeps the rest.
const prev = ONLY ? JSON.parse(await readFile(join(OUT, 'pages.json'), 'utf8').catch(() => '[]')) : [];
const merged = [...prev.filter((p) => !out.some((o) => o.slug === p.slug)), ...out];
const order = all.map((l) => l.slug);
merged.sort((a, b) => order.indexOf(a.slug) - order.indexOf(b.slug));
await writeFile(join(OUT, 'pages.json'), `${JSON.stringify(merged, null, 1)}\n`);
console.log(`\n${out.length} page${out.length === 1 ? '' : 's'} in ${OUT}. Open each index.html and look at it at desktop and phone width before publishing: npm run collateral:publish -- plan`);
