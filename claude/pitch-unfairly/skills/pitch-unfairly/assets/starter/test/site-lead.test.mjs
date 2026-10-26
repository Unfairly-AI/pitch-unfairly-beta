import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSite } from '../bin/site/check.mjs';
import { typedCommitments } from '../bin/site/lead.mjs';

// A lead sample: a proposal Acme Payroll's reps could send an employer, made by Unfairly.
const SITE = {
  title: 'Payroll for Hollis Foods',
  description: 'A payroll proposal for Hollis Foods.',
  sample: { lead: true, seller: 'Acme Payroll', buyer: 'an employer', exclude_names: ['Progyny', 'Carrot'] },
  model: {
    inputs: { staff: 120, hours_saved: 3 },
    formulas: { fee: 'staff * 9 * 12', hours: 'staff * hours_saved' },
    formats: { fee: 'money', hours: 'int' },
    types: { fee: 'cash', hours: 'time' },
    excludes: { fee: 'implementation, which Acme quotes after scoping' },
  },
  facts: {
    vendor: { name: 'Acme Payroll', trial: '21-day evaluation', rank: 'Top 10 in the G2 payroll report' },
    client: { name: 'Hollis Foods' },
    quotes: { cfo: 'We closed the books two days sooner.' },
    buyer: 'an employer',
    sample: { href: 'https://unfairly.ai' },
  },
  sources: {
    'vendor.name': { url: 'https://acme.example/about', accessed: '2026-10-20', verbatim: true },
    'vendor.trial': { url: 'https://acme.example/terms', accessed: '2026-10-20', verbatim: true },
    'vendor.rank': { url: 'https://acme.example/awards', accessed: '2026-10-20', verbatim: false, qualifier: 'G2 Fall 2026 report' },
    'quotes.cfo': { url: 'https://acme.example/stories/hollis', accessed: '2026-10-20', verbatim: true },
  },
  fictional: ['client'],
};
const HEADER = `<header class="top tb-top">
  <div class="tb-sample-bar" data-sample role="note"><p>Example: a proposal {{facts.vendor.name}} could send {{facts.buyer}}. {{facts.client.name}} and its numbers are fictional.</p>
  <a href="{{facts.sample.href}}" target="_blank" rel="noopener" data-cta="made_by">Made by Unfairly</a></div>
  <a class="tb-brand" href="#top">{{facts.vendor.name}}</a>
</header>`;
const FOOTER = '<footer><p>A sample built by Unfairly from public sources. {{facts.client.name}} is fictional.</p></footer>';
const HERO = `<section id="hero" data-section="hero">
  <h1>{{facts.client.name}} pays {{fee}} a year.</h1>
  <p>That frees {{hours}} hours a month for the team.</p>
  <label>Staff <input type="number" data-input="staff" value="120"></label>
  <label>Hours each saves <input type="number" data-input="hours_saved" value="3"></label>
  <p data-excludes="fee">The fee leaves out implementation, which {{facts.vendor.name}} quotes after scoping.</p>
</section>`;
const NEXT = `<section id="next" data-section="next">
  <h2>Start with the {{facts.vendor.trial}}.</h2>
  <p>{{facts.vendor.rank}}.</p>
  <blockquote>{{facts.quotes.cfo}}</blockquote>
  <p data-commitment data-basis="sourced" data-source="vendor.trial">The {{facts.vendor.trial}} runs on the published terms.</p>
  <a href="#hero" class="tb-link">See the numbers</a>
</section>`;
const TODAY = '2026-10-23';

const page = ({ site = SITE, header = HEADER, footer = FOOTER, hero = HERO, next = NEXT } = {}) =>
  checkSite({ site, header, footer, sections: [{ name: '01-hero.html', html: hero }, { name: '02-next.html', html: next }], today: TODAY });
const has = (list, re) => list.some((x) => re.test(x));
const withFacts = (facts, sources = {}, extra = {}) => ({ ...SITE, ...extra, facts: { ...SITE.facts, ...facts }, sources: { ...SITE.sources, ...sources } });
const addTo = (html, more) => html.replace('</section>', `${more}</section>`);

