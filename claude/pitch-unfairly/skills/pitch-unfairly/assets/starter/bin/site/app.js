// Brings a built site to life: pickers, toggles, and calculators that rerun
// the site's model (the same model.mjs the build used), plus the motion and
// the section reporting that gives a hosted site its views.
import { runModel, displayValues, evaluate, format, pathProgress } from './model.mjs';

export function hydrate(root, model) {
  document.documentElement.classList.add('js');
  const $ = (s) => root.querySelector(s);
  const $$ = (s) => [...root.querySelectorAll(s)];
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches || /[?&]static\b/.test(location.search) || document.documentElement.classList.contains('is-print');
  let ready = false;

  // Set a figure's text; once the page is live, a value that changes rolls to
  // its new number (when it's one) and flashes so the eye finds what moved.
  const set = (el, next, rollTo) => {
    if (el.textContent === next) return;
    if (ready && !still) {
      el.classList.remove('is-changed');
      void el.offsetWidth;
      el.classList.add('is-changed');
      if (rollTo && el._v != null && el._v !== rollTo.v) {
        const from = el._v;
        el._v = rollTo.v;
        return tween(from, rollTo.v, 450, (x) => (el.textContent = rollTo.fmt(x)), el, next);
      }
    }
    if (rollTo) el._v = rollTo.v;
    if (!el.dataset.rolling) el.textContent = next;
  };

  // ── Pickers: tabs that choose a panel ──
  $$('[data-picker]').forEach((picker) => {
    const tabs = [...picker.querySelectorAll('[role="tab"]')];
    const show = (tab, focus) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.classList.toggle('is-on', on);
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        const panel = root.querySelector('#' + t.getAttribute('aria-controls'));
        panel?.classList.toggle('is-on', on);
        if (on && panel) {
          panel.classList.remove('is-shown');
          requestAnimationFrame(() => panel.classList.add('is-shown'));
        }
      });
      if (focus) tab.focus();
    };
    tabs.forEach((t, i) => {
      t.tabIndex = t.classList.contains('is-on') ? 0 : -1;
      t.addEventListener('click', () => show(t));
      t.addEventListener('keydown', (e) => {
        const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
        if (!step) return;
        e.preventDefault();
        show(tabs[(i + step + tabs.length) % tabs.length], true);
      });
    });
  });

  // ── Toggles ([data-toggle]): buttons with data-i choose which of each
  // [data-values] list shows. With data-of, the element's width follows too. ──
  $$('[data-toggle]').forEach((group) => {
    const buttons = [...group.querySelectorAll('button[data-i]')];
    buttons.forEach((b) =>
      b.addEventListener('click', () => {
        const i = Number(b.dataset.i);
        buttons.forEach((x) => {
          x.classList.toggle('is-on', x === b);
          x.setAttribute('aria-pressed', String(x === b));
        });
        group.querySelectorAll('[data-values]').forEach((el) => {
          const v = JSON.parse(el.dataset.values)[i];
          if (el.dataset.of) el.style.width = (Number(v) / Number(el.dataset.of)) * 100 + '%';
          else set(el, String(v));
        });
      }),
    );
  });

  // ── Dated paths ([data-dates]): steps carry data-date="2026-11-20". At load,
  // from the viewer's clock (or ?today=2026-11-25), the last step on or before
  // today gets is-now, earlier ones is-done, the next one is-next; the path gets
  // --now (today's position in steps, for a line that fills to today); and a
  // [data-today] marker moves into the current step's [data-date-label] (it hides
  // before the path starts). Without script, the classes written in the page stand.
  const asked = new URLSearchParams(location.search).get('today');
  const now = new Date();
  const todayIso = /^\d{4}-\d{2}-\d{2}$/.test(asked ?? '') ? asked : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  $$('[data-dates]').forEach((path) => {
    const steps = [...path.querySelectorAll('[data-date]')];
    const at = pathProgress(steps.map((s) => s.dataset.date), todayIso);
    if (!at) return;
    steps.forEach((s, i) => {
      s.classList.toggle('is-done', i < at.current);
      s.classList.toggle('is-now', i === at.current);
      s.classList.toggle('is-next', i === at.current + 1);
    });
    path.style.setProperty('--now', String(at.progress));
    const marker = path.querySelector('[data-today]');
    if (marker) {
      const host = steps[at.current];
      marker.hidden = !host;
      if (host) (host.querySelector('[data-date-label]') ?? host.firstElementChild ?? host).appendChild(marker);
    }
  });

  // ── The model: inputs the reader can change, and everything that follows ──
  const base = { ...(model.inputs ?? {}) };
  const overrides = {};
  let env = runModel(model);

  function update() {
    try {
      env = runModel(model, overrides);
    } catch {
      return; // a half-typed input; keep the last good figures
    }
    const shown = displayValues(model, env);
    $$('[data-v]').forEach((el) => {
      const k = el.dataset.v;
      if (!(k in shown)) return;
      set(el, shown[k], { v: env[k], fmt: (x) => format(x, model.formats?.[k]) });
      if (el.hasAttribute('data-sign')) el.classList.toggle('is-neg', env[k] < 0);
    });
    $$('[data-expr]').forEach((el) => {
      try {
        set(el, format(evaluate(el.dataset.expr, env), el.dataset.format));
      } catch {}
    });
    $$('[data-when]').forEach((el) => {
      try {
        el.hidden = !evaluate(el.dataset.when, env);
      } catch {}
    });
    // Bars that follow the model ([data-bar="name"]). Bars sharing a
    // [data-scale] parent share one scale; an SVG <rect> grows up from its
    // data-base line (height data-max), anything else sets its width.
    $$('[data-scale]').forEach((group) => {
      const bars = [...group.querySelectorAll('[data-bar]')];
      const vals = bars.map((b) => Math.max(0, Number(env[b.dataset.bar]) || 0));
      // data-scale-to="name" measures against a model value instead of the largest bar,
      // so a chart grows and shrinks as a whole when its input moves.
      const to = Number(env[group.dataset.scaleTo]);
      const max = Math.max(1e-9, ...(group.dataset.scaleTo && to > 0 ? [to] : vals));
      bars.forEach((b, i) => {
        const f = vals[i] / max;
        if (b instanceof SVGRectElement) {
          const h = f * Number(b.dataset.max ?? 180);
          const y = Number(b.dataset.base ?? 190) - h;
          b.setAttribute('height', h.toFixed(1));
          b.setAttribute('y', y.toFixed(1));
          // As style too, so a CSS transition on height and y glides the column when an input moves.
          b.style.height = h.toFixed(1) + 'px';
          b.style.y = y.toFixed(1) + 'px';
        } else b.style.width = (f * 100).toFixed(1) + '%';
      });
    });
    // [data-reset="name"]: shows only while that input differs from the model's own.
    $$('[data-reset]').forEach((b) => (b.hidden = env[b.dataset.reset] === base[b.dataset.reset]));
  }

  // Number inputs ([data-input]), with optional buttons [data-step=±n][data-for=name].
  $$('input[type=number][data-input]').forEach((inp) => {
    const k = inp.dataset.input;
    const clamp = (n) => Math.max(Number(inp.min) || 0, Math.min(Number(inp.max) || Infinity, Math.round(n)));
    const commit = (n) => {
      overrides[k] = clamp(n);
      inp.value = overrides[k];
      update();
    };
    inp.addEventListener('input', () => {
      const n = Number(inp.value);
      if (n >= (Number(inp.min) || 0) && inp.value !== '') {
        overrides[k] = clamp(n);
        update();
      }
    });
    inp.addEventListener('blur', () => commit(Number(inp.value) || base[k]));
    $$(`[data-step][data-for="${k}"]`).forEach((b) => b.addEventListener('click', () => commit((overrides[k] ?? base[k]) + Number(b.dataset.step))));
    $$(`[data-reset="${k}"]`).forEach((b) => b.addEventListener('click', () => commit(base[k])));
  });

  // Sliders, and presets that set several at once.
  const ranges = $$('input[type=range][data-input]');
  const showRange = (inp) => {
    const out = root.querySelector(`output[data-out="${inp.dataset.input}"]`);
    if (out) out.textContent = format(Number(inp.value), inp.dataset.format);
  };
  ranges.forEach((inp) =>
    inp.addEventListener('input', () => {
      overrides[inp.dataset.input] = Number(inp.value);
      showRange(inp);
      // A slider clears only its own calculator's presets ([data-calc]), or the page's.
      [...(inp.closest('[data-calc]') ?? root).querySelectorAll('[data-preset]')].forEach((b) => b.classList.remove('is-on'));
      update();
    }),
  );
  $$('[data-preset]').forEach((b) =>
    b.addEventListener('click', () => {
      // Values are numbers or formulas over the model's own inputs ("cons_e").
      const own = runModel(model);
      const values = Object.fromEntries(Object.entries(JSON.parse(b.dataset.preset)).map(([k, v]) => [k, typeof v === 'string' ? evaluate(v, own) : v]));
      // A preset starts from the model's own inputs, then applies its values.
      // Inside a [data-calc] it resets and marks only that calculator's sliders
      // and presets, so two calculators on one page leave each other alone.
      const scope = b.closest('[data-calc]') ?? root;
      const mine = ranges.filter((inp) => scope.contains(inp));
      for (const inp of mine) delete overrides[inp.dataset.input];
      Object.assign(overrides, values);
      mine.forEach((inp) => {
        const k = inp.dataset.input;
        inp.value = overrides[k] ?? base[k];
        showRange(inp);
      });
      [...scope.querySelectorAll('[data-preset]')].forEach((x) => x.classList.toggle('is-on', x === b));
      update();
    }),
  );

  // Choices ([data-choice]): a group of buttons with data-set='{"plan_i":1}'.
  // A click sets those inputs and nothing else (sliders keep their values) and
  // marks itself on within its group: a segmented control for an option.
  $$('[data-choice]').forEach((group) => {
    const buttons = [...group.querySelectorAll('button[data-set]')];
    buttons.forEach((b) =>
      b.addEventListener('click', () => {
        Object.assign(overrides, JSON.parse(b.dataset.set));
        buttons.forEach((x) => {
          x.classList.toggle('is-on', x === b);
          x.setAttribute('aria-pressed', String(x === b));
        });
        update();
      }),
    );
  });

  // ── On pitchunfairly.com the site runs in the badged frame. Report each
  // section as it comes into view, the way a deck reports slides, so views
  // show how far people read; and open at #N when the link carries one. ──
  const sections = $$('[data-section]');
  if (window.parent !== window && sections.length) {
    let current = -1;
    const report = (i) => {
      if (i === current) return;
      current = i;
      window.parent.postMessage({ type: 'deck:slide', index: i, total: sections.length }, '*');
    };
    const seen = new Map();
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => seen.set(en.target, en.isIntersecting));
        const i = sections.findIndex((s) => seen.get(s));
        if (i >= 0) report(i);
      },
      { rootMargin: '-45% 0px -54% 0px' },
    );
    sections.forEach((s) => io.observe(s));
    report(0);
  }
  // Calls to action: a click on a [data-cta] element (id "accept", "book_meeting", or
  // the site's own short id) posts deck:cta to the frame, the same way sections post
  // deck:slide, just before its link opens in a new tab. The frame records it.
  // Upstreamed from the WeishFest (v1.2.1) and Mainstay (v1.3.6) kits.
  if (window.parent !== window) {
    root.addEventListener('click', (e) => {
      const el = e.target.closest?.('[data-cta]');
      if (!el || !/^[A-Za-z0-9_-]{1,40}$/.test(el.dataset.cta)) return;
      window.parent.postMessage({ type: 'deck:cta', id: el.dataset.cta }, '*');
    }, true);
  }
  const jump = location.hash.match(/^#(\d{1,3})$/);
  if (jump && sections[Number(jump[1]) - 1]) {
    document.documentElement.style.scrollBehavior = 'auto';
    requestAnimationFrame(() => {
      sections[Number(jump[1]) - 1].scrollIntoView({ block: 'start' });
      document.documentElement.style.scrollBehavior = '';
    });
  }

  // The header marks the section being read.
  const links = new Map($$('header nav a[href^="#"]').map((l) => [l.getAttribute('href').slice(1), l]));
  const navIo = new IntersectionObserver(
    (entries) =>
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        links.forEach((l) => l.classList.remove('is-here'));
        links.get(en.target.id)?.classList.add('is-here');
      }),
    { rootMargin: '-45% 0px -50% 0px' },
  );
  $$('section[id]').forEach((s) => navIo.observe(s));
  
  if (!still) motion($, $$);
  update();
  ready = true;
}

