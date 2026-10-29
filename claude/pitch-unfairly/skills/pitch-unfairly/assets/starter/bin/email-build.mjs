// Build an email or newsletter from email/: the send-ready HTML, its plain-text part,
// renders as mail apps show it, and a preview page to publish.
//   npm run email:build            everything: HTML, checks, renders, preview page, QA gate
//   npm run email:build -- --html  the HTML and its static checks only (fast)
// Writes dist-email/ (index.html, the preview page; email.html and email.txt to download;
// renders/), artifacts/email/ (report.json, REPORT.md, contact-sheet.png) and artifacts/gate/.
// Fails when anything has a problem.
import puppeteer from 'puppeteer';
import mjml2html from 'mjml';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brandCss, fontFaceCss } from './brand-lib.mjs';
import { fontDir, fontsourceCss } from './site-build.mjs';
import { esc, pageShell } from './site/fill.mjs';
import { bannedEntries } from './site/banned.mjs';
import { GATE_SCREENS, distDigest, gateStamp, runGate, writeGateFiles } from './site/gate.mjs';
import { allowedColors } from './collateral/rules.mjs';
import { serveDir } from './serve.mjs';
import { refuseInCodexSandbox } from './browser-guard.mjs';
import { stableLaunch } from './stable-shots.mjs';
import { resolveBrand } from './longform/brand.mjs';
import { WIDTH, loadEmail, mjmlDocument } from './email/compile.mjs';
import { emailChecks, emailText } from './email/checks.mjs';
import { EMAIL_ENGINE } from './email/version.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const OUT = 'dist-email';
export const ART = 'artifacts/email';

/** How the email is shown: two widths, light and dark, a forced inversion, and images off. */
export const RENDERS = [
  { id: 'desktop-light', label: 'Desktop, light', width: 680 },
  { id: 'desktop-dark', label: 'Desktop, dark mode', width: 680, dark: true },
  { id: 'phone-light', label: 'Phone, light', width: 375, mobile: true },
  { id: 'phone-dark', label: 'Phone, dark mode', width: 375, mobile: true, dark: true },
  { id: 'phone-inverted', label: 'Phone, forced dark (apps that invert colors)', width: 375, mobile: true, invert: true },
  { id: 'desktop-images-off', label: 'Images off', width: 680, noImages: true },
];

/** In-page, on a render: sideways scroll, and text that loses contrast against what's behind it. */
const RENDER_CHECK = (width) => {
  const problems = [];
  const sw = document.documentElement.scrollWidth;
  if (sw > width + 1) problems.push(`scrolls sideways (${sw}px wide in a ${width}px window)`);
  const px = document.createElement('canvas');
  px.width = px.height = 1;
  const g = px.getContext('2d', { willReadFrequently: true });
  const lum = (c) => {
    g.clearRect(0, 0, 1, 1); g.fillStyle = '#fff'; g.fillRect(0, 0, 1, 1); g.fillStyle = c; g.fillRect(0, 0, 1, 1);
    const d = g.getImageData(0, 0, 1, 1).data;
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(d[0]) + 0.7152 * f(d[1]) + 0.0722 * f(d[2]);
  };
  const bg = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      const m = /rgba?\(([^)]+)\)/.exec(s.backgroundColor);
      if (m && (m[1].split(',')[3] === undefined || Number(m[1].split(',')[3]) > 0.9)) return s.backgroundColor;
      const attr = n.getAttribute?.('bgcolor');
      if (attr) return attr;
    }
    return '#ffffff';
  };
  const seen = new Set();
  for (const el of document.body.querySelectorAll('*')) {
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own || el.closest('[style*="display:none"]')) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const s = getComputedStyle(el);
    const [a, b] = [lum(s.color), lum(bg(el))].sort((x, y) => y - x);
    const ratio = (a + 0.05) / (b + 0.05);
    const large = parseFloat(s.fontSize) >= 24 || (parseFloat(s.fontSize) >= 18.6 && Number(s.fontWeight) >= 700);
    const text = el.textContent.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (ratio < (large ? 3 : 4.5) && !seen.has(text)) { seen.add(text); problems.push(`"${text}" has ${ratio.toFixed(1)}:1 contrast`); }
  }
  return problems;
};

