// The social format registry: every platform placement we render to, with its canvas,
// safe zone, file limits, video limits and text limits, each traced to a source.
//
// specs/*.json      researched formats (schema in specs/SCHEMA.md), one file per platform group
// specs/overrides.json  our render decisions over the research, each with a reason:
//   overrides         per-format field changes (kind, media, render:false)
//   house_safe_zones  margins we hold where a platform publishes none (reports label them)
//   crops             places a platform shows a centred crop (the Instagram grid's 3:4 tile);
//                     merged into the safe zone so text survives the crop too
//
// Kinds pick the layout family: ad | post | cover | thumb | avatar | logo | banner.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SPECS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'specs');
const SIDES = ['top', 'bottom', 'left', 'right'];

/** Every researched format, unmerged, with the file it came from. */
export function rawFormats(dir = SPECS_DIR) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json') && f !== 'overrides.json')
    .sort()
    .flatMap((f) => (JSON.parse(readFileSync(join(dir, f), 'utf8')).formats ?? []).map((s) => ({ ...s, file: f })));
}

export function readOverrides(dir = SPECS_DIR) {
  try {
    return JSON.parse(readFileSync(join(dir, 'overrides.json'), 'utf8'));
  } catch {
    return { overrides: {}, house_safe_zones: {}, crops: {} };
  }
}

const hasZone = (z) => !!z && SIDES.some((k) => typeof z[k] === 'number');

/** The layout family a format renders with, from its id and name when the research didn't say. */
export function kindOf(s) {
  if (s.kind) return s.kind;
  const id = s.id.toLowerCase();
  const n = (s.name ?? '').toLowerCase();
  if (/profile[._-]?(photo|picture|image)|avatar|\blogo\b|\.logo|page[._-]logo|watermark|channel\.profile|\.profile$/.test(`${id} ${n}`) && !/cover|banner|header/.test(id)) return 'avatar';
  if (/thumbnail/.test(id + n)) return 'thumb';
  if (/cover|banner|header|background|channel[._-]?art/.test(`${id} ${n}`) && !/display|companion/.test(id + n)) return 'cover';
  const { w, h } = s.canvas ?? {};
  if (s.platform === 'google' && /display|companion|banner/.test(id) && w * h < 400000) return 'banner';
  return s.surface === 'organic' ? 'post' : 'ad';
}

/** A centred crop of aspect [aw, ah] on a w×h canvas, as [vertical, horizontal] margins in px. */
export function cropMargins(w, h, [aw, ah]) {
  if (w / h > aw / ah) return [0, Math.round((w - (h * aw) / ah) / 2)];
  return [Math.round((h - (w * ah) / aw) / 2), 0];
}

/** The safe rect {x, y, w, h} in canvas px. Percent zones are converted. */
export function safeRect(spec) {
  const W = spec.canvas.w, H = spec.canvas.h, z = spec.safe_zone ?? {};
  const pct = z.units === '%';
  const v = (x, of) => (typeof x !== 'number' ? 0 : pct ? (x / 100) * of : x);
  const top = v(z.top, H), bottom = v(z.bottom, H), left = v(z.left, W), right = v(z.right, W);
  return { x: left, y: top, w: W - left - right, h: H - top - bottom };
}

/**
 * The merged registry: overrides applied, house zones filled in, crops merged, kinds set.
 * Returns { formats, skipped } where skipped lists [id, reason] for formats we don't render.
 */
export function loadRegistry({ dir = SPECS_DIR } = {}) {
  const ov = readOverrides(dir);
  const formats = [];
  const skipped = [];
  for (const raw of rawFormats(dir)) {
    const s = structuredClone(raw);
    const o = ov.overrides?.[s.id];
    if (o) {
      const { why, ...rest } = o;
      Object.assign(s, rest);
      s.overridden = why;
    }
    if (!hasZone(s.safe_zone) && ov.house_safe_zones?.[s.id]) {
      s.safe_zone = { ...ov.house_safe_zones[s.id] };
      s.safe_zone_source = 'house';
    } else if (hasZone(s.safe_zone)) {
      for (const k of SIDES) if (typeof s.safe_zone[k] !== 'number') s.safe_zone[k] = 0;
      s.safe_zone_source = 'platform';
    } else delete s.safe_zone;
    if (s.safe_zone) s.safe_zone.units = String(s.safe_zone.units ?? 'px').includes('%') ? '%' : 'px';
    const crop = ov.crops?.[s.id];
    if (crop && s.canvas?.w && s.safe_zone?.units !== '%') {
      const [my, mx] = cropMargins(s.canvas.w, s.canvas.h, crop.aspect);
      const z = s.safe_zone ?? { top: 0, bottom: 0, left: 0, right: 0, units: 'px' };
      z.top = Math.max(z.top, my); z.bottom = Math.max(z.bottom, my);
      z.left = Math.max(z.left, mx); z.right = Math.max(z.right, mx);
      s.safe_zone = z;
      s.crop = { aspect: crop.aspect, note: crop.note, margins: [my, mx] };
      s.safe_zone_source = s.safe_zone_source ? `${s.safe_zone_source}+crop` : 'crop';
    }
    if (s.render === false) { skipped.push([s.id, s.overridden ?? 'render: false']); continue; }
    if (!s.canvas?.w || !s.canvas?.h) { skipped.push([s.id, 'no canvas size']); continue; }
    if (!(s.media ?? []).some((m) => ['image', 'video', 'carousel', 'document', 'gif'].includes(m))) { skipped.push([s.id, 'text only']); continue; }
    s.kind = kindOf(s);
    formats.push(s);
  }
  return { formats, skipped };
}

/** Formats matching any of the patterns ("linkedin.*", "instagram.feed.portrait", "tiktok"). */
export function selectFormats(formats, patterns = []) {
  if (!patterns.length) return formats;
  const res = patterns.map((p) => new RegExp(`^${p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}(\\..*)?$`));
  return formats.filter((s) => res.some((r) => r.test(s.id) || r.test(s.platform)));
}

/**
 * Copy limits for a platform (or a format pattern) and surface ('organic' or 'ad'): for each field, the tightest
 * max any matching format states, so copy that passes fits every placement it may run in.
 * Count fields (hashtags, links, topic_tag) are limits on how many, not characters.
 */
export const COUNT_FIELDS = new Set(['hashtags', 'links', 'links_in_caption', 'topic_tag', 'mentions']);
export function textLimits(formats, target, surface) {
  const out = {};
  // target: a platform ("linkedin") or a format pattern ("linkedin.ad.single_image.*").
  // Logo, avatar and banner slots carry their own short texts (a text ad's 25-character
  // headline), so they only count when the pattern names them.
  const pool = /[.*]/.test(target) ? selectFormats(formats, [target]) : formats.filter((f) => f.platform === target && !['avatar', 'logo', 'banner'].includes(f.kind));
  for (const s of pool.filter((f) => !surface || f.surface === surface || f.surface === 'both')) {
    for (const [field, lim] of Object.entries(s.text ?? {})) {
      const max = typeof lim === 'number' ? lim : lim?.max;
      if (typeof max !== 'number') continue;
      const cur = out[field];
      if (!cur || max < cur.max) out[field] = { max, from: s.id, truncates_at: lim?.truncates_at ?? null };
    }
  }
  return out;
}
