// Interactive slides in their live state: what ?pdf=1 never shows.
//
// The static render (stage screenshots, the PDF, the audit's stage pass, the
// design review) sets html.is-static, which hides a slide's controls: the
// slider handle, the "Drag to compare" pill, the tabs. So a control that is
// broken only when it runs ships unseen (Metaview / Halvorsen deck, Nov 2026:
// `.compare::after` was declared twice, `top: 120px` in one rule and
// `bottom: 48px` in the other, so the pill stretched into a tall white column
// over the scorecard, and the handle rested at 4% so "Today" barely showed).
//
// For every slide with a control, on the live 1920x1080 deck with motion on:
//   start    the first frame after the slide enters
//   settled  once its entrance has finished and it stops changing
//   after    after a scripted drag (a range) or click (a button or tab)
// and checks each state: an overlay or label covering the slide's text, a
// short label stretched far past its text (both top and bottom set), a
// control off the slide, a compare slider resting at its very edge, and a
// control that changes nothing.

/** What counts as a control on a slide. The deck's own nav sits outside every slide. */
export const CONTROLS = 'input:not([type="hidden"]), button, select, textarea, [role="slider"], [role="tab"], [role="button"], [role="switch"], [draggable="true"], [data-interactive]';

/** The live states, in order, and the screenshot suffix for each: artifacts/live/<NN-id>--<state>.png. */
export const STATES = ['start', 'settled', 'after'];

// Deck chrome (slide counter, arrows, notes) sits over the slides; it isn't part of one.
const HIDE_CHROME = '.deck-nav, .deck-notes, astro-dev-toolbar { display: none !important; }';

/**
 * In the page: the live-state problems of one slide (by id), as strings.
 * Serializable for page.evaluate; reads only the DOM and computed styles.
 */
