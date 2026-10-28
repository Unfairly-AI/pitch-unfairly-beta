// The collateral checks' pure rules, shared by the page check (check.js, in the browser) and the tests.

/** "rgb(207, 184, 124)" -> "#cfb87c"; null for transparent. */
export function hexOf(css) {
  if (!css) return null;
  if (/^#[0-9a-f]{6}$/i.test(css)) return css.toLowerCase();
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(css);
  if (!m || m[4] === '0') return null;
  return `#${[m[1], m[2], m[3]].map((n) => (+n).toString(16).padStart(2, '0')).join('')}`;
}

/** The colors a brand allows: every palette role, extra and data color in brand.json, plus the set's own neutrals. */
export function allowedColors(kit, extra = []) {
  const p = kit?.palette ?? {};
  const out = new Set();
  for (const [k, v] of Object.entries(p)) if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) out.add(v.toLowerCase());
  for (const e of p.extras ?? []) if (e?.hex) out.add(e.hex.toLowerCase());
  for (const h of p.data ?? []) if (typeof h === 'string') out.add(h.toLowerCase());
  for (const h of extra) out.add(String(h).toLowerCase());
  ['#000000', '#ffffff'].forEach((h) => out.add(h));
  return out;
}

export function paletteProblems(used, allowed) {
  const off = [...new Set(used)].filter((h) => h && !allowed.has(h));
  return off.length ? [`colors outside the brand palette: ${off.join(', ')}`] : [];
}

/**
 * Accent limits: brands often cap how many accent colors one design may use, per variant
 * (a school's research pieces take one accent; its clinic pieces may combine two).
 * rule = { colors: [hex], max: n, max_by_variant: { name: n } }. Textures count by the color they name.
 */
export function accentProblems(used, rule, variant) {
  if (!rule?.colors?.length) return [];
  const set = new Set(rule.colors.map((h) => h.toLowerCase()));
  const found = [...new Set(used.map((h) => h?.toLowerCase()).filter((h) => set.has(h)))];
  const max = rule.max_by_variant?.[variant] ?? rule.max;
  if (typeof max === 'number' && found.length > max) return [`${variant ? `${variant} pieces use` : 'a piece uses'} at most ${max} accent color${max === 1 ? '' : 's'}; found ${found.join(' + ')}`];
  return [];
}

/** A text box clipped by its scrolling/hidden ancestors (sliced type is checked only where it shows). */
export function clip(rect, clips) {
  return clips.reduce((o, c) => ({ left: Math.max(o.left, c.left), top: Math.max(o.top, c.top), right: Math.min(o.right, c.right), bottom: Math.min(o.bottom, c.bottom) }), { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom });
}

export function outside(r, box, tol = 1) {
  if (r.right <= r.left || r.bottom <= r.top) return false;
  return r.left < box.left - tol || r.top < box.top - tol || r.right > box.right + tol || r.bottom > box.bottom + tol;
}

/** Pixels per inch an image prints at: its natural size over the inches it covers (object-fit cover crops). */
export function effectiveDpi({ naturalW, naturalH, boxW, boxH, cover = false, pxIn }) {
  if (!naturalW || !boxW) return null;
  const scale = cover ? Math.max(boxW / naturalW, boxH / naturalH) : boxW / naturalW;
  return Math.round(pxIn / scale);
}
