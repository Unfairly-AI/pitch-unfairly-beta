// Design fundamentals: WCAG 2.2 and APCA contrast, OKLCH tonal ramps, type scale,
// leading and tracking by size, spacing scale, and analyzeKit (findings plus the
// derived system). Generated from unfairly-app src/lib/brand/fundamentals (rulebook:
// docs/brand/design-fundamentals.md) so both repos hold the same numbers; change it
// there and regenerate. Pure: no I/O, runs in Node or in a page.

// src/lib/brand/fundamentals/color.ts
function parseHex(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return { r: parseInt(h.slice(0, 2), 16) / 255, g: parseInt(h.slice(2, 4), 16) / 255, b: parseInt(h.slice(4, 6), 16) / 255 };
}
function toHex({ r, g, b }) {
  const c = (v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}
var toLinear = (v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
var toGamma = (v) => v <= 31308e-7 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
function luminance(c) {
  return 0.2126 * toLinear(c.r) + 0.7152 * toLinear(c.g) + 0.0722 * toLinear(c.b);
}
function contrastRatio(a, b) {
  const ca = typeof a === "string" ? parseHex(a) : a;
  const cb = typeof b === "string" ? parseHex(b) : b;
  if (!ca || !cb) return NaN;
  const [hi, lo] = [luminance(ca), luminance(cb)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
var isLargeText = (px, weight = 400) => px >= 24 || px >= 18.66 && weight >= 700;
var wcagTextMinimum = (px, weight = 400, level = "AA") => isLargeText(px, weight) ? level === "AA" ? 3 : 4.5 : level === "AA" ? 4.5 : 7;
function apcaLc(text, ground) {
  const t = typeof text === "string" ? parseHex(text) : text;
  const g = typeof ground === "string" ? parseHex(ground) : ground;
  if (!t || !g) return NaN;
  const y = (c) => {
    const raw = 0.2126729 * c.r ** 2.4 + 0.7151522 * c.g ** 2.4 + 0.072175 * c.b ** 2.4;
    return raw > 0.022 ? raw : raw + (0.022 - raw) ** 1.414;
  };
  const yt = y(t);
  const yb = y(g);
  if (Math.abs(yb - yt) < 5e-4) return 0;
  if (yb > yt) {
    const sapc2 = (yb ** 0.56 - yt ** 0.57) * 1.14;
    return sapc2 < 0.1 ? 0 : (sapc2 - 0.027) * 100;
  }
  const sapc = (yb ** 0.65 - yt ** 0.62) * 1.14;
  return sapc > -0.1 ? 0 : (sapc + 0.027) * 100;
}
function apcaMinimum(px, weight = 400) {
  const bold = weight >= 600;
  if (px >= 36 || px >= 24 && bold) return 45;
  if (px >= 24 || px >= 18 && bold) return 60;
  if (px >= 16 || px >= 14 && bold) return 75;
  return 90;
}
function toOklch(input) {
  const c = typeof input === "string" ? parseHex(input) : input;
  if (!c) return { l: NaN, c: NaN, h: NaN };
  const r = toLinear(c.r), g = toLinear(c.g), b = toLinear(c.b);
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  const chroma = Math.hypot(A, B);
  const hue = Math.atan2(B, A) * 180 / Math.PI;
  return { l: L, c: chroma, h: chroma < 1e-4 ? 0 : (hue + 360) % 360 };
}
function fromOklchRaw({ l, c, h }) {
  const hr = h * Math.PI / 180;
  const A = c * Math.cos(hr), B = c * Math.sin(hr);
  const l_ = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m_ = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s_ = (l - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const r = 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_;
  const g = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_;
  const b = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_;
  const enc = (v) => v < 0 ? -toGamma(-v) : toGamma(v);
  return { r: enc(r), g: enc(g), b: enc(b) };
}
var inGamut = (c, eps = 1e-4) => [c.r, c.g, c.b].every((v) => v >= -eps && v <= 1 + eps);
function fromOklch(color) {
  if (inGamut(fromOklchRaw(color))) return clamp01(fromOklchRaw(color));
  let lo = 0, hi = color.c;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(fromOklchRaw({ ...color, c: mid }))) lo = mid;
    else hi = mid;
  }
  return clamp01(fromOklchRaw({ ...color, c: lo }));
}
var clamp01 = (c) => ({ r: Math.min(1, Math.max(0, c.r)), g: Math.min(1, Math.max(0, c.g)), b: Math.min(1, Math.max(0, c.b)) });
function deltaE(a, b) {
  const x = toOklch(a), y = toOklch(b);
  const ax = x.c * Math.cos(x.h * Math.PI / 180), bx = x.c * Math.sin(x.h * Math.PI / 180);
  const ay = y.c * Math.cos(y.h * Math.PI / 180), by = y.c * Math.sin(y.h * Math.PI / 180);
  return Math.hypot(x.l - y.l, ax - ay, bx - by) * 100;
}
var RAMP_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
var RAMP_L = { 50: 0.975, 100: 0.945, 200: 0.89, 300: 0.82, 400: 0.73, 500: 0.64, 600: 0.555, 700: 0.475, 800: 0.395, 900: 0.32, 950: 0.24 };
function tonalRamp(name, hex) {
  const src = toOklch(hex);
  const anchor = RAMP_STEPS.reduce((best, s) => Math.abs(RAMP_L[s] - src.l) < Math.abs(RAMP_L[best] - src.l) ? s : best, RAMP_STEPS[0]);
  const steps = {};
  for (const s of RAMP_STEPS) {
    if (s === anchor) {
      steps[s] = toHex(parseHex(hex));
      continue;
    }
    const l = RAMP_L[s];
    const span = l > src.l ? 1 - src.l : src.l;
    const t = span > 0 ? Math.min(1, Math.abs(l - src.l) / span) : 1;
    const c = src.c * Math.cos(t * Math.PI / 2) ** 0.8;
    steps[s] = toHex(fromOklch({ l, c, h: src.h }));
  }
  return { name, source: toHex(parseHex(hex)), anchor, steps };
}
function harmonyOf(hexes) {
  const hues = hexes.map((h) => toOklch(h)).filter((c) => c.c >= 0.04).map((c) => Math.round(c.h));
  if (hues.length < 2) return { harmony: "monochrome", hues };
  const diff = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
  const pairs = [];
  for (let i = 0; i < hues.length; i++) for (let j = i + 1; j < hues.length; j++) pairs.push(diff(hues[i], hues[j]));
  const max = Math.max(...pairs);
  if (max <= 15) return { harmony: "monochrome", hues };
  if (max <= 60) return { harmony: "analogous", hues };
  if (hues.length === 2 && max >= 150) return { harmony: "complementary", hues };
  if (hues.length >= 3 && pairs.every((d) => d >= 90) && pairs.some((d) => d >= 150)) return { harmony: "split-complementary", hues };
  if (hues.length >= 3 && pairs.every((d) => Math.abs(d - 120) <= 25)) return { harmony: "triadic", hues };
  return { harmony: "custom", hues };
}

// src/lib/brand/fundamentals/space.ts
var CANDIDATES = [2, 3, 4, 5, 6, 8, 10, 12];
function detectSpacingScale(values, tol = 0.5) {
  const v = values.filter((x) => Number.isFinite(x) && x > 0).map((x) => Math.round(x * 2) / 2);
  if (!v.length) return { base: null, on_scale: 0, steps: [], off_scale: [] };
  const onBase = (x, b) => Math.abs(x - Math.round(x / b) * b) <= tol;
  const scored = CANDIDATES.map((b) => {
    const hit = v.filter((x) => onBase(x, b)).length / v.length;
    const chance = Math.min(1, (2 * tol + 1) / b);
    return { b, hit, score: chance >= 1 ? 0 : (hit - chance) / (1 - chance) };
  }).sort((a, c) => c.score - a.score || c.b - a.b);
  const top = scored[0].score;
  if (top < 0.3) return { base: null, on_scale: 0, steps: [], off_scale: [...new Set(v)].sort((a, b) => a - b) };
  const best = scored.filter((x) => x.score >= top - 0.05).sort((a, c) => c.hit - a.hit || c.b - a.b)[0];
  const on = v.filter((x) => onBase(x, best.b));
  return {
    base: best.b,
    on_scale: Math.round(best.hit * 1e3) / 10,
    steps: [...new Set(on.map((x) => Math.round(x / best.b) * best.b))].sort((a, b) => a - b),
    off_scale: [...new Set(v.filter((x) => !onBase(x, best.b)))].sort((a, b) => a - b)
  };
}
var SPACE_STEPS = ["3xs", "2xs", "xs", "s", "m", "l", "xl", "2xl", "3xl", "4xl"];
var SPACE_MULT = { "3xs": 0.25, "2xs": 0.5, xs: 0.75, s: 1, m: 1.5, l: 2, xl: 3, "2xl": 4, "3xl": 6, "4xl": 8 };
function buildSpaceScale(body, base = 8, density = "balanced") {
  const snap = (px) => Math.max(base / 2, Math.round(px / (px < base * 2 ? base / 2 : base)) * (px < base * 2 ? base / 2 : base));
  const steps = Object.fromEntries(SPACE_STEPS.map((s) => [s, snap(body * SPACE_MULT[s])]));
  const [d, p] = density === "airy" ? [7, 4] : density === "dense" ? [4.5, 2.5] : [6, 3.5];
  return { base, steps, section: { desktop: snap(body * d), phone: snap(body * p) } };
}

// src/lib/brand/fundamentals/type.ts
function recommendedTracking(px, caps = false) {
  if (caps) return round3(px <= 14 ? 0.1 : px <= 24 ? 0.08 : px <= 48 ? 0.06 : 0.04);
  return round3(-0.0223 + 0.185 * Math.exp(-0.1745 * px));
}
function recommendedLeading(px) {
  return round2(Math.min(1.6, Math.max(1.05, 1 + 8 / px)));
}
function leadingBand(px) {
  if (px >= 48) return { min: 0.9, max: 1.3 };
  if (px >= 32) return { min: 0.95, max: 1.35 };
  if (px >= 20) return { min: 1.1, max: 1.5 };
  return { min: 1.3, max: 1.8 };
}
function trackingBand(px, caps = false) {
  if (caps) return { min: 0.03, max: 0.25 };
  if (px >= 32) return { min: -0.06, max: 0.02 };
  if (px >= 20) return { min: -0.04, max: 0.03 };
  if (px >= 12) return { min: -0.02, max: 0.05 };
  return { min: 0, max: 0.08 };
}
var APCA_FONT = [
  [15, [777, 777, 777, 777, 777, 777, 777, 777, 777]],
  [20, [777, 777, 777, 777, 777, 777, 777, 777, 777]],
  [25, [777, 777, 777, 120, 120, 108, 96, 96, 96]],
  [30, [777, 777, 120, 108, 108, 96, 72, 72, 72]],
  [35, [777, 120, 108, 96, 72, 60, 48, 48, 48]],
  [40, [120, 108, 96, 60, 48, 42, 32, 32, 32]],
  [45, [108, 96, 72, 42, 32, 28, 24, 24, 24]],
  [50, [96, 72, 60, 32, 28, 24, 21, 21, 21]],
  [55, [80, 60, 48, 28, 24, 21, 18, 18, 18]],
  [60, [72, 48, 42, 24, 21, 18, 16, 16, 18]],
  [65, [68, 46, 32, 21.75, 19, 17, 15, 16, 18]],
  [70, [64, 44, 28, 19.5, 18, 16, 14.5, 16, 18]],
  [75, [60, 42, 24, 18, 16, 15, 14, 16, 18]],
  [80, [56, 38.25, 23, 17.25, 15.81, 14.81, 14, 16, 18]],
  [85, [52, 34.5, 22, 16.5, 15.625, 14.625, 14, 16, 18]],
  [90, [48, 32, 21, 16, 15.5, 14.5, 14, 16, 18]],
  [95, [45, 28, 19.5, 15.5, 15, 14, 13.5, 16, 18]],
  [100, [42, 26.5, 18.5, 15, 14.5, 13.5, 13, 16, 18]],
  [105, [39, 25, 18, 14.5, 14, 13, 12, 16, 18]],
  [110, [36, 24, 18, 14, 13, 12, 11, 16, 18]]
];
function apcaMinFontSize(lc, weight = 400) {
  const abs = Math.abs(lc);
  if (abs < 15) return null;
  const rowLc = Math.min(110, Math.floor(abs / 5) * 5);
  const row = APCA_FONT.find(([l]) => l === rowLc)?.[1];
  if (!row) return null;
  const col = Math.min(8, Math.max(0, Math.round(weight / 100) - 1));
  const px = row[col];
  return px >= 777 ? null : px;
}
var NAMED_RATIOS = [
  ["minor second", 1.067],
  ["major second", 1.125],
  ["minor third", 1.2],
  ["major third", 1.25],
  ["perfect fourth", 1.333],
  ["augmented fourth", 1.414],
  ["perfect fifth", 1.5],
  ["golden ratio", 1.618]
];
function fitTypeScale(sizes, body) {
  const px = [...new Set(sizes.filter((s) => s > 0 && Number.isFinite(s)).map((s) => Math.round(s * 4) / 4))].sort((a, b) => a - b);
  if (px.length < 3) return null;
  const base = body ?? mode(sizes.filter((s) => s >= 14 && s <= 20)) ?? px.find((s) => s >= 14) ?? px[0];
  let best = null;
  let bestMiss = Infinity;
  for (let r = 1.125; r <= 1.6185; r += 1e-3) {
    const lr = Math.log(r);
    let miss = 0, hits = 0;
    const placed = px.map((s) => {
      const exact = Math.log(s / base) / lr;
      const n = Math.round(exact);
      const share = Math.abs(exact - n);
      miss += share;
      if (share <= 0.2) hits++;
      return { px: s, step: n, off: round3(s / (base * r ** n) - 1) };
    });
    if (miss < bestMiss - 1e-9) {
      bestMiss = miss;
      best = { base, ratio: round3(r), nearest: nearestRatio(r), fit: round2(hits / px.length), sizes: placed };
    }
  }
  return best;
}
var nearestRatio = (r) => NAMED_RATIOS.reduce((a, b) => Math.abs(b[1] - r) < Math.abs(a[1] - r) ? b : a)[0];
var TYPE_STEPS = ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl"];
function buildTypeScale(base, ratio, phoneBase = Math.max(15, Math.min(base, 17))) {
  const phoneRatio = Math.max(1.125, Math.min(ratio, 1.2 + (ratio - 1.2) * 0.4));
  return TYPE_STEPS.map((name, i) => {
    const n = i - 2;
    const desktop = round1(Math.max(12, base * ratio ** n));
    const phone = round1(Math.max(12, phoneBase * phoneRatio ** n));
    const ref = Math.max(desktop, phone);
    return { name, phone, desktop, fluid: fluidClamp(phone, desktop), line_height: recommendedLeading(ref), tracking: recommendedTracking(ref) };
  });
}
function fluidClamp(minPx, maxPx, minVw = 360, maxVw = 1440) {
  const [lo, hi] = minPx <= maxPx ? [minPx, maxPx] : [maxPx, minPx];
  if (Math.abs(hi - lo) < 0.5) return `${round3(lo / 16)}rem`;
  const slope = (maxPx - minPx) / (maxVw - minVw);
  const intercept = minPx - slope * minVw;
  return `clamp(${round3(lo / 16)}rem, ${round3(intercept / 16)}rem + ${round3(slope * 100)}vw, ${round3(hi / 16)}rem)`;
}
var charsPerLine = (widthPx, fontPx, advanceEm = 0.5) => widthPx / (fontPx * advanceEm);
var mode = (xs) => {
  if (!xs.length) return void 0;
  const counts = /* @__PURE__ */ new Map();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
};
var round1 = (v) => Math.round(v * 10) / 10;
var round2 = (v) => Math.round(v * 100) / 100;
var round3 = (v) => Math.round(v * 1e3) / 1e3;

// src/lib/brand/fundamentals/index.ts
var isObj = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
var hexOf = (v) => typeof v === "string" && parseHex(v) ? v.toUpperCase().slice(0, 7) : null;
var num = (v) => typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && /^-?\d+(\.\d+)?(px)?$/.test(v.trim()) ? parseFloat(v) : null;
var r2 = (v) => Math.round(v * 100) / 100;
var mode2 = (xs) => {
  const counts = /* @__PURE__ */ new Map();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0];
};
var TEXT_PAIRS = [
  ["ink", "paper", "body"],
  ["ink", "surface", "body"],
  ["ink_muted", "paper", "body"],
  ["ink_muted", "surface", "body"],
  ["on_accent", "accent", "label"],
  ["on_accent", "accent_dark", "label"],
  ["on_night", "night", "body"],
  ["accent_on_night", "night", "label"]
];
function analyzeKit(kit) {
  const k = isObj(kit) ? kit : {};
  const findings = [];
  const add = (f) => findings.push(f);
  const palette = isObj(k.palette) ? k.palette : {};
  const typography = isObj(k.typography) ? k.typography : {};
  const page = isObj(k.page) ? k.page : isObj(k.spec) ? { ...isObj(k.spec.page) ? k.spec.page : {}, type: k.spec.type, layout: k.spec.layout } : {};
  const color = colorSystem(palette, add);
  const type = typeSystem(typography, page, add);
  const space = spaceSystem(page, type.base, k.style?.density, add);
  const layout = layoutSystem(page, space);
  const display = isObj(typography.display) ? typography.display : {};
  const body = isObj(typography.body) ? typography.body : {};
  if (display.family && display.family === body.family && num(display.weight) !== null && num(body.weight) !== null && Math.abs(display.weight - body.weight) < 200) {
    add({ id: "hier-display-weight", area: "hierarchy", severity: "info", where: "typography.display.weight", message: `Display and body are one family at weights ${display.weight} and ${body.weight}: headlines lean on size alone.`, fix: "Keep headlines at least two scale steps above body, or open the weight gap to 200 or more." });
  }
  if (num(body.weight) !== null && body.weight <= 300) {
    add({ id: "weight-thin-body", area: "typography", severity: "warn", where: "typography.body.weight", message: `Body weight ${body.weight} is thin for running text; APCA needs 24px at weight 300 for body contrast.`, fix: "Use 400 for body text; keep light weights for display sizes." });
  }
  const counts = { error: 0, warn: 0, info: 0 };
  for (const f of findings) counts[f.severity]++;
  return { findings, system: { color, type, space, layout }, counts };
}
function colorSystem(palette, add) {
  const role = (r) => hexOf(palette[r]);
  const paper = role("paper") ?? "#FFFFFF";
  const ink = role("ink") ?? "#111111";
  const accent = role("accent") ?? ink;
  const pairs = [];
  const accentRamp = tonalRamp("accent", accent);
  const accentDark = role("accent_dark");
  const fillFor = (label, maxSteps) => [accent, ...accentDark ? [accentDark] : [], ...luminanceOrder(accentRamp, toOklch(label).l > 0.5 ? "darker" : "lighter").slice(0, maxSteps)].find((h) => contrastRatio(label, h) >= 4.5);
  const givenOn = role("on_accent");
  const preferred = givenOn ?? (contrastRatio("#FFFFFF", accent) >= contrastRatio(ink, accent) ? "#FFFFFF" : ink);
  const keep = fillFor(preferred, 3);
  const on_accent = keep ? preferred : bestOn(accent, [preferred, "#FFFFFF", ink, "#111111"]);
  const accent_fill = keep ?? fillFor(on_accent, 10) ?? accent;
  const fixFor = (t, bg, fg) => t === "on_accent" && bg === accent ? `Keep ${on_accent} as the label and fill small-text buttons with ${accent_fill} (${r2(contrastRatio(on_accent, accent_fill))}:1); the brand color stays for large type and shapes.` : suggestText(bg, [fg, ink, paper, "#FFFFFF", "#111111"]);
  for (const [t, g, use] of TEXT_PAIRS) {
    const fg = role(t), bg = role(g);
    if (!fg || !bg) continue;
    const ratio = r2(contrastRatio(fg, bg));
    const apca = Math.round(apcaLc(fg, bg) * 10) / 10;
    const passes = ratio >= 7 ? "AAA" : ratio >= 4.5 ? "AA" : ratio >= 3 ? "AA-large" : "fail";
    pairs.push({ text: t, ground: g, fg, bg, ratio, apca, min_px: apcaMinFontSize(apca, use === "body" ? 400 : 600), passes });
    const where = `palette.${t} on palette.${g}`;
    if (ratio < 3) {
      add({ id: "contrast-pair", area: "contrast", severity: "error", where, message: `${fg} on ${bg} is ${ratio}:1, under WCAG's 3:1 floor even for large text.`, fix: fixFor(t, bg, fg) });
    } else if (ratio < 4.5 && use !== "large") {
      add({ id: "contrast-pair", area: "contrast", severity: use === "body" ? "error" : "warn", where, message: `${fg} on ${bg} is ${ratio}:1: fine at 24px+ (or 18.66px bold), fails WCAG AA for ${use === "body" ? "body text" : "16px labels"}.`, fix: fixFor(t, bg, fg) });
    } else if (use === "body" && Math.abs(apca) < 60) {
      add({ id: "contrast-apca", area: "contrast", severity: "warn", where, message: `${fg} on ${bg} passes WCAG 2 (${ratio}:1) but reads weak (APCA Lc ${apca}); dark grounds especially.`, fix: `Keep it to text ${apcaMinFontSize(apca, 400) ?? "\u226536"}px or larger, or lift the contrast.` });
    }
  }
  const grounds = [paper, role("surface")].filter((h) => Boolean(h));
  const muted = role("ink_muted");
  const neutral = tonalRamp("neutral", muted ?? ink);
  const mutedOk = (h) => grounds.every((g) => contrastRatio(h, g) >= 4.5);
  const ink_muted_text = muted && mutedOk(muted) ? muted : luminanceOrder(neutral, toOklch(paper).l > 0.5 ? "darker" : "lighter").find(mutedOk) ?? ink;
  const accentOnPaper = contrastRatio(accent, paper);
  const darker = luminanceOrder(accentRamp, toOklch(paper).l > 0.5 ? "darker" : "lighter");
  const accent_text = accentOnPaper >= 4.5 ? accent : [...accentDark ? [accentDark] : [], ...darker].find((h) => contrastRatio(h, paper) >= 4.5) ?? ink;
  if (accentOnPaper < 4.5) {
    add({ id: "contrast-accent-text", area: "contrast", severity: "warn", where: "palette.accent on palette.paper", message: `The accent ${accent} is ${r2(accentOnPaper)}:1 on paper: right for fills and large type, too light for links or small accent text.`, fix: `Use ${accent_text} (${accent_text === accentDark ? "the brand's accent_dark" : "the accent ramp's nearest passing step"}) for accent text under 24px.` });
  }
  if (contrastRatio(accent, paper) < 3 && !role("accent_dark")) {
    add({ id: "contrast-nontext", area: "contrast", severity: "warn", where: "palette.accent", message: `An accent fill is ${r2(contrastRatio(accent, paper))}:1 on paper; a button with no border or dark label reads as a smudge.`, fix: "Give accent buttons a dark label or border, or set palette.accent_dark." });
  }
  const chromatic = ["accent", "accent_secondary", "highlight", "positive"].map(role).filter((h) => Boolean(h) && toOklch(h).c >= 0.06);
  const { harmony } = harmonyOf([...new Set(chromatic)]);
  if (new Set(chromatic.map((h) => Math.round(toOklch(h).h / 20))).size > 3) {
    add({ id: "color-accent-count", area: "color", severity: "info", where: "palette", message: `${chromatic.length} chromatic roles compete; hierarchy reads best with one accent, one secondary and one highlight.`, fix: "Lead with the accent in about 10% of the area; keep the others for data and moments." });
  }
  const border = role("border");
  if (border && contrastRatio(border, paper) < 1.1) {
    add({ id: "color-border-invisible", area: "color", severity: "warn", where: "palette.border", message: `palette.border ${border} is ${r2(contrastRatio(border, paper))}:1 on paper: it won't show.`, fix: "Use a border at least 1.15:1 on paper (APCA Lc 15 is the floor for a visible divider)." });
  }
  const night = role("night");
  if (night && !role("on_night")) {
    add({ id: "color-night-no-text", area: "color", severity: "warn", where: "palette.on_night", message: "There's a dark ground (night) but no text color for it.", fix: suggestText(night, [paper, "#FFFFFF"]) });
  }
  const ramps = [accentRamp];
  for (const r of ["accent_secondary", "highlight"]) {
    const h = role(r);
    if (h && toOklch(h).c >= 0.04) ramps.push(tonalRamp(r, h));
  }
  ramps.push(tonalRamp("neutral", ink));
  return { accent_text, on_accent, accent_fill, ink_muted_text, harmony, ramps, pairs };
}
function luminanceOrder(ramp, dir) {
  const i = RAMP_STEPS.indexOf(ramp.anchor);
  const steps = dir === "darker" ? RAMP_STEPS.slice(i + 1) : RAMP_STEPS.slice(0, i).reverse();
  return steps.map((s) => ramp.steps[s]);
}
function bestOn(bg, candidates) {
  const ok = candidates.filter((c) => Boolean(c && parseHex(c)));
  return ok.reduce((a, b) => contrastRatio(b, bg) > contrastRatio(a, bg) ? b : a, ok[0]).toUpperCase();
}
function suggestText(bg, candidates) {
  const pick = bestOn(bg, candidates);
  const r = r2(contrastRatio(pick, bg));
  return r >= 4.5 ? `Use ${pick} for text on ${bg} (${r}:1).` : `No kit color reaches 4.5:1 on ${bg}; keep it to 24px+ type or darken the ground.`;
}
function measuredStyles(page) {
  const rows = Array.isArray(page.type) ? page.type : [];
  return rows.flatMap((row) => {
    if (!isObj(row)) return [];
    const size = isObj(row.size) ? row.size : { desktop: row.size ?? row.px ?? row.size_px };
    const px = num(size.desktop) ?? num(size.d) ?? num(size.lg);
    if (!px || px < 6 || px > 400) return [];
    const phone = num(size.phone) ?? num(size.mobile);
    let lh = num(row.line_height) ?? num(row.lh);
    if (lh !== null && lh > 4) lh = lh / px;
    const tracking = num(row.tracking) ?? (num(row.tracking_px) !== null ? num(row.tracking_px) / px : null);
    const text = `${row.role ?? ""} ${row.case ?? ""} ${row.transform ?? ""}`;
    const caps = /\b(upper(case)?|caps|all.caps)\b/i.test(text) || row.case === "upper";
    return [{ role: String(row.role ?? "?").slice(0, 80), px, phone, lh, tracking, weight: num(row.weight), caps }];
  });
}
function typeSystem(typography, page, add) {
  const faces = [["display", 40], ["body", 17]];
  for (const [face, px] of faces) {
    const f = isObj(typography[face]) ? typography[face] : null;
    if (!f) continue;
    const caps = f.case === "uppercase" || f.case === "upper";
    const lh = num(f.line_height);
    const band = leadingBand(px);
    if (lh !== null && lh < band.min - 0.15) add({ id: "lh-collide", area: "typography", severity: "error", where: `typography.${face}.line_height`, message: `${face} line height ${lh} collides ascenders and descenders on multi-line text.`, fix: `Use ${recommendedLeading(px)} (about ${band.min}\u2013${band.max} at ${face} sizes).` });
    else if (lh !== null && (lh < band.min || lh > band.max)) add({ id: "lh-range", area: "typography", severity: "warn", where: `typography.${face}.line_height`, message: `${face} line height ${lh} sits outside ${band.min}\u2013${band.max} for ${face} sizes.`, fix: `Use about ${recommendedLeading(px)}; leading tightens as size grows.` });
    const tr = num(f.tracking);
    const tb = trackingBand(px, caps);
    if (tr !== null && Math.abs(tr) > 0.3) add({ id: "track-unit", area: "typography", severity: "error", where: `typography.${face}.tracking`, message: `${face} tracking ${tr} reads as px written into an em field.`, fix: `Tracking is in em: ${tr}px at ${px}px type is ${r2(tr / px)}em; about ${recommendedTracking(px, caps)}em is typical.` });
    else if (tr !== null && tr < -0.06) add({ id: "track-collide", area: "typography", severity: "error", where: `typography.${face}.tracking`, message: `${face} tracking ${tr}em makes glyphs touch.`, fix: `Use about ${recommendedTracking(px, caps)}em.` });
    else if (tr !== null && (tr < tb.min || tr > tb.max)) add({ id: caps ? "track-caps" : "track-size", area: "typography", severity: "warn", where: `typography.${face}.tracking`, message: `${face} tracking ${tr}em is outside ${tb.min}\u2013${tb.max}em for ${caps ? "all caps" : `${px}px text`}.`, fix: caps ? "All caps need 0.05\u20130.12em of open tracking." : `Use about ${recommendedTracking(px)}em: display tightens, small text opens.` });
  }
  for (const [name, r] of Object.entries(isObj(typography.roles) ? typography.roles : {})) {
    if (!isObj(r)) continue;
    const caps = r.case === "upper" || r.case === "uppercase";
    const tr = num(r.tracking);
    if (caps && tr !== null && tr < 0.03) add({ id: "track-caps", area: "typography", severity: "warn", where: `typography.roles.${name}.tracking`, message: `${name} is set in caps with ${tr}em tracking: caps crowd without air.`, fix: `Use ${recommendedTracking(13, true)}em for small caps labels.` });
  }
  const styles = measuredStyles(page);
  for (const s of styles) {
    const band = leadingBand(s.px);
    if (s.lh !== null && (s.lh < band.min - 0.1 || s.lh > band.max + 0.1)) add({ id: "lh-measured", area: "typography", severity: "info", where: `page.type "${s.role}"`, message: `Measured ${s.px}px at line height ${r2(s.lh)} (band ${band.min}\u2013${band.max}).`, fix: `For new pieces at this size use about ${recommendedLeading(s.px)}.` });
    if (s.px < 12 && !/legal|fine|foot|copyright|disclaim/i.test(s.role)) add({ id: "type-min-size", area: "typography", severity: "warn", where: `page.type "${s.role}"`, message: `${s.px}px is below the 12px floor for readable text.`, fix: "Use 12px minimum for any readable text; 16px for body." });
  }
  const inBody = (re) => styles.filter((s) => re.test(s.role) && s.px >= 13 && s.px <= 24 && !/caps|label|nav|button|eyebrow/i.test(s.role));
  const bodyStyle = inBody(/body|paragraph/i).length ? inBody(/body|paragraph/i) : inBody(/copy|text|lede|lead|intro/i);
  const measuredBody = bodyStyle.length ? mode2(bodyStyle.map((s) => s.px)) ?? null : null;
  if (measuredBody !== null && measuredBody < 16) {
    add({ id: "type-min-body", area: "typography", severity: "info", where: "page.type", message: `The brand's largest body copy is ${measuredBody}px; long reading wants 16px or more.`, fix: "Keep running text in new pieces at 16px+; UI labels can stay smaller." });
  }
  const bySize = [...styles].sort((a, b) => b.px - a.px);
  const largest = bySize[0];
  if (largest && bySize[1] && largest.px / bySize[1].px < 1.2 && (largest.weight ?? 0) - (bySize[1].weight ?? 0) < 200) {
    add({ id: "hier-dominant", area: "hierarchy", severity: "info", where: "page.type", message: `The two largest styles (${largest.px}px and ${bySize[1].px}px) are close: no single element dominates.`, fix: "Give each view one dominant headline at least 1.25\xD7 the next level." });
  }
  const fit = fitTypeScale(styles.map((s) => s.px), measuredBody ?? void 0);
  const base = measuredBody ?? 17;
  const top = Math.max(0, ...styles.map((s) => s.px));
  const measured = styles.length >= 3 && top > base * 1.5;
  const ratio = measured ? Math.round(Math.min(1.5, Math.max(1.125, (top / base) ** (1 / 6))) * 1e3) / 1e3 : 1.25;
  const useFit = measured;
  if (styles.length >= 4 && fit && fit.fit < 0.6) {
    add({ id: "scale-inconsistent", area: "typography", severity: "info", where: "page.type", message: `The measured sizes follow no single ratio (best ${fit.ratio}, ${Math.round(fit.fit * 100)}% on scale).`, fix: `New pieces use a ${ratio} scale from ${base}px to the brand's largest headline; the brand's named styles still win where they apply.` });
  }
  const capsRows = styles.filter((s) => s.caps && s.tracking !== null);
  for (const s of capsRows) if (s.tracking < 0.03) add({ id: "track-caps", area: "typography", severity: "info", where: `page.type "${s.role}"`, message: `Caps at ${s.px}px with ${r2(s.tracking)}em tracking read crowded.`, fix: `Use ${recommendedTracking(s.px, true)}em.` });
  return {
    source: useFit ? "measured" : "default",
    fit,
    base,
    ratio,
    steps: buildTypeScale(base, ratio),
    measure: { min: 45, ideal: 66, max: 75 },
    caps_tracking: recommendedTracking(13, true)
  };
}
var SPACE_KEY = /pad|margin|gap|gutter|space|spacing|pitch|inset/i;
function spacingValues(v, keyHit = false, out = []) {
  if (typeof v === "number") {
    if (keyHit && v > 0 && v <= 320) out.push(v);
  } else if (Array.isArray(v)) v.forEach((x) => spacingValues(x, keyHit, out));
  else if (isObj(v)) for (const [k, x] of Object.entries(v)) spacingValues(x, keyHit || SPACE_KEY.test(k), out);
  return out;
}
function spaceSystem(page, body, density, add) {
  const values = spacingValues({ layout: page.layout, components: page.components }).filter((v) => v >= 2);
  const fit = values.length >= 6 ? detectSpacingScale(values) : null;
  const base = fit?.base && fit.on_scale >= 75 && [4, 5, 6, 8, 10, 12].includes(fit.base) ? fit.base : 8;
  if (fit && fit.base === null) add({ id: "space-no-system", area: "spacing", severity: "info", where: "page.layout", message: `The brand's measured spacing (${values.length} values) follows no base unit.`, fix: "New pieces snap spacing to an 8px base." });
  else if (fit && fit.on_scale < 75) add({ id: "space-off-scale", area: "spacing", severity: "info", where: "page.layout", message: `Only ${fit.on_scale}% of measured spacing sits on a ${fit.base}px grid.`, fix: `New pieces snap spacing to ${base}px.` });
  const d = density === "airy" || density === "dense" ? density : "balanced";
  return { ...buildSpaceScale(body, base, d), fit };
}
function layoutSystem(page, space) {
  const l = isObj(page.layout) ? page.layout : {};
  const container = num(l.container_max) ?? num(l.container) ?? num(l.max_width) ?? null;
  const margin = isObj(l.page_margin) ? l.page_margin : {};
  const columns = num(l.columns);
  return {
    container,
    columns: { desktop: columns && columns >= 4 ? columns : 12, tablet: Math.min(8, columns && columns >= 4 ? columns : 12), phone: num(l.columns_phone) ?? 4 },
    gutter: num(l.gutter) ?? space.steps.l,
    margin: { desktop: num(margin.desktop) ?? num(l.page_margin) ?? space.steps["2xl"], phone: num(margin.phone) ?? space.steps.s }
  };
}
function fundamentalsCss(system) {
  const lines = [];
  for (const ramp of system.color.ramps) for (const s of RAMP_STEPS) lines.push(`  --ramp-${ramp.name.replace(/_/g, "-")}-${s}: ${ramp.steps[s]};`);
  lines.push(`  --accent-text: ${system.color.accent_text};`, `  --accent-fill: ${system.color.accent_fill};`, `  --on-accent-fill: ${system.color.on_accent};`, `  --ink-muted-text: ${system.color.ink_muted_text};`);
  for (const step of system.type.steps) {
    lines.push(`  --step-${step.name}: ${step.fluid};`, `  --step-${step.name}-lh: ${step.line_height};`, `  --step-${step.name}-tracking: ${step.tracking}em;`);
  }
  lines.push(`  --caps-tracking: ${system.type.caps_tracking}em;`, `  --measure: ${system.type.measure.ideal}ch;`, `  --measure-max: ${system.type.measure.max}ch;`);
  for (const [name, px] of Object.entries(system.space.steps)) lines.push(`  --space-${name}: ${px}px;`);
  lines.push(`  --section-pad: clamp(${system.space.section.phone}px, ${(system.space.section.desktop / 14.4).toFixed(2)}vw, ${system.space.section.desktop}px);`);
  return `:root {
${lines.join("\n")}
}
`;
}
var FUNDAMENTALS_USE = "Design fundamentals derived from this brand. The brand's own measured styles, colors and components win wherever they exist; use this system for everything they don't cover. Text: only pairs listed as passing, ink_muted_text for captions and meta, accent_text for links and accent words under 24px, accent_fill with on_accent for small-text buttons. Type: sizes from steps (one dominant headline per view, at least 1.25x the next level; three or four sizes per view), each step's line height and tracking, caps at caps_tracking, body at 16px+ held to the measure. Space: gaps from space.steps, tighter inside a group than between groups, more above a heading than below; sections at space.section. Tints and shades come from ramps, never ad-hoc opacity.";
function fundamentalsBrief(kit) {
  const { system, findings } = analyzeKit(kit);
  const { pairs, ramps, ...color } = system.color;
  return {
    use: FUNDAMENTALS_USE,
    color: {
      ...color,
      pairs: pairs.map((p) => ({ text: p.text, ground: p.ground, ratio: p.ratio, passes: p.passes })),
      ramps: Object.fromEntries(ramps.map((r) => [r.name, r.steps]))
    },
    type: { base: system.type.base, ratio: system.type.ratio, source: system.type.source, steps: system.type.steps, measure: system.type.measure, caps_tracking: system.type.caps_tracking },
    space: { base: system.space.base, steps: system.space.steps, section: system.space.section },
    layout: system.layout,
    ...findings.some((f) => f.severity !== "info") ? { watch: findings.filter((f) => f.severity !== "info").map(({ id, where, message, fix }) => ({ id, where, message, fix })) } : {}
  };
}
function fundamentalsMd(report) {
  const { system: s, findings } = report;
  const out = [
    "Derived from this brand by the engine (our recipe), for everything the measured styles above don't cover. The brand's own styles win wherever they apply. tokens.css carries every value as --ramp-*, --step-*, --space-* and --measure.",
    "",
    "**Color.** Text only on these pairs:",
    "",
    "| Text | Ground | Ratio | WCAG | APCA Lc |",
    "|---|---|---|---|---|",
    ...s.color.pairs.map((p) => `| ${p.text} ${p.fg} | ${p.ground} ${p.bg} | ${p.ratio}:1 | ${p.passes === "fail" ? "fails" : p.passes} | ${p.apca} |`),
    "",
    `- Links and accent words under 24px: ${s.color.accent_text}.`,
    `- Captions and meta: ${s.color.ink_muted_text}.`,
    `- Buttons and chips with 16px labels: ${s.color.on_accent} on ${s.color.accent_fill}.`,
    "- Tints and shades come from the ramps (--ramp-<name>-50\u2026950, the brand's own color held exactly at its step), never from opacity over a photo or ad-hoc mixing.",
    "",
    `**Type scale.** ${s.type.base}px body, ratio ${s.type.ratio} (${s.type.source === "measured" ? "spanning the brand's own body to its largest measured headline" : "default: the brand's sizes weren't measured"}). One dominant headline per view, at least 1.25\xD7 the next level; three or four sizes per view.`,
    "",
    "| Step | Phone | Desktop | Line height | Tracking |",
    "|---|---|---|---|---|",
    ...s.type.steps.map((t) => `| ${t.name} | ${t.phone}px | ${t.desktop}px | ${t.line_height} | ${t.tracking}em |`),
    "",
    `- Body copy 16px or more, held to ${s.type.measure.min}\u2013${s.type.measure.max} characters a line (${s.type.measure.ideal} ideal).`,
    `- All caps get ${s.type.caps_tracking}em of tracking; lowercase display tightens, small text opens (the table).`,
    "",
    `**Space.** ${s.space.base}px base: ${Object.entries(s.space.steps).map(([k, v]) => `${k} ${v}`).join(", ")}. Sections ${s.space.section.desktop}px desktop, ${s.space.section.phone}px phone. Tighter inside a group than between groups; more space above a heading than below it.`,
    "",
    `**Grid.** ${s.layout.columns.desktop} columns desktop, ${s.layout.columns.tablet} tablet, ${s.layout.columns.phone} phone; ${s.layout.gutter}px gutter; ${s.layout.margin.desktop}px page margin desktop, ${s.layout.margin.phone}px phone${s.layout.container ? `; ${s.layout.container}px container` : ""}. Edges line up on columns; few distinct left edges per section.`
  ];
  const watch = findings.filter((f) => f.severity !== "info");
  if (watch.length) out.push("", "**Watch.**", "", ...watch.map((f) => `- ${f.message}${f.fix ? ` ${f.fix}` : ""}`));
  return out.join("\n");
}
export {
  FUNDAMENTALS_USE,
  NAMED_RATIOS,
  RAMP_STEPS,
  SPACE_STEPS,
  TYPE_STEPS,
  analyzeKit,
  apcaLc,
  apcaMinFontSize,
  apcaMinimum,
  buildSpaceScale,
  buildTypeScale,
  charsPerLine,
  contrastRatio,
  deltaE,
  detectSpacingScale,
  fitTypeScale,
  fluidClamp,
  fromOklch,
  fromOklchRaw,
  fundamentalsBrief,
  fundamentalsCss,
  fundamentalsMd,
  harmonyOf,
  isLargeText,
  leadingBand,
  luminance,
  nearestRatio,
  parseHex,
  recommendedLeading,
  recommendedTracking,
  toHex,
  toOklch,
  tonalRamp,
  trackingBand,
  wcagTextMinimum
};
