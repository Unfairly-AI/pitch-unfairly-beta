// The copy rules a site's words are held to: the same ones Unfairly's deck
// review and house style apply (em dashes, middle-dot lists, bolded-colon
// lead-ins block; generated-sounding words, "not just X but Y", "Title:
// subtitle" headlines, overlong headlines and labels that name nothing are
// worth a read). Read off the page as the reader sees it, tokens filled.

import { attrValue, drop } from './lead.mjs';

const BLOCK = /<\/?(?:p|li|h[1-6]|div|section|header|footer|td|th|caption|figcaption|blockquote|dt|dd|button|a|label|summary|small|span)\b[^>]*>/i;

// Someone else's words, marked data-copy-ok (a verbatim quote that keeps its own
// dash), aren't the site's copy: the rules below leave them alone, as they do a <blockquote>.
const theirs = (html) => html.replace(/<(\w+)\b[^>]*\sdata-copy-ok\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');

/** A copy exemption records a real quotation's source, never a blanket website-copy waiver. */
export function copyExemptionProblems(html) {
  return [...html.matchAll(/<\w+\b([^>]*\sdata-copy-ok\b[^>]*)>/gi)]
    .filter(([, attrs]) => !/\bdata-copy-source\s*=\s*["']https?:\/\/[^"']+["']/i.test(attrs))
    .map(() => 'data-copy-ok needs data-copy-source="https://..." for an attributed verbatim quotation. Rewrite inherited marketing copy instead of exempting it.');
}

const strip = (html) =>
  theirs(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

const plain = (s) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&middot;|&#183;/g, '·')
    .replace(/&mdash;|&#8212;/g, '—')
    .replace(/&ndash;|&#8211;/g, '–')
    .replace(/&#39;|&rsquo;|&#8217;/g, '’')
    .replace(/\s+/g, ' ')
    .trim();

/** Each line of copy: the text between block-level tags. A quote is someone else's words, not the site's. */
export function copyLines(html) {
  return strip(html.replace(/<blockquote[\s\S]*?<\/blockquote>/gi, ' '))
    .split(BLOCK)
    .map(plain)
    .filter((s) => /[A-Za-z]/.test(s));
}

const clip = (s) => (s.length > 90 ? `${s.slice(0, 87)}...` : s);

// Unfairly's deck review (generated-sounding words) and the deck studio's slop
// critic (phrases with nothing concrete behind them), together.
const GENERATED =
  /\b(unlock(?:s|ed|ing)?|unleash(?:es|ed|ing)?|seamless(?:ly)?|effortless(?:ly)?|elevat(?:e|es|ed|ing)|empower(?:s|ed|ing)?|streamlin(?:e|es|ed|ing)|supercharg(?:e|es|ed|ing)|revolutioni[sz](?:e|es|ed|ing)|game[- ]chang(?:er|ing)|cutting[- ]edge|next[- ]gen(?:eration)?|harness(?:es|ed|ing)?|leverag(?:e|es|ed|ing)|robust|delv(?:e|es|ed|ing)|synerg(?:y|ies)|reimagin(?:e|es|ed|ing)|transformative|world[- ]class|best[- ]in[- ]class|transform the way|drive efficiency|future of work|end[- ]to[- ]end platform)\b/i;
const FORMULA = /\bnot (?:just|only|merely)\b[^.]*\bbut\b|\b(?:is|isn't|it's) not\b[^.]*[.,;]\s*(?:it|they|this)(?:'s| is| are)\b|\bisn't\b[^.]*\.\s*(?:it|they|this)(?:'s| is| are)\b/i;
const GENERIC_LABEL = /^(?:overview|introduction|executive summary|key takeaways?|at a glance|the (?:challenge|opportunity|solution)|our approach|what this means|why now|next steps?|deep dive|focus area|strategic priority|north star|chapter|section)(?:\s+\d+)?$/i;
const LABEL_CLASS = /\bclass="[^"]*\b(?:eyebrow|kicker|overline|label|tag)\b[^"]*"/i;
export const HEADLINE_MAX = 110;

/**
 * html: a section (or header/footer) with its tokens filled. Returns
 * { blocking, advisory }: lines saying what's wrong and how to fix it.
 */
export function copyFindings(html, { requireAttribution = false, seller = [] } = {}) {
  if (requireAttribution) html = html.replace(/<\w+\b[^>]*\sdata-copy-ok\b[^>]*>/gi, (tag) =>
    /\bdata-copy-source\s*=\s*["']https?:\/\/[^"']+["']/i.test(tag) ? tag : tag.replace(/\sdata-copy-ok\b(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?/i, ''));
  const blocking = [];
  const advisory = [];
  const lines = copyLines(html);
  const dash = lines.find((l) => /—|\s–\s|\s--\s/.test(l));
  if (dash) blocking.push(`has an em dash ("${clip(dash)}"). Rewrite it with a period, comma, colon, or parentheses.`);
  const dot = lines.find((l) => /·/.test(l));
  if (dot) blocking.push(`strings fragments together with middle dots ("${clip(dot)}"). Write a sentence, or cut the line.`);
  const lead = /<(p|li|dd|div)\b[^>]*>\s*<(strong|b)\b[^>]*>([^<]{1,60}?):\s*<\/\2>|<(p|li|dd|div)\b[^>]*>\s*<(strong|b)\b[^>]*>([^<]{1,60}?)<\/\5>\s*:/i.exec(strip(html));
  if (lead) blocking.push(`opens a line with a bold label and a colon ("${(lead[3] ?? lead[6]).trim()}:"). Write the line as a sentence.`);

  const generated = lines.map((l) => ({ l, m: GENERATED.exec(l) })).find((x) => x.m);
  if (generated) advisory.push(`"${generated.m[0]}" in "${clip(generated.l)}" sounds generated. Say what the thing actually does, for whom.`);
  const formula = lines.find((l) => FORMULA.test(l));
  if (formula) advisory.push(`"${clip(formula)}" is a "not X but Y" construction. Say the claim directly.`);

  for (const [, , inner] of strip(html).matchAll(/<h([12])\b[^>]*>([\s\S]*?)<\/h\1>/gi)) {
    const h = plain(inner);
    if (h.length > HEADLINE_MAX) advisory.push(`the headline runs ${h.length} characters ("${clip(h)}"). Keep it to one claim under ${HEADLINE_MAX}; move the rest into the copy below.`);
    if (/^[^:]{2,60}:\s+\S/.test(h) && !/\d:\d/.test(h)) advisory.push(`"${clip(h)}" is a "Title: subtitle" headline. State the point as one sentence.`);
  }
  for (const m of strip(html).matchAll(/<(\w+)\b([^>]*)>([^<]{1,40})<\/\1>/g)) {
    const label = plain(m[3]);
    if (LABEL_CLASS.test(m[2]) && GENERIC_LABEL.test(label)) advisory.push(`the label "${label}" names nothing the reader can't see. Cut it and keep the space.`);
  }
  // The engine 1.11 tells: blocking on a site pinned sites@1.11+ (or unpinned), warnings before.
  const strict = [...contrastFindings(html), ...hedgeFindings(html, { seller })];
  return { blocking, advisory, strict };
}

// ── Engine 1.11: the tics a final read of real samples kept finding ──
// Read off prose lines: the text between real block tags, so a token's <span> or a
// link inside a sentence doesn't cut it in two. Someone else's words (quotes, data-copy-ok)
// and the fine print (a sources or footnotes block, <small>, <cite>) aren't the page's voice.
const FINE_PRINT = /\b(?:sources?|footnotes?|endnotes?|fine-?print|legal|disclaimers?|citations?|references|credits?|notes-list)\b/i;
const finePrint = (attrs, tag) =>
  /^(?:blockquote|cite|q|small|code|pre)$/i.test(tag) ||
  /\sdata-copy-ok\b/i.test(attrs) ||
  /\srole\s*=\s*"doc-(?:footnote|endnotes?|bibliography)"/i.test(attrs) ||
  FINE_PRINT.test(attrValue(attrs, 'class') ?? '') ||
  FINE_PRINT.test(attrValue(attrs, 'id') ?? '') ||
  FINE_PRINT.test(attrValue(attrs, 'data-section') ?? '');
const PROSE_BLOCK = /<\/?(?:p|li|h[1-6]|div|section|header|footer|nav|td|th|caption|figcaption|dt|dd|button|label|summary|br|ol|ul|table|tr|figure|aside|article|main|details)\b[^>]*>/i;
/** The page's own prose, one line per block, fine print and other people's words out. */
export function proseLines(html) {
  const own = drop(strip(html), finePrint);
  return own.split(PROSE_BLOCK).map(plain).filter((l) => /[A-Za-z]/.test(l));
}
const sentencesOf = (line) => line.split(/(?<=[.!?;])\s+/).filter((x) => /[A-Za-z]/.test(x));
// Words in quotation marks are a quote or a named thing ("the 'not included' column").
const unquoted = (s) => s.replace(/“[^”]*”|"[^"]*"|‘[^’]*’(?!\w)/g, ' ');

// "A scenario, not an estimate." "Setup follows approval, not a calendar." The foil after
// ", not" is a short tail that ends the sentence; "not only", "not yet", "not least" and a
// clause that carries on ("not because...") are ordinary English.
const CONTRAST = /,\s+not\s+(?!(?:only|just|merely|yet|least|necessarily|always|to mention|counting|including|that|because|if|when|unless|since|until|so|even|every|all|everyone)\b)((?:[\w’'$%&+/-]+\s*){1,6})[.;:!?)]*\s*$/i;
/** "X, not Y" contrast lines in the page's own prose. */
export function contrastFindings(html) {
  const out = [];
  for (const line of proseLines(html)) {
    for (const s of sentencesOf(line)) {
      const m = CONTRAST.exec(unquoted(s));
      if (!m) continue;
      out.push(`"${clip(s)}" is an "X, not Y" contrast line. Say what it is and stop; the foil reads as a template's rhythm, not the seller's voice.`);
      break;
    }
    if (out.length >= 3) break;
  }
  return out;
}

// "per Salesforce", "as Acme publishes it", "by its own count", "according to its own...",
// "Acme says": a hedge on the seller's own claim. State it; the source goes in site.json.
const UNITS = new Set('month year seat user day week hour minute unit person employee location site head cent annum capita diem se order job visit technician tech rep account license licence member ticket call shift truck vehicle route store item page click lead deal room bed patient student sku project quarter event mile load case'.split(' '));
const HEDGE_PATTERNS = [
  /\bas\s+(?:[A-Z][\w&.’'-]*\s+){1,4}(?:publishes|reports|puts|describes|states|tells|lists|counts|explains|frames|shows|says|claims)\s+it\b/,
  /\bby\s+(?:its|their|the company[’']s|the vendor[’']s|[A-Z][\w&.-]*[’']s)\s+own\s+(?:count|account|measure|numbers|figures|estimates?|reckoning|tally|telling|description|admission|data|reporting)\b/i,
  /\baccording to\s+(?:its|their)\s+own\b/i,
  /\baccording to\s+(?:the company|the vendor|the seller)\b/i,
  /\b(?:the company|the vendor)\s+(?:says|claims|reports|states)\b/i,
];
const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Attribution hedges in the page's own prose. seller: the seller's names, for "<Seller> says". */
export function hedgeFindings(html, { seller = [] } = {}) {
  const names = [...new Set(seller.filter((n) => typeof n === 'string' && n.trim().length >= 2).map((n) => n.trim()))];
  const own = names.length ? new RegExp(`(?<![\\w])(?:${names.map(reEscape).join('|')})(?:[’']s)?\\s+(?:says|said|claims|reports|states|notes|estimates|reckons|publishes)\\b|\\baccording to\\s+(?:${names.map(reEscape).join('|')})\\b`) : null;
  const out = [];
  for (const line of proseLines(html)) {
    const s = unquoted(line);
    let hit = HEDGE_PATTERNS.map((re) => re.exec(s)).find(Boolean)?.[0] ?? (own ? own.exec(s)?.[0] : undefined);
    if (!hit) {
      for (const m of s.matchAll(/\b[Pp]er\s+([A-Z][\w&.’'-]*)((?:\s+[A-Z][\w&.’'-]*)*)/g)) {
        if (UNITS.has(m[1].toLowerCase().replace(/s$/, ''))) continue;
        hit = m[0];
        break;
      }
    }
    if (!hit) continue;
    out.push(`"${hit}" in "${clip(line)}" hedges a claim by attributing it in the sentence. If it's the seller's own fact, state it plainly; its source goes in site.json "sources" (or a sources footnote), not the copy.`);
    if (out.length >= 3) break;
  }
  return out;
}

// A FAQ is a template's section, not a proposal's: each answer belongs where its question
// comes up. Read from the heading (or its eyebrow) and from the body: a list of questions.
const FAQ_HEAD = /^(?:faqs?|f\.a\.q\.?s?|q\s*(?:&|and)\s*a|(?:frequently asked|common|your|some|good|the|a few|top|buyers?[’']?)\s+questions(?:\s+and answers)?|questions(?:\s+and answers|,?\s+answered|\s+we hear|\s+(?:people|buyers|teams|you|they)\s+ask)?|(?:your|the|their)\s+questions,?\s+answered|ask us anything|before you (?:ask|sign)|what\s+.{1,60}?\s(?:asks?|asked|want to know|wonder(?:s)?)(?:\s+(?:before|about|when|first|most|us|every)\b.*)?)\s*[.?!:]?$/i;
const QUESTION_ITEM = /<(summary|dt|h3|h4|h5|button)\b[^>]*>([\s\S]*?)<\/\1>/gi;
/** Why a section reads as a FAQ, or null. */
export function faqFinding(html) {
  const body = strip(html);
  const heads = [...body.matchAll(/<(h[1-3])\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => plain(m[2]));
  const labels = [...body.matchAll(/<(\w+)\b([^>]*)>([^<]{1,60})<\/\1>/g)].filter((m) => LABEL_CLASS.test(m[2])).map((m) => plain(m[3]));
  const named = [...heads.slice(0, 1), ...labels].find((h) => FAQ_HEAD.test(h) && !/\bwhat you asked for\b/i.test(h));
  const items = [...body.matchAll(QUESTION_ITEM)].map((m) => plain(m[2])).filter((t) => /[A-Za-z]/.test(t));
  const asked = items.filter((t) => /\?\s*$/.test(t));
  const listed = asked.length >= 3 && asked.length / items.length >= 0.6;
  if (!named && !listed) return null;
  const why = named ? `its heading reads as one ("${clip(named)}")` : `${asked.length} of its ${items.length} headings and toggles are questions`;
  return `this section is a FAQ: ${why}. A proposal answers each question where it comes up, in the section it belongs to (the price, the timeline, the scope). Move the answers there and cut the section.`;
}

// ── Simple copy: length limits that keep any one screen from overwhelming ──
// The voice guide's "simplify the copy" rule, measured. All of these are
// warnings: read each one and cut, or keep the line on purpose.
export const LIMITS = {
  heroHeadline: 12, // words in the hero's h1 (two short parts: about 5 and 5)
  heroLede: 30, // words in the hero's one-sentence lede
  heroWords: 80, // every word in the hero, the sample line included
  heroActions: 1, // button-styled actions in the hero (a text link beside it is fine)
  heroFigures: 2, // model figures in the hero; the rest go in the glance band below it
  headline: 18, // words in a section's h2
  lede: 35, // words in a section's lede (a <p> whose class has "lede")
  paragraph: 60, // words in any other paragraph in the reader's path
  sentence: 30, // words in one sentence
};

const countWords = (s) => (s.match(/[A-Za-z0-9$€£][\w$€£%×.,'’-]*/g) ?? []).length;
const sentences = (s) => s.split(/(?<=[.?!])\s+(?=[“"A-Z0-9$])/).filter((x) => /[A-Za-z]/.test(x));

/** The reader's path: what's left once the detail one click away (details, tables, quotes) is out. */
const inPath = (html) =>
  strip(html)
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, ' ')
    .replace(/<details[\s\S]*?<\/details>/gi, ' ')
    .replace(/<table[\s\S]*?<\/table>/gi, ' ')
    .replace(/<figcaption[\s\S]*?<\/figcaption>/gi, ' ');

/**
 * html: a section with its tokens filled. hero: whether it's the page's hero.
 * Returns advisory lines, each saying what's long and what to do about it.
 */
export function simplicityFindings(html, { hero = false } = {}) {
  const out = [];
  const body = inPath(html);
  for (const [, level, inner] of body.matchAll(/<h([12])\b[^>]*>([\s\S]*?)<\/h\1>/gi)) {
    const h = plain(inner);
    const n = countWords(h);
    const max = level === '1' && hero ? LIMITS.heroHeadline : LIMITS.headline;
    if (n > max) out.push(`the headline has ${n} words ("${clip(h)}"). Cut it to ${max} or fewer: one claim, said once.`);
  }
  let heroLede = null;
  for (const m of body.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi)) {
    const p = plain(m[2]);
    if (!/[A-Za-z]/.test(p)) continue;
    const n = countWords(p);
    const isLede = /\bclass="[^"]*lede[^"]*"/i.test(m[1]);
    if (hero && isLede && heroLede === null) heroLede = p;
    const max = isLede ? (hero ? LIMITS.heroLede : LIMITS.lede) : LIMITS.paragraph;
    if (n > max) out.push(`${isLede ? (hero ? 'the hero lede' : 'the lede') : 'a paragraph'} has ${n} words ("${clip(p)}"). Keep it under ${max}; move the detail into a <details> toggle or cut it.`);
    else for (const s of sentences(p)) {
      const k = countWords(s);
      if (k > LIMITS.sentence) {
        out.push(`a sentence has ${k} words ("${clip(s)}"). Split it: one idea per sentence.`);
        break;
      }
    }
  }
  if (hero) {
    if (heroLede && sentences(heroLede).length > 1) out.push(`the hero lede is ${sentences(heroLede).length} sentences ("${clip(heroLede)}"). Keep it to one.`);
    const words = countWords(plain(strip(html).replace(/<details[\s\S]*?<\/details>/gi, ' ')));
    if (words > LIMITS.heroWords) out.push(`the hero holds ${words} words. Keep it near ${LIMITS.heroWords}: who it's for, a short headline, one sentence, one action. The decision and the numbers go in a glance band below it.`);
    const actions = [...strip(html).matchAll(/<(a|button)\b([^>]*)>/gi)].filter(([, , attrs]) => /\bclass="[^"]*\b(?:btn|button|pill|cta)[\w-]*\b[^"]*"/i.test(attrs) && !/\bclass="[^"]*\b(?:text-link|tb-link|link)\b[^"]*"/i.test(attrs));
    if (actions.length > LIMITS.heroActions) out.push(`the hero has ${actions.length} buttons. Keep one primary action and make the second a text link ("See the numbers").`);
  }
  return out;
}
