// A brand's extra faces, a full brand book's palette, lowercase brands, and a
// slide in a sub-brand (fillmore inside Metaview) all reach the deck.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brandCss, cssCase, fontFaceCss, fontImports, kitFilePaths, subBrandCss, subBrandModule, validateKit } from '../bin/brand-lib.mjs';

const starter = new URL('../', import.meta.url).pathname;

const files = (family, ...names) => ({ family, source: 'files', license: 'user-supplied', files: names.map((n, i) => ({ path: `fonts/${n}`, weight: 400 + i * 100 })) });

/** Metaview's shape: Euclid for display and body, Onsite Extended and Onsite Mono as extra faces. */
const parent = () => ({
  schema: 'brand-kit@1',
  identity: { name: 'Metaview', logos: {} },
  palette: {
    paper: '#FFFFFF', ink: '#0B1F1A', accent: '#1F6F5C',
    extras: Array.from({ length: 30 }, (_, i) => ({ name: `ramp-${i}`, hex: `#${(0x100000 + i * 4099).toString(16).slice(-6).toUpperCase()}` })),
  },
  typography: {
    display: files('Euclid Circular B', 'Euclid-Medium.woff2'),
    body: files('Euclid Circular B', 'Euclid-Regular.woff2'),
    faces: [
      { role: 'extended', ...files('Onsite Extended', 'OnsiteExtended-Medium.woff2') },
      { role: 'eyebrow-mono', fallback: 'mono', case: 'upper', ...files('Onsite Mono', 'OnsiteMono-Regular.woff2') },
    ],
  },
});

/** fillmore's shape: one mono face for every role, lowercase, lime accent. */
const fillmore = () => {
  const face = { ...files('Onsite Semi Mono', 'OnsiteSemiMono-Regular.woff2', 'OnsiteSemiMono-Medium.woff2'), case: 'lower' };
  return {
    schema: 'brand-kit@1',
    identity: { name: 'fillmore', logos: {} },
    palette: { paper: '#FFFFFF', ink: '#000000', accent: '#A1FA0A', extras: [{ name: 'main-gradient-b9ff00', hex: '#B9FF00', group: 'fillmore' }] },
    typography: { display: face, body: face, mono: face },
  };
};

