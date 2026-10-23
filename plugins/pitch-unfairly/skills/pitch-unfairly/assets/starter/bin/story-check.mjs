// Check story.md before designing anything: the header names the audience,
// the action, the format, the angle, and a template from the library; every
// slide has a job, a claim for a headline, and its proof; the deck covers the
// template's beats and fits its category's length.
//
//   node bin/story-check.mjs --templates <library url or path> [story.md]
//
// The library comes with the deck guide's templates topic: a URL, or the path to templates.json.
//
// A proposal site's plan says "Format: site" (or "Format: proposal site") in its
// header. It is checked as a site plan instead: the decision and who makes it, the
// sales motion and stage, the next step and what it commits the buyer to, three
// scenarios and the chosen one, every commitment and financial assumption with its
// kind, objections mapped to sections, what was cut, and per section a job, a
// claim, its proof and the buyer phrase it answers. See story-site.example.md.
//
//   node bin/story-check.mjs [--buyers buyers.json] [--against <queue dir>] [story.md]
//
// Exits 1 on errors. Warnings are judgment calls: read them, then decide.
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** Headlines that name a topic instead of making a point. */
const LABELS = new Set([
  'agenda', 'problem', 'the problem', 'solution', 'the solution', 'market', 'market size', 'the market',
  'team', 'the team', 'traction', 'competition', 'business model', 'product', 'overview', 'introduction',
  'summary', 'why now', 'the ask', 'ask', 'financials', 'roadmap', 'next steps', 'thank you', 'thanks',
  'questions', 'q&a', 'appendix', 'vision', 'timeline', 'results', 'kpis', 'metrics', 'highlights', 'lowlights',
]);

const HEADER_FIELDS = [
  ['audience', /^audience$/],
  ['action', /^after the last slide/],
  ['format', /^format$/],
  ['template', /^template$/],
  ['angle', /^angle$/],
];

const DECK_FIELD = /^(?:-\s*)?([A-Za-z][A-Za-z ]*?)\s*:\s*(.+)$/;
// Site plans number their scenarios ("Scenario 1:"), so keys may carry digits.
const SITE_FIELD = /^(?:-\s*)?([A-Za-z][A-Za-z0-9 ]*?)\s*:\s*(.+)$/;
const SITE_FORMAT = /^(?:proposal\s+)?site\b/i;

/**
 * Parse story.md. `header[key]` and each slide's `fields[key]` hold the last value
 * of a key, as before; `lists[key]` (header) and each slide's `lists[key]` hold
 * every value in order, for repeatable keys like Commitment or Proof.
 * `format` is "site" when the header says "Format: site", else "deck";
 * `sections` is the same array as `slides`.
 */
