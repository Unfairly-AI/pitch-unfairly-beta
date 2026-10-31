// Hosted piece pages: the plan for turning a built collateral set into one link per piece (or
// piece pair), and the checks that keep each page honest. Pure functions; the CLI
// (bin/collateral-pages.mjs) does the file and browser work.
//
// Every page's type, eyebrow, spec line and downloads are derived from the set itself: the
// format registry decides print / swag / social, the piece's <title> names its headline, and the
// build's own files are what you download. Only the link's title and caption are written by hand,
// in collateral.json, and both are checked against the piece they describe.

export const TYPE_OF_KIND = { print: 'print', merch: 'swag', screen: 'social' };
export const TYPE_LABEL = { print: 'Print', swag: 'Swag', social: 'Social' };
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const norm = (s) => String(s ?? '').toLowerCase().replace(/<[^>]+>/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

/** "Poster 1a: Transforming smiles" -> "Transforming smiles"; a photo half or a bare title has none. */
export function headlineOf(pieceTitle) {
  const m = /:\s*(.+)$/.exec(String(pieceTitle ?? '').trim());
  if (!m) return null;
  const h = m[1].trim();
  return /^(photo|art|mockup)$/i.test(h) ? null : h;
}

/** The <title> of a piece's HTML source. */
export function titleOfHtml(html) {
  const m = /<title>([^<]*)<\/title>/i.exec(html ?? '');
  return m ? m[1].trim() : null;
}

/** The eyebrow over a page title: the type, then the variant's label, never the type twice. */
export function eyebrow(type, variant, labels = {}) {
  const t = TYPE_LABEL[type] ?? type;
  if (!variant) return t;
  const v = labels[variant] ?? variant.charAt(0).toUpperCase() + variant.slice(1).replace(/[-_]/g, ' ');
  return norm(v) === norm(t) ? t : `${t} · ${v}`;
}

const n = (x) => String(Math.round(x * 1000) / 1000);
const short = (name) => String(name ?? '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/,\s*[^,]*\d[^,]*$/, '').replace(/,\s*wrap print file$/i, '').trim();

/** One line naming the format at its real size, from the registry (never typed by hand). */
export function specLine(fmt, count = 1) {
  const pair = count === 2 ? 'A pair · ' : count > 2 ? `A set of ${count} · ` : '';
  const s = fmt.spec ?? {};
  if (fmt.kind === 'screen') {
    const platform = s.platform ? s.platform.charAt(0).toUpperCase() + s.platform.slice(1) : '';
    return `${pair}${[platform, s.name].filter(Boolean).join(' · ')} · ${s.canvas.w} × ${s.canvas.h}`;
  }
  const size = `${n(fmt.trim.w)} × ${n(fmt.trim.h)} in${count > 1 ? ' each' : ''}`;
  if (fmt.kind === 'merch') return `${pair}${short(s.name)} · art ${size}, ${fmt.dpi.rec} dpi transparent PNG`;
  const vis = s.visible ? ` (${n(s.visible.w)} × ${n(s.visible.h)} visible)` : '';
  const bleed = fmt.bleed > 0 ? `, ${n(fmt.bleed)} in bleed` : '';
  return `${pair}${short(s.name)} · ${size}${vis}${bleed}`;
}

/** Labels a list of same-kind downloads apart: a pair is left/right, more are numbered. */
function sideLabel(i, total) {
  if (total < 2) return '';
  if (total === 2) return i === 0 ? ' · left' : ' · right';
  return ` · ${i + 1} of ${total}`;
}

/**
 * The plan for every link in a set.
 *   set       collateral.json (pieces[] plus pages{ suffix, variants, links[] })
 *   formatOf  (formatId) => resolved format (registry.resolveFormat) or null
 *   titleOf   (pieceId)  => the piece's <title>, or null
 * Returns { links, problems }. A link: { slug, type, title, page_title, eyebrow, spec, caption,
 *   items: [{ id, role: 'print'|'merch'|'screen'|'mockup', view, download, label }] }.
 * Paths in items are relative to artifacts/collateral (source) and to the page folder (view/download).
 */
export function planPages(set, { formatOf, titleOf }) {
  const problems = [];
  const pages = set.pages ?? {};
  const byId = new Map((set.pieces ?? []).map((p) => [p.id, p]));
  const used = new Map();
  const slugs = new Set();
  const links = [];
  if (!Array.isArray(pages.links) || !pages.links.length) {
    return { links, problems: ['collateral.json has no pages.links: name the hosted link each piece (or pair) is published as'] };
  }
  for (const l of pages.links) {
    const where = `link ${l.slug ?? '(no slug)'}`;
    if (!l.slug || !SLUG.test(l.slug)) problems.push(`${where}: slug must be lowercase words joined by hyphens`);
    if (slugs.has(l.slug)) problems.push(`${where}: slug used twice`);
    slugs.add(l.slug);
    if (!l.title) problems.push(`${where}: needs a title`);
    const pieces = (l.pieces ?? []).map((id) => {
      const p = byId.get(id);
      if (!p) problems.push(`${where}: no piece "${id}" in collateral.json`);
      else if (used.has(id)) problems.push(`${where}: piece "${id}" is already on link ${used.get(id)}`);
      else used.set(id, l.slug);
      return p;
    }).filter(Boolean);
    const real = pieces.filter((p) => !p.mockup);
    if (!real.length) { problems.push(`${where}: holds no piece with a format (a mockup alone has nothing to download)`); continue; }
    const fmts = real.map((p) => [p, formatOf(p.format)]);
    for (const [p, f] of fmts) if (!f) problems.push(`${where}: piece "${p.id}" has unknown format ${p.format}`);
    // A digital out-of-home screen rides with the print placements it's bought alongside.
    const kinds = [...new Set(fmts.map(([, f]) => (f?.kind === 'screen' && f.spec?.platform === 'digital' ? 'print' : f?.kind)).filter(Boolean))];
    if (kinds.length > 1) problems.push(`${where}: mixes ${kinds.join(' and ')} pieces; one link is one type`);
    const type = TYPE_OF_KIND[kinds[0]];
    if (l.type && type && l.type !== type) problems.push(`${where}: says type ${l.type} but its pieces are ${type} (from their formats)`);

    // Titles and captions describe the piece they sit on: every headline on the link must be named.
    const said = norm(`${l.title} ${l.caption ?? ''}`);
    for (const p of real) {
      const h = headlineOf(titleOf(p.id));
      if (h && !said.includes(norm(h))) problems.push(`${where}: piece "${p.id}" says "${h}", but the link's title and caption never do (swapped or stale copy?)`);
    }
    for (const p of pieces.filter((x) => x.mockup)) {
      if (!pieces.some((q) => !q.mockup && q.id.split('-')[0] === p.id.split('-')[0])) {
        problems.push(`${where}: mockup "${p.id}" sits on a link without its art (name them alike: tee-art, tee-mockup)`);
      }
    }

    const variants = [...new Set(real.map((p) => p.variant).filter(Boolean))];
    const placedSizes = new Set(real.map((x) => x.format)).size;
    const items = [];
    const counts = {};
    for (const p of pieces) {
      const role = p.mockup ? 'mockup' : formatOf(p.format)?.kind;
      counts[role] = (counts[role] ?? 0) + 1;
    }
    const seen = {};
    for (const p of pieces) {
      const fmt = p.mockup ? null : formatOf(p.format);
      const role = p.mockup ? 'mockup' : fmt?.kind;
      const i = (seen[role] = (seen[role] ?? -1) + 1);
      // Pieces in different sizes are named by their placement, not numbered.
      const side = new Set(real.map((x) => x.format)).size > 1 ? '' : sideLabel(i, counts[role]);
      const it = { id: p.id, role, proof: `proof/${p.id}.png` };
      // A set of placements names its files after them, numbered in the link's order: the gallery's
      // Formats tab lists them by file name ("07-BART-car-card" reads "BART car card").
      const stem = placedSizes > 1 && fmt?.spec?.name
        ? `${String(items.length + 1).padStart(2, '0')}-${fmt.spec.name.replace(/['’]/g, '').replace(/[^A-Za-z0-9.]+/g, '-').replace(/^-|-$/g, '')}`
        : p.id;
      // The view and the download are always different files: an <a download> pointing at an
      // image the page also shows opens in the frame instead of saving.
      if (role === 'merch') {
        it.view = `files/${stem}-view.png`;
        it.source = `print/${p.id}.png`;
        it.download = `files/${stem}.png`;
        it.label = `Print art PNG${side} · ${fmt.dpi.rec} dpi, transparent`;
      } else {
        it.view = `files/${stem}-view.jpg`;
        if (role === 'print') { it.source = `print/${p.id}.pdf`; it.download = `files/${stem}.pdf`; it.label = `Print PDF${side}${fmt.spec?.mechanical ? ` · ${fmt.spec.mechanical.label} mechanical` : ''}`; }
        if (role === 'screen') {
          // A digital out-of-home screen takes a JPG (the media owners' specs); a social post keeps its PNG.
          const jpg = fmt.spec.platform === 'digital';
          it.source = `proof/${p.id}.png`; it.download = `files/${stem}.${jpg ? 'jpg' : 'png'}`;
          it.label = `${jpg ? 'Screen image JPG' : 'Post image PNG'}${side} · ${fmt.spec.canvas.w} × ${fmt.spec.canvas.h}`;
        }
      }
      it.alt = `${l.title}${side ? ` (${side.replace(' · ', '')})` : ''}`;
      if (fmt) { it.placement = fmt.spec?.name ?? p.format; it.size = fmt.kind === 'screen' ? `${fmt.spec.canvas.w} × ${fmt.spec.canvas.h} px` : specLine(fmt).replace(/^.*? · (?=[^·]*$)/, ''); it.family = fmt.spec?.family ?? null; }
      if (role === 'merch' && l.ground) it.ground = l.ground;
      items.push(it);
    }
    links.push({
      slug: l.slug,
      type,
      title: l.title,
      page_title: pages.suffix ? `${l.title} · ${pages.suffix}` : l.title,
      eyebrow: eyebrow(type, variants.length === 1 ? variants[0] : null, pages.variants),
      // One design in many sizes (a city's out-of-home placements): each piece is named on the page instead.
      sizes: new Set(real.map((p) => p.format)).size,
      spec: new Set(real.map((p) => p.format)).size > 1 ? `${real.length} placements, one design` : fmts[0][1] ? specLine(fmts[0][1], real.length) : '',
      caption: l.caption ?? '',
      items,
    });
  }
  for (const p of set.pieces ?? []) {
    if (!used.has(p.id) && !(pages.unlinked ?? []).includes(p.id)) {
      problems.push(`piece "${p.id}" is on no link: add it to pages.links, or list it in pages.unlinked to leave it out on purpose`);
    }
  }
  return { links, problems };
}

/** A merch view sits on the garment: white ink shows on dark, dark ink on white. */
export function groundFor(meanLuminance) {
  return meanLuminance > 0.6 ? '#151515' : '#ffffff';
}

// ---- Publishing within the host's limit -------------------------------------------------------

/** The host accepts this many new versions per person per rolling hour (hosted_deck_versions.created_by). */
export const VERSIONS_PER_HOUR = 30;
const HOUR = 3_600_000;

/**
 * What can publish now. ledger: [{ slug, at }] of every upload started (this project's, plus any
 * `--used` from elsewhere, passed as extra timestamps). Returns { free, next_at } where next_at is
 * when the oldest counted start leaves the window (null if there's room).
 */
export function budget(ledger, now = Date.now(), limit = VERSIONS_PER_HOUR) {
  const recent = ledger.map((e) => Date.parse(e.at)).filter((t) => now - t < HOUR).sort((a, b) => a - b);
  const free = Math.max(0, limit - recent.length);
  const next_at = free > 0 ? null : new Date(recent[recent.length - limit] + HOUR).toISOString();
  return { free, used: recent.length, next_at };
}

/** Links still to publish, in order: those with no recorded upload of their current files. */
export function pending(links, ledger) {
  const done = new Map();
  for (const e of ledger) if (e.digest) done.set(e.slug, e.digest);
  return links.filter((l) => done.get(l.slug) !== l.digest);
}

/** Batches that each fit one hour's allowance, given what's already been used this hour. */
export function batches(todo, free, limit = VERSIONS_PER_HOUR) {
  const out = [];
  let rest = [...todo];
  let room = free;
  while (rest.length) {
    out.push(rest.slice(0, room));
    rest = rest.slice(room);
    room = limit;
    if (out[out.length - 1].length === 0) out.pop();
  }
  return out;
}
