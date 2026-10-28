// Check published piece pages the way a person meets them: on the live link, at desktop and phone
// width, every image loaded, no sideways scroll, and every download button saving the right file.
//
//   node bin/collateral-live.mjs <url> [<url> …]        (the links deck_publish returned)
//
// When artifacts/collateral/pages/pages.json is here, each page is also held to its build: the
// heading is the link's title, and each download is the file it was built with, byte for byte in size.
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

const urls = process.argv.slice(2).filter((a) => /^https?:\/\//.test(a));
if (!urls.length) { console.error('Usage: node bin/collateral-live.mjs <url> [<url> …]'); process.exit(2); }
const pages = JSON.parse(await readFile('artifacts/collateral/pages/pages.json', 'utf8').catch(() => '[]'));
const built = (url) => {
  const last = new URL(url).pathname.split('/').filter(Boolean).pop() ?? '';
  return pages.filter((p) => last.startsWith(`${p.slug}-`) || last === p.slug).sort((a, b) => b.slug.length - a.slug.length)[0] ?? null;
};
// A normal browser's user agent: headless markers are filtered from analytics and can change what the host serves.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

const { default: puppeteer } = await import('puppeteer');
const browser = await puppeteer.launch({ headless: true });
const dir = await mkdtemp(join(tmpdir(), 'collateral-live-'));
const cdp = await browser.target().createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: dir, eventsEnabled: true });
const names = new Map();
const done = new Map();
cdp.on('Browser.downloadWillBegin', (e) => names.set(e.guid, e.suggestedFilename));
cdp.on('Browser.downloadProgress', (e) => { if (e.state !== 'inProgress') done.set(e.guid, e); });

/** The frame holding the piece page: the host wraps it in a badged frame. */
async function contentFrame(page) {
  for (let i = 0; i < 40; i++) {
    for (const f of [page.mainFrame(), ...page.frames()]) {
      if (await f.$('a.dl').catch(() => null)) return f;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

let failed = 0;
try {
  for (const url of urls) {
    const want = built(url);
    const problems = [];
    const page = await browser.newPage();
    await page.setUserAgent(UA);
    for (const width of [1280, 390]) {
      await page.setViewport({ width, height: width > 500 ? 1000 : 844 });
      const res = await page.goto(url, { waitUntil: 'networkidle2', timeout: 60_000 });
      if (!res || res.status() >= 400) { problems.push(`${width}px: HTTP ${res?.status()}`); continue; }
      const f = await contentFrame(page);
      if (!f) { problems.push(`${width}px: no piece page (no download buttons) on the link`); continue; }
      const s = await f.evaluate(async () => {
        await Promise.all([...document.images].map((i) => i.decode().catch(() => null)));
        return {
          h1: document.querySelector('h1')?.textContent.trim() ?? '',
          broken: [...document.images].filter((i) => !i.naturalWidth).map((i) => i.getAttribute('src')),
          sideways: document.documentElement.scrollWidth > window.innerWidth + 1,
          dls: document.querySelectorAll('a.dl').length,
        };
      });
      if (s.broken.length) problems.push(`${width}px: images that didn't load: ${s.broken.join(', ')}`);
      if (s.sideways) problems.push(`${width}px: the page scrolls sideways`);
      if (want && s.h1 !== want.title.split(' · ')[0]) problems.push(`heading "${s.h1}" isn't the link's title "${want.title.split(' · ')[0]}"`);
      if (width !== 1280) continue;
      // Click every download once, at desktop width.
      for (let i = 0; i < s.dls; i++) {
        const before = new Set(names.keys());
        await f.evaluate((n) => document.querySelectorAll('a.dl')[n].click(), i);
        let guid = null;
        for (let t = 0; t < 240 && !(guid && done.has(guid)); t++) {
          guid = [...names.keys()].find((g) => !before.has(g)) ?? null;
          await new Promise((r) => setTimeout(r, 250));
        }
        const e = guid && done.get(guid);
        if (!e || e.state !== 'completed') { problems.push(`download ${i + 1} didn't save (it opened in the frame, or failed)`); continue; }
        const name = names.get(guid);
        const file = want?.files.find((x) => basename(x.path) === name);
        if (want && !file) problems.push(`download ${i + 1} saved "${name}", which this build doesn't have`);
        else if (file && file.size !== e.receivedBytes) problems.push(`download ${name} is ${e.receivedBytes} bytes; the build's is ${file.size}`);
      }
      console.log(`  ${url}: "${s.h1}", ${s.dls} download${s.dls === 1 ? '' : 's'}`);
    }
    await page.close();
    if (problems.length) failed++;
    console.log(`${problems.length ? '✗' : '✓'} ${url}${want ? '' : ' (no build to compare with)'}${problems.map((p) => `\n    - ${p}`).join('')}`);
  }
} finally {
  await browser.close();
  await rm(dir, { recursive: true, force: true });
}
console.log(`\n${urls.length - failed}/${urls.length} live pages pass.`);
process.exit(failed ? 1 : 0);
