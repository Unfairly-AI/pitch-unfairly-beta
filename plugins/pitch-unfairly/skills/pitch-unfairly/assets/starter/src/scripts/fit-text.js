// Measured type fitting: the last word on a fitted element's size.
//
// A layout sets a headline's size from its character count (slide-toolbox/lib.ts
// fitType), which can't know the brand's face: a wide one (a semi mono, a bold
// grotesk) wraps a line more than the estimate allows, and the slide overflows.
// This runs in the page once the real fonts have loaded, before the deck says
// it's ready (so shots, the PDF and the audit all see the result): every
// element marked data-fit="<stage lines> [<phone lines>]" is measured as
// rendered and shrunk until it fits that many lines and its own width (0 lines:
// its width only, for a run whose superscripts would miscount), then
// each slide holding one is shrunk further while its content overflows the
// slide. The CSS size stays the ceiling; nothing grows, and nothing shrinks
// below FLOOR of it.

const FLOOR = 0.6;
const PHONE = '(max-width: 799px)';

const lineHeight = (style) => {
  const lh = parseFloat(style.lineHeight);
  return Number.isFinite(lh) ? lh : parseFloat(style.fontSize) * 1.2;
};

/** Lines the element's text sets on, and whether any of it runs past the element's width. */
export function measure(el) {
  const style = getComputedStyle(el);
  const box = el.getBoundingClientRect();
  // Slides on the stage are scaled with a transform; layout sizes aren't.
  const scale = el.offsetWidth ? box.width / el.offsetWidth : 1;
  const range = document.createRange();
  range.selectNodeContents(el);
  const step = lineHeight(style) * scale * 0.5;
  const mids = [...range.getClientRects()].filter((r) => r.width && r.height).map((r) => r.top + r.height / 2).sort((a, b) => a - b);
  let lines = 0;
  let last = -Infinity;
  for (const m of mids) {
    if (m - last > step) lines += 1;
    last = m;
  }
  const text = range.getBoundingClientRect();
  const wide = el.scrollWidth > el.clientWidth + 1 || (el.clientWidth > 0 && text.width / scale > el.clientWidth + 1);
  return { lines, wide };
}

const maxLines = (el, phone) => {
  const [stage, small = stage] = String(el.dataset.fit).trim().split(/\s+/).map(Number);
  return (phone ? small : stage) || Infinity;
};

/** Apply the largest scale, between FLOOR and 1 of each element's CSS size, at which `fits()` holds. */
function largestFitting(els, fits) {
  const start = els.map((el) => parseFloat(getComputedStyle(el).fontSize));
  const set = (k) => els.forEach((el, i) => el.style.setProperty('font-size', `${(start[i] * k).toFixed(2)}px`));
  if (fits()) return 1;
  let lo = FLOOR;
  let hi = 1;
  set(lo);
  if (!fits()) return lo;
  // Binary search to 1%: about seven layouts.
  while (hi - lo > 0.01) {
    const mid = (lo + hi) / 2;
    set(mid);
    if (fits()) lo = mid;
    else hi = mid;
  }
  set(lo);
  return lo;
}

const overflow = (slide) => Math.max(slide.scrollHeight - slide.clientHeight, slide.scrollWidth - slide.clientWidth, 0);

/** Fit every [data-fit] element under `root` to its lines, then to its slide. Returns how many it fitted. */
export function fitText(root = document) {
  const html = document.documentElement;
  const phone = matchMedia(PHONE).matches && !html.classList.contains('is-pdf');
  const els = [...root.querySelectorAll('[data-fit]')];
  for (const el of els) el.style.removeProperty('font-size');
  for (const el of els) {
    const max = maxLines(el, phone);
    largestFitting([el], () => {
      const m = measure(el);
      return m.lines <= max && !m.wide;
    });
  }
  const slides = new Set(els.map((el) => el.closest('.slide')).filter(Boolean));
  for (const slide of slides) {
    const before = overflow(slide);
    if (before <= 1) continue;
    const own = els.filter((el) => el.closest('.slide') === slide);
    const sizes = own.map((el) => el.style.fontSize);
    largestFitting(own, () => overflow(slide) <= 1);
    // Smaller type didn't help (something else overflows): put it back.
    if (overflow(slide) >= before) own.forEach((el, i) => (el.style.fontSize = sizes[i]));
  }
  return els.length;
}

/**
 * Fit once the fonts the fitted elements use have loaded, and again when the
 * phone layout switches or a late font arrives. Resolves after the first fit.
 */
export async function fitTextWhenReady(root = document) {
  const els = [...root.querySelectorAll('[data-fit]')];
  await Promise.all(
    els.map((el) => {
      const s = getComputedStyle(el);
      return document.fonts.load(`${s.fontStyle} ${s.fontWeight} 16px ${s.fontFamily}`, el.textContent || 'x').catch(() => null);
    }),
  );
  await document.fonts.ready;
  fitText(root);
  let queued = 0;
  const again = () => {
    cancelAnimationFrame(queued);
    queued = requestAnimationFrame(() => fitText(root));
  };
  matchMedia(PHONE).addEventListener('change', again);
  document.fonts.addEventListener?.('loadingdone', again);
  addEventListener('resize', again);
}
