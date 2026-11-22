// The motion kit's checks (src/styles/motion.css, src/scripts/motion.js,
// src/components/motion/). bin/audit.mjs runs them on every deck and on the
// toolbox gallery. They hold the restraint rules, which come from the /steal
// motion playbook (unfairly.ai/steal/design/motion/):
//
// In the source (slides and toolbox layouts):
//   - timing comes from the brand: no cubic-bezier() or steps() of a slide's
//     own, and no raw duration in an animation or transition (a delay offset
//     inside calc() is fine);
//   - motion moves with transform and appears with opacity: no keyframe or
//     transition animates width, height, top, left, margin or padding.
// In the live deck, each slide entered from the start:
//   - one showpiece per slide: at most one kind of featured motion (words,
//     grow, draw, count, focus, steps, marquee); everything else only enters;
//   - everything lands inside the slide's budget (five entrances: 3s calm,
//     2s crisp), showpieces and the ambient drift aside;
//   - nothing loops forever unless it's a marquee with its pause button;
//   - words that move are a headline's, 14 words or fewer;
//   - at most one ambient field, and never under a chart, a spotlight or steps;
//   - a data-carry key has its partner on the slide before or after, and
//     stepping from that slide plays the carry.
// With reduced motion and in the PDF:
//   - every primitive is at rest: no animation running past 150ms, every
//     count at its final figure, every showpiece at its final state, nothing
//     a primitive holds left transparent.
// A line with "motion-ok" in the source is skipped, for a deliberate exception.

/** Featured motion: one kind per slide. */
export const FEATURES = ['words', 'grow', 'draw', 'count', 'focus', 'steps', 'marquee'];
/** Most words a [data-m="words"] element may move. Matches src/scripts/motion.js. */
export const MAX_WORDS = 14;
/** A slide's entrances land inside this many of the brand's entrance durations. */
export const BUDGET_ENTRANCES = 5;

const LAYOUT_PROPS = /^(width|height|min-width|min-height|max-width|max-height|top|right|bottom|left|inset|margin(-\w+)?|padding(-\w+)?|font-size)$/;

/** The text with every balanced `name(...)` call removed, for the names given. */
export function stripCalls(text, names = ['var', 'calc', 'min', 'max', 'clamp']) {
  let out = text;
  for (let guard = 0; guard < 20; guard++) {
    const re = new RegExp(`\\b(?:${names.join('|')})\\(([^()]*)\\)`, 'g');
    const next = out.replace(re, ' ');
    if (next === out) break;
    out = next;
  }
  return out;
}

/** Every @keyframes block in a text: its name, its body, and the line it starts on. */
export function keyframesIn(text) {
  const out = [];
  for (const m of text.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)) {
    let depth = 1;
    let i = m.index + m[0].length;
    for (; i < text.length && depth; i++) depth += text[i] === '{' ? 1 : text[i] === '}' ? -1 : 0;
    out.push({ name: m[1], body: text.slice(m.index + m[0].length, i - 1), line: text.slice(0, m.index).split('\n').length });
  }
  return out;
}

