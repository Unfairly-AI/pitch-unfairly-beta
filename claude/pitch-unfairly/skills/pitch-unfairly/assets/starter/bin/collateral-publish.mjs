// Publish hosted piece pages without running into the host's upload limit (30 new versions per
// person per rolling hour). Works from artifacts/collateral/pages/pages.json (collateral:pages)
// and a ledger of uploads started, artifacts/collateral/pages/ledger.json.
//
//   npm run -s collateral:publish -- plan [--used N]
//       what's left to publish, what fits this hour, and when the next slot opens. --used counts
//       versions you published elsewhere this hour (other projects, a site), which share the limit.
//   npm run -s collateral:publish -- start <slug> --workspace <ws> [--used N] > artifacts/start.json
//       the deck_upload_start arguments for one link. Refuses when the hour is full.
//   npm run -s collateral:publish -- record <slug> artifacts/uploads.json
//       after deck_upload_start replied (saved as uploads.json): logs the start against the limit,
//       then prints the upload command. Then deck_publish.
//
// A reply that is plain text instead of JSON is the host refusing; record says so and logs nothing.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { batches, budget, pending, VERSIONS_PER_HOUR } from './collateral/pages.mjs';

const [cmd, ...rest] = process.argv.slice(2);
const opt = (k, d) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : d; };
const DIR = opt('--pages', 'artifacts/collateral/pages');
const LEDGER = join(DIR, 'ledger.json');
const fail = (m) => { console.error(`✗ ${m}`); process.exit(1); };

const pages = JSON.parse(await readFile(join(DIR, 'pages.json'), 'utf8').catch(() => fail(`No ${DIR}/pages.json: run npm run collateral:pages first.`)));
const ledger = JSON.parse(await readFile(LEDGER, 'utf8').catch(() => '[]'));
const used = Number(opt('--used', 0));
const now = Date.now();
// Starts made elsewhere this hour count against the same limit; treat them as just made.
const counted = [...ledger, ...Array.from({ length: used }, () => ({ at: new Date(now).toISOString() }))];
const { free, next_at } = budget(counted, now);
const todo = pending(pages, ledger);

if (cmd === 'plan') {
  if (!todo.length) { console.log('Every link is published at its current build.'); process.exit(0); }
  const plan = batches(todo, free);
  console.log(`${todo.length} link${todo.length === 1 ? '' : 's'} to publish; ${free} of ${VERSIONS_PER_HOUR} uploads free this hour${next_at ? `, next slot ${next_at}` : ''}.`);
  plan.forEach((b, i) => console.log(`\n${i === 0 && free > 0 ? 'Now' : `Hour +${free > 0 ? i : i + 1}`}:\n${b.map((l) => `  ${l.slug}  (${l.type})`).join('\n')}`));
} else if (cmd === 'start') {
  const slug = rest[0];
  const link = pages.find((p) => p.slug === slug) ?? fail(`No link ${slug} in pages.json.`);
  if (free < 1) fail(`The host's limit (${VERSIONS_PER_HOUR} versions an hour) is used up; the next slot opens ${next_at}.`);
  const ws = opt('--workspace', null) ?? fail('Pass --workspace <org slug>: collateral publishes into the client\'s workspace, never a personal default.');
  console.log(JSON.stringify({ type: link.type, title: link.title, slug: link.slug, workspace: ws, files: link.files }, null, 2));
} else if (cmd === 'record') {
  const [slug, file] = rest;
  const link = pages.find((p) => p.slug === slug) ?? fail(`No link ${slug} in pages.json.`);
  const raw = await readFile(file, 'utf8');
  let reply;
  try { reply = JSON.parse(raw); } catch { fail(`deck_upload_start refused ${slug}; its message:\n${raw.trim().slice(0, 600)}`); }
  ledger.push({ slug, digest: link.digest, at: new Date().toISOString(), version: reply.version ?? null, url: reply.url ?? null });
  await writeFile(LEDGER, `${JSON.stringify(ledger, null, 1)}\n`);
  console.log(`Logged ${slug}. Upload with: node bin/upload.mjs ${file} ${link.dir}\nthen deck_publish.`);
} else {
  console.error('Usage: collateral:publish -- plan | start <slug> --workspace <ws> | record <slug> <uploads.json>');
  process.exit(2);
}
