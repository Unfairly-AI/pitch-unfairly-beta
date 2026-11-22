// The slide toolbox: the catalog and the layouts match one to one, every
// layout reads only brand tokens, the gallery builds every layout from the
// worked example, and wireframe mode replaces every brand token.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditGallery, buildDeckGallery, loadToolbox, TOOLBOX, withPhotos } from '../bin/deck-gallery.mjs';

const STARTER = fileURLToPath(new URL('..', import.meta.url));
const LAYOUTS = join(TOOLBOX, 'layouts');
const files = (await readdir(LAYOUTS)).filter((f) => f.endsWith('.astro'));
const { catalog, example } = await loadToolbox();
const source = Object.fromEntries(await Promise.all(files.map(async (f) => [f.replace(/\.astro$/, ''), await readFile(join(LAYOUTS, f), 'utf8')])));

/** A layout's own props: the names in `interface Props extends SlideBase { ... }`. */
const propsOf = (src) => {
  const body = /interface Props extends SlideBase \{([\s\S]*?)\n\}/.exec(src)?.[1] ?? '';
  return [...body.matchAll(/^\s*(\w+)\??:/gm)].map((m) => m[1]);
};

test('ACCEPTANCE: every catalog entry has its layout file, and every layout file has its entry', () => {
  const names = catalog.layouts.map((l) => l.name);
  assert.deepEqual([...names].sort(), files.map((f) => f.replace(/\.astro$/, '')).sort());
  assert.equal(new Set(names).size, names.length, 'no layout is cataloged twice');
});

test('every catalog entry is complete, named <type>-<variant>, and lists exactly the props its layout takes', () => {
  for (const l of catalog.layouts) {
    assert.equal(l.name, `${l.type}-${l.variant}`, `${l.name}: name is <type>-<variant>`);
    for (const k of ['job', 'use_when', 'avoid_when', 'default_tone']) assert.ok(l[k], `${l.name}: ${k}`);
    assert.ok(l.references?.length >= 1 && l.references.length <= 3, `${l.name}: one to three references`);
    for (const r of l.references) assert.ok(['arcade', 'pu-layouts'].includes(r.source) && r.path && r.why, `${l.name}: reference ${JSON.stringify(r)}`);
    assert.deepEqual(Object.keys(l.props).sort(), propsOf(source[l.name]).sort(), `${l.name}: catalog props match the layout's Props`);
    assert.ok(example.slides[l.name], `${l.name}: example.json has its props`);
    const built = catalog.planned.find((p) => p.type === l.type);
    assert.ok(!built?.variants.includes(l.variant), `${l.name}: a built variant is no longer planned`);
  }
});

