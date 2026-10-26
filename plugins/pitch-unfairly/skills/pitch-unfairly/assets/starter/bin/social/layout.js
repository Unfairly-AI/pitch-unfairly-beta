/* Social engine layout (social@1). Runs in the browser page that bin/social/page.mjs builds.
   A format is a spec from the registry (bin/social/registry.mjs): canvas, safe zone, media, kind.
   Nothing is hand-placed: the layout family comes from the canvas shape and kind, the geometry
   from the safe zone, and every headline shrinks until it fits its box. After layout, every text
   box is measured against the safe zone and any that leave it are recorded on el.__violations.
   Content comes from social/campaign.json (angles, cards, CTA) and social/moments/*.js (the
   animated product moments). Compositions are pure functions of time: build(el) returns update(t). */
(function () {
  const SOCIAL = (window.SOCIAL = window.SOCIAL || {});
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const E = {
    out: (t) => 1 - Math.pow(1 - t, 3),
    expo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    back: (t) => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  };
  const k = (t, at, dur, e = E.out) => e(clamp((t - at) / dur));
  const lerp = (a, b, x) => a + (b - a) * x;
  const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const q = (el, key) => el.querySelector(`[data-k="${key}"]`);
  const show = (node, x, dy = 18) => { if (!node) return; node.style.opacity = x; node.style.transform = `translateY(${(1 - x) * dy}px)`; };
  const arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

  /* ---------- the run's inputs, set by the page before this script ---------- */
  const SPECS = SOCIAL.specs || [];
  const CAMP = SOCIAL.campaign || {};
  const BRAND = SOCIAL.brand || {};
  const ANGLES = CAMP.angles || {};
  const MOMENTS = SOCIAL.moments || {};
  const CTA = CAMP.cta || 'Learn more';
  const OFFER = CAMP.offer || '';
  const URL_TEXT = CAMP.url || BRAND.domain || '';
  const MUTED_ON_NIGHT = 'color-mix(in oklab, var(--on-night) 55%, var(--night))';
  const initial = esc((BRAND.wordmark || BRAND.name || '?').trim()[0] || '?');
  const MARK = BRAND.mark ? `<img class="mark" src="${esc(BRAND.mark)}" alt="">` : `<span class="tile"><b>${initial}</b></span>`;
  const LOGO = `<span class="logo">${MARK}<span class="wm">${esc(BRAND.wordmark || BRAND.name || '')}</span></span>`;

  /* ---------- geometry ---------- */
  function safeRect(spec) {
    const W = spec.canvas.w, H = spec.canvas.h, z = spec.safe_zone || {};
    const pct = z.units === '%';
    const v = (x, of) => (x == null ? 0 : pct ? (x / 100) * of : x);
    const top = v(z.top, H), bottom = v(z.bottom, H), left = v(z.left, W), right = v(z.right, W);
    return { x: left, y: top, w: W - left - right, h: H - top - bottom };
  }
  const inset = (r, p) => ({ x: r.x + p, y: r.y + p, w: r.w - 2 * p, h: r.h - 2 * p });
  function place(node, r) { Object.assign(node.style, { position: 'absolute', left: r.x + 'px', top: r.y + 'px', width: r.w + 'px' }); if (r.h != null) node.style.height = r.h + 'px'; }
  // shrink font until the block fits maxW × maxH (deterministic: same inputs → same size)
  function fit(node, maxW, maxH, start, min) {
    let s = start; node.style.width = maxW + 'px'; node.style.fontSize = s + 'px';
    for (let i = 0; i < 80 && (node.offsetHeight > maxH + 0.5 || node.scrollWidth > maxW + 0.5) && s > min; i++) { s = Math.max(min, s * 0.965); node.style.fontSize = s + 'px'; }
    return s;
  }
  const kindOf = (s) => s.kind || 'post';

  /* ---------- one composition for one spec ---------- */
  function compose(angle, spec, opts = {}) {
    const A = ANGLES[angle], X = (A && A.moment && MOMENTS[A.moment]) || null;
    const W = spec.canvas.w, H = spec.canvas.h, kind = kindOf(spec);
    const vid = (spec.media || []).includes('video');
    const loopy = vid && !opts.card && (spec.loop ?? (W / H >= 0.7));
    const vmin = spec.video?.min_s ?? 1, vmax = spec.video?.max_s ?? 60;
    const dur = !vid ? 0 : clamp(W / H < 0.7 ? 8 : 6, vmin, Math.min(vmax, spec.video?.max_s ?? 60));
    return {
      id: opts.id || `${angle}--${spec.id}`, angle, spec, kind, w: W, h: H, dur, loop: loopy,
      poster: Math.max(0, (dur || 6) - 0.6), label: spec.name, card: opts.card,
      build(el) {
        el.className = 'cv' + (A.dark && kind === 'banner' ? ' on-dark' : '');
        el.style.width = W + 'px'; el.style.height = H + 'px';
        const S = safeRect(spec);
        const u = Math.min(S.w, S.h);
        const p = Math.round(clamp(u * 0.075, 6, 96));
        const C = inset(S, p);
        const cr = C.w / C.h;
        // the canvas shape picks the layout family (a 9:16 story stays a story even when its safe area is near-square);
        // covers are the exception: only their safe area is guaranteed to show, so it alone decides
        const r = kind === 'cover' ? cr : W / H;
        const big = C.w * C.h > 420000;
        const longCopy = (kind === 'post' || kind === 'ad') && big && r < 2.2 && cr < 2.6;
        const head = longCopy ? A.head : A.short, ac = longCopy ? A.ac : A.shortAc;
        const tiny = C.h < 70 || (C.w < 140 && C.w > C.h); // short strips; skinny skyscrapers stay stacked
        const darkBanner = A.dark && kind === 'banner';
        const fg = darkBanner ? 'var(--on-night)' : 'var(--ink)';
        const acc = darkBanner ? 'var(--accent-on-night)' : 'var(--accent)';
        const withEx = !!X && kind !== 'banner' && kind !== 'avatar' && C.h >= 160 && !(r >= 3.2 && C.h < 300);
        const withCta = (kind === 'ad' || kind === 'banner') && !(r > 0.95 && r < 1.35 && kind === 'ad' && big); // square feed ads use the native button
        el.innerHTML = `<div class="blk" data-k="blk"></div>
          <div data-k="logo" data-safe>${LOGO}</div>
          <h1 class="hd" data-k="hd" data-safe style="color:${fg}">${esc(tiny ? A.micro : head)} <span class="ac" data-k="ac" style="color:${acc};${r >= 3.2 || tiny ? 'display:inline' : ''}">${tiny ? '' : esc(ac)}</span></h1>
          <p class="sub" data-k="sub" data-safe>${esc(A.sub)}</p>
          <div class="ex-area" data-k="area"><div class="ex" data-k="ex">${withEx ? X.html : ''}</div></div>
          <span class="note" data-k="note" data-safe>${esc(A.note || '')}</span>
          <div class="cta" data-k="cta" data-safe><span class="btn">${esc(CTA)} ${arrow}</span><span class="offer" data-k="offer">${esc(OFFER)}</span></div>`;
        if (darkBanner) el.style.background = 'var(--night)';
        const n = (key) => q(el, key);
        const logo = n('logo'), hd = n('hd'), sub = n('sub'), area = n('area'), ex = n('ex'), note = n('note'), cta = n('cta'), blk = n('blk');
        logo.firstElementChild.style.fontSize = '1em';
        if (darkBanner && logo.querySelector('.wm')) logo.querySelector('.wm').style.color = 'var(--on-night)';
        sub.hidden = true; note.hidden = true; cta.hidden = !withCta;
        n('offer').hidden = true;
        let exRect = null; const exScale = { s: 1 };

        if (kind === 'logo') { // wide logo slot: tile + wordmark, centred, ~70% of the width
          logo.firstElementChild.style.fontSize = '100px';
          place(logo, { x: 0, y: 0, w: null }); logo.style.width = 'auto';
          const lw = logo.firstElementChild.offsetWidth, lh = logo.firstElementChild.offsetHeight;
          const f = Math.min((W * 0.7) / lw, (H * 0.6) / lh) * 100;
          logo.firstElementChild.style.fontSize = f + 'px';
          logo.style.left = (W - logo.firstElementChild.offsetWidth) / 2 + 'px'; logo.style.top = (H - logo.firstElementChild.offsetHeight) / 2 + 'px';
          hd.hidden = true; area.hidden = true; blk.hidden = true; cta.hidden = true;
          el.style.background = 'var(--paper)';
        } else if (kind === 'avatar') { // the tile alone, centred inside the circle crop
          logo.innerHTML = `<span class="logo">${MARK}</span>`;
          const d = Math.min(W, H) * 0.5;
          logo.firstElementChild.style.fontSize = d / 0.82 + 'px';
          place(logo, { x: (W - d) / 2 - d * 0.03, y: (H - d) / 2 - d * 0.03, w: d * 1.1 });
          hd.hidden = true; area.hidden = true; blk.hidden = true;
          el.style.background = 'var(--paper)';
        } else if ((r >= 3.2 && (kind === 'cover' || C.h < 150)) || tiny) { // strip: logo | headline | button (tall-enough wide banners stack instead)
          const lf = clamp(C.h * (C.h < 70 ? 0.62 : 0.42), 12, 64);
          logo.style.fontSize = lf + 'px';
          if ((C.h < 70 || C.w < 500) && logo.querySelector('.wm')) logo.querySelector('.wm').hidden = true;
          place(logo, { x: C.x, y: 0, w: null }); logo.style.width = 'auto';
          const lw = logo.firstElementChild.offsetWidth;
          logo.style.top = C.y + (C.h - logo.offsetHeight) / 2 + 'px';
          let cw = 0;
          if (withCta) {
            cta.style.fontSize = clamp(C.h * 0.26, 10, 28) + 'px';
            if (C.h < 70 && cta.querySelector('svg')) cta.querySelector('svg').remove();
            place(cta, { x: 0, y: 0, w: null }); cta.style.width = 'auto';
            cw = cta.offsetWidth;
            if (cw > C.w * 0.36) { // the button may take at most about a third of the strip
              const f = parseFloat(cta.style.fontSize) * ((C.w * 0.36) / cw);
              cta.style.fontSize = Math.max(9, f) + 'px';
              if (f < 12 && cta.querySelector('svg')) cta.querySelector('svg').remove();
              cw = cta.offsetWidth;
            }
            cta.style.left = C.x + C.w - cw + 'px'; cta.style.top = C.y + (C.h - cta.offsetHeight) / 2 + 'px';
          }
          const gap = Math.max(8, C.h * 0.25);
          let hx = C.x + lw + gap, hw = C.w - lw - gap - (cw ? cw + gap : 0);
          if (withEx && kind === 'cover') { // brand banners with room: the product moment on the right
            const ew = C.w * 0.34; hw -= ew + gap;
            exRect = { x: C.x + C.w - ew, y: C.y, w: ew, h: C.h };
            blk.style.cssText += `;left:${C.x + C.w - ew - gap}px;top:0;right:0;bottom:0;background:${A.tint}`;
          } else blk.hidden = true;
          hd.style.lineHeight = '1.05';
          fit(hd, hw, C.h, C.h * 0.42, 8);
          place(hd, { x: hx, y: 0, w: hw }); hd.style.top = C.y + (C.h - hd.offsetHeight) / 2 + 'px';
          if (kind === 'cover') { note.hidden = false; note.textContent = URL_TEXT; note.style.fontSize = clamp(C.h * 0.09, 12, 28) + 'px'; place(note, { x: hx, y: 0, w: hw }); note.style.top = parseFloat(hd.style.top) + hd.offsetHeight + C.h * 0.06 + 'px'; note.style.color = 'var(--ink-muted)'; if (note.offsetTop + note.offsetHeight > C.y + C.h) note.hidden = true; }
        } else if (r >= 1.3) { // landscape: copy column left, product moment right
          const colW = C.w * (withEx ? 0.5 : 1);
          logo.style.fontSize = clamp(Math.max(u * 0.07, C.w * 0.022), 14, 56) + 'px';
          place(logo, { x: C.x, y: C.y, w: colW }); logo.style.width = 'auto';
          let y = C.y + logo.offsetHeight + u * 0.07;
          let bottom = C.y + C.h;
          if (withCta) {
            cta.style.fontSize = clamp(u * 0.055, 11, 30) + 'px';
            place(cta, { x: C.x, y: 0, w: colW }); cta.style.top = bottom - cta.offsetHeight + 'px';
            bottom -= cta.offsetHeight + u * 0.06;
          }
          const hs = fit(hd, colW, bottom - y, u * (kind === 'thumb' ? 0.2 : 0.13), 9);
          place(hd, { x: C.x, y, w: colW });
          if (kind === 'post' && C.h > 420 && longCopy) {
            sub.hidden = false; sub.style.fontSize = Math.max(hs * 0.36, 14) + 'px';
            place(sub, { x: C.x, y: y + hd.offsetHeight + u * 0.04, w: colW * 0.92 });
            if (sub.offsetTop + sub.offsetHeight > bottom) sub.hidden = true;
          }
          if (withEx) {
            exRect = { x: C.x + C.w * 0.55, y: C.y, w: C.w * 0.45, h: C.h };
            blk.style.cssText += `;left:${C.x + C.w * 0.62}px;top:0;right:0;bottom:0;background:${A.tint}`;
          } else blk.hidden = true;
        } else { // square, portrait, vertical: stacked
          const vertical = r < 0.7;
          logo.style.fontSize = clamp(u * 0.045, 13, 56) + 'px';
          place(logo, { x: C.x, y: C.y, w: C.w }); logo.style.width = 'auto';
          if (kind !== 'banner' && r >= 0.95 && C.w > 600 && !opts.card) { // squares: the honesty note rides in the header (cards carry a page count there)
            note.hidden = false; note.style.fontSize = clamp(u * 0.017, 11, 20) + 'px';
            note.style.textAlign = 'right'; place(note, { x: C.x, y: C.y, w: C.w }); note.style.width = 'auto'; note.style.left = C.x + C.w - note.offsetWidth + 'px';
            note.style.top = C.y + (logo.offsetHeight - note.offsetHeight) / 2 + 'px';
            note.style.color = 'var(--ink-muted)';
          }
          let y = C.y + logo.offsetHeight + u * 0.06;
          let bottom = C.y + C.h;
          if (withCta) {
            cta.style.fontSize = clamp(u * (kind === 'banner' ? 0.075 : 0.032), 11, 36) + 'px';
            const roomForOffer = !vertical && C.w >= 800 && kind === 'ad';
            n('offer').hidden = !roomForOffer;
            if (vertical && kind !== 'banner') { const o = n('offer'); o.hidden = false; o.textContent = URL_TEXT; }
            place(cta, { x: C.x, y: 0, w: C.w });
            if (kind === 'banner' && C.w < 200) { cta.style.justifyContent = 'center'; cta.querySelector('.btn').style.width = '100%'; cta.querySelector('.btn').style.justifyContent = 'center'; }
            cta.style.top = bottom - cta.offsetHeight + 'px';
            bottom -= cta.offsetHeight + u * 0.06;
          }
          const textShare = !withEx ? 1 : vertical ? (cr > 0.8 ? 0.3 : 0.36) : 0.36;
          // banners: the headline is the whole ad, so start from the width and let it fill the column
          const start = kind === 'banner' ? Math.max(u * 0.11, C.w * (r < 0.5 ? 0.2 : 0.13)) : u * 0.085;
          const hs = fit(hd, C.w, (bottom - y) * (kind === 'banner' ? 0.8 : textShare), start, 9);
          place(hd, { x: C.x, y, w: C.w });
          y += hd.offsetHeight;
          if (r < 0.95 && longCopy && kind !== 'banner' && cr < 0.95) {
            sub.hidden = false; sub.style.fontSize = Math.max(hs * 0.38, u * 0.028) + 'px';
            place(sub, { x: C.x, y: y + u * 0.035, w: C.w * 0.94 });
            y = sub.offsetTop + sub.offsetHeight;
          }
          if (kind === 'banner') { // vertically centre the copy between logo and button
            const top = C.y + logo.offsetHeight, free = bottom - top - hd.offsetHeight;
            hd.style.top = top + free * 0.45 + 'px';
          }
          if (withEx) {
            y += u * 0.07;
            const bleed = r >= 0.95 && !withCta; // squares: let the exhibit run off the bottom edge
            exRect = { x: C.x, y, w: C.w, h: (bleed ? H - y : bottom - y) };
            const bt = y + Math.min(90, exRect.h * 0.16);
            blk.style.cssText += `;left:0;right:0;top:${bt}px;bottom:0;background:${A.tint}`;
            if (A.dark && withCta) { cta.querySelector('.offer').style.color = 'var(--on-night)'; }
            if (!note.hidden) {} else if (!bleed) { note.hidden = false; note.style.fontSize = clamp(u * 0.016, 11, 18) + 'px'; note.style.textAlign = 'center'; }
          } else blk.hidden = true;
        }

        // the product moment: scale into its rect, centred, top-aligned (bleeding rects may overflow)
        if (exRect && withEx) {
          const bleedOk = exRect.y + exRect.h >= H - 1;
          let s = Math.min(exRect.w / X.w, exRect.h / X.h) * (bleedOk ? 1.12 : 1);
          if (!bleedOk && note.hidden === false && note.style.textAlign === 'center') s = Math.min(exRect.w / X.w, (exRect.h - 40) / X.h);
          s = Math.min(s, 2.2);
          exScale.s = s;
          place(area, { x: exRect.x, y: exRect.y, w: exRect.w, h: exRect.h });
          area.style.overflow = 'visible';
          ex.style.left = (exRect.w - X.w * s) / 2 + 'px';
          ex.style.top = (r >= 1.3 ? (exRect.h - X.h * s) / 2 : 0) + 'px';
          if (note.style.textAlign === 'center' && !note.hidden) {
            place(note, { x: exRect.x, y: exRect.y + X.h * s + 18, w: exRect.w });
            note.style.color = A.dark ? MUTED_ON_NIGHT : 'var(--ink-muted)';
            if (note.offsetTop + note.offsetHeight > (withCta ? cta.offsetTop - 6 : C.y + C.h)) note.hidden = true;
          }
        } else area.hidden = true;
        if (A.dark && kind !== 'banner' && !blk.hidden) {
          const o = cta.querySelector('.offer'); if (o && parseFloat(cta.style.top) > parseFloat(blk.style.top || 0)) o.style.color = 'var(--on-night)';
        }

        // safe-zone audit: every text box must sit inside the safe rect
        const violations = [];
        el.querySelectorAll('[data-safe]').forEach((node) => {
          if (node.hidden || node.closest('[hidden]') || !node.offsetWidth) return;
          const x = node.offsetLeft, y = node.offsetTop, w = node.offsetWidth, h = node.offsetHeight;
          if (x < S.x - 1 || y < S.y - 1 || x + w > S.x + S.w + 1 || y + h > S.y + S.h + 1) violations.push({ el: node.dataset.k, box: [x, y, w, h].map(Math.round), safe: [S.x, S.y, S.w, S.h] });
          if (node.scrollWidth > node.offsetWidth + 1) violations.push({ el: node.dataset.k, overflow: 'text wider than its box' });
        });
        // collisions: no text box may overlap another, or the product moment's drawn box
        const boxes = [];
        el.querySelectorAll('[data-safe]').forEach((node) => {
          if (node.hidden || node.closest('[hidden]') || !node.offsetWidth) return;
          boxes.push({ k: node.dataset.k, x: node.offsetLeft, y: node.offsetTop, w: node.offsetWidth, h: node.offsetHeight });
        });
        if (exRect && withEx && !area.hidden) {
          boxes.push({ k: 'moment', x: exRect.x + parseFloat(ex.style.left || 0), y: exRect.y + parseFloat(ex.style.top || 0), w: X.w * exScale.s, h: X.h * exScale.s });
        }
        const hit = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 2 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 2;
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
          if (hit(boxes[i], boxes[j])) violations.push({ el: boxes[i].k, overflow: `overlaps ${boxes[j].k}` });
        }
        el.__violations = violations;

        const exClock = r < 0.7 ? 0.8 : 0.3;
        return (t) => {
          if (!dur) { if (withEx) { ex.style.transform = `scale(${exScale.s})`; X.update(X.end + 2, ex); } return; }
          const out = loopy ? k(t, dur - 0.5, 0.45) : 0;
          const tx = t - exClock;
          if (withEx) {
            ex.style.opacity = 1 - out;
            ex.style.transform = `translateY(${(1 - k(tx, 0, 0.6)) * 40}px) scale(${exScale.s})`;
            X.update(tx, ex);
          }
          if (r < 0.7) {
            show(hd, k(t, 0.1, 0.5), 24); show(n('ac'), k(t, 0.45, 0.5), 18);
            if (withCta) show(cta, k(t, X.end + exClock - 0.2, 0.5), 24);
          }
        };
      },
    };
  }

  /* ---------- carousels and documents: the campaign's card sequence ---------- */
  // campaign.cards: [{ head, ac, sub }, { angle: "A" }, ..., { close: true, head, ac }]
  const CARDS = CAMP.cards && CAMP.cards.length ? CAMP.cards : Object.keys(ANGLES).map((a) => ({ angle: a }));
  function card(spec, i) {
    const c = CARDS[i], n = CARDS.length;
    if (c.angle) {
      const comp = compose(c.angle, { ...spec, kind: 'post', media: ['image'] }, { id: `X${i + 1}--${spec.id}`, card: i + 1 });
      const b = comp.build;
      comp.build = (el) => { const up = b(el); pager(el, spec, i, n); return up; };
      return { ...comp, angle: 'X', label: `${spec.name} · card ${i + 1}/${n}` };
    }
    return {
      id: `X${i + 1}--${spec.id}`, angle: 'X', spec, kind: 'card', w: spec.canvas.w, h: spec.canvas.h, dur: 0, poster: 0, label: `${spec.name} · card ${i + 1}/${n}`, card: i + 1,
      build(el) {
        const W = spec.canvas.w, H = spec.canvas.h, S = safeRect(spec), u = Math.min(S.w, S.h), C = inset(S, Math.round(u * 0.08));
        el.className = 'cv'; el.style.width = W + 'px'; el.style.height = H + 'px';
        const dark = !!c.close;
        el.style.background = dark ? 'var(--accent)' : 'var(--paper)';
        el.innerHTML = `<div data-k="logo" data-safe>${LOGO}</div><h1 class="hd" data-k="hd" data-safe style="color:${dark ? 'var(--on-accent)' : 'var(--ink)'}">${esc(c.head)} <span class="ac" style="color:${dark ? 'var(--on-accent)' : 'var(--accent)'};${dark ? 'opacity:.82' : ''}">${esc(c.ac || '')}</span></h1>
          ${dark ? `<div class="cta" data-k="cta" data-safe><span class="btn" style="background:var(--on-accent);color:var(--accent);box-shadow:none">${esc(CTA)} ${arrow}</span><span class="offer" style="color:var(--on-accent)">${esc(URL_TEXT)}</span></div>` : c.sub ? `<p class="sub" data-k="sub" data-safe>${esc(c.sub)}</p>` : ''}`;
        const logo = q(el, 'logo'), hd = q(el, 'hd');
        logo.style.fontSize = clamp(u * 0.045, 14, 56) + 'px'; place(logo, { x: C.x, y: C.y, w: C.w }); logo.style.width = 'auto';
        if (dark && logo.querySelector('.wm')) { logo.querySelector('.wm').style.color = 'var(--on-accent)'; }
        fit(hd, C.w, C.h * 0.5, u * 0.11, 12);
        place(hd, { x: C.x, y: C.y + C.h * 0.28, w: C.w });
        const sub = q(el, 'sub');
        if (sub) { sub.style.fontSize = u * 0.034 + 'px'; place(sub, { x: C.x, y: hd.offsetTop + hd.offsetHeight + u * 0.05, w: C.w * 0.9 }); }
        const cta = q(el, 'cta');
        if (cta) { cta.style.fontSize = u * 0.036 + 'px'; place(cta, { x: C.x, y: 0, w: C.w }); cta.style.top = C.y + C.h - cta.offsetHeight + 'px'; }
        pager(el, spec, i, n, dark);
        el.__violations = [];
        return () => {};
      },
    };
  }
  function pager(el, spec, i, n, dark) { // "2/5" in the corner: tells the reader there is more to swipe
    const S = safeRect(spec), u = Math.min(S.w, S.h);
    const d = document.createElement('span');
    d.className = 'note'; d.textContent = `${i + 1}/${n}`;
    d.style.cssText += `;font-size:${clamp(u * 0.022, 11, 26)}px;color:${dark ? 'var(--on-accent)' : 'var(--ink-muted)'};text-align:right;width:${u * 0.2}px;left:${S.x + S.w - u * 0.08 - u * 0.2}px;top:${S.y + u * 0.08}px`;
    el.appendChild(d);
  }

  /* ---------- the catalogue: every selected spec × every angle ---------- */
  const COMPS = [];
  const angleIds = Object.keys(ANGLES);
  for (const spec of SPECS) {
    const media = spec.media || [];
    if (media.includes('carousel') || media.includes('document')) { for (let i = 0; i < CARDS.length; i++) COMPS.push(card(spec, i)); continue; }
    if (['avatar', 'logo'].includes(kindOf(spec))) { if (angleIds.length) COMPS.push(compose(angleIds[0], spec, { id: `brand--${spec.id}` })); continue; }
    for (const a of angleIds) COMPS.push(compose(a, spec));
  }
  SOCIAL.layout = { COMPS, safeRect, ANGLES };
})();
