// Brand kit (brand/brand.json, schema brand-kit@1): validation and the
// generated files every slide reads from. Pure functions; brand-apply.mjs
// does the file and npm work. See the deck guide's brand-kit topic.

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

// The rich, optional sections (lockups, gradients, type roles, textures, graphic
// elements, messaging) for a kit filled from a full brand guide. A kit without
// them generates exactly what it did before they existed.
const KEBAB = /^[a-z][a-z0-9-]{0,30}$/;
const IMAGE_FILE = /\.(svg|png|jpe?g|webp|gif|avif)$/i;
const LOCKUP_BACKGROUNDS = ['light', 'dark', 'any'];
const GRADIENT_KINDS = ['linear', 'radial'];
const TYPE_FONTS = ['display', 'body', 'mono'];
const TYPE_STYLES = ['normal', 'italic'];
const TYPE_CASES = ['none', 'uppercase', 'lowercase'];
const TEXTURE_KINDS = ['background', 'accent'];
const BLENDS = ['normal', 'multiply', 'screen', 'overlay', 'soft-light'];
export const ELEMENT_KINDS = ['frame', 'bracket', 'bar-under', 'rule', 'stacked-word', 'sliced-word', 'knockout-word', 'other'];
const LIMITS = { extras: 24, rules: 40, lockups: 12, gradients: 12, applications: 12, roles: 12, textures: 24, elements: 20 };

/** The CSS token a palette role is written to (accent_secondary → --accent-2, border → --border-color). */
const roleToken = (role) => `--${role.replaceAll('_', '-').replace('accent-secondary', 'accent-2').replace(/^border$/, 'border-color')}`;

/**
 * A color field's CSS value: a hex as is, a palette role as its token, a
 * palette.extras name as var(--c-<name>). null when the ref names nothing.
 */
export function colorCss(ref, palette = {}) {
  if (typeof ref !== 'string') return null;
  if (HEX.test(ref)) return ref;
  if (ROLES.includes(ref)) return `var(${roleToken(ref)})`;
  if ((palette.extras ?? []).some((e) => e?.name === ref)) return `var(--c-${ref})`;
  return null;
}

/** A plain relative path inside brand/: no absolute path, backslash, or . / .. segment. */
const plainPath = (p) => typeof p === 'string' && p.length > 0 && !p.startsWith('/') && !/^[A-Za-z]:/.test(p) && !p.includes('\\')
  && p.split('/').every((s) => s && s !== '.' && s !== '..');

const isNum = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