// Animate a number from a to b over ms, then settle on the exact final text.
function tween(a, b, ms, draw, el, final) {
  if (el) el.dataset.rolling = '1';
  const t0 = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 4);
  const frame = (now) => {
    const t = Math.min(1, (now - t0) / ms);
    draw(a + (b - a) * ease(t));
    if (t < 1) return requestAnimationFrame(frame);
    if (el) delete el.dataset.rolling;
    if (el && final != null) el.textContent = final;
  };
  requestAnimationFrame(frame);
}

// Count a printed figure ("$31,920", "1.7×", "69%", "84 / 49") up from zero.
function countUp(el, ms = 1100) {
  const text = el.textContent;
  const parts = text.split(/(\d[\d,]*\.?\d*)/);
  const nums = parts.map((x, i) => (i % 2 ? Number(x.replace(/,/g, '')) : null));
  if (!nums.some((n) => n) || /[A-Za-z]{3}/.test(text)) return;
  const dec = parts.map((x, i) => (i % 2 && x.includes('.') ? x.split('.')[1].length : 0));
  const fmt = (k) => parts.map((x, i) => (i % 2 ? (nums[i] * k).toLocaleString('en-US', { minimumFractionDigits: dec[i], maximumFractionDigits: dec[i], useGrouping: x.includes(',') }) : x)).join('');
  el.textContent = fmt(0);
  tween(0, 1, ms, (k) => (el.textContent = k >= 1 ? text : fmt(k)), el);
}

