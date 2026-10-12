// Brand kit (brand/brand.json, schema brand-kit@1): validation and the
// generated files every slide reads from. Pure functions; brand-apply.mjs
// does the file and npm work. See the brand-kit topic of the deck guide (deck_guide).

export const ROLES = [
  'paper', 'surface', 'ink', 'ink_muted', 'accent', 'accent_dark',
  'accent_secondary', 'on_accent', 'highlight', 'positive', 'border',
  // Dark sections (tone="ink" slides): background, text, and accent there.
  'night', 'on_night', 'accent_on_night',
];
const REQUIRED_ROLES = ['paper', 'ink', 'accent'];
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const FONT_EXT = /\.(woff2|woff|ttf|otf)$/i;

const MOTION = {
  calm: { ease: 'cubic-bezier(0.25, 0.1, 0.25, 1)', pop: 'cubic-bezier(0.25, 0.1, 0.25, 1)', enter: 600, stagger: 110 },
  crisp: { ease: 'cubic-bezier(0.165, 0.84, 0.44, 1)', pop: 'cubic-bezier(0.3, 1.4, 0.5, 1)', enter: 400, stagger: 70 },
  playful: { ease: 'cubic-bezier(0.34, 1.3, 0.64, 1)', pop: 'cubic-bezier(0.3, 1.7, 0.5, 1)', enter: 450, stagger: 80 },
};
const DENSITY = { airy: 1.2, balanced: 1, dense: 0.82 };
const FALLBACK = {
  sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  serif: 'ui-serif, Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, "SFMono-Regular", Menlo, monospace',
};

/** Returns a list of problems; empty means the kit is usable. */
export function validateKit(kit) {
  const errors = [];
  if (!kit || kit.schema !== 'brand-kit@1') errors.push('schema must be "brand-kit@1"');
  const palette = kit?.palette ?? {};
  for (const role of REQUIRED_ROLES) if (!palette[role]) errors.push(`palette.${role} is required`);
  for (const role of ROLES) {
    if (palette[role] != null && !HEX.test(palette[role])) errors.push(`palette.${role} must be a hex color, got ${palette[role]}`);
  }
  for (const [i, extra] of (palette.extras ?? []).entries()) {
    if (!/^[a-z][a-z0-9-]*$/.test(extra?.name ?? '') || !HEX.test(extra?.hex ?? '')) errors.push(`palette.extras[${i}] needs a kebab-case name and a hex`);
  }
  for (const role of ['display', 'body', 'mono']) {
    const t = kit?.typography?.[role];
    if (!t) { if (role !== 'mono') errors.push(`typography.${role} is required`); continue; }
    if (!t.family) errors.push(`typography.${role}.family is required`);
    if (!['fontsource', 'files', 'system'].includes(t.source)) errors.push(`typography.${role}.source must be fontsource, files, or system`);
    if (t.source === 'fontsource' && !/^@fontsource(-variable)?\/[a-z0-9-]+$/.test(t.package ?? '')) errors.push(`typography.${role}.package must be an @fontsource package`);
    if (t.source === 'files') {
      if (!Array.isArray(t.files) || !t.files.length) errors.push(`typography.${role}.files is required for source "files"`);
      for (const f of t.files ?? []) {
        if (!FONT_EXT.test(f.path ?? '') || f.path.includes('..')) errors.push(`typography.${role}.files: bad path ${f.path}`);
      }
      if (!['open', 'user-supplied'].includes(t.license)) errors.push(`typography.${role}: font files need license "open" or "user-supplied"`);
    }
  }
  const style = kit?.style ?? {};
  if (style.shadow && !['none', 'soft', 'hard', 'drop'].includes(style.shadow)) errors.push('style.shadow must be none, soft, hard, or drop');
  if (style.emphasis && !['color', 'contrast'].includes(style.emphasis)) errors.push('style.emphasis must be color or contrast');
  if (style.density && !(style.density in DENSITY)) errors.push('style.density must be airy, balanced, or dense');
  if (style.motion && !(style.motion in MOTION)) errors.push('style.motion must be calm, crisp, or playful');
  if (style.texture && !['none', 'grain', 'dots', 'lines'].includes(style.texture)) errors.push('style.texture must be none, grain, dots, or lines');
  if (style.button_shape && !['pill', 'rounded'].includes(style.button_shape)) errors.push('style.button_shape must be pill or rounded');
  return errors;
}

/** The CSS family name a font is registered under. */
export function cssFamily(t) {
  if (t.source === 'fontsource' && t.package?.startsWith('@fontsource-variable/')) return `${t.family} Variable`;
  return t.family;
}

