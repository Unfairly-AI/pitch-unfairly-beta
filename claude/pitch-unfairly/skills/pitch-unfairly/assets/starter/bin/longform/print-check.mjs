// The checks that need the printed layout. PRINT_CHECK runs in the page (print media,
// viewport at the page's content width) and returns { problems, warnings }. The color
// rule is collateral's (hexOf, allowedColors), passed in as a list.

/** In-page: what the PDF would lose or get wrong. cfg: { palette, fonts, contentPx, ppiWarn, ppiMin }. */
export const PRINT_CHECK = (cfg) => {
  const problems = [];
  const warnings = [];
  const allowed = new Set(cfg.palette);
  const fonts = cfg.fonts.map((f) => f.toLowerCase());
  const hexOf = (css) => {
    if (!css) return null;
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(css);
    if (!m || m[4] === '0') return null;
    return `#${[m[1], m[2], m[3]].map((n) => (+n).toString(16).padStart(2, '0')).join('')}`;
  };
  const where = (el) => {
    const ch = el.closest('[data-chapter], .lf-cover, .lf-contents, .lf-back');
    const part = ch ? (ch.id ? `#${ch.id}` : `.${[...ch.classList].find((c) => c.startsWith('lf-'))}`) : 'page';
    const txt = (el.textContent || el.getAttribute('alt') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return `${part} <${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/)[0]}` : ''}>${txt ? ` "${txt}"` : ''}`;
  };
  const shown = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const main = document.querySelector('main') ?? document.body;
  const els = [main, ...main.querySelectorAll('*')].filter((el) => !el.closest('script, style, svg defs') && shown(el));
  const off = new Map();
  const note = (hex, el) => { if (hex && !allowed.has(hex) && !off.has(hex)) off.set(hex, where(el)); };
  for (const el of els) {
    const s = getComputedStyle(el);
    for (const pseudo of [null, '::before', '::after']) {
      const ps = pseudo ? getComputedStyle(el, pseudo) : s;
      if (pseudo && (ps.content === 'none' || ps.content === 'normal')) continue;
      if (ps.backgroundImage && ps.backgroundImage !== 'none') problems.push(`${where(el)}${pseudo ?? ''} has a background image or gradient, which the PDF drops (text on it can vanish). Give it a solid background-color in print, and use an <img> for a photo.`);
    }
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (own && !el.closest('svg')) {
      note(hexOf(s.color), el);
      const family = s.fontFamily.split(',')[0].replace(/["']/g, '').trim();
      if (fonts.length && !fonts.includes(family.toLowerCase())) problems.push(`${where(el)} is set in "${family}", not one of the brand's fonts (${cfg.fonts.join(', ')})`);
      else if (!document.fonts.check(`${s.fontStyle} ${s.fontWeight} 12px "${family}"`)) problems.push(`${where(el)}: the font ${family} ${s.fontWeight} ${s.fontStyle} didn't load`);
    }
    note(hexOf(s.backgroundColor), el);
    if (parseFloat(s.borderTopWidth)) note(hexOf(s.borderTopColor), el);
    if (parseFloat(s.borderLeftWidth)) note(hexOf(s.borderLeftColor), el);
    // Wider than the page's text block (the cover bleeds on purpose).
    if (!el.closest('.lf-cover')) {
      const r = el.getBoundingClientRect();
      if (r.right > cfg.contentPx + 2 && s.position !== 'fixed') problems.push(`${where(el)} is ${Math.round(r.width)}px wide and runs ${Math.round(r.right - cfg.contentPx)}px past the page's text block (${cfg.contentPx}px)`);
    }
  }
  if (off.size) problems.push(`colors outside the brand palette print: ${[...off].map(([h, w]) => `${h} (${w})`).join(', ')}. Use the kit's colors, or list a ground in longform.json "neutrals".`);
  // Photos: pixels per printed inch at the size they print.
  for (const img of main.querySelectorAll('img')) {
    if (!shown(img)) continue;
    if (!img.complete || !img.naturalWidth) { problems.push(`${where(img)} didn't load`); continue; }
    if (/\.svg(\?|$)/i.test(img.currentSrc || img.src)) continue;
    const inches = img.getBoundingClientRect().width / 96;
    const ppi = Math.round(img.naturalWidth / inches);
    if (ppi < cfg.ppiMin) problems.push(`${where(img)} prints at ${ppi} ppi; it needs ${cfg.ppiWarn}+ (a larger original, or print it smaller)`);
    else if (ppi < cfg.ppiWarn) warnings.push(`${where(img)} prints at ${ppi} ppi; ${cfg.ppiWarn}+ looks sharp on paper`);
  }
  // A printed way to act: the CTA on the web is often a button the PDF can't press.
  const act = [...main.querySelectorAll('a[href^="mailto:"], a[href^="tel:"], [data-print-contact], a[href^="https://"]')].some((el) => shown(el) && el.textContent.trim());
  if (!act) problems.push('the PDF has no way to act: keep a mailto:, tel: or https link visible in print, or a [data-print-contact] line');
  // Web-only instructions make no sense on paper.
  const webOnly = /\b(?:click|tap) (?:here|below|on|the|to)\b|\bscroll (?:down|up)\b|\bswipe\b|\bhover over\b/i;
  for (const el of els) {
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ');
    const m = webOnly.exec(own);
    if (m) { problems.push(`${where(el)} says "${m[0]}", which paper can't do. Hide it in print (data-print-hide) or reword it.`); break; }
  }
  return { problems: [...new Set(problems)], warnings: [...new Set(warnings)] };
};