// The site's motion: each piece animates the point its section makes, plays
// once, and leaves the finished state in the markup for print and no-JS.
function motion($, $$) {
  const once = (els, fn, margin = '0px 0px -12% 0px') => {
    const io = new IntersectionObserver((entries) => entries.forEach((en) => en.isIntersecting && (io.unobserve(en.target), fn(en.target))), { rootMargin: margin });
    els.forEach((el) => io.observe(el));
  };
  const below = (el) => el.getBoundingClientRect().top > innerHeight * 0.92;

  // The motion kit (base.css) plays in a section the first time a quarter of it is on screen.
  const kit = new IntersectionObserver(
    (entries) => entries.forEach((en) => en.isIntersecting && (kit.unobserve(en.target), en.target.classList.add('is-active'))),
    { threshold: 0.25 },
  );
  $$('[data-section]').forEach((s) => kit.observe(s));

  // Each section's blocks lift in as they arrive (those below the fold).
  const reveal = $$('[data-section] > *').filter(below);
  reveal.forEach((el) => el.classList.add('reveal'));
  once(reveal, (el) => el.classList.add('is-in'), '0px 0px -8% 0px');

  // Line drawings (SVG) marked data-draw are traced like a pen, then inked.
  $$('img[data-draw]').forEach((img) => /\.svg($|\?)/.test(img.getAttribute('src')) && img.classList.add('to-draw'));
  once($$('.to-draw'), (img) => drawIn(img), '0px 0px -10% 0px');

  // [data-count]: a printed figure counts up from zero when it comes into view.
  // Live figures inside count themselves, so they stay live.
  once($$('[data-count]'), (el) => {
    const live = [...el.querySelectorAll('[data-v], [data-expr]')];
    setTimeout(() => (live.length ? live : [el]).forEach((x) => countUp(x, 900)), Number(el.dataset.count) || 0);
  });

  // [data-grow]: a bar grows from zero to the width it was given.
  const grow = $$('[data-grow]').filter(below);
  grow.forEach((b) => ((b.dataset.w = b.style.width), (b.style.width = '0%')));
  once(grow, (b) => requestAnimationFrame(() => (b.style.width = b.dataset.w)));

  // [data-in]: gets class is-in once seen, for an entrance the site styles itself.
  // A picker marked data-in also plays its open panel's entrance (is-shown) then.
  once($$('[data-in]'), (el) => {
    el.classList.add('is-in');
    el.querySelectorAll('[role="tabpanel"].is-on').forEach((p) => p.classList.add('is-shown'));
  }, '0px 0px -20% 0px');

  const top = $('header.top');
  if (top) {
    const bar = document.createElement('div');
    bar.className = 'progress';
    bar.setAttribute('aria-hidden', 'true');
    top.appendChild(bar);
    let queued = false;
    const draw = () => {
      queued = false;
      const max = document.documentElement.scrollHeight - innerHeight;
      bar.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
    };
    addEventListener('scroll', () => queued || ((queued = true), requestAnimationFrame(draw)), { passive: true });
    draw();
  }
  document.documentElement.classList.add('has-motion');
}