function richErrors(kit) {
  const errors = [];
  const palette = kit?.palette ?? {};
  const text = (v, max, at, { required = false } = {}) => {
    if (v == null) { if (required) errors.push(`${at} is required`); return; }
    if (typeof v !== 'string') errors.push(`${at} must be text`);
    else if (required && !v.trim()) errors.push(`${at} is required`);
    else if (v.length > max) errors.push(`${at} is ${v.length} characters; the limit is ${max}`);
  };
  const oneOf = (v, list, at) => { if (v != null && !list.includes(v)) errors.push(`${at} must be ${list.join(', ')}`); };
  const range = (v, lo, hi, at) => { if (v != null && !isNum(v, lo, hi)) errors.push(`${at} must be a number from ${lo} to ${hi}`); };
  const color = (v, at) => { if (v != null && !colorCss(v, palette)) errors.push(`${at}: "${v}" is not a hex, a palette role, or a palette.extras name`); };
  const file = (v, at, { required = true } = {}) => {
    if (v == null) { if (required) errors.push(`${at} is required`); return; }
    if (!plainPath(v)) errors.push(`${at}: bad path ${v} (a relative path inside brand/)`);
    else if (!IMAGE_FILE.test(v)) errors.push(`${at}: ${v} must be an image (svg, png, jpg, webp, gif, avif)`);
  };
  const list = (v, max, at) => {
    if (v == null) return [];
    if (!Array.isArray(v)) { errors.push(`${at} must be a list`); return []; }
    if (v.length > max) errors.push(`${at} has ${v.length} entries; the limit is ${max}`);
    return v;
  };
  const named = (items, at) => {
    const seen = new Set();
    for (const [i, item] of items.entries()) {
      if (!KEBAB.test(item?.name ?? '')) errors.push(`${at}[${i}].name must be kebab-case (a-z, 0-9, -), up to 31 characters`);
      else if (seen.has(item.name)) errors.push(`${at}: the name "${item.name}" is used twice`);
      seen.add(item?.name);
    }
  };

  // palette.extras gain group and use; up to 24 of them.
  const extras = list(palette.extras, LIMITS.extras, 'palette.extras');
  for (const [i, e] of extras.entries()) {
    if (e?.group != null && !KEBAB.test(e.group)) errors.push(`palette.extras[${i}].group must be kebab-case`);
    text(e?.use, 200, `palette.extras[${i}].use`);
  }

  const lockups = list(kit?.identity?.lockups, LIMITS.lockups, 'identity.lockups');
  named(lockups, 'identity.lockups');
  for (const [i, l] of lockups.entries()) {
    file(l?.path, `identity.lockups[${i}].path`);
    oneOf(l?.background, LOCKUP_BACKGROUNDS, `identity.lockups[${i}].background`);
    text(l?.use, 300, `identity.lockups[${i}].use`);
  }

  const gradients = list(palette.gradients, LIMITS.gradients, 'palette.gradients');
  named(gradients, 'palette.gradients');
  for (const [i, g] of gradients.entries()) {
    const at = `palette.gradients[${i}]`;
    oneOf(g?.kind, GRADIENT_KINDS, `${at}.kind`);
    if (g?.angle != null && g.kind === 'radial') errors.push(`${at}.angle is for linear gradients only`);
    range(g?.angle, 0, 360, `${at}.angle`);
    if (!Array.isArray(g?.stops) || g.stops.length < 2 || g.stops.length > 6) errors.push(`${at}.stops needs 2 to 6 stops`);
    for (const [j, s] of (Array.isArray(g?.stops) ? g.stops : []).entries()) {
      if (s?.color == null) errors.push(`${at}.stops[${j}].color is required`);
      color(s?.color, `${at}.stops[${j}].color`);
      range(s?.at, 0, 100, `${at}.stops[${j}].at`);
    }
    text(g?.use, 300, `${at}.use`);
  }

  const applications = list(palette.applications, LIMITS.applications, 'palette.applications');
  for (const [i, a] of applications.entries()) {
    const at = `palette.applications[${i}]`;
    text(a?.name, 60, `${at}.name`, { required: true });
    for (const [j, c] of list(a?.colors, 8, `${at}.colors`).entries()) {
      if (c == null) errors.push(`${at}.colors[${j}] is empty`);
      color(c, `${at}.colors[${j}]`);
    }
    text(a?.notes, 400, `${at}.notes`);
  }

  const roles = kit?.typography?.roles;
  if (roles != null) {
    if (typeof roles !== 'object' || Array.isArray(roles)) errors.push('typography.roles must be an object keyed by role name');
    else {
      const keys = Object.keys(roles);
      if (keys.length > LIMITS.roles) errors.push(`typography.roles has ${keys.length} roles; the limit is ${LIMITS.roles}`);
      for (const key of keys) {
        const r = roles[key] ?? {};
        const at = `typography.roles.${key}`;
        if (!KEBAB.test(key)) errors.push(`typography.roles: "${key}" must be a kebab-case role name`);
        oneOf(r.font, TYPE_FONTS, `${at}.font`);
        const font = r.font ?? 'body';
        if (TYPE_FONTS.includes(font) && !kit?.typography?.[font]) errors.push(`${at}.font is "${font}", and the kit has no typography.${font}`);
        range(r.weight, 1, 1000, `${at}.weight`);
        oneOf(r.style, TYPE_STYLES, `${at}.style`);
        range(r.tracking, -0.2, 0.5, `${at}.tracking`);
        range(r.line_height, 0.6, 3, `${at}.line_height`);
        oneOf(r.case, TYPE_CASES, `${at}.case`);
        range(r.scale, 0.3, 4, `${at}.scale`);
        text(r.use, 200, `${at}.use`);
      }
    }
  }

  const textures = list(kit?.textures, LIMITS.textures, 'textures');
  named(textures, 'textures');
  for (const [i, t] of textures.entries()) {
    file(t?.path, `textures[${i}].path`);
    if (t?.kind == null) errors.push(`textures[${i}].kind is required (${TEXTURE_KINDS.join(' or ')})`);
    oneOf(t?.kind, TEXTURE_KINDS, `textures[${i}].kind`);
    color(t?.tint, `textures[${i}].tint`);
    oneOf(t?.blend, BLENDS, `textures[${i}].blend`);
    text(t?.use, 300, `textures[${i}].use`);
  }

  const textureNames = new Set(textures.map((t) => t?.name));
  const elements = list(kit?.elements, LIMITS.elements, 'elements');
  named(elements, 'elements');
  for (const [i, el] of elements.entries()) {
    const at = `elements[${i}]`;
    if (el?.kind == null) errors.push(`${at}.kind is required`);
    oneOf(el?.kind, ELEMENT_KINDS, `${at}.kind`);
    color(el?.color, `${at}.color`);
    range(el?.weight, 0, 64, `${at}.weight`);
    if (el?.texture != null && !textureNames.has(el.texture)) errors.push(`${at}.texture: "${el.texture}" is not one of the kit's textures`);
    text(el?.use, 400, `${at}.use`);
    file(el?.example, `${at}.example`, { required: false });
  }

  const m = kit?.messaging;
  if (m != null) {
    if (typeof m !== 'object' || Array.isArray(m)) errors.push('messaging must be an object');
    else {
      text(m.essence, 200, 'messaging.essence');
      for (const [i, t] of list(m.taglines, 12, 'messaging.taglines').entries()) text(t, 160, `messaging.taglines[${i}]`, { required: true });
      for (const [i, k] of list(m.key_messages, 12, 'messaging.key_messages').entries()) {
        text(k?.area, 60, `messaging.key_messages[${i}].area`, { required: true });
        text(k?.headline, 160, `messaging.key_messages[${i}].headline`, { required: true });
        text(k?.body, 800, `messaging.key_messages[${i}].body`);
      }
      for (const [i, a] of list(m.attributes, 24, 'messaging.attributes').entries()) text(a, 60, `messaging.attributes[${i}]`, { required: true });
    }
  }

  list(kit?.rules, LIMITS.rules, 'rules');
  return errors;
}

