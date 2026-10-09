// Text contrast, as WCAG measures it: the audit fails text that is hard to
// read against what's behind it (an accent phrase in a pale tint on the
// accent color, muted captions on a dark slide). These run inside the page,
// so each is a plain function with no imports; the audit injects them.

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

/** Relative luminance of an opaque color. */
export function luminance(c) {
  const lin = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
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