async function renderAll(browser, base, outDir) {
  await mkdir(outDir, { recursive: true });
  const rows = [];
  for (const r of RENDERS) {
    const page = await browser.newPage();
    await page.setViewport({ width: r.width, height: 900, deviceScaleFactor: 2, isMobile: !!r.mobile });
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: r.dark ? 'dark' : 'light' }]);
    if (r.noImages) {
      await page.setRequestInterception(true);
      page.on('request', (q) => (q.resourceType() === 'image' ? q.abort() : q.continue()));
    }
    await page.goto(`${base}/email.html`, { waitUntil: 'networkidle0' });
    if (r.invert) await page.addStyleTag({ content: 'html { filter: invert(1) hue-rotate(180deg); } img { filter: invert(1) hue-rotate(180deg); }' });
    await page.evaluate(() => document.fonts.ready);
    const problems = r.invert ? [] : await page.evaluate(RENDER_CHECK, r.width);
    const file = join(outDir, `${r.id}.png`);
    await page.screenshot({ path: file, fullPage: true });
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    rows.push({ ...r, file, height, problems: problems.map((p) => `${r.label}: ${p}`) });
    await page.close();
  }
  return rows;
}

/** The page the link shows: the subject line as the inbox has it, the email live, how it renders, and the files. */
export function previewPage({ email, kit, renders, heights, sizes, html }) {
  const name = kit.identity?.name ?? '';
  const fig = (r) => `<figure class="ep-shot${r.mobile ? ' is-phone' : ''}"><img src="renders/${r.id}.png" alt="${esc(`${email.subject}: ${r.label}`)}" width="${r.width}"><figcaption>${esc(r.label)}</figcaption></figure>`;
  return `<header class="ep-bar top"><span class="ep-from">${esc(email.from_name ?? name)}</span>
<a class="ep-dl" href="download/email.html" download data-cta="download_html" data-primary>Download the HTML</a></header>
<main id="top">
<section class="ep-head" data-section>
  <p class="ep-kind">${esc(email.kind === 'newsletter' ? `Newsletter${email.issue ? `, issue ${email.issue}` : ''}` : email.kind === 'one-to-one' ? 'Email' : 'Campaign email')}</p>
  <h1>${esc(email.subject)}</h1>
  <p class="ep-pre">${esc(email.preheader)}</p>
  <p class="ep-files">The plain-text part is <a href="download/email.txt" download data-cta="download_text">email.txt</a> (${sizes.txt}), beside the HTML (${sizes.html}). Import both into your email platform.</p>
</section>
<section class="ep-live" data-section aria-label="The email">
  <!-- Inline (srcdoc): the content host's frame-ancestors won't let a page frame another of its own files. -->
  <iframe class="ep-frame" sandbox="allow-popups allow-popups-to-escape-sandbox" srcdoc="${esc(html)}" title="${esc(email.subject)}" style="--h-wide:${heights.wide}px;--h-phone:${heights.phone}px"></iframe>
</section>
<section class="ep-renders" aria-label="In the inbox">
  <h2>In the inbox</h2>
  <div class="ep-grid is-desktop">${renders.filter((r) => !r.mobile).map(fig).join('\n')}</div>
  <div class="ep-grid is-phone">${renders.filter((r) => r.mobile).map(fig).join('\n')}</div>
</section>
</main>`;
}

