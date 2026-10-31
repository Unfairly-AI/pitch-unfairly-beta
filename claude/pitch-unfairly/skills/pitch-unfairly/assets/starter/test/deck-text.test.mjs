// A deck as plain text for AI agents: dist/index.txt, written at build from
// the built slides, the same text the decks host makes for a version without one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pageText } from '../bin/site/text.mjs';
import { deckIndexText } from '../bin/deck-text.mjs';

const slide = (id, label, inner, notes = '') =>
  `<div class="deck-frame tone-paper"><section id="slide-${id}" class="slide tone-paper" aria-label="${label}"${notes ? ` data-notes="${notes}"` : ''}>${inner}<span class="slide-num" aria-hidden="true"></span></section></div>`;

const deck = `<!doctype html><html><head><title>Acme &amp; co deck</title><script>var x = 1;</script></head><body>
  <main class="stage" id="stage">
    ${slide('cover', 'Cover', '<h1 class="display">Acme books freight in minutes.</h1>', 'Open warm. Source: example.')}
    ${slide('steps', 'Seven steps', `<h2>Every booking takes seven steps.</h2><ul><li>Rate requests</li><li>Carrier calls</li></ul>
      <p>Shown<span hidden>secret</span><span style="visibility:hidden">ghost</span>&#8203;</p><div data-text="skip">marquee</div>
      <img src="a.png" alt="A booked lane"><svg><text>chart</text></svg>`)}
  </main>
  <nav class="deck-nav" aria-label="Deck controls"><button>Present</button><a href="deck.pdf">PDF</a></nav>
</body></html>`;

test('ACCEPTANCE: each slide reads as "## N. <label>" and its words, in order, with the deck title on top', () => {
  assert.equal(
    pageText(deck, 'Acme & co deck'),
    [
      '# Acme & co deck',
      '## 1. Cover',
      '### Acme books freight in minutes.',
      '## 2. Seven steps',
      '#### Every booking takes seven steps.',
      '- Rate requests\n- Carrier calls',
      'Shown',
      '[A booked lane]',
    ].join('\n\n') + '\n',
  );
});

test("speaker notes, controls, drawings and anything hidden from readers stay out", () => {
  const text = pageText(deck, 'T');
  for (const word of ['Open warm', 'secret', 'ghost', 'marquee', 'chart', 'Present', 'PDF', 'var x', '​']) assert.ok(!text.includes(word), word);
});

test('a page without slides reads as its page, and a deck drawn only by JavaScript has no text', () => {
  assert.equal(pageText('<main><h2>Hello</h2><p>World</p></main>', 'Page'), '# Page\n\n### Hello\n\nWorld\n');
  assert.equal(pageText(`<main>${slide('a', 'A', '')}</main><script>draw()</script>`, 'Empty'), null);
});

test('ACCEPTANCE: index.txt opens with the title, then the story\'s Kernel and Audience', () => {
  const story = '# Acme deck\n\nKernel: Shippers lose a day to every booking.\nAudience: A logistics lead, first call.\nAngle: x\n\n## 01 cover\n- Headline: Acme books freight in minutes.\n';
  const text = deckIndexText(deck, story);
  assert.ok(text.startsWith('# Acme & co deck\n\nKernel: Shippers lose a day to every booking.\nAudience: A logistics lead, first call.\n\n## 1. Cover\n'), text);
  assert.ok(!text.includes('Angle'));
  assert.ok(!text.includes('Open warm'));
});

test('speaker notes join the text only when story.md says "Notes: public"', () => {
  const text = deckIndexText(deck, 'Kernel: k\nNotes: public\n');
  assert.match(text, /## 1\. Cover\n\n### Acme books freight in minutes\.\n\nSpeaker notes: Open warm\. Source: example\.\n\n## 2\./);
  assert.ok(!deckIndexText(deck, 'Kernel: k\nNotes: private\n').includes('Speaker notes'));
});

test('a story with no Kernel or Audience yet gives just the title and slides', () => {
  const text = deckIndexText(deck, '# Untitled deck\n\nKernel:\nAudience:\n');
  assert.ok(text.startsWith('# Acme & co deck\n\n## 1. Cover\n'), text);
});

test('npm run build writes index.txt after astro build', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(pkg.scripts.build, /astro build && node bin\/deck-text\.mjs$/);
});
