import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSite } from '../bin/site/check.mjs';
import { contrastFindings, faqFinding, hedgeFindings } from '../bin/site/copy.mjs';

// Engine 1.11: three copy tells the Oct 23 pass over nine real sample sites kept finding.
// Each blocks on a site pinned sites@1.11+ (or unpinned) and warns on an older pin.
const has = (list, re) => list.some((m) => re.test(m));
const SITE = { title: 'Northline for Harlow', description: 'A proposal.', facts: { vendor: { name: 'Northline' }, client: { name: 'Harlow Services' } } };
const section = (html, name = '02-body.html') => ({ name, html: `<section id="body" data-section="body">${html}</section>` });
const HERO = { name: '01-hero.html', html: '<section id="hero" data-section="hero"><h1>Routes for Harlow.</h1></section>' };
const check = (html, extra = {}) => checkSite({ site: { ...SITE, ...extra }, sections: [HERO, section(html)] });

test('ACCEPTANCE: "X, not Y" contrast lines are caught, the real ones included', () => {
  for (const line of ['A scenario, not an estimate.', 'Setup follows approval, not a calendar.', 'Training and support are add-ons, not included', 'The fee is fixed, not hourly.']) {
    assert.equal(contrastFindings(`<p>${line}</p>`).length, 1, line);
  }
  // A token's span or a link inside the sentence doesn't hide it.
  assert.equal(contrastFindings('<p>A <span data-v="x">$40</span> scenario, not an <a href="#price">estimate</a>.</p>').length, 1);
});

test('contrast: ordinary English and other people\'s words pass', () => {
  for (const html of [
    '<p>Not only fast, but cheap.</p>', // "not only" is the 1.2 formula warning, not this rule
    '<p>We start Monday, not yet signed.</p>',
    '<p>Whether you sign or not, the data is yours.</p>',
    '<p>Most teams, not least the dispatchers, like it.</p>',
    '<p>We bill monthly, not because we must but because you asked for it in March.</p>',
    '<p>Ready when you are, not before you are ready to commit to a plan.</p>',
    '<blockquote>Fast, not cheap.</blockquote>',
    '<p>They called it “fast, not cheap.” We agree.</p>',
    '<p data-copy-ok data-copy-source="https://example.com/review">Fast, not cheap.</p>',
    '<ol class="sources"><li>Rates effective 2026, not retroactive.</li></ol>',
    '<p class="footnote">Taxes billed separately, not included.</p>',
    '<small>Prices in USD, not CAD.</small>',
  ]) assert.deepEqual(contrastFindings(html), [], html);
});

test('ACCEPTANCE: a FAQ section is caught by its heading or by a body of questions', () => {
  for (const h of ['Questions', 'FAQ', 'FAQs', 'Frequently asked questions', 'Your questions, answered', 'Questions, answered', 'Q&A', 'What operations leads ask before they sign.', 'What finance teams want to know']) {
    assert.ok(faqFinding(`<section><h2>${h}</h2><p>Some text.</p></section>`), h);
  }
  assert.ok(faqFinding('<section><p class="tb-eyebrow">Questions</p><h2>Before you sign.</h2></section>'), 'an eyebrow counts');
  const accordion = '<section><h2>The details</h2><details><summary>Can we start with one crew?</summary><p>Yes.</p></details><details><summary>Who owns the data?</summary><p>You do.</p></details><details><summary>How are we billed?</summary><p>Monthly.</p></details></section>';
  assert.match(faqFinding(accordion), /3 of its 3 headings and toggles are questions/);
});

test('FAQ: a section that asks one question, or names what the buyer asked for, passes', () => {
  for (const html of [
    '<section><h2>What you asked for</h2><p>Routes that hold.</p></section>',
    '<section><h2>Why now?</h2><h3>Costs rise</h3><h3>Teams grow</h3><h3>Is it worth it?</h3></section>',
    '<section><h2>Three questions to settle on the call</h2></section>',
    '<section><h2>Open questions</h2></section>',
    '<section><h2>The plan</h2><details><summary>The full scope</summary></details><details><summary>Who does what</summary></details><details><summary>Is it reversible?</summary></details></section>',
  ]) assert.equal(faqFinding(html), null, html);
});

test('ACCEPTANCE: attribution hedges on the seller\'s own claims are caught', () => {
  const seller = ['Northline'];
  for (const [html, hit] of [
    ['<p>Per Salesforce, teams close deals faster.</p>', 'Per Salesforce'],
    ['<p>The fastest router, as Northline publishes it.</p>', 'as Northline publishes it'],
    ['<p>Northline serves 2,000 crews, by its own count.</p>', 'by its own count'],
    ['<p>According to its own survey, setup takes a day.</p>', 'According to its own'],
    ['<p>Northline says setup takes a day.</p>', 'Northline says'],
    ['<p>Setup takes a day, the company says.</p>', 'the company says'],
  ]) {
    const found = hedgeFindings(html, { seller });
    assert.equal(found.length, 1, html);
    assert.ok(found[0].includes(`"${hit}"`), found[0]);
  }
});

test('hedges: units, third parties and the sources section pass', () => {
  for (const html of [
    '<p>Billed per seat, per month.</p>',
    '<h2>Cost per Technician Per Month</h2>',
    '<p>Gartner says the market doubles by 2030.</p>',
    '<p>According to Gartner, the market doubles.</p>',
    '<ol class="sources"><li>Per Salesforce pricing page, read 2026-10-20.</li></ol>',
    '<section data-section="sources"><p>Northline says so on its pricing page.</p></section>',
    '<blockquote>By its own count, the team saved a day a week.</blockquote>',
  ]) assert.deepEqual(hedgeFindings(html, { seller: ['Northline'] }), [], html);
});

test('ACCEPTANCE: the three tells block unpinned or on sites@1.11, and warn on an older pin', () => {
  const html = '<h2>Your questions, answered</h2><p>A scenario, not an estimate.</p><p>Northline serves 2,000 crews, by its own count.</p>';
  const now = check(html);
  assert.ok(has(now.errors, /contrast line/) && has(now.errors, /is a FAQ/) && has(now.errors, /hedges a claim/), now.errors.join('\n'));
  assert.ok(has(check(html, { engine: 'sites@1.11' }).errors, /contrast line/));
  const old = check(html, { engine: 'sites@1.10' });
  assert.ok(!has(old.errors, /contrast line|is a FAQ|hedges a claim/), old.errors.join('\n'));
  assert.ok(has(old.warnings, /contrast line/) && has(old.warnings, /is a FAQ/) && has(old.warnings, /hedges a claim/));
});
