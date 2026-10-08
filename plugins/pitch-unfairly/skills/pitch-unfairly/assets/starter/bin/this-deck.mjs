// Make sure a URL serves this project's deck before checking it. Another dev
// server on the default port (a second Astro project, say) would otherwise be
// audited in its place, and Astro quietly moves this one to the next port.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function projectSlideIds(dir = 'src/slides') {
  const ids = new Set();
  for (const name of await readdir(dir)) {
    if (!name.endsWith('.astro')) continue;
    for (const m of (await readFile(join(dir, name), 'utf8')).matchAll(/<Slide\b[^>]*\bid=["']([^"']+)["']/g)) ids.add(m[1]);
  }
  return ids;
}

/**
 * Whether a served page is this project's deck: most of the slides it shows
 * are slides this project defines. Measured against what the page shows, not
 * every file in src/slides, because a deck often leaves the starter's example
 * slides in place and imports only its own (six real slides next to seven
 * unused ones used to read as "another dev server" and block every check).
 * Another project on the port still fails: its slides aren't ours.
 */
export function deckMatches(ours, theirs) {
  if (!ours.size) return true;
  if (!theirs.size) return false;
  const shared = [...theirs].filter((id) => ours.has(id)).length;
  return shared >= Math.ceil(theirs.size / 2);
}

export async function assertThisDeck(base) {
  const ours = await projectSlideIds();
  let html;
  try {
    html = await (await fetch(base)).text();
  } catch {
    throw new Error(`Nothing is serving ${base}. Start npm run dev and pass the URL it prints.`);
  }
  const theirs = new Set([...html.matchAll(/id="slide-([^"]+)"/g)].map((m) => m[1]));
  if (!deckMatches(ours, theirs)) {
    const seen = [...theirs].slice(0, 4).join(', ') || 'no slides';
    throw new Error(
      `${base} isn't this deck (it shows ${seen}; this project has ${[...ours].slice(0, 4).join(', ')}). ` +
        'Another dev server is probably on that port. Pass the URL npm run dev printed, e.g. npm run audit -- http://localhost:4322',
    );
  }
}
