// The site toolbox: every component and both proposal templates build and pass
// the check, read only brand tokens, and use only classes the toolbox defines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkSite } from '../bin/site/check.mjs';
import { buildSite } from '../bin/site-build.mjs';
import { loadSite } from '../bin/site-check.mjs';
import { scaffold, templates, TOOLBOX } from '../bin/site-new.mjs';
import { sampleTone } from '../site-toolbox/sample-tone.mjs';

const HOUSE = { paper: '#faf5eb', ink: '#1a1612', magenta: '#c92a89', 'magenta-dark': '#9a176e', periwinkle: '#697ffc', yellow: '#ffd866', cyan: '#81ebeb', pink: '#f5a7c4' };

const BRAND = {
  schema: 'brand-kit@1',
  identity: { name: 'Northline' },
  palette: { paper: '#ffffff', ink: '#1d1d1d', accent: '#2f5bd3', surface: '#f3f5fb', night: '#14203d' },
  typography: { display: { family: 'Georgia', source: 'system', fallback: 'serif' }, body: { family: 'Arial', source: 'system' } },
};

async function project() {
  const root = await mkdtemp(join(tmpdir(), 'toolbox-'));
  await mkdir(join(root, 'brand'), { recursive: true });
  await writeFile(join(root, 'brand/brand.json'), JSON.stringify(BRAND));
  return root;
}

const components = (await readdir(join(TOOLBOX, 'components'))).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, ''));
const css = await readFile(join(TOOLBOX, 'toolbox.css'), 'utf8');