const PAGE_CSS = `
body { background: var(--surface); }
.ep-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; padding: 10px clamp(16px, 4vw, 40px); background: var(--paper); border-bottom: var(--border-base) solid var(--border-color, var(--ink)); }
.ep-from { font-family: var(--font-display); font-weight: var(--display-weight); letter-spacing: var(--display-tracking); min-width: 0; overflow-wrap: anywhere; }
.ep-dl { flex: none; display: inline-flex; align-items: center; min-height: 44px; padding: 0 18px; border-radius: var(--radius-button); font-weight: 700; text-decoration: none; background: var(--accent); color: var(--on-accent); }
main { max-width: 1180px; margin: 0 auto; padding: clamp(32px, 6vw, 72px) clamp(16px, 4vw, 40px) 96px; }
.ep-head { max-width: 46rem; }
.ep-kind { color: var(--ink-muted); font-weight: 600; }
.ep-head h1 { font-size: clamp(2rem, 5vw, 3.4rem); margin-top: 10px; }
.ep-pre { margin-top: 14px !important; font-size: 1.2rem; color: var(--ink-muted); }
.ep-files { margin-top: 24px !important; color: var(--ink-muted); }
.ep-files a { color: var(--ink); font-weight: 700; display: inline-block; padding-block: 12px; }
.ep-live { margin-top: 40px; display: flex; justify-content: center; }
.ep-frame { display: block; width: 100%; max-width: ${WIDTH + 80}px; height: var(--h-wide); border: 0; background: var(--paper); box-shadow: var(--shadow-card); border-radius: 12px; }
.ep-renders { margin-top: 72px; }
.ep-renders h2 { font-size: clamp(1.6rem, 3.4vw, 2.4rem); }
.ep-grid { margin-top: 28px; display: grid; gap: 28px; align-items: start; }
.ep-grid { grid-template-columns: minmax(0, 1fr); }
.ep-grid.is-phone { grid-template-columns: minmax(0, 340px); justify-content: center; }
@media (min-width: 700px) { .ep-grid.is-phone { grid-template-columns: repeat(3, minmax(0, 320px)); } }
@media (min-width: 1100px) { .ep-grid.is-desktop { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
.ep-shot { margin: 0; }
.ep-shot img { width: 100%; height: auto; border-radius: 10px; box-shadow: var(--shadow-card); background: var(--paper); }
.ep-shot figcaption { margin-top: 10px; color: var(--ink-muted); }
@media (max-width: ${WIDTH + 80}px) { .ep-frame { height: var(--h-phone); } }
`;

/** Writes the preview page and its files into dist-email. */
async function writePage({ root, email, kit, html, text, renders }) {
  const out = join(root, OUT);
  for (const d of ['download', 'js']) await mkdir(join(out, d), { recursive: true });
  // The live frame and the download are separate copies: a download link to the file a frame shows navigates instead.
  await writeFile(join(out, 'download', 'email.html'), html);
  await writeFile(join(out, 'download', 'email.txt'), text);
  let fontCss = '';
  for (const pkg of new Set(['display', 'body', 'mono'].map((r) => kit.typography?.[r]).filter((t) => t?.source === 'fontsource').map((t) => t.package))) {
    if (!fontDir(root, pkg)) throw new Error(`Font package ${pkg} isn't installed. Run npm run brand:apply.`);
    const f = await fontsourceCss(root, pkg);
    fontCss += f.css;
    await mkdir(join(out, 'fonts', f.name), { recursive: true });
    for (const file of f.files) await copyFile(join(f.dir, 'files', file), join(out, 'fonts', f.name, file));
  }
  const wide = renders.find((r) => r.id === 'desktop-light');
  const phone = renders.find((r) => r.id === 'phone-light');
  const kb = (s) => `${Math.max(1, Math.round(Buffer.byteLength(s) / 1024))} KB`;
  const body = previewPage({ email, kit, renders, heights: { wide: wide.height, phone: phone.height }, sizes: { html: kb(html), txt: kb(text) }, html });
  const css = [fontCss, brandCss(kit, fontFaceCss(kit, 'brand/'), 'brand/'), await readFile(join(here, 'site/base.css'), 'utf8'), PAGE_CSS].join('\n');
  await writeFile(join(out, 'index.html'), pageShell({ site: { title: email.subject, description: email.preheader }, body, css, model: {} }));
  await writeFile(join(out, 'index.txt'), `# ${email.subject}\n\n${email.preheader}\n\n${text}`);
  await copyFile(join(here, 'site/app.js'), join(out, 'js', 'app.js'));
  await copyFile(join(here, 'site/model.mjs'), join(out, 'js', 'model.mjs'));
}

async function contactSheet(browser, renders, path) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1800, height: 900 });
  const imgs = await Promise.all(renders.map(async (r) => `<figure><img src="data:image/png;base64,${(await readFile(r.file)).toString('base64')}"><figcaption>${esc(r.label)}</figcaption></figure>`));
  await page.setContent(`<style>body{margin:16px;background:#777;font:13px sans-serif;display:grid;grid-template-columns:repeat(6,1fr);gap:14px;align-items:start}figure{margin:0}img{width:100%;display:block}figcaption{color:#fff;padding-top:6px}</style>${imgs.join('')}`, { waitUntil: 'load' });
  await page.screenshot({ path, fullPage: true });
  await page.close();
}

