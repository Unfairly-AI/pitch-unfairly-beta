import { test } from 'node:test';
import assert from 'node:assert/strict';
import { htmlToText, siteText } from '../bin/site/text.mjs';

test('ACCEPTANCE: a section reads as plain text: headings, prose, lists, links, tables and code', () => {
  const html = `<main><section data-section="price">
    <p class="eyebrow">02 / Price</p>
    <h2>What it costs</h2>
    <p>Whole Care is <span data-v="pepm">$20</span> per employee per month. See the <a href="https://example.com/terms">terms</a> and the <a href="assets/openapi.json">OpenAPI file</a>.</p>
    <ol><li><span class="n">01</span><span>Send a request</span></li><li>Review it</li></ol>
    <table><tr><th>Plan</th><th>Price</th></tr><tr><td>Lean</td><td>$20</td></tr></table>
    <pre><code>{ "a": 1 }</code></pre>
    <p>Call <code>POST /requests</code>&nbsp;first &amp; wait.</p>
  </section></main>`;
  assert.equal(
    htmlToText(html),
    [
      '02 / Price',
      '### What it costs',
      'Whole Care is $20 per employee per month. See the terms (https://example.com/terms) and the OpenAPI file (assets/openapi.json).',
      '1. 01 Send a request\n2. Review it',
      '| Plan | Price |\n| --- | --- |\n| Lean | $20 |',
      '```\n{ "a": 1 }\n```',
      'Call `POST /requests` first & wait.',
    ].join('\n\n'),
  );
});

test('leaves out what a reader never sees: scripts, styles, drawings, navigation, controls, hidden and skipped parts', () => {
  const html = `<nav><a href="#top">01 Overview</a></nav>
    <style>p{}</style><script>alert(1)</script><svg><text>chart</text></svg>
    <p>Shown<span hidden>secret</span><span aria-hidden="true">decor</span></p>
    <div data-text="skip">marquee</div><div style="display:none">gone</div>
    <button>Copy</button><input value="x"><label>Seats <input value="12"></label>`;
  assert.equal(htmlToText(html), 'Shown\n\nSeats');
});

test("an image says what it is only when it has alt text; same-page links keep just their words", () => {
  assert.equal(htmlToText('<p><img src="a.png" alt="Map of the DMV"><img src="b.png" alt=""> <a href="#q3">Q3</a></p>'), '[Map of the DMV] Q3');
});

test("the file starts with the site's title and description", () => {
  const t = siteText({ site: { title: 'Mainstay integration', description: 'How to send a request.' }, body: '<h1>Hi</h1>' });
  assert.equal(t, '# Mainstay integration\n\nHow to send a request.\n\n## Hi\n');
  assert.ok(siteText({ site: { title: 'X', sample: true }, body: '' }).startsWith('# Sample: X'));
});
