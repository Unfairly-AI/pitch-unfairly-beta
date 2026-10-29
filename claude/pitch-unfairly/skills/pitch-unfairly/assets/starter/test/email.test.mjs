import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import mjml2html from 'mjml';
import { brandColors, brandTokens, fontStack, loadEmail, mergeFill, mergeTags, mjmlDocument } from '../bin/email/compile.mjs';
import { CLIP_BYTES, emailChecks, emailText } from '../bin/email/checks.mjs';
import { emailEngineProblem } from '../bin/email/version.mjs';
import { resolveBrand } from '../bin/longform/brand.mjs';
import { allowedColors } from '../bin/collateral/rules.mjs';
import { scaffold } from '../bin/email-new.mjs';

const starter = join(dirname(fileURLToPath(import.meta.url)), '..');
const brand = resolveBrand(starter);
const kit = brand.kit;

function project() {
  const root = mkdtempSync(join(tmpdir(), 'email-'));
  cpSync(join(starter, 'brand'), join(root, 'brand'), { recursive: true });
  scaffold(root);
  return root;
}

const base = { engine: 'email@1.0', kind: 'campaign', subject: 'A clear subject line', preheader: 'The second reason to open it, in words the inbox shows.' };
const wrap = (inner) => `<!doctype html><html><head><title>x</title></head><body><div style="display:none">pre</div><div style="font-family: Sora, Helvetica, Arial, sans-serif; color:#1a1612">${inner}</div></body></html>`;
const merge = mergeTags({ platform: 'mailchimp' });
const footer = `<a href="${merge.unsubscribe}">Unsubscribe</a> ${merge.address}`;
const check = (inner, email = base, ctx = {}) => emailChecks(wrap(inner), email, { allowed: allowedColors(kit), merge, ...ctx });

test('brand tokens become literal colors and font stacks; merge tags fill last for the platform', () => {
  assert.equal(brandColors(kit).accent, '#c92a89');
  assert.equal(brandColors(kit).yellow, '#ffd866');
  assert.equal(fontStack({ family: 'DM Sans' }), "'DM Sans', Helvetica, Arial, sans-serif");
  assert.equal(fontStack({ family: 'Sora', fallback_stack: 'Arial, sans-serif' }), 'Sora, Arial, sans-serif');
  assert.equal(fontStack({ family: 'Lora', fallback: 'serif' }), 'Lora, Georgia, \'Times New Roman\', serif');
  const t = brandTokens('<x c="{{color.accent}}" f="{{font.body}}" n="{{color.nope}}">', { colors: brandColors(kit), fonts: { body: 'B' } });
  assert.equal(t.text, '<x c="#c92a89" f="B" n="{{color.nope}}">');
  assert.match(t.missing[0], /no hex color named nope/);
  assert.equal(mergeFill('<a href="[[unsubscribe]]">', mergeTags({ platform: 'hubspot' })).text, '<a href="{{unsubscribe_link}}">');
  assert.match(mergeFill('[[nope]]', merge).missing[0], /no merge tag "nope"/);
});

