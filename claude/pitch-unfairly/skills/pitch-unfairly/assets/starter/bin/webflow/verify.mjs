// Check a published Webflow page against the built site it came from: height, every rendered
// element's computed style, and the visible text, at a set of widths, with page scripts off on both
// sides (the static DOM is the finished state). Pixel diffs are left out on purpose: the measured
// remainder was text antialiasing (Webflow cannot set -webkit-font-smoothing), not layout.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer';

const PROPS = [
  'display', 'position', 'width', 'height', 'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing',
  'text-transform', 'color', 'background-color', 'background-image', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'grid-template-columns', 'flex-direction',
  'justify-content', 'align-items', 'border-top-width', 'border-bottom-width', 'border-radius', 'transform', 'opacity',
  'text-align', 'border-top-color', 'border-bottom-color', 'border-left-width', 'white-space', 'vertical-align', 'list-style-type', 'top',
];

// Runs in the page. Spans that Webflow or the compiler drop without changing the render are looked
// through (see `bare`), so the element lists on both sides line up.
const PROBE = `(rootSel, props, webflowSide) => {
  const root = document.querySelector(rootSel);
  const out = [];
  const visit = (el, path) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || el.classList.contains("pdf-only") || ["SCRIPT", "STYLE", "TEMPLATE"].includes(el.tagName)) return;
    if (el.tagName === "SPAN" && el.getAttribute("aria-hidden") === "true") return;
    // Looked through: on the Webflow side (plan and live), an attribute-less span, which Webflow drops
    // whatever its display (a flex item is blockified; in the source such a span can be styled by a
    // descendant selector, so it counts there). On both sides, a box-less span holding only text, with
    // no ::before or ::after, that looks like its parent's text: the compiler drops an unstyled span.
    const ps = el.parentElement && getComputedStyle(el.parentElement);
    const boxless = cs.backgroundColor === "rgba(0, 0, 0, 0)" && cs.paddingLeft === "0px" && cs.paddingRight === "0px" && cs.borderLeftWidth === "0px";
    const noPseudo = ["::before", "::after"].every((x) => ["none", "normal"].includes(getComputedStyle(el, x).content));
    const plainText = el.children.length === 0 && noPseudo && ps && ["color", "fontFamily", "fontSize", "fontWeight", "fontStyle", "letterSpacing", "textTransform"].every((k) => cs[k] === ps[k]);
    const bare = el.tagName === "SPAN" && ((webflowSide && el.attributes.length === 0) || (boxless && (cs.display === "inline" || plainText)));
    if (el !== root && !bare) {
      const styles = {};
      for (const p of props) styles[p] = cs.getPropertyValue(p);
      const r = el.getBoundingClientRect();
      out.push({ path, tag: el.tagName.toLowerCase(), cls: el.className || "", left: r.left, text: (el.textContent || "").trim().slice(0, 40), styles });
    }
    let i = 0;
    for (const c of Array.from(el.children)) visit(c, path + "/" + c.tagName.toLowerCase() + "[" + i++ + "]");
  };
  visit(root, "");
  const s = document.createElement("style");
  s.textContent = '[aria-hidden="true"]{display:none!important}';
  document.head.appendChild(s);
  const text = root.innerText;
  s.remove();
  return { probe: out, text, height: root.getBoundingClientRect().height };
}`;

const norm = (s) => s.replace(/​/g, '').replace(/\s+/g, ' ').trim();
/** Values that differ in spelling only (`gap: normal` and `0px` in a grid, two notations of one color). */
const srgb = (v) => String(v).replace(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/g, (m, r, g, b, a) => `rgba(${[r, g, b].map((x) => Math.round(Number(x) * 255)).join(', ')}, ${a ?? 1})`).replace(/^rgb\((\d+), (\d+), (\d+)\)$/, 'rgba($1, $2, $3, 1)');
// Chrome can report an auto margin as 0px or as its used width depending on layout timing; the box
// position is what a visitor sees, so a horizontal margin only counts when the box moved.
const MARGIN_X = new Set(['margin-left', 'margin-right']);
const same = (p, a, b) => a === b || srgb(a) === srgb(b) || ((p === 'width' || p === 'height') && Math.abs(parseFloat(a) - parseFloat(b)) < 1.5);

export function compareProbes(ours, wf) {
  const diffs = [];
  const n = Math.min(ours.length, wf.length);
  for (let i = 0; i < n; i++) {
    if (ours[i].tag !== wf[i].tag) {
      diffs.push({ path: ours[i].path, prop: '(structure)', ours: ours[i].tag, webflow: wf[i].tag, text: ours[i].text });
      break;
    }
    for (const p of PROPS) if (!same(p, ours[i].styles[p], wf[i].styles[p]) && !(MARGIN_X.has(p) && Math.abs(ours[i].left - wf[i].left) < 1.5)) diffs.push({ path: ours[i].path, prop: p, ours: ours[i].styles[p], webflow: wf[i].styles[p], text: ours[i].text, cls: `${ours[i].cls} | ${wf[i].cls}` });
  }
  if (ours.length !== wf.length) diffs.push({ path: '', prop: '(element count)', ours: ours.length, webflow: wf.length, text: '' });
  return diffs;
}

