// ACCEPTANCE: a sliced headline drawn with drawSlices() prints with no hairline seam where its slices
// meet, at the fractional device pixel ratios print renders use. Left to clipped boxes it seams.
// Skipped when no browser launches.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serveDir } from '../bin/serve.mjs';
import { decodePng, hairlineRows } from '../bin/collateral/seams.mjs';

let puppeteer = null;
try {
  ({ default: puppeteer } = await import('puppeteer'));
  await (await puppeteer.launch({ headless: true })).close();
} catch {
  puppeteer = null;
}
const NO_BROWSER = 'no headless browser here (npm run setup:browser)';
const servers = [];
after(() => Promise.all(servers.map((s) => s.close())));

// The stack markup the guide documents: .row windows of --h em, each showing the word at --o em.
const ROWS = [[0.2, -0.353], [0.27, -0.353], [0.34, -0.353], [0.42, -0.353], [1.1, -0.02], [0.42, -0.45], [0.34, -0.53], [0.27, -0.6], [0.2, -0.67]];
const page = (draw) => `<!doctype html><html><head><style>
  html, body { margin: 0; background: transparent; }
  .stack { position: relative; margin: 20px; color: #fff; font: 700 84px/1 Arial, Helvetica, sans-serif; letter-spacing: -0.03em; }
  .stack .row { height: calc(var(--h) * 1em); overflow: hidden; position: relative; }
  .stack .row > span { position: absolute; left: 0; right: 0; text-align: center; line-height: 1; top: calc(var(--o) * 1em); white-space: nowrap; }
</style></head><body>
<div class="stack">${ROWS.map(([h, o]) => `<div class="row" style="--h:${h};--o:${o}"><span>transforming</span></div>`).join('')}</div>
<script type="module">
  ${draw ? "import { drawSlices } from './slices.js'; await drawSlices(6.25);" : ''}
  await document.fonts.ready; document.body.dataset.ready = '1';
</script></body></html>`;

async function seams(draw) {
  const dir = await mkdtemp(join(tmpdir(), 'slices-'));
  await cp(new URL('../bin/collateral/slices.js', import.meta.url), join(dir, 'slices.js'));
  await writeFile(join(dir, 'index.html'), page(draw));
  const server = await serveDir(dir);
  servers.push(server);
  const browser = await puppeteer.launch({ headless: true });
  try {
    const tab = await browser.newPage();
    await tab.setViewport({ width: 576, height: 260, deviceScaleFactor: 6.25 });
    await tab.goto(`${server.url}/index.html`, { waitUntil: 'load' });
    await tab.waitForSelector('body[data-ready="1"]');
    const png = await tab.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: 576, height: 260 } });
    return hairlineRows(decodePng(Buffer.from(png)));
  } finally {
    await browser.close();
  }
}

test('ACCEPTANCE: drawSlices prints a sliced headline with 0 hairline seam rows; clipped boxes seam', { skip: !puppeteer && NO_BROWSER }, async () => {
  assert.ok((await seams(false)).length > 0, 'the clipped-box stack should show the seam this guards against');
  assert.deepEqual(await seams(true), []);
});