/**
 * Things worth a look that don't stop the kit: a type role asking for a weight or
 * style its font's files don't include (the browser synthesizes it), a
 * knockout-word with no texture to fill it.
 */
export function kitWarnings(kit) {
  const warnings = [];
  for (const [key, r] of Object.entries(kit?.typography?.roles ?? {})) {
    const t = kit?.typography?.[r?.font ?? 'body'];
    if (t?.source !== 'files' || !Array.isArray(t.files)) continue;
    const weight = r.weight ?? t.weight ?? 400;
    const style = r.style ?? 'normal';
    if (!t.files.some((f) => (f.weight ?? 400) === weight && (f.style ?? 'normal') === style)) {
      warnings.push(`typography.roles.${key} asks for ${t.family} ${weight} ${style}, which brand/fonts doesn't include; the browser will synthesize it`);
    }
  }
  for (const el of kit?.elements ?? []) {
    if (el?.kind === 'knockout-word' && !el.texture) warnings.push(`elements "${el.name}" is a knockout-word with no texture; it gets no CSS class until it names one`);
  }
  return warnings;
}

/**
 * What the brand hasn't defined yet, in brand-kit@2's terms (positioning,
 * messaging pillars and proof, voice, design treatments), each with the
 * question that fills it. A website capture measures looks; it can't know
 * these, so they're listed for a person or the Steal Brand shelf to fill,
 * never guessed. `seeds` are the site's own words that may help answer
 * (its meta descriptions); they are evidence, not answers.
 * Mirrors kitGaps in unfairly-app (src/lib/brand/brand-kit-v2.ts).
 */