// A raw color is a hex, rgb(), hsl(), oklch() and the like, or a named color;
// a raw font is any font-family or font shorthand that isn't a --font-* token.
const NAMED = /(?<![\w-])(white|black|red|green|blue|gray|grey|silver|orange|yellow|purple|pink|navy|teal)(?![\w-])/i;
function rawStyle(src) {
  const problems = [];
  const styles = [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
  const inline = [...src.matchAll(/\sstyle=(?:"([^"]*)"|\{`([^`]*)`\})/g)].map((m) => m[1] ?? m[2]);
  for (const css of [...styles, ...inline]) {
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const line of bare.split(/[;{}]/)) {
      if (/#[0-9a-f]{3,8}\b/i.test(line)) problems.push(`hex color: ${line.trim()}`);
      if (/\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/i.test(line)) problems.push(`color function: ${line.trim()}`);
      const decl = /^\s*([\w-]+)\s*:\s*([\s\S]+?)\s*$/.exec(line);
      if (!decl) continue;
      const [, prop, value] = decl;
      if (/^(color|background|background-color|border|border-\w+|outline|fill|stroke|box-shadow|text-shadow)$/.test(prop) && NAMED.test(value)) problems.push(`named color: ${line.trim()}`);
      if (prop === 'font-family' && !/^var\(--font-(display|body|mono)\)$/.test(value.trim())) problems.push(`raw font: ${line.trim()}`);
      if (prop === 'font' && !/var\(--font-(display|body|mono)\)/.test(value)) problems.push(`raw font: ${line.trim()}`);
    }
  }
  return problems;
}

test('ACCEPTANCE: no layout uses a raw color or font', () => {
  for (const [name, src] of Object.entries(source)) assert.deepEqual(rawStyle(src), [], `${name} reads only brand tokens`);
});

test('the raw-style check catches what it should', () => {
  const bad = '<style>.a { color: #c92a89; } .b { background: rgb(0 0 0); } .c { font-family: Georgia, serif; } .d { border: 1px solid white; } .e { font: 700 20px Arial; }</style>';
  assert.equal(rawStyle(bad).length, 5);
  assert.deepEqual(rawStyle('<style>\n.a { color: color-mix(in oklab, currentColor 60%, transparent); }\n.b { font-family: var(--font-mono); }\n</style>'), []);
});

/** Markup with every {expression} removed, however deeply nested. */
function outsideBraces(s) {
  let depth = 0;
  let out = '';
  for (const c of s) {
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (depth === 0) out += c;
  }
  return out;
}

test('every layout keeps a phone rule, a static rule, and no hard-coded copy in its markup', () => {
  for (const [name, src] of Object.entries(source)) {
    assert.match(src, /@media \(max-width: 799px\)/, `${name}: phone rules`);
    assert.match(src, /:global\(html\.is-static\)/, `${name}: static/PDF rules`);
    // A layout's <script> is behavior, not copy: an interactive layout's code is left out of the check.
    const markup = outsideBraces(src.split(/^---$/m)[2].replace(/<style[\s\S]*<\/style>/, '').replace(/<script[\s\S]*?<\/script>/g, ''));
    const words = markup.replace(/<[^>]+>/g, ' ').replace(/[“”]/g, '').trim();
    assert.equal(words, '', `${name}: words come in through props or slots, not typed in the layout`);
  }
});

test('ACCEPTANCE: the gallery builds every layout from the example, labelled, in the brand', async () => {
  const out = await mkdtemp(join(tmpdir(), 'deck-gallery-test-'));
  try {
    const { entries } = await buildDeckGallery({ root: STARTER, out });
    const html = await readFile(join(out, 'index.html'), 'utf8');
    for (const l of catalog.layouts) assert.match(html, new RegExp(`class="gallery-tag" data-layout="${l.name}"`), `${l.name} is labelled`);
    for (const e of entries) assert.match(html, new RegExp(`id="slide-${e.id}"`), `${e.id} is built`);
    assert.equal((html.match(/<section id="slide-/g) ?? []).length, entries.length, 'one slide per example');
    assert.doesNotMatch(/<html[^>]*>/.exec(html)[0], /is-wire/, 'the brand gallery is not a wireframe');
    assert.match(html, /Harlow&#39;s crews|Harlow's crews/, 'filled from example.json');
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});

test('ACCEPTANCE: wire mode swaps every brand token for greys and the system font', async (t) => {
  // 1. wire.css replaces every color and type role brand.css sets.
  const brand = await readFile(join(STARTER, 'src/brand/brand.css'), 'utf8');
  const wire = await readFile(join(STARTER, 'src/styles/wire.css'), 'utf8');
  const decls = (css) => new Map([...css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  const kit = decls(/:root\s*\{([\s\S]*?)\}/.exec(brand)[1]);
  const fundamentals = decls(brand.split(/:root\s*\{/)[2] ?? '');
  const grey = decls(wire);
  const branded = [...kit, ...fundamentals].filter(([k, v]) => /#[0-9a-f]{3,8}\b/i.test(v) || /^--font-/.test(k)).map(([k]) => k);
  assert.ok(branded.length > 20);
  assert.deepEqual(branded.filter((k) => !grey.has(k)), [], 'every color and font token is replaced in wire mode');
  for (const [k, v] of grey) {
    for (const hex of v.match(/#[0-9a-f]{6}\b/gi) ?? []) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      assert.ok(r === g && g === b, `${k}: ${hex} is a grey`);
    }
    if (/^--font-/.test(k)) assert.match(v, /^ui-(sans-serif|monospace)/, `${k}: the system font`);
  }

  // 2. A wire build puts .is-wire on <html>, and the browser resolves the tokens to the wire values.
  const out = await mkdtemp(join(tmpdir(), 'deck-gallery-wire-'));
  try {
    await buildDeckGallery({ root: STARTER, out, wire: true });
    const html = await readFile(join(out, 'index.html'), 'utf8');
    assert.match(/<html[^>]*>/.exec(html)[0], /class="is-wire"/);
    assert.equal(process.env.DECK_WIRE ?? '', '', 'the build leaves the environment as it found it');

    const { default: puppeteer } = await import('puppeteer');
    const { serveDir } = await import('../bin/serve.mjs');
    const { stableLaunch } = await import('../bin/stable-shots.mjs');
    let browser;
    try {
      browser = await puppeteer.launch(stableLaunch());
    } catch (e) {
      // No Chrome on this machine (npm run setup:browser installs one): the static checks above stand.
      t.skip(`no browser: ${e.message}`);
      return;
    }
    const server = await serveDir(out);
    try {
      const page = await browser.newPage();
      await page.goto(`${server.url}/?pdf=1`, { waitUntil: 'networkidle0' });
      const read = () => page.evaluate(() => {
        const css = getComputedStyle(document.documentElement);
        const h = document.querySelector('.slide h1, .slide h2');
        return { accent: css.getPropertyValue('--accent').trim(), paper: css.getPropertyValue('--paper').trim(), font: getComputedStyle(h).fontFamily };
      });
      const wired = await read();
      assert.equal(wired.accent, grey.get('--accent'));
      assert.equal(wired.paper, grey.get('--paper'));
      assert.match(wired.font, /^ui-sans-serif/);
      // The same page with the class off wears the kit again.
      await page.evaluate(() => document.documentElement.classList.remove('is-wire'));
      const branded = await read();
      assert.equal(branded.accent.toLowerCase(), kit.get('--accent').toLowerCase());
      assert.doesNotMatch(branded.font, /^ui-sans-serif/);
    } finally {
      await browser.close();
      await server.close();
    }
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});

test('every layout has at least one worked example', () => {
  for (const l of catalog.layouts) assert.ok([].concat(example.slides[l.name] ?? []).length >= 1, `${l.name} has an example`);
});

test('every image the example names is a file in slide-toolbox/assets/, which the gallery serves as slide-toolbox/<file>', async () => {
  const paths = [...JSON.stringify(example).matchAll(/"([^"]+\.(?:svg|webp|png|jpe?g|avif|gif))"/gi)].map((m) => m[1]);
  assert.ok(paths.length >= 5, 'the example shows photos and screenshots');
  const assets = new Set(await readdir(join(TOOLBOX, 'assets')));
  for (const p of paths) {
    assert.match(p, /^slide-toolbox\/[^/]+$/, `${p}: served from slide-toolbox/`);
    assert.ok(assets.has(p.slice('slide-toolbox/'.length)), `${p}: is in slide-toolbox/assets/`);
  }
});

test('ACCEPTANCE: --kit builds the gallery in another brand-kit@1 folder, applied as brand:apply applies a deck\'s', async () => {
  const kit = await mkdtemp(join(tmpdir(), 'deck-gallery-kit-'));
  const out = await mkdtemp(join(tmpdir(), 'deck-gallery-kit-out-'));
  try {
    await cp(join(STARTER, 'brand'), kit, { recursive: true });
    const brand = JSON.parse(await readFile(join(kit, 'brand.json'), 'utf8'));
    brand.palette.accent = '#1f7a4d';
    await writeFile(join(kit, 'brand.json'), JSON.stringify(brand));
    const before = await readFile(join(STARTER, 'src/brand/brand.css'), 'utf8');
    await buildDeckGallery({ root: STARTER, out, kit });
    const css = (await Promise.all([join(out, 'index.html'), ...(await readdir(join(out, '_astro'))).filter((f) => f.endsWith('.css')).map((f) => join(out, '_astro', f))].map((f) => readFile(f, 'utf8')))).join('');
    assert.match(css, /--accent:\s*#1f7a4d/i, "the kit's accent is the gallery's");
    assert.equal(await readFile(join(STARTER, 'src/brand/brand.css'), 'utf8'), before, "the project's own brand is untouched");
  } finally {
    await rm(kit, { recursive: true, force: true });
    await rm(out, { recursive: true, force: true });
  }
});

test('ACCEPTANCE: --audit audits the gallery build as a deck, with no slides faked in src/slides and no stamp', async (t) => {
  try {
    const { default: puppeteer } = await import('puppeteer');
    const { stableLaunch } = await import('../bin/stable-shots.mjs');
    await (await puppeteer.launch(stableLaunch())).close();
  } catch (e) {
    t.skip(`no browser: ${e.message}`);
    return;
  }
  const out = await mkdtemp(join(tmpdir(), 'deck-gallery-audit-'));
  const slidesBefore = (await readdir(join(STARTER, 'src/slides'))).sort();
  const stamp = join(STARTER, 'artifacts/audit-pass.json');
  const stampBefore = existsSync(stamp) ? await readFile(stamp, 'utf8') : null;
  try {
    await buildDeckGallery({ root: STARTER, out });
    assert.equal(await auditGallery(out, { root: STARTER, quick: true }), 0, 'the gallery passes the audit');
    assert.deepEqual((await readdir(join(STARTER, 'src/slides'))).sort(), slidesBefore, 'src/slides is untouched');
    assert.equal(existsSync(stamp) ? await readFile(stamp, 'utf8') : null, stampBefore, "the deck's audit stamp is untouched");
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});

test('every layout marks its headline for measured fitting', () => {
  for (const [name, src] of Object.entries(source)) {
    assert.match(src, /<h[12] data-fit="\d( \d)?"/, `${name}: its headline carries data-fit="<stage lines> <phone lines>"`);
  }
});

test('ACCEPTANCE: measured fitting shrinks a wide font to its lines where the character estimate overflows', async (t) => {
  const { default: puppeteer } = await import('puppeteer');
  const { stableLaunch } = await import('../bin/stable-shots.mjs');
  let browser;
  try {
    browser = await puppeteer.launch(stableLaunch());
  } catch (e) {
    t.skip(`no browser: ${e.message}`);
    return;
  }
  // A monospace face is the widest common case (fillmore's Onsite Semi Mono): 0.6em a character, not 0.55.
  const font = await readFile(join(STARTER, 'node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2'));
  const fitter = await readFile(join(STARTER, 'src/scripts/fit-text.js'), 'utf8');
  const headline = 'Every Harlow route finished by 3pm, four in five.';
  // lib.ts fitType's estimate for a 700px column at three lines.
  const estimate = Math.max(60, Math.min(112, Math.floor((700 * 3) / (headline.length * 0.55))));
  const phoneEstimate = Math.max(26, Math.min(40, Math.floor((330 * 4) / (headline.length * 0.55))));
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setContent(`<style>
      @font-face { font-family: Wide; src: url(data:font/woff2;base64,${font.toString('base64')}) format('woff2'); font-weight: 100 800; }
      body { margin: 0; }
      .slide { position: relative; width: 1920px; height: 1080px; overflow: hidden; }
      h2 { margin: 0; width: 700px; font: 700 ${estimate}px/1.05 Wide; }
      .roomy { width: 1600px; }
      @media (max-width: 799px) { #a h2 { width: 330px; font-size: ${phoneEstimate}px; } }
    </style>
    <div class="slide" id="a"><h2 data-fit="3 4">${headline}</h2></div>
    <div class="slide" id="b"><h2 class="roomy" data-fit="3 4">Short line.</h2></div>`);
    await page.addScriptTag({ type: 'module', content: `${fitter}\nwindow.__fit = { fitText, fitTextWhenReady, measure };` });
    await page.waitForFunction(() => window.__fit);
    const state = () => page.evaluate(() => [...document.querySelectorAll('h2')].map((h) => ({ ...window.__fit.measure(h), size: parseFloat(getComputedStyle(h).fontSize) })));
    await page.evaluate(() => document.fonts.load('700 16px Wide'));
    const [before, roomyBefore] = await state();
    assert.ok(before.lines > 3, `the estimate overflows in the wide face (${before.lines} lines at ${estimate}px)`);
    await page.evaluate(() => window.__fit.fitTextWhenReady());
    const [after, roomyAfter] = await state();
    assert.ok(after.lines <= 3, `fitted to three lines (got ${after.lines})`);
    assert.ok(after.size < estimate && after.size >= estimate * 0.6, `shrunk, within the floor (${after.size}px from ${estimate}px)`);
    assert.ok(after.size > estimate * 0.65, `shrunk only as far as it needs (${after.size}px from ${estimate}px, ${before.lines} lines)`);
    assert.equal(roomyAfter.size, roomyBefore.size, 'a headline that already fits keeps its size');
    // The phone line count applies under 800px wide.
    await page.setViewport({ width: 390, height: 844 });
    await page.evaluate(() => window.__fit.fitText());
    const [phone] = await state();
    assert.ok(phone.lines <= 4 && !phone.wide, `fits four lines on the phone (got ${phone.lines})`);
  } finally {
    await browser.close();
  }
});

test('--photos and --faces put real images in every photo prop and portrait, in turn', () => {
  const entries = [
    { layout: { props: { photo: {} } }, props: { photo: 'slide-toolbox/photo-crew.svg' } },
    { layout: { props: { headline: {} } }, props: { headline: 'x' } },
    { layout: { props: { photo: {} } }, props: {} },
    { layout: { props: { people: {} } }, props: { people: [{ name: 'A' }, { name: 'B' }] } },
  ];
  const out = withPhotos(entries, ['/k/a.jpg', '/k/b.webp'], ['/k/f.webp']);
  assert.equal(out[0].props.photo, 'slide-toolbox/try/0-a.jpg');
  assert.equal(out[1].props.photo, undefined, 'a layout without a photo prop gets none');
  assert.equal(out[2].props.photo, 'slide-toolbox/try/1-b.webp');
  assert.deepEqual(out[3].props.people.map((p) => p.photo), ['slide-toolbox/try-faces/0-f.webp', 'slide-toolbox/try-faces/0-f.webp']);
  assert.equal(entries[0].props.photo, 'slide-toolbox/photo-crew.svg', 'the example is left as it was');
  assert.equal(withPhotos(entries), entries);
});
