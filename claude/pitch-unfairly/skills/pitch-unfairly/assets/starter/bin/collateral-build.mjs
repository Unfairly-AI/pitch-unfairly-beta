// Render a collateral set: a proof of every piece, its print file, and a check of each against
// its format and the brand.
//   npm run collateral:build                    every piece in collateral/collateral.json
//   npm run collateral:build -- --only poster-a,flyer
//   npm run collateral:build -- --proofs        proofs and checks only (fast layout review)
// Writes artifacts/collateral/proof/<id>.png, print/<id>.pdf (print: finished size plus bleed,
// fonts embedded) or print/<id>.png (merch: transparent, at the format's resolution),
// report.json and REPORT.md. Fails when any piece has a problem.
import puppeteer from 'puppeteer';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { refuseInCodexSandbox } from './browser-guard.mjs';
import { serveDir } from './serve.mjs';
import { brandCss, cssFamily, fontFaceCss, validateKit } from './brand-lib.mjs';
import { fontDir, fontsourceCss } from './site-build.mjs';
import { PX_IN, resolveFormat } from './collateral/registry.mjs';
import { allowedColors } from './collateral/rules.mjs';
import { setProblems } from './collateral/set.mjs';
import { decodePng, hairlineRows } from './collateral/seams.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const OUT = arg('--out') ?? 'artifacts/collateral';
const only = arg('--only')?.split(',');
const proofsOnly = args.includes('--proofs');
// Grain and other canvas textures are drawn at device resolution; very large prints cap the
// render resolution so a 11 × 7 ft unit stays a file a printer can open.
const MAX_DEVICE_PX = 2.2e8;

/** A piece's format, or a plain canvas for a mockup. */
export function formatOf(p) {
  if (p.mockup && p.canvas) return { kind: 'screen', layout: { w: p.canvas.w, h: p.canvas.h }, out: { ...p.canvas }, dpi: {} };
  return resolveFormat(p.format);
}

/** Write collateral/.engine/: the canvas contract, the checks, brand tokens and fonts, and the check config. */
export async function prepareEngine(root, set, kit) {
  const eng = join(root, 'collateral', '.engine');
  await rm(eng, { recursive: true, force: true });
  await mkdir(eng, { recursive: true });
  for (const f of ['canvas.js', 'check.js', 'rules.mjs']) await cp(join(here, 'collateral', f), join(eng, f));
  let fontCss = '';
  for (const pkg of new Set(['display', 'body', 'mono'].map((r) => kit.typography?.[r]).filter((t) => t?.source === 'fontsource').map((t) => t.package))) {
    if (!fontDir(root, pkg)) throw new Error(`Font package ${pkg} isn't installed. Run npm run brand:apply.`);
    const f = await fontsourceCss(root, pkg);
    fontCss += f.css;
    for (const file of f.files) await cp(join(f.dir, 'files', file), join(eng, 'fonts', f.name, file));
  }
  await writeFile(join(eng, 'brand.css'), `${fontCss}\n${brandCss(kit, fontFaceCss(kit, '../../brand/'))}`);
  const fonts = set.fonts ?? ['display', 'body', 'mono'].map((r) => kit.typography?.[r]).filter((t) => t?.family).map((t) => cssFamily(t));
  const pieces = {};
  for (const p of set.pieces) {
    const f = formatOf(p);
    pieces[p.id] = { format: p.format ?? 'mockup', kind: f.kind, variant: p.variant ?? null, logo_exempt: p.logo_exempt ?? null, mockup: !!p.mockup, dpi_min: f.dpi?.min ?? null };
  }
  await writeFile(join(eng, 'config.json'), JSON.stringify({ fonts, palette: [...allowedColors(kit, set.neutrals ?? [])], accents: set.accents ?? null, pieces }, null, 1));
  return eng;
}

