// Checks a laid-out piece against its format and its brand. Runs in the page; the build reads the result.
//   problems  fail the build: copy outside the safe area, off-palette color, accent limit, wrong font, no logo
//   warnings  printed in the report: photos below the format's resolution at finished size
import { accentProblems, clip, effectiveDpi, hexOf, outside, paletteProblems } from './rules.mjs';

export async function check({ W, H, inset, PX_IN }) {
  const config = await (await fetch(new URL('./config.json', import.meta.url))).json();
  const piece = config.pieces[document.body.dataset.piece] ?? {};
  const problems = [], warnings = [];
  const box = { left: inset.bleed + inset.l, top: inset.bleed + inset.t, right: W - inset.bleed - inset.r, bottom: H - inset.bleed - inset.b };
  const used = [];
  let minPt = Infinity;
  const fonts = config.fonts.map((f) => f.toLowerCase());
  for (const el of document.querySelectorAll('.canvas *')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (own) used.push(hexOf(cs.color));
    used.push(hexOf(cs.backgroundColor));
    if (parseFloat(cs.borderTopWidth)) used.push(hexOf(cs.borderTopColor));
    if (parseFloat(cs.borderLeftWidth)) used.push(hexOf(cs.borderLeftColor));
    for (const ps of ['::before', '::after']) {
      const p = getComputedStyle(el, ps);
      if (p.content === 'none') continue;
      used.push(hexOf(p.backgroundColor));
      if (parseFloat(p.borderTopWidth)) used.push(hexOf(p.borderTopColor));
    }
    if (el.dataset.color) used.push(...el.dataset.color.split(/[\s,]+/).map((h) => h.toLowerCase()));
    if (!own) continue;
    const family = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim().toLowerCase();
    if (fonts.length && !fonts.includes(family)) problems.push(`font "${family}" isn't the brand's: "${el.textContent.trim().slice(0, 30)}"`);
    else if (!document.fonts.check(`${cs.fontStyle} ${cs.fontWeight} 12px "${cs.fontFamily.split(',')[0].replace(/["']/g, '')}"`)) problems.push(`font not loaded (${cs.fontWeight} ${cs.fontStyle}): "${el.textContent.trim().slice(0, 30)}"`);
    const clips = [];
    for (let a = el.parentElement; a && !a.classList.contains('canvas'); a = a.parentElement) if (getComputedStyle(a).overflow !== 'visible') clips.push(a.getBoundingClientRect());
    const range = document.createRange(); range.selectNodeContents(el);
    if (!piece.mockup && [...range.getClientRects()].some((r) => outside(clip(r, clips), box))) problems.push(`copy outside the safe area: "${el.textContent.trim().slice(0, 30)}"`);
    if (piece.kind !== 'screen') minPt = Math.min(minPt, (parseFloat(cs.fontSize) / PX_IN) * 72);
  }
  // A mockup shows a piece on a product or wall: its props aren't brand color.
  if (!piece.mockup) {
    problems.push(...paletteProblems(used.filter(Boolean), new Set(config.palette)));
    problems.push(...accentProblems(used.filter(Boolean), config.accents, piece.variant));
  }
  const logos = document.querySelectorAll('.canvas [data-logo]').length;
  if (!logos && !piece.logo_exempt && !piece.mockup) problems.push('no logo: every stand-alone piece carries one (mark it data-logo), or give the piece a logo_exempt reason');
  if (piece.kind === 'print' || piece.kind === 'merch') {
    for (const img of document.querySelectorAll('.canvas img')) {
      const r = img.getBoundingClientRect();
      if (!r.width || r.right <= 0 || r.left >= W) continue;
      // Vector art (an SVG logo) has no resolution to run out of.
      if (/\.svg(\?|#|$)/i.test(img.currentSrc || img.src)) continue;
      const dpi = effectiveDpi({ naturalW: img.naturalWidth, naturalH: img.naturalHeight, boxW: r.width, boxH: r.height, cover: getComputedStyle(img).objectFit === 'cover', pxIn: PX_IN });
      if (piece.dpi_min && dpi < piece.dpi_min && !img.hasAttribute('data-texture')) warnings.push(`${img.getAttribute('src')} prints at ${dpi} ppi; ${piece.format} needs ${piece.dpi_min}`);
    }
  }
  return { problems: [...new Set(problems)], warnings: [...new Set(warnings)], min_text_pt: isFinite(minPt) ? +minPt.toFixed(1) : null, logos };
}