async function drawIn(img) {
  let svgText;
  try {
    svgText = await (await fetch(img.currentSrc || img.src)).text();
  } catch {
    return img.classList.remove('to-draw');
  }
  const holder = document.createElement('div');
  holder.innerHTML = svgText;
  const svg = holder.querySelector('svg');
  if (!svg || svg.querySelector('script, foreignObject')) return img.classList.remove('to-draw');
  svg.removeAttribute('class');
  svg.classList.add('drawing');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', img.alt || '');
  const cs = getComputedStyle(img);
  Object.assign(svg.style, { width: '100%', height: 'auto', aspectRatio: cs.aspectRatio, objectFit: cs.objectFit });
  const vb = svg.viewBox.baseVal;
  if (vb && cs.aspectRatio && cs.aspectRatio !== 'auto') {
    const [w, h] = cs.aspectRatio.split('/').map(Number);
    const pos = cs.objectPosition.split(' ').map((v) => parseFloat(v) / 100);
    const newH = (vb.width * h) / w;
    if (newH < vb.height) svg.setAttribute('viewBox', `0 ${(vb.height - newH) * (pos[1] ?? 0.5)} ${vb.width} ${newH}`);
    else {
      const newW = (vb.height * w) / h;
      svg.setAttribute('viewBox', `${(vb.width - newW) * (pos[0] ?? 0.5)} 0 ${newW} ${vb.height}`);
    }
  }
  img.replaceWith(svg);
  // The ink is the original artwork. The pen is an overlay: every outline as
  // its own stroke, traced left to right, then lifted once the ink is down.
  const NS = 'http://www.w3.org/2000/svg';
  const pen = document.createElementNS(NS, 'g');
  pen.setAttribute('class', 'pen');
  const strokes = [];
  [...svg.querySelectorAll('path')].forEach((p) => {
    p.classList.add('ink');
    const t = p.getAttribute('transform');
    for (const part of p.getAttribute('d')?.match(/M[^M]*/gi) ?? []) {
      const q = document.createElementNS(NS, 'path');
      q.setAttribute('d', part);
      if (t) q.setAttribute('transform', t);
      pen.appendChild(q);
      strokes.push(q);
    }
  });
  if (!strokes.length) return;
  svg.appendChild(pen);
  const info = strokes.map((q) => {
    const b = q.getBBox();
    const m = q.transform.baseVal.consolidate()?.matrix;
    return { q, x: b.x + (m ? m.e : 0), len: Math.ceil(q.getTotalLength()) };
  });
  const minX = Math.min(...info.map((o) => o.x));
  const span = Math.max(1, Math.max(...info.map((o) => o.x)) - minX);
  for (const { q, x, len } of info) {
    q.style.strokeDasharray = `${len} ${len}`;
    q.style.strokeDashoffset = String(len);
    q.style.setProperty('--d', `${Math.round(((x - minX) / span) * 2000)}ms`);
  }
  svg.getBoundingClientRect();
  requestAnimationFrame(() => svg.classList.add('is-drawn'));
}