test('every face in typography.faces is declared, named as a token and a class, and its files are required', () => {
  const kit = parent();
  assert.deepEqual(validateKit(kit), []);
  const faces = fontFaceCss(kit, '../../brand/');
  assert.match(faces, /font-family: "Onsite Extended";\n  src: url\("..\/..\/brand\/fonts\/OnsiteExtended-Medium.woff2"\)/);
  assert.match(faces, /font-family: "Onsite Mono"/);
  // Euclid is named twice (display and body) but each of its files is declared once.
  assert.equal(faces.match(/Euclid-Medium/g).length, 1);
  const css = brandCss(kit, faces);
  assert.match(css, /--font-extended: "Onsite Extended", /);
  assert.match(css, /--font-eyebrow-mono: "Onsite Mono", ui-monospace|--font-eyebrow-mono: "Onsite Mono", .*mono/);
  assert.match(css, /\.font-eyebrow-mono \{\n  font-family: var\(--font-eyebrow-mono\);\n  text-transform: uppercase;/);
  const paths = kitFilePaths(kit).map((f) => f.path);
  assert.ok(paths.includes('fonts/OnsiteExtended-Medium.woff2') && paths.includes('fonts/OnsiteMono-Regular.woff2'));
  // A face can't take a role the main three already have, and needs its files.
  assert.match(validateKit({ ...kit, typography: { ...kit.typography, faces: [{ role: 'display', ...files('X', 'x.woff2') }] } }).join('\n'), /faces\[0\]\.role must be/);
  assert.match(validateKit({ ...kit, typography: { ...kit.typography, faces: [{ role: 'wide', family: 'X', source: 'files', license: 'open' }] } }).join('\n'), /typography\.faces\[0\]\.files is required/);
  // A Fontsource face is imported like the main three.
  assert.match(fontImports({ typography: { display: kit.typography.display, body: kit.typography.body, faces: [{ role: 'wide', family: 'Sora', source: 'fontsource', package: '@fontsource-variable/sora' }] } }), /import '@fontsource-variable\/sora';/);
});

test('a brand book palette of up to 48 extras is kept whole', () => {
  const kit = parent();
  kit.palette.extras = Array.from({ length: 48 }, (_, i) => ({ name: `c${i}`, hex: '#123456' }));
  assert.deepEqual(validateKit(kit), []);
  assert.equal(brandCss(kit).match(/--c-c\d+:/g).length, 48);
  kit.palette.extras.push({ name: 'c48', hex: '#123456' });
  assert.match(validateKit(kit).join('\n'), /palette\.extras has 49 entries; the limit is 48/);
});

test('"lower" and "lowercase" round-trip as CSS lowercase, on fonts and type roles', () => {
  assert.equal(cssCase('lower'), 'lowercase');
  assert.equal(cssCase('upper'), 'uppercase');
  assert.equal(cssCase('lowercase'), 'lowercase');
  const kit = fillmore();
  assert.deepEqual(validateKit(kit), []);
  const css = brandCss(kit);
  assert.match(css, /--display-case: lowercase;/);
  assert.match(css, /--body-case: lowercase;/);
  kit.typography.roles = { eyebrow: { font: 'mono', case: 'lower' } };
  assert.deepEqual(validateKit(kit), []);
  assert.match(brandCss(kit), /--type-eyebrow-case: lowercase;/);
  kit.typography.body.case = 'small-caps';
  assert.match(validateKit(kit).join('\n'), /typography\.body\.case must be none, uppercase, lowercase/);
});

test('a sub-brand kit is scoped to its slides: its tokens and rules apply only under [data-brand]', () => {
  const css = subBrandCss('fillmore', fillmore(), '../../brand/');
  assert.doesNotMatch(css, /:root/);
  assert.doesNotMatch(css, /@font-face/);
  assert.match(css, /\[data-brand="fillmore"\] \{\n  --paper: #FFFFFF;/);
  assert.match(css, /--accent: #A1FA0A;/);
  assert.match(css, /--font-display: "Onsite Semi Mono"/);
  assert.match(css, /--body-case: lowercase;/);
  // Every rule is inside the sub-brand: no bare selector leaks onto the rest of the deck.
  for (const line of css.split('\n').filter((l) => /\{$/.test(l) && !l.trim().startsWith('@'))) assert.match(line, /\[data-brand="fillmore"\]/, line);
  assert.throws(() => subBrandCss('Fill More', fillmore(), ''), /kebab-case/);
  assert.match(subBrandModule([{ id: 'fillmore', kit: { identity: { name: 'fillmore', logos: { primary: 'logos/f.svg' } } } }], '../../brand/'), /"fillmore": \{ name: "fillmore", wordmark: "fillmore", logos: \{ "primary": sb0_primary \} \}/);
});

test('a mixed deck builds: brand-apply reads brand/sub-brands, the fillmore slide wears its kit, the rest keep the main one', { timeout: 240_000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'sub-brand-deck-'));
  try {
    for (const p of ['package.json', 'astro.config.mjs', 'bin', 'src', 'brand']) cpSync(join(starter, p), join(dir, p), { recursive: true });
    rmSync(join(dir, 'src/slides'), { recursive: true, force: true });
    mkdirSync(join(dir, 'src/slides'));
    execFileSync('ln', ['-s', join(starter, 'node_modules'), join(dir, 'node_modules')]);
    // Font files only need to exist for brand-apply; the build copies them as assets.
    const font = readFileSync(join(starter, 'node_modules/@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2'));
    mkdirSync(join(dir, 'brand/fonts'), { recursive: true });
    const main = parent();
    main.house = true;
    main.style = { radius: 8 };
    for (const f of [...main.typography.display.files, ...main.typography.body.files, ...main.typography.faces.flatMap((x) => x.files), ...fillmore().typography.display.files]) writeFileSync(join(dir, 'brand', f.path), font);
    writeFileSync(join(dir, 'brand/brand.json'), JSON.stringify(main));
    mkdirSync(join(dir, 'brand/sub-brands'));
    writeFileSync(join(dir, 'brand/sub-brands/fillmore.json'), JSON.stringify(fillmore()));
    writeFileSync(join(dir, 'src/slides/01-cover.astro'), "---\nimport Slide from '../components/Slide.astro';\n---\n<Slide id=\"cover\" label=\"Cover\" bare><h1 class=\"display hero\">Metaview <span class=\"font-extended\">wide</span></h1></Slide>\n");
    writeFileSync(join(dir, 'src/slides/02-fillmore.astro'), "---\nimport Slide from '../components/Slide.astro';\n---\n<Slide id=\"fillmore\" label=\"fillmore\" brand=\"fillmore\"><h2 class=\"display\">meet fillmore</h2></Slide>\n");
    const index = join(dir, 'src/pages/index.astro');
    writeFileSync(index, readFileSync(index, 'utf8').replace("import Cover from '../slides/01-cover.astro';", "import Cover from '../slides/01-cover.astro';\nimport Fillmore from '../slides/02-fillmore.astro';").replace('<Cover />', '<Cover />\n  <Fillmore />'));
    execFileSync('node', ['bin/brand-apply.mjs'], { cwd: dir, stdio: 'pipe' });
    const css = readFileSync(join(dir, 'src/brand/brand.css'), 'utf8');
    assert.match(css, /font-family: "Onsite Extended"/);
    assert.match(css, /font-family: "Onsite Semi Mono"/);
    assert.match(css, /--c-ramp-29:/, 'all 30 extras reach the tokens');
    assert.match(css, /\[data-brand="fillmore"\] \{/);
    execFileSync('npx', ['astro', 'build'], { cwd: dir, stdio: 'pipe' });
    const html = readFileSync(join(dir, 'dist/index.html'), 'utf8');
    assert.match(html, /<div[^>]*class="deck-frame tone-paper[^"]*"[^>]*data-brand="fillmore"/);
    // The cover has no brand attribute, so it keeps Metaview's kit.
    assert.equal(html.match(/ data-brand="/g).length, 1);
    // An unknown sub-brand fails the build with a fix, never silently in the main kit.
    writeFileSync(join(dir, 'src/slides/02-fillmore.astro'), "---\nimport Slide from '../components/Slide.astro';\n---\n<Slide id=\"fillmore\" label=\"fillmore\" brand=\"filmore\"><h2>typo</h2></Slide>\n");
    assert.throws(() => execFileSync('npx', ['astro', 'build'], { cwd: dir, stdio: 'pipe' }), (e) => /brand "filmore" isn't a sub-brand/.test(String(e.stderr) + String(e.stdout)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