const fontStack = (t, kind) => {
  if (!t) return FALLBACK[kind];
  const fallback = FALLBACK[t.fallback ?? kind] ?? FALLBACK[kind];
  return t.source === 'system' ? `${t.family}, ${fallback}` : `"${cssFamily(t)}", ${fallback}`;
};

/** Fill optional roles from the required ones so every token always exists. */
export function resolvePalette(p) {
  const mix = (a, b, pct) => `color-mix(in oklab, ${a} ${pct}%, ${b})`;
  return {
    paper: p.paper,
    surface: p.surface ?? mix(p.ink, p.paper, 6),
    ink: p.ink,
    ink_muted: p.ink_muted ?? mix(p.ink, p.paper, 70),
    accent: p.accent,
    accent_dark: p.accent_dark ?? mix(p.accent, '#000', 82),
    accent_secondary: p.accent_secondary ?? p.ink,
    on_accent: p.on_accent ?? p.paper,
    highlight: p.highlight ?? p.accent,
    positive: p.positive ?? p.accent,
    border: p.border ?? p.ink,
    night: p.night ?? p.ink,
    on_night: p.on_night ?? p.paper,
    accent_on_night: p.accent_on_night ?? p.accent,
  };
}

/** brand.css: the tokens every slide reads. */
export function brandCss(kit, fontFaces = '') {
  const p = resolvePalette(kit.palette);
  const t = kit.typography;
  const s = kit.style ?? {};
  const motion = MOTION[s.motion ?? 'crisp'];
  const shadow = s.shadow ?? 'hard';
  const shadows = {
    hard: ['var(--shadow-offset) var(--shadow-offset) 0 var(--border-color)', 'var(--shadow-offset) var(--shadow-offset) 0 var(--accent)', 'var(--shadow-offset) var(--shadow-offset) 0 var(--paper)'],
    soft: [
      '0 calc(var(--shadow-offset) * 0.5) calc(var(--shadow-offset) * 2.5) color-mix(in oklab, var(--ink) 16%, transparent)',
      '0 calc(var(--shadow-offset) * 0.6) calc(var(--shadow-offset) * 3) color-mix(in oklab, var(--accent) 32%, transparent)',
      '0 calc(var(--shadow-offset) * 0.5) calc(var(--shadow-offset) * 2.5) color-mix(in oklab, #000 30%, transparent)',
    ],
    // A straight-down hard shadow, the "pressable" 3D button look.
    drop: ['0 var(--shadow-offset) 0 color-mix(in oklab, var(--border-color) 100%, transparent)', '0 var(--shadow-offset) 0 var(--accent-dark)', '0 var(--shadow-offset) 0 color-mix(in oklab, var(--paper) 40%, transparent)'],
    none: ['none', 'none', 'none'],
  }[shadow];
  const lines = [
    '/* Generated by `npm run brand:apply` from brand/brand.json. Edit the kit, not this file. */',
    fontFaces.trim(),
    ':root {',
    ...ROLES.map((r) => `  --${r.replaceAll('_', '-').replace('accent-secondary', 'accent-2').replace(/^border$/, 'border-color')}: ${p[r]};`),
    ...(kit.palette.extras ?? []).map((e) => `  --c-${e.name}: ${e.hex};`),
    ...(kit.palette.data ?? []).map((hex, i) => `  --data-${i + 1}: ${hex};`),
    '',
    `  --font-display: ${fontStack(t.display, 'sans')};`,
    `  --font-body: ${fontStack(t.body, 'sans')};`,
    `  --font-mono: ${fontStack(t.mono, 'mono')};`,
    `  --display-weight: ${t.display.weight ?? 700};`,
    `  --display-tracking: ${t.display.tracking ?? -0.03}em;`,
    `  --display-line: ${t.display.line_height ?? 1};`,
    `  --display-case: ${t.display.case ?? 'none'};`,
    `  --display-scale: ${t.display.scale ?? 1};`,
    `  --body-weight: ${t.body.weight ?? 400};`,
    `  --body-tracking: ${t.body.tracking ?? -0.01}em;`,
    `  --body-line: ${t.body.line_height ?? 1.45};`,
    '',
    `  --radius-base: ${s.radius ?? 16}px;`,
    `  --radius-button: ${s.button_shape === 'pill' ? '999px' : 'var(--radius)'};`,
    `  --border-base: ${s.border_width ?? 1}px;`,
    `  --shadow-offset-base: ${s.shadow_offset ?? 12}px;`,
    `  --shadow-card: ${shadows[0]};`,
    `  --shadow-focal: ${shadows[1]};`,
    `  --shadow-contrast: ${shadows[2]};`,
    `  --tilt: ${s.tilt ?? 0};`,
    // Emphasis: "color" = headline in ink, key phrase in accent. "contrast"
    // (monochrome brands) = headline muted, key phrase in full ink.
    `  --headline-color: ${s.emphasis === 'contrast' ? 'var(--ink-muted)' : 'currentColor'};`,
    `  --hl-color: ${s.emphasis === 'contrast' ? 'var(--ink)' : 'var(--accent)'};`,
    `  --headline-on-night: ${s.emphasis === 'contrast' ? 'color-mix(in oklab, var(--on-night) 58%, var(--night))' : 'var(--on-night)'};`,
    `  --hl-on-night: ${s.emphasis === 'contrast' ? 'var(--on-night)' : 'var(--accent-on-night)'};`,
    `  --density: ${DENSITY[s.density ?? 'balanced']};`,
    `  --ease: ${motion.ease};`,
    `  --ease-pop: ${motion.pop};`,
    `  --dur-enter: ${motion.enter}ms;`,
    `  --stagger: ${motion.stagger}ms;`,
    '}',
  ];
  const texture = {
    grain: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.5'/%3E%3C/svg%3E\")",
    dots: 'radial-gradient(color-mix(in oklab, currentColor 22%, transparent) 1.5px, transparent 1.6px) 0 0 / 28px 28px',
    lines: 'repeating-linear-gradient(0deg, color-mix(in oklab, currentColor 10%, transparent) 0 1px, transparent 1px 32px)',
  }[s.texture];
  if (texture) {
    lines.push('', '.slide::before {', "  content: '';", '  position: absolute;', '  inset: 0;', '  pointer-events: none;', `  background: ${texture};`, `  opacity: ${s.texture === 'grain' ? 0.08 : 1};`, '}');
  }
  return `${lines.filter((l, i) => l !== '' || lines[i - 1] !== '').join('\n')}\n`;
}

