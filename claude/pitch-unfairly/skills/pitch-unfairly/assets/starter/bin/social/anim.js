/* Loaded before social/moments/*.js. A moment registers itself with SOCIAL.moment(name, def):
     def = { w, h, end, html, update(t, root) }
   w×h is the moment's own design size (the engine scales it into each format), html its markup,
   update(t, root) draws it at t seconds on its own clock (pure: the same t draws the same frame),
   end the second its story is finished (CTAs land after it). Helpers on SOCIAL.anim:
     k(t, at, dur, ease)  0→1 progress of a step that starts at `at` and lasts `dur`
     E.out / E.expo / E.inOut / E.back   easings      lerp(a, b, x)   clamp(x, a, b)
     q(root, key)  the element with data-k="key"      show(node, x, dy)   fade + rise by x */
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
  const q = (el, key) => el.querySelector(`[data-k="${key}"]`);
  const show = (node, x, dy = 18) => { if (!node) return; node.style.opacity = x; node.style.transform = `translateY(${(1 - x) * dy}px)`; };
  SOCIAL.anim = { clamp, E, k, lerp, q, show };
  SOCIAL.moments = SOCIAL.moments || {};
  SOCIAL.moment = (name, def) => {
    for (const f of ['w', 'h', 'html']) if (!def || def[f] == null) throw new Error(`moment ${name}: missing ${f}`);
    SOCIAL.moments[name] = { end: 4, update: () => {}, ...def };
  };
})();
