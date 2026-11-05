// Text contrast, as WCAG measures it: the audit fails text that is hard to
// read against what's behind it (an accent phrase in a pale tint on the
// accent color, muted captions on a dark slide). These run inside the page,
// so each is a plain function with no imports; the audit injects them.
//
// This is the one contrast helper: decks (audit.mjs, deck-checks.mjs), sites
// (site/fundamentals.mjs) and the collateral, social and longform checks all
// inject contrastScript(). Thresholds and sources: unfairly-app
// docs/brand/design-fundamentals.md (WCAG 2.2 is the standard of record; APCA
// 0.0.98G-4g is a second opinion that only warns).

/** A computed CSS color (`rgb()`, `rgba()`, or `color(srgb …)`) as 0-255 channels and alpha, or null. */
export function parseColor(value) {
  if (!value) return null;
  let m = value.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r: +m[1], g: +m[2], b: +m[3], a };
  }
  m = value.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/);
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r: +m[1] * 255, g: +m[2] * 255, b: +m[3] * 255, a };
  }
  return null;
}

/** `top` painted over an opaque `bottom`. */
export function blend(top, bottom) {
  const a = top.a;
  return { r: top.r * a + bottom.r * (1 - a), g: top.g * a + bottom.g * (1 - a), b: top.b * a + bottom.b * (1 - a), a: 1 };
}

/** Relative luminance of an opaque color (WCAG 2.2). */
export function luminance(c) {
  const lin = (v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

/** Contrast ratio between two opaque colors, 1 to 21. */
export function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The ratio a run of text needs: 3:1 for large text, 4.5:1 for everything else. */
export function contrastFloor(sizePx, weight, large) {
  return sizePx >= large.px || (weight >= 700 && sizePx >= large.boldPx) ? 3 : 4.5;
}

/**
 * Any CSS color as 0-255 channels and alpha: parseColor's formats directly,
 * anything else (oklch(), oklab(), color-mix(), named colors) by painting it
 * to one canvas pixel. In Node, only parseColor's formats.
 */
export function toRgb(value) {
  const direct = parseColor(value);
  if (direct || typeof document === 'undefined' || !value || value === 'transparent') return direct;
  const cv = (window.__contrastCanvas ??= Object.assign(document.createElement('canvas'), { width: 1, height: 1 }));
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.clearRect(0, 0, 1, 1);
  g.fillStyle = '#000';
  g.fillStyle = value;
  g.fillRect(0, 0, 1, 1);
  const [r, gr, b, a] = g.getImageData(0, 0, 1, 1).data;
  return a ? { r, g: gr, b, a: a / 255 } : null;
}

/**
 * APCA lightness contrast Lc (SAPC-APCA 0.0.98G-4g), signed: positive for dark
 * text on light, negative for light on dark. Opaque colors, 0-255 channels.
 */
export function apcaLc(text, ground) {
  const y = (c) => {
    const raw = 0.2126729 * (c.r / 255) ** 2.4 + 0.7151522 * (c.g / 255) ** 2.4 + 0.072175 * (c.b / 255) ** 2.4;
    return raw > 0.022 ? raw : raw + (0.022 - raw) ** 1.414;
  };
  const yt = y(text);
  const yb = y(ground);
  if (Math.abs(yb - yt) < 0.0005) return 0;
  if (yb > yt) {
    const sapc = (yb ** 0.56 - yt ** 0.57) * 1.14;
    return sapc < 0.1 ? 0 : (sapc - 0.027) * 100;
  }
  const sapc = (yb ** 0.65 - yt ** 0.62) * 1.14;
  return sapc > -0.1 ? 0 : (sapc + 0.027) * 100;
}

/** The |Lc| APCA's readability guidance asks of text at this size and weight: 90 for small body, 75 body, 60 content, 45 headlines. */
export function apcaMinimum(px, weight) {
  const bold = weight >= 600;
  if (px >= 36 || (px >= 24 && bold)) return 45;
  if (px >= 24 || (px >= 18 && bold)) return 60;
  if (px >= 16 || (px >= 14 && bold)) return 75;
  return 90;
}

/** The helpers as a script that installs them in a page as window[name]. */
export function contrastScript(name = '__contrast') {
  const fns = { parseColor, toRgb, blend, luminance, contrastRatio, contrastFloor, apcaLc, apcaMinimum };
  return `(() => { ${Object.values(fns).join('\n')}\nwindow.${name} = { ${Object.keys(fns).join(', ')} }; })();`;
}
