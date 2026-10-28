// The copy lock (bin/site/copy-lock.mjs) over a site's drafts and its copy.
//
//   npm run site:copy-lock                       reads site/copy-lock.json
//   npm run site:copy-lock -- --config <file>    another config
//   npm run site:copy-lock -- --draft            placeholders are listed, not failed (never for production)
//
// site/copy-lock.json (paths relative to the config file):
//   { "schema": "copy-lock@1",
//     "sources": "../drafts",                     folder of the client's drafts (.txt, one per page)
//     "copy": "content",                          folder of the copy the build reads (.json or .html)
//     "pages": [{ "source": "Cleanings.txt", "copy": "cleanings.json", "removed": ["verbatim text the client agreed to drop"] }],
//     "notes": ["^BLOG Module\\b"],               regexes for editor lines in the drafts that aren't copy
//     "labels": ["Title Tag", "Meta Description"],    line prefixes that are annotations
//     "skip_keys": [...], "sidebar_keys": ["info"], "label_keys": ["eyebrow"],   for JSON copy (defaults in copy-lock.mjs)
//     "confirmed": ["source sentence with a typo the client confirmed"] }
//
// Writes artifacts/copy-lock/report.txt and to-confirm.md (the source typos kept as written and,
// in a draft, the open placeholders), and exits 1 when the copy and the drafts disagree.
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { DEFAULTS, checkPage, htmlSegments, jsonSegments, lockErrors, sourceTypos } from './site/copy-lock.mjs';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };
const draft = args.includes('--draft');
const configPath = resolve(opt('config') ?? 'site/copy-lock.json');
const out = opt('out') ?? 'artifacts/copy-lock';
if (!existsSync(configPath)) {
  console.error(`✗ No ${configPath}. Write one that maps each draft to the copy built from it (see the comment at the top of bin/site-copy-lock.mjs).`);
  process.exit(2);
}
const config = JSON.parse(await readFile(configPath, 'utf8'));
if (config.schema !== 'copy-lock@1') { console.error('✗ copy-lock.json: "schema" must be "copy-lock@1".'); process.exit(2); }
const cfg = { ...DEFAULTS, ...config, skip_keys: config.skip_keys ?? DEFAULTS.skip_keys };
const at = dirname(configPath);
const sources = resolve(at, config.sources ?? '.');
const copyDir = resolve(at, config.copy ?? '.');
const confirmed = new Set((config.confirmed ?? []).map((s) => s.trim()));
const REMOVED = /^Duplicate paragraph removed:\s*"(.*?)"/;

const pages = [];
for (const p of config.pages ?? []) {
  const source = await readFile(join(sources, p.source), 'utf8');
  const raw = await readFile(join(copyDir, p.copy), 'utf8');
  let segs;
  let removed = [...(p.removed ?? [])];
  if (/\.json$/i.test(p.copy)) {
    const page = JSON.parse(raw);
    segs = jsonSegments(page, cfg);
    for (const n of page.to_confirm ?? []) { const m = REMOVED.exec(String(n)); if (m) removed.push(m[1]); }
  } else segs = htmlSegments(raw);
  pages.push({ ...p, res: checkPage(source, segs, { removed, cfg }) });
}
const lines = [];
const toConfirm = [];
let errors = 0;
for (const p of pages) {
  const errs = lockErrors(p.res, { draft });
  errors += errs.length;
  const typos = sourceTypos(p.res.sentences).filter((t) => !confirmed.has(t.text));
  const c = p.res.counts;
  lines.push(`${errs.length ? 'FAIL' : 'OK  '} ${p.copy}  <- ${p.source}`);
  lines.push(`     source sentences ${c.source}: missing ${p.res.missing.length}, out of order ${p.res.order.length}, changed ${p.res.changed.length} (in a sidebar ${c.sidebar}, repeated in the source ${c.repeated}, removed by agreement ${c.removed}) | copy strings ${c.copy}: not in a source ${p.res.extra.length} | placeholders ${p.res.placeholders.length} | source typos kept ${typos.length}`);
  errs.forEach((e) => lines.push(`     ${e}`));
  for (const t of typos) toConfirm.push(`- **${p.source}**, line ${t.line}: "${t.text}" (${t.why.join('; ')}). Kept as written.`);
  if (draft) for (const ph of p.res.placeholders) toConfirm.push(`- **${p.copy}** ${ph.path}: open question "${ph.text}". Blocks production.`);
}
const total = pages.reduce((n, p) => n + p.res.counts.source, 0);
lines.push('', `${pages.length} pages, ${total} source sentences: ${errors ? `${errors} problem(s)` : 'the copy matches the drafts both ways'}${draft ? ' (draft: placeholders listed, not failed)' : ''}. ${toConfirm.length} item(s) to confirm with the client: ${out}/to-confirm.md`);
await mkdir(out, { recursive: true });
await writeFile(join(out, 'report.txt'), `${lines.join('\n')}\n`);
await writeFile(join(out, 'to-confirm.md'), `# To confirm with the client\n\nThe drafts' wording is kept exactly. These look like typos or open questions; ask once, then add each confirmed line to "confirmed" in copy-lock.json.\n\n${toConfirm.join('\n') || 'Nothing.'}\n`);
console[errors ? 'error' : 'log'](lines.join('\n'));
if (errors) process.exitCode = 1;