test('ACCEPTANCE: a clean lead sample passes', () => {
  const { errors, warnings } = page();
  assert.deepEqual(errors, []);
  assert.ok(!has(warnings, /Book 30 minutes/), 'lead mode never recommends our booking pitch');
});

test('lead mode: the page says what it is, with one "Made by Unfairly" link in the band', () => {
  const r = page({ header: HEADER.replace('Example: a proposal', 'A proposal').replace('Made by Unfairly', 'Unfairly') });
  assert.ok(has(r.errors, /must say "Example: a proposal"/));
  assert.ok(has(r.errors, /must say "Made by Unfairly"/));
  const noBand = page({ header: '<header><p>Example: a proposal {{facts.vendor.name}} could send {{facts.buyer}}.</p></header>' });
  assert.ok(has(noBand.errors, /no sample band with its one call to action/));
  assert.ok(!has(noBand.warnings, /Book 30 minutes/), 'the generic sample-band warning stays off a lead page');
  const two = page({ header: HEADER.replace('</a></div>', '</a><a href="https://unfairly.ai/mail" target="_blank" rel="noopener" data-cta="talk_to_us">Write</a></div>') });
  assert.ok(has(two.errors, /sample band has 2 calls to action/));
});

test('lead mode: "Unfairly" three times on screen fails; twice passes', () => {
  const r = page({ footer: FOOTER.replace('</p>', ' Unfairly again.</p>') });
  assert.ok(has(r.errors, /"Unfairly" appears 3 times on screen/), r.errors.join('\n'));
  // The PDF-only strip isn't on screen.
  const pdf = page({ footer: `${FOOTER}<div class="pdf-only"><p>Unfairly, at our site</p></div>` });
  assert.ok(!has(pdf.errors, /appears \d times/));
});

