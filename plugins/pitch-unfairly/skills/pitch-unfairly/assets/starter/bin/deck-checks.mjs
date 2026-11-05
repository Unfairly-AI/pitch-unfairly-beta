// What a machine reading the deck gets: the checks npm run audit adds so the
// PDF's text layer and index.txt say what the slides say. In-page functions
// run in the deck (after settle() from render-pdf.mjs); the rest are pure.
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { contrastScript } from './contrast.mjs';

/** Injected before readability(): the contrast helpers, as window.__readContrast. */
export const READ_CONTRAST = contrastScript('__readContrast');

/**
 * In the page, at ?pdf=1: per slide, what keeps its text from reading right.
 * One real-text h1/h2, alt on every image, no near-invisible text (faded to
 * nothing, under 4px, the color of its background, or off the slide), and
 * DOM order that matches the order the slide is read in.
 */
export function readability() {
  const C = window.__readContrast;
  const out = [];
  const describe = (el) => {
    const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return `<${el.tagName.toLowerCase()}>${text ? ` "${text}"` : ''}`;
  };
  const painted = (el) => {
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden';
  };
  const opacityOf = (el, stop) => {
    let o = 1;
    for (let e = el; e && e !== stop; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
    return o;
  };
  // An ancestor that clips to a sliver hides its text (the visually hidden pattern), though the text's own boxes don't shrink.
  const clippedAway = (el, stop) => {
    for (let e = el; e && e !== stop; e = e.parentElement) {
      const s = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      const clips = s.overflow !== 'visible' || s.clipPath !== 'none' || (s.clip && s.clip !== 'auto');
      if (clips && (r.width <= 2 || r.height <= 2 || /inset\(\s*50%/.test(s.clipPath))) return true;
    }
    return false;
  };
  const media = (el) => ['IMG', 'VIDEO', 'CANVAS', 'PICTURE', 'IFRAME'].includes(el.tagName) || getComputedStyle(el).backgroundImage !== 'none';

  for (const slide of document.querySelectorAll('.slide')) {
    const name = slide.id || '(slide)';
    const issue = (msg) => out.push(`${name}: ${msg}`);
    const box = slide.getBoundingClientRect();

    // One headline, in real text.
    const heads = [...slide.querySelectorAll('h1, h2')].filter(painted);
    const words = heads.map((h) => h.innerText.trim());
    if (!heads.length) issue('no h1/h2 headline; every slide states its point in one real-text headline');
    else if (heads.length > 1) issue(`${heads.length} h1/h2 headlines (${words.map((w) => `"${w.slice(0, 30)}"`).join(', ')}); keep one and make the rest h3 or text, so the PDF outline and index.txt get one per slide`);
    else if (!words[0]) issue('the headline has no text (an image or drawing of words reads as nothing in the PDF); set it as live text');

    // Images say what they are.
    for (const img of slide.querySelectorAll('img')) {
      if (!img.hasAttribute('alt')) issue(`<img src="${img.getAttribute('src')}"> has no alt; describe it, or alt="" if it is decoration`);
    }

    // Text the PDF's text layer carries but a viewer can't see.
    const layers = [];
    for (const el of [slide, ...slide.querySelectorAll('*')]) {
      if (!painted(el) || el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
      const bg = C.parseColor(getComputedStyle(el).backgroundColor);
      if (media(el) || (bg && bg.a > 0)) layers.push({ el, rect: el.getBoundingClientRect(), media: media(el), bg });
    }
    let page = { r: 255, g: 255, b: 255, a: 1 };
    for (let e = slide.parentElement; e; e = e.parentElement) {
      const c = C.parseColor(getComputedStyle(e).backgroundColor);
      if (c && c.a >= 0.99) { page = c; break; }
    }
    let faint = null;
    const walker = document.createTreeWalker(slide, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node && !faint; node = walker.nextNode()) {
      const el = node.parentElement;
      if (!node.textContent.trim() || !painted(el)) continue;
      const style = getComputedStyle(el);
      const range = document.createRange();
      range.selectNodeContents(node);
      const rects = [...range.getClientRects()];
      // Not rendered at all (inside display: none, like a phone-only copy): not in the PDF either.
      if (!rects.length || !el.getClientRects().length) continue;
      const r = rects.find((x) => x.width > 0 && x.height > 0);
      const opacity = opacityOf(el, slide.parentElement);
      const size = parseFloat(style.fontSize);
      if (clippedAway(el, slide)) faint = `${describe(el)} is visually hidden (clipped to a sliver, the screen-reader-only pattern); use aria-label for a label only assistive tech needs`;
      else if (opacity < 0.1) faint = `${describe(el)} is faded to opacity ${opacity.toFixed(2)}`;
      else if (size < 4) faint = `${describe(el)} is set at ${size}px`;
      else if (!r || rects.every((x) => x.width <= 1 || x.height <= 1)) faint = `${describe(el)} is clipped to nothing`;
      else if (rects.every((x) => x.right <= box.left || x.left >= box.right || x.bottom <= box.top || x.top >= box.bottom)) faint = `${describe(el)} sits off the slide`;
      else if (!el.closest('svg')) {
        const fill = style.webkitTextFillColor && style.webkitTextFillColor !== style.color ? style.webkitTextFillColor : style.color;
        const fg0 = C.parseColor(fill);
        if (!fg0 || /text/.test(`${style.backgroundClip} ${style.webkitBackgroundClip || ''}`)) continue;
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const under = layers.filter((l) => (l.el === el || el.compareDocumentPosition(l.el) & Node.DOCUMENT_POSITION_PRECEDING) &&
          cx >= l.rect.left && cx <= l.rect.right && cy >= l.rect.top && cy <= l.rect.bottom);
        let at = -1;
        for (let i = under.length - 1; i >= 0; i--) if (!under[i].media && under[i].bg.a >= 0.99) { at = i; break; }
        // Over a photo or gradient the color behind can't be read off the page.
        if (under.slice(at + 1).some((l) => l.media) || (at < 0 && under.some((l) => l.media))) continue;
        let bg = at >= 0 ? under[at].bg : page;
        for (const l of under.slice(at + 1)) bg = C.blend(l.bg, bg);
        const ratio = C.contrastRatio(C.blend({ ...fg0, a: fg0.a * opacity }, bg), bg);
        if (ratio < 1.5) faint = `${describe(el)} is nearly the color of its background (${ratio.toFixed(2)}:1)`;
      }
    }
    if (faint) issue(`near-invisible text: ${faint}. The PDF's text layer still carries it, so a model reads words nobody sees; show it or delete it`);

    // DOM order is reading order: a later block shouldn't sit above an earlier one in the same column.
    const blocks = [];
    for (const el of slide.querySelectorAll('*')) {
      if (!painted(el) || el.closest('svg, [aria-hidden="true"]') || ['inline', 'contents'].includes(getComputedStyle(el).display)) continue;
      if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && !/^H[1-6]$/.test(el.tagName)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width > 2 && rect.height > 2 && !clippedAway(el, slide) && !blocks.some((b) => b.el.contains(el))) blocks.push({ el, rect });
    }
    let inverted = null;
    for (let i = 0; i < blocks.length && !inverted; i++) {
      for (let j = i + 1; j < blocks.length && !inverted; j++) {
        const a = blocks[i].rect;
        const b = blocks[j].rect;
        const shared = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        if (b.bottom <= a.top + 1 && shared > 0.5 * Math.min(a.width, b.width)) inverted = [blocks[i].el, blocks[j].el];
      }
    }
    if (inverted) issue(`${describe(inverted[1])} sits above ${describe(inverted[0])} but comes after it in the page; put the elements in the order they're read (no CSS order, reversed flex or absolute moves), since the PDF's text follows the page order`);
  }
  return out;
}

/** In the page: each slide's visible words, keyed by slide id. Run on screen and at ?pdf=1 to compare. */
export function visibleWords() {
  const out = {};
  for (const slide of document.querySelectorAll('.slide')) {
    const words = [];
    const walker = document.createTreeWalker(slide, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      const style = getComputedStyle(el);
      if (!node.textContent.trim() || style.display === 'none' || style.visibility === 'hidden' || el.closest('[aria-hidden="true"]')) continue;
      let opacity = 1;
      for (let e = el; e && e !== slide.parentElement; e = e.parentElement) opacity *= Number(getComputedStyle(e).opacity);
      const range = document.createRange();
      range.selectNodeContents(node);
      if (opacity < 0.1 || ![...range.getClientRects()].some((r) => r.width > 1 && r.height > 1)) continue;
      words.push(...node.textContent.split(/\s+/).filter(Boolean));
    }
    out[slide.id] = words;
  }
  return out;
}

const norm = (s) => String(s).toLowerCase()
  .replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"').replace(/[‐-―−]/g, '-')
  .replace(/[*_`]/g, '')
  .replace(/[^\p{L}\p{N}'%$€£+]+/gu, ' ')
  .trim();

/**
 * In the page, on the live deck: elements a running animation keeps dim. The
 * ?pdf=1 render shows no running animation, so the wrong keyframes never reach
 * it. A loop dims an element if it spends over 3s of each cycle under 0.25
 * opacity while the element rests at 0.5 or more. An animation that plays once
 * and ends faded out is an exit, like a logo reveal clearing the slide, so it
 * passes. A deliberate slow fade (a crossfade of two images) opts out with
 * data-fade-ok.
 */
export function dimmedByAnimation() {
  const DIM = 0.25;
  const SAMPLES = 24;
  const seen = [];
  for (const a of document.getAnimations()) {
    const el = a.effect?.target;
    if (!el || a.effect.pseudoElement || !el.closest('.slide') || el.closest('[data-fade-ok]') || !el.getClientRects().length) continue;
    if (!el.textContent.trim() && !el.matches('img, svg, video, canvas') && !el.querySelector('img, svg, video, canvas')) continue;
    const opacity = () => Number(getComputedStyle(el).opacity);
    const { delay, duration, iterations } = a.effect.getComputedTiming();
    if (iterations !== Infinity || !(duration > 0)) continue;
    a.pause();
    let dim = 0;
    for (let i = 0; i < SAMPLES; i++) {
      a.currentTime = delay + ((i + 0.5) / SAMPLES) * duration;
      if (opacity() < DIM) dim++;
    }
    const seconds = (dim / SAMPLES) * duration / 1000;
    const held = seconds > 3 ? `under ${DIM} opacity for ${Math.round(seconds)}s of each ${Math.round(duration / 1000)}s loop` : null;
    if (held) seen.push({ a, el, name: a.animationName ?? '(animation)', held });
  }
  // What each element would be with nothing animating it.
  for (const a of document.getAnimations()) a.cancel();
  return seen.filter(({ el }) => Number(getComputedStyle(el).opacity) >= 0.5).map(({ el, name, held }) => {
    const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return `${el.closest('.slide').id || '(slide)'}: <${el.tagName.toLowerCase()}>${text ? ` "${text}"` : ''} stays ${held} (@keyframes ${name}); check that animation is the one you meant, or mark a deliberate fade data-fade-ok`;
  });
}

/** Each @keyframes in a stylesheet: its name, its body with spacing normalized, and whether a condition like @media holds it. */
export function keyframeBlocks(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const out = [];
  const stack = [];
  let prelude = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'") {
      let end = i + 1;
      while (end < text.length && text[end] !== c) end += text[end] === '\\' ? 2 : 1;
      prelude += text.slice(i, end + 1);
      i = end;
    } else if (c === '{') {
      const head = prelude.trim();
      prelude = '';
      const m = /^@(?:-webkit-)?keyframes\s+["']?([^\s"'{]+)/i.exec(head);
      if (!m) {
        stack.push(head);
        continue;
      }
      let depth = 1;
      let end = i + 1;
      for (; end < text.length && depth; end++) depth += text[end] === '{' ? 1 : text[end] === '}' ? -1 : 0;
      out.push({
        name: m[1],
        body: text.slice(i + 1, end - 1).trim()
          .replace(/\s+/g, ' ')
          .replace(/\s*([{}:;,])\s*/g, '$1')
          .replace(/;}/g, '}')
          .replace(/(^|})from\{/g, '$10%{')
          .replace(/(^|})to\{/g, '$1100%{'),
        conditional: stack.some((h) => /^@(media|supports|container)\b/i.test(h)),
      });
      i = end - 1;
    } else if (c === '}') {
      stack.pop();
      prelude = '';
    } else if (c === ';') prelude = '';
    else prelude += c;
  }
  return out;
}

/** The CSS of a source file: all of a .css file, the <style> blocks of an .astro one. */
export function fileCss(path, text) {
  if (!path.endsWith('.astro')) return text;
  return [...text.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
}

/**
 * @keyframes names defined two ways. Astro scopes a component's selectors but
 * not its keyframe names, so every deck's names share one global space and the
 * last definition loaded replaces the others for every slide. Takes
 * [{ path, text }]; a file may override its own name under @media (a phone
 * version of the same motion), and files agreeing on a name are the same motion.
 */
export function keyframeCollisions(files) {
  const byName = new Map();
  for (const { path, text } of files) {
    for (const block of keyframeBlocks(fileCss(path, text))) {
      if (!byName.has(block.name)) byName.set(block.name, new Map());
      const paths = byName.get(block.name);
      if (!paths.has(path)) paths.set(path, []);
      paths.get(path).push(block);
    }
  }
  const out = [];
  for (const [name, paths] of byName) {
    const bodies = (blocks) => [...new Set(blocks.map((b) => b.body))].sort();
    const signatures = new Set([...paths.values()].map((blocks) => JSON.stringify(bodies(blocks))));
    const repeated = [...paths].filter(([, blocks]) => bodies(blocks.filter((b) => !b.conditional)).length > 1);
    if (signatures.size > 1) out.push({ name, paths: [...paths.keys()].sort() });
    else if (repeated.length) out.push({ name, paths: repeated.map(([path]) => path) });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Every .astro and .css file under `dirs`, read, for keyframeCollisions. Missing directories are skipped. */
export async function styleSources(dirs) {
  const out = [];
  const walk = async (dir) => {
    for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const path = join(dir, e.name);
      if (e.isDirectory()) await walk(path);
      else if (/\.(astro|css)$/.test(e.name)) out.push({ path, text: await readFile(path, 'utf8') });
    }
  };
  for (const dir of dirs) await walk(dir);
  return out;
}

/** Words a slide shows on screen that its PDF page doesn't, per slide. */
export function missingInPdf(screen, pdf) {
  const out = [];
  for (const [id, words] of Object.entries(screen)) {
    const have = new Set((pdf[id] ?? []).map(norm).filter(Boolean));
    const gone = [...new Set(words.map(norm).filter((w) => w && !have.has(w)))];
    if (gone.length) out.push({ id, words: gone });
  }
  return out;
}

/** story.md's headlines, in order, with the slide each belongs to. */
export function storyHeadlines(story) {
  const out = [];
  let slide = null;
  for (const line of story.replace(/<!--[\s\S]*?-->/g, '').split('\n')) {
    const head = /^##\s+(.+)$/.exec(line.trim());
    if (head) slide = head[1].trim();
    const m = /^-?\s*Headline:\s*(.+)$/i.exec(line.trim());
    // A trailing "(Set under $120K at poster scale.)" is a note to the designer, not words on the slide.
    if (m && slide) out.push({ slide, headline: m[1].replace(/\s*\([^()]*\)\s*$/, '').trim() });
  }
  return out;
}

/** The first story headline missing from `text` or found out of order, or null when they all read in order. */
export function headlineOrderProblem(headlines, text) {
  const hay = norm(text).replace(/\s+/g, ' ');
  let from = 0;
  for (const h of headlines) {
    const needle = norm(h.headline).replace(/\s+/g, ' ');
    if (!needle) continue;
    const at = hay.indexOf(needle, from);
    if (at >= 0) { from = at + needle.length; continue; }
    return { ...h, why: hay.includes(needle) ? 'out of order' : 'missing' };
  }
  return null;
}

/** Items of a list that a page's text reads out of order, or null. */
export function listOrderProblem(items, text) {
  const hay = norm(text).replace(/\s+/g, ' ');
  const found = items.map((t) => norm(t).replace(/\s+/g, ' ')).filter(Boolean).map((t) => ({ t, at: hay.indexOf(t) }));
  if (found.some((f) => f.at < 0)) return null;
  for (let i = 1; i < found.length; i++) if (found[i].at < found[i - 1].at) return found.map((f) => f.t).sort((a, b) => hay.indexOf(a) - hay.indexOf(b));
  return null;
}

/** Each page's text as pdftotext reads it, or null when poppler's pdftotext isn't installed. */
export async function pdfPagesText(bytes, mode = []) {
  try { execFileSync('pdftotext', ['-v'], { stdio: 'ignore' }); } catch { return null; }
  const dir = await mkdtemp(join(tmpdir(), 'deck-pdf-'));
  try {
    const file = join(dir, 'deck.pdf');
    await writeFile(file, bytes);
    return execFileSync('pdftotext', [...mode, '-enc', 'UTF-8', file, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\f').slice(0, -1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
