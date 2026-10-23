// Perturbation, control and print-state checks (bin/site/interact.mjs), run in
// a real browser against small built sites. Skipped when no browser launches.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSite } from '../bin/site-build.mjs';
import { serveDir } from '../bin/serve.mjs';
import { writeDeckPdf } from '../bin/site-audit.mjs';
import { exerciseControls, printStateProblems, selectPdfState } from '../bin/site/interact.mjs';

let browser = null;
try {
  const { default: puppeteer } = await import('puppeteer');
  browser = await puppeteer.launch({ headless: true });
} catch {
  browser = null;
}
const servers = [];
after(async () => {
  await browser?.close();
  await Promise.all(servers.map((s) => s.close()));
});
const NO_BROWSER = 'no headless browser here (npm run setup:browser)';

// A fictional cleaning company quoting an office: seats and visits a week.
const MODEL = {
  inputs: { seats: 40, visits: 3, rate: 2 },
  formulas: { weekly: 'seats * visits * rate', yearly: 'weekly * 48', weeks: 'max(1, ceil(seats / 20))' },
  formats: { weekly: 'money', yearly: 'money', rate: 'money' },
};
const CTA = '<p><a data-cta="book_meeting" href="mailto:ops@example.com">Book a walkthrough with Dana</a></p>';

async function site(sections, { model = MODEL, facts = { start: 'March 2' } } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'site-interact-'));
  await mkdir(join(root, 'site/sections'), { recursive: true });
  await mkdir(join(root, 'brand'), { recursive: true });
  await writeFile(join(root, 'site/site.json'), JSON.stringify({ title: 'Cleaning for Example Co', description: 'A cleaning plan.', model, facts }));
  for (const [i, html] of sections.entries()) await writeFile(join(root, `site/sections/${String(i + 1).padStart(2, '0')}.html`), html);
  await writeFile(
    join(root, 'brand/brand.json'),
    JSON.stringify({
      schema: 'brand-kit@1',
      identity: { name: 'Example Cleaning' },
      palette: { paper: '#ffffff', ink: '#222222', accent: '#aa3300' },
      typography: { display: { family: 'Georgia', source: 'system', fallback: 'serif' }, body: { family: 'Arial', source: 'system' } },
    }),
  );
  const built = await buildSite({ root });
  assert.deepEqual(built.missing, []);
  const server = await serveDir(join(root, 'dist-site'));
  servers.push(server);
  return { root, url: server.url };
}

