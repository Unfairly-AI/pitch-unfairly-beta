// A hand-drawn map of where people live, by state: real outlines (us-atlas,
// from the Census Bureau's cartographic boundaries) drawn as a slightly
// uneven pen line, hatched denser where more people live, with a label and a
// callout per state. The output is a part (site/parts/*.html) a section
// includes; base.css styles it from the brand tokens, and the motion kit
// draws it in.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { geoBounds, geoConicConformal, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import { STATE_NAMES } from './census.mjs';

const require = createRequire(import.meta.url);
const FIPS = { AL: '01', AK: '02', AZ: '04', AR: '05', CA: '06', CO: '08', CT: '09', DE: '10', DC: '11', FL: '12', GA: '13', HI: '15', ID: '16', IL: '17', IN: '18', IA: '19', KS: '20', KY: '21', LA: '22', ME: '23', MD: '24', MA: '25', MI: '26', MN: '27', MS: '28', MO: '29', MT: '30', NE: '31', NV: '32', NH: '33', NJ: '34', NM: '35', NY: '36', NC: '37', ND: '38', OH: '39', OK: '40', OR: '41', PA: '42', RI: '44', SC: '45', SD: '46', TN: '47', TX: '48', UT: '49', VT: '50', VA: '51', WA: '53', WV: '54', WI: '55', WY: '56', PR: '72' };
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let STATES;
function states() {
  if (!STATES) {
    const topo = JSON.parse(readFileSync(require.resolve('us-atlas/states-10m.json'), 'utf8'));
    STATES = feature(topo, topo.objects.states).features;
  }
  return STATES;
}

// A pen's small wobble, the same every build.
function wobble(d, amount, seed) {
  let x = seed * 9301 + 49297;
  const rnd = () => ((x = (x * 9301 + 49297) % 233280) / 233280 - 0.5) * 2 * amount;
  return d.replace(/(-?\d+\.?\d*),(-?\d+\.?\d*)/g, (m, a, b) => `${(Number(a) + rnd()).toFixed(1)},${(Number(b) + rnd()).toFixed(1)}`);
}

// Parallel lines across the frame, trimmed to it; a clip path keeps them inside a state.
function hatch(W, H, spacing, angle = -35) {
  const a = (angle * Math.PI) / 180;
  const [dx, dy] = [Math.cos(a), Math.sin(a)];
  const L = W + H;
  const out = [];
  for (let o = -L; o <= L; o += spacing) {
    const [cx, cy] = [W / 2 - dy * o, H / 2 + dx * o];
    let [t0, t1] = [-L, L];
    for (const [p, q] of [[-dx, cx], [dx, W - cx], [-dy, cy], [dy, H - cy]]) {
      if (p === 0) continue;
      const r = q / p;
      if (p < 0) t0 = Math.max(t0, r);
      else t1 = Math.min(t1, r);
    }
    if (t0 < t1) out.push(`M${(cx + dx * t0).toFixed(0)} ${(cy + dy * t0).toFixed(0)}L${(cx + dx * t1).toFixed(0)} ${(cy + dy * t1).toFixed(0)}`);
  }
  return out.join('');
}

/**
 * spec: {
 *   id: 'where',                          // used for element ids
 *   counts: { VA: 46, DC: 31, MD: 15 },   // the states to shade and label
 *   frame: [-79.6, 37.55, -75.35, 39.78], // [west, south, east, north]; default fits the counted states
 *   callouts: { VA: { head, body } },     // optional: shown on hover or tap
 *   other: { count: 41, states: 15, detail: 'PA 7, CA 5' }, // people outside the map
 *   labels: { VA: 'Virginia' },         // optional: the name under a count
 *   title: 'Where the enrolled live'
 * }
 */
