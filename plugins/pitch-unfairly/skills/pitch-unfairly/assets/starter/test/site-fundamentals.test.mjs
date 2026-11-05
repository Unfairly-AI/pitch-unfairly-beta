// The rendered-page fundamentals: one known violation per check, and a clean
// page that must stay quiet at laptop and phone widths.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { fundamentalsProblems } from '../bin/site/fundamentals.mjs';
import { stableLaunch } from '../bin/stable-shots.mjs';

const shell = (body, css = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>*{box-sizing:border-box} body{margin:0;font:17px/1.55 Arial,sans-serif;color:#1d1f24;background:#fff} main{padding:0 24px;max-width:1200px;margin:0 auto}
h1{font-size:56px;line-height:1.08;margin:64px 0 16px} h2{font-size:36px;line-height:1.15;margin:48px 0 12px} p{max-width:66ch;margin:0 0 16px} ${css}</style></head><body><main>${body}</main></body></html>`;
const PARA = 'Running text that a reader actually reads, set at a comfortable size and line length, long enough to wrap across a few lines so the checks have lines to count.';

let browser;
before(async () => { browser = await puppeteer.launch(stableLaunch()); });
after(async () => { await browser?.close(); });

async function run(html, { width = 1280, phone = false } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width, height: 900, isMobile: phone, hasTouch: phone, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  const r = await fundamentalsProblems(page, { phone });
  await page.close();
  return r;
}

test('ACCEPTANCE: a clean page passes at laptop and phone widths', async () => {
  const html = shell(`<section data-section="hero"><h1>Care that fits the week you have</h1><p>${PARA}</p><a href="#" style="display:inline-block;padding:12px 20px;background:#c2441f;color:#fff">Book a visit</a></section>
    <section data-section="plans"><h2>Plans for every team</h2><p>${PARA}</p><p style="color:#5a534b;font-size:15px">A caption in the muted ink, which passes on white.</p></section>`);
  for (const opts of [{ width: 1280 }, { width: 390, phone: true }]) {
    const r = await run(html, opts);
    assert.deepEqual(r.errors, [], `${opts.width}: ${r.errors.join('\n')}`);
    assert.deepEqual(r.warnings, [], `${opts.width}: ${r.warnings.join('\n')}`);
  }
});

test('ACCEPTANCE: text under 4.5:1 is an error, composited through a translucent panel, and text over a photo is skipped', async () => {
  const r = await run(shell(`<section data-section="a"><h1>Headline</h1>
    <p style="color:#9a9a9a">Pale grey running text on white fails AA for body copy at this size.</p>
    <div style="background:rgba(228,87,46,0.9);padding:16px"><a href="#" style="color:#fff;font-size:16px">White label on a light orange</a></div>
    <div style="background:url('data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22/>') #fff;padding:16px"><p style="color:#eee">Over a photo: not measured.</p></div></section>`));
  assert.ok(r.errors.some((e) => /#9a9a9a on #ffffff/.test(e)), r.errors.join('\n'));
  assert.ok(r.errors.some((e) => /#ffffff on #e65f38/i.test(e) || /White label/.test(e)), r.errors.join('\n'));
  assert.ok(!r.errors.some((e) => /Over a photo/.test(e)));
});

test('ACCEPTANCE: running text over 100 characters a line is an error; over 85 a warning', async () => {
  const wide = await run(shell(`<section data-section="a"><h1>Headline</h1><p style="max-width:none;width:1150px">${PARA} ${PARA} ${PARA}</p></section>`));
  assert.ok(wide.errors.some((e) => /characters a line/.test(e)), wide.errors.join('\n'));
  const mid = await run(shell(`<section data-section="a"><h1>Headline</h1><p style="max-width:none;width:700px">${PARA} ${PARA} ${PARA}</p></section>`));
  assert.ok(mid.warnings.some((e) => /characters a line/.test(e)) && !mid.errors.some((e) => /characters a line/.test(e)), mid.warnings.join('\n'));
});

test('ACCEPTANCE: running text under 14px on a phone is an error, 14px a warning, fine print exempt', async () => {
  const r = await run(shell(`<section data-section="a"><h1>Headline</h1><p style="font-size:13px">${PARA}</p></section>`), { width: 390, phone: true });
  assert.ok(r.errors.some((e) => /15px or larger/.test(e)), r.errors.join('\n'));
  const r14 = await run(shell(`<section data-section="a"><h1>Headline</h1><p style="font-size:14px">${PARA}</p><p class="fine" style="font-size:12px">${PARA}</p></section>`), { width: 390, phone: true });
  assert.deepEqual(r14.errors, []);
  assert.equal(r14.warnings.filter((w) => /15px or larger/.test(w)).length, 1, r14.warnings.join('\n'));
});

test('warns on a flat hierarchy, a heading nearer what precedes it, and a runt', async () => {
  const r = await run(shell(`<section data-section="flat"><h2 style="font-size:24px;font-weight:400">Two sizes that barely differ</h2><p style="font-size:22px">${PARA}</p></section>
    <section data-section="near"><p>${PARA}</p><h2 style="margin:4px 0 40px">A heading that floats</h2><p>${PARA}</p></section>
    <section data-section="stat"><h2>Results that hold</h2><p style="font-size:96px;line-height:1">83%</p><p>${PARA}</p></section>
    <section data-section="runt"><h1 style="width:620px;text-wrap:wrap">Plans that fit the week your team actually has now</h1><p>${PARA}</p></section>`));
  assert.ok(r.warnings.some((w) => /"flat" has no dominant headline/.test(w)), r.warnings.join('\n'));
  assert.ok(!r.warnings.some((w) => /"stat" has no dominant headline/.test(w)), 'a stat numeral is no rival headline');
  assert.ok(r.warnings.some((w) => /more space above a heading/.test(w)), r.warnings.join('\n'));
  assert.ok(r.warnings.some((w) => /alone on its last line/.test(w)), r.warnings.join('\n'));
});
