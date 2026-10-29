// A sent deck's controls: Present (fullscreen) instead of a Notes button, so a buyer
// reading the link never opens the seller's speaker notes. N still shows them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const deck = await readFile(new URL('../src/layouts/Deck.astro', import.meta.url), 'utf8');
const nav = deck.match(/<nav class="deck-nav"[\s\S]*?<\/nav>/)[0];

test('the deck controls carry a Present button and no Notes button', () => {
  assert.match(nav, /<button type="button" data-go="present"[^>]*>Present<\/button>/);
  assert.doesNotMatch(nav, /data-go="notes"|>Notes</);
  assert.match(nav, /href="deck\.pdf" download>PDF</);
});

test('Present and F both ask for fullscreen, through the host frame when framed', () => {
  assert.match(deck, /querySelector\('\[data-go="present"\]'\)\?\.addEventListener\('click', present\)/);
  assert.match(deck, /key === 'f'\) present\(\)/);
  assert.match(deck, /if \(framed\) toFrame\(\{ type: 'deck:fullscreen' \}\)/);
});

test('speaker notes still open with the N key', () => {
  assert.match(deck, /key === 'n'\) toggleNotes\(\)/);
});