export function liveProblems(id, controls) {
  const slide = document.getElementById(id);
  if (!slide) return [`${id}: slide not found`];
  const issues = [];
  const box = slide.getBoundingClientRect();
  const scale = box.width / 1920 || 1;
  const px = (v) => Math.round(v / scale);
  const short = (s) => s.replace(/\s+/g, ' ').trim().slice(0, 40);
  const parse = (c) => {
    const m = /rgba?\(([^)]+)\)/.exec(c || '');
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r, g, b, a };
  };
  const shown = (el) => {
    for (let e = el; e && e !== slide.parentElement; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden') return false;
    }
    return true;
  };
  const opacityOf = (el) => {
    let o = 1;
    for (let e = el; e && e !== slide.parentElement; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
    return o;
  };
  const lineHeight = (s) => (s.lineHeight === 'normal' ? 1.2 * parseFloat(s.fontSize) : parseFloat(s.lineHeight));
  const chrome = (s) => ['Top', 'Bottom'].reduce((n, side) => n + parseFloat(s[`padding${side}`]) + parseFloat(s[`border${side}Width`]), 0);

  // Labels: positioned boxes holding a few words (a pill, a tag, a caption),
  // as elements and as ::before/::after with generated text.
  const labels = [];
  for (const el of slide.querySelectorAll('*')) {
    if (!shown(el) || el.closest('svg')) continue;
    const s = getComputedStyle(el);
    const host = el.getBoundingClientRect();
    if (['absolute', 'fixed'].includes(s.position)) {
      // Its own words: a box that only frames a child (a highlight around a numbered dot) is not a label.
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      const text = short(el.innerText || '');
      if (own && text && text.length <= 40 && !el.querySelector('img, svg, video, canvas, picture')) {
        labels.push({ text, style: s, rect: host, el, pseudo: '' });
      }
    }
    for (const pseudo of ['::before', '::after']) {
      const p = getComputedStyle(el, pseudo);
      if (!/^["']/.test(p.content) || !['absolute', 'fixed'].includes(p.position) || p.display === 'none') continue;
      let text = p.content.replace(/^["']|["']$/g, '');
      const attr = /^attr\(([^)]+)\)$/.exec(p.content);
      if (attr) text = el.getAttribute(attr[1]) || '';
      text = short(text);
      if (!text) continue;
      // A positioned pseudo-element's box: its containing block is the host
      // (when the host is positioned); top/left resolve to used pixels.
      const width = parseFloat(p.width);
      const height = parseFloat(p.height);
      if (!(width > 0 && height > 0)) continue;
      let rect = null;
      if (s.position !== 'static') {
        const left = host.left + parseFloat(s.borderLeftWidth) * scale + parseFloat(p.left) * scale;
        const top = host.top + parseFloat(s.borderTopWidth) * scale + parseFloat(p.top) * scale;
        const sizing = p.boxSizing === 'border-box' ? 0 : 1;
        const w = (width + sizing * (parseFloat(p.paddingLeft) + parseFloat(p.paddingRight) + parseFloat(p.borderLeftWidth) + parseFloat(p.borderRightWidth))) * scale;
        const h = (height + sizing * chrome(p)) * scale;
        // A translate (the usual centering trick) moves the box after layout.
        const m = /matrix\(([^)]+)\)/.exec(p.transform);
        const [tx, ty] = m ? m[1].split(',').slice(4).map((v) => parseFloat(v) * scale) : [0, 0];
        if (Number.isFinite(left) && Number.isFinite(top)) rect = { left: left + tx, top: top + ty, right: left + tx + w, bottom: top + ty + h, width: w, height: h };
      }
      labels.push({ text, style: p, rect, el, pseudo, height: (height + (p.boxSizing === 'border-box' ? 0 : chrome(p))) * scale });
    }
  }

  // A label is small type in a narrow box; a panel with a word on it is not one.
  for (const l of labels.filter((l) => parseFloat(l.style.fontSize) <= 48 && (!l.rect || l.rect.width / scale < 576))) {
    const where = `${l.el.tagName.toLowerCase()}${l.pseudo}`;
    // Stretched: a label far taller than its own lines. The usual cause is
    // both top and bottom set (often from two rules for the same selector).
    const lh = lineHeight(l.style);
    const words = Math.max(1, Math.ceil((l.text.length * parseFloat(l.style.fontSize) * 0.55) / Math.max(1, (l.rect?.width ?? Infinity) / scale)));
    const natural = Math.min(words, 3) * lh + chrome(l.style);
    const height = (l.height ?? l.rect.height) / scale;
    if (height > Math.max(natural * 2.5, natural + 60)) {
      issues.push(`${id}: the label "${l.text}" (${where}) is stretched to ${Math.round(height)}px tall for one line of text; it has both top and bottom set (check for two rules on the same selector) — keep one`);
    }
    // Covering: an opaque label over the slide's other text.
    const bg = parse(l.style.backgroundColor);
    if (!l.rect || !bg || bg.a < 0.85) continue;
    const walker = document.createTreeWalker(slide, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const owner = node.parentElement;
      if (!node.textContent.trim() || (!l.pseudo && l.el.contains(owner)) || owner.closest('svg') || !shown(owner) || opacityOf(owner) < 0.05) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const hit = [...range.getClientRects()].find((r) => {
        const w = Math.min(r.right, l.rect.right) - Math.max(r.left, l.rect.left);
        const h = Math.min(r.bottom, l.rect.bottom) - Math.max(r.top, l.rect.top);
        // Hidden: most of a line's height, across a few letters or a third of the line.
        return h > 0.5 * r.height && w > Math.min(0.3 * r.width, 2 * parseFloat(getComputedStyle(owner).fontSize) * scale);
      });
      if (hit) {
        issues.push(`${id}: the label "${l.text}" (${where}) covers "${short(node.textContent)}"; move it clear of the content or drop it`);
        break;
      }
    }
  }

  // Controls: on the slide, and a compare slider not parked at its edge.
  for (const el of slide.querySelectorAll(controls)) {
    if (!shown(el)) continue;
    const r = el.getBoundingClientRect();
    const name = short(el.getAttribute('aria-label') || el.innerText || el.getAttribute('type') || el.tagName.toLowerCase());
    if (!r.width || !r.height) continue;
    const w = Math.min(r.right, box.right) - Math.max(r.left, box.left);
    const h = Math.min(r.bottom, box.bottom) - Math.max(r.top, box.top);
    const inside = w > 0 && h > 0 ? (w * h) / (r.width * r.height) : 0;
    if (inside < 0.5) issues.push(`${id}: the control "${name}" is ${inside ? 'mostly ' : ''}off the slide (${px(r.left - box.left)}, ${px(r.top - box.top)}); bring it onto the stage`);
    if (el.matches('input[type="range"]')) {
      const min = Number(el.min || 0), max = Number(el.max || 100), v = Number(el.value);
      const at = max > min ? (v - min) / (max - min) : 0.5;
      // A range laid over a picture (a before/after compare) shows one side per end.
      const overlay = (r.width * r.height) / (box.width * box.height) > 0.15;
      if (overlay && (at < 0.1 || at > 0.9)) issues.push(`${id}: the compare slider "${name}" rests at ${Math.round(at * 100)}% of its range, so one side barely shows; rest it near the middle`);
    }
  }
  return issues;
}

/** In the page: the slides holding a control, as { index, id }. */
export function interactiveSlideIds(selector) {
  return [...document.querySelectorAll('.slide')]
    .map((s, index) => ({ index, id: s.id, n: s.querySelectorAll(selector).length }))
    .filter((s) => s.n > 0)
    .map(({ index, id }) => ({ index, id }));
}

/** In the page: resolve once the slide's finite animations end and its DOM stops changing (capped). */
async function settleSlide(id) {
  const slide = document.getElementById(id);
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  const finite = slide.getAnimations({ subtree: true }).filter((a) => a.effect?.getTiming().iterations !== Infinity);
  await Promise.race([Promise.all(finite.map((a) => a.finished.catch(() => {}))), pause(4000)]);
  const snapshot = () => slide.innerHTML + slide.getAttribute('style');
  for (let last = snapshot(), still = 0, t = 0; still < 3 && t < 4000; t += 100) {
    await pause(100);
    const now = snapshot();
    still = now === last ? still + 1 : 0;
    last = now;
  }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

/** In the page: where to drag or click the slide's first usable control, or null. */
function interaction(id, selector) {
  const slide = document.getElementById(id);
  const controls = [...slide.querySelectorAll(selector)].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width && r.height && getComputedStyle(el).visibility !== 'hidden' && !el.disabled;
  });
  const range = controls.find((el) => el.matches('input[type="range"]'));
  if (range) {
    const r = range.getBoundingClientRect();
    const min = Number(range.min || 0), max = Number(range.max || 100);
    const at = max > min ? (Number(range.value) - min) / (max - min) : 0.5;
    const to = at < 0.5 ? 0.75 : 0.25;
    const y = r.top + r.height / 2;
    return { kind: 'drag', name: range.getAttribute('aria-label') || 'range', from: [r.left + r.width * at, y], to: [r.left + r.width * to, y] };
  }
  const click = controls.find((el) => !el.matches('input:not([type="checkbox"]):not([type="radio"]), textarea, select') && el.getAttribute('aria-selected') !== 'true' && el.getAttribute('aria-pressed') !== 'true') ?? controls.find((el) => el.matches('[role="tab"], button'));
  if (!click) return null;
  const r = click.getBoundingClientRect();
  return { kind: 'click', name: (click.getAttribute('aria-label') || click.innerText || click.tagName).trim().slice(0, 40), at: [r.left + r.width / 2, r.top + r.height / 2] };
}

/**
 * Open the live deck at 1920x1080 with motion on and check every interactive
 * slide at start, settled and after an interaction. With `out`, writes each
 * state's screenshot to <out>/<NN-id>--<state>.png.
 * Returns { slides: [{ index, id }], issues: string[], files: string[] }.
 */
export async function checkLiveStates(browser, base, { out = null } = {}) {
  const { mkdir } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const page = await browser.newPage();
  const issues = [];
  const files = [];
  try {
    await page.setViewport({ width: 1920, height: 1080 });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
    await page.goto(`${base.replace(/\/$/, '')}/`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__deckReady === true, { timeout: 15000 }).catch(() => {});
    await page.addStyleTag({ content: HIDE_CHROME });
    const slides = await page.evaluate(interactiveSlideIds, CONTROLS);
    if (out && slides.length) await mkdir(out, { recursive: true });
    for (const { index, id } of slides) {
      const name = `${String(index + 1).padStart(2, '0')}-${id.replace(/^slide-/, '')}`;
      const shoot = async (state) => {
        if (!out) return null;
        const file = join(out, `${name}--${state}.png`);
        await (await page.$(`[id="${id}"]`)).screenshot({ path: file });
        files.push(file);
        return file;
      };
      const bytes = async () => (await page.$(`[id="${id}"]`)).screenshot();
      // Enter the slide fresh, so its entrance plays from the start.
      const replay = await page.evaluate((i) => {
        if (typeof window.deckReplay !== 'function') return false;
        window.deckReplay(i);
        return true;
      }, index);
      if (!replay) {
        await page.evaluate((id) => document.getElementById(id).scrollIntoView(), id);
      }
      await new Promise((r) => setTimeout(r, 120));
      await shoot('start');
      await page.evaluate(settleSlide, id);
      await shoot('settled');
      const seen = new Set();
      const add = (list, state) => list.forEach((issue) => {
        const key = issue.replace(/\d+px/g, '');
        if (!seen.has(key)) {
          seen.add(key);
          issues.push(`${issue} [${state}]`);
        }
      });
      add(await page.evaluate(liveProblems, id, CONTROLS), 'settled');
      const act = await page.evaluate(interaction, id, CONTROLS);
      if (!act) continue;
      // Hover first, so a hover style alone doesn't count as the control working.
      await page.mouse.move(...(act.kind === 'drag' ? act.from : act.at));
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      await new Promise((r) => setTimeout(r, 250));
      const before = await bytes();
      if (act.kind === 'drag') {
        await page.mouse.down();
        for (let i = 1; i <= 8; i++) await page.mouse.move(act.from[0] + ((act.to[0] - act.from[0]) * i) / 8, act.to[1]);
        await page.mouse.up();
      } else {
        await page.mouse.click(...act.at);
      }
      await page.evaluate(settleSlide, id);
      await shoot('after');
      if (Buffer.compare(before, await bytes()) === 0) {
        issues.push(`${id}: ${act.kind === 'drag' ? 'dragging' : 'clicking'} "${act.name}" changed nothing on the slide; wire the control or drop it [after]`);
      }
      add(await page.evaluate(liveProblems, id, CONTROLS), 'after');
    }
    return { slides, issues, files };
  } finally {
    await page.close();
  }
}