/** Only the CSS of a source file: its <style> blocks and inline style attributes, other lines blanked so line numbers hold. */
function cssOf(path, text) {
  if (/\.css$/.test(path)) return text;
  let inStyle = false;
  return text.split('\n').map((line) => {
    if (/<style[\s>]/.test(line)) inStyle = true;
    const keep = inStyle ? line : [...line.matchAll(/\sstyle=(?:"([^"]*)"|\{`([^`]*)`\})/g)].map((m) => m[1] ?? m[2]).join('; ');
    if (/<\/style>/.test(line)) inStyle = false;
    return keep;
  }).join('\n');
}

/**
 * Motion problems in slide and layout source files: [{ path, text }] in,
 * "path:line: why" strings out. Pure, so it is tested without a browser.
 */
export function motionSourceProblems(files) {
  const problems = [];
  for (const { path, text } of files) {
    const css = cssOf(path, text);
    const lines = css.split('\n');
    const ok = (n) => text.split('\n')[n - 1]?.includes('motion-ok');
    lines.forEach((line, i) => {
      const n = i + 1;
      if (ok(n)) return;
      const at = `${path}:${n}`;
      const code = line.replace(/\/\*.*?\*\//g, '');
      const curve = /cubic-bezier\([^)]*\)|steps\([^)]*\)/.exec(code);
      if (curve) problems.push(`${at}: an easing of the slide's own (${curve[0]}); use the brand's curve: var(--ease) to enter, var(--ease-exit) to leave, var(--ease-move) to travel, var(--ease-pop) to land`);
      for (const m of code.matchAll(/\b(animation|transition)(-duration)?\s*:\s*([^;}]+)/g)) {
        const raw = stripCalls(m[3]).match(/(?<![\w.-])(?!0m?s\b)\d*\.?\d+m?s\b/g);
        if (raw) problems.push(`${at}: ${m[1]} with a raw duration (${raw.join(', ')}); time it with the brand's tokens: var(--dur-small), var(--dur-medium), var(--dur-large), var(--dur-enter), var(--dur-grow) or var(--dur-draw)`);
        if (m[1] === 'transition') {
          const props = m[3].split(',').map((p) => stripCalls(p).trim().split(/\s+/)[0]).filter((p) => LAYOUT_PROPS.test(p));
          if (props.length) problems.push(`${at}: a transition on ${props.join(', ')}; move with transform and appear with opacity, so nothing reflows each frame`);
        }
      }
    });
    for (const k of keyframesIn(css)) {
      const props = [...new Set([...k.body.matchAll(/([a-z-]+)\s*:/g)].map((d) => d[1]).filter((p) => LAYOUT_PROPS.test(p)))];
      if (props.length && !ok(k.line)) problems.push(`${path}:${k.line}: @keyframes ${k.name} animates ${props.join(', ')}; move with transform and appear with opacity, so nothing reflows each frame`);
    }
  }
  return [...new Set(problems)];
}

// ── In the page ──────────────────────────────────────────────────────────

/**
 * In the page, after a slide has been entered from the start: what's wrong
 * with its motion. Returns { id, problems: [] }.
 */
