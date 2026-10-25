// Pick the closest open font for a brand's licensed font, by pixels.
//
// brand-capture runs this when a site's heading or body font isn't published
// on Fontsource. The site's own web font renders specimen text inside the
// site's page (licensed web use; the font file is never downloaded). Each open
// candidate renders the same text from Google Fonts. Candidates are ranked by
// shape (ink overlap after stretching onto the same box, plus stroke weight)
// and fit (the size and tracking needed to fill the same space). The weight is
// then re-picked by stroke thickness against the site's rendering, because
// shape overlap alone favors heavier weights. The result is a kit entry
// labeled license "stand-in" with stand_in_for, scale and tracking.
//
// The scoring functions are pure and tested in test/font-match.test.mjs.

// ---------- Candidates: open families on Google Fonts and Fontsource ----------
const v = (min, max) => ({ range: [min, max] });
const l = (...list) => ({ list });
export const CANDIDATE_FONTS = [
  ['Inter', 'sans', v(100, 900)], ['Inter Tight', 'sans', v(100, 900)], ['Roboto', 'sans', v(100, 900)],
  ['Arimo', 'sans', v(400, 700)], ['Work Sans', 'sans', v(100, 900)], ['Public Sans', 'sans', v(100, 900)],
  ['IBM Plex Sans', 'sans', v(100, 700)], ['Schibsted Grotesk', 'sans', v(400, 900)], ['Hanken Grotesk', 'sans', v(100, 900)],
  ['Instrument Sans', 'sans', v(400, 700)], ['Geist', 'sans', v(100, 900)], ['Albert Sans', 'sans', v(100, 900)],
  ['Archivo', 'sans', v(100, 900)], ['Familjen Grotesk', 'sans', v(400, 700)], ['Onest', 'sans', v(100, 900)],
  ['Manrope', 'sans', v(200, 800)], ['Figtree', 'sans', v(300, 900)], ['DM Sans', 'sans', v(100, 1000)],
  ['Plus Jakarta Sans', 'sans', v(200, 800)], ['Outfit', 'sans', v(100, 900)], ['Urbanist', 'sans', v(100, 900)],
  ['Lexend', 'sans', v(100, 900)], ['Montserrat', 'sans', v(100, 900)], ['Poppins', 'sans', l(100, 200, 300, 400, 500, 600, 700, 800, 900)],
  ['Space Grotesk', 'sans', v(300, 700)], ['Sora', 'sans', v(100, 800)], ['Red Hat Display', 'sans', v(300, 900)],
  ['Rethink Sans', 'sans', v(400, 800)], ['Mona Sans', 'sans', v(200, 900)], ['Bricolage Grotesque', 'sans', v(200, 800)],
  ['Karla', 'sans', v(200, 800)], ['Nunito Sans', 'sans', v(200, 1000)], ['Open Sans', 'sans', v(300, 800)],
  ['Source Sans 3', 'sans', v(200, 900)], ['Raleway', 'sans', v(100, 900)], ['Mulish', 'sans', v(200, 1000)],
  ['Lato', 'sans', l(100, 300, 400, 700, 900)],
  ['Kumbh Sans', 'sans', v(100, 900)], ['Jost', 'sans', v(100, 900)], ['Epilogue', 'sans', v(100, 900)],
  ['League Spartan', 'sans', v(100, 900)], ['Gabarito', 'sans', v(400, 900)], ['Gantari', 'sans', v(100, 900)],
  ['Commissioner', 'sans', v(100, 900)], ['Libre Franklin', 'sans', v(100, 900)], ['Encode Sans', 'sans', v(100, 900)],
  ['Readex Pro', 'sans', v(200, 700)], ['Red Hat Text', 'sans', v(300, 700)], ['Golos Text', 'sans', v(400, 900)],
  ['Wix Madefor Display', 'sans', v(400, 800)], ['Be Vietnam Pro', 'sans', l(100, 200, 300, 400, 500, 600, 700, 800, 900)],
  ['Questrial', 'sans', l(400)], ['Funnel Sans', 'sans', v(300, 800)],
  ['EB Garamond', 'serif', v(400, 800)], ['Cormorant Garamond', 'serif', v(300, 700)], ['Libre Caslon Text', 'serif', v(400, 700)],
  ['Playfair Display', 'serif', v(400, 900)], ['Lora', 'serif', v(400, 700)], ['Source Serif 4', 'serif', v(200, 900)],
  ['Fraunces', 'serif', v(100, 900)], ['Newsreader', 'serif', v(200, 800)], ['Instrument Serif', 'serif', l(400)],
  ['DM Serif Display', 'serif', l(400)], ['Crimson Pro', 'serif', v(200, 900)], ['Spectral', 'serif', l(200, 300, 400, 500, 600, 700, 800)],
  ['Libre Baskerville', 'serif', l(400, 700)], ['Gelasio', 'serif', v(400, 700)], ['Literata', 'serif', v(200, 900)],
  ['DM Mono', 'mono', l(300, 400, 500)], ['IBM Plex Mono', 'mono', l(100, 200, 300, 400, 500, 600, 700)], ['JetBrains Mono', 'mono', v(100, 800)],
  ['Space Mono', 'mono', l(400, 700)], ['Roboto Mono', 'mono', v(100, 700)], ['Geist Mono', 'mono', v(100, 900)],
  ['Martian Mono', 'mono', v(100, 800)], ['Fira Code', 'mono', v(300, 700)], ['Source Code Pro', 'mono', v(200, 900)],
  ['Red Hat Mono', 'mono', v(300, 700)],
].map(([family, category, weights]) => ({ family, category, weights }));

