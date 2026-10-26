// The one-shot lead proposal rules (engine 1.8), checked on a site's source.
//
// A lead sample ("sample": { "lead": true, ... } in site.json) is a proposal a
// prospect's reps could send one of their own buyers, made by Unfairly as the
// demo. The page is theirs: it says what it is, carries Unfairly at most twice
// and none of our pitch, promises nothing in our own words, names no other
// prospect, and every claim on it traces to a source. Rules that also hold for
// every site: a scroll link says where it goes, a date or term on the page says
// what kind of commitment it is, and money is only money.
//
// Every rule here blocks on an unpinned site or one pinned sites@1.8+, and is a
// warning on an older pin, as its pin promises.
import { fillTokens } from './fill.mjs';
import { evaluate, format, runModel } from './model.mjs';

const VOID = /^(?:area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/i;

/** The element that opens at `at` (a <tag ...>), through its matching close tag. */
export function element(html, at, tag) {
  const open = /^<[^>]*>/.exec(html.slice(at))?.[0] ?? '';
  if (VOID.test(tag) || open.endsWith('/>')) return open;
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
  re.lastIndex = at;
  let depth = 0;
  for (let m; (m = re.exec(html)); ) {
    if (!m[1] && (VOID.test(tag) || m[0].endsWith('/>'))) continue;
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(at, re.lastIndex);
  }
  return html.slice(at);
}

/** The outermost elements whose opening tag passes test(attrs, tag): [{ at, tag, attrs, html }]. */
export function elements(html, test) {
  const out = [];
  let end = 0;
  for (const m of html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)) {
    if (m.index < end || !test(m[2], m[1])) continue;
    const html_ = element(html, m.index, m[1]);
    out.push({ at: m.index, tag: m[1], attrs: m[2], html: html_ });
    end = m.index + html_.length;
  }
  return out;
}

/** html with every element that passes test(attrs, tag) taken out. */
export function drop(html, test) {
  let out = '';
  let from = 0;
  for (const e of elements(html, test)) {
    out += `${html.slice(from, e.at)} `;
    from = e.at + e.html.length;
  }
  return out + html.slice(from);
}

export const attr = (attrs, name) => new RegExp(`\\s${name}(?:\\s*=\\s*"([^"]*)"|\\s*=\\s*'([^']*)'|(?=[\\s/>]|$))`, 'i').exec(attrs);
export const attrValue = (attrs, name) => {
  const m = attr(attrs, name);
  return m ? (m[1] ?? m[2] ?? '') : undefined;
};
const hasClass = (attrs, re) => re.test(attrValue(attrs, 'class') ?? '');

const isBand = (attrs) => !!attr(attrs, 'data-sample');
const isPdfOnly = (attrs) => hasClass(attrs, /\bpdf-only\b/);
// Hidden somewhere a reader looks: on screen, on a phone or in the PDF. A qualifier
// hidden in any of them doesn't qualify what it sits beside.
const isHidden = (attrs) =>
  !!attr(attrs, 'hidden') ||
  !!attr(attrs, 'data-pdf-hide') ||
  /\saria-hidden\s*=\s*"true"/i.test(attrs) ||
  hasClass(attrs, /\b(?:pdf-only|pdf-hide|sr-only|visually-hidden)\b/) ||
  /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(attrValue(attrs, 'style') ?? '');
/** html as every reader sees it: hidden elements (and everything inside them) and closed <details> bodies out. */
const shownToAll = (html) => {
  const open = drop(html, (a) => isHidden(a));
  return drop(open, (a, t) => /^details$/i.test(t)) + elements(open, (a, t) => /^details$/i.test(t)).map((d) => elements(d.html, (a, t) => /^summary$/i.test(t)).map((e) => e.html).join(' ')).join(' ');
};
// Hidden from one output only. A qualifier may differ between screen and PDF (a
// .pdf-only line for the paper, a data-pdf-hide one for the web), as long as each has one.
const hiddenAlways = (attrs) =>
  !!attr(attrs, 'hidden') ||
  /\saria-hidden\s*=\s*"true"/i.test(attrs) ||
  hasClass(attrs, /\b(?:sr-only|visually-hidden)\b/) ||
  /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(attrValue(attrs, 'style') ?? '');
const hiddenOn = {
  screen: (attrs) => hiddenAlways(attrs) || isPdfOnly(attrs),
  pdf: (attrs) => hiddenAlways(attrs) || !!attr(attrs, 'data-pdf-hide') || hasClass(attrs, /\bpdf-hide\b/),
};
/** html as one output shows it: the screen (closed <details> bodies out) or the PDF (only data-pdf-open ones open). */
const shownOn = (html, mode) => {
  const open = drop(html, hiddenOn[mode]);
  const closed = (a, t) => /^details$/i.test(t) && (mode === 'screen' || !attr(a, 'data-pdf-open'));
  return drop(open, closed) + elements(open, closed).map((d) => elements(d.html, (a, t) => /^summary$/i.test(t)).map((e) => e.html).join(' ')).join(' ');
};
/** The non-empty elements carrying attribute name, as shown on both the screen and in the PDF. */
const shownOnBoth = (html, name) => ['screen', 'pdf'].map((mode) => elements(shownOn(html, mode), (a) => !!attr(a, name)).filter((e) => words(e.html).length > 0));
// Someone else's words: a quotation, a citation, or a span marked as theirs.
const isTheirs = (attrs, tag) => /^(?:blockquote|cite|q)$/i.test(tag) || hasClass(attrs, /\btheir-words\b/) || !!attr(attrs, 'data-copy-ok');
// A date or a term the page commits to, marked as such.
const isCommitment = (attrs) => /\sdata-(?:date|commitment)(?=[\s=/>]|$)/i.test(attrs);

