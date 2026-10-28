// A collateral set: collateral/collateral.json names each piece, its format and its brand rules.
//
// {
//   "engine": "collateral@1.0",
//   "fonts": ["Brand Sans"],            optional: the font families pieces may use (default: brand.json's)
//   "neutrals": ["#f6f1e8"],            optional: grounds the brand uses beyond its palette
//   "accents": { "colors": ["#40adf7", "#c2d961"], "max": 2, "max_by_variant": { "research": 1 } },
//   "pieces": [
//     { "id": "poster-a", "file": "pieces/poster.html", "format": "print.poster.24x36",
//       "params": { "n": 1 }, "variant": "research", "logo_exempt": "why, if it carries none",
//       "ground": "#141414" },
//     { "id": "tee-mockup", "file": "pieces/mock.html", "mockup": true, "canvas": { "w": 1600, "h": 1600 } }
//   ]
// }
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { collateralEngineProblem } from './version.mjs';
import { resolveFormat } from './registry.mjs';

export function setProblems(set, { root = '.', dir = join(root, 'collateral'), resolve = resolveFormat } = {}) {
  const problems = [];
  const engine = collateralEngineProblem(set?.engine);
  if (engine) problems.push(engine);
  if (!Array.isArray(set?.pieces) || !set.pieces.length) return [...problems, 'no pieces'];
  const ids = new Set();
  for (const p of set.pieces) {
    const at = `piece ${p.id ?? '(no id)'}`;
    if (!p.id || !/^[a-z0-9][a-z0-9-]*$/.test(p.id)) problems.push(`${at}: id must be lowercase letters, digits and dashes`);
    if (ids.has(p.id)) problems.push(`${at}: duplicate id`);
    ids.add(p.id);
    if (!p.file) problems.push(`${at}: no file`);
    else if (!existsSync(join(dir, p.file))) problems.push(`${at}: collateral/${p.file} doesn't exist`);
    // A mockup (a piece shown on a product or a wall) takes a plain canvas instead of a format.
    if (p.mockup && p.canvas) { if (!(p.canvas.w > 0 && p.canvas.h > 0)) problems.push(`${at}: canvas needs w and h`); }
    else if (!p.format) problems.push(`${at}: no format (npm run collateral:formats lists them)`);
    else if (!resolve(p.format)) problems.push(`${at}: unknown format "${p.format}"`);
    if (p.logo_exempt !== undefined && (typeof p.logo_exempt !== 'string' || p.logo_exempt.length < 8)) problems.push(`${at}: logo_exempt needs the reason`);
  }
  const acc = set.accents;
  if (acc && (!Array.isArray(acc.colors) || acc.colors.some((h) => !/^#[0-9a-f]{6}$/i.test(h)))) problems.push('accents.colors must be hex colors');
  return problems;
}
