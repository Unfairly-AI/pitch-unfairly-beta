import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSite } from '../bin/site/check.mjs';
import { fillTokens } from '../bin/site/fill.mjs';
import { bandLinkProblem } from '../bin/site/lead.mjs';

// Engine 1.11: the sample band's one link goes to an Unfairly home page, whatever its label.
// The Oct 23 pass found a "Made by Unfairly" link whose href was Bob's booking calendar.
const has = (list, re) => list.some((m) => re.test(m));
const site = (made = 'https://unfairly.ai/', extra = {}) => ({ title: 'Northline for Harlow', description: 'A proposal.', sample: true, facts: { vendor: { name: 'Northline' }, client: { name: 'Harlow Services' }, sample: { made_by_label: 'Made by Unfairly', made_by_href: made } }, ...extra });
const band = (link = '<a href="{{facts.sample.made_by_href}}" target="_blank" rel="noopener" data-cta="made_by">{{facts.sample.made_by_label}}</a>', print = '') =>
  `<header class="top tb-top"><div class="tb-sample-bar" data-sample role="note"><p>Sample proposal from {{facts.vendor.name}}. {{facts.client.name}} and its numbers are fictional.</p>${link}</div></header><div class="tb-sample-print pdf-only" data-sample><p>Sample proposal from {{facts.vendor.name}}.${print}</p></div>`;
const HERO = { name: '01-hero.html', html: '<section id="hero" data-section="hero"><h1>Routes for {{facts.client.name}}, a sample.</h1></section>' };
const LINK = /links to .*Unfairly home page/;

test('ACCEPTANCE: a "Made by Unfairly" link to a booking calendar is blocked, though its label passes the 1.10 rule', () => {
  const r = checkSite({ site: site('https://calendly.com/bob-unfairly/30min'), header: band(), sections: [HERO] });
  assert.ok(has(r.errors, /header\.html: the sample band links to https:\/\/calendly\.com\/bob-unfairly\/30min, a booking calendar\./), r.errors.join('\n'));
  assert.ok(!has(r.errors, /booking pitch \("Made by Unfairly"\)/), 'the label is fine; the target is the problem');
});

test('ACCEPTANCE: the band linking to an Unfairly home page passes', () => {
  for (const href of ['https://unfairly.ai/', 'https://unfairly.ai', 'https://www.unfairly.ai/', 'https://pitchunfairly.com', 'https://pitchunfairly.com/templates', 'https://unfairly.ai/?ref=sample']) {
    const r = checkSite({ site: site(href), header: band(), sections: [HERO] });
    assert.ok(!has([...r.errors, ...r.warnings], LINK), `${href}: ${[...r.errors, ...r.warnings].join('\n')}`);
  }
});

test('every other target is called out: mail, phone, claim and app flows, other hosts', () => {
  const cases = {
    'mailto:bob@unfairly.ai': /an email address/,
    'tel:+15555550100': /a phone number/,
    'https://app.unfairly.ai/claim': /app\.unfairly\.ai, not our home page/,
    'https://unfairly.ai/claim/abc': /a booking, claim or sign-up flow/,
    'https://pitchunfairly.com/book': /a booking, claim or sign-up flow/,
    'https://cal.com/bob': /a booking calendar/,
    'https://bob.calendly.com/x': /a booking calendar/,
    'https://example.com/': /which isn't Unfairly's \(example\.com\)/,
    '#top': /which isn't a web page of ours/,
  };
  for (const [href, why] of Object.entries(cases)) assert.match(bandLinkProblem(href) ?? '', why, href);
  assert.equal(bandLinkProblem('https://unfairly.ai/'), null);
  assert.equal(bandLinkProblem('https://pitchunfairly.com/templates/proposal'), null);
});

test('the PDF strip is held to the same rule, and so is a contact it prints as text', () => {
  const linked = checkSite({ site: site(), header: band(undefined, ' <a href="https://calendly.com/bob-unfairly/30min">Made by Unfairly</a>'), sections: [HERO] });
  assert.ok(has(linked.errors, /the PDF strip of the sample band links to https:\/\/calendly\.com/), linked.errors.join('\n'));
  for (const printed of [' Made by Unfairly, bob@founder.example.', ' Made by Unfairly: calendly/bob.', ' Write to hello@unfairly.ai.']) {
    const r = checkSite({ site: site(), header: band(undefined, printed), sections: [HERO] });
    assert.ok(has(r.errors, /PDF strip of the sample band prints a way to reach us|sample band asks the reader to book or email us/), `${printed}: ${r.errors.join('\n')}`);
  }
});

test('a site pinned before 1.11 gets the link finding as a warning, so it keeps building', () => {
  const r = checkSite({ site: site('https://calendly.com/bob-unfairly/30min', { engine: 'sites@1.10' }), header: band(), sections: [HERO] });
  assert.ok(!has(r.errors, LINK), r.errors.join('\n'));
  assert.ok(has(r.warnings, /a booking calendar/));
});

test('a real proposal is untouched: no band, and its own booking link is the seller\'s', () => {
  const s = site('https://calendly.com/northline');
  delete s.sample;
  const r = checkSite({ site: s, sections: [HERO, { name: '02-next.html', html: '<section id="next" data-section="next"><a href="https://calendly.com/northline" target="_blank" rel="noopener" data-cta="book_meeting">Book 30 minutes</a></section>' }] });
  assert.ok(!has([...r.errors, ...r.warnings], LINK));
});

test('the old fact names (book_href, book_print) still fill the made-by link, with a warning to rename them', () => {
  const s = site();
  s.facts.sample = { made_by_label: 'Made by Unfairly', book_href: 'https://unfairly.ai/', book_print: 'unfairly.ai' };
  assert.equal(fillTokens('<a href="{{facts.sample.made_by_href}}">{{facts.sample.made_by_print}}</a>', s).html, '<a href="https://unfairly.ai/">unfairly.ai</a>');
  const r = checkSite({ site: s, header: band(), sections: [HERO] });
  assert.deepEqual(r.errors, []);
  assert.ok(has(r.warnings, /facts\.sample\.book_href is the old name for the "Made by Unfairly" link\. Rename it made_by_href\./), r.warnings.join('\n'));
  assert.ok(has(r.warnings, /facts\.sample\.book_print is the old name/));
  const oldToken = checkSite({ site: s, header: band('<a href="{{facts.sample.book_href}}" target="_blank" rel="noopener" data-cta="made_by">Made by Unfairly</a>'), sections: [HERO] });
  assert.ok(has(oldToken.warnings, /\{\{facts\.sample\.book_href\}\} is the old name .* Use \{\{facts\.sample\.made_by_href\}\}\./));
  // The old name pointing at a calendar is still a calendar.
  s.facts.sample.book_href = 'https://calendly.com/bob-unfairly/30min';
  assert.ok(has(checkSite({ site: s, header: band(), sections: [HERO] }).errors, /a booking calendar/));
});
