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

export async function assertThisDeck(base) {
  const ours = await projectSlideIds();
  let html;
  try {
    html = await (await fetch(base)).text();
  } catch {
    throw new Error(`Nothing is serving ${base}. Start npm run dev and pass the URL it prints.`);
  }
  const theirs = new Set([...html.matchAll(/id="slide-([^"]+)"/g)].map((m) => m[1]));
  const shared = [...ours].filter((id) => theirs.has(id)).length;
  if (ours.size && shared < Math.ceil(ours.size / 2)) {
    const seen = [...theirs].slice(0, 4).join(', ') || 'no slides';
    throw new Error(
      `${base} isn't this deck (it shows ${seen}; this project has ${[...ours].slice(0, 4).join(', ')}). ` +
        'Another dev server is probably on that port. Pass the URL npm run dev printed, e.g. npm run audit -- http://localhost:4322',
    );
  }
}
