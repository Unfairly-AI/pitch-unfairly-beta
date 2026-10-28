// Sliced (stacked) headlines, drawn seam-free. A piece imports it from ../.engine/slices.js.
//
// The markup stays the description of the slices: a container (.stack or .slices) of .row windows,
// each `height: --h em` with `overflow: hidden`, and one <span> of text at `top: --o em` inside.
// Left to the browser, each row is a separately clipped box; at a fractional device pixel ratio the
// clip edges land mid-pixel, and where two rows meet both paint that pixel partly, so the join comes
// out semi-transparent: a hairline through the letters (white-on-black tee, black-on-white tumbler).
//
// drawSlices() keeps the DOM layout but paints the rows itself: one canvas over the container at
// device resolution, each row clipped to whole device pixels with shared boundaries (row n ends on
// exactly the pixel row n+1 starts), so every join pixel belongs to one row and is fully painted.
// The spans are hidden only after the canvas is drawn; the text stays in the DOM for the outline.
const SELECTOR = '.stack, .slices';

/** Draws every sliced headline in `root` at `dpr` device px per CSS px. Call after fonts load. */
export async function drawSlices(dpr = window.devicePixelRatio || 1, root = document) {
  for (const box of root.querySelectorAll(SELECTOR)) {
    const rows = [...box.children].filter((r) => r.classList.contains('row') && r.querySelector('span'));
    if (!rows.length) continue;
    if (getComputedStyle(box).position === 'static') box.style.position = 'relative';
    const b = box.getBoundingClientRect();
    const canvas = document.createElement('canvas');
    canvas.className = 'slices-canvas';
    canvas.width = Math.ceil(b.width * dpr);
    canvas.height = Math.ceil(b.height * dpr);
    Object.assign(canvas.style, { position: 'absolute', left: '0', top: '0', width: `${canvas.width / dpr}px`, height: `${canvas.height / dpr}px`, pointerEvents: 'none' });
    canvas.setAttribute('aria-hidden', 'true');
    const ctx = canvas.getContext('2d');
    for (const row of rows) {
      const span = row.querySelector('span');
      const cs = getComputedStyle(span);
      await document.fonts.load(cs.font, span.textContent);
      const r = row.getBoundingClientRect();
      // Whole device pixels, rounded from the container's origin: neighbours share their boundary.
      const y0 = Math.round((r.top - b.top) * dpr);
      const y1 = Math.round((r.bottom - b.top) * dpr);
      if (y1 <= y0) continue;
      const range = document.createRange();
      range.selectNodeContents(span);
      const t = range.getBoundingClientRect(); // the text's content box: its left is where the glyphs start
      // The DOM's own baseline, read from a zero-size probe sitting on it (font metrics round differently).
      const probe = document.createElement('i');
      probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
      span.append(probe);
      const baseline = probe.getBoundingClientRect().top - b.top;
      probe.remove();
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.beginPath();
      ctx.rect(0, y0, canvas.width, y1 - y0);
      ctx.clip();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = cs.font;
      ctx.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
      ctx.fontKerning = 'normal';
      ctx.fillStyle = cs.color;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(span.textContent, t.left - b.left, baseline);
      ctx.restore();
    }
    box.querySelector(':scope > .slices-canvas')?.remove();
    box.append(canvas);
    for (const row of rows) row.querySelector('span').style.visibility = 'hidden';
  }
}