async function main() {
  refuseInCodexSandbox('collateral:build');
  if (!existsSync('collateral/collateral.json')) throw new Error('No collateral/collateral.json. Start one with npm run collateral:new.');
  const set = JSON.parse(await readFile('collateral/collateral.json', 'utf8'));
  const problems = setProblems(set);
  if (problems.length) throw new Error(`collateral/collateral.json:\n${problems.map((p) => `  ✗ ${p}`).join('\n')}`);
  const kit = JSON.parse(await readFile('brand/brand.json', 'utf8'));
  const kitErrors = validateKit(kit);
  if (kitErrors.length) throw new Error(`brand/brand.json: ${kitErrors.join('; ')}`);
  await prepareEngine('.', set, kit);
  for (const d of ['proof', 'print']) await mkdir(join(OUT, d), { recursive: true });

  const server = await serveDir('.');
  const browser = await puppeteer.launch({ headless: true, args: ['--force-color-profile=srgb'] });
  const report = [];
  try {
    for (const p of set.pieces.filter((x) => !only || only.includes(x.id))) {
      const f = formatOf(p);
      const { w: W, h: H } = f.layout;
      const px = (n) => n * PX_IN;
      const q = new URLSearchParams({ piece: p.id, w: W, h: H, ...(p.params ?? {}) });
      if (f.kind !== 'screen') for (const [k, v] of Object.entries({ bleed: f.bleed, safeL: f.safe.l, safeR: f.safe.r, safeT: f.safe.t, safeB: f.safe.b })) q.set(k, px(v));
      else if (f.safe_px) for (const [k, v] of Object.entries({ safeL: f.safe_px.l, safeR: f.safe_px.r, safeT: f.safe_px.t, safeB: f.safe_px.b })) q.set(k, Math.round(v));
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      const open = async (dpr) => {
        await page.setViewport({ width: W, height: H, deviceScaleFactor: dpr });
        q.set('dpr', dpr);
        await page.goto(`${server.url}/collateral/${p.file}?${q}`, { waitUntil: 'load' });
        await page.waitForSelector('body[data-ready="1"]', { timeout: 180000 });
      };
      const merch = f.kind === 'merch';
      await open(f.kind === 'screen' ? 1 : Math.min(4, 2400 / Math.max(W, H)));
      const checks = await page.evaluate(() => window.__collateralCheck?.() ?? { problems: ['the piece never imported ../.engine/canvas.js'], warnings: [] });
      checks.problems.push(...errors.map((e) => `page error: ${e}`));
      const proof = join(OUT, 'proof', `${p.id}.png`);
      await page.screenshot({ path: proof, clip: { x: 0, y: 0, width: W, height: H }, omitBackground: merch });
      const row = { id: p.id, format: p.format ?? 'mockup', kind: f.kind, variant: p.variant ?? null, layout: f.layout, proof, ...checks };
      if (f.kind !== 'screen') Object.assign(row, { trim: f.trim, bleed_in: f.bleed, safe_in: f.safe, dpi: f.dpi });
      if (!proofsOnly && f.kind !== 'screen') {
        // Device px for the print file: the format's resolution, capped for very large units.
        const dpr = Math.min(f.out.w / W, Math.sqrt(MAX_DEVICE_PX / (W * H)));
        row.print_dpi = Math.round(dpr * PX_IN);
        await open(dpr);
        if (merch) {
          row.print = join(OUT, 'print', `${p.id}.png`);
          await page.screenshot({ path: row.print, clip: { x: 0, y: 0, width: W, height: H }, omitBackground: true });
          // Transparent merch art shows any half-painted join (two clipped boxes meeting mid-pixel) as a
          // line through the ink: fail the piece instead of cleaning the file up afterwards.
          const seams = hairlineRows(decodePng(await readFile(row.print)));
          if (seams.length) row.problems.push(`print file has ${seams.length} hairline seam row(s) at y ${seams.slice(0, 8).join(', ')}: draw sliced type on one canvas per stack, clipped to whole device pixels`);
        } else {
          row.print = join(OUT, 'print', `${p.id}.pdf`);
          await page.pdf({ path: row.print, width: `${f.trim.w + 2 * f.bleed}in`, height: `${f.trim.h + 2 * f.bleed}in`, printBackground: true, pageRanges: '1', scale: 96 / PX_IN });
        }
      }
      report.push(row);
      const mark = row.problems.length ? '✗' : '✓';
      console.log(`${mark} ${p.id} (${p.format ?? 'mockup'})${row.problems.map((x) => `\n    ✗ ${x}`).join('')}${row.warnings.map((x) => `\n    ! ${x}`).join('')}`);
      await page.close();
    }
  } finally {
    await browser.close();
    await server.close();
  }
  await writeFile(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  await writeFile(join(OUT, 'REPORT.md'), reportMd(report));
  const failed = report.filter((r) => r.problems.length);
  console.log(`\n${report.length - failed.length}/${report.length} pieces pass. Look at every proof in ${OUT}/proof before handing anything over.`);
  if (failed.length) process.exit(1);
}

export function reportMd(report) {
  const size = (r) => (r.trim ? `${r.trim.w} × ${r.trim.h} in${r.bleed_in ? ` + ${r.bleed_in} bleed` : ''}` : `${r.layout.w} × ${r.layout.h} px`);
  const lines = ['# Collateral report', '', '| Piece | Format | Size | Result |', '|---|---|---|---|'];
  for (const r of report) lines.push(`| ${r.id} | ${r.format} | ${size(r)} | ${r.problems.length ? `✗ ${r.problems.length} problem(s)` : '✓'}${r.warnings.length ? `, ${r.warnings.length} warning(s)` : ''} |`);
  for (const r of report.filter((x) => x.problems.length || x.warnings.length)) {
    lines.push('', `## ${r.id}`, ...r.problems.map((x) => `- ✗ ${x}`), ...r.warnings.map((x) => `- ! ${x}`));
  }
  return `${lines.join('\n')}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
}
