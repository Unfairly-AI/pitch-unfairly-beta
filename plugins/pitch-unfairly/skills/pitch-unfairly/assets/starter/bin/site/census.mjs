// A broker's census file (CSV or Excel) becomes the facts a proposal needs,
// counted by code so nobody counts or measures by hand. Output is aggregates
// only: counts, tiers, states, top ZIP codes, and distances to sites. No row
// for any person ever leaves this file.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** Rows from a census file: CSV text, or an Excel workbook's first sheet. */
export async function readCensus(path) {
  if (/\.xlsx?$/i.test(path)) {
    const { default: readXlsx } = await import('read-excel-file/node');
    // Newer versions return every sheet ([{ sheet, data }]); older ones the first sheet's rows.
    const out = await readXlsx(path);
    const rows = Array.isArray(out[0]?.data) ? out[0].data : out;
    return rows.map((r) => r.map((c) => (c instanceof Date ? c.toISOString().slice(0, 10) : c == null ? '' : String(c))));
  }
  return parseCsv(readFileSync(path, 'utf8'));
}

// ── CSV ──
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') row.push(cell), (cell = '');
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

// ── Column matching ──
const COLUMNS = {
  id: ['employee id', 'emp id', 'employee number', 'ee id', 'member id', 'id', 'employee'],
  coverage: ['coverage tier', 'medical coverage tier', 'coverage level', 'tier', 'medical tier', 'election', 'coverage', 'medical coverage'],
  plan: ['medical plan', 'plan name', 'plan'],
  gender: ['gender', 'sex'],
  hire: ['date of hire', 'hire date', 'doh', 'start date', 'original hire date'],
  state: ['home state', 'state', 'st'],
  zip: ['home zip', 'zip code', 'zip', 'postal code', 'zipcode'],
};
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export function matchColumns(header) {
  const h = header.map(norm);
  const found = {};
  for (const [key, names] of Object.entries(COLUMNS)) {
    const i = names.map((n) => h.indexOf(n)).find((x) => x >= 0) ?? h.findIndex((c) => names.some((n) => c.includes(n)));
    if (i >= 0) found[key] = i;
  }
  return found;
}

export function tierOf(raw) {
  const v = norm(raw);
  if (!v || /waiv|declin|^none$|^no coverage|opt out|^n a$/.test(v)) return 'waived';
  if (/fam|^ef$|^e f$/.test(v)) return 'family';
  if (/spouse|^es$|^e sp$|^ee sp$|^e s$|partner|^ep$/.test(v)) return 'spouse';
  if (/child|^ec$|^e ch$|^ee ch$|^e c$/.test(v)) return 'children';
  if (/^ee$|employee only|^single$|^e$|^employee$|^emp only$|individual/.test(v)) return 'employee';
  return null;
}

export const STATE_NAMES = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', PR: 'Puerto Rico', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming' };

// ── Distance ──
// ZIP code centroids from the Census Bureau's 2023 ZCTA Gazetteer, one plain
// text file per first digit: zip,lat,lon.
export function loadZips(dir = join(here, 'data/zcta')) {
  const map = new Map();
  for (const d of '0123456789') {
    for (const line of readFileSync(join(dir, `${d}.csv`), 'utf8').split('\n')) {
      const [zip, lat, lon] = line.split(',');
      if (zip) map.set(zip, [Number(lat), Number(lon)]);
    }
  }
  return map;
}
export function miles([lat1, lon1], [lat2, lon2]) {
  const r = (d) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(a));
}

