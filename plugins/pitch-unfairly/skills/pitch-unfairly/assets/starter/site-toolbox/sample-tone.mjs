// The sample band wears the Pitch Unfairly house palette (cream, ink, magenta,
// periwinkle, yellow, cyan, pink) on every provider's page. To read instantly as
// "not this provider's site", its band color and its pill must stay away from the
// provider's own hues. sampleTone(brand) picks them from a brand kit (brand.json):
//   band: yellow, cyan or pink, whichever is farthest in hue from every saturated
//         color in the provider's palette (yellow wins ties: it's the house default);
//   pill: magenta, unless a provider color is within 35° of it, then periwinkle,
//         and if that clashes too, ink.
// Put the result on the band: data-sample-tone="cyan" data-sample-pill="periwinkle".

const HOUSE = { yellow: '#ffd866', cyan: '#81ebeb', pink: '#f5a7c4', magenta: '#c92a89', periwinkle: '#697ffc' };

/** Hue (0-360), saturation and lightness (0-1) of a #rrggbb color. */
export function hsl(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? '').trim());
  if (!m) return null;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

const gap = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

/** The provider's hues that a reader would recognize: saturated, neither near-white nor near-black. */
export function brandHues(brand) {
  const p = brand?.palette ?? {};
  const hexes = [p.accent, p.accent_dark, p.accent_secondary, p.highlight, p.night, p.positive, ...(p.extras ?? []).map((e) => e?.hex)];
  return hexes.map(hsl).filter((c) => c && c.s >= 0.3 && c.l >= 0.08 && c.l <= 0.92).map((c) => c.h);
}

export function sampleTone(brand) {
  const hues = brandHues(brand);
  const far = (hex) => (hues.length ? Math.min(...hues.map((h) => gap(h, hsl(hex).h))) : 180);
  const bands = ['yellow', 'cyan', 'pink'].map((tone) => ({ tone, d: far(HOUSE[tone]) }));
  const tone = bands.reduce((best, b) => (b.d > best.d + 10 ? b : best)).tone;
  const pill = far(HOUSE.magenta) >= 35 ? 'magenta' : far(HOUSE.periwinkle) >= 35 ? 'periwinkle' : 'ink';
  return { tone, pill };
}