export async function buildEmail({ root = '.', htmlOnly = false, gate = true, log = console.log } = {}) {
  const brand = resolveBrand(root);
  const loaded = loadEmail(root);
  const { email } = loaded;
  const { entries, problems: bannedProblems } = bannedEntries(brand.kit);
  const doc = mjmlDocument(loaded, brand);
  const report = { engine: EMAIL_ENGINE, brand: { schema: brand.schema, source: brand.source }, problems: [...bannedProblems, ...doc.missing], warnings: [] };
  if (!loaded.blocks.length) report.problems.push('email/blocks/ has no .mjml blocks');
  if (report.problems.length) return finish(report, log);
  const compiled = await mjml2html(doc.mjml, { validationLevel: 'soft', keepComments: false });
  for (const e of compiled.errors ?? []) report.problems.push(`MJML: ${e.formattedMessage ?? e.message}`);
  const html = compiled.html;
  const text = emailText(html);
  const checks = emailChecks(html, email, { allowed: allowedColors(brand.kit, email.neutrals ?? []), entries, voice: brand.voice, merge: doc.merge });
  report.problems.push(...checks.problems);
  report.warnings.push(...checks.warnings);
  report.bytes = Buffer.byteLength(html);
  const out = join(root, OUT);
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'email.html'), html);
  await writeFile(join(out, 'email.txt'), text);
  if (htmlOnly) return finish(report, log, { htmlOnly });

  const server = await serveDir(out);
  const browser = await puppeteer.launch(stableLaunch());
  try {
    const renders = await renderAll(browser, server.url, join(out, 'renders'));
    for (const r of renders) report.problems.push(...r.problems);
    report.renders = renders.map(({ id, label, width, height, file }) => ({ id, label, width, height, file }));
    await mkdir(join(root, ART), { recursive: true });
    await contactSheet(browser, renders, join(root, ART, 'contact-sheet.png'));
    await writePage({ root, email, kit: brand.kit, html, text, renders });
    if (gate) {
      // The gate reads the preview page; the email itself is held to the email checks above,
      // so the crawl stays on the page rather than gating the download as a web page.
      const gout = join(root, 'artifacts/gate');
      await rm(gout, { recursive: true, force: true });
      await mkdir(join(gout, 'shots'), { recursive: true });
      const result = await runGate(browser, server.url, { pages: ['/'], screens: GATE_SCREENS, entries, out: gout, workers: 4 });
      result.findings = result.findings.filter((f) => !String(f.page).startsWith('/download/'));
      const stamp = gateStamp({ digest: await distDigest(out), pages: result.pages, screens: GATE_SCREENS, findings: result.findings, entries });
      await writeGateFiles(gout, stamp, result);
      report.gate = { clean: stamp.clean, findings: result.findings.length, sheet: result.sheet };
      for (const f of result.findings) report.problems.push(`preview page [${f.check}]: ${f.message}${f.widths?.length ? ` @ ${f.widths.join(', ')}` : ''}`);
    } else report.warnings.push('the preview page\'s QA gate was skipped (--no-gate): this build can\'t publish');
  } finally {
    await browser.close();
    await server.close();
  }
  return finish(report, log);
}

async function finish(report, log, { htmlOnly = false } = {}) {
  await mkdir(ART, { recursive: true });
  await writeFile(join(ART, 'report.json'), JSON.stringify(report, null, 2));
  await writeFile(join(ART, 'REPORT.md'), `# Email report\n\n${report.bytes ? `HTML: ${(report.bytes / 1024).toFixed(1)} KB.\n\n` : ''}${[...report.problems.map((p) => `- ✗ ${p}`), ...report.warnings.map((w) => `- ! ${w}`)].join('\n')}\n`);
  for (const p of report.problems) log(`✗ ${p}`);
  for (const w of report.warnings) log(`! ${w}`);
  if (!report.problems.length) log(htmlOnly ? `✓ ${OUT}/email.html built and checked (${(report.bytes / 1024).toFixed(1)} KB).` : `\n✓ Email, renders and preview page clean. Look at ${ART}/contact-sheet.png before handing it over.`);
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  refuseInCodexSandbox('email:build');
  const args = process.argv.slice(2);
  buildEmail({ htmlOnly: args.includes('--html'), gate: !args.includes('--no-gate') })
    .then((r) => { if (r.problems.length) process.exit(1); })
    .catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
}