test('lead mode: our pitch off the band fails: a link to Unfairly, Unfairly as maker, our offer copy', () => {
  const link = page({ next: addTo(NEXT, '<p><a href="https://calendly.com/acme" target="_blank" rel="noopener" data-cta="book">Book 30 minutes</a> or <a href="https://app.unfairly.ai/x">see it</a>.</p>') });
  assert.ok(has(link.errors, /sections\/02-next.html: links to https:\/\/app.unfairly.ai\/x, which is Unfairly's/), link.errors.join('\n'));
  assert.ok(!has(link.errors, /calendly|Book 30/), "a seller's booking link is the seller's");
  const mail = page({ footer: FOOTER.replace('</footer>', '<a href="mailto:bob@unfairly.ai">Write</a></footer>') });
  assert.ok(has(mail.errors, /footer.html: links to mailto:bob@unfairly.ai, which is Unfairly's/));
  const deck = page({ footer: FOOTER.replace('</footer>', '<a href="https://www.pitchunfairly.com/">More</a></footer>') });
  assert.ok(has(deck.errors, /pitchunfairly.com\/, which is Unfairly's/));
  const maker = page({ next: addTo(NEXT, '<p>Made by Unfairly in a day.</p>') });
  assert.ok(has(maker.errors, /carries Unfairly's pitch \("Made by Unfairly"\)/));
  const ours = page({ next: addTo(NEXT, '<p>A sample from Unfairly, built in a day.</p>') });
  assert.ok(has(ours.errors, /pitch \("from Unfairly"\)/));
  // Offer copy that doesn't name us may be the seller's own: "within 48 hours" alone passes.
  const sellers = page({ next: addTo(NEXT, '<p>Acme confirms stock within 48 hours of the order.</p>') });
  assert.ok(!has(sellers.errors, /pitch/), sellers.errors.join('\n'));
});

test('CASE seller booking: a seller CTA "Book 30 minutes" on its own calendar produces no errors at all', () => {
  const r = page({ next: addTo(NEXT, '<p><a href="https://calendly.com/acme" target="_blank" rel="noopener" data-cta="book">Book 30 minutes</a></p>') });
  assert.deepEqual(r.errors, []);
});

test('CASE invoice: seats (a count) times a price (cash) shown as money passes; hours alone as money fails', () => {
  const site = { ...SITE, model: { ...SITE.model, inputs: { ...SITE.model.inputs, seats: 20, seat_price: 40 }, types: { ...SITE.model.types, seats: 'count', seat_price: 'cash' } } };
  const ok = page({ site, next: addTo(NEXT, '<p>Twenty seats come to {{= seats * seat_price | money}} a month.</p>'.replace('Twenty', 'The seats')) });
  assert.ok(!has(ok.errors, /capacity shown as cash|none of its names/), ok.errors.join('\n'));
  const bad = page({ site, next: addTo(NEXT, '<p>Capacity returned: {{= hours | money}}.</p>') });
  assert.ok(has(bad.errors, /capacity shown as cash/), bad.errors.join('\n'));
});

test('a proposed date qualified separately for screen (data-pdf-hide) and paper (.pdf-only) passes; with only one, it fails', () => {
  const date = '<p data-date="2026-11-20" data-basis="proposed">Contract by Nov 20</p>';
  const both = page({ next: addTo(NEXT, `${date}<p data-conditional data-pdf-hide>Proposed: it moves with the security review.</p><p class="pdf-only" data-conditional>Proposed date, set after the security review.</p>`) });
  assert.ok(!has(both.errors, /is proposed, but nothing/), both.errors.join('\n'));
  const screenOnly = page({ next: addTo(NEXT, `${date}<p data-conditional data-pdf-hide>Proposed: it moves with the security review.</p>`) });
  assert.ok(has(screenOnly.errors, /is proposed, but nothing/));
});

test('lead mode: a seller CTA "Email us for a hospitality quote" to its own sales inbox passes', () => {
  const r = page({ next: addTo(NEXT, '<p><a href="mailto:sales@acme.example" target="_blank" rel="noopener" data-cta="quote">Email us for a hospitality quote</a></p>') });
  assert.deepEqual(r.errors, []);
});

test('lead mode: no guarantee or projected savings in our words; a quote is exempt', () => {
  const r = page({ next: addTo(NEXT, '<p>Acme is guaranteed to cut errors, and you will save hours.</p>') });
  assert.ok(has(r.errors, /promises a guarantee/));
  assert.ok(has(r.errors, /projects savings \("you will save"\)/));
  const quoted = page({ site: withFacts({ quotes: { cfo: 'Accuracy guaranteed, every run.' } }) });
  assert.ok(!has(quoted.errors, /guarantee/), 'a blockquote is someone else’s words');
});

test('lead mode: another prospect’s name fails, whole word and case-sensitive', () => {
  const r = page({ hero: addTo(HERO, '<p>Teams like Progyny run on it.</p>') });
  assert.ok(has(r.errors, /mentions "Progyny"/));
  const plain = page({ hero: addTo(HERO, '<p>Every carrot counts.</p>') });
  assert.ok(!has(plain.errors, /mentions/));
});

test('every site: a scroll link labelled "Calculate" fails; one that says where it goes passes', () => {
  const r = page({ next: NEXT.replace('See the numbers', 'Calculate your savings') });
  assert.ok(has(r.errors, /the link "Calculate your savings" only scrolls; say where it goes/));
  const plain = checkSite({ site: { title: 'T', description: 'D' }, sections: [{ name: '01-a.html', html: '<section data-section="a"><a href="#a">Run the model</a></section>' }] });
  assert.ok(has(plain.errors, /"Run the model" only scrolls/), 'not only lead samples');
});

test('commitments: a proposed date with its conditional only in the footer fails; in the section it passes', () => {
  const dated = addTo(NEXT, '<ol data-dates><li data-date="2026-11-20" data-basis="proposed">Pick a plan</li></ol>');
  const footer = FOOTER.replace('</footer>', '<p data-conditional>Every date here is proposed.</p></footer>');
  const r = page({ next: dated, footer });
  assert.ok(has(r.errors, /data-date="2026-11-20" is proposed, but nothing in its section says so[\s\S]*a footer disclaimer can't qualify a promise/), r.errors.join('\n'));
  const fixed = page({ next: dated.replace('</ol>', '</ol><p data-conditional>Proposed: the date moves with the evaluation.</p>'), footer });
  assert.deepEqual(fixed.errors, []);
});

test("commitments: a conditional hidden from the PDF, the screen or by CSS doesn't qualify the date", () => {
  const dated = addTo(NEXT, '<ol data-dates><li data-date="2026-11-20" data-basis="proposed">Pick a plan</li></ol>COND');
  for (const cond of [
    '<p data-conditional data-pdf-hide>Proposed dates.</p>',
    '<div data-pdf-hide><p data-conditional>Proposed dates.</p></div>',
    '<p class="note pdf-hide" data-conditional>Proposed dates.</p>',
    '<p class="sr-only" data-conditional>Proposed dates.</p>',
    '<p style="color: red; display: none" data-conditional>Proposed dates.</p>',
    '<p hidden data-conditional>Proposed dates.</p>',
    '<details><p data-conditional>Proposed dates.</p></details>',
  ]) assert.ok(has(page({ next: dated.replace('COND', cond) }).errors, /is proposed, but nothing in its section says so/), cond);
  assert.deepEqual(page({ next: dated.replace('COND', '<p data-conditional>Proposed dates.</p>') }).errors, []);
  const hiddenNote = page({ hero: HERO.replace(' data-excludes="fee"', ' data-excludes="fee" data-pdf-hide') });
  assert.ok(has(hiddenNote.errors, /\{\{fee\}\} is a partial total/), "a PDF-hidden exclusion note doesn't count either");
  const hiddenParent = page({ hero: HERO.replace('<p data-excludes="fee">', '<div class="pdf-hide"><p data-excludes="fee">').replace('scoping.</p>', 'scoping.</p></div>') });
  assert.ok(has(hiddenParent.errors, /\{\{fee\}\} is a partial total/));
});

test('commitments: no basis fails; sourced and supplied both need a data-source of the right kind', () => {
  assert.ok(has(page({ next: addTo(NEXT, '<p data-date="2026-11-20">Pick a plan</p>') }).errors, /data-date="2026-11-20" has no data-basis/));
  assert.ok(has(page({ next: NEXT.replace('data-source="vendor.trial"', 'data-source="vendor.pilot"') }).errors, /data-source="vendor.pilot", which site.json "sources" doesn't have/));
  assert.ok(has(page({ next: addTo(NEXT, '<p data-date="2026-11-20" data-basis="supplied">Pick a plan</p>') }).errors, /data-basis="supplied" but has no data-source/), 'supplied needs its evidence');
  assert.ok(has(page({ next: addTo(NEXT, '<p data-date="2026-11-20" data-basis="supplied" data-source="vendor.trial">Pick a plan</p>') }).errors, /is a published source, not a deal fact/));
  const site = withFacts({}, { 'deal.schedule': { supplied_by: 'Hollis procurement', received: 'soon' } });
  assert.ok(has(page({ site }).errors, /"received" should be the ISO day it was supplied/));
});

test('lead mode: a date carried by a fictional fact must be a proposed, conditional commitment', () => {
  const site = withFacts({ launch: 'First payroll January 7' }, {}, { fictional: ['client', 'launch'] });
  const r = page({ site, next: addTo(NEXT, '<p>{{facts.launch}}.</p>') });
  assert.ok(has(r.errors, /through fictional data \(\{\{facts.launch\}\}\)/), r.errors.join('\n'));
  const marked = page({ site, next: addTo(NEXT, '<p data-commitment data-basis="proposed">{{facts.launch}}.</p><p data-conditional>Proposed: set once the contract is signed.</p>') });
  assert.deepEqual(marked.errors, []);
});

test('lead mode: "a 30-day evaluation" typed into the page fails; the sourced token passes', () => {
  const r = page({ next: NEXT.replace('Start with the {{facts.vendor.trial}}.', 'Start with a 30-day evaluation.') });
  assert.ok(has(r.errors, /"Start with a 30-day evaluation\." types a date, duration or trial/), r.errors.join('\n'));
  assert.deepEqual(page().errors, []);
  assert.equal(typedCommitments('Kickoff on Nov 20.').length, 1);
  assert.equal(typedCommitments('We meet on 20 November.').length, 1);
  assert.equal(typedCommitments('Go-live in January.').length, 1);
  assert.equal(typedCommitments('Pick the plan that fits.').length, 0);
});

test('lead mode: a plain number typed into copy fails; a year, a token and a quote are fine', () => {
  const r = page({ hero: addTo(HERO, '<p>Over 4,000 employers and 120 depots.</p>') });
  assert.ok(has(r.errors, /"4,000" is a number typed into the copy[\s\S]*in fictional/));
  assert.ok(has(r.errors, /"120" is a number typed/));
  const fine = page({ hero: addTo(HERO, '<p>Since 2019 the team runs {{hours}} hours lighter.</p><svg><text>48</text></svg>') });
  assert.deepEqual(fine.errors, []);
});

test('lead mode: a fact with no source fails, and sourcing it clears it', () => {
  const site = withFacts({ vendor: { ...SITE.facts.vendor, clients: '4,000 employers' } });
  const hero = addTo(HERO, '<p>{{facts.vendor.clients}} run payroll on it.</p>');
  assert.ok(has(page({ site, hero }).errors, /\{\{facts.vendor.clients\}\} has no source[\s\S]*every claim traces to a source/));
  const sourced = { ...site, sources: { ...site.sources, 'vendor.clients': { url: 'https://acme.example/about', accessed: '2026-10-20', verbatim: true } } };
  assert.deepEqual(page({ site: sourced, hero }).errors, []);
});

test('sources: a quote needs verbatim words, an entry needs an https url and a day, and dated proof goes stale', () => {
  const para = page({ site: withFacts({}, { 'quotes.cfo': { ...SITE.sources['quotes.cfo'], verbatim: false } }) });
  assert.ok(has(para.errors, /quoted in a <blockquote>, but sources\["quotes.cfo"\] isn't "verbatim": true/));
  const bad = page({ site: withFacts({}, { 'vendor.name': { url: 'http://acme.example', accessed: 'last week', verbatim: true } }) });
  assert.ok(has(bad.errors, /"url" should be the https:\/\//));
  assert.ok(has(bad.errors, /"accessed" should be the ISO day/));
  const old = page({ site: withFacts({}, { 'vendor.rank': { ...SITE.sources['vendor.rank'], accessed: '2026-08-01' } }) });
  assert.ok(has(old.warnings, /dated proof[\s\S]*83 days ago/));
  assert.deepEqual(old.errors, []);
});

test('structured assumptions: capacity shown as cash fails, named or inline', () => {
  const r = page({ site: { ...SITE, model: { ...SITE.model, formats: { ...SITE.model.formats, hours: 'money' } } } });
  assert.ok(has(r.errors, /"hours" is time formatted as money, so the page shows capacity as cash/));
  const untyped = page({ site: { ...SITE, model: { ...SITE.model, types: { hours: 'time' } } } });
  assert.ok(has(untyped.errors, /"fee" is shown as money but has no type/));
  const inline = page({ hero: addTo(HERO, '<p>Worth {{= hours * 40 | money_k}} a year.</p>') });
  assert.ok(has(inline.errors, /\{\{= hours \* 40 \| money_k\}\} shows "hours" \(time\) as money: capacity shown as cash/), inline.errors.join('\n'));
  const site = { ...SITE, model: { ...SITE.model, inputs: { ...SITE.model.inputs, rate: 30 }, formats: { ...SITE.model.formats, rate: 'money' } } };
  const noCash = page({ site, hero: addTo(HERO, '<p>{{= rate * staff | money}} a month.</p>') });
  assert.ok(has(noCash.errors, /none of its names is typed "cash"\. Add model.types for "rate", "staff"/));
  const input = page({ site, hero: addTo(HERO, '<p>{{rate}} an hour.</p>') });
  assert.ok(has(input.errors, /"rate" is shown as money but has no type/), 'a money input needs a type too');
  const typed = { ...site, model: { ...site.model, types: { ...site.model.types, rate: 'rate', staff: 'count' } } };
  assert.ok(!has(page({ site: typed, hero: addTo(HERO, '<p>{{= rate * 2 | money}} a month.</p>') }).errors, /typed "cash"|as money/));
});

test('structured assumptions: an excluded total without data-excludes beside it fails', () => {
  assert.ok(has(page({ hero: HERO.replace(' data-excludes="fee"', '') }).errors, /\{\{fee\}\} is a partial total[\s\S]*a partial total names what it leaves out, next to the total/));
  const footerOnly = page({ hero: HERO.replace(' data-excludes="fee"', ''), footer: FOOTER.replace('</footer>', '<p data-excludes="fee">Fees leave out implementation.</p></footer>') });
  assert.ok(has(footerOnly.errors, /sections\/01-hero.html: \{\{fee\}\} is a partial total/), 'the note belongs in the same section');
});

// ── What the Garner Health run showed (Oct 23): a placeholder buyer, one knob, $158.4, and hedging ──
test('CASE Garner buyer: a placeholder buyer name fails; a real-sounding one and a category phrase pass', () => {
  const r = page({ site: withFacts({ client: { name: 'Example manufacturer', short: 'Acme Co' } }) });
  assert.ok(has(r.errors, /site.json facts.client.name is "Example manufacturer", a placeholder\. Give the buyer a real-sounding fictional name \("Quillan Ridge Foods"\)/));
  assert.ok(has(r.errors, /facts.client.short is "Acme Co", a placeholder/));
  const named = page({ site: { ...SITE, sample: { ...SITE.sample, buyer: 'Sample Employer' } } });
  assert.ok(has(named.errors, /sample.buyer is "Sample Employer", a placeholder/));
  const category = page({ site: { ...SITE, sample: { ...SITE.sample, buyer: 'a self-funded employer' } } });
  assert.ok(!has(category.errors, /placeholder/), 'the band\'s "could send a self-funded employer" is a category, not a name');
  assert.ok(!has(page().errors, /placeholder/), '"Hollis Foods" reads as a company');
});

test('CASE Garner showpiece: one input times a fixed rate fails; two inputs, or an input and a choice, pass', () => {
  const one = page({ hero: HERO.replace(/\s*<label>Hours each saves[^\n]*/, '') });
  assert.ok(has(one.errors, /The showpiece gives the buyer one knob; give them at least two \(their numbers and a choice\), so the page answers their situation, not a fixed rate\. Controls that move a figure: sections\/01-hero.html: 1\./), one.errors.join('\n'));
  const choice = page({ hero: HERO.replace(/\s*<label>Hours each saves[^\n]*/, '<div data-choice><button data-set=\'{"hours_saved":2}\'>Light</button><button data-set=\'{"hours_saved":4}\'>Heavy</button></div>') });
  assert.ok(!has(choice.errors, /showpiece/), choice.errors.join('\n'));
  const presets = page({ hero: HERO.replace(/\s*<label>Hours each saves[^\n]*/, '<div data-calc><button data-preset=\'{"hours_saved":2}\'>Light</button><button data-preset=\'{"hours_saved":4}\'>Heavy</button></div>') });
  assert.ok(!has(presets.errors, /showpiece/), 'a preset group counts once');
  const none = page({ hero: HERO.replace(/\s*<label>[^\n]*/g, '') });
  assert.ok(has(none.errors, /one knob[\s\S]*No section has a control that moves a figure/));
});

test('CASE Garner money: "$158.4" can\'t print; money_exact gives cents ($158.40), and a cash figure shown as a one-decimal number fails', () => {
  const model = { ...SITE.model, inputs: { ...SITE.model.inputs, spend: 1320, rate: 0.12 }, formulas: { ...SITE.model.formulas, equivalent: 'spend * rate' }, formats: { ...SITE.model.formats, spend: 'money_exact', rate: 'pct', equivalent: 'money_exact' }, types: { ...SITE.model.types, spend: 'cash', rate: 'rate', equivalent: 'cash' } };
  const cents = page({ site: { ...SITE, model }, hero: addTo(HERO, '<p>{{equivalent}} a month, or {{= equivalent * 2 | money_exact}} for two.</p>') });
  assert.ok(!has(cents.errors, /one decimal/), cents.errors.join('\n'));
  const whole = page({ site: { ...SITE, model: { ...model, formats: { ...model.formats, equivalent: 'money' } } }, hero: addTo(HERO, '<p>{{equivalent}} a month.</p>') });
  assert.ok(!has(whole.errors, /one decimal/), whole.errors.join('\n'));
  const number = page({ site: { ...SITE, model: { ...model, formats: { ...model.formats, equivalent: 'number' } } }, hero: addTo(HERO, '<p>{{equivalent}} a month.</p>') });
  assert.ok(has(number.errors, /"equivalent" prints "[^"]*158\.4": money to one decimal/), number.errors.join('\n'));
});

test('CASE Garner hedging: more than four hedges warn, naming the sections; quotes don\'t count', () => {
  const hedgy = '<p>An illustrative figure. Not a forecast and not a quote.</p><p>Actual results vary; hypothetical.</p>';
  const r = page({ next: addTo(NEXT, hedgy) });
  assert.ok(has(r.warnings, /The page hedges 5 times \(sections\/02-next.html: 5\); keep one qualifier beside each figure and say the rest with conviction\./), r.warnings.join('\n'));
  assert.deepEqual(r.errors, [], 'a warning, not an error');
  const quoted = page({ next: addTo(NEXT, `<blockquote>${hedgy}</blockquote>`) });
  assert.ok(!has(quoted.warnings, /hedges/));
  assert.ok(!has(page({ next: addTo(NEXT, '<p>An illustrative figure, not a forecast.</p>') }).warnings, /hedges/));
});

// ── The commercial-motion cases code can catch (commercial-motion-audit.md, Oct 23) ──
test('CASE Wiz: a typed 30-day evaluation against a sourced 21 days fails', () => {
  const site = withFacts({ vendor: { ...SITE.facts.vendor, evaluation: '21 days unless an extension is agreed' } }, { 'vendor.evaluation': { url: 'https://wiz.example/msa', accessed: '2026-10-23', verbatim: true } });
  const typed = page({ site, next: addTo(NEXT, '<p data-commitment data-basis="sourced" data-source="vendor.evaluation">A 30-day evaluation.</p>') });
  assert.ok(has(typed.errors, /is sourced from "vendor.evaluation" but doesn't show it/), typed.errors.join('\n'));
  const beside = page({ site, next: addTo(NEXT, '<p data-commitment data-basis="sourced" data-source="vendor.evaluation">A 30-day evaluation ({{facts.vendor.evaluation}}).</p>') });
  assert.ok(has(beside.errors, /"A 30-day evaluation \(\s*\)\." types a term beside its source \("vendor.evaluation"\)/));
});

test('CASE Salesforce: a sourced 30-day trial shown with its own token passes', () => {
  const site = withFacts({ vendor: { ...SITE.facts.vendor, trial: '30-day free trial' } });
  assert.deepEqual(page({ site }).errors, []);
});

test('CASE supplied schedule: an approved schedule with supplied_by passes unweakened, no conditional asked', () => {
  const site = withFacts({ deal: { schedule: { sign: 'Nov 20: contract signed', payroll: 'Jan 7: first payroll' } } }, { 'deal.schedule': { supplied_by: 'Hollis Foods procurement', received: '2026-10-21', note: 'approved in the kickoff email' } });
  const steps = '<ol data-dates><li data-date="2026-11-20" data-basis="supplied" data-source="deal.schedule">{{facts.deal.schedule.sign}}</li><li data-date="2027-01-07" data-basis="supplied" data-source="deal.schedule">{{facts.deal.schedule.payroll}}</li></ol>';
  const r = page({ site, next: addTo(NEXT, steps) });
  assert.deepEqual(r.errors, []);
  assert.ok(!has(r.warnings, /conditional|proposed/));
  // Supplied evidence vouches only for what it says: an unrelated supplied fact can't carry a typed promise.
  const contact = withFacts({ deal: { contact: 'Dana Ruiz' } }, { 'deal.contact': { supplied_by: 'Hollis Foods', received: '2026-10-21' } });
  const unrelated = page({ site: contact, next: addTo(NEXT, '<p data-date="2027-01-07" data-basis="supplied" data-source="deal.contact">First payroll January 7</p>') });
  assert.ok(has(unrelated.errors, /is supplied from "deal.contact" but doesn't show it/), unrelated.errors.join('\n'));
});

test('CASE CU Dental: an academic-calendar date typed as an onboarding deadline fails', () => {
  const r = page({ next: addTo(NEXT, '<p>Students start onboarding by January 15, with the spring block.</p>') });
  assert.ok(has(r.errors, /"Students start onboarding by January 15, with the spring block\." types a date/), r.errors.join('\n'));
  const site = withFacts({ calendar: { spring: 'January 15' } }, { calendar: { url: 'https://dental.example/calendar', accessed: '2026-10-20', verbatim: true } });
  const asDeadline = page({ site, next: addTo(NEXT, '<p data-date="2027-01-15">Onboarding done by {{facts.calendar.spring}}</p>') });
  assert.ok(has(asDeadline.errors, /data-date="2027-01-15" has no data-basis/));
});

test('CASE kickoff: a kickoff date with no basis fails', () => {
  const r = page({ next: addTo(NEXT, '<ol data-dates><li data-date="2026-11-02">Kickoff: connect Greenhouse</li></ol>') });
  assert.ok(has(r.errors, /data-date="2026-11-02" has no data-basis/));
});

test('CASE SetMeld: five stages typed as 5 weeks fails', () => {
  const r = page({ next: addTo(NEXT, '<p>Five stages, done in 5 weeks.</p>') });
  assert.ok(has(r.errors, /"Five stages, done in 5 weeks\." types a date, duration or trial/), r.errors.join('\n'));
  assert.ok(!has(page({ next: addTo(NEXT, '<p>Five stages, each once the last is signed off.</p>') }).errors, /types a date/), 'sequencing by dependency is fine');
});

test('ACCEPTANCE: a site pinned sites@1.7 gets the 1.8 rules as warnings, not errors', () => {
  const site = { ...SITE, engine: 'sites@1.7', model: { ...SITE.model, formats: { ...SITE.model.formats, hours: 'money' } } };
  const r = page({
    site,
    footer: FOOTER.replace('</p>', ' Unfairly again.</p>'),
    hero: HERO.replace(' data-excludes="fee"', ''),
    next: addTo(NEXT.replace('See the numbers', 'Calculate').replace('Start with the {{facts.vendor.trial}}.', 'Start with a 30-day evaluation.'), '<p>A note from Unfairly.</p><p data-date="2026-11-20">Pick</p><p>Teams save 40 hours.</p>'),
  });
  assert.deepEqual(r.errors, []);
  for (const re of [/appears \d+ times/, /A note from Unfairly/, /"40" is a number typed/, /only scrolls/, /30-day evaluation/, /no data-basis/, /capacity as cash/, /partial total/]) assert.ok(has(r.warnings, re), String(re));
});

test('a plain site (no lead) gets commitment kinds as warnings and none of the lead rules', () => {
  const site = { title: 'T', description: 'D', sample: true, facts: { x: 'Acme' } };
  const html = '<section data-section="a"><p>A sample. Kickoff Nov 20, a 30-day trial for 40 people.</p><p data-date="2026-11-20">Pick</p></section>';
  const r = checkSite({ site, sections: [{ name: '01-a.html', html }] });
  assert.ok(has(r.warnings, /no data-basis/));
  assert.ok(!has([...r.errors, ...r.warnings], /types a date|Example: a proposal|number typed into the copy/));
  assert.ok(has(r.warnings, /no sample band/), 'a regular sample keeps its sample-band advice');
});
