import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assetModule, brandCss, cssFamily, fontFaceCss, fontImports, resolvePalette, validateKit } from '../bin/brand-lib.mjs';

const base = () => ({
  schema: 'brand-kit@1',
  identity: { name: 'Acme', wordmark: 'Acme', logos: {} },
  palette: { paper: '#ffffff', ink: '#111111', accent: '#ff0055' },
  typography: {
    display: { family: 'Inter Tight', source: 'fontsource', package: '@fontsource-variable/inter-tight' },
    body: { family: 'Inter', source: 'fontsource', package: '@fontsource-variable/inter' },
  },
  style: {},
});

test('a minimal kit is valid and every role resolves', () => {
  assert.deepEqual(validateKit(base()), []);
  const p = resolvePalette(base().palette);
  for (const role of ['surface', 'ink_muted', 'accent_dark', 'on_accent', 'night', 'on_night', 'accent_on_night']) assert.ok(p[role], role);
  assert.equal(p.night, '#111111');
  assert.equal(p.on_night, '#ffffff');
});

test('validation catches bad colors, sources, and unlicensed font files', () => {
  const kit = base();
  kit.palette.accent = 'red';
  kit.typography.display = { family: 'Brand Sans', source: 'files', files: [{ path: 'fonts/Brand.woff2' }] };
  kit.style.shadow = 'glow';
  const errors = validateKit(kit).join('\n');
  assert.match(errors, /palette\.accent must be a hex/);
  assert.match(errors, /license "open" or "user-supplied"/);
  assert.match(errors, /style\.shadow/);
  kit.typography.display.files = [{ path: '../secret.woff2' }];
  assert.match(validateKit(kit).join('\n'), /bad path/);
});

test('emphasis "contrast" mutes headlines and brightens the key phrase', () => {
  const kit = base();
  kit.style.emphasis = 'contrast';
  const css = brandCss(kit);
  assert.match(css, /--headline-color: var\(--ink-muted\);/);
  assert.match(css, /--hl-color: var\(--ink\);/);
  assert.match(brandCss(base()), /--hl-color: var\(--accent\);/);
});

test('shadow styles map to real box-shadows and none disables them', () => {
  const kit = base();
  kit.style.shadow = 'none';
  assert.match(brandCss(kit), /--shadow-card: none;/);
  kit.style.shadow = 'drop';
  assert.match(brandCss(kit), /--shadow-card: 0 var\(--shadow-offset\) 0 /);
});

test('night roles, extras, and data colors become tokens', () => {
  const kit = base();
  kit.palette.night = '#131f24';
  kit.palette.extras = [{ name: 'fox', hex: '#ff9600' }];
  kit.palette.data = ['#58cc02', '#1cb0f6'];
  const css = brandCss(kit);
  assert.match(css, /--night: #131f24;/);
  assert.match(css, /--accent-on-night: #ff0055;/);
  assert.match(css, /--c-fox: #ff9600;/);
  assert.match(css, /--data-2: #1cb0f6;/);
  assert.doesNotMatch(css, /undefined/);
});

test('font families, imports, and @font-face rules', () => {
  const kit = base();
  assert.equal(cssFamily(kit.typography.display), 'Inter Tight Variable');
  assert.match(fontImports(kit), /import '@fontsource-variable\/inter-tight';/);
  kit.typography.display = { family: 'Brand Sans', source: 'files', license: 'user-supplied', files: [{ path: 'fonts/Brand-Bold.otf', weight: 700 }] };
  const face = fontFaceCss(kit, '../../brand/');
  assert.match(face, /font-family: "Brand Sans";/);
  assert.match(face, /url\("\.\.\/\.\.\/brand\/fonts\/Brand-Bold\.otf"\) format\("opentype"\)/);
  assert.match(brandCss(kit), /--font-display: "Brand Sans",/);
});

test('logos and imagery become bundled URL imports', () => {
  const kit = base();
  kit.identity.logos = { primary: 'logos/primary.svg', on_ink: 'logos/light.svg' };
  kit.imagery = [{ path: 'imagery/hero.jpg', role: 'hero', alt: 'A desk on a hill' }];
  const mod = assetModule(kit, '../../brand/');
  assert.match(mod, /import logo_primary from '\.\.\/\.\.\/brand\/logos\/primary\.svg\?url';/);
  assert.match(mod, /"on_ink": logo_on_ink/);
  assert.match(mod, /role: "hero"/);
});
