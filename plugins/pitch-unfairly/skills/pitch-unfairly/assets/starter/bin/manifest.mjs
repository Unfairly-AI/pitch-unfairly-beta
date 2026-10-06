// Print the file list a host needs to publish the built deck:
// [{ path, size, sha256 }] for every file under dist/.
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { auditBlocker } from './audit-stamp.mjs';

const dir = process.argv[2] ?? 'dist';

const blocker = await auditBlocker();
if (blocker) {
  console.error(`✗ Not publishing: ${blocker}`);
  process.exit(1);
}

async function* walk(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const full = join(folder, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile() && !entry.name.startsWith('.')) yield full;

  }
}

const files = [];
for await (const file of walk(dir)) {
  // The brand board is a review page, not part of the deck.
  if (relative(dir, file).startsWith('brand-board')) continue;
  const bytes = await readFile(file);
  files.push({
    path: relative(dir, file).split(sep).join('/'),
    size: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}
files.sort((a, b) => a.path.localeCompare(b.path));
console.log(JSON.stringify(files, null, 2));
