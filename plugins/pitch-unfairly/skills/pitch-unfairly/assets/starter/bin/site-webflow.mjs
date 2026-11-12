// Put a built site into a customer's Webflow site as native classes, variables and interactions, through
// the Webflow MCP connector. The engine plans and checks; the agent makes each Webflow call.
//
//   npm run -s site:webflow -- plan --site <site id> --collection "<Brand> tokens" [--prefix uf-]
//        [--page <page id> | --page-slug <slug> --page-title "<title>"] [--blocks "<selector>"] [--class-prefix uf-] [--no-fonts]
//       compile dist-site/index.html and start a run in artifacts/webflow/
//   npm run -s site:webflow -- next
//       the next Webflow tool call as JSON ({step, tool, args}). Add session_id, agent_id and context,
//       make the call, and save the tool's whole output to a file.
//   npm run -s site:webflow -- record <step> <reply-file>
//       read that reply, keep the ids it returned, and do any upload it set up. Then next again.
//   npm run -s site:webflow -- status
//   npm run -s site:webflow -- verify [--url <published page>] [--widths 1440,767,390] [--block-fonts]
//       compare the published Webflow page with dist-site, element by element. Fails on a difference
//       outside the breakpoint bands the plan reported.
//
// It only ever publishes to the site's webflow.io address; the customer publishes production.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { compilePage, previewHtml } from './webflow/compile.mjs';
import { webflowBaseCss } from './webflow/defaults.mjs';
import { pathToFileURL } from 'node:url';
import { emptyLedger, nextStep, recordStep } from './webflow/steps.mjs';
import { snapBands, verifyPage } from './webflow/verify.mjs';

const [cmd, ...rest] = process.argv.slice(2);
const opt = (k, d) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : d; };
const has = (k) => rest.includes(k);
const DIR = resolve(opt('--dir', 'artifacts/webflow'));
const DIST = resolve(opt('--dist', 'dist-site'));
const RUN = join(DIR, 'run.json');
const LEDGER = join(DIR, 'ledger.json');
const fail = (m) => { console.error(`✗ ${m}`); process.exit(1); };
const md5 = (buf) => createHash('md5').update(buf).digest('hex');
const save = (file, v) => writeFile(file, `${JSON.stringify(v, null, 1)}\n`);