export function stateMap(spec) {
  const id = spec.id ?? 'map';
  const W = 640;
  const all = states();
  const byCode = Object.fromEntries(Object.entries(FIPS).map(([code, f]) => [code, all.find((s) => s.id === f)]));
  const counted = Object.keys(spec.counts ?? {}).filter((c) => byCode[c]);
  if (!counted.length) throw new Error('stateMap: counts needs at least one state (by postal code, e.g. VA).');
  const frameGeo = spec.frame
    ? // Corner points, not a polygon: d3 reads a polygon's winding as which side is inside.
      { type: 'MultiPoint', coordinates: [[spec.frame[0], spec.frame[1]], [spec.frame[2], spec.frame[1]], [spec.frame[2], spec.frame[3]], [spec.frame[0], spec.frame[3]], [(spec.frame[0] + spec.frame[2]) / 2, spec.frame[3]], [(spec.frame[0] + spec.frame[2]) / 2, spec.frame[1]]] }
    : { type: 'FeatureCollection', features: counted.map((c) => byCode[c]) };
  // Centered on the frame so north is up, then fit its width and size the height to it.
  const [[w0, s0], [e0, n0]] = geoBounds(frameGeo);
  const proj = geoConicConformal().parallels([s0, n0]).rotate([-(w0 + e0) / 2, 0]).fitWidth(W, frameGeo);
  const [[, y0], [, y1]] = geoPath(proj).bounds(frameGeo);
  const H = Math.round(y1 - y0);
  proj.translate([proj.translate()[0], proj.translate()[1] - y0]).clipExtent([[0, 0], [W, H]]);
  const path = geoPath(proj);
  const max = Math.max(...counted.map((c) => spec.counts[c]));

  const defs = [];
  const hatches = [];
  const outlines = [];
  const solids = [];
  const labels = [];
  for (const code of counted) {
    const d = path(byCode[code]);
    if (!d) continue;
    const [[bx0, by0], [bx1, by1]] = path.bounds(byCode[code]);
    // Too small to hold its own label (DC beside Maryland, say).
    const small = Math.max(bx1 - bx0, by1 - by0) < 56;
    const n = spec.counts[code];
    const [cx, cy] = path.centroid(byCode[code]);
    if (small) {
      // Too small to hatch or label inside: solid ink and a leader line.
      solids.push(`<path class="sm-solid" d="${d}"/>`);
      const [lx, ly] = [Math.min(W - 40, cx + 90), Math.min(H - 30, cy + 60)];
      // A loose curve, the way a pen would draw the leader.
      outlines.push(`<path class="sm-lead" d="M${cx.toFixed(0)} ${cy.toFixed(0)}C${(cx + 35).toFixed(0)} ${(cy + 15).toFixed(0)},${(lx - 30).toFixed(0)} ${(ly - 35).toFixed(0)},${lx.toFixed(0)} ${(ly - 18).toFixed(0)}"/>`);
      labels.push({ code, n, x: lx, y: ly + 12 });
    } else {
      defs.push(`<clipPath id="${id}-${code}"><path d="${d}"/></clipPath>`);
      const spacing = Math.min(22, 6.5 * Math.sqrt(max / n));
      hatches.push(`<path class="sm-h" clip-path="url(#${id}-${code})" d="${hatch(W, H, spacing)}"/>`);
      outlines.push(`<path class="draw sm-o" pathLength="1" d="${wobble(d, 0.45, n + 7)}"/><path class="draw sm-o2" pathLength="1" d="${wobble(d, 0.9, n + 11)}"/>`);
      labels.push({ code, n, x: cx, y: cy });
    }
  }
  // Every other state in the frame, faint, for context.
  const context = all
    .filter((s) => !counted.some((c) => byCode[c] === s))
    .map((s) => path(s))
    .filter(Boolean)
    .map((d) => `<path class="draw sm-ctx" pathLength="1" d="${d}"/>`);

  const pct = (v, of) => `${((v / of) * 100).toFixed(1)}%`;
  const svg = `<svg class="sm-svg" viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false"><defs>${defs.join('')}</defs><g class="sm-hatch">${hatches.join('')}</g><g>${context.join('')}</g><g>${outlines.join('')}</g>${solids.join('')}</svg>`;
  const buttons = labels
    .map((l) => `<button type="button" class="sm-st" style="left:${pct(l.x, W)};top:${pct(l.y, H)}" aria-describedby="${id}-co-${l.code}"><b class="num">${l.n}</b><span>${esc(spec.labels?.[l.code] ?? (l.code === 'DC' ? 'DC' : STATE_NAMES[l.code] ?? l.code))}</span></button>`)
    .join('\n      ');
  const co = spec.callouts ?? {};
  const callouts = [
    ...labels.filter((l) => co[l.code]).map((l) => `<div class="sm-co" id="${id}-co-${l.code}" role="tooltip"><p class="sm-co-h">${esc(co[l.code].head)}</p><p>${esc(co[l.code].body)}</p></div>`),
    ...(spec.other ? [`<div class="sm-co" id="${id}-co-other" role="tooltip"><p class="sm-co-h">${esc(`${spec.other.count} live in ${spec.other.states} other states`)}</p><p>${esc(spec.other.detail ?? '')}</p></div>`] : []),
  ];
  const hoverRules = [...labels.map((l) => l.code), ...(spec.other ? ['other'] : [])]
    .map((c) => `.sm-block:has([aria-describedby="${id}-co-${c}"]:is(:hover, :focus)) #${id}-co-${c}`)
    .join(',\n');
  return `<!-- Generated by bin/site-map.mjs; rerun it rather than editing. -->
<div class="sm-block" id="${id}">
  ${spec.title ? `<p class="eyebrow">${esc(spec.title)}</p>` : ''}
  <div class="sm" style="aspect-ratio: ${W} / ${H}">
    ${svg}
      ${buttons}
  </div>
  <div class="sm-foot">
    ${spec.other ? `<button type="button" class="sm-other" aria-describedby="${id}-co-other"><b class="num">${spec.other.count}</b><span>in ${spec.other.states} other states</span></button>` : ''}
    ${callouts.length ? '<span class="sm-hint">Tap a state</span>' : ''}
  </div>
  ${callouts.length ? `<div class="sm-cos">\n    ${callouts.join('\n    ')}\n  </div>\n  <style>${hoverRules} { opacity: 1; visibility: visible; transform: none; }</style>` : ''}
</div>`;
}
