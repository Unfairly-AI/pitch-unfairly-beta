// The copy rules a site's words are held to: the same ones Unfairly's deck
// review and house style apply (em dashes, middle-dot lists, bolded-colon
// lead-ins block; generated-sounding words, "not just X but Y", "Title:
// subtitle" headlines, overlong headlines and labels that name nothing are
// worth a read). Read off the page as the reader sees it, tokens filled.

const BLOCK = /<\/?(?:p|li|h[1-6]|div|section|header|footer|td|th|caption|figcaption|blockquote|dt|dd|button|a|label|summary|small|span)\b[^>]*>/i;

// Someone else's words, marked data-copy-ok (a verbatim quote that keeps its own
// dash), aren't the site's copy: the rules below leave them alone, as they do a <blockquote>.
const theirs = (html) => html.replace(/<(\w+)\b[^>]*\sdata-copy-ok\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');

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
export function copyFindings(html) {
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
  return { blocking, advisory };
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
