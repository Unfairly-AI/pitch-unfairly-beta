// Locked variants of the site toolbox's components.
//
// While a site is being built it uses the live toolbox (site/toolbox.css). Once it
// goes to production, each component it uses becomes a variant locked at that engine
// version: that component's rules (with its phone and PDF rules) exactly as they were,
// then the site's own skin for it. Later toolbox changes never reach the site until
// someone upgrades that one variant on purpose. A variants folder holds
// <component>.css per component plus variants.json, and the build reads only it.
//
// The same folder shape serves a proposal kit (site/variants in the kit) and a site
// built from the starter (site/variants in the project).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Which component owns a class. Anything not listed (tb-band, tb-wrap, tb-eyebrow,
// tb-h2, tb-btn, tb-table, the tones, the tokens…) is the shared base every variant
// sits on. Order matters where names look alike: the price's tb-step-b before the
// timeline's tb-step; tabs are named exactly so tb-table stays in the base.
export const OWNER = [
  [/^tb-(hero|for)\b/, 'hero'], [/^tb-(glance|g)\b/, 'glance'], [/^tb-split\b|^tb-bar(s|-row|-top|-track)\b/, 'split'],
  [/^tb-(cards?|card-n|icon)\b/, 'cards'], [/^tb-(calc|answer|presets?|hbar|seg|slider|flag|choice)\b/, 'calculator'],
  [/^tb-(compare|rec|yes|no)\b/, 'compare'], [/^tb-vs\b/, 'versus'], [/^tb-stats?\b/, 'stats'],
  [/^tb-(pull|quotes?|who|mono)\b/, 'quotes'], [/^tb-(price|build|stepper|step-b)\b/, 'price'], [/^tb-(timeline|step|today|now|was)\b/, 'timeline'],
  [/^tb-(faq|qa)\b/, 'faq'], [/^tb-(close|contact)\b/, 'close'], [/^tb-(viewers?)\b/, 'viewers'],
  [/^tb-(top|nav|brand)\b/, 'header'], [/^tb-(sample|sb)\b/, 'sample'], [/^tb-statement\b/, 'statement'],
  [/^tb-heard\b/, 'heard'], [/^tb-scope\b/, 'scope'], [/^tb-tiers?\b/, 'tiers'], [/^tb-(team|person)\b/, 'team'],
  [/^tb-(tabs|tablist|tab|tab-ic|tab-k|tab-t|tabpanels|tabpanel|tabpanel-k|tabpanel-foot)$/, 'tabs'], [/^tb-ticks\b/, 'ticks'], [/^tb-footer\b/, 'footer'],
];

