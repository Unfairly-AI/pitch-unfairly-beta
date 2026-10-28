// Section screenshots are byte-stable (bin/stable-shots.mjs): the reviewer
// carries a verdict forward by the screenshots' sha256, so the same page must
// screenshot to the same bytes on every run. Each run here is its own browser,
// as two runs of site-audit are. Skipped when no browser launches.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serveDir } from '../bin/serve.mjs';
import { settleForShots, stableLaunch } from '../bin/stable-shots.mjs';

let puppeteer = null;
try {
  ({ default: puppeteer } = await import('puppeteer'));
  await (await puppeteer.launch(stableLaunch())).close();
} catch {
  puppeteer = null;
}
const NO_BROWSER = 'no headless browser here (npm run setup:browser)';
const servers = [];
after(() => Promise.all(servers.map((s) => s.close())));

// A section that moves: a marquee, a pulsing card with rounded anti-aliased
// edges, a looping autoplay video, a lazy image below it, and a blinking caret.
const PAGE = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>
  body { margin: 0; font: 16px system-ui, sans-serif; }
  section { padding: 24px; }
  @keyframes slide { from { transform: translateX(0); } to { transform: translateX(-50%); } }
  @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: .4; transform: scale(1.08); } }
  .marquee { overflow: hidden; white-space: nowrap; }
  .marquee span { display: inline-block; animation: slide 3s linear infinite; font-size: 28px; }
  .card { margin: 16px 0; width: 140px; height: 140px; border-radius: 50%; background: radial-gradient(circle at 30% 30%, #0067b1, #e8553a); animation: pulse 1.3s ease-in-out infinite; box-shadow: 0 6px 24px rgba(0,0,0,.35); }
  video { display: block; width: 100%; border-radius: 18px; }
  .tall { height: 1200px; }
</style></head><body>
  <section data-section="motion">
    <div class="marquee"><span>Proof that moves · Proof that moves · Proof that moves · Proof that moves ·</span></div>
    <div class="card"></div>
    <video autoplay muted loop playsinline></video>
    <input value="caret" autofocus>
    <div class="tall"></div>
    <img src="dot.svg" loading="lazy" width="120" height="120" alt="">
  </section>
  <script>
    // A real encoded video, recorded here from a moving canvas (no binary fixture ships).
    window.videoReady = (async () => {
      const c = Object.assign(document.createElement('canvas'), { width: 160, height: 90 });
      const g = c.getContext('2d');
      let t = 0;
      const draw = () => { g.fillStyle = '#fff'; g.fillRect(0, 0, 160, 90); g.fillStyle = '#e8553a'; g.fillRect((t * 7) % 160, 20, 40, 50); t++; };
      const timer = setInterval(draw, 30);
      const rec = new MediaRecorder(c.captureStream(30), { mimeType: 'video/webm' });
      const parts = [];
      rec.ondataavailable = (e) => parts.push(e.data);
      const done = new Promise((r) => (rec.onstop = r));
      rec.start();
      await new Promise((r) => setTimeout(r, 1200));
      rec.stop();
      await done;
      clearInterval(timer);
      const v = document.querySelector('video');
      v.src = URL.createObjectURL(new Blob(parts, { type: 'video/webm' }));
      await new Promise((r) => v.addEventListener('playing', r, { once: true }));
    })();
  </script>
</body></html>`;
const DOT = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><circle cx="60" cy="60" r="52" fill="#0067b1"/></svg>';

async function shot(url, settle) {
  const browser = await puppeteer.launch(stableLaunch());
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.goto(url, { waitUntil: 'networkidle0' });
    await page.evaluate(() => window.videoReady);
    // Let the motion run a different while each time, as two real runs would.
    await new Promise((r) => setTimeout(r, 150 + Math.floor(Math.random() * 600)));
    if (settle) await settleForShots(page);
    const png = await (await page.$('[data-section]')).screenshot();
    return createHash('sha256').update(png).digest('hex');
  } finally {
    await browser.close();
  }
}

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'stable-shots-'));
  await writeFile(join(dir, 'index.html'), PAGE);
  await writeFile(join(dir, 'dot.svg'), DOT);
  const server = await serveDir(dir);
  servers.push(server);
  return `${server.url}/`;
}

test('a section with animation and video screenshots to the same bytes on two runs', { skip: !puppeteer && NO_BROWSER }, async () => {
  const url = await fixture();
  const first = await shot(url, true);
  const second = await shot(url, true);
  assert.equal(second, first);
});

test('the fixture does move: without settling, two runs differ', { skip: !puppeteer && NO_BROWSER }, async () => {
  const url = await fixture();
  const seen = new Set();
  for (let i = 0; i < 3 && seen.size < 2; i++) seen.add(await shot(url, false));
  assert.ok(seen.size > 1, 'the unsettled fixture screenshotted the same every time, so it proves nothing');
});
