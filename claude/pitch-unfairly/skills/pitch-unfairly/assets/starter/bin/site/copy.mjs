// The copy rules a site's words are held to: the same ones Unfairly's deck
// review and house style apply (em dashes, middle-dot lists, bolded-colon
// lead-ins block; generated-sounding words, "not just X but Y", "Title:
// subtitle" headlines, overlong headlines and labels that name nothing are
// worth a read). Read off the page as the reader sees it, tokens filled.

const BLOCK = /<\/?(?:p|li|h[1-6]|div|section|header|footer|td|th|caption|figcaption|blockquote|dt|dd|button|a|label|summary|small|span)\b[^>]*>/i;

const strip = (html) =>
  html
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
