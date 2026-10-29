// The email engine's pure parts: reading email/, brand tokens written out as literal
// values (mail clients ignore CSS variables), merge tags for the sender's email platform,
// and the MJML document the blocks become. MJML (pinned) turns it into table-based,
// inlined, Outlook-safe HTML; the checks are in checks.mjs.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { esc, fillTokens } from '../site/fill.mjs';

export const KINDS = ['campaign', 'newsletter', 'one-to-one'];
export const WIDTH = 600;
/** Merge tags for the platform the email goes out from; email.json "merge" overrides any of them. */
export const MERGE_PRESETS = {
  mailchimp: { unsubscribe: '*|UNSUB|*', address: '*|LIST:ADDRESSLINE|*', view_online: '*|ARCHIVE|*' },
  hubspot: { unsubscribe: '{{unsubscribe_link}}', address: '{{site_settings.company_street_address_1}}, {{site_settings.company_city}}', view_online: '{{view_as_page_url}}' },
  klaviyo: { unsubscribe: '{% unsubscribe_url %}', address: '{{ organization.full_address }}', view_online: '{{ web_view_url }}' },
};
const GENERIC = { sans: 'Helvetica, Arial, sans-serif', serif: 'Georgia, "Times New Roman", serif', mono: '"Courier New", Courier, monospace' };

/** A face's stack for mail: the brand family, then its brand-kit@2 fallback_stack or a generic one. */
export function fontStack(face, fallback = null) {
  const t = face ?? {};
  const generic = GENERIC[t.fallback] ?? GENERIC.sans;
  const rest = fallback ?? t.fallback_stack ?? generic;
  const family = t.family ? (/[\s\d]/.test(t.family) ? `'${t.family}'` : t.family) : null;
  return [family, rest].filter(Boolean).join(', ').replace(/"/g, "'");
}

/** Every hex color the brand names, by role and extra name. */
export function brandColors(kit) {
  const p = kit?.palette ?? {};
  const out = {};
  for (const [k, v] of Object.entries(p)) if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) out[k] = v.toLowerCase();
  for (const e of p.extras ?? []) if (e?.name && /^#[0-9a-f]{6}$/i.test(e.hex ?? '')) out[e.name] = e.hex.toLowerCase();
  return out;
}

/** {{color.x}} and {{font.x}}. Returns { text, missing }. */
export function brandTokens(text, { colors, fonts }) {
  const missing = [];
  const out = text
    .replace(/\{\{\s*color\.([\w-]+)\s*\}\}/g, (w, name) => colors[name] ?? (missing.push(`${w} (the kit has no hex color named ${name})`), w))
    .replace(/\{\{\s*font\.(display|body|mono)\s*\}\}/g, (w, role) => fonts[role]);
  return { text: out, missing };
}

/** [[name]] merge tags, last, so the platform's own {{ }} syntax never meets the token filler. */
export function mergeFill(text, merge) {
  const missing = [];
  const out = text.replace(/\[\[\s*([\w-]+)\s*\]\]/g, (w, name) => merge[name] ?? (missing.push(`${w} (no merge tag "${name}" for this platform)`), w));
  return { text: out, missing };
}

/** Everything under email/: the email's settings and its blocks in file-name order. */
export function loadEmail(root = '.') {
  const dir = join(root, 'email');
  if (!existsSync(join(dir, 'email.json'))) throw new Error('No email/email.json. Start one with npm run email:new.');
  const email = JSON.parse(readFileSync(join(dir, 'email.json'), 'utf8'));
  const blockDir = join(dir, 'blocks');
  const blocks = existsSync(blockDir) ? readdirSync(blockDir).filter((f) => f.endsWith('.mjml')).sort().map((f) => ({ file: `blocks/${f}`, mjml: readFileSync(join(blockDir, f), 'utf8') })) : [];
  return { dir, email, blocks };
}

/** The platform's merge tags, with the email's own overrides. */
export function mergeTags(email) {
  return { ...(MERGE_PRESETS[email.platform ?? 'mailchimp'] ?? {}), ...(email.merge ?? {}) };
}

/**
 * The MJML document: a head with the subject, preheader, fonts, brand defaults and the
 * dark-mode rules, then the blocks. Returns { mjml, missing }.
 */
export function mjmlDocument(loaded, brand) {
  const { email, blocks } = loaded;
  const kit = brand.kit;
  const colors = brandColors(kit);
  const fb = brand.email?.fallback ?? {};
  const fonts = { display: fontStack(kit.typography?.display, fb.display), body: fontStack(kit.typography?.body, fb.body), mono: fontStack(kit.typography?.mono, fb.mono) };
  const merge = mergeTags(email);
  const missing = [];
  const c = (role, alt) => colors[role] ?? colors[alt] ?? null;
  const paper = c('paper'), ink = c('ink'), accent = c('accent');
  const night = c('night', 'ink'), onNight = c('on_night', 'paper'), accentNight = c('accent_on_night', 'accent');
  const onAccent = c('on_accent', 'paper');
  for (const [name, v] of Object.entries({ paper, ink, accent })) if (!v) missing.push(`the kit's ${name} isn't a hex color`);
  const radius = Math.min(24, kit.style?.radius ?? 8);
  const fontLinks = Object.entries(email.fonts ?? {}).map(([name, href]) => `<mj-font name="${esc(name)}" href="${esc(href)}" />`).join('\n    ');
  const head = `<mj-head>
    <mj-title>${esc(email.subject ?? '')}</mj-title>
    <mj-preview>${esc(email.preheader ?? '')}</mj-preview>
    ${fontLinks}
    <mj-attributes>
      <mj-all font-family="${fonts.body}" />
      <mj-text color="${ink}" font-size="17px" line-height="1.55" padding="0 32px" />
      <mj-button background-color="${accent}" color="${onAccent}" font-family="${fonts.display}" font-weight="700" font-size="16px" border-radius="${radius}px" inner-padding="15px 28px" padding="0 32px" />
      <mj-section padding="0" />
      <mj-column padding="0" />
      <mj-divider border-color="${ink}" border-width="2px" padding="0 32px" />
    </mj-attributes>
    <mj-raw><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"></mj-raw>
    <mj-style>
      :root { color-scheme: light dark; supported-color-schemes: light dark; }
      @media (prefers-color-scheme: dark) {
        .em-paper, .em-paper > table, .em-paper > table > tbody > tr > td, body { background: ${night} !important; background-color: ${night} !important; }
        .em-ink div, .em-ink p, .em-ink li, .em-ink h1, .em-ink h2, .em-ink h3, .em-ink span, .em-ink a { color: ${onNight} !important; }
        .em-ink p[style*="border-top"] { border-top-color: ${onNight} !important; }
        .em-accent, .em-ink .em-accent, .em-accent div, .em-accent a { color: ${accentNight} !important; }
      }
    </mj-style>
  </mj-head>`;
  const body = blocks.map((b) => {
    const t = brandTokens(b.mjml.replace(/<!--[\s\S]*?-->/g, ''), { colors, fonts });
    const f = fillTokens(t.text, { facts: email.facts ?? {}, model: {} });
    const m = mergeFill(f.html, merge);
    for (const x of [...t.missing, ...f.missing, ...m.missing]) missing.push(`${b.file}: ${x}`);
    return m.text;
  }).join('\n');
  const mjml = `<mjml lang="${esc(email.lang ?? 'en')}">\n  ${head}\n  <mj-body width="${WIDTH}px" background-color="${paper}" css-class="em-paper">\n${body}\n  </mj-body>\n</mjml>\n`;
  return { mjml, missing, colors, fonts, merge };
}
