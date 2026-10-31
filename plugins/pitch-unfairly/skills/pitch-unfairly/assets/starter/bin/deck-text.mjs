// After `astro build`: write dist/index.txt, the deck as plain text for AI
// agents. The host serves it at <link>/index.txt and puts it in the frame page
// (an assistant handed the link reads only that page's HTML, never the slides
// inside the iframe). Made mechanically from the built slides, the same way
// the host makes text for versions without one: "# <title>", the story's
// Kernel and Audience, then "## N. <slide label>" and each slide's words.
// Speaker notes stay out unless story.md says "Notes: public".
import { readFile, writeFile } from 'node:fs/promises';
import { decodeEntities, pageText } from './site/text.mjs';
import { parseStory } from './story-check.mjs';

/** index.txt for a built page and its story.md (either may be missing pieces). */
export function deckIndexText(html, story = '') {
  const { header } = parseStory(story);
  const title = decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '').trim() || 'Deck';
  const head = ['kernel', 'audience'].filter((k) => header[k]).map((k) => `${k[0].toUpperCase()}${k.slice(1)}: ${header[k]}`);
  return pageText(html, title, { head: [head.join('\n')], notes: /^public$/i.test(header.notes ?? '') });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2] ?? 'dist';
  const html = await readFile(`${dir}/index.html`, 'utf8');
  const text = deckIndexText(html, await readFile('story.md', 'utf8').catch(() => ''));
  if (!text) {
    console.error(`✗ ${dir}/index.html has no slide text to write to index.txt (are the slides drawn only by JavaScript?)`);
    process.exit(1);
  }
  await writeFile(`${dir}/index.txt`, text);
  console.log(`${dir}/index.txt: ${text.split('\n## ').length - 1} slides, ${(text.length / 1024).toFixed(1)} KB`);
}
