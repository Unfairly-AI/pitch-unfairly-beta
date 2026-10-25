import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSite } from '../bin/site/check.mjs';

// Engine 1.10: a sample proposal is the seller's page. Unfairly's booking buttons,
// "yours could look like this", the viewers demo and the house close are our pitch,
// and they block (unpinned or pinned 1.10+; warnings on an older pin).
const has = (list, re) => list.some((m) => re.test(m));
const site = (extra = {}) => ({ title: 'Northline for Harlow', description: 'A proposal.', sample: true, facts: { client: { name: 'Harlow Services' }, sample: { made_by_label: 'Made by Unfairly', made_by_href: 'https://pitchunfairly.com', book_label: 'Book 30 minutes', book_href: 'https://calendly.com/bob-unfairly/30min', email_label: 'Email us', email_href: 'mailto:bob@unfairly.ai' } }, ...extra });
const BAND = '<header class="top tb-top"><div class="tb-sample-bar" data-sample role="note"><p>Sample proposal. {{facts.client.name}} and its numbers are fictional.</p><a href="{{facts.sample.made_by_href}}" target="_blank" rel="noopener" data-cta="made_by">{{facts.sample.made_by_label}}</a></div></header>';
const AD_BAND = '<header class="top tb-top"><div class="tb-sample-bar" data-sample role="note"><p>Sample proposal. {{facts.client.name}} and its numbers are fictional. Yours could look like this.</p><a href="{{facts.sample.book_href}}" target="_blank" rel="noopener" data-cta="book_meeting">{{facts.sample.book_label}}</a><a href="{{facts.sample.email_href}}" target="_blank" rel="noopener" data-cta="talk_to_us">{{facts.sample.email_label}}</a></div></header>';
const HERO = { name: '01-hero.html', html: '<section id="hero" data-section="hero"><h1>Routes for {{facts.client.name}}, a sample.</h1></section>' };
const VIEWERS = { name: '09-viewers.html', html: '<section id="viewers" data-section="viewers"><h2>Each reader gets a named link.</h2><div class="tb-viewers"><p>Riley read it.</p></div></section>' };
const CLOSE = { name: '10-close.html', html: '<section id="next" class="tb-sample-close" data-section="close"><h2>Want one?</h2></section>' };
const PITCH = /booking pitch|yours could look like this|viewers demo|house close/i;

test('ACCEPTANCE: a sample carrying Unfairly\'s booking band, viewers demo and house close is blocked', () => {
  const r = checkSite({ site: site(), header: AD_BAND, sections: [HERO, VIEWERS, CLOSE] });
  assert.ok(has(r.errors, /booking pitch \("Book 30 minutes"\)/), 'Book 30 minutes');
  assert.ok(has(r.errors, /booking pitch \("Email us"\)/), 'Email us');
  assert.ok(has(r.errors, /"Yours could look like this" pitches Unfairly/));
  assert.ok(has(r.errors, /viewers demo/));
  assert.ok(has(r.errors, /house close/));
  assert.ok(has(r.errors, /2 calls to action/));
});

test('ACCEPTANCE: a sample whose band only says what it is, with one "Made by Unfairly" link, passes', () => {
  const r = checkSite({ site: site(), header: BAND, sections: [HERO] });
  assert.ok(!has([...r.errors, ...r.warnings], PITCH), [...r.errors, ...r.warnings].join('\n'));
  assert.ok(!has(r.warnings, /no sample band/));
});

test('a band with no link at all is fine too', () => {
  const r = checkSite({ site: site(), header: BAND.replace(/<a [\s\S]*?<\/a>/, ''), sections: [HERO] });
  assert.ok(!has([...r.errors, ...r.warnings], PITCH));
});

test('a site pinned before 1.10 gets the same findings as warnings, so it keeps building', () => {
  const r = checkSite({ site: site({ engine: 'sites@1.9' }), header: AD_BAND, sections: [HERO, VIEWERS] });
  assert.ok(!has(r.errors, PITCH));
  assert.ok(has(r.warnings, /booking pitch/) && has(r.warnings, /viewers demo/));
});

test('a lead sample is held to the same rule: no viewers demo', () => {
  const r = checkSite({ site: site({ sample: { lead: true, seller: 'Northline', buyer: 'a field-service firm' } }), header: BAND, sections: [HERO, VIEWERS] });
  assert.ok(has(r.errors, /viewers demo/));
});

test('a real proposal (not a sample) is untouched: its own booking button is the seller\'s', () => {
  const s = site(); delete s.sample;
  const r = checkSite({ site: s, sections: [HERO, { name: '10-next.html', html: '<section id="next" data-section="next"><a href="https://calendly.com/northline" target="_blank" rel="noopener" data-cta="book_meeting">Book 30 minutes</a></section>' }] });
  assert.ok(!has([...r.errors, ...r.warnings], PITCH));
});