export function parseStory(text) {
  const header = {};
  const lists = {};
  const slides = [];
  let current = null;
  const body = text.replace(/<!--[\s\S]*?-->/g, '');
  const lines = body.split('\n').map((l) => l.trim());
  const headerLines = lines.slice(0, Math.max(0, lines.findIndex((l) => /^##\s+/.test(l))) || lines.length);
  const site = headerLines.some((l) => {
    const m = DECK_FIELD.exec(l);
    return m && m[1].toLowerCase() === 'format' && SITE_FORMAT.test(m[2].trim());
  });
  const fieldRe = site ? SITE_FIELD : DECK_FIELD;
  for (const line of lines) {
    const slide = /^##\s+(.+)$/.exec(line);
    if (slide) {
      current = { title: slide[1].trim(), fields: {}, lists: {} };
      slides.push(current);
      continue;
    }
    const field = fieldRe.exec(line);
    if (!field) continue;
    const key = site ? field[1].toLowerCase().replace(/\s+/g, ' ') : field[1].toLowerCase();
    const value = field[2].trim();
    const [fields, all] = current ? [current.fields, current.lists] : [header, lists];
    fields[key] = value;
    (all[key] ??= []).push(value);
  }
  return { header, slides, lists, format: site ? 'site' : 'deck', sections: slides };
}

const words = (s) => s.replace(/[*_`]/g, '').split(/\s+/).filter(Boolean);

/** The headline rules every slide and section share. */
function checkHeadline(where, headline, i, errors, warnings) {
  const head = headline.replace(/[.!?]+$/, '').trim();
  if (LABELS.has(head.toLowerCase())) errors.push(`${where}: "${headline}" is a topic label. State the point as a claim.`);
  else if (words(head).length < 3 && i > 0) warnings.push(`${where}: "${headline}" is very short. Is it a claim the audience could repeat?`);
  if (words(head).length > 16) warnings.push(`${where}: the headline has ${words(head).length} words. Tighten it to about 12 so it fits in three lines.`);
  // Simple copy (voice.md): one idea per sentence, no clauses stacked on clauses.
  const commas = (head.match(/,/g) ?? []).length;
  if (commas >= 3 || /;/.test(head)) warnings.push(`${where}: the headline stacks clauses ("${headline}"). Say one thing; move the rest to the proof or the notes.`);
  const said = head.split(/(?<=[.?!])\s+/).filter(Boolean).length;
  if (said > 2 || (said > 1 && i > 0)) warnings.push(`${where}: the headline is ${said} sentences. Keep one claim${i === 0 ? ' (a cover can carry two short parts)' : ''}.`);
}

export function checkStory(story, library, options = {}) {
  if (story.format === 'site') return checkSiteStory(story, options);
  const errors = [];
  const warnings = [];
  const h = story.header;
  const pick = (re) => Object.entries(h).find(([k]) => re.test(k))?.[1];

  for (const [name, re] of HEADER_FIELDS) {
    if (!pick(re)) errors.push(`Header: add "${name === 'action' ? 'After the last slide they should' : name[0].toUpperCase() + name.slice(1)}: ..." before the first slide.`);
  }

  const templateRef = pick(/^template$/);
  const templateId = templateRef && (/`?([a-z0-9-]+)`?/i.exec(templateRef.split(/[\s(,]/)[0]) ?? [])[1];
  const template = library?.templates.find((t) => t.id === templateId || t.modelName === templateRef);
  const category = template && library.categories.find((c) => c.id === template.category);
  if (templateRef && library && !template) {
    errors.push(`Header: template "${templateRef}" is not in the library. Use an id from templates.md, e.g. ${library.templates.slice(0, 3).map((t) => t.id).join(', ')}.`);
  }

  if (story.slides.length === 0) errors.push('No slides yet: add one "## NN name" block per slide.');

  const jobs = new Map();
  story.slides.forEach((s, i) => {
    const where = `Slide ${String(i + 1).padStart(2, '0')} (${s.title})`;
    const f = s.fields;
    if (!f.job) errors.push(`${where}: add "Job:", what this slide must make the audience believe or do.`);
    if (!f.headline) errors.push(`${where}: add "Headline:", the point as a sentence.`);
    else checkHeadline(where, f.headline, i, errors, warnings);
    if (!f.proof && i > 0) errors.push(`${where}: add "Proof:", the one visual or fact that makes the headline believable. No proof usually means it's a speaker line, not a slide.`);
    if (f.proof && !f.source && /\d{2,}|[$%€£]|\d(?:\.\d+)?\s?[kmb]\b/i.test(`${f.proof} ${f.headline ?? ''}`)) warnings.push(`${where}: numbers with no "Source:". Cite it, or mark it "example" and label it on the slide.`);
    if (f.job) {
      const key = f.job.toLowerCase().replace(/[^a-z ]/g, '').trim();
      if (jobs.has(key)) warnings.push(`${where}: same job as slide ${jobs.get(key)}. Merge them.`);
      else jobs.set(key, String(i + 1).padStart(2, '0'));
    }
  });

  if (template) {
    const covered = new Set(story.slides.map((s) => (s.fields.beat ?? '').toLowerCase()).filter(Boolean));
    if (covered.size > 0) {
      const missing = template.beats.filter((b) => !covered.has(b.beat.toLowerCase()));
      if (missing.length) warnings.push(`Template ${template.id}: no slide carries ${missing.map((b) => `"${b.beat}"`).join(', ')}. Cut on purpose, or add the beat.`);
    } else {
      warnings.push(`Template ${template.id}: add "Beat:" to each slide (one of ${template.beats.map((b) => b.beat).join(', ')}) so coverage can be checked.`);
    }
    const max = Math.max(...(category?.length.match(/\d+/g) ?? ['0']).map(Number));
    if (max && story.slides.length > max) warnings.push(`Length: ${story.slides.length} slides, more than the ${max} a ${category.name.toLowerCase()} deck usually needs (${category.length}).`);
  }

  return { errors, warnings, template, category };
}

// ---------------------------------------------------------------------------
// Site format: the story plan for a proposal site.

export const MOTIONS = ['self-serve', 'quoted purchase', 'consultative', 'evaluation', 'partnership'];
const MOTION_ALIASES = { 'self serve': 'self-serve', selfserve: 'self-serve', 'consultative sale': 'consultative', 'quoted-purchase': 'quoted purchase' };
export const COMMITMENT_KINDS = ['sourced', 'supplied', 'proposed', 'unknown'];
export const ASSUMPTION_TYPES = ['cash', 'capacity', 'time', 'count', 'rate'];

const SITE_HEADER = [
  ['audience', 'Audience', 'the fictional buyer and the persona who reads it'],
  ['decision', 'Decision', 'what the buyer decides between, doing nothing included'],
  ['decider', 'Decider', 'the role that makes the decision'],
  ['motion', 'Motion', `the company's real sales motion: ${MOTIONS.join(', ')}`],
  ['stage', 'Stage', "the buyer's current stage"],
  ['next step', 'Next step', 'the CTA: what the buyer does next'],
  ['commits them to', 'Commits them to', 'what acting commits the buyer to ("nothing yet" is fine, but say it)'],
  ['prerequisites', 'Prerequisites', 'quote, eligibility, security, data access, approvals ("none" is fine, but say it)'],
  ['angle', 'Angle', 'the one tension the page turns on'],
  ['showpiece', 'Showpiece', 'the one interactive piece, with its real unit'],
  ['chosen', 'Chosen', 'which scenario, and why'],
];

const STOPWORDS = new Set(('a an the and or but of to in on at for from by with as is are be been was were it its this that these those ' +
  'their them they our we you your his her he she who whom which what when where why how than then so do does did not no ' +
  'can could will would should may might must into over under about after before up down out off one each every any all ' +
  'more most less very just also only own same such there here').split(' '));

/** Content words of a phrase, lowercased, stopwords removed. */
export const tokens = (s) => new Set(String(s ?? '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/[\s-]+/).filter((w) => w.length > 1 && !STOPWORDS.has(w)));

/** Share of content words two phrases have in common (Jaccard), 0 to 1. */
export function overlap(a, b) {
  const x = a instanceof Set ? a : tokens(a);
  const y = b instanceof Set ? b : tokens(b);
  if (!x.size || !y.size) return 0;
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  return both / (x.size + y.size - both);
}

/** "<what> | key: value | key: value" into { what, key: value }. Values keep their colons (URLs). */
export function parseSpec(value) {
  const [what = '', ...rest] = String(value).split('|').map((s) => s.trim());
  const spec = { what };
  for (const part of rest) {
    const m = /^([A-Za-z][A-Za-z ]*?)\s*:\s*(.*)$/.exec(part);
    if (m) spec[m[1].toLowerCase().replace(/\s+/g, ' ')] = m[2].trim();
    else (spec.extra ??= []).push(part);
  }
  return spec;
}

const MONTH = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const CALENDAR_DATE = new RegExp([
  `\\b${MONTH}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?\\b`,
  `\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH}\\b`,
  `\\b${MONTH}\\.?\\s+\\d{4}\\b`,
  '\\b(?:january|february|march|april|june|july|august|september|october|november|december)\\b',
  '\\b\\d{4}-\\d{2}-\\d{2}\\b',
  '\\b\\d{1,2}/\\d{1,2}(?:/\\d{2,4})?\\b',
].join('|'), 'i');

/** True when the text names a calendar date (not a relative order like "after the security review"). */
export const hasCalendarDate = (s) => CALENDAR_DATE.test(String(s ?? ''));

/** A showpiece named by its kind of tool, not its unit ("a savings model", "an ROI calculator"). */
const UNIT_FREE = /\b(?:savings?|roi|value|impact|benefits?|costs?|results?|outcomes?|efficiency)\s+(?:model|calculator|estimator|tool|simulator|modeler|explorer)\b/i;

/** A headline that opens with an invitation instead of a claim ("Explore provider guidance ..."). */
export const SOFT_OPENER = /^(?:explore|discover|learn|see|consider|imagine|find\s+out|unlock|meet|introducing|welcome)\b/i;
/** A showpiece that names more than one thing the buyer can change. */
const SEVERAL_INPUTS = /\band\b|,|\+|\bchoices?\b|\btabs?\b|\bpresets?\b|\binputs\b/i;

/** The section's own number: the leading digits of its title, else its position. */
const sectionNumber = (s, i) => Number((/^(\d+)/.exec(s.title) ?? [])[1] ?? i + 1);
const titleKey = (title) => title.replace(/^\d+\s*[.)-]?\s*/, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const pad = (n) => String(n).padStart(2, '0');

/**
 * How alike two plans are (rule 9): `order` is the share of the section sequence
 * they have in common, in order (sections match on the same title or a similar
 * job); `headlines` is how much their headlines share; `score` averages the two.
 * Each is 0 to 1. Takes parsed stories or story.md text.
 */
export function compareStories(a, b) {
  const A = (typeof a === 'string' ? parseStory(a) : a).slides;
  const B = (typeof b === 'string' ? parseStory(b) : b).slides;
  if (!A.length || !B.length) return { order: 0, headlines: 0, score: 0 };
  const key = (s) => ({ title: titleKey(s.title), job: tokens(s.fields.job), headline: tokens(s.fields.headline) });
  const ka = A.map(key);
  const kb = B.map(key);
  const same = (x, y) => (x.title && x.title === y.title) || overlap(x.job, y.job) >= 0.5;
  const lcs = Array.from({ length: ka.length + 1 }, () => new Array(kb.length + 1).fill(0));
  for (let i = 1; i <= ka.length; i++) {
    for (let j = 1; j <= kb.length; j++) {
      lcs[i][j] = same(ka[i - 1], kb[j - 1]) ? lcs[i - 1][j - 1] + 1 : Math.max(lcs[i - 1][j], lcs[i][j - 1]);
    }
  }
  const order = lcs[ka.length][kb.length] / Math.max(ka.length, kb.length);
  const best = (xs, ys) => xs.reduce((sum, x) => sum + Math.max(...ys.map((y) => overlap(x.headline, y.headline))), 0) / xs.length;
  const headlines = (best(ka, kb) + best(kb, ka)) / 2;
  const round = (n) => Math.round(n * 100) / 100;
  return { order: round(order), headlines: round(headlines), score: round((order + headlines) / 2) };
}

/** buyers.json: every lexicon entry needs its phrase and the URL it was taken from. */
export function checkBuyers(buyers) {
  const errors = [];
  const warnings = [];
  const phrases = [];
  if (!buyers || typeof buyers !== 'object') return { errors: ['buyers.json: not a JSON object.'], warnings, phrases };
  const lexicon = Array.isArray(buyers.lexicon) ? buyers.lexicon : [];
  if (!lexicon.length) warnings.push('buyers.json: no "lexicon" yet. Collect the buyer\'s own phrases from case studies, RFPs, job posts and reviews, each with its URL.');
  lexicon.forEach((entry, i) => {
    const where = `buyers.json lexicon[${i}]`;
    const phrase = typeof entry === 'string' ? entry : entry?.phrase;
    if (!phrase) { errors.push(`${where}: add "phrase", the buyer's exact words.`); return; }
    if (typeof entry !== 'object' || !/^https?:\/\/\S+$/.test(String(entry.source ?? '').trim())) {
      errors.push(`${where} ("${phrase}"): add "source", the URL the phrase was taken from. An unsourced phrase is our words, not the buyer's.`);
    }
    phrases.push(String(phrase));
  });
  return { errors, warnings, phrases };
}

const normPhrase = (s) => String(s).toLowerCase().replace(/[“”"‘’'`]/g, '').replace(/\s+/g, ' ').trim();

/** The site-format check. options: { buyers, others: [{ name, story }] }. */
export function checkSiteStory(story, options = {}) {
  const errors = [];
  const warnings = [];
  const h = story.header;
  const L = story.lists ?? {};
  const mode = (h.mode ?? '').toLowerCase().split(/\s/)[0] || null;

  for (const [key, label, what] of SITE_HEADER) {
    if (!h[key]) errors.push(`Header: add "${label}: ...", ${what}.`);
  }
  if (mode && !['lead', 'user'].includes(mode)) warnings.push(`Header: "Mode: ${h.mode}" is neither lead (an unattended sample) nor user (a seller's real deal).`);
  if (!h.example) warnings.push('Header: add "Example: ...", the real proposal or RFP response this page follows (playbook step 2), or say none was found.');

  // Motion and commitment.
  const motionRaw = (h.motion ?? '').toLowerCase().trim();
  const motion = MOTION_ALIASES[motionRaw] ?? motionRaw;
  if (h.motion && !MOTIONS.includes(motion)) errors.push(`Header: "Motion: ${h.motion}" isn't a sales motion. Use one of: ${MOTIONS.join(', ')}.`);
  if (h['next step'] && /\bunfairly\b/i.test(h['next step'])) errors.push(`Header: "Next step" is Unfairly's CTA. The page's next step is the buyer's, with the seller; our ask stays in the note.`);
  if (h['commits them to'] && /^nothing\b/i.test(h['commits them to']) && ['evaluation', 'quoted purchase'].includes(motion)) {
    warnings.push(`Header: "Commits them to: ${h['commits them to']}" for a${motion === 'evaluation' ? 'n' : ''} ${motion}. Evaluations and orders carry terms even before a subscription; name them.`);
  }
  if (h.showpiece && UNIT_FREE.test(h.showpiece) && !/\b(?:of|in|per)\b/i.test(h.showpiece)) {
    warnings.push(`Header: "Showpiece: ${h.showpiece}" names a tool, not its unit. Say what it models ("a model of preterm births", "weekly driver hours"), so the note can promise exactly that.`);
  }
  if (h.showpiece && !SEVERAL_INPUTS.test(h.showpiece)) {
    warnings.push(`Header: "Showpiece: ${h.showpiece}" names only one input. A lead sample's showpiece needs at least two controls the buyer can change (inputs, a choice, tabs or presets); name them ("from stops per route and dwell time").`);
  }


  // Scenarios.
  const scenarios = Object.keys(h).filter((k) => /^scenario\s*\d+$/.test(k)).map((k) => ({ key: k, n: Number(k.match(/\d+/)[0]), text: h[k] }));
  if (scenarios.length < 3) errors.push(`Header: ${scenarios.length} scenario${scenarios.length === 1 ? '' : 's'}. Write three ("Scenario 1:" to "Scenario 3:") that differ in buyer, use case and decision, then pick one in "Chosen:".`);
  for (let i = 0; i < scenarios.length; i++) {
    for (let j = i + 1; j < scenarios.length; j++) {
      const o = overlap(scenarios[i].text, scenarios[j].text);
      if (o > 0.7) warnings.push(`Header: scenarios ${scenarios[i].n} and ${scenarios[j].n} share ${Math.round(o * 100)}% of their words. Three scenarios differ in buyer, use case and decision, not in wording.`);
    }
  }
  if (h.chosen) {
    const n = Number((/\b(\d+)\b/.exec(h.chosen) ?? [])[1]);
    if (!n || !scenarios.some((s) => s.n === n)) warnings.push(`Header: "Chosen: ${h.chosen}" doesn't name one of the scenarios by number.`);
    if (words(h.chosen).length < 4) warnings.push(`Header: "Chosen: ${h.chosen}" says which, not why. Add the evidence that makes it the best-supported one.`);
  }

  // Commitments: every date, duration and term with its kind.
  for (const raw of L.commitment ?? []) {
    const c = parseSpec(raw);
    const where = `Commitment "${c.what || raw}"`;
    if (!c.what) errors.push(`${where}: say what the commitment is before the first "|".`);
    if (!c.kind) { errors.push(`${where}: add "| kind: ${COMMITMENT_KINDS.join('|')}".`); continue; }
    const kind = c.kind.toLowerCase();
    if (!COMMITMENT_KINDS.includes(kind)) { errors.push(`${where}: kind "${c.kind}" isn't one of ${COMMITMENT_KINDS.join(', ')}.`); continue; }
    if ((kind === 'sourced' || kind === 'supplied') && !c.source) errors.push(`${where}: a ${kind} commitment needs "| source: <url or fact id>".`);
    if (kind === 'unknown') errors.push(`${where}: an unknown can't go on the page. Drop it, or make it a prerequisite ("agree the pilot length with ...").`);
    if (kind === 'proposed' && (hasCalendarDate(c.what) || hasCalendarDate(c.when))) warnings.push(`${where}: a proposed commitment with a calendar date. Sequence it by dependency instead ("after the security review").`);
  }

  // Financial figures as structured assumptions.
  for (const raw of L.assumption ?? []) {
    const a = parseSpec(raw);
    const where = `Assumption "${a.what || raw}"`;
    if (!a.type) errors.push(`${where}: add "| type: ${ASSUMPTION_TYPES.join('|')}". Capacity and time are never shown as cash.`);
    else if (!ASSUMPTION_TYPES.includes(a.type.toLowerCase())) errors.push(`${where}: type "${a.type}" isn't one of ${ASSUMPTION_TYPES.join(', ')}.`);
    if (!a.source) warnings.push(`${where}: add "| source: ...", a fact id or "example input".`);
  }

  // Sections.
  const sections = story.slides;
  if (sections.length === 0) errors.push('No sections yet: add one "## NN name" block per section.');
  const numbers = new Set(sections.map(sectionNumber));
  const lexicon = options.buyers ? checkBuyers(options.buyers) : null;
  if (lexicon) { errors.push(...lexicon.errors); warnings.push(...lexicon.warnings); }
  const lex = lexicon?.phrases.map(normPhrase) ?? [];
  const jobs = new Map();
  let interactive = 0;
  sections.forEach((s, i) => {
    const where = `Section ${pad(i + 1)} (${s.title})`;
    const f = s.fields;
    if (!f.job) errors.push(`${where}: add "Job:", what this section must make the buyer believe or do.`);
    if (!f.headline) errors.push(`${where}: add "Headline:", the point as a sentence.`);
    else {
      checkHeadline(where, f.headline, i, errors, warnings);
      if (SOFT_OPENER.test(f.headline.replace(/^[*_`"“\s]+/, ''))) {
        (mode === 'lead' ? errors : warnings).push(`${where}: "${f.headline}": the headline invites instead of claiming; say what the seller does for this buyer, with the proof under it ('Garner steers employees to the doctors who cost less and treat better').`);
      }
    }
    if (!f.proof && i > 0) errors.push(`${where}: add "Proof:", the fact ids or source that make the headline true. A section with no proof is an opinion; cut it or find the fact.`);
    if (!f['buyer phrase']) warnings.push(`${where}: add "Buyer phrase:", the buyer's own words this section answers.`);
    else if (lexicon) {
      const bp = normPhrase(f['buyer phrase']);
      if (!lex.some((p) => p.includes(bp) || bp.includes(p))) warnings.push(`${where}: buyer phrase "${f['buyer phrase']}" isn't in buyers.json's lexicon. Use the buyer's sourced words, or add the phrase with its URL.`);
    }
    if (f.interactive) {
      interactive++;
      for (const [key, label, what] of [['changes', 'Changes', 'what it changes downstream (the headline, the offer, the CTA, the dates)'], ['empty state', 'Empty state', 'what it reads with nothing entered or everything off, as a sentence'], ['prints', 'Prints', 'the state the PDF page shows, with its assumptions and the next step']]) {
        if (!f[key]) errors.push(`${where}: interactive, so add "${label}:", ${what}.`);
      }
      if (f.prints && /\b(?:move|drag|use|try|click|tap|adjust|slide|toggle)\b[^.]*\b(?:slider|input|toggle|button|control|tab|dial|model)s?\b/i.test(f.prints)) {
        errors.push(`${where}: "Prints: ${f.prints}" is an instruction. The PDF can't be clicked: print a real state and its result.`);
      }
    }
    if (f.job) {
      const key = f.job.toLowerCase().replace(/[^a-z ]/g, '').trim();
      if (jobs.has(key)) warnings.push(`${where}: same job as section ${jobs.get(key)}. Merge them.`);
      else jobs.set(key, pad(i + 1));
    }
  });
  if (sections.length && !interactive) warnings.push(`No section is "Interactive:". The showpiece (${h.showpiece ?? 'see the header'}) lives in one; mark it.`);
  if (interactive > 2) warnings.push(`${interactive} interactive sections. One meaningful interaction beats a long page (rule 21).`);

  // Objections, answered where.
  const objections = L.objection ?? [];
  for (const raw of objections) {
    const o = parseSpec(raw);
    const at = o['answered in'];
    if (!at) { errors.push(`Objection "${o.what}": add "| answered in: NN" (a section number), or "| answered in: open" if it stays open.`); continue; }
    if (/^open\b/i.test(at)) continue;
    const n = Number((/\d+/.exec(at) ?? [])[0]);
    if (!n || !numbers.has(n)) errors.push(`Objection "${o.what}": answered in "${at}", but there's no section ${at}.`);
  }
  if (objections.length < 2) warnings.push(`${objections.length} objection${objections.length === 1 ? '' : 's'}. Read it as the champion, the economic buyer and procurement: implementation effort, switching cost, security, "what if it fails". Add each as "Objection: ... | answered in: NN".`);

  if (!(L.cut ?? []).length) warnings.push('Nothing cut. Restraint: say what you left out and why ("Cut: ...").');

  // Rule 9: no two prospects' pages share an arc.
  for (const other of options.others ?? []) {
    const c = compareStories(story, other.story);
    if (c.order > 0.6) warnings.push(`Sameness (rule 9): the section order matches ${other.name} by ${Math.round(c.order * 100)}% (headlines ${Math.round(c.headlines * 100)}%). Build this page's arc from this buyer's decision, not another prospect's page.`);
  }

  return { errors, warnings, template: undefined, category: undefined, format: 'site', mode };
}

/** Other prospects' plans under a queue folder: <dir>/*\/story.md and <dir>/*\/project/story.md. */
async function loadOthers(dir, self) {
  const others = [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => null);
  if (!entries) { console.log(`Couldn't read ${dir}; skipping the sameness check.`); return others; }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    for (const p of [join(dir, e.name, 'story.md'), join(dir, e.name, 'project', 'story.md')]) {
      if (!existsSync(p) || resolve(p) === resolve(self)) continue;
      others.push({ name: p, story: parseStory(await readFile(p, 'utf8')) });
    }
  }
  return others;
}

/** The template library from a URL (the deck guide serves it) or a local file. Unreachable means structure-only, not a failed check. */
async function loadLibrary(source) {
  try {
    if (/^https?:\/\//.test(source)) {
      const res = await fetch(source);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    }
    return JSON.parse(await readFile(source, 'utf8'));
  } catch (error) {
    console.log(`Couldn't load the template library (${error.message}); checking structure only.`);
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const VALUE_FLAGS = new Set(['--templates', '--against', '--buyers']);
  const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const file = args.find((a, i) => !a.startsWith('--') && !VALUE_FLAGS.has(args[i - 1])) ?? 'story.md';
  const story = parseStory(await readFile(file, 'utf8'));

  if (story.format === 'site') {
    const options = {};
    const buyersPath = flag('--buyers') ?? join(dirname(file), 'buyers.json');
    const pre = [];
    if (existsSync(buyersPath)) {
      try { options.buyers = JSON.parse(await readFile(buyersPath, 'utf8')); } catch (error) { pre.push(`${buyersPath}: not valid JSON (${error.message}).`); }
    } else if (flag('--buyers')) pre.push(`--buyers ${buyersPath}: no such file.`);
    else console.log('No buyers.json beside the plan; buyer phrases are not checked against a lexicon.');
    const against = flag('--against');
    if (against) options.others = await loadOthers(against, file);
    const { errors, warnings, mode } = checkSiteStory(story, options);
    errors.unshift(...pre);
    console.log(`${file}: ${story.slides.length} sections, site format${mode ? `, ${mode} mode` : ''}${against ? `, compared with ${options.others.length} other plan${options.others.length === 1 ? '' : 's'}` : ''}`);
    for (const w of warnings) console.log(`  ! ${w}`);
    for (const e of errors) console.log(`  ✗ ${e}`);
    console.log(errors.length
      ? `\n${errors.length} to fix before designing.`
      : mode === 'lead'
        ? '\nPlan holds. Build from it.'
        : '\nPlan holds. Show the user the decision, the chosen scenario and every headline before composing.');
    process.exitCode = errors.length ? 1 : 0;
    return;
  }

  const templatesPath = flag('--templates') ?? process.env.PITCH_UNFAIRLY_TEMPLATES;
  const library = templatesPath ? await loadLibrary(templatesPath) : null;
  if (!library) console.log('No template library given (--templates); checking structure only.');
  const { errors, warnings, template, category } = checkStory(story, library);

  console.log(`${file}: ${story.slides.length} slides${template ? `, template ${template.id} (${template.template}, ${category?.name})` : ''}`);
  if (category) {
    console.log(`\nRules for ${category.name.toLowerCase()}:`);
    for (const r of category.rules) console.log(`  · ${r}`);
  }
  for (const w of warnings) console.log(`  ! ${w}`);
  for (const e of errors) console.log(`  ✗ ${e}`);
  console.log(errors.length ? `\n${errors.length} to fix before designing.` : '\nStory holds. Show the outline to the user before composing.');
  process.exitCode = errors.length ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