/** The component a selector belongs to. `extra` maps a site's own classes or section ids to the variant they dress. */
export function ownerOf(selector, extra = []) {
  const owners = new Set();
  for (const [, cls] of selector.matchAll(/[.#]([\w-]+)/g)) {
    const hit = [...OWNER, ...extra].find(([re]) => re.test(cls));
    if (hit) owners.add(hit[1]);
  }
  return owners.size ? [...owners].sort()[0] : 'base';
}

/** Top-level CSS blocks, brace-aware: [{ kind: 'rule', sel, body } | { kind: 'at', head, blocks } | { kind: 'raw', text }]. */
export function parseCss(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    const semi = css.indexOf(';', i);
    if (open < 0) break;
    if (semi >= 0 && semi < open && css.slice(i, semi).trim().startsWith('@')) { out.push({ kind: 'raw', text: css.slice(i, semi + 1).trim() }); i = semi + 1; continue; }
    const head = css.slice(i, open).trim();
    let depth = 1, j = open + 1;
    while (j < css.length && depth) { if (css[j] === '{') depth++; else if (css[j] === '}') depth--; j++; }
    const body = css.slice(open + 1, j - 1);
    if (head.startsWith('@media') || head.startsWith('@supports')) out.push({ kind: 'at', head, blocks: parseCss(body) });
    else out.push({ kind: 'rule', sel: head, body: body.trim() });
    i = j;
  }
  return out;
}

/** Splits toolbox CSS by component: { base: css, faq: css, … }, each with its own media and PDF rules. */
export function sliceToolbox(css, extra = []) {
  const parts = {};
  const add = (owner, text, at) => ((parts[owner] ??= []).push(at ? { at, text } : { text }));
  const walk = (blocks, at) => {
    for (const b of blocks) {
      if (b.kind === 'raw') add('base', b.text, at);
      else if (b.kind === 'at') walk(b.blocks, at ? `${at} ${b.head}` : b.head);
      else if (b.sel.startsWith('@')) add('base', `${b.sel} { ${b.body} }`, at);
      else {
        // A selector list that names several components is split, so each keeps its own share.
        const groups = {};
        for (const s of b.sel.split(/,(?![^(]*\))/).map((x) => x.trim())) (groups[ownerOf(s, extra)] ??= []).push(s);
        for (const [owner, sels] of Object.entries(groups)) add(owner, `${sels.join(', ')} { ${b.body} }`, at);
      }
    }
  };
  walk(parseCss(css));
  const out = {};
  for (const [owner, items] of Object.entries(parts)) {
    const lines = [];
    let open = null;
    for (const { at, text } of items) {
      if (at !== open) { if (open) lines.push('}'); if (at) lines.push(`${at} {`); open = at ?? null; }
      lines.push(at ? `  ${text}` : text);
    }
    if (open) lines.push('}');
    out[owner] = `${lines.join('\n')}\n`;
  }
  return out;
}

export const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
export const SKIN = '/* ── This site\'s skin on this variant (kept on upgrade) ── */';
// Mainstay's kit, the first to lock, wrote its own marker; read either.
const SKIN_MARKERS = [SKIN, '/* ── Mainstay\'s skin on this variant (kept on upgrade) ── */'];
const splitSkin = (text) => {
  for (const m of SKIN_MARKERS) if (text.includes(m)) return [text.slice(0, text.indexOf(m)), text.slice(text.indexOf(m) + m.length).replace(/^\n/, '')];
  return [text, ''];
};

export const readManifest = (dir) => {
  const file = join(dir, 'variants.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { $comment: '', components: {} };
};
export const isLocked = (dir) => existsSync(join(dir, 'variants.json'));

function header(component, version, slice) {
  return `/* Variant of the sites toolbox "${component}" component, locked from engine ${version} (upstream ${sha(slice)}).
   Toolbox changes after ${version} don't reach it. npm run site:variants -- status shows what changed upstream;
   npm run site:variants -- upgrade ${component} re-locks it, keeping the skin below. */\n`;
}

/** Writes (or re-locks) one variant in dir: its upstream slice at `version`, then the skin already in the file (or `skin`). */
export function lockVariant(dir, component, slices, version, skin = null) {
  const file = join(dir, `${component}.css`);
  const kept = skin ?? (existsSync(file) ? splitSkin(readFileSync(file, 'utf8'))[1] : '');
  const slice = slices[component] ?? '';
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, `${header(component, version, slice)}${slice}\n${SKIN}\n${kept}`);
  const m = readManifest(dir);
  m.$comment = 'Each component this site uses is a variant locked at the engine version shown. The build reads only this folder: base.css first, then each component in this order.';
  m.components[component] = { from: version, upstream: sha(slice), locked: new Date().toISOString().slice(0, 10) };
  writeFileSync(join(dir, 'variants.json'), `${JSON.stringify(m, null, 2)}\n`);
}

/** The CSS a locked site loads: base first, then the components in manifest order. */
export function variantCss(dir) {
  const m = readManifest(dir);
  const names = ['base', ...Object.keys(m.components).filter((c) => c !== 'base')];
  return names.filter((c) => existsSync(join(dir, `${c}.css`))).map((c) => readFileSync(join(dir, `${c}.css`), 'utf8')).join('\n');
}

/** Each variant against a toolbox: { component, from, upstream (at lock), current (in that toolbox), changed }. */
export function status(dir, toolboxCss) {
  const slices = sliceToolbox(toolboxCss);
  return Object.entries(readManifest(dir).components).map(([c, v]) => {
    const current = sha(slices[c] ?? '');
    return { component: c, from: v.from, upstream: v.upstream, current, changed: current !== v.upstream };
  });
}

/** The toolbox components an HTML string uses, by the classes it carries (never 'base'). */
export function componentsIn(html) {
  const used = new Set();
  for (const [, list] of html.matchAll(/class="([^"]+)"/g)) for (const c of list.split(/\s+/)) if (c.startsWith('tb-')) used.add(ownerOf(`.${c}`));
  used.delete('base');
  return [...used].sort();
}