export function inspectSlideMotion(index, { FEATURES, MAX_WORDS, BUDGET_ENTRANCES }) {
  const slide = document.querySelectorAll('.slide')[index];
  const id = slide.id.replace(/^slide-/, '');
  const problems = [];
  const describe = (el) => {
    const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 36);
    return `<${el.tagName.toLowerCase()}${el.dataset?.m ? ` data-m="${el.dataset.m}"` : ''}>${text ? ` "${text}"` : ''}`;
  };
  const kind = (el) => el.getAttribute('data-m');
  const featured = [...slide.querySelectorAll('[data-m]')].filter((el) => FEATURES.includes(kind(el)));
  // A count inside a chart that grows is one showpiece, not two.
  const top = featured.filter((el) => !featured.some((o) => o !== el && o.contains(el)));
  const kinds = [...new Set(top.map(kind))];
  if (kinds.length > 1) problems.push(`two showpieces (${kinds.join(' and ')}); keep the one that carries the slide's point, and let the rest only enter`);
  for (const el of slide.querySelectorAll('[data-m="words"]')) {
    const words = (el.textContent || '').trim().split(/\s+/).filter(Boolean).length;
    if (words > MAX_WORDS) problems.push(`${describe(el)} moves ${words} words; words being read stay still. Use data-m="words" on a headline of ${MAX_WORDS} words or fewer`);
  }
  const ambient = slide.querySelectorAll('[data-m="ambient"]');
  if (ambient.length > 1) problems.push(`${ambient.length} ambient fields; one is texture, two is noise`);
  const busy = kinds.filter((k) => ['grow', 'draw', 'focus', 'steps', 'marquee'].includes(k));
  if (ambient.length && busy.length) problems.push(`an ambient field under ${busy[0]}; light drifting behind a chart, a spotlight or steps competes with it. Keep ambient for title and section slides`);

  // Minified CSS may write 600ms as .6s.
  const token = getComputedStyle(slide).getPropertyValue('--dur-enter').trim();
  const enter = (parseFloat(token) || 0.6) * (/ms$/.test(token) ? 1 : /s$/.test(token) ? 1000 : 1) || 600;
  const budget = enter * BUDGET_ENTRANCES;
  let last = null;
  for (const a of document.getAnimations()) {
    const el = a.effect?.target;
    if (!el || !slide.contains(el)) continue;
    const timing = a.effect.getComputedTiming();
    if (timing.iterations === Infinity || timing.endTime === Infinity) {
      const marquee = el.closest('[data-m="marquee"]');
      if (!(marquee && marquee.querySelector('button')) && !el.matches('.breathe')) problems.push(`${describe(el)} loops forever with no pause button; let it stop, or use the marquee (it pauses)`);
      continue;
    }
    if (el.closest('[data-showpiece], [data-m="ambient"], [data-m="marquee"]') || a.id === 'm-carry') continue;
    if (!last || timing.endTime > last.end) last = { end: timing.endTime, el };
  }
  if (last && last.end > budget + 50) problems.push(`the last entrance lands at ${Math.round(last.end)}ms (${describe(last.el)}); everything lands by ${Math.round(budget)}ms in this brand's timing. Shorten the delays (--d) or let fewer things enter`);

  for (const el of slide.querySelectorAll('[data-carry]')) {
    const key = el.getAttribute('data-carry');
    const slides = [...document.querySelectorAll('.slide')];
    const near = [slides[index - 1], slides[index + 1]].filter(Boolean);
    if (!near.some((s) => [...s.querySelectorAll('[data-carry]')].some((o) => o.getAttribute('data-carry') === key))) {
      problems.push(`data-carry="${key}" has no partner on the slide before or after; a carry travels between neighbours`);
    }
  }
  return { id, problems };
}

