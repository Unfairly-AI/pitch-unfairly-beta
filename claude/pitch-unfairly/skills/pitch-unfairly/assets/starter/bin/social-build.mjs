// Render a campaign to every selected format and check each file against its platform spec.
//   npm run social:build                      every format campaign.json selects
//   npm run social:build -- --platform linkedin,instagram.feed.portrait
//   npm run social:build -- --only A--linkedin.ad.single_image.square
//   npm run social:build -- --stills          images only (no video encoding): fast layout review
//   --jobs 4  pages rendered in parallel      --fps 30   video frame rate
// Writes artifacts/social/<platform>/<format>/<asset>.(png|jpg|mp4|gif|pdf), report.json,
// REPORT.md and one contact sheet per platform in artifacts/social/sheets/.
// Video needs ffmpeg on the PATH; without it, video formats get their poster image and a note.
import puppeteer from 'puppeteer';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { refuseInCodexSandbox } from './browser-guard.mjs';
import { serveDir } from './serve.mjs';
import { buildPage } from './social/page.mjs';
import { campaignProblems, copyProblems } from './social/campaign.mjs';
import { checkFile, fileFacts, maxKb } from './social/validate.mjs';
import { loadRegistry } from './social/registry.mjs';

const args = process.argv.slice(2);
const arg = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const OUT = arg('--out') ?? 'artifacts/social';
const patterns = (arg('--platform') ?? '').split(',').filter(Boolean);
const only = arg('--only')?.split(',');
const stills = args.includes('--stills');
const FPS = Number(arg('--fps') ?? 30);
const JOBS = Math.max(1, Number(arg('--jobs') ?? 4));

refuseInCodexSandbox('social:build');
let hasFfmpeg = true;
try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); } catch { hasFfmpeg = false; }
const ff = (a) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...a]);