test('the static checks hold subject, preheader, size, compatibility, links, images, the way out, palette and voice', () => {
  assert.deepEqual(check(`<p>Read it.</p><a href="https://example.com">Go</a>${footer}`).problems, []);
  const long = check(footer, { ...base, subject: 'x'.repeat(61), preheader: 'short' }).problems.join('\n');
  assert.match(long, /subject is 61 characters/);
  assert.match(long, /preheader is 5 characters/);
  assert.match(check(`<p>${'a'.repeat(CLIP_BYTES)}</p>${footer}`).problems.join(), /Gmail clips/);
  assert.match(check(`<div style="display:flex">x</div>${footer}`).problems.join(), /flex and grid/);
  assert.match(check(`<img src="https://x.com/a.svg" alt="a" width="10">${footer}`).problems.join(), /SVG/);
  assert.match(check(`<p style="color:var(--ink)">x</p>${footer}`).problems.join(), /CSS variables/);
  assert.match(check(`<p style="font-family: Sora;">x</p>${footer}`).problems.join(), /no fallback/);
  assert.match(check(`<a href="/page">x</a>${footer}`).problems.join(), /absolute https/);
  assert.match(check(`<a href="https://review.pitchunfairly.com/a/b">x</a>${footer}`).problems.join(), /draft preview/);
  assert.match(check(`<img src="assets/a.png">${footer}`).problems.join('\n'), /isn't an absolute https[\s\S]*no alt text/);
  assert.match(check('<p>x</p>').problems.join('\n'), /no unsubscribe link[\s\S]*no postal address/);
  assert.deepEqual(check('<p>x</p><a href="https://a.com">a</a>', { ...base, kind: 'one-to-one' }).problems, []);
  assert.match(check(`<p style="color:#123456">x</p>${footer}`).problems.join(), /outside the brand palette: #123456/);
  assert.match(check(`<p>One thing — then another.</p>${footer}`).problems.join(), /em dash/);
  assert.match(check(`<p>We drive synergy.</p>${footer}`, base, { voice: { banned: ['synergy'] } }).problems.join(), /"synergy", which the brand's voice bans/);
  assert.match(emailEngineProblem('email@2.0'), /2\.x/);
});

test('the plain-text part keeps reading order and writes links out', () => {
  const text = emailText(wrap('<div>Hello there.</div><div><a href="https://a.com/x">Read it</a></div><p>Bye &amp; thanks</p>'));
  assert.equal(text, 'Hello there.\n\nRead it: https://a.com/x\n\nBye & thanks\n');
});

test('the example compiles through MJML to email-safe HTML in the brand, with dark-mode rules', async () => {
  const root = project();
  try {
    const doc = mjmlDocument(loadEmail(root), brand);
    assert.deepEqual(doc.missing, []);
    const { html, errors } = await mjml2html(doc.mjml, { validationLevel: 'soft' });
    assert.deepEqual(errors, []);
    assert.doesNotMatch(html, /<mj-/);
    assert.match(html, /#faf5eb/);
    assert.match(html, /prefers-color-scheme: dark/);
    assert.match(html, /\*\|UNSUB\|\*/);
    const r = emailChecks(html, loadEmail(root).email, { allowed: allowedColors(kit), merge: doc.merge });
    assert.deepEqual(r.problems, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ACCEPTANCE: an email builds to send-ready HTML and a plain-text part, rendered light, dark, inverted
// and images-off at desktop and phone widths, with a preview page that publishes.
test('ACCEPTANCE: email:build writes the email, its renders and the preview page, and holds the brand voice', { timeout: 240000 }, async () => {
  const root = project();
  const cwd = process.cwd();
  try {
    symlinkSync(join(starter, 'node_modules'), join(root, 'node_modules'));
    process.chdir(root);
    const { buildEmail, RENDERS } = await import('../bin/email-build.mjs');
    const report = await buildEmail({ root: '.', gate: false, log: () => {} });
    assert.deepEqual(report.problems, []);
    for (const f of ['email.html', 'email.txt', 'index.html', 'index.txt', 'download/email.html', 'download/email.txt']) assert.ok(existsSync(join('dist-email', f)), f);
    for (const r of RENDERS) assert.ok(existsSync(join('dist-email/renders', `${r.id}.png`)), r.id);
    assert.deepEqual(RENDERS.map((r) => r.id), ['desktop-light', 'desktop-dark', 'phone-light', 'phone-dark', 'phone-inverted', 'desktop-images-off']);
    const page = readFileSync('dist-email/index.html', 'utf8');
    assert.match(page, /data-cta="download_html" data-primary/);
    // Inline, because the content host won't let a page frame another of its own files.
    assert.match(page, /<iframe class="ep-frame" sandbox="[^"]*" srcdoc="&lt;!doctype html&gt;/);
    // A phrase the brand's voice bans fails the email.
    writeFileSync('email/blocks/02-story.mjml', readFileSync('email/blocks/02-story.mjml', 'utf8').replace('Write it for one reader', 'Unlock synergy for one reader'));
    const voiced = await buildEmail({ root: '.', htmlOnly: true, log: () => {} });
    assert.deepEqual(voiced.problems, []);
    const banned = (await import('../bin/email/checks.mjs')).emailChecks(readFileSync('dist-email/email.html', 'utf8'), JSON.parse(readFileSync('email/email.json', 'utf8')), { voice: { banned: ['synergy'] }, merge });
    assert.match(banned.problems.join(), /synergy/);
  } finally {
    process.chdir(cwd);
    rmSync(root, { recursive: true, force: true });
  }
});