// ── The analysis ──
export function analyzeCensus(rows, opts) {
  const { year, region = [], radii = [3, 5, 10], sites = [], zips, sourceName = 'census file', asOf, topZips: topN = 4 } = opts;
  const warnings = [];
  const [header, ...body] = rows;
  const col = matchColumns(header);
  for (const need of ['coverage', 'zip']) if (col[need] === undefined) warnings.push(`No ${need} column found (looked for: ${COLUMNS[need].join(', ')}).`);
  const get = (r, k) => (col[k] === undefined ? '' : String(r[col[k]] ?? '').trim());

  // One row per employee: a duplicate id keeps its enrolled row over a waive row.
  const people = new Map();
  let duplicates = 0;
  body.forEach((r, i) => {
    const id = get(r, 'id') || `row-${i + 2}`;
    const p = { id, tier: tierOf(get(r, 'coverage')), plan: get(r, 'plan'), gender: norm(get(r, 'gender')), hire: get(r, 'hire'), state: get(r, 'state').toUpperCase().slice(0, 2), zip: get(r, 'zip').replace(/\D/g, '').slice(0, 5).padStart(5, '0') };
    if (p.tier === null) warnings.push(`Row ${i + 2}: coverage "${get(r, 'coverage')}" isn't a tier I know; counted as waived.`);
    if (p.tier === null) p.tier = 'waived';
    if (people.has(id)) {
      duplicates++;
      if (people.get(id).tier === 'waived' && p.tier !== 'waived') people.set(id, p);
    } else people.set(id, p);
  });
  const all = [...people.values()];
  const enrolled = all.filter((p) => p.tier !== 'waived');
  const waived = all.filter((p) => p.tier === 'waived');
  const count = (xs, f) => xs.filter(f).length;
  const tiers = { employee: 0, spouse: 0, children: 0, family: 0 };
  enrolled.forEach((p) => tiers[p.tier]++);

  const hireYear = (h) => {
    const m = h.match(/(\d{4})/) ?? h.match(/\d{1,2}\/\d{1,2}\/(\d{2})$/);
    if (!m) return null;
    return m[1].length === 2 ? 2000 + Number(m[1]) : Number(m[1]);
  };
  const joined = col.hire === undefined ? null : count(all, (p) => hireYear(p.hire) === year);
  if (col.hire === undefined) warnings.push('No hire date column: "joined this year" is left out.');
  const women = col.gender === undefined ? null : count(enrolled, (p) => /^f/.test(p.gender));
  if (col.gender === undefined) warnings.push('No gender column: the women figure is left out.');

  const plans = {};
  if (col.plan !== undefined) enrolled.forEach((p) => p.plan && (plans[p.plan] = (plans[p.plan] ?? 0) + 1));

  // States: the state column, or the ZIP's state when it's missing.
  const byState = {};
  enrolled.forEach((p) => p.state && (byState[p.state] = (byState[p.state] ?? 0) + 1));
  const ranked = Object.entries(byState).sort((a, b) => b[1] - a[1]);
  const inRegionStates = ranked.filter(([s]) => region.includes(s));
  const others = ranked.filter(([s]) => !region.includes(s));
  const shown = others.slice(0, 8).map(([s, n]) => `${s} ${n}`);
  const otherDetail = others.length > 8 ? `${shown.join(', ')}, and ${others.length - 8} more` : shown.join(', ');

  // Distances from each enrolled employee's home ZIP centroid to each site.
  const missingZip = new Set();
  const within = (site) =>
    radii.map((r) =>
      count(enrolled, (p) => {
        const a = zips.get(p.zip);
        if (!a) return missingZip.add(p.zip), false;
        return miles(a, site.at) <= r;
      }),
    );
  const proxSites = sites
    .map((s) => ({ ...s, at: zips.get(s.zip) }))
    .filter((s) => (s.at ? true : (warnings.push(`Site ${s.name}: ZIP ${s.zip} isn't in the centroid file.`), false)))
    .map((s) => ({ name: s.name, zip: s.zip, within: within(s), ...(s.home ? { home: true } : {}) }));
  if (missingZip.size) warnings.push(`${missingZip.size} home ZIP(s) aren't in the centroid file (PO boxes or typos): ${[...missingZip].slice(0, 6).join(', ')}.`);

  const zipCounts = {};
  enrolled.forEach((p) => p.zip && (zipCounts[p.zip] = (zipCounts[p.zip] ?? 0) + 1));
  const topZips = Object.entries(zipCounts).sort((a, b) => b[1] - a[1]).slice(0, topN);

  const census = {
    as_of: asOf,
    eligible: all.length,
    enrolled: enrolled.length,
    tiers,
    ...(women === null ? {} : { women }),
    ...(joined === null ? {} : { joined_this_year: joined }),
    ...(Object.keys(plans).length ? { plans: Object.entries(plans).sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, enrolled: n })) } : {}),
    // Every state's enrolled count, for maps (aggregates only, never people).
    by_state: Object.fromEntries(ranked),
    states: {
      top: inRegionStates.map(([s, n]) => ({ name: STATE_NAMES[s] ?? s, enrolled: n })),
      ...(others.length ? { other: { count: others.length, enrolled: others.reduce((t, [, n]) => t + n, 0), detail: otherDetail } } : {}),
    },
    in_region: { enrolled: count(enrolled, (p) => region.includes(p.state)), waived: count(waived, (p) => region.includes(p.state)) },
    source: `${sourceName}${asOf ? `, ${asOf}` : ''} (${all.length} unique employees${duplicates ? `; ${duplicates} duplicate row${duplicates === 1 ? '' : 's'} merged` : ''}). Lives are estimated from tiers.`,
  };
  const proximity = {
    radii,
    sites: proxSites,
    top_zips: topZips.map(([zip, n]) => ({ zip, enrolled: n })),
    common_zips: topZips.length ? `The most common home ZIPs are ${topZips.map(([z, n]) => `${z} (${n})`).join(', ')}.` : '',
    source: 'Distances run from each census home ZIP to the site, using ZCTA centroids (U.S. Census Gazetteer 2023), in straight-line miles. Enrolled employees only.',
  };
  return { census, proximity, warnings };
}