export function brandGaps(kit, { seeds = [], unreviewed = [] } = {}) {
  const gaps = [];
  const add = (missing, field, ask, extra = {}) => { if (missing) gaps.push({ field, ask, ...extra }); };
  const p = kit?.positioning ?? {};
  const m = kit?.messaging ?? {};
  const v = kit?.voice;
  const voice = Array.isArray(v) ? { notes: v } : v ?? {};
  const seed = seeds.filter(Boolean).length ? { seeds: [...new Set(seeds.filter(Boolean))].slice(0, 4) } : {};
  add(!p.statement, 'positioning.statement', 'In one sentence: for whom is this the category that does what?', seed);
  add(!p.audience, 'positioning.audience', "Who is it for, in the brand's own words?");
  add(!p.category, 'positioning.category', 'What shelf does a buyer file it on?');
  add(!m.pillars?.length, 'messaging.pillars', 'What are the three or four things the brand always says, and the claim behind each?');
  add(!m.proof_points?.length, 'messaging.proof_points', 'What proves those claims (a customer, a number, a quote), and where does each come from?');
  add(!voice.tone?.length, 'voice.tone', 'Three to five words for how the brand sounds.');
  add(!voice.rules?.length && !voice.banned?.length, 'voice.rules', 'Words the brand never uses, words it prefers, and how long its sentences run.');
  // A treatment is a recipe (treatment@1), so the kit's prose is a seed for one, never the slot.
  const style = kit?.style ?? {};
  const prose = { photo_treatment: style.photo_treatment, illustration_style: style.illustration_style, motion: style.motion && !unreviewed.includes('style.motion') ? `motion: ${style.motion}` : null, layout_move: style.layout_notes };
  for (const slot of ['icon_style', 'illustration_style', 'photo_treatment', 'motion', 'layout_move']) {
    add(!kit?.design?.[slot] && !kit?.design?.system, `design.${slot}`, `Pick a ${slot.replace(/_/g, ' ')} from the Steal Design shelf, or write the brand's own as a recipe.`, prose[slot] ? { seed: prose[slot] } : {});
  }
  // Email and other outputs without SVG or web fonts.
  const email = (kit?.identity?.lockups ?? []).filter((l) => (Array.isArray(l.use) ? l.use : [l.use]).some((u) => /\bemail\b/.test(u ?? '')) && (l.format === 'png' || /\.png$/i.test(l.file ?? l.path ?? '')));
  add(!email.some((l) => (l.on ?? l.background) !== 'dark'), 'identity.lockups.email', 'A PNG logo at 2× for email on a light background.');
  add(!email.some((l) => (l.on ?? l.background) === 'dark'), 'identity.lockups.email_dark', 'A PNG logo at 2× for email in dark mode.');
  for (const face of ['display', 'body']) {
    const t = kit?.typography?.[face];
    add(!t?.fallback_stack, `typography.${face}.fallback_stack`, `The font stack email uses for ${face} text when ${t?.family ?? 'the brand font'} can't load (e.g. "Arial, Helvetica, sans-serif").`);
  }
  return gaps;
}

/** Every file under brand/ the kit names, for existence checks: [{ what, path }]. */
export function kitFilePaths(kit) {
  const out = [];
  for (const role of ['display', 'body', 'mono']) for (const f of kit?.typography?.[role]?.files ?? []) out.push({ what: 'font file', path: f.path });
  for (const [key, path] of Object.entries(kit?.identity?.logos ?? {})) if (path) out.push({ what: `logo ${key}`, path });
  for (const img of kit?.imagery ?? []) out.push({ what: 'image', path: img.path });
  for (const l of kit?.identity?.lockups ?? []) out.push({ what: `lockup ${l.name}`, path: l.path });
  for (const t of kit?.textures ?? []) out.push({ what: `texture ${t.name}`, path: t.path });
  for (const el of kit?.elements ?? []) if (el.example) out.push({ what: `element example ${el.name}`, path: el.example });
  return out;
}