/** Width ranges where a media query moved to a Webflow breakpoint, so the page is expected to differ. */
export function snapBands(report) {
  const raw = (report?.mediaShifts ?? [])
    .filter((s) => Math.abs(s.written - s.snapped) > 1)
    .map((s) => (s.kind === 'max' ? [Math.min(s.written, s.snapped) + 1, Math.max(s.written, s.snapped)] : [Math.min(s.written, s.snapped), Math.max(s.written, s.snapped) - 1]))
    .sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const b of raw) {
    const last = merged.at(-1);
    if (last && b[0] <= last[1] + 1) last[1] = Math.max(last[1], b[1]);
    else merged.push([...b]);
  }
  return merged;
}

/**
 * Two checks. Live against the compiled preview (what the plan said Webflow would render) must match at
 * every width: that is the push working. Live against the source build is reported, not judged: inside
 * the breakpoint bands it differs by design.
 */
export async function verifyPage({ dist, url, widths, report, root, blockFonts, out }) {
  await mkdir(out, { recursive: true });
  const original = await readFile(join(dist, 'index.html'), 'utf8');
  const oursFile = join(out, 'ours.html');
  const chrome = `<base href="${pathToFileURL(`${dist}/`).href}"><style>header, footer { display: none !important; }</style>`;
  await writeFile(oursFile, original.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<head([^>]*)>/i, `<head$1>${chrome}`));
  const previewFile = join(out, 'preview.html');
  const rootSel = root ?? 'main';
  const bands = snapBands(report);
  const inBand = (w) => bands.some(([a, b]) => w >= a && w <= b);
  const browser = await puppeteer.launch({ headless: true });
  const live = await (await fetch(url)).text();
  const problems = [];
  if (/##INLINE\d+##/.test(live)) problems.push('The published page contains a ##INLINE## placeholder: inline markup the HTML builder could not place.');
  const results = [];
  const shot = async (target, sel, js, width, webflowSide) => {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 900 });
    await page.setJavaScriptEnabled(js);
    if (blockFonts) {
      await page.setRequestInterception(true);
      page.on('request', (r) => (/\.(woff2?|otf|ttf)(\?|$)/.test(r.url()) ? r.abort() : r.continue()));
    }
    await page.goto(target, { waitUntil: 'load' });
    await new Promise((r) => setTimeout(r, 1200));
    const res = await page.evaluate(`(${PROBE})(${JSON.stringify(sel)}, ${JSON.stringify(PROPS)}, ${webflowSide})`);
    await page.close();
    return res;
  };
  const textDiff = (a, b) => (norm(a.text) !== norm(b.text) ? [{ path: '', prop: '(text)', ours: '', webflow: '', text: '' }] : []);
  try {
    for (const width of widths) {
      const wf = await shot(url, 'body', false, width, true);
      const preview = await shot(pathToFileURL(previewFile).href, 'body', true, width, true);
      const ours = await shot(pathToFileURL(oursFile).href, rootSel, true, width, false);
      const pushDiffs = [...compareProbes(preview.probe, wf.probe), ...textDiff(preview, wf)];
      const designDiffs = [...compareProbes(ours.probe, wf.probe), ...textDiff(ours, wf)];
      results.push({ width, heights: { source: Math.round(ours.height), plan: Math.round(preview.height), webflow: Math.round(wf.height) }, pushDiffs, designDiffs, band: inBand(width) });
      const tag = pushDiffs.length ? '✗' : '✓';
      const vsSource = designDiffs.length === 0 ? 'matches the source' : `${designDiffs.length} difference(s) from the source${inBand(width) ? ' (breakpoint band)' : ''}`;
      console.log(`${tag} ${width}px  webflow ${Math.round(wf.height)}px tall, ${pushDiffs.length} difference(s) from the plan; ${vsSource}`);
      for (const d of pushDiffs.slice(0, 8)) console.log(`    ${d.path || '(page)'} ${d.prop}: ${d.ours} -> ${d.webflow}${d.cls ? `  [${d.cls}]` : ''}${d.text ? `  "${norm(d.text)}"` : ''}`);
      if (pushDiffs.length) problems.push(`${width}px: the published page differs from the plan in ${pushDiffs.length} place(s)`);
      if (designDiffs.length && !inBand(width)) problems.push(`${width}px: differs from the source outside any breakpoint band`);
    }
  } finally {
    await browser.close();
  }
  await writeFile(join(out, 'verify.json'), `${JSON.stringify({ url, bands, results, problems }, null, 1)}\n`);
  if (bands.length) console.log(`Breakpoint bands where the source can differ: ${bands.map(([a, b]) => `${a}–${b}px`).join(', ')}`);
  if (problems.length) console.log(`\n✗ ${problems.join('\n✗ ')}`);
  else console.log('\nThe Webflow page matches the plan at every width.');
  return problems.length === 0;
}
