// The audit is the gate between a deck and a link. A clean audit writes a
// stamp with a fingerprint of everything that renders; publishing (the
// manifest) refuses when the deck has changed since, so an unaudited deck
// can't ship.
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const STAMP = 'artifacts/audit-pass.json';
// Everything that changes what the deck looks like. brand/capture/ is research.
const SOURCES = ['src', 'brand', 'public', 'astro.config.mjs'];

async function* walk(path) {
  let entries;
  try {
    entries = await readdir(path, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOTDIR') yield path;
    return;
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = join(path, entry.name);
    if (entry.name.startsWith('.') || full === join('brand', 'capture')) continue;
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

export async function fingerprint() {
  const hash = createHash('sha256');
  for (const source of SOURCES) {
    for await (const file of walk(source)) {
      hash.update(file).update('\0').update(await readFile(file)).update('\0');
    }
  }
  return hash.digest('hex');
}

export async function stampPass(slides) {
  await mkdir('artifacts', { recursive: true });
  await writeFile(STAMP, JSON.stringify({ fingerprint: await fingerprint(), slides, at: new Date().toISOString() }, null, 2));
}

export const clearStamp = () => rm(STAMP, { force: true });

// Why the deck can't ship yet, or null when the last clean audit still holds.
export async function auditBlocker() {
  let stamp;
  try {
    stamp = JSON.parse(await readFile(STAMP, 'utf8'));
  } catch {
    return 'This deck has no clean audit. Run `npm run audit` and fix what it reports until it says "All modes clean".';
  }
  if (stamp.fingerprint !== await fingerprint()) {
    return 'The deck changed after its last clean audit. Run `npm run audit` again until it says "All modes clean".';
  }
  return null;
}