/** @font-face rules for fonts shipped as files in brand/fonts/. */
export function fontFaceCss(kit, relPrefix) {
  const out = [];
  for (const role of ['display', 'body', 'mono']) {
    const t = kit.typography[role];
    if (t?.source !== 'files') continue;
    for (const f of t.files) {
      const format = { woff2: 'woff2', woff: 'woff', ttf: 'truetype', otf: 'opentype' }[f.path.split('.').pop().toLowerCase()];
      out.push(`@font-face {\n  font-family: "${t.family}";\n  src: url("${relPrefix}${f.path}") format("${format}");\n  font-weight: ${f.weight ?? 400};\n  font-style: ${f.style ?? 'normal'};\n  font-display: swap;\n}`);
    }
  }
  return out.join('\n');
}

/** fonts.ts: imports for Fontsource packages. */
export function fontImports(kit) {
  const pkgs = [...new Set(['display', 'body', 'mono']
    .map((r) => kit.typography[r])
    .filter((t) => t?.source === 'fontsource')
    .map((t) => t.package))];
  return `// Generated by \`npm run brand:apply\`. Edit brand/brand.json instead.\n${pkgs.map((p) => `import '${p}';`).join('\n')}\nexport {};\n`;
}

/** assets.ts: URLs for the kit's logos and imagery, bundled with relative paths. */
export function assetModule(kit, relPrefix) {
  const imports = [];
  const logos = {};
  for (const [key, path] of Object.entries(kit.identity?.logos ?? {})) {
    if (!path) continue;
    const id = `logo_${key.replace(/[^a-z0-9]/gi, '_')}`;
    imports.push(`import ${id} from '${relPrefix}${path}?url';`);
    logos[key] = id;
  }
  const imagery = (kit.imagery ?? []).map((img, i) => {
    const id = `img_${i}`;
    imports.push(`import ${id} from '${relPrefix}${img.path}?url';`);
    return `  { url: ${id}, role: ${JSON.stringify(img.role ?? 'other')}, alt: ${JSON.stringify(img.alt ?? '')}, notes: ${JSON.stringify(img.notes ?? '')} },`;
  });
  return [
    '// Generated by `npm run brand:apply`. Edit brand/brand.json instead.',
    ...imports,
    '',
    `export const brandName = ${JSON.stringify(kit.identity?.name ?? '')};`,
    `export const wordmark = ${JSON.stringify(kit.identity?.wordmark ?? kit.identity?.name ?? '')};`,
    `export const logos: Record<string, string> = { ${Object.entries(logos).map(([k, v]) => `${JSON.stringify(k)}: ${v}`).join(', ')} };`,
    'export const imagery: { url: string; role: string; alt: string; notes: string }[] = [',
    ...imagery,
    '];',
    '',
  ].join('\n');
}
