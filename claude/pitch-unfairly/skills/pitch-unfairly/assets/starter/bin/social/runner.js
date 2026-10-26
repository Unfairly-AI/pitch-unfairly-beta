/* Two modes. ?only=<id> renders one composition at native size for the exporter
   (window.__seek(t), window.__ready, window.__comp). Otherwise: the review gallery. */
(async function () {
  const { COMPS, safeRect } = window.SOCIAL.layout;
  const params = new URLSearchParams(location.search);
  const only = params.get('only');
  for (const f of window.SOCIAL.fonts || []) await document.fonts.load(f).catch(() => {});
  await document.fonts.ready;
  // A face that never loaded means every measurement used a fallback: fail loudly, never ship it.
  const fontsMissing = (window.SOCIAL.fonts || []).filter((f) => !document.fonts.check(f)).map((f) => ({ el: 'font', overflow: `${f} didn't load, so the layout was measured with a fallback face` }));
  const imgs = () => Promise.all([...document.images].map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; }))));

  if (only) {
    const c = COMPS.find((x) => x.id === only);
    document.body.style.margin = 0;
    const el = document.createElement('div');
    document.body.appendChild(el);
    const update = c.build(el);
    window.__comp = { id: c.id, w: c.w, h: c.h, dur: c.dur, poster: c.poster, loop: c.loop, kind: c.kind, card: c.card || 0, spec: c.spec.id, violations: [...fontsMissing, ...(el.__violations || [])] };
    window.__seek = (t) => update(t);
    update(c.poster);
    await imgs();
    window.__ready = true;
    return;
  }
  if (params.has('ids')) { document.body.textContent = JSON.stringify(COMPS.map((c) => c.id)); return; }

  const app = document.getElementById('app');
  const plats = [...new Set(COMPS.map((c) => c.spec.platform))];
  app.innerHTML = `<div class="gal"><h1>${(window.SOCIAL.brand && window.SOCIAL.brand.name) || 'Campaign'} · every format</h1>
    <p class="lede">${COMPS.length} assets across ${new Set(COMPS.map((c) => c.spec.id)).size} formats. Each is laid out from the platform's own spec: canvas, safe zone, aspect. Toggle the safe-zone overlay to see what the platform's UI covers.</p>
    <div class="bar" data-bar></div><div data-groups></div></div>`;
  const bar = app.querySelector('[data-bar]'), holder = app.querySelector('[data-groups]');
  const cards = [];
  for (const pl of plats) {
    const sec = document.createElement('section'); sec.dataset.plat = pl;
    sec.innerHTML = `<h2>${pl[0].toUpperCase() + pl.slice(1)}</h2><div class="grid"></div>`;
    holder.appendChild(sec);
    const grid = sec.querySelector('.grid');
    for (const c of COMPS.filter((x) => x.spec.platform === pl)) {
      const r = c.w / c.h;
      const target = r >= 3 ? 520 : r >= 1.3 ? 380 : r >= 0.9 ? 300 : 230;
      const s = Math.min(1, target / c.w);
      const card = document.createElement('div'); card.className = 'card';
      const sz = c.spec.safe_zone ? safeRect(c.spec) : null;
      card.innerHTML = `<div class="stage" style="width:${Math.round(c.w * s)}px;height:${Math.round(c.h * s)}px"></div><div class="meta" style="max-width:${Math.max(200, Math.round(c.w * s))}px"><b>${c.label}</b>${c.w}×${c.h} · ${c.dur ? c.dur + 's video' : 'image'} · <code>${c.spec.id}</code></div>`;
      const cv = document.createElement('div');
      card.querySelector('.stage').appendChild(cv);
      const update = c.build(cv);
      cv.style.transform = `scale(${s})`;
      if (sz) { const o = document.createElement('div'); o.className = 'safe-ov'; o.style.cssText = `left:${sz.x * s}px;top:${sz.y * s}px;width:${sz.w * s}px;height:${sz.h * s}px`; card.querySelector('.stage').appendChild(o); }
      if ((cv.__violations || []).length) card.querySelector('.meta').insertAdjacentHTML('beforeend', `<br><b style="color:#b3261e">${cv.__violations.length} safe-zone issue(s)</b>`);
      update(c.poster);
      grid.appendChild(card); cards.push({ c, update });
    }
  }
  [['all', 'All'], ...plats.map((p) => [p, p])].forEach(([k, l]) => {
    const b = document.createElement('button'); b.textContent = l; b.setAttribute('aria-pressed', k === 'all');
    b.onclick = () => { [...bar.children].forEach((x) => x.dataset.toggle || x.setAttribute('aria-pressed', x === b)); holder.querySelectorAll('section').forEach((s) => { s.hidden = !(k === 'all' || s.dataset.plat === k); }); };
    bar.appendChild(b);
  });
  const ov = document.createElement('button'); ov.dataset.toggle = 1; ov.textContent = 'Safe zones'; ov.setAttribute('aria-pressed', 'false');
  ov.onclick = () => { const on = ov.getAttribute('aria-pressed') !== 'true'; ov.setAttribute('aria-pressed', on); document.body.classList.toggle('show-safe', on); };
  bar.appendChild(ov);
  const t0 = performance.now();
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  (function tick(now) {
    const t = (now - t0) / 1000;
    for (const { c, update } of cards) if (c.dur) update(reduce ? c.poster : t % (c.dur + (c.loop ? 0 : 1.2)));
    requestAnimationFrame(tick);
  })(t0);
})();