const decode = (s) =>
  s
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&#8217;/g, '’')
    .replace(/&ndash;|&#8211;/g, '–');

/** What the reader reads: the text between the tags, decoded, one space apart. */
const words = (html) =>
  decode(
    html
      .replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();

/** Each line of copy (the text between block-level tags), so a heading never runs into the paragraph below it. */
const lines = (html) =>
  html
    .replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/gi, ' ')
    .split(/<\/?(?:p|li|h[1-6]|div|section|header|footer|nav|td|th|caption|figcaption|blockquote|dt|dd|button|a|label|summary|small|br|ol|ul|table|tr|figure|aside|article|main)\b[^>]*>/i)
    .map(words)
    .filter((x) => /[A-Za-z]/.test(x));

const clip = (s) => (s.length > 90 ? `${s.slice(0, 87)}...` : s);
const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ── Commitments typed into a lead page ──
const NUMWORD = '(?:\\d+|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fourteen|fifteen|twenty|thirty|forty-five|sixty|ninety)';
const DURATION = new RegExp(`\\b${NUMWORD}(?:\\s*(?:-|–|to)\\s*${NUMWORD})?[-\\s](?:business[-\\s]|working[-\\s]|calendar[-\\s])?(?:day|week|month)s?\\b`, 'i');
const MONTH = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
const DAY_DATE = new RegExp(`\\b${MONTH}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?\\b|\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH}\\b`);
const COMMIT_WORD = /\b(?:trials?|pilots?|go[- ]lives?|kick-?offs?|roll-?outs?|first payroll)\b/i;
// A looser date: enough to tie a trial, a pilot or a go-live to the calendar.
const WHEN = /\b(?:January|February|March|April|June|July|August|September|October|November|December|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b|\bQ[1-4]\b|\bnext (?:week|month|quarter)\b|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b|\b\d{4}-\d{2}-\d{2}\b|\b20\d{2}\b/;

/** The sentences in `text` that commit to a date, a duration or a dated trial. */
export function typedCommitments(text) {
  return text
    .split(/(?<=[.?!])\s+/)
    .filter((s) => DURATION.test(s) || DAY_DATE.test(s) || (COMMIT_WORD.test(s) && WHEN.test(s)));
}

// ── Our pitch, which belongs in the note ──
// Phrases that name Unfairly as the maker or narrator, and our offer's copy. A seller's
// own "Email us" or "Book a call" is theirs; a link to us is ours wherever it says.
// Offer copy that doesn't name us ("within 48 hours") could be the seller's, so only
// copy that names Unfairly, and links to our sites, count.
const PITCH = [/A note from Unfairly/i, /\bUnfairly built\b/i, /Made by Unfairly/i, /\bfrom Unfairly\b/i];
const OUR_HOST = /(?:^|\.)(?:unfairly\.ai|pitchunfairly\.com)$/i;
/** The host a link goes to (a web page's, or a mailto's domain). */
const linkHost = (href) => /^https?:\/\/(?:[^@/?#]*@)?([^/?#:]+)/i.exec(href)?.[1] ?? /^mailto:[^@?]*@([^?&,\s]+)/i.exec(href)?.[1] ?? null;
// Unfairly's home pages: the bare domains (or www.), on any path that isn't a flow.
const OUR_HOME = /^(?:www\.)?(?:unfairly\.ai|pitchunfairly\.com)$/i;
const FLOW_PATH = /^\/(?:claim|book|booking|schedule|meet|meeting|calendar|call|demo|contact|signup|sign-up|signin|sign-in|login|start|trial|checkout|pay)(?:[/?#.-]|$)/i;
const BOOKING_HOST = /(?:^|\.)(?:calendly\.com|cal\.com|savvycal\.com|chilipiper\.com|hubspot\.com|zcal\.co|tidycal\.com)$/i;
/** Why a link in the sample band doesn't go to an Unfairly home page, or null when it does. */
export function bandLinkProblem(href) {
  if (/^mailto:/i.test(href)) return 'an email address';
  if (/^tel:/i.test(href)) return 'a phone number';
  const m = /^https?:\/\/(?:[^@/?#]*@)?([^/?#:]+)(?::\d+)?([^?#]*)/i.exec(href);
  if (!m) return 'which isn\'t a web page of ours';
  const [, host, path] = m;
  if (BOOKING_HOST.test(host)) return 'a booking calendar';
  if (OUR_HOST.test(host) && !OUR_HOME.test(host)) return `which is ${host}, not our home page`;
  if (!OUR_HOST.test(host)) return `which isn't Unfairly's (${host})`;
  if (FLOW_PATH.test(path)) return 'a booking, claim or sign-up flow';
  return null;
}

// A plain number typed into copy (not a year, not a figure the copy rules already catch).
const PLAIN_NUMBER = /(?<![\w.,$€£:/-])\d[\d,]*(?:\.\d+)?(?!\d|[.,]\d|\s?[%×])/g;

// A buyer called "Example manufacturer" tells the reader nobody thought about them.
const PLACEHOLDER_NAME = /^(?:example|sample|acme|fictional|test|demo|placeholder|client|customer|buyer|employer|company)\b|example/i;
// A category phrase ("a self-funded employer") is the band's "could send <buyer>"; a name starts with a capital.
const looksLikeName = (s) => /^[A-Z]/.test(s) && !/^(?:A|An|The|Any|One|Some)\s/.test(s);
// Hedges in the page's own words. One beside a figure is honest; many read as doubt.
const HEDGES = /\billustrative\b|\bnot a forecast\b|\bnot a quote\b|\bactual results vary\b|\bnot an expectation\b|\bno purchase\b|\bdoes not guarantee\b|\bfor illustration\b|\bhypothetical\b/gi;
export const HEDGE_LIMIT = 4;

export const BASES = ['sourced', 'supplied', 'proposed'];
export const VALUE_TYPES = ['cash', 'capacity', 'time', 'count', 'rate'];
const MONEY = /^money(?:_k|_exact)?$/;
const DATED_PROOF = /rank|award|rating|report|survey/i;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Whether site.json marks this site a lead sample. */
export const isLead = (site) => !!(site?.sample && typeof site.sample === 'object' && site.sample.lead === true);

const stripFacts = (p) => String(p).replace(/^facts\./, '');

/**
 * The 1.8 rules. files: [{ where, html, section }] for header, sections and
 * footer (section: true for a section file). blocks: whether this pin makes
 * the rules blocking. Returns { errors, warnings }.
 */
export function leadFindings({ site, files, blocks, sampleBlocks = blocks, bandBlocks = sampleBlocks, today = new Date().toISOString().slice(0, 10) }) {
  const errors = [];
  const warnings = [];
  const lead = isLead(site);
  const must = (m) => (blocks ? errors : warnings).push(m);
  const filled = (html) => fillTokens(html, site).html;
  const sample = lead ? site.sample : {};
  const sources = Object.fromEntries(Object.entries(site.sources ?? {}).map(([k, v]) => [stripFacts(k), v]));
  const fictional = (Array.isArray(site.fictional) ? site.fictional : []).map(stripFacts);
  const sourceFor = (path) => {
    const parts = path.split('.');
    for (let n = parts.length; n > 0; n--) {
      const key = parts.slice(0, n).join('.');
      if (Object.hasOwn(sources, key)) return [key, sources[key]];
    }
    return null;
  };
  const isFictional = (path) => fictional.some((p) => path === p || path.startsWith(`${p}.`));
  const isSupplied = (entry) => !!entry && typeof entry === 'object' && 'supplied_by' in entry;
  const factValue = (path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), site.facts ?? {});
  const escText = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // ── B. A link that scrolls says where it goes (every site) ──
  for (const { where, html } of files) {
    for (const m of html.matchAll(/<a\b[^>]*\shref="#[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)) {
      const label = words(filled(m[1]));
      if (/^(?:run|calculate|compute|estimate|get (?:your )?(?:results|estimate))\b/i.test(label)) must(`${where}: the link "${label}" only scrolls; say where it goes ("See the numbers", "Explore the model"). "Run" or "Calculate" belongs on a control that computes and shows its result in place.`);
    }
  }

  // ── C. Every date and term says what kind of commitment it is (every site; blocking on a lead) ──
  const commit = (m) => (lead && blocks ? errors : warnings).push(m);
  if (lead || blocks) {
    // Qualified on screen and in the PDF, by one note or by one for each.
    const visibleConditional = (html) => shownOnBoth(html, 'data-conditional').every((shown) => shown.length > 0);
    const elsewhere = files.filter((f) => !f.section && visibleConditional(f.html)).map((f) => f.where);
    for (const { where, html, section } of files) {
      const conditional = visibleConditional(html);
      for (const m of html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)) {
        const attrs = m[2];
        if (!isCommitment(attrs)) continue;
        const date = attrValue(attrs, 'data-date');
        const what = date !== undefined ? `data-date="${date}"` : `the commitment "${clip(words(filled(element(html, m.index, m[1])))) || attrValue(attrs, 'data-commitment')}"`;
        const basis = attrValue(attrs, 'data-basis');
        if (!BASES.includes(basis)) {
          commit(`${where}: ${what} has no data-basis. Say what kind of commitment it is: data-basis="sourced" (a vendor term, with data-source naming its fact), "supplied" (a deal fact the seller gave), or "proposed" (a scenario assumption, with a [data-conditional] note beside it). Unknowns never become promises.`);
          continue;
        }
        if (basis === 'sourced' || basis === 'supplied') {
          const src = attrValue(attrs, 'data-source');
          const found = src ? sourceFor(stripFacts(src)) : null;
          if (!src) commit(basis === 'sourced'
            ? `${where}: ${what} is data-basis="sourced" but has no data-source. Name the fact it comes from (data-source="trial.length"), with its entry in site.json "sources".`
            : `${where}: ${what} is data-basis="supplied" but has no data-source. Name the deal fact it comes from (data-source="deal.schedule"), with a sources entry saying who supplied it: { "supplied_by", "received" }.`);
          else if (!found) commit(`${where}: ${what} cites data-source="${src}", which site.json "sources" doesn't have. Add it: { "url", "accessed", "verbatim" } for a vendor term, { "supplied_by", "received" } for a deal fact.`);
          else if (basis === 'supplied' && !isSupplied(found[1])) commit(`${where}: ${what} is data-basis="supplied", but sources["${found[0]}"] is a published source, not a deal fact. Mark it "sourced", or record who supplied it: { "supplied_by", "received" }.`);
          else if (basis === 'sourced' && isSupplied(found[1])) commit(`${where}: ${what} is data-basis="sourced", but sources["${found[0]}"] was supplied by ${found[1].supplied_by}. Mark it data-basis="supplied".`);
          if (src) {
            // A sourced or supplied term shows its evidence's own value: typed terms drift (a
            // sourced 21 days becomes "30-day"), and an unrelated fact can't vouch for a promise.
            const inner = element(html, m.index, m[1]);
            const path = stripFacts(src);
            const shows = [...inner.matchAll(/\{\{\s*facts\.([\w.]+)\s*\}\}/g)].some(([, p]) => p === path || p.startsWith(`${path}.`));
            if (!shows) commit(`${where}: ${what} is ${basis} from "${path}" but doesn't show it. Put {{facts.${path}}} in the element, so the page says exactly what ${basis === 'sourced' ? 'the source' : 'the seller'} gave.`);
            for (const t of new Set(lines(inner.replace(/\{\{[\s\S]*?\}\}/g, ' ')).flatMap(typedCommitments))) commit(`${where}: "${clip(t)}" types a term beside its ${basis === 'sourced' ? 'source' : 'supplied fact'} ("${path}"). Show only {{facts.${path}}}: a typed term can contradict it.`);
          }
        }
        if (basis === 'proposed' && !conditional) {
          const footerOnly = section && elsewhere.length;
          commit(`${where}: ${what} is proposed, but nothing in ${section ? 'its section' : where} says so. Put a visible [data-conditional] note in the same section, next to it ("Proposed: the dates move with contract signature").${footerOnly ? ` The one in ${elsewhere.join(' and ')} doesn't count: a footer disclaimer can't qualify a promise.` : ''}`);
        }
      }
      if (!lead) continue;
      // Typed dates, durations and dated trials outside a marked element. Tokens
      // and quotes are someone's recorded fact, not the page's promise.
      // A fictional fact is the page's own invention, so its words are read as typed.
      const outside = drop(drop(html, isCommitment), isTheirs);
      const invented = [];
      const withFiction = outside
        .replace(/\{\{\s*facts\.([\w.]+)\s*\}\}/g, (whole, path) => {
          const v = factValue(path);
          if (!isFictional(path) || sourceFor(path) || v == null || typeof v === 'object') return ' ';
          invented.push([path, String(v)]);
          return escText(v);
        })
        .replace(/\{\{[\s\S]*?\}\}/g, ' ');
      for (const s of new Set(lines(withFiction).flatMap(typedCommitments))) {
        // Typed words commit on their own; otherwise the fictional value is what commits.
        const typedAlone = typedCommitments(invented.reduce((t, [, v]) => t.split(v).join(' '), s)).length > 0;
        const from = typedAlone ? [] : invented.filter(([, v]) => s.includes(v)).map(([p]) => p);
        if (from.length) commit(`${where}: "${clip(s)}" puts a date, duration or trial on the page through fictional data ({{facts.${from[0]}}}). Make it a data-commitment with data-basis="proposed" and a [data-conditional] note beside it, or sequence by dependency instead.`);
        else commit(`${where}: "${clip(s)}" types a date, duration or trial into the page. Mark it (data-commitment with data-basis="sourced", "supplied" or "proposed" beside a [data-conditional] note), use a sourced {{facts...}} term, or sequence the steps by dependency instead of the calendar.`);
      }
    }
  }

  // ── D. Sources: every claim traces to one ──
  for (const [key, entry] of Object.entries(sources)) {
    const at = `site.json sources["${key}"]`;
    if (!entry || typeof entry !== 'object') {
      must(`${at}: should be { "url", "accessed", "verbatim" } (a published source) or { "supplied_by", "received" } (a deal fact).`);
      continue;
    }
    if (isSupplied(entry)) {
      // A deal fact the seller gave: who gave it and when, instead of a page and its date.
      if (typeof entry.supplied_by !== 'string' || !entry.supplied_by.trim()) must(`${at}: "supplied_by" should say who supplied this deal fact.`);
      if (!ISO_DAY.test(String(entry.received ?? ''))) must(`${at}: "received" should be the ISO day it was supplied, like "${today}".`);
      if (entry.note !== undefined && typeof entry.note !== 'string') must(`${at}: "note" should be text.`);
      continue;
    }
    if (!/^https:\/\/\S+$/.test(String(entry.url ?? ''))) must(`${at}: "url" should be the https:// page the fact was read on.`);
    if (!ISO_DAY.test(String(entry.accessed ?? ''))) must(`${at}: "accessed" should be the ISO day it was read, like "${today}".`);
    if (typeof entry.verbatim !== 'boolean') must(`${at}: "verbatim" should be true (the source's exact words) or false (paraphrased).`);
    if (ISO_DAY.test(String(entry.accessed ?? '')) && ISO_DAY.test(today) && (DATED_PROOF.test(key) || DATED_PROOF.test(String(entry.qualifier ?? '')))) {
      const days = Math.round((Date.parse(today) - Date.parse(entry.accessed)) / 864e5);
      if (days > 30) warnings.push(`${at}: dated proof (a rank, award, rating, report or survey) last read ${entry.accessed}, ${days} days ago. Re-verify it on publish day: open ${entry.url}, confirm it still says this, and update "accessed".`);
    }
  }
  if (site.fictional !== undefined && !(Array.isArray(site.fictional) && site.fictional.every((p) => typeof p === 'string'))) must('site.json "fictional" should be a list of fact paths and model input names that are the fictional buyer\'s example data.');
  if (lead) {
    for (const { where, html } of files) {
      const claimed = drop(html, isBand);
      for (const path of new Set([...claimed.matchAll(/\{\{\s*facts\.([\w.]+)\s*\}\}/g)].map((m) => m[1]))) {
        if (!sourceFor(path) && !isFictional(path)) must(`${where}: {{facts.${path}}} has no source. Add site.json "sources"["${path}"] (url, accessed, verbatim), or list it in "fictional" if it's the fictional buyer's example data: every claim traces to a source.`);
      }
      // A plain number is a claim too: it comes from a sourced or fictional fact, not the keyboard.
      // An action's own label ("Book 30 minutes") names the action, not a claim.
      const copy = words(drop(drop(drop(drop(claimed, isTheirs), isCommitment), (a, t) => /^svg$/i.test(t)), (a, t) => /^(?:a|button)$/i.test(t) || !!attr(a, 'data-cta')).replace(/\{\{[\s\S]*?\}\}/g, ' '));
      for (const n of new Set(copy.match(PLAIN_NUMBER) ?? [])) {
        const digits = n.replace(/[,.]/g, '');
        const v = Number(n.replace(/,/g, ''));
        if (digits.length < 2 || (Number.isInteger(v) && v >= 1900 && v <= 2100 && !n.includes(','))) continue;
        must(`${where}: "${n}" is a number typed into the copy. Put it in site.json facts with a source, or in fictional (the buyer's example data), and use its {{token}}: every claim traces to a source.`);
      }
      for (const q of elements(claimed, (a, t) => /^blockquote$/i.test(t))) {
        for (const [, path] of q.html.matchAll(/\{\{\s*facts\.([\w.]+)\s*\}\}/g)) {
          const found = sourceFor(path);
          if (found && found[1]?.verbatim !== true) must(`${where}: {{facts.${path}}} is quoted in a <blockquote>, but sources["${found[0]}"] isn't "verbatim": true. Quote only the source's exact words, or take it out of the quote.`);
          else if (!found) must(`${where}: {{facts.${path}}} is quoted in a <blockquote> with no source. A quote needs a sources entry with "verbatim": true.`);
        }
      }
    }
  }

  // ── E. Structured assumptions: money is only money, and a partial total says so ──
  const model = site.model ?? {};
  const types = model.types ?? {};
  const excludes = model.excludes ?? {};
  const names = new Set([...Object.keys(model.inputs ?? {}), ...Object.keys(model.formulas ?? {})]);
  for (const [name, type] of Object.entries(types)) {
    if (!names.has(name)) must(`site.json model.types: "${name}" isn't a model input or formula.`);
    if (!VALUE_TYPES.includes(type)) must(`site.json model.types.${name}: "${type}" should be one of ${VALUE_TYPES.map((t) => `"${t}"`).join(', ')}.`);
    else if (MONEY.test(model.formats?.[name] ?? '') && ['capacity', 'time', 'count'].includes(type)) must(`site.json model: "${name}" is ${type} formatted as money, so the page shows capacity as cash. Format it as ${type === 'time' ? 'hours or days' : 'a count'} ("int" or "number") and say its unit, or type it "cash" only if that money changes hands.`);
  }
  for (const [name, note] of Object.entries(excludes)) {
    if (!names.has(name)) must(`site.json model.excludes: "${name}" isn't a model input or formula.`);
    if (typeof note !== 'string' || !note.trim()) must(`site.json model.excludes.${name}: say what this total leaves out, in words.`);
  }
  const shownIn = (html) => {
    const out = new Set();
    for (const [, body] of html.matchAll(/\{\{\s*(=?[^}]*?)\s*\}\}/g)) {
      if (body.startsWith('=')) for (const [n] of body.slice(1).split('|')[0].matchAll(/[A-Za-z_]\w*/g)) out.add(n);
      else if (!body.startsWith('facts.') && !body.startsWith('>')) out.add(body.trim());
    }
    return out;
  };
  const shown = new Set(files.flatMap((f) => [...shownIn(f.html)]));
  if (lead) {
    for (const name of names) {
      if (shown.has(name) && MONEY.test(model.formats?.[name] ?? '') && !types[name]) must(`site.json model: "${name}" is shown as money but has no type. Add model.types.${name}: "cash" (money that changes hands), or "capacity", "time" or "count" with a format that isn't money.`);
    }
  }
  // A one-off formula shown as money is held to the same rule as a named one.
  const NON_CASH = ['capacity', 'time', 'count'];
  for (const { where, html } of files) {
    for (const [whole, expr, fmt] of html.matchAll(/\{\{\s*=\s*([^}|]+?)\s*\|\s*(\w+)\s*\}\}/g)) {
      if (!MONEY.test(fmt)) continue;
      const used = [...new Set([...expr.matchAll(/[A-Za-z_]\w*/g)].map(([n]) => n).filter((n) => names.has(n)))];
      const noncash = used.filter((n) => NON_CASH.includes(types[n]));
      // A count or time times a price or rate is money (seats × price, hours × rate); without one it isn't.
      const priced = used.some((n) => types[n] === 'cash' || types[n] === 'rate');
      if (noncash.length && !priced) must(`${where}: ${whole} shows "${noncash[0]}" (${types[noncash[0]]}) as money: capacity shown as cash. Show it in its own unit, or type it "cash" only if that money changes hands.`);
      else if (lead && !priced && !used.every((n) => types[n])) must(`${where}: ${whole} is shown as money, but none of its names is typed "cash". Add model.types for ${used.filter((n) => !types[n]).map((n) => `"${n}"`).join(', ') || 'its names'}.`);
    }
  }
  // Money prints in whole dollars or in cents, never "$158.4".
  let env = null;
  try {
    env = runModel(model);
  } catch {
    // A broken model is reported by checkSite.
  }
  const ONE_DECIMAL = /\d\.\d(?!\d)/;
  const moneyish = (name, fmt) => MONEY.test(fmt ?? '') || (['cash', 'rate'].includes(types[name]) && /^(?:number)?$/.test(fmt ?? ''));
  const DOLLAR_FIX = 'Show whole dollars (format "money") or cents (format "money_exact", which always prints two).';
  if (env) {
    for (const name of names) {
      const fmt = model.formats?.[name];
      if (typeof env[name] !== 'number' || !moneyish(name, fmt)) continue;
      const out = format(env[name], fmt);
      if (ONE_DECIMAL.test(out)) must(`site.json model: "${name}" prints "${out}": money to one decimal. ${DOLLAR_FIX}`);
    }
    for (const { where, html } of files) {
      for (const [whole, expr, fmt] of html.matchAll(/\{\{\s*=\s*([^}|]+?)\s*\|\s*(\w+)\s*\}\}/g)) {
        if (!MONEY.test(fmt)) continue;
        let out;
        try {
          out = format(evaluate(expr, env), fmt);
        } catch {
          continue;
        }
        if (ONE_DECIMAL.test(out)) must(`${where}: ${whole} prints "${out}": money to one decimal. ${DOLLAR_FIX}`);
      }
    }
  }
  for (const { where, html } of files) {
    const here = shownIn(html);
    // Named on screen and in the PDF (one line, or one for each).
    const [onScreen, inPdf] = shownOnBoth(html, 'data-excludes').map((shown) => new Set(shown.flatMap((e) => attrValue(e.attrs, 'data-excludes').split(/[\s,]+/))));
    const marked = new Set([...onScreen].filter((n) => inPdf.has(n)));
    for (const name of Object.keys(excludes)) {
      if (here.has(name) && !marked.has(name)) must(`${where}: {{${name}}} is a partial total (it leaves out ${String(excludes[name]).replace(/\.$/, '')}), and nothing beside it says so. Put data-excludes="${name}" on the visible line that names what it leaves out, in the same section: a partial total names what it leaves out, next to the total.`);
    }
  }

  // ── S. Every sample (engine 1.10): the page is the seller's, never our ad ──
  // A sample is a proposal someone else could send. Unfairly's booking buttons, its
  // "yours could look like this", the viewers demo and the house close are our pitch,
  // and our pitch goes in the note. The band says what the page is; at most it links
  // once to who made it ("Made by Unfairly").
  if (site?.sample) {
    const ad = (m) => (sampleBlocks ? errors : warnings).push(m);
    const band11 = (m) => (bandBlocks ? errors : warnings).push(m);
    const PITCH_BTN = /^(?:book_meeting|talk_to_us|book|email|contact)$/i;
    const PITCH_LABEL = /\b(?:book|schedule|email|talk to us|get in touch|call us)\b/i;
    for (const { where, html } of files) {
      for (const band of elements(html, isBand)) {
        const ctas = elements(band.html, (a) => !!attr(a, 'data-cta'));
        const pitched = ctas.filter((c) => PITCH_BTN.test(attrValue(c.attrs, 'data-cta') ?? '') || PITCH_LABEL.test(words(filled(c.html))) || /^mailto:/i.test(attrValue(c.attrs, 'href') ?? ''));
        for (const c of pitched) ad(`${where}: the sample band carries Unfairly's booking pitch ("${clip(words(filled(c.html))) || attrValue(c.attrs, 'data-cta')}"). A sample's band says what the page is and links at most once, to "Made by Unfairly"; booking and email go in the note.`);
        if (!lead && ctas.length > 1) ad(`${where}: the sample band has ${ctas.length} calls to action. A sample's band carries one at most, "Made by Unfairly".`);
        const bandWords = words(filled(drop(band.html, (a) => !!attr(a, 'data-cta'))));
        const asks = /\b(?:book|email)\b|calendly\.com|@unfairly\.ai/i.test(bandWords);
        if (asks) ad(`${where}: the sample band asks the reader to book or email us ("${clip(bandWords)}"). It says what the page is; our pitch goes in the note.`);
        // Engine 1.11: the band's link goes where its label says, an Unfairly home page,
        // whatever the label ("Made by Unfairly" pointing at a booking calendar is a booking
        // link). The PDF strip counts too, and so does a contact it prints as text.
        const strip = isPdfOnly(band.attrs) ? 'the PDF strip of the sample band' : 'the sample band';
        for (const a of elements(band.html, (attrs) => attr(attrs, 'href') !== null)) {
          if (pitched.some((c) => c.at === a.at && c.html === a.html)) continue;
          const href = decode(fillTokens(attrValue(a.attrs, 'href') ?? '', site).html).trim();
          const wrong = bandLinkProblem(href);
          if (wrong) band11(`${where}: ${strip} links to ${href || '(no address)'}, ${wrong}. Its one link goes to an Unfairly home page (https://unfairly.ai/ or https://pitchunfairly.com/), never a booking, claim or contact flow; booking and email go in the note.`);
        }
        const printed = words(filled(band.html));
        const contact = !asks && /\bbob@|[\w.+-]+@unfairly\.ai\b|calendly|\bcal\.com\b/i.exec(printed);
        if (contact) band11(`${where}: ${strip} prints a way to reach us ("${contact[0]}"). It says what the page is; our contact goes in the note.`);
      }
      const offBand = filled(drop(html, isBand));
      const yours = /\b(?:yours could look like this|your team could send this|a page like this for your|want one like this)\b/i.exec(words(filled(html)));
      if (yours) ad(`${where}: "${yours[0]}" pitches Unfairly inside the proposal. The page is the seller's; our pitch goes in the note.`);
      if (elements(html, (a) => hasClass(a, /\btb-viewers\b/) || attrValue(a, 'data-section') === 'viewers' || attrValue(a, 'id') === 'viewers').length) ad(`${where}: the viewers demo (who read it, by named link) is Unfairly's product pitch, not part of the seller's proposal. Take it out; show it in the note or on our own site.`);
      if (elements(html, (a) => hasClass(a, /\btb-sample-close\b/)).length) ad(`${where}: the house close (.tb-sample-close) is Unfairly's booking pitch. Close with the seller's own next step.`);
      if (!lead) {
        for (const [, href] of offBand.matchAll(/\shref="([^"]*)"/g)) {
          const host = linkHost(decode(href));
          if (host && OUR_HOST.test(host)) ad(`${where}: links to ${decode(href)}, which is Unfairly's. Outside the sample band every link is the seller's.`);
        }
      }
    }
    if (!lead) {
      const screen = words(filled(files.map((f) => drop(f.html, (a) => isPdfOnly(a) || !!attr(a, 'hidden'))).join('\n')));
      const ours = (screen.match(/\bUnfairly\b/g) ?? []).length;
      if (ours > 2) ad(`"Unfairly" appears ${ours} times on screen. Twice at most: a "Made by Unfairly" link in the sample band and the footer.`);
    }
  }

  if (!lead) return { errors, warnings };

  // ── A. The lead sample: it says what it is, and the page stays theirs ──
  if (sample.exclude_names !== undefined && !(Array.isArray(sample.exclude_names) && sample.exclude_names.every((n) => typeof n === 'string'))) must('site.json sample.exclude_names should be a list of names (other prospects, their aliases and fictional clients).');
  const all = files.map((f) => f.html).join('\n');
  const page = filled(all);
  const said = words(page);
  for (const phrase of ['Example: a proposal', 'Made by Unfairly']) if (!said.toLowerCase().includes(phrase.toLowerCase())) must(`The page must say "${phrase}" (the sample band says who is selling to whom, with one "Made by Unfairly" link).`);
  if (sample.seller && sample.buyer) {
    const line = `Example: a proposal ${sample.seller} could send ${sample.buyer}`;
    if (said.toLowerCase().includes('example: a proposal') && !said.toLowerCase().includes(line.toLowerCase())) warnings.push(`The sample band should read "${line}", so the reader knows who is selling to whom.`);
  }
  const bands = files.flatMap((f) => elements(f.html, isBand).filter((e) => !isPdfOnly(e.attrs)));
  const bandCtas = bands.flatMap((b) => [...b.html.matchAll(/\sdata-cta="([^"]*)"/g)].map((m) => m[1]));
  if (!bandCtas.length) must('site.json says this is a lead sample, but the page has no sample band with its one call to action. Put the sample band in header.html (data-sample) with a single "Made by Unfairly" data-cta link: the only call to action on the page that is Unfairly\'s.');
  else if (bandCtas.length > 1) must(`The sample band has ${bandCtas.length} calls to action (${bandCtas.join(', ')}). A lead sample carries one, "Made by Unfairly"; booking and email go in the note.`);
  const onScreen = words(filled(files.map((f) => drop(f.html, (a) => isPdfOnly(a) || !!attr(a, 'hidden'))).join('\n')));
  const ours = (onScreen.match(/\bUnfairly\b/g) ?? []).length;
  if (ours > 2) must(`"Unfairly" appears ${ours} times on screen. Twice at most: the sample band's "Made by Unfairly" link and the footer.`);
  for (const { where, html } of files) {
    const offBand = filled(drop(html, isBand));
    for (const pitch of PITCH) {
      const hit = pitch.exec(words(offBand));
      if (hit) must(`${where}: carries Unfairly's pitch ("${hit[0]}"). Outside the sample band the proposal is the seller's; our pitch goes in the note.`);
    }
    for (const [, href] of offBand.matchAll(/\shref="([^"]*)"/g)) {
      const host = linkHost(decode(href));
      if (host && OUR_HOST.test(host)) must(`${where}: links to ${decode(href)}, which is Unfairly's. Outside the sample band every link is the seller's; our pitch goes in the note.`);
    }
  }
  const mine = words(filled(files.map((f) => drop(f.html, isTheirs)).join('\n')));
  const promise = /\bguarantee[ds]?\b|\bguaranteeing\b/i.exec(mine);
  if (promise) must(`The page promises a guarantee in its own words ("${promise[0]}"). Quote the seller's sourced words (a <blockquote> or .their-words), or cut it.`);
  const projection = /\b(?:will save|you will save|projected savings|guaranteed savings)\b/i.exec(mine);
  if (projection) must(`The page projects savings ("${projection[0]}"). Say "at the published average" or "an illustration", never a projection.`);
  // Case-sensitive, whole word: names are proper nouns, and ignoring case matches plain words.
  const anywhere = `${said} ${[...page.matchAll(/\s(?:alt|title|aria-label|href|download)="([^"]*)"/g)].map((m) => decode(m[1])).join(' ')}`;
  for (const name of new Set(Array.isArray(sample.exclude_names) ? sample.exclude_names.filter((n) => typeof n === 'string' && n.trim()) : [])) {
    if (new RegExp(`(?<![\\w])${reEscape(name)}(?![\\w])`).test(anywhere)) must(`The page mentions "${name}", which belongs to another prospect (sample.exclude_names). Take it out.`);
  }

  // A real-sounding buyer: the reader should picture a company, not a template slot.
  const buyerNames = [['facts.client.name', site.facts?.client?.name], ['facts.client.short', site.facts?.client?.short], ['sample.buyer', looksLikeName(String(sample.buyer ?? '')) ? sample.buyer : undefined]];
  for (const [at, name] of buyerNames) {
    if (typeof name === 'string' && PLACEHOLDER_NAME.test(name.trim())) must(`site.json ${at} is "${name}", a placeholder. Give the buyer a real-sounding fictional name ("Quillan Ridge Foods") and label it fictional once, in the band or the footer.`);
  }

  // The showpiece: somewhere on the page the buyer works at least two controls that move figures.
  const knobs = files.filter((f) => f.section).map((f) => {
    const html = f.html;
    const inputs = new Set([...html.matchAll(/<input\b[^>]*\sdata-input="([^"]+)"/gi)].map((m) => m[1]));
    const groups = elements(html, (a) => !!attr(a, 'data-choice') || !!attr(a, 'data-toggle') || !!attr(a, 'data-picker')).length;
    // Presets are one group per calculator (or per section).
    const presetScopes = new Set(elements(html, (a) => !!attr(a, 'data-preset')).map((e) => {
      const calcs = elements(html, (a) => !!attr(a, 'data-calc'));
      return calcs.findIndex((c) => e.at >= c.at && e.at < c.at + c.html.length);
    }));
    const figures = /\{\{\s*(?:=|(?!facts\.)[\w]+\s*\}\})/.test(html);
    return { where: f.where, count: figures ? inputs.size + groups + presetScopes.size : 0 };
  });
  if (!knobs.some((k) => k.count >= 2)) {
    const best = knobs.filter((k) => k.count).map((k) => `${k.where}: ${k.count}`).join('; ');
    must(`The showpiece gives the buyer one knob; give them at least two (their numbers and a choice), so the page answers their situation, not a fixed rate.${best ? ` Controls that move a figure: ${best}.` : ' No section has a control that moves a figure.'}`);
  }

  // Hedging: one qualifier beside each figure, said once.
  const hedges = files.map((f) => ({ where: f.where, n: (words(filled(drop(f.html, isTheirs))).match(HEDGES) ?? []).length })).filter((h) => h.n);
  const total = hedges.reduce((a, h) => a + h.n, 0);
  if (total > HEDGE_LIMIT) warnings.push(`The page hedges ${total} times (${hedges.map((h) => `${h.where}: ${h.n}`).join(', ')}); keep one qualifier beside each figure and say the rest with conviction.`);
  return { errors, warnings };
}