/** Returns a list of problems; empty means the kit is usable. */
export function validateKit(kit) {
  const errors = [];
  if (!kit || kit.schema !== 'brand-kit@1') errors.push('schema must be "brand-kit@1"');
  const palette = kit?.palette ?? {};
  for (const role of REQUIRED_ROLES) if (!palette[role]) errors.push(`palette.${role} is required`);
  for (const role of ROLES) {
    if (palette[role] != null && !HEX.test(palette[role])) errors.push(`palette.${role} must be a hex color, got ${palette[role]}`);
  }
  for (const [i, extra] of (Array.isArray(palette.extras) ? palette.extras : []).entries()) {
    if (!/^[a-z][a-z0-9-]*$/.test(extra?.name ?? '') || !HEX.test(extra?.hex ?? '')) errors.push(`palette.extras[${i}] needs a kebab-case name and a hex`);
  }
  errors.push(...richErrors(kit));
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

/**
 * brand.css: the tokens every slide reads. relPrefix is how the stylesheet
 * reaches brand/ (texture files): '../../brand/' from src/brand/brand.css, 'brand/'
 * for a page that inlines the CSS next to a copied brand/ folder.
 */
export function brandCss(kit, fontFaces = '', relPrefix = '../../brand/') {
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
    ...ROLES.map((r) => `  ${roleToken(r)}: ${p[r]};`),
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
  lines.push(...richCss(kit, relPrefix));
  return `${lines.filter((l, i) => l !== '' || lines[i - 1] !== '').join('\n')}\n`;
}

/** The CSS class an element gets, or null for kinds described only in words and an example. */
export function elementClass(el) {
  if (['frame', 'bracket', 'bar-under', 'rule'].includes(el?.kind)) return `el-${el.name}`;
  if (el?.kind === 'knockout-word' && el.texture) return `el-${el.name}`;
  return null;
}

/** Gradients, type roles, textures, and graphic elements; nothing at all for a kit without them. */
function richCss(kit, relPrefix) {
  const palette = kit.palette ?? {};
  const c = (ref, fallback) => (ref != null ? colorCss(ref, palette) : null) ?? fallback;
  const vars = [];
  const rules = [];

  for (const g of palette.gradients ?? []) {
    const stops = g.stops.map((st) => `${c(st.color)}${st.at != null ? ` ${st.at}%` : ''}`).join(', ');
    vars.push((g.kind ?? 'linear') === 'radial'
      ? `  --g-${g.name}: radial-gradient(circle, ${stops});`
      : `  --g-${g.name}: linear-gradient(${g.angle != null ? `${g.angle}deg, ` : ''}${stops});`);
  }

  for (const [role, r] of Object.entries(kit.typography?.roles ?? {})) {
    const v = `--type-${role}`;
    const props = [`  font-family: var(${v}-font);`];
    vars.push(`  ${v}-font: var(--font-${r.font ?? 'body'});`);
    const set = (key, value, prop, css = `var(${v}-${key})`) => {
      if (value == null) return;
      vars.push(`  ${v}-${key}: ${value};`);
      props.push(`  ${prop}: ${css};`);
    };
    set('weight', r.weight, 'font-weight');
    set('style', r.style, 'font-style');
    set('tracking', r.tracking != null ? `${r.tracking}em` : null, 'letter-spacing');
    set('line', r.line_height, 'line-height');
    set('case', r.case, 'text-transform');
    set('scale', r.scale, 'font-size', `calc(1em * var(${v}-scale))`);
    rules.push('', `.type-${role} {`, ...props, '}');
  }

  for (const t of kit.textures ?? []) vars.push(`  --tex-${t.name}: url("${relPrefix}${t.path}");`);

  for (const el of kit.elements ?? []) {
    const cls = elementClass(el);
    if (!cls) continue;
    const sel = `.${cls}`;
    if (el.kind === 'frame') {
      rules.push('', `${sel} {`, `  border: ${el.weight ?? 12}px solid ${c(el.color, 'var(--accent)')};`, '}');
    } else if (el.kind === 'bracket') {
      const w = `${el.weight ?? 2}px`;
      rules.push('', `${sel} {`, '  position: relative;', '  padding-inline: 0.9em;', '}',
        '', `${sel}::before, ${sel}::after {`, "  content: '';", '  position: absolute;', '  top: 0;', '  bottom: 0;', '  width: 0.6em;',
        `  border: 0 solid ${c(el.color, 'var(--accent)')};`, '  pointer-events: none;', '}',
        '', `${sel}::before {`, '  left: 0;', `  border-left-width: ${w};`, `  border-top-width: ${w};`, `  border-bottom-width: ${w};`, '}',
        '', `${sel}::after {`, '  right: 0;', `  border-right-width: ${w};`, `  border-top-width: ${w};`, `  border-bottom-width: ${w};`, '}');
    } else if (el.kind === 'bar-under') {
      // weight, when set, is the bar's height as a percent of the line.
      const top = el.weight != null ? 100 - el.weight : 58;
      rules.push('', `${sel} {`, `  background: linear-gradient(transparent ${top}%, ${c(el.color, 'var(--highlight)')} ${top}%) no-repeat;`,
        '  box-decoration-break: clone;', '  -webkit-box-decoration-break: clone;', '  padding-inline: 0.08em;', '}');
    } else if (el.kind === 'rule') {
      rules.push('', `${sel} {`, '  border: 0;', `  border-top: ${el.weight ?? 2}px solid ${c(el.color, 'var(--border-color)')};`, '}');
    } else if (el.kind === 'knockout-word') {
      rules.push('', `${sel} {`, `  color: ${c(el.color, 'var(--ink)')};`, '}',
        '', '@supports (-webkit-background-clip: text) or (background-clip: text) {', `  ${sel} {`,
        `    background: var(--tex-${el.texture}) center / cover;`, '    -webkit-background-clip: text;', '    background-clip: text;', '    color: transparent;',
        // Fills the letters even on .display, whose color the deck sets after the brand CSS.
        '    -webkit-text-fill-color: transparent;', '  }', '}');
    }
  }

  return [...(vars.length ? ['', ':root {', ...vars, '}'] : []), ...rules];
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
  const j = JSON.stringify;
  const lockups = (kit.identity?.lockups ?? []).map((l, i) => {
    imports.push(`import lockup_${i} from '${relPrefix}${l.path}?url';`);
    return `  { name: ${j(l.name)}, url: lockup_${i}, background: ${j(l.background ?? 'any')}, use: ${j(l.use ?? '')} },`;
  });
  const textures = (kit.textures ?? []).map((t, i) => {
    imports.push(`import tex_${i} from '${relPrefix}${t.path}?url';`);
    const tint = t.tint != null ? colorCss(t.tint, kit.palette) : null;
    return `  { name: ${j(t.name)}, url: tex_${i}, kind: ${j(t.kind)}, tint: ${j(tint)}, blend: ${j(t.blend ?? 'normal')}, use: ${j(t.use ?? '')} },`;
  });
  const elements = (kit.elements ?? []).map((el, i) => {
    if (el.example) imports.push(`import el_${i} from '${relPrefix}${el.example}?url';`);
    return `  { name: ${j(el.name)}, kind: ${j(el.kind)}, className: ${j(elementClass(el))}, use: ${j(el.use ?? '')}, example: ${el.example ? `el_${i}` : 'null'} },`;
  });
  const m = kit.messaging ?? {};
  const messaging = {
    essence: m.essence ?? '',
    taglines: m.taglines ?? [],
    key_messages: (m.key_messages ?? []).map((k) => ({ area: k.area, headline: k.headline, body: k.body ?? '' })),
    attributes: m.attributes ?? [],
  };
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
    // The rich sections, empty for a kit filled from a website.
    'export const lockups: { name: string; url: string; background: string; use: string }[] = [',
    ...lockups,
    '];',
    'export const textures: { name: string; url: string; kind: string; tint: string | null; blend: string; use: string }[] = [',
    ...textures,
    '];',
    'export const elements: { name: string; kind: string; className: string | null; use: string; example: string | null }[] = [',
    ...elements,
    '];',
    `export const typeRoles: string[] = ${j(Object.keys(kit.typography?.roles ?? {}))};`,
    `export const gradients: string[] = ${j((kit.palette?.gradients ?? []).map((g) => g.name))};`,
    `export const messaging: { essence: string; taglines: string[]; key_messages: { area: string; headline: string; body: string }[]; attributes: string[] } = ${j(messaging)};`,
    '',
  ].join('\n');
}
