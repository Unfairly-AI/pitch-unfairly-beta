// The canvas contract every collateral piece imports (as ../.engine/canvas.js).
// The build opens a piece at its layout size and passes the format through the query:
//   w, h      layout size in CSS px (print: inches × 48, bleed included; screen: the platform canvas)
//   dpr       device pixels per CSS px for this render
//   bleed     bleed in CSS px; safeL/safeR/safeT/safeB: safe insets inside the trim, in CSS px
// A piece lays itself out in container units (cqw, cqh) on .canvas, so one design holds at every trim
// of its format family, and reads the insets as CSS variables: --bleed, --safe-l, --safe-r, --safe-t, --safe-b.
const q = new URLSearchParams(location.search);
export const W = +q.get('w') || 1080;
export const H = +q.get('h') || 1350;
export const DPR = +q.get('dpr') || window.devicePixelRatio || 1;
export const PX_IN = 48;
export const inset = { bleed: +q.get('bleed') || 0, l: +q.get('safeL') || 0, r: +q.get('safeR') || 0, t: +q.get('safeT') || 0, b: +q.get('safeB') || 0 };
document.body.dataset.piece = q.get('piece') ?? '';
const root = document.documentElement.style;
root.setProperty('--W', `${W}px`);
root.setProperty('--H', `${H}px`);
for (const [k, v] of Object.entries({ bleed: inset.bleed, 'safe-l': inset.l, 'safe-r': inset.r, 'safe-t': inset.t, 'safe-b': inset.b })) root.setProperty(`--${k}`, `${v}px`);

/** Call once the piece is drawn: waits for fonts and images, runs `fn` (e.g. drawing a canvas texture), then signals the build. */
export async function ready(fn) {
  await document.fonts.ready;
  await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
  if (fn) await fn();
  document.body.dataset.ready = '1';
}

// The build calls this after ready() to check the laid-out piece.
window.__collateralCheck = async () => (await import('./check.js')).check({ W, H, inset, PX_IN });
