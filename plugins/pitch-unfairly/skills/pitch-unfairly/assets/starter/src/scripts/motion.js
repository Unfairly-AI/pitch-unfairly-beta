// The motion kit's script half (src/styles/motion.css holds the rest).
// Deck.astro calls prepareMotion() once before the first entrance, and
// playCarry() when a slide is entered for the first time.

/** Headlines whose words rise one by one stay short: longer is copy being read. */
export const MAX_WORDS = 14;

const still = () => Boolean(window.deckStill?.());

/**
 * Wrap each word of every [data-m="words"] element in <span class="m-w">
 * with its index as --w, keeping any markup inside (an accent phrase). Runs
 * once, in the live deck only: the PDF keeps whole text nodes.
 */
export function prepareMotion(root = document) {
  for (const el of root.querySelectorAll('[data-m="words"]:not([data-m-ready])')) {
    el.setAttribute('data-m-ready', '');
    const words = (el.textContent ?? '').trim().split(/\s+/).filter(Boolean);
    if (words.length > MAX_WORDS) continue; // the audit names it; the headline just shows
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    let n = 0;
    for (const node of nodes) {
      const parts = node.textContent.split(/(\s+)/);
      if (parts.every((p) => !p.trim())) continue;
      const frag = document.createDocumentFragment();
      for (const part of parts) {
        if (!part) continue;
        if (!part.trim()) {
          frag.append(part);
          continue;
        }
        const w = document.createElement('span');
        w.className = 'm-w';
        w.style.setProperty('--w', String(n++));
        w.textContent = part;
        frag.append(w);
      }
      node.replaceWith(frag);
    }
  }
}

/** A time token (--dur-large: 500ms) in milliseconds. */
export function ms(el, name, fallback) {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return fallback;
  return /ms$/.test(v) ? n : /s$/.test(v) ? n * 1000 : n;
}

/**
 * The transform that puts `to` where `from` was, each measured against its own
 * slide frame and scaled into the slide's 1920x1080 coordinates: centers line
 * up, sizes match. Pure, so it is tested without a browser.
 */
export function carryTransform(from, fromFrame, to, toFrame, scale = 1) {
  const cx = (r, f) => r.left - f.left + r.width / 2;
  const cy = (r, f) => r.top - f.top + r.height / 2;
  const dx = (cx(from, fromFrame) - cx(to, toFrame)) / scale;
  const dy = (cy(from, fromFrame) - cy(to, toFrame)) / scale;
  const kx = to.width ? from.width / to.width : 1;
  const ky = to.height ? from.height / to.height : 1;
  return { dx, dy, kx, ky, css: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${kx.toFixed(4)}, ${ky.toFixed(4)})` };
}

/**
 * Shared-element carry: every [data-carry="<key>"] on the entered slide that
 * the slide we left also has travels from its place there to its place here,
 * on the brand's move curve, so one object reads as moving between slides.
 */
export function playCarry(fromSlide, toSlide) {
  if (!fromSlide || !toSlide || still()) return [];
  const played = [];
  for (const to of toSlide.querySelectorAll('[data-carry]')) {
    const key = to.getAttribute('data-carry');
    const from = [...fromSlide.querySelectorAll('[data-carry]')].find((e) => e.getAttribute('data-carry') === key);
    if (!from) continue;
    const fromFrame = fromSlide.parentElement?.getBoundingClientRect() ?? fromSlide.getBoundingClientRect();
    const toFrame = toSlide.parentElement?.getBoundingClientRect() ?? toSlide.getBoundingClientRect();
    const scale = toSlide.offsetWidth ? toSlide.getBoundingClientRect().width / toSlide.offsetWidth : 1;
    const t = carryTransform(from.getBoundingClientRect(), fromFrame, to.getBoundingClientRect(), toFrame, scale);
    if (Math.abs(t.dx) < 2 && Math.abs(t.dy) < 2 && Math.abs(t.kx - 1) < 0.01) continue;
    const duration = ms(toSlide, '--dur-large', 500) * 2;
    const easing = getComputedStyle(toSlide).getPropertyValue('--ease-move').trim() || 'ease';
    // The carried element arrives by travelling, not by its entrance.
    to.classList.add('m-carrying');
    const anim = to.animate([{ transform: t.css }, { transform: 'none' }], { duration, easing, composite: 'add' });
    anim.id = 'm-carry';
    anim.finished.catch(() => {}).finally(() => to.classList.remove('m-carrying'));
    played.push(key);
  }
  return played;
}
