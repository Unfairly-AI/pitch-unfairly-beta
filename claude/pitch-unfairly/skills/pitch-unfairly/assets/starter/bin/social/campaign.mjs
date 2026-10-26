// social/campaign.json: what a campaign says, checked before anything renders.
//   engine   "social@1.0"
//   url, cta, offer      the site line, the button, the one-line offer under it
//   avoid    phrases the copy must never use (the brand's banned words)
//   formats  { include: ["linkedin.*", "instagram.feed.portrait"], exclude: [...] }
//   angles   { A: { name, head, ac, sub, short, shortAc, micro, note, tint, dark, moment } }
//            head + ac   the headline and its accent line (big formats)
//            short + shortAc   the same idea, shorter (small formats, covers, thumbnails)
//            micro       one line for the tiniest banners (320×50)
//            note        an honesty line shown with the moment ("Example data")
//            tint        the block behind the moment: a brand token, e.g. "var(--c-yellow)"
//            moment      the file in social/moments/ that draws the product moment
//   cards    the carousel/document sequence: { head, ac, sub } | { angle: "A" } | { close: true, head, ac }
//   copy     { <platform or format pattern>: { organic|ad: { <angle>: { primary, headline, description, ... } } } }
//            each field must fit the tightest limit among the formats it can run in
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { socialEngineProblem } from './version.mjs';
import { COUNT_FIELDS, textLimits } from './registry.mjs';

const len = (s) => [...String(s ?? '')].length;

export function campaignProblems(c, { root } = {}) {
  const out = [];
  const pin = socialEngineProblem(c.engine);
  if (pin) out.push(pin);
  if (!c.engine) out.push('pin the engine: "engine": "social@1.0"');
  const angles = Object.entries(c.angles ?? {});
  if (!angles.length) out.push('add at least one angle under "angles"');
  for (const [id, a] of angles) {
    for (const f of ['head', 'short', 'micro']) if (!a[f]) out.push(`angle ${id}: missing "${f}"`);
    if (a.micro && len(a.micro) > 40) out.push(`angle ${id}: "micro" is ${len(a.micro)} characters; the 320×50 banner holds about 40`);
    if (root && a.moment && !existsSync(join(root, 'social/moments', `${a.moment}.js`))) out.push(`angle ${id}: no social/moments/${a.moment}.js`);
  }
  for (const [i, card] of (c.cards ?? []).entries()) {
    if (card.angle && !c.angles?.[card.angle]) out.push(`cards[${i}]: no angle "${card.angle}"`);
    if (!card.angle && !card.head) out.push(`cards[${i}]: needs "angle" or "head"`);
  }
  for (const text of allCopy(c)) for (const bad of c.avoid ?? []) {
    if (text.value.toLowerCase().includes(String(bad).toLowerCase())) out.push(`${text.where}: uses "${bad}", which "avoid" bans`);
  }
  return out;
}

/** Every piece of text in the campaign, with where it is, for the avoid list. */
function allCopy(c) {
  const out = [];
  for (const [id, a] of Object.entries(c.angles ?? {})) for (const f of ['head', 'ac', 'sub', 'short', 'shortAc', 'micro']) if (a[f]) out.push({ where: `angle ${id}.${f}`, value: a[f] });
  for (const [i, card] of (c.cards ?? []).entries()) for (const f of ['head', 'ac', 'sub']) if (card[f]) out.push({ where: `cards[${i}].${f}`, value: card[f] });
  for (const [plat, bySurface] of Object.entries(c.copy ?? {})) for (const [surface, byAngle] of Object.entries(bySurface)) for (const [angle, fields] of Object.entries(byAngle)) for (const [f, v] of Object.entries(fields)) if (typeof v === 'string') out.push({ where: `copy.${plat}.${surface}.${angle}.${f}`, value: v });
  for (const f of ['cta', 'offer']) if (c[f]) out.push({ where: f, value: c[f] });
  return out;
}

/**
 * Copy against the registry's text limits: each field must fit the tightest limit any of the
 * platform's formats for that surface states. Hashtag and link counts are checked in the caption.
 * Returns { problems, rows } where rows document every check made.
 */
export function copyProblems(c, formats) {
  const problems = [];
  const rows = [];
  for (const [plat, bySurface] of Object.entries(c.copy ?? {})) {
    for (const [surface, byAngle] of Object.entries(bySurface)) {
      const limits = textLimits(formats, plat, surface);
      if (!Object.keys(limits).length) problems.push(`copy.${plat}.${surface}: the registry has no text limits for ${plat} ${surface}; check the platform name`);
      for (const [angle, fields] of Object.entries(byAngle)) {
        const where = `copy.${plat}.${surface}.${angle}`;
        for (const [field, value] of Object.entries(fields)) {
          const lim = limits[field];
          if (!lim) { problems.push(`${where}.${field}: ${plat} ${surface} formats have no "${field}" field (fields: ${Object.keys(limits).filter((f) => !COUNT_FIELDS.has(f)).join(', ')})`); continue; }
          const n = len(value);
          rows.push({ where: `${where}.${field}`, n, max: lim.max, from: lim.from, truncates_at: lim.truncates_at });
          if (n > lim.max) problems.push(`${where}.${field}: ${n}/${lim.max} characters (limit from ${lim.from})`);
        }
        const caption = fields.primary ?? '';
        const tags = (caption.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? []).length;
        const links = (caption.match(/https?:\/\/\S+/g) ?? []).length;
        if (limits.hashtags && tags > limits.hashtags.max) problems.push(`${where}.primary: ${tags} hashtags; ${plat} allows ${limits.hashtags.max} (${limits.hashtags.from})`);
        const linkLim = limits.links_in_caption ?? limits.links;
        if (linkLim && links > linkLim.max) problems.push(`${where}.primary: ${links} links; ${plat} allows ${linkLim.max} (${linkLim.from})`);
      }
    }
  }
  return { problems, rows };
}