export const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Every weight a candidate serves, in 100 steps for variable families. */
export function allWeights(c) {
  if (c.weights.list) return c.weights.list;
  const [min, max] = c.weights.range;
  return [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000].filter((w) => w >= min && w <= max);
}
export function nearestWeight(c, target) {
  return allWeights(c).reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a));
}
/** Variable families can take any weight in range; static ones only their listed weights. */
export const isVariable = (c) => Boolean(c.weights.range);
export const fontsourcePackageFor = (c) => `@fontsource${isVariable(c) ? '-variable' : ''}/${slug(c.family)}`;

/**
 * Google Fonts css2 query. A variable family is requested as a range
 * (wght@100..900) so in-between weights like 470 render exactly; a list of
 * weights would serve one static file per weight and the browser would
 * substitute the nearest one.
 */
export function googleFontsUrl(c, weights, italic = false) {
  const ws = [...new Set(weights)].sort((a, b) => a - b);
  const values = isVariable(c) && ws.length > 1 ? [`${ws[0]}..${ws[ws.length - 1]}`] : ws;
  const axis = italic ? `ital,wght@${values.map((w) => `1,${w}`).join(';')}` : `wght@${values.join(';')}`;
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(c.family).replace(/%20/g, '+')}:${axis}&display=block`;
}

/** The kind of font a captured stack and name describe. */
export function categoryOf(stack, family) {
  if (/mono/i.test(family) || /monospace/i.test(stack)) return 'mono';
  if (/garamond|serif|caslon|baskerville|didot|bodoni/i.test(family.replace(/sans/gi, ''))) return 'serif';
  if (/(^|,)\s*serif\b/i.test(stack.replace(/sans-serif/gi, ''))) return 'serif';
  return 'sans';
}

/**
 * Specimens are single words from the text itself plus words covering shapes it
 * may lack, and the start of the line. Single words keep small per-glyph width
 * differences from piling up across a line.
 */
export function specimenTexts(text, uppercase = false) {
  const clean = (text ?? '').replace(/[^\p{L}\p{N} .,'’&-]/gu, '').replace(/\s+/g, ' ').trim();
  const words = [...new Set(clean.replace(/[.,]/g, ' ').split(' ').filter((w) => w.length >= 3))].sort((a, b) => b.length - a.length).slice(0, 4);
  const cut = clean.slice(0, 34);
  const line = clean.length > 34 ? (cut.slice(0, cut.lastIndexOf(' ')) || cut) : clean;
  const texts = [line || 'The quick brown fox jumps', ...(words.length ? words : ['quick', 'brown']), 'Hamburgefonstiv', 'RQGak', '0123'];
  return uppercase ? texts.map((t) => t.toUpperCase()) : texts;
}

// ---------- Shape and fit ----------
const FIT_WEIGHT = 0.35;
const DENSITY_WEIGHT = 1;
const COMPARE_HEIGHT = 40;

export function resample(b, w, h) {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = h === 1 ? 0 : (y * (b.h - 1)) / (h - 1);
    const y0 = Math.floor(sy), y1 = Math.min(b.h - 1, y0 + 1), fy = sy - y0;
    for (let x = 0; x < w; x++) {
      const sx = w === 1 ? 0 : (x * (b.w - 1)) / (w - 1);
      const x0 = Math.floor(sx), x1 = Math.min(b.w - 1, x0 + 1), fx = sx - x0;
      out[y * w + x] = (b.data[y0 * b.w + x0] * (1 - fx) + b.data[y0 * b.w + x1] * fx) * (1 - fy)
        + (b.data[y1 * b.w + x0] * (1 - fx) + b.data[y1 * b.w + x1] * fx) * fy;
    }
  }
  return out;
}
export function blur(a, w, h) {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const yy = y + dy, xx = x + dx;
      if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue;
      s += a[yy * w + xx]; n++;
    }
    out[y * w + x] = s / n;
  }
  return out;
}
/** Mean ink over a crop's own box: stroke weight relative to letter size. */
export function coverage(b) {
  let s = 0;
  for (let i = 0; i < b.w * b.h; i++) s += b.data[i];
  return s / (b.w * b.h * 255);
}
/** Share of ink that doesn't overlap once stretched onto the same box (0 identical), plus a stroke-weight term. */
export function shapeDistance(ref, cand) {
  const h = COMPARE_HEIGHT;
  const w = Math.max(8, Math.round((ref.w * h) / Math.max(1, ref.h)));
  const a = blur(resample(ref, w, h), w, h);
  const b = blur(resample(cand, w, h), w, h);
  let diff = 0, sum = 0;
  for (let i = 0; i < a.length; i++) { diff += Math.abs(a[i] - b[i]); sum += a[i] + b[i]; }
  if (sum === 0) return 1;
  const da = coverage(ref), db = coverage(cand);
  if (da === 0 || db === 0) return 1 + DENSITY_WEIGHT;
  return diff / sum + DENSITY_WEIGHT * Math.abs(Math.log(db / da));
}
/** Size (from x-height, or cap height for all caps) and tracking that make a candidate fill the reference's space. */
export function fitCorrection(ref, cand, uppercase = false) {
  const refH = uppercase ? ref.capHeight : ref.xHeight;
  const candH = uppercase ? cand.capHeight : cand.xHeight;
  const scale = candH > 0 ? refH / candH : 1;
  const scaledWidth = cand.inkWidth * scale;
  const tracking = (ref.inkWidth - scaledWidth) / Math.max(1, ref.chars - 1) / (cand.size * scale);
  const fit = Math.abs(Math.log(scaledWidth / ref.inkWidth)) + Math.abs(Math.log(scale));
  return { scale, tracking, fit };
}
export function scoreCandidate(reference, cand, uppercase = false) {
  let shape = 0, fit = 0, scale = 0, n = 0, refWidth = 0, candWidth = 0, gaps = 0;
  reference.forEach((ref, i) => {
    const c = cand.specimens[i];
    if (!c) return;
    shape += shapeDistance(ref.bitmap, c.bitmap);
    const f = fitCorrection(ref.metrics, c.metrics, uppercase);
    fit += f.fit; scale += f.scale;
    refWidth += ref.metrics.inkWidth; candWidth += c.metrics.inkWidth; gaps += Math.max(1, ref.metrics.chars - 1);
    n++;
  });
  if (n === 0 || n < reference.length) return null;
  const meanScale = scale / n;
  const tracking = (refWidth - candWidth * meanScale) / gaps / (reference[0].metrics.size * meanScale);
  return { family: cand.family, weight: cand.weight, shape: shape / n, fit: fit / n, score: shape / n + FIT_WEIGHT * (fit / n), scale: meanScale, tracking };
}
export function rankCandidates(reference, candidates, uppercase = false) {
  const best = new Map();
  for (const c of candidates) {
    const m = scoreCandidate(reference, c, uppercase);
    if (m && (!best.has(m.family) || m.score < best.get(m.family).score)) best.set(m.family, m);
  }
  return [...best.values()].sort((a, b) => a.score - b.score);
}
/**
 * The same font from two sources scores about 0.06–0.09. Under 0.28 with little
 * correction reads as the same design; a high fit means the stand-in only fills
 * the space with heavy tracking (an extended or condensed face), and the honest
 * move is to ask for the real font files.
 */
export function matchConfidence(m) {
  if (m.score <= 0.28 && m.fit <= 0.1) return 'high';
  if (m.score <= 0.35 && m.fit <= 0.15) return 'medium';
  return 'low';
}

// ---------- Stroke weight ----------
export function otsuThreshold(values) {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < values.length; i++) hist[Math.max(0, Math.min(255, Math.round(values[i])))]++;
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * hist[i];
  let sumB = 0, wB = 0, best = 0, threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = values.length - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const between = wB * wF * (sumB / wB - (sumAll - sumB) / wF) ** 2;
    if (between > best) { best = between; threshold = t; }
  }
  return threshold;
}
/** Grayscale text crop to ink coverage 0–1; the smaller class is ink, so light-on-dark works too. Faint noise is dropped. */
export function inkCoverage(gray) {
  const t = otsuThreshold(gray.data);
  let nLo = 0, sLo = 0, nHi = 0, sHi = 0;
  for (const v of gray.data) { if (v <= t) { nLo++; sLo += v; } else { nHi++; sHi += v; } }
  const mLo = nLo ? sLo / nLo : 0, mHi = nHi ? sHi / nHi : 255, light = nHi < nLo, span = Math.max(1, mHi - mLo);
  const data = new Float32Array(gray.data.length);
  for (let i = 0; i < data.length; i++) {
    const c = Math.max(0, Math.min(1, light ? (gray.data[i] - mLo) / span : (mHi - gray.data[i]) / span));
    data[i] = c < 0.15 ? 0 : c;
  }
  return { w: gray.w, h: gray.h, data };
}
export function cropInk(cov) {
  let x0 = cov.w, y0 = cov.h, x1 = -1, y1 = -1;
  for (let y = 0; y < cov.h; y++) for (let x = 0; x < cov.w; x++) {
    if (cov.data[y * cov.w + x] >= 0.5) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return null;
  const w = x1 - x0 + 1, h = y1 - y0 + 1, data = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = cov.data[(y + y0) * cov.w + x + x0];
  return { w, h, data };
}
/**
 * Stem thickness over ink box height. Each row's ink runs are measured with
 * anti-aliased edges counted fractionally; only the shorter 60% of runs count,
 * so crossbars (whose length grows with letter width, not weight) don't make a
 * wide design read as heavy. Spacing, size and color don't change it; weight does.
 */
export function strokeRatio(cov) {
  const box = cropInk(cov);
  if (!box) return null;
  const runs = [];
  for (let y = 0; y < box.h; y++) {
    let width = 0, solid = false;
    for (let x = 0; x <= box.w; x++) {
      const c = x < box.w ? box.data[y * box.w + x] : 0;
      if (c > 0) { width += c; if (c >= 0.5) solid = true; continue; }
      if (solid) runs.push(width);
      width = 0; solid = false;
    }
  }
  if (!runs.length) return null;
  runs.sort((a, b) => a - b);
  const kept = runs.slice(0, Math.max(1, Math.ceil(runs.length * 0.6)));
  return kept.reduce((s, r) => s + r, 0) / kept.length / box.h;
}
/** The weight whose stroke is closest to the target; for a variable family, interpolated between the two that bracket it. */
export function weightForStroke(target, strokes, variable) {
  const s = [...strokes].sort((a, b) => a.weight - b.weight);
  if (!s.length) return null;
  if (!variable || target <= s[0].ratio || target >= s[s.length - 1].ratio) {
    return s.reduce((a, b) => (Math.abs(Math.log(b.ratio / target)) < Math.abs(Math.log(a.ratio / target)) ? b : a)).weight;
  }
  for (let i = 1; i < s.length; i++) {
    if (target <= s[i].ratio) {
      const t = (target - s[i - 1].ratio) / Math.max(1e-9, s[i].ratio - s[i - 1].ratio);
      return Math.round((s[i - 1].weight + t * (s[i].weight - s[i - 1].weight)) / 10) * 10;
    }
  }
  return s[s.length - 1].weight;
}

// ---------- In-page rendering (installed into both the site's page and the candidates' page) ----------
const PAGE_SCRIPT = `window.__fm = {
  loaded(family) { return [...document.fonts].some((f) => f.family.replace(/["']/g, '') === family && f.status === 'loaded'); },
  async ensure(family, weight, style) {
    const declared = [...document.fonts].filter((f) => f.family.replace(/["']/g, '') === family);
    await Promise.all(declared.map((f) => f.load().catch(() => null)));
    await document.fonts.load(style + ' ' + weight + ' 96px "' + family + '"').catch(() => null);
    return this.loaded(family);
  },
  canvas(family, weight, style, size, text) {
    const c = document.createElement('canvas'); const ctx = c.getContext('2d');
    const font = style + ' ' + weight + ' ' + size + 'px "' + family + '"';
    ctx.font = font; const W = Math.ceil(ctx.measureText(text).width + size), H = Math.ceil(size * 2);
    c.width = W; c.height = H; ctx.font = font; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#000'; ctx.fillText(text, size / 2, Math.round(size * 1.4));
    return { ctx, W, H };
  },
  specimen(family, weight, style, size, text) {
    const { ctx, W, H } = this.canvas(family, weight, style, size, text);
    const px = ctx.getImageData(0, 0, W, H).data; const ink = new Uint8Array(W * H);
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = 255 - px[(y * W + x) * 4]; ink[y * W + x] = v;
      if (v > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
    if (x1 < 0) return null;
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1, TH = 48, TW = Math.max(4, Math.round(bw * TH / bh)); const out = new Array(TW * TH);
    for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
      const sx0 = Math.floor(x0 + tx * bw / TW), sx1 = Math.max(sx0 + 1, Math.ceil(x0 + (tx + 1) * bw / TW));
      const sy0 = Math.floor(y0 + ty * bh / TH), sy1 = Math.max(sy0 + 1, Math.ceil(y0 + (ty + 1) * bh / TH)); let s = 0, n = 0;
      for (let y = sy0; y < sy1; y++) for (let x = sx0; x < sx1; x++) { s += ink[y * W + x]; n++; } out[ty * TW + tx] = Math.round(s / n); }
    const xm = ctx.measureText('x'), hm = ctx.measureText('H');
    return { text, bitmap: { w: TW, h: TH, data: out }, metrics: { inkWidth: bw, xHeight: xm.actualBoundingBoxAscent, capHeight: hm.actualBoundingBoxAscent, chars: [...text].length, size } };
  },
  gray(family, weight, style, size, text) {
    const { ctx, W, H } = this.canvas(family, weight, style, size, text);
    const px = ctx.getImageData(0, 0, W, H).data; const out = new Array(W * H);
    for (let i = 0; i < W * H; i++) out[i] = px[i * 4];
    return { w: W, h: H, data: out };
  },
};`;
const SPECIMEN_SIZE = 96;
const STROKE_SIZE = 160;

async function install(page) {
  if (!(await page.evaluate(() => Boolean(window.__fm)))) await page.addScriptTag({ content: PAGE_SCRIPT });
}

/**
 * Render the site's own font while its page is open. Returns null when the
 * page never loads that family as a web font (a system font, say).
 */
export async function captureReference(page, { family, weight, style = 'normal', text, uppercase = false }) {
  await install(page);
  if (!(await page.evaluate((f, w, s) => window.__fm.ensure(f, w, s), family, weight, style))) return null;
  const texts = specimenTexts(text, uppercase);
  const specimens = await page.evaluate((f, w, s, size, ts) => ts.map((t) => window.__fm.specimen(f, w, s, size, t)), family, weight, style, SPECIMEN_SIZE, texts);
  if (specimens.some((x) => !x)) return null;
  const strokeText = texts[0];
  const stroke = strokeRatio(inkCoverage(await page.evaluate((f, w, s, size, t) => window.__fm.gray(f, w, s, size, t), family, weight, style, STROKE_SIZE, strokeText)));
  return { family, weight, style, uppercase, texts, specimens, strokeText, stroke };
}

async function candidatePage(browser, fonts, weightsOf, italic) {
  const page = await browser.newPage();
  const links = fonts.map((c) => `<link rel="stylesheet" href="${googleFontsUrl(c, weightsOf(c), italic)}">`).join('');
  await page.setContent(`<!doctype html><html><head>${links}</head><body></body></html>`, { waitUntil: 'networkidle0', timeout: 60000 }).catch(() => {});
  await install(page);
  return page;
}
async function renderAt(page, c, weight, ref) {
  if (!(await page.evaluate((f, w, s) => window.__fm.ensure(f, w, s), c.family, weight, ref.style))) return null;
  const specimens = await page.evaluate((f, w, s, size, ts) => ts.map((t) => window.__fm.specimen(f, w, s, size, t)), c.family, weight, ref.style, SPECIMEN_SIZE, ref.texts);
  return { family: c.family, weight, specimens };
}

/**
 * Find the stand-in for a captured reference. Pass 1 ranks every candidate of
 * the same kind at its nearest weight (widening to every kind once if the best
 * is weak). Pass 2 takes the top three, re-picks each one's weight by stroke
 * thickness against the site's rendering, and re-scores at that weight.
 * Returns null when no candidate font loads (no network to Google Fonts).
 */
export async function matchFont(browser, ref, { category = 'sans' } = {}) {
  const italic = ref.style === 'italic';
  const run = async (fonts) => {
    const page = await candidatePage(browser, fonts, (c) => [nearestWeight(c, ref.weight)], italic);
    const renders = [];
    for (const c of fonts) {
      const r = await renderAt(page, c, nearestWeight(c, ref.weight), ref);
      if (r) renders.push(r);
    }
    await page.close();
    return renders;
  };
  let ranked = rankCandidates(ref.specimens, await run(CANDIDATE_FONTS.filter((c) => c.category === category)), ref.uppercase);
  let widened = false;
  if (!ranked.length) return null;
  if (matchConfidence(ranked[0]) === 'low') {
    // A weak same-kind match often means the kind was wrong (a "semi-mono" is a grotesk at heart).
    const others = rankCandidates(ref.specimens, await run(CANDIDATE_FONTS.filter((c) => c.category !== category)), ref.uppercase);
    ranked = [...ranked, ...others].sort((a, b) => a.score - b.score);
    widened = true;
  }

  // Pass 2: weight by stroke, then re-score at that weight.
  const top = ranked.slice(0, 3).map((m) => CANDIDATE_FONTS.find((c) => c.family === m.family));
  const page = await candidatePage(browser, top, (c) => allWeights(c), italic);
  const refined = [];
  for (const c of top) {
    const strokes = [];
    for (const w of allWeights(c)) {
      if (!(await page.evaluate((f, ww, s) => window.__fm.ensure(f, ww, s), c.family, w, ref.style))) continue;
      const ratio = strokeRatio(inkCoverage(await page.evaluate((f, ww, s, size, t) => window.__fm.gray(f, ww, s, size, t), c.family, w, ref.style, STROKE_SIZE, ref.strokeText)));
      if (ratio !== null) strokes.push({ weight: w, ratio });
    }
    const weight = ref.stroke !== null ? weightForStroke(ref.stroke, strokes, isVariable(c)) : nearestWeight(c, ref.weight);
    if (weight === null) continue;
    const r = await renderAt(page, c, weight, ref);
    const m = r && scoreCandidate(ref.specimens, r, ref.uppercase);
    if (m) refined.push({ ...m, strokes, specimens: r.specimens });
  }
  await page.close();
  refined.sort((a, b) => a.score - b.score);
  const best = refined[0] ?? ranked[0];
  const candidate = CANDIDATE_FONTS.find((c) => c.family === best.family);
  return {
    family: best.family,
    package: fontsourcePackageFor(candidate),
    category: candidate.category,
    weight: best.weight,
    scale: best.scale,
    tracking: best.tracking,
    score: best.score,
    fit: best.fit,
    confidence: matchConfidence(best),
    widened,
    alternatives: (refined.length ? refined : ranked).slice(0, 3).map((m) => ({ family: m.family, weight: m.weight, score: Number(m.score.toFixed(3)) })),
    proof: { reference: ref, rows: refined.slice(0, 3).map((m) => ({ family: m.family, weight: m.weight, score: m.score, specimens: m.specimens })) },
  };
}

/** A PNG of the site's own font above the top stand-ins, as the ink crops that were scored, for reviewing the capture. */
export async function proofPng(browser, match) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1600, height: 200 });
    await page.setContent('<!doctype html><body style="margin:0;background:#fff;font:15px system-ui;color:#555"></body>');
    await page.evaluate((proof, label) => {
      const img = (b) => {
        const c = document.createElement('canvas'); c.width = b.w; c.height = b.h; const x = c.getContext('2d'); const d = x.createImageData(b.w, b.h);
        b.data.forEach((v, i) => { d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = 255 - v; d.data[i * 4 + 3] = 255; });
        x.putImageData(d, 0, 0); return c.toDataURL();
      };
      const row = (title, specimens, color) => `<div style="padding:16px 24px;border-bottom:1px solid #eee"><div style="color:${color};margin-bottom:8px">${title}</div>${specimens.map((s) => `<img src="${img(s.bitmap)}" style="height:48px;margin-right:28px">`).join('')}</div>`;
      document.body.innerHTML = row(label, proof.reference.specimens, '#b4261a')
        + proof.rows.map((m, i) => row(`#${i + 1} ${m.family} ${m.weight} · score ${m.score.toFixed(3)}`, m.specimens, '#333')).join('');
    }, match.proof, `${match.proof.reference.family} ${match.proof.reference.weight} · the site's own font`);
    return await page.screenshot({ fullPage: true, type: 'png' });
  } finally {
    await page.close();
  }
}

const round = (n, d = 3) => Math.round(n * 10 ** d) / 10 ** d;
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

/**
 * The kit entry for a matched stand-in. `base` is what capture read from the
 * site (tracking, line height, case); the stand-in's own correction is added
 * to the site's tracking. Scale applies to display type, where size is set by
 * the brand; body sizes come from the layout.
 */
export function standInEntry(role, siteFamily, base, match) {
  return {
    family: match.family,
    source: 'fontsource',
    package: match.package,
    license: 'stand-in',
    stand_in_for: siteFamily,
    ...base,
    weight: match.weight,
    tracking: round(clamp((base.tracking ?? 0) + match.tracking, -0.2, 0.5)),
    ...(role === 'display' ? { scale: round(clamp(match.scale, 0.5, 1.5), 2) } : {}),
  };
}
