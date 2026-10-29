// The email checks that read the built HTML and the email's settings, no browser:
// size, subject and preheader, client compatibility, links, images, merge tags,
// brand colors, and the copy rules (the sites engine's, plus the brand's voice).
import { copyFindings } from '../site/copy.mjs';
import { sourceBanned } from '../site/banned.mjs';
import { decodeEntities, htmlToText } from '../site/text.mjs';
import { KINDS } from './compile.mjs';
import { emailEngineProblem } from './version.mjs';

/** Gmail clips a message whose HTML passes 102 KB; warn from 90. */
export const CLIP_BYTES = 102 * 1024;
export const CLIP_WARN = 90 * 1024;
export const SUBJECT_MAX = 60;
export const PREHEADER = { min: 40, max: 110 };

/**
 * What mail clients drop, and so what a design may not depend on. A pinned reading of
 * caniemail.com for Gmail (web and app), Outlook 2016–365 for Windows, Outlook.com,
 * Apple Mail and iOS Mail.
 */
export const COMPAT = [
  { id: 'flex-grid', re: /display\s*:\s*(?:inline-)?(?:flex|grid)\b/i, why: 'flex and grid layouts (Outlook for Windows and some Gmail views ignore them): lay it out with mj-section and mj-column' },
  { id: 'position', re: /position\s*:\s*(?:absolute|fixed|sticky)\b/i, why: 'positioned elements (Gmail strips position)' },
  { id: 'css-var', re: /var\(--/i, why: 'CSS variables (Gmail and Outlook ignore them): write the color out, or use a {{color.role}} token' },
  { id: 'svg', re: /<svg\b|<img\b[^>]*\bsrc\s*=\s*["'][^"']+\.svg(?:[?#][^"']*)?["']/i, why: 'SVG (Gmail and Outlook don\'t render it): use a PNG at 2×' },
  { id: 'web-font-only', re: /font-family\s*:\s*(?:'[^']+'|"[^"]+"|[\w -]+)\s*(?:;|"|$)/im, why: 'a font with no fallback (most mail apps don\'t load web fonts): end every stack with a system font and a generic family' },
  { id: 'background-image', re: /background(?:-image)?\s*:[^;"]*url\(/i, why: 'a background image (Outlook for Windows drops it): use an <img>, or a solid background-color behind live text' },
  { id: 'form', re: /<(?:form|input|select|textarea|video|iframe|script)\b/i, why: 'forms, video, frames and scripts (mail apps strip them)' },
];

const plainText = (html) => htmlToText(html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<head[\s\S]*?<\/head>/i, '')).replace(/\s+/g, ' ').trim();
const hexes = (html) => [...new Set([...html.matchAll(/#[0-9a-f]{6}\b/gi)].map((m) => m[0].toLowerCase()))];

/**
 * html: the built email. email: email.json. ctx: { allowed (Set of hex), entries (banned list),
 * voice: { banned }, merge }. Returns { problems, warnings }.
 */
export function emailChecks(html, email, { allowed = null, entries = [], voice = {}, merge = {} } = {}) {
  const problems = [];
  const warnings = [];
  const pin = emailEngineProblem(email.engine);
  if (pin) problems.push(pin);
  if (!KINDS.includes(email.kind)) problems.push(`email.json "kind" is ${JSON.stringify(email.kind)}; use ${KINDS.join(', ')}`);

  // Subject and preheader: what the inbox shows before anyone opens it.
  const subject = String(email.subject ?? '').trim();
  const pre = String(email.preheader ?? '').trim();
  if (!subject) problems.push('no subject');
  else if (subject.length > SUBJECT_MAX) problems.push(`the subject is ${subject.length} characters; phones cut it near ${SUBJECT_MAX}: "${subject}"`);
  if (!pre) problems.push('no preheader: the inbox shows the first words of the email instead');
  else if (pre.length < PREHEADER.min || pre.length > PREHEADER.max) problems.push(`the preheader is ${pre.length} characters; keep it between ${PREHEADER.min} and ${PREHEADER.max}`);
  const bodyText = plainText(html.replace(/<div[^>]*display:none[^>]*>[\s\S]*?<\/div>/i, ''));
  if (pre && bodyText.toLowerCase().startsWith(pre.toLowerCase().slice(0, 30))) problems.push('the preheader repeats the email\'s first line: give the inbox a second reason to open it');

  // Size: Gmail clips the rest behind "View entire message", footer and unsubscribe included.
  const bytes = Buffer.byteLength(html);
  if (bytes > CLIP_BYTES) problems.push(`the HTML is ${(bytes / 1024).toFixed(0)} KB; Gmail clips anything over 102 KB`);
  else if (bytes > CLIP_WARN) warnings.push(`the HTML is ${(bytes / 1024).toFixed(0)} KB, close to Gmail's 102 KB clip`);

  // What mail clients drop. MJML's own output passes; this catches what a block adds.
  const body = html.replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '');
  for (const rule of COMPAT) {
    const m = rule.re.exec(body);
    if (m) problems.push(`uses ${rule.why} ("${m[0].slice(0, 60)}")`);
  }

  // Links: absolute, https, never to a draft, and a CTA to count.
  const links = [...html.matchAll(/<a\b[^>]*\bhref\s*=\s*"([^"]*)"/gi)].map((m) => m[1]);
  const mergeValues = Object.values(merge);
  for (const href of links) {
    if (mergeValues.includes(href)) continue;
    if (/^(?:mailto:|tel:)/i.test(href)) continue;
    if (!/^https:\/\//i.test(href)) problems.push(`the link "${href.slice(0, 60)}" isn't an absolute https address; mail has no page to be relative to`);
    else if (/review\.pitchunfairly\.com|[?&]preview=1/i.test(href)) problems.push(`the link ${href} is a draft preview, which the reader can't open`);
  }
  if (!links.some((h) => /^https:/i.test(h))) warnings.push('the email has no link to act on');

  // Images: hosted, sized, described.
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const src = /\bsrc\s*=\s*"([^"]*)"/i.exec(tag)?.[1] ?? '';
    if (!/^https:\/\//i.test(src)) problems.push(`the image ${src || '(no src)'} isn't an absolute https address: host it where it won't move (not on a deck link, which serves only its current version)`);
    if (!/\balt\s*=\s*"/i.test(tag)) problems.push(`the image ${src} has no alt text, so it reads as nothing with images off`);
    if (!/\bwidth\s*=\s*"\d+/i.test(tag)) warnings.push(`the image ${src} has no width attribute; Outlook shows it at its full size`);
  }

  // A campaign or newsletter needs a way out and the sender's postal address (CAN-SPAM, CASL).
  if (email.kind !== 'one-to-one') {
    if (!merge.unsubscribe || !html.includes(merge.unsubscribe)) problems.push('no unsubscribe link: put [[unsubscribe]] in the footer');
    if (!merge.address || !html.includes(merge.address)) problems.push('no postal address: put [[address]] in the footer (the platform fills in the sender\'s address)');
  }

  // Brand colors only.
  if (allowed) {
    const off = hexes(body).filter((h) => !allowed.has(h));
    if (off.length) problems.push(`colors outside the brand palette: ${off.join(', ')}. Use {{color.role}} tokens, or list a ground in email.json "neutrals"`);
  }

  // The copy rules every engine holds, and the brand's own voice.
  const copy = copyFindings(html.replace(/<head[\s\S]*?<\/head>/i, ''));
  problems.push(...copy.blocking, ...copy.strict);
  warnings.push(...copy.advisory);
  for (const b of sourceBanned([{ name: 'email.html', kind: 'html', text: body }], entries)) (b.severity === 'error' ? problems : warnings).push(b.message);
  const words = `${subject} ${pre} ${bodyText}`.toLowerCase();
  for (const phrase of voice.banned ?? []) if (phrase && words.includes(String(phrase).toLowerCase())) problems.push(`says "${phrase}", which the brand's voice bans`);
  return { problems: [...new Set(problems)], warnings: [...new Set(warnings)] };
}

/** The plain-text part: the body's words in reading order, one block per paragraph, links written out. */
export function emailText(html) {
  const t = html
    .replace(/<!doctype[^>]*>/i, '')
    .replace(/<head[\s\S]*?<\/head>/i, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<div[^>]*display:none[^>]*>[\s\S]*?<\/div>/i, '')
    .replace(/<a\b[^>]*\bhref\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (m, href, inner) => {
      const label = inner.replace(/<[^>]+>/g, '').trim();
      return /^(?:mailto:|tel:)/.test(href) || label === href ? label : `${label}: ${href}`;
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|h[1-6]|li|tr|table|td)>/gi, '\n\n')
    .replace(/<[^>]+>/g, '');
  const lines = decodeEntities(t).split('\n').map((l) => l.replace(/[ \t\u00a0]+/g, ' ').trim());
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}