/** In the page, with reduced motion or in the PDF: primitives not at rest. */
export function inspectStill(index, { pdf }) {
  const slide = document.querySelectorAll('.slide')[index];
  const problems = [];
  const describe = (el) => `<${el.tagName.toLowerCase()}${el.dataset?.m ? ` data-m="${el.dataset.m}"` : ''}>`;
  for (const a of document.getAnimations()) {
    const el = a.effect?.target;
    if (!el || !slide.contains(el) || a.playState !== 'running') continue;
    const t = a.effect.getComputedTiming();
    if (t.iterations === Infinity || (t.activeDuration > 150 && t.progress !== null && t.progress < 1)) problems.push(`${describe(el)} still moves (${a.animationName ?? a.id ?? 'animation'}); with reduced motion and in the PDF it rests on its final state`);
  }
  for (const el of slide.querySelectorAll('[data-showpiece]')) {
    if (el.dataset.state !== el.dataset.final) problems.push(`${describe(el)} shows state ${el.dataset.state}, not its final state ${el.dataset.final}`);
  }
  for (const el of slide.querySelectorAll('.count-up')) {
    const d = el.dataset;
    const final = `${d.prefix ?? ''}${Number(d.to).toFixed(Number(d.decimals) || 0)}${d.suffix ?? ''}`;
    if (el.textContent.trim() !== final) problems.push(`a count shows "${el.textContent.trim()}", not its final figure "${final}"`);
  }
  for (const root of slide.querySelectorAll('[data-m]:not([data-m="ambient"])')) {
    for (const el of [root, ...root.querySelectorAll('*')]) {
      if (el.closest('[aria-hidden="true"]') || !el.getClientRects().length) continue;
      if (!el.textContent.trim() && !el.matches('img, svg, video, canvas')) continue;
      if (el.closest('[data-showpiece]') && el.closest('.m-step:not(.is-on)')) continue;
      let o = 1;
      for (let e = el; e && e !== slide; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
      if (o < 0.95) {
        problems.push(`${describe(root)} leaves ${el.tagName.toLowerCase()}${el.textContent.trim() ? ` "${el.textContent.trim().slice(0, 30)}"` : ''} at ${o.toFixed(2)} opacity${pdf ? ' in the PDF' : ' with reduced motion'}`);
        break;
      }
    }
  }
  return problems;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Run every motion check on a built deck at `base`. `browser` is puppeteer's.
 * Returns { problems: ["mode: slide: why"], slides, featured }.
 */
export async function auditMotion(browser, base) {
  const problems = [];
  const opts = { FEATURES, MAX_WORDS, BUDGET_ENTRANCES };
  const open = async (viewport, query = '', reduce = false) => {
    const page = await browser.newPage();
    await page.setViewport(viewport);
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: reduce ? 'reduce' : 'no-preference' }]);
    await page.goto(`${base}/${query}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__deckReady === true, { timeout: 15000 }).catch(() => {});
    await page.evaluate(() => document.querySelector('astro-dev-toolbar')?.remove());
    return page;
  };
  const stage = { width: 1920, height: 1080 };
  let featured = 0;

  // The live deck: each slide entered from the start, then a carry stepped into.
  const live = await open(stage);
  const count = await live.evaluate(() => document.querySelectorAll('.slide').length);
  for (let i = 0; i < count; i++) {
    await live.evaluate((n) => window.deckReplay?.(n), i);
    await wait(60);
    const r = await live.evaluate(inspectSlideMotion, i, opts);
    r.problems.forEach((p) => problems.push(`motion: ${r.id}: ${p}`));
    featured += await live.evaluate((n) => (document.querySelectorAll('.slide')[n].querySelector('[data-m]:not([data-m="stagger"]):not([data-m="ambient"])') ? 1 : 0), i);
  }
  const carries = await live.evaluate(() => [...document.querySelectorAll('.slide')].flatMap((s, i) => [...s.querySelectorAll('[data-carry]')].map((el) => ({ i, key: el.getAttribute('data-carry'), id: s.id.replace(/^slide-/, '') }))));
  for (const c of carries) {
    const prev = carries.find((o) => o.key === c.key && o.i === c.i - 1);
    if (!prev) continue;
    await live.evaluate((n) => window.deckReplay?.(n), prev.i);
    await wait(80);
    await live.keyboard.press('ArrowRight');
    await wait(80);
    const played = await live.evaluate((n, key) => {
      const el = [...document.querySelectorAll('.slide')[n].querySelectorAll('[data-carry]')].find((e) => e.getAttribute('data-carry') === key);
      return el.getAnimations().some((a) => a.id === 'm-carry');
    }, c.i, c.key);
    if (!played) problems.push(`motion: ${c.id}: data-carry="${c.key}" didn't travel when stepping in from ${prev.id}`);
  }
  await live.close();

  // Still: reduced motion on the stage and a phone, and the PDF.
  for (const [mode, viewport, query, reduce] of [
    ['motion-reduced', stage, '', true],
    ['motion-reduced-mobile', { width: 393, height: 745, isMobile: true, hasTouch: true }, '', true],
    ['motion-pdf', stage, '?pdf=1', false],
  ]) {
    const page = await open(viewport, query, reduce);
    for (let i = 0; i < count; i++) {
      if (!query) {
        await page.evaluate((n) => window.deckReplay?.(n), i);
        await wait(220);
      }
      const id = await page.evaluate((n) => document.querySelectorAll('.slide')[n].id.replace(/^slide-/, ''), i);
      (await page.evaluate(inspectStill, i, { pdf: Boolean(query) })).forEach((p) => problems.push(`${mode}: ${id}: ${p}`));
    }
    await page.close();
  }
  return { problems: [...new Set(problems)], slides: count, featured };
}
