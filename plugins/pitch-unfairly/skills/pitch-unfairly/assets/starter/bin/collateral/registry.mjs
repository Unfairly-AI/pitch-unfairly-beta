// The collateral format registry: print (posters, flyers, out-of-home) and merch (tumblers, shirts),
// each with its finished size, bleed, safe area, resolution and sources. Social formats resolve
// through the social registry, so one collateral set can hold a poster and an Instagram post.
//
// specs/print-merch.json  researched formats (schema in specs/SCHEMA.md)
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRegistry as loadSocial, safeRect } from '../social/registry.mjs';

export const SPECS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'specs');
/** CSS px per inch pieces are laid out at. Chrome prints 96 CSS px to the inch, so PDFs print at scale 96 / PX_IN. */
export const PX_IN = 48;

export function printFormats(dir = SPECS_DIR) {
  return JSON.parse(readFileSync(join(dir, 'print-merch.json'), 'utf8')).formats;
}

const sides = (v) => (v && typeof v === 'object' ? { l: v.left ?? 0, r: v.right ?? 0, t: v.top ?? 0, b: v.bottom ?? 0 } : { l: v ?? 0, r: v ?? 0, t: v ?? 0, b: v ?? 0 });

/**
 * Everything a piece needs to render, from its format id:
 *   kind      print | merch | screen
 *   trim      finished size in inches (print, merch)
 *   bleed     inches beyond the trim on every side
 *   safe      inches inside the trim, per side, that copy stays clear of. Framed displays
 *             (shelters, dioramas) show less than the trim: the safe area grows to the visible
 *             area plus half an inch.
 *   dpi       { min, rec } at finished size
 *   layout    { w, h } CSS px the piece is laid out at
 *   out       { w, h } device px of the print file (merch PNG) or proof
 */
export function resolveFormat(id, { print = printFormats(), social = null } = {}) {
  const f = print.find((x) => x.id === id);
  if (f) {
    const kind = f.platform === 'merch' ? 'merch' : 'print';
    const bleed = f.bleed_in ?? 0;
    const safe = sides(f.safe_in);
    if (f.visible) {
      const mx = (f.trim.w - f.visible.w) / 2 + 0.5, my = (f.trim.h - f.visible.h) / 2 + 0.5;
      safe.l = Math.max(safe.l, mx); safe.r = Math.max(safe.r, mx); safe.t = Math.max(safe.t, my); safe.b = Math.max(safe.b, my);
    }
    const full = { w: f.trim.w + 2 * bleed, h: f.trim.h + 2 * bleed };
    const dpi = { min: f.dpi?.min ?? null, rec: f.dpi?.recommended ?? f.dpi?.min ?? 300 };
    return {
      id, kind, spec: f, trim: { w: f.trim.w, h: f.trim.h }, bleed, safe, dpi,
      layout: { w: Math.round(full.w * PX_IN), h: Math.round(full.h * PX_IN) },
      out: { w: Math.round(full.w * dpi.rec), h: Math.round(full.h * dpi.rec) },
    };
  }
  const s = (social ?? loadSocial().formats).find((x) => x.id === id);
  if (s) {
    // The platform's safe zone (UI overlays, the profile grid's crop), in canvas px.
    const r = s.safe_zone ? safeRect(s) : { x: 0, y: 0, w: s.canvas.w, h: s.canvas.h };
    const safe_px = { l: r.x, t: r.y, r: s.canvas.w - r.x - r.w, b: s.canvas.h - r.y - r.h };
    return { id, kind: 'screen', spec: s, layout: { w: s.canvas.w, h: s.canvas.h }, out: { w: s.canvas.w, h: s.canvas.h }, safe_px };
  }
  return null;
}

/** Formats matching patterns ("print.poster.*", "merch", "print.ooh.bus_shelter.47x68"). */
export function selectPrint(formats, patterns = []) {
  if (!patterns.length) return formats;
  const res = patterns.map((p) => new RegExp(`^${p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}(\\..*)?$`));
  return formats.filter((s) => res.some((r) => r.test(s.id) || r.test(s.platform)));
}