let built;
try {
  built = await buildPage({ out: join(OUT, '.page'), patterns });
} catch (e) {
  console.error(`✗ ${e.message}`);
  process.exit(1);
}
const extra = campaignProblems(built.campaign, { root: '.' });
// Copy is checked against the whole registry: --platform narrows what renders, not where copy runs.
const copy = copyProblems(built.campaign, loadRegistry().formats);
if (extra.length || copy.problems.length) {
  console.error(`✗ campaign.json:\n${[...extra, ...copy.problems].map((p) => `  ${p}`).join('\n')}`);
  process.exit(1);
}
const server = await serveDir(built.out);
const browser = await puppeteer.launch({ headless: true });
const specById = new Map(built.formats.map((s) => [s.id, s]));
try {
  const probe = await browser.newPage();
  await probe.goto(`${server.url}/?ids`);
  await probe.waitForFunction(() => window.SOCIAL?.layout, { timeout: 60000 });
  let ids = await probe.evaluate(() => window.SOCIAL.layout.COMPS.map((c) => c.id));
  await probe.close();
  if (only) ids = ids.filter((id) => only.includes(id));
  const specOf = (id) => specById.get(id.split('--')[1]);
  // Identical layouts render once: same angle/card, canvas, safe zone, kind, media and clip limits.
  const keyOf = (id) => {
    const s = specOf(id), v = (s.media ?? []).includes('video');
    return JSON.stringify([id.split('--')[0], s.canvas, s.safe_zone && [s.safe_zone.top, s.safe_zone.bottom, s.safe_zone.left, s.safe_zone.right, s.safe_zone.units], s.kind, v, v && [s.video?.min_s, s.video?.max_s]]);
  };
  const groups = new Map();
  for (const id of ids) { const k = keyOf(id); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(id); }
  const report = [];
  const docs = {};
  let done = 0;
  const queue = [...groups.values()];
  async function worker() {
    const page = await browser.newPage();
    while (queue.length) {
      const group = queue.shift();
      let first = null;
      for (const id of group) {
        const row = await renderOne(page, id, first);
        first ??= row;
        report.push(row);
        done++;
        if (!row.ok) console.log(`FAIL ${id}: ${row.checks.filter((c) => !c.ok).map((c) => c.m).join(' | ')}`);
      }
      if (done % 25 < group.length) console.log(`… ${done}/${ids.length}`);
    }
    await page.close();
  }

  async function renderOne(page, id, first) {
    const spec = specOf(id);
    const dir = join(OUT, spec.platform, spec.id);
    mkdirSync(dir, { recursive: true });
    await page.goto(`${server.url}/?only=${encodeURIComponent(id)}`);
    await page.waitForFunction(() => window.__ready === true, { timeout: 60000 });
    const c = await page.evaluate(() => window.__comp);
    await page.setViewport({ width: c.w, height: c.h, deviceScaleFactor: 1 });
    const tag = c.card ? `card${c.card}` : id.split('--')[0];
    const isDoc = (spec.media ?? []).includes('document');
    const types = (spec.file?.types ?? ['png', 'jpg']).map((x) => x.toLowerCase());
    const lim = maxKb(spec);
    const jpgOk = types.includes('jpg') || types.includes('jpeg');
    const ext = isDoc ? 'png' : (lim && lim < 1024 && jpgOk) || !types.includes('png') ? 'jpg' : 'png';
    const shot = async (t, file, type, quality) => {
      await page.evaluate((x) => window.__seek(x), t);
      await page.screenshot({ path: file, type, clip: { x: 0, y: 0, width: c.w, height: c.h }, ...(type === 'jpeg' ? { quality } : {}) });
    };
    const files = [];
    const still = join(dir, `${tag}.${ext}`);
    const reuse = (e) => { const hit = first?.made?.find((m) => m.endsWith(`.${e}`)); if (!hit) return false; copyFileSync(hit, join(dir, `${tag}.${e}`)); return true; };
    if (!reuse(ext)) {
      if (ext === 'png') await shot(c.poster, still, 'png');
      else for (let q = 92; q >= 40; q -= 8) { await shot(c.poster, still, 'jpeg', q); if (!lim || fileFacts(still).kb <= lim) break; }
    }
    files.push(still);
    if (c.card) (docs[spec.id] ??= {})[c.card] = still;
    const notes = [];
    const wantsVideo = (spec.media ?? []).includes('video') && c.dur && !stills;
    if (wantsVideo && !hasFfmpeg) notes.push('video skipped: ffmpeg isn\'t installed');
    if (wantsVideo && hasFfmpeg) {
      const mp4 = join(dir, `${tag}.mp4`);
      if (!reuse('mp4')) {
        const fr = join(OUT, '.frames', id.replace(/[^\w.-]/g, '_'));
        rmSync(fr, { recursive: true, force: true }); mkdirSync(fr, { recursive: true });
        for (let i = 0; i < Math.round(c.dur * FPS); i++) await shot(i / FPS, join(fr, `f${String(i).padStart(4, '0')}.jpg`), 'jpeg', 92);
        // A silent AAC track: some placements reject video with no audio stream.
        ff(['-framerate', String(FPS), '-i', join(fr, 'f%04d.jpg'), '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000', '-shortest',
          '-c:v', 'libx264', '-profile:v', 'high', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', mp4]);
        // A looping GIF preview of square loops, for email and chat: not a platform deliverable, so it lives apart.
        if (c.loop && c.w === c.h) {
          mkdirSync(join(OUT, 'previews'), { recursive: true });
          ff(['-framerate', String(FPS), '-i', join(fr, 'f%04d.jpg'), '-filter_complex', `fps=15,scale=${Math.min(c.w, 800)}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`, join(OUT, 'previews', `${spec.id}--${tag}.gif`)]);
        }
        rmSync(fr, { recursive: true, force: true });
      }
      files.push(mp4);
    }
    const checks = files.flatMap((f) => checkFile(spec, relative(OUT, f), fileFacts(f), { page: isDoc }));
    for (const v of c.violations) checks.push({ ok: false, m: `layout: ${v.el} ${v.overflow ?? `outside the safe zone (box ${v.box}, safe ${v.safe.map(Math.round)})`}` });
    for (const n of notes) checks.push({ ok: true, m: n });
    return {
      id, spec: spec.id, platform: spec.platform, name: spec.name, kind: spec.kind, canvas: spec.canvas,
      safe_zone_source: spec.safe_zone_source ?? null, confidence: spec.confidence ?? null,
      files: files.map((f) => ({ path: relative(OUT, f), kb: fileFacts(f).kb })), made: files,
      ok: checks.every((x) => x.ok), checks, sources: (spec.sources ?? []).map((s) => s.url),
    };
  }

  await Promise.all(Array.from({ length: Math.min(JOBS, queue.length || 1) }, worker));

  // Documents: one PDF page per card, at the format's canvas.
  for (const [sid, cards] of Object.entries(docs)) {
    const spec = specById.get(sid);
    if (!(spec.media ?? []).includes('document')) continue;
    const pages = Object.keys(cards).sort((a, b) => a - b).map((k) => cards[k]);
    const { w, h } = spec.canvas;
    const p = await browser.newPage();
    await p.setContent(`<style>@page{size:${w}px ${h}px;margin:0}body{margin:0}img{display:block;width:${w}px;height:${h}px;break-after:page}</style>${pages.map((f) => `<img src="data:image/png;base64,${readFileSync(f).toString('base64')}">`).join('')}`);
    const pdf = join(OUT, spec.platform, sid, 'document.pdf');
    await p.pdf({ path: pdf, width: `${w}px`, height: `${h}px`, printBackground: true });
    await p.close();
    const kb = fileFacts(pdf).kb, max = spec.file?.max_mb;
    const ok = !max || kb <= max * 1024;
    report.push({ id: `document--${sid}`, spec: sid, platform: spec.platform, name: `${spec.name} (PDF)`, kind: 'document', canvas: spec.canvas, files: [{ path: relative(OUT, pdf), kb }], ok, checks: [{ ok, m: `document.pdf: ${pages.length} pages, ${kb}KB${max ? ` of ${max}MB` : ''}` }] });
  }

  for (const r of report) delete r.made;
  report.sort((a, b) => a.spec.localeCompare(b.spec) || a.id.localeCompare(b.id));
  writeFileSync(join(OUT, 'report.json'), `${JSON.stringify(report, null, 1)}\n`);
  const bad = report.filter((r) => !r.ok);
  const house = [...new Set(report.filter((r) => String(r.safe_zone_source ?? '').startsWith('house')).map((r) => r.spec))];
  const plats = [...new Set(report.map((r) => r.platform))];
  let md = `# ${built.kit.identity?.name ?? 'Campaign'} · social formats\n\n${report.length - bad.length}/${report.length} assets pass their platform spec, across ${new Set(report.map((r) => r.spec)).size} formats on ${plats.length} platforms.\n`;
  if (house.length) md += `\nHouse safe zones (the platform publishes none): ${house.join(', ')}.\n`;
  if (copy.rows.length) md += `\n## Copy\n\n${copy.rows.map((r) => `- ${r.where}: ${r.n}/${r.max}${r.truncates_at ? `, shown before "more": ${r.truncates_at}` : ''}`).join('\n')}\n`;
  const warns = report.flatMap((r) => r.checks.filter((c) => c.warn).map((c) => `- \`${r.id}\`: ${c.m}`));
  if (warns.length) md += `\n## Warnings (allowed, worth a look)\n\n${warns.join('\n')}\n`;
  if (bad.length) md += `\n## Failing\n\n${bad.map((r) => `- \`${r.id}\`: ${r.checks.filter((c) => !c.ok).map((c) => c.m).join('; ')}`).join('\n')}\n`;
  writeFileSync(join(OUT, 'REPORT.md'), md);

  // Contact sheets: every still of a platform on one page, for review.
  if (!args.includes('--no-sheets')) {
    mkdirSync(join(OUT, 'sheets'), { recursive: true });
    for (const plat of plats) {
      const rows = report.filter((r) => r.platform === plat && r.files.some((f) => /\.(png|jpg)$/.test(f.path)));
      const figs = rows.map((r) => {
        const f = r.files.find((x) => /\.(png|jpg)$/.test(x.path));
        const ar = r.canvas.w / r.canvas.h, h = ar >= 3 ? 90 : ar >= 1.3 ? 200 : 260;
        return `<figure><img src="data:image/${f.path.endsWith('png') ? 'png' : 'jpeg'};base64,${readFileSync(join(OUT, f.path)).toString('base64')}" style="height:${h}px;width:${Math.round(h * ar)}px"><figcaption>${r.id} · ${r.canvas.w}×${r.canvas.h}${r.ok ? '' : ' <b>FAIL</b>'}</figcaption></figure>`;
      });
      const p = await browser.newPage();
      await p.setViewport({ width: 1832, height: 800 });
      await p.setContent(`<style>body{margin:0;padding:16px;background:#ddd8cf;font:12px system-ui;display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start}figure{margin:0;display:grid;gap:4px}img{display:block;box-shadow:0 0 0 1px #0002}figcaption{max-width:300px}b{color:#b3261e}</style>${figs.join('')}`);
      await p.screenshot({ path: join(OUT, 'sheets', `${plat}.png`), fullPage: true });
      await p.close();
    }
  }
  console.log(`\n${report.length - bad.length}/${report.length} assets pass their platform spec. Report: ${join(OUT, 'REPORT.md')}${hasFfmpeg ? '' : '\nffmpeg isn\'t installed, so video formats have posters only.'}`);
  if (bad.length) process.exitCode = 1;
} finally {
  await browser.close();
  await server.close();
}
