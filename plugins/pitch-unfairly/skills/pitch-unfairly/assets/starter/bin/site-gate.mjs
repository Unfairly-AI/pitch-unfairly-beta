// The QA gate on any built folder: every page the crawl reaches from "/", at
// every gate width, every state opened (bin/site/gate.mjs), plus the banned list
// with this brand's rules. A clean run stamps artifacts/gate/gate.json with a
// digest of the exact files; upload refuses a folder without a matching clean stamp.
//
//   npm run site:gate -- <dir>                    serve <dir> and gate it (default dist-site)
//   npm run site:gate -- <dir> --url <base>       gate a site already being served at <base>
//   npm run site:gate -- <dir> --brand <kit.json> the brand whose `rules` add to the banned list (default brand/brand.json)
//   npm run site:gate -- <dir> --widths 390,1280  fewer widths, for a quick look (never stamps clean)
//   npm run site:gate -- <dir> --pages /,/a.html  only these pages (never stamps clean)
//   npm run site:gate -- --verify <dir>           exit 0 only if the stamp is clean and matches <dir>
//
// Output: artifacts/gate/report.txt, gate.json (the stamp, with every finding),
// shots/ (the first screen of each page at each width) and contact-sheet.png.
import puppeteer from 'puppeteer';
import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { GATE_SCREENS, distDigest, gateStamp, runGate, stampProblem, writeGateFiles } from './site/gate.mjs';
import { bannedEntries } from './site/banned.mjs';
import { serveDir } from './serve.mjs';
import { refuseInCodexSandbox } from './browser-guard.mjs';
import { stableLaunch } from './stable-shots.mjs';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };
const valued = new Set(['url', 'brand', 'out', 'widths', 'pages', 'stamp']);
const positional = args.filter((a, i) => !a.startsWith('--') && !valued.has(args[i - 1]?.replace(/^--/, '')));
const dir = positional[0] ?? 'dist-site';
const out = opt('out') ?? 'artifacts/gate';

if (args.includes('--verify')) {
  const stamp = JSON.parse(await readFile(opt('stamp') ?? join(out, 'gate.json'), 'utf8').catch(() => 'null'));
  const problem = stampProblem(stamp, existsSync(dir) ? await distDigest(dir) : null);
  if (problem) { console.error(`✗ ${dir}: ${problem}`); process.exit(1); }
  console.log(`✓ ${dir}: clean gate stamp from ${stamp.at}, ${stamp.counts.pages} pages at ${stamp.widths.join(', ')}px.`);
  process.exit(0);
}

refuseInCodexSandbox('The site gate');
if (!opt('url') && !existsSync(join(dir, 'index.html'))) {
  console.error(`✗ ${dir}/index.html doesn't exist. Build the site first, or pass --url for one already served.`);
  process.exit(2);
}
const kitPath = opt('brand') ?? 'brand/brand.json';
const kit = JSON.parse(await readFile(kitPath, 'utf8').catch(() => 'null'));
const { entries, problems } = bannedEntries(kit);
problems.forEach((p) => console.error(`  ✗ ${p}`));
if (problems.length) process.exit(1);
const widths = opt('widths')?.split(',').map(Number);
const screens = widths ? GATE_SCREENS.filter(([w]) => widths.includes(w)) : GATE_SCREENS;
const pages = opt('pages')?.split(',');

await rm(out, { recursive: true, force: true });
const { mkdir } = await import('node:fs/promises');
await mkdir(join(out, 'shots'), { recursive: true });
const server = opt('url') ? null : await serveDir(dir);
const base = (opt('url') ?? server.url).replace(/\/$/, '');
const browser = await puppeteer.launch(stableLaunch());
let result;
try {
  const started = Date.now();
  result = await runGate(browser, base, { pages, screens, entries, out, workers: 4 });
  const digest = existsSync(dir) ? await distDigest(dir) : null;
  const partial = !!(widths || pages || !digest);
  const stamp = gateStamp({ digest, pages: result.pages, screens, findings: result.findings, entries });
  if (partial) stamp.clean = false; // a partial run never lets a build publish
  await writeGateFiles(out, stamp, result);
  const secs = Math.round((Date.now() - started) / 1000);
  if (result.findings.length) {
    const byCheck = {};
    for (const f of result.findings) byCheck[f.check] = (byCheck[f.check] ?? 0) + 1;
    console.error((await readFile(join(out, 'report.txt'), 'utf8')).trimEnd());
    console.error(`\n${result.findings.length} problem(s) on ${new Set(result.findings.map((f) => f.page)).size} of ${result.pages.length} pages (${Object.entries(byCheck).map(([k, n]) => `${k} ${n}`).join(', ')}), ${secs}s. Report: ${out}/report.txt. Contact sheet: ${result.sheet}`);
    process.exitCode = 1;
  } else {
    console.log(`${partial ? 'Partial run clean (not stamped for publishing)' : 'Gate clean'}: ${result.pages.length} pages at ${screens.map(([w]) => w).join(', ')}px, every state opened, ${entries.filter((e) => e.detect?.dom).length} banned checks, ${secs}s. Contact sheet: ${result.sheet}`);
  }
} finally {
  await browser.close();
  await server?.close();
}