for (const name of Object.keys(templates())) {
  test(`ACCEPTANCE: the ${name} template scaffolds, passes the check with no warnings, and builds`, async () => {
    const root = await project();
    const files = scaffold(root, name);
    assert.ok(files.length >= 6);
    const { errors, warnings } = checkSite(await loadSite(root));
    assert.deepEqual(errors, []);
    assert.deepEqual(warnings, [], 'a template is the example of simple copy: no warnings');
    const built = await buildSite({ root });
    assert.deepEqual(built.missing, []);
    const html = await readFile(join(root, 'dist-site/index.html'), 'utf8');
    assert.match(html, /\.tb-hero \{/, 'toolbox.css is in the page');
    assert.ok(existsSync(join(root, 'dist-site/assets/drawing.svg')));
    assert.throws(() => scaffold(root, name), /already has sections/, 'never overwrites a site without --force');
  });
}

test('ACCEPTANCE: a page built from every component passes the check and builds', async () => {
  const root = await project();
  scaffold(root, 'data-proposal');
  const sections = components.filter((c) => !['header', 'footer', 'glance', 'hero'].includes(c));
  const dir = join(root, 'site/sections');
  for (const f of await readdir(dir)) await writeFile(join(dir, f), '');
  const strip = async (c) => (await readFile(join(TOOLBOX, 'components', `${c}.html`), 'utf8')).replace(/^<!--[\s\S]*?-->\s*/, '');
  await writeFile(join(dir, '01-hero.html'), (await strip('hero')) + (await strip('glance')));
  for (const [i, c] of sections.entries()) await writeFile(join(dir, `${String(i + 2).padStart(2, '0')}-${c}.html`), await strip(c));
  for (const f of await readdir(dir)) if (!(await readFile(join(dir, f), 'utf8')).trim()) await (await import('node:fs/promises')).rm(join(dir, f));
  const { errors } = checkSite(await loadSite(root));
  assert.deepEqual(errors, []);
  const built = await buildSite({ root });
  assert.deepEqual(built.missing, []);
  assert.equal(built.sections.length, sections.length + 1);
});

test('every tb- class a component uses is defined in toolbox.css', async () => {
  const used = new Set();
  for (const c of components) {
    const html = await readFile(join(TOOLBOX, 'components', `${c}.html`), 'utf8');
    for (const [, list] of html.matchAll(/class="([^"]+)"/g)) for (const k of list.split(/\s+/)) if (k.startsWith('tb-')) used.add(k);
  }
  const missing = [...used].filter((k) => !new RegExp(`\\.${k}(?![\\w-])`).test(css));
  assert.deepEqual(missing, []);
});

test('toolbox.css reads only brand tokens: no raw colors, and a phone and a PDF layout', () => {
  // The sample band is in the Pitch Unfairly house palette on purpose: its tokens are the only fixed colors.
  const noData = css.replace(/url\("data:[^"]*"\)/g, '').replace(/--tb-sample-(?:paper|ink|magenta|magenta-dark|periwinkle|yellow|cyan|pink): #[0-9a-f]{6};/g, '');
  assert.doesNotMatch(noData, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /\.is-pdf /);
  assert.match(css, /\[hidden\] \{ display: none !important; \}/, 'data-when must be able to hide any component');
  // Motion for charts: every model-sized bar glides, the strike lands, and reduced motion stills it all.
  assert.match(css, /\[data-bar\] \{ transition: width 450ms[^}]*height 450ms[^}]*y 450ms/);
  assert.match(css, /\.tb-was::after/);
  assert.match(css, /prefers-reduced-motion: reduce\) \{\n  \[data-bar\], \.tb-bar-track i, \.tb-hbar-track i \{ transition: none !important; \}/, 'reduced motion stills every chart, the toolbox bars included');
});

test('ACCEPTANCE: the sample band says it is a sample in the house palette, carries none of our booking pitch, and ships its fonts', async () => {
  const header = await readFile(join(TOOLBOX, 'components', 'header.html'), 'utf8');
  assert.match(header, /class="tb-sample-bar" data-sample data-sample-tone="yellow" data-sample-pill="magenta"/);
  assert.match(header, /Sample proposal\. \{\{facts\.client\.name\}\} and its numbers are fictional\./);
  assert.doesNotMatch(header, /book_meeting|talk_to_us|book_href|email_href|Yours could look like this/, 'no Unfairly booking pitch in a sample');
  assert.equal((header.match(/data-cta="/g) ?? []).length, 1, 'one link at most: Made by Unfairly');
  assert.match(header, /href="\{\{facts\.sample\.made_by_href\}\}" target="_blank" rel="noopener" data-cta="made_by"/);
  for (const [k, v] of Object.entries(HOUSE)) assert.match(css, new RegExp(`--tb-sample-${k}: ${v};`), k);
  assert.doesNotMatch(css, /e8553a/i, 'no black-and-orange: the band is the colorful house palette');
  for (const f of ['unfairly-sora.woff2', 'unfairly-dm-sans.woff2']) assert.ok(existsSync(join(TOOLBOX, 'assets', 'fonts', f)), f);
  const part = await readFile(join(TOOLBOX, 'parts', 'sample.html'), 'utf8');
  assert.match(part, /pdf-only/, 'the PDF carries the band');
  assert.doesNotMatch(part, /book|email|calendly/i, 'and no booking pitch in print either');
  assert.ok(!existsSync(join(TOOLBOX, 'components', 'viewers.html')), 'the viewers demo is not a toolbox component');
});

test('a sample site without a sample band is called out', async () => {
  const root = await project();
  scaffold(root, 'proposal');
  const loaded = await loadSite(root);
  assert.ok(!checkSite(loaded).warnings.some((w) => /no sample band/.test(w)));
  loaded.header = loaded.header.replace(/<div class="tb-sample-bar"[\s\S]*?<\/header>/, '</header>');
  assert.ok(checkSite(loaded).warnings.some((w) => /no sample band/.test(w)));
});

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

test('every text pair the sample band and close can show is 4.5:1 or better', () => {
  const H = HOUSE;
  const pairs = [
    ['ink on yellow band', H.ink, H.yellow], ['ink on cyan band', H.ink, H.cyan], ['ink on pink band', H.ink, H.pink],
    ['paper on magenta pill and close', H.paper, H.magenta], ['paper on magenta-dark hover', H.paper, H['magenta-dark']],
    ['ink on periwinkle pill and close', H.ink, H.periwinkle], ['paper on ink pill and close', H.paper, H.ink],
    ['ink on the yellow marker highlight', H.ink, H.yellow], ['ink on paper pill in the close', H.ink, H.paper],
  ];
  assert.ok(contrast(H.yellow, H.magenta) < 4.5, 'yellow type on magenta fails, which is why the highlight is a marker');
  assert.match(css, /\.tb-sample-close \.hl \{ color: var\(--tb-sample-ink\); background: var\(--tb-sample-close-hl\)/);
  for (const [what, fg, bg] of pairs) assert.ok(contrast(fg, bg) >= 4.5, `${what}: ${contrast(fg, bg).toFixed(2)}:1`);
});

test('ACCEPTANCE: the sample band stays off the provider\'s own hues', () => {
  const pareto = { palette: { accent: '#4006ba', accent_dark: '#2e0487', accent_secondary: '#ccccff', highlight: '#e0deff', night: '#1a1033', extras: [{ hex: '#ccccff' }, { hex: '#e0deff' }] } };
  const symetra = { palette: { accent: '#0677d1', accent_dark: '#05599d', accent_secondary: '#93cefc', highlight: '#dbeffe', night: '#05599d', extras: [{ hex: '#078bf5' }, { hex: '#93cefc' }] } };
  const sana = { palette: { accent: '#003f48', accent_secondary: '#fbcc45', highlight: '#fbcc45', night: '#003f48', extras: [{ hex: '#fbcc45' }, { hex: '#4f76a4' }] } };
  const crimson = { palette: { accent: '#af272f', accent_dark: '#720006', accent_secondary: '#d8a3a6', extras: [{ hex: '#f3d9da' }] } };
  const fuchsia = { palette: { accent: '#d0208f', accent_dark: '#6a3cf0' } };
  assert.deepEqual(sampleTone(pareto), { tone: 'yellow', pill: 'magenta' }, 'Pareto purple is 65 degrees from magenta: the house default holds');
  assert.deepEqual(sampleTone(symetra), { tone: 'yellow', pill: 'magenta' });
  assert.equal(sampleTone(sana).tone, 'pink', 'Sana is yellow and teal: the band goes pink');
  assert.equal(sampleTone(crimson).pill, 'periwinkle', 'a red brand gets the periwinkle pill');
  assert.equal(sampleTone(fuchsia).pill, 'ink', 'magenta and periwinkle both taken: ink');
  assert.deepEqual(sampleTone({}), { tone: 'yellow', pill: 'magenta' }, 'no brand: the house default');
});

test('ACCEPTANCE: site:gallery builds every component on one page in the project\'s brand, each labelled', async () => {
  const { buildGallery, galleryComponents } = await import('../bin/site-gallery.mjs');
  const root = await project();
  const { components: list } = await buildGallery({ root });
  const html = await readFile(join(root, 'dist-gallery/index.html'), 'utf8');
  for (const c of components.filter((x) => !['header', 'footer'].includes(x))) assert.ok(list.includes(c), `${c} is in the gallery`);
  for (const c of list.filter((x) => x !== 'glance')) assert.match(html, new RegExp(`<div class="tb-gallery-tag" data-pdf-hide><b>${c}( \\+ glance)?</b>`), `${c} is labelled`);
  assert.match(html, /--accent: #2f5bd3/i, 'in the project\'s brand');
  assert.equal(list.at(-1), 'close', 'the close comes last');
  assert.deepEqual(await galleryComponents(), list);
  assert.ok(!existsSync(join(root, 'site')), 'touches nothing in site/');
});

test('a quote typed into the page and a color the brand doesn\'t name are called out', async () => {
  const root = await project();
  scaffold(root, 'proposal');
  const loaded = await loadSite(root);
  const extra = { name: '99-extra.html', html: '<section id="x" class="tb-band" data-section="x" style="background: #ff3366"><div class="tb-wrap"><figure><blockquote><p>Best vendor we ever hired.</p></blockquote></figure></div></section>' };
  const { warnings } = checkSite({ ...loaded, sections: [...loaded.sections, extra], styles: '.tb-hero { color: rgb(10, 20, 30); background: var(--surface); } .a { color: #e7751e } .b { color: #b83828 } .c { color: #e7751e } /* #abcdef in a comment is fine */' });
  assert.ok(warnings.some((w) => /99-extra\.html: a quote is typed into the page/.test(w)));
  assert.ok(warnings.some((w) => /99-extra\.html: #ff3366 is a color the brand kit doesn't name/.test(w)));
  assert.deepEqual(warnings.filter((w) => w.startsWith('styles.css')), ["styles.css: 3 colors (rgb(10, 20, 30), #e7751e, #b83828) are colors the brand kit doesn't name. Use brand tokens, or add the colors to the brand kit."], 'one line for the whole stylesheet');
  assert.ok(!warnings.some((w) => /#abcdef/.test(w)));
  assert.ok(!checkSite(loaded).warnings.some((w) => /quote is typed|color the brand/.test(w)), 'the toolbox\'s own quotes and colors pass');
});

test('ACCEPTANCE: tabs: every tab names a panel that exists, one is open, and the PDF prints every panel', async () => {
  const html = await readFile(join(TOOLBOX, 'components', 'tabs.html'), 'utf8');
  assert.match(html, /class="tb-tabs" data-picker/);
  const tabs = [...html.matchAll(/role="tab" id="([^"]+)" aria-controls="([^"]+)"/g)];
  assert.ok(tabs.length >= 3);
  for (const [, tab, panel] of tabs) assert.match(html, new RegExp(`role="tabpanel" id="${panel}" aria-labelledby="${tab}"`));
  assert.equal((html.match(/class="tb-tab is-on"/g) ?? []).length, 1);
  assert.equal((html.match(/class="tb-tabpanel is-on"/g) ?? []).length, 1);
  assert.match(css, /\.js \.tb-tabpanel:not\(\.is-on\) \{ display: none; \}/, 'without script every panel shows');
  assert.match(css, /\.is-pdf \.tb-tablist \{ display: none; \}/);
  assert.match(css, /\.is-pdf \.tb-tabpanel \{ display: grid !important;/);
});

test('ACCEPTANCE: price: the stepper drives a model input, every total is a model value, and the PDF drops the buttons', async () => {
  const html = await readFile(join(TOOLBOX, 'components', 'price.html'), 'utf8');
  const example = JSON.parse(await readFile(join(TOOLBOX, 'example.json'), 'utf8'));
  const input = /data-input="(\w+)" type="number"/.exec(html)?.[1];
  assert.ok(input && input in example.model.inputs, 'the stepper is a model input');
  assert.equal([...html.matchAll(new RegExp(`data-step="-?1" data-for="${input}"`, 'g'))].length, 2);
  assert.match(html, new RegExp(`data-reset="${input}"`));
  for (const [, token] of html.matchAll(/class="tb-build-n tb-num">[^{]*\{\{(\w+)\}\}/g)) assert.ok(token in example.model.formulas || token in example.model.inputs, token);
  assert.match(html, /class="tb-price-card" data-tone="night"/);
  assert.match(css, /\.is-pdf \.tb-step-b, \.is-pdf \.tb-build button\.tb-link \{ display: none !important; \}/);
});

test('the standard proposal template includes the price', () => {
  assert.ok(templates().proposal.sections.includes('price'));
});

test('ACCEPTANCE: photos: every photo is a fact with alt text and a caption, the art ships, and phone and PDF lay it out', async () => {
  const html = await readFile(join(TOOLBOX, 'components', 'photos.html'), 'utf8');
  const example = JSON.parse(await readFile(join(TOOLBOX, 'example.json'), 'utf8'));
  const figures = [...html.matchAll(/<figure class="tb-photo[^"]*"[^>]*><img src="\{\{facts\.photos\.(p\d)\.src\}\}" alt="\{\{facts\.photos\.\1\.alt\}\}"[^>]*><figcaption>\{\{facts\.photos\.\1\.caption\}\}<\/figcaption><\/figure>/g)];
  assert.equal(figures.length, 3);
  assert.equal((html.match(/class="tb-photo is-lead/g) ?? []).length, 1, 'one lead photo');
  for (const [, p] of figures) {
    const photo = example.facts.photos[p];
    assert.ok(photo.alt && photo.caption, p);
    assert.ok(existsSync(join(TOOLBOX, photo.src)), photo.src);
  }
  assert.match(html, /\{\{facts\.photos\.credit\}\}/, 'a credit line, which stock photos need');
  assert.match(css, /@media \(max-width: 720px\) \{[\s\S]*\.tb-photo\.is-lead \{ grid-row: auto; grid-column: 1 \/ -1; \}/);
  assert.match(css, /\.is-pdf \.tb-photos \{ height: 420px; \}/);
});

test('the standard proposal template shows the client\'s photos', () => {
  assert.ok(templates().proposal.sections.includes('photos'));
});