async function open(url) {
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.setViewport({ width: 1280, height: 800 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.goto(`${url}/`, { waitUntil: 'networkidle0' });
  page.errs = errs;
  return page;
}

async function controls(sections, opts) {
  const { url } = await site(sections, opts);
  const page = await open(url);
  const r = await exerciseControls(page);
  assert.deepEqual(page.errs, []);
  await page.close();
  return r;
}

// The real PDF transform (writeDeckPdf), with the print-state checks hooked in
// where the audit will call them: the state before the transform, the checks before page.pdf().
async function pdfChecks(url, root) {
  const seen = {};
  const hooked = {
    newPage: async () => {
      const page = await browser.newPage();
      const pdf = page.pdf.bind(page);
      page.pdf = async (o) => {
        seen.figures = await page.$$eval('.pdf-page [data-v]', (els) => Object.fromEntries(els.map((e) => [e.dataset.v, e.textContent])));
        return pdf(o);
      };
      return page;
    },
  };
  // writeDeckPdf runs selectPdfState and printStateProblems itself, into the report.
  const report = { errors: [], warnings: [] };
  await writeDeckPdf(hooked, url, join(root, 'deck.pdf'), report);
  seen.state = seen.print = report;
  return seen;
}

// The page that passes: every input moves the answer, presets set a state, the
// all-off state reads, the link says where it goes, and the PDF keeps a result and a contact.
const GOOD = [
  `<section data-section="quote" data-pdf-state="big-office">
  <h2>Cleaning {{seats}} desks {{visits}} times a week is {{weekly}}.</h2>
  <div data-calc>
    <label>Desks <input type="range" data-input="seats" min="10" max="200" step="10" value="40"></label>
    <label>Visits a week <input type="range" data-input="visits" min="1" max="5" step="1" value="3"></label>
    <button data-preset='{"seats":20,"visits":2}'>Small office</button>
    <button id="big-office" data-preset='{"seats":120,"visits":5}'>Whole floor</button>
  </div>
  <p data-pdf-summary>The printed quote assumes the desks and visits shown above, at {{rate}} a desk a visit.</p>
  <p data-date-out>Setup takes {{weeks}} weeks from {{facts.start}}.</p>
  <p><a href="#plan">See the numbers</a></p>
</section>`,
  `<section data-section="plan" id="plan">
  <h2>That's {{yearly}} over a 48-week year.</h2>
  ${CTA}
</section>`,
];

test('ACCEPTANCE: a page whose every control does what it says passes every check, live and in the PDF', async (t) => {
  if (!browser) return t.skip(NO_BROWSER);
  const r = await controls(GOOD);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
  const { root, url } = await site(GOOD);
  const pdf = await pdfChecks(url, root);
  assert.deepEqual(pdf.state.errors, []);
  assert.deepEqual(pdf.print.errors, []);
  // data-pdf-state prints the "Whole floor" scenario, not the default.
  assert.equal(pdf.figures.weekly, '$1,200');
  assert.equal(pdf.figures.seats, '120');
});

test('ACCEPTANCE: a headline that ignores one of its inputs fails, naming the input', async (t) => {
  if (!browser) return t.skip(NO_BROWSER);
  const html = `<section data-section="quote">
  <h2>Cleaning {{seats}} desks is {{= seats * rate * 3 | money}} a week.</h2>
  <label>Desks <input type="range" data-input="seats" min="10" max="200" step="10" value="40"></label>
  <label>Visits <input type="range" data-input="visits" min="1" max="5" step="1" value="3"> <span data-v="visits">3</span></label>
  ${CTA}
</section>`;
  const r = await controls([html]);
  assert.deepEqual(r.errors, ['section "quote": the input "visits" moves nothing on the page. Make the answer depend on it, or remove it.']);
});

test('ACCEPTANCE: a "Calculate" link that only scrolls fails; one that says where it goes passes', async (t) => {
  if (!browser) return t.skip(NO_BROWSER);
  const html = (label) => `<section data-section="quote">
  <h2>Cleaning {{seats}} desks is {{weekly}} a week.</h2>
  <label>Desks <input type="range" data-input="seats" min="10" max="200" step="10" value="40"></label>
  <p><a href="#plan">${label}</a> <button type="button">Run the numbers</button></p>
</section>
<section data-section="plan" id="plan"><h2>{{yearly}} a year.</h2>${CTA}</section>`;
  const bad = await controls(html('Calculate my quote').split(/(?=<section data-section="plan")/));
  assert.deepEqual(bad.errors, [
    `section "quote": "Calculate my quote" doesn't compute anything; say where it goes ("See the numbers").`,
    `section "quote": "Run the numbers" doesn't compute anything; say where it goes ("See the numbers").`,
  ]);
  const good = await controls(html('See the numbers').replace(/ <button[^]*?<\/button>/, '').split(/(?=<section data-section="plan")/));
  assert.deepEqual(good.errors, []);
});

test('preset stability: a preset that changes the page on its second click fails', async (t) => {
  if (!browser) return t.skip(NO_BROWSER);
  // A "preset" that steps from wherever it is: the second click adds another team.
  const html = `<section data-section="quote">
  <h2>Cleaning {{seats}} desks is {{weekly}} a week.</h2>
  <label>Desks <input type="number" data-input="seats" min="10" max="400" value="40"></label>
  <button data-preset='{}' data-step="20" data-for="seats">Add the sales team</button>
  ${CTA}
</section>`;
  const r = await controls([html]);
  assert.equal(r.errors.length, 1, r.errors.join('\n'));
  assert.match(r.errors[0], /^section "quote": the preset "Add the sales team" gives a different page on its second click \("Cleaning 60 desks is \$360 a week\." becomes "Cleaning 80 desks is \$480 a week\."\)/);
});

test('ACCEPTANCE: a preset whose labelled figure follows an input it does not set fails (E065)', async (t) => {
  if (!browser) return t.skip(NO_BROWSER);
  // "Half the published rate" should price against the published rate, but the label is worked
  // from the reader's own desk count, so it shows half of their current bill.
  const model = { ...MODEL, formulas: { ...MODEL.formulas, half: 'seats * visits * rate / 2', half_published: '40 * 3 * rate / 2' }, formats: { ...MODEL.formats, half: 'money', half_published: 'money' } };
  const html = (fig) => `<section data-section="quote">
  <h2>Cleaning {{seats}} desks is {{weekly}} a week.</h2>
  <label>Desks <input type="number" data-input="seats" min="10" max="400" value="40"></label>
  <button id="half" data-preset='{"visits":3}'>Half the published rate</button>
  <p data-preset-label="half">At half the published rate: {{${fig}}} a week.</p>
  ${CTA}
</section>`;
  const bad = await controls([html('half')], { model });
  assert.deepEqual(bad.errors, ['section "quote": the preset "Half the published rate" labels "At half the published rate: $120 a week." as its own, but it becomes "At half the published rate: $180 a week." when "seats" changes, which the preset doesn\'t set (E065). Work the preset\'s figure from its own baseline, or label it as a share of the reader\'s figures.']);
  const good = await controls([html('half_published')], { model });
  assert.deepEqual(good.errors, []);
});

test('ACCEPTANCE: an all-off planner that blanks a date or breaks a sentence in another section fails, naming both (E024, E053)', async (t) => {
  if (!browser) return t.skip(NO_BROWSER);
  const planner = `<section data-section="planner">
  <h2>Cleaning {{seats}} desks is {{weekly}} a week.</h2>
  <label>Desks <input type="range" data-input="seats" min="0" max="200" step="10" value="40"></label>
  <p>Payback in {{= seats / 10 - 2 | number}} months.</p>
</section>`;
  const timeline = `<section data-section="timeline">
  <h2>The plan</h2>
  <p data-date-out><span data-when="seats > 0">The crew starts {{facts.start}}.</span></p>
  <p data-commitment>Billing starts on <span data-when="seats > 0">week {{weeks}}</span>.</p>
  ${CTA}
</section>`;
  const r = await controls([planner, timeline]);
  const all = r.errors.join('\n');
  assert.ok(r.errors.includes('section "timeline": the date <p> "The crew starts March 2." goes blank when section "planner" is worked (with "seats" at 0). Write a sentence for that state.'), all);
  assert.ok(r.errors.includes('section "timeline": the commitment <p> "Billing starts on week 2." reads as a broken sentence ("Billing starts on .") when section "planner" is worked (with "seats" at 0). Write a sentence for that state.'), all);
  assert.ok(r.errors.some((e) => e.startsWith('section "planner": "-2 months" is a negative duration')), all);
  // Written for the empty state, the same timeline passes.
  const fixed = timeline
    .replace('<p data-date-out><span data-when="seats > 0">The crew starts {{facts.start}}.</span></p>', '<p data-date-out>The crew starts {{facts.start}}.</p>')
    .replace('<p data-commitment>Billing starts on <span data-when="seats > 0">week {{weeks}}</span>.</p>', '<p data-commitment>Billing starts in week {{weeks}}.</p>');
  const ok = await controls([planner.replace('{{= seats / 10 - 2 | number}}', '{{= max(0, seats / 10 - 2) | number}}'), fixed]);
  assert.deepEqual(ok.errors, []);
});

test('a choice set restores to its default; a toggle whose page disagrees with its marked button fails the reset', async (t) => {
  if (!browser) return t.skip(NO_BROWSER);
  // The all-off choice carries a lower rate; the default button brings the opening figures back.
  const choice = `<section data-section="quote">
  <h2>{{weekly}} a week at {{rate}} a desk.</h2>
  <label>Desks <input type="range" data-input="seats" min="10" max="200" step="10" value="40"></label>
  <div data-choice><button data-set='{"rate":1}'>Basic</button><button data-set='{"rate":2}' class="is-on">Deep</button></div>
  ${CTA}
</section>`;
  assert.deepEqual((await controls([choice])).errors, []);
  // Without a button for the default rate, the section can't be restored by hand and the reset check stands aside.
  const noHome = await controls([choice.replace(`<button data-set='{"rate":2}' class="is-on">Deep</button>`, `<button data-set='{"rate":3}'>Deep</button>`)]);
  assert.deepEqual(noHome.errors, []);
  // The page prints the weekly plan, but marks "Monthly" as on: clicking it back can't return the opening text.
  const toggle = `<section data-section="billing">
  <h2>Cleaning {{seats}} desks is {{weekly}} a week.</h2>
  <label>Desks <input type="range" data-input="seats" min="10" max="200" step="10" value="40"></label>
  <div data-toggle><button data-i="0">Weekly</button><button data-i="1" class="is-on">Monthly</button>
  <p>Billed <span data-values='["weekly","monthly"]'>weekly</span>.</p></div>
  ${CTA}
</section>`;
  const r = await controls([toggle]);
  assert.deepEqual(r.errors, ['section "billing": after putting every input back, <span> "monthly" shows "monthly" instead of "weekly". A reset has to return the opening figures.']);
});

test('ACCEPTANCE: a PDF page with a slider that says "move the slider" and shows no result fails, as does a PDF with no contact (E004, E021)', async (t) => {
  if (!browser) return t.skip(NO_BROWSER);
  const html = `<section data-section="quote">
  <h2>What would a cleaner office cost?</h2>
  <p>Move the slider to see your weekly price.</p>
  <label>Desks <input type="range" data-input="seats" min="10" max="200" step="10" value="40"></label>
  <p data-pdf-hide>That's {{weekly}} a week.</p>
  <p data-pdf-hide><a data-cta="book_meeting" href="mailto:ops@example.com">Book a walkthrough</a></p>
</section>`;
  const { root, url } = await site([html]);
  const pdf = await pdfChecks(url, root);
  assert.deepEqual(pdf.print.errors, [
    'PDF page 1 ("quote"): the PDF leaves out its results, so it needs a visible [data-pdf-summary] that states the chosen result and its assumptions.',
    `PDF page 1 ("quote") says "Move the slider", which a PDF can't do. Mark it data-pdf-hide, or say what the printed figure assumes.`,
    'the PDF has no next step or contact. Keep a visible a[data-cta], a mailto: or tel: link, or add a [data-pdf-contact] line.',
  ]);
  // A printed summary and contact clear it.
  const fixed = html
    .replace('<p>Move the slider', '<p data-pdf-hide>Move the slider')
    .replace('</section>', '<p data-pdf-summary>The printed price assumes {{seats}} desks: {{weekly}} a week.</p><p data-pdf-contact>Dana Ruiz, ops@example.com</p></section>');
  const again = await site([fixed]);
  assert.deepEqual((await pdfChecks(again.url, again.root)).print.errors, []);
  // A summary of words alone ("Summary") states no result: it doesn't count.
  const wordsOnly = html
    .replace('<p>Move the slider', '<p data-pdf-hide>Move the slider')
    .replace('</section>', '<p data-pdf-summary>Summary</p><p data-pdf-contact>Dana Ruiz, ops@example.com</p></section>');
  const bare = await site([wordsOnly]);
  assert.ok((await pdfChecks(bare.url, bare.root)).print.errors.some((e) => /needs a visible \[data-pdf-summary\]/.test(e)));
});

test('ACCEPTANCE: a section whose result is data-pdf-hide prints a summary, in the default and an alternate state (E004)', async (t) => {
  if (!browser) return t.skip(NO_BROWSER);
  const html = (summary, state = '') => `<section data-section="plans"${state}>
  <h2>Pick the plan that fits the floor.</h2>
  <div data-picker data-pdf-hide>
    <button role="tab" aria-controls="p-std" class="is-on">Standard</button><button role="tab" aria-controls="p-deep">Deep clean</button>
    <div id="p-std" role="tabpanel" class="is-on"><p>Desks and kitchens.</p></div>
    <div id="p-deep" role="tabpanel"><p>Desks, kitchens and carpets.</p></div>
  </div>
  <div data-pdf-hide>
    <label>Desks <input type="range" data-input="seats" min="10" max="200" step="10" value="40"></label>
    <button id="floor" data-preset='{"seats":120}'>Whole floor</button>
    <p>That's {{weekly}} a week.</p>
  </div>
  <details><summary>What's included</summary><p>Supplies and a named supervisor.</p></details>
  ${summary}
  ${CTA}
</section>`;
  const summary = '<p data-pdf-summary>Printed for {{seats}} desks, three visits a week: {{weekly}} a week.</p>';
  for (const state of ['', ' data-pdf-state="floor"']) {
    const bare = await site([html('', state)]);
    assert.deepEqual((await pdfChecks(bare.url, bare.root)).print.errors, [
      'PDF page 1 ("plans"): the PDF leaves out its controls and results, so it needs a visible [data-pdf-summary] that states the chosen result and its assumptions.',
    ], `state "${state}"`);
    const fixed = await site([html(summary, state)]);
    const pdf = await pdfChecks(fixed.url, fixed.root);
    assert.deepEqual(pdf.print.errors, [], `state "${state}"`);
    assert.equal(pdf.figures.weekly, state ? '$720' : '$240', 'the summary prints the chosen state');
  }
});

test('ACCEPTANCE: a printed page keeps a proposed date beside its condition and a partial total beside what it leaves out', async (t) => {
  if (!browser) return t.skip(NO_BROWSER);
  const model = { ...MODEL, excludes: { weekly: 'supplies, which are quoted after the walkthrough' } };
  const html = (hide) => `<section data-section="offer">
  <h2>{{weekly}} a week for the cleaning.</h2>
  <p data-excludes="weekly"${hide}>Supplies are quoted after the walkthrough.</p>
  <p data-commitment data-basis="proposed">The crew could start {{facts.start}}.</p>
  <p data-conditional${hide}>Proposed: the start moves with the signed order.</p>
  ${CTA}
</section>`;
  const bad = await site([html(' data-pdf-hide')], { model });
  assert.deepEqual((await pdfChecks(bad.url, bad.root)).print.errors, [
    `PDF page 1 ("offer") prints a proposed commitment ("The crew could start March 2.") without its [data-conditional] note. Keep the note on the printed page (don't data-pdf-hide it).`,
    'PDF page 1 ("offer") prints {{weekly}}, a partial total, without the line that says what it leaves out. Keep a visible data-excludes="weekly" on the same page.',
  ]);
  const good = await site([html('')], { model });
  assert.deepEqual((await pdfChecks(good.url, good.root)).print.errors, []);
});

test('data-pdf-state naming no element is an error', async (t) => {
  if (!browser) return t.skip(NO_BROWSER);
  const { url } = await site([GOOD[0].replace('data-pdf-state="big-office"', 'data-pdf-state="nope"'), GOOD[1]]);
  const page = await open(`${url}`);
  const r = await selectPdfState(page);
  await page.close();
  assert.deepEqual(r.errors, ['section "quote": data-pdf-state="nope" names no element with that id in the section. Give the preset to print id="nope".']);
});