async function localFile(src, into) {
  if (/^https?:/.test(src)) {
    let res = null;
    for (let i = 0; i < 2 && !res?.ok; i++) res = await fetch(src, { signal: AbortSignal.timeout(20000) }).catch(() => null);
    if (!res?.ok) fail(`Could not fetch ${src} (${res ? res.status : 'no connection'}). Download it into ${DIST} and point the page at the local copy.`);
    const file = join(into, basename(new URL(src).pathname));
    await writeFile(file, Buffer.from(await res.arrayBuffer()));
    return file;
  }
  const file = join(DIST, src.replace(/^\//, ''));
  if (!existsSync(file)) fail(`${src} is referenced by the page but missing from ${DIST}.`);
  return file;
}

async function plan() {
  const site = opt('--site') ?? fail('Pass --site <Webflow site id> (data_sites_tool > list_sites).');
  const collection = opt('--collection') ?? fail('Pass --collection "<Brand> tokens": the variable collection the brand tokens go in.');
  const pageId = opt('--page');
  const slug = opt('--page-slug');
  if (!pageId && !slug) fail('Pass --page <id> for an existing page, or --page-slug <slug> --page-title "<title>" for a new one.');
  const html = await readFile(join(DIST, 'index.html'), 'utf8').catch(() => fail(`No ${DIST}/index.html: run npm run site:build first.`));
  const started = Date.now();
  const classPrefix = opt('--class-prefix', 'uf-');
  const compiled = compilePage(html, { blocks: opt('--blocks'), prefix: classPrefix });
  await mkdir(join(DIR, 'files'), { recursive: true });

  const assets = [];
  for (const src of compiled.assets) {
    const path = await localFile(src, join(DIR, 'files'));
    assets.push({ src, path, file_name: basename(path).slice(-99), md5: md5(await readFile(path)) });
  }
  const fonts = [];
  if (!has('--no-fonts')) {
    // One file per family and style: the latin subset where the source splits by script.
    const groups = new Map();
    // Only families the compiled page actually names: a toolbox stylesheet declares many it never uses.
    const used = `${compiled.css}\n${compiled.variables.map((v) => v.value).join('\n')}`;
    for (const f of compiled.fonts) {
      if (f.family === 'webflow-icons' || !used.includes(f.family)) continue;
      const key = `${f.family}|${f.style}`;
      const src = f.src.find((s) => /latin/.test(s) && !/-ext/.test(s)) ?? f.src[0];
      if (!groups.has(key) || (/latin/.test(src) && !/-ext/.test(src))) groups.set(key, { ...f, src });
    }
    for (const f of groups.values()) {
      if (!f.src) continue;
      const path = await localFile(f.src, join(DIR, 'files'));
      const range = String(f.weight).split(/\s+/).map(Number);
      fonts.push({ family: f.family, italic: f.style === 'italic', weight: range.length > 1 ? 400 : range[0] || 400, axis: range.length > 1 ? range : null, path, file_name: basename(path), md5: md5(await readFile(path)) });
    }
  }
  const run = {
    site_id: site,
    collection,
    prefix: opt('--prefix', 'uf-'),
    classPrefix,
    page: pageId ? { id: pageId } : { title: opt('--page-title', slug), slug, path: `/${slug}` },
    compiled: { blocks: compiled.blocks, variables: compiled.variables },
    assets,
    fonts,
    report: compiled.report,
    created_at: new Date().toISOString(),
  };
  await save(RUN, run);
  await save(LEDGER, emptyLedger());
  // What Webflow should render: verify holds the published page to this at every width.
  await writeFile(join(DIR, 'preview.html'), previewHtml(compiled, webflowBaseCss(), pathToFileURL(`${DIST}/`).href));
  const r = compiled.report;
  console.log(`Planned ${r.blocks} section(s), ${r.classes} classes, ${compiled.variables.length} tokens, ${assets.length} image(s), ${fonts.length} font file(s) in ${Date.now() - started} ms.`);
  const bands = snapBands(r);
  if (bands.length) console.log(`Breakpoint bands where the page can differ from the source (Webflow has fixed breakpoints): ${bands.map(([a, b]) => `${a}–${b}px`).join(', ')}`);
  if (has('--no-fonts')) console.log('Fonts: not uploaded (--no-fonts). The site must already have these families installed.');
  console.log('Next: npm run -s site:webflow -- next');
}

const load = async () => [
  JSON.parse(await readFile(RUN, 'utf8').catch(() => fail('No run: npm run -s site:webflow -- plan first.'))),
  JSON.parse(await readFile(LEDGER, 'utf8')),
];

async function upload({ url, fields, file }) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null) form.append(k, String(v));
  form.append('file', new Blob([await readFile(file)]), basename(file));
  const res = await fetch(url, { method: 'POST', body: form });
  if (res.status !== 201 && res.status !== 204) fail(`Upload of ${basename(file)} failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
}

if (cmd === 'plan') await plan();
else if (cmd === 'next') {
  const [run, ledger] = await load();
  const step = nextStep(run, ledger);
  if (!step) {
    const url = `https://${ledger.captures.short_name}.webflow.io${ledger.captures.page_path ?? ''}`;
    console.log(`Done. Published to ${url}\nCheck it: npm run -s site:webflow -- verify`);
  } else console.log(JSON.stringify({ ...step, add: ['session_id', 'agent_id', 'context'] }, null, 1));
} else if (cmd === 'record') {
  const [step, file] = rest;
  if (!step || !file) fail('Usage: record <step> <reply-file>');
  const [run, ledger] = await load();
  const expected = nextStep(run, ledger)?.step;
  if (expected !== step) fail(`The next step is ${expected ?? '(none: the run is done)'}, not ${step}. Record replies in order.`);
  let uploads;
  try {
    uploads = recordStep(run, ledger, step, await readFile(file, 'utf8'));
  } catch (e) {
    await save(LEDGER, ledger);
    fail(e.message);
  }
  for (const u of uploads) await upload(u);
  await save(LEDGER, ledger);
  const nxt = nextStep(run, ledger);
  console.log(`✓ ${step}${uploads.length ? ` (uploaded ${uploads.map((u) => basename(u.file)).join(', ')})` : ''}. ${nxt ? `Next: ${nxt.step}` : 'All steps done: npm run -s site:webflow -- verify'}`);
  for (const w of ledger.warnings.splice(0)) console.log(`  ! ${w}`);
  await save(LEDGER, ledger);
} else if (cmd === 'status') {
  const [run, ledger] = await load();
  const nxt = nextStep(run, ledger);
  console.log(`Site ${run.site_id}, collection "${run.collection}", prefix ${run.prefix}`);
  console.log(`Done: ${ledger.done.join(', ') || 'nothing yet'}`);
  console.log(nxt ? `Next: ${nxt.step}: ${nxt.note}` : 'All steps done.');
} else if (cmd === 'verify') {
  const [run, ledger] = await load();
  const url = opt('--url') ?? (ledger.captures.short_name ? `https://${ledger.captures.short_name}.webflow.io${ledger.captures.page_path ?? ''}` : fail('Pass --url <published page>.'));
  const widths = opt('--widths', '1440,1000,767,390').split(',').map(Number);
  const ok = await verifyPage({ dist: DIST, url, widths, report: run.report, blocks: opt('--blocks'), root: opt('--root'), blockFonts: has('--block-fonts'), out: DIR });
  process.exit(ok ? 0 : 1);
} else {
  console.error('Usage: site:webflow -- plan | next | record <step> <reply> | status | verify');
  process.exit(2);
}
