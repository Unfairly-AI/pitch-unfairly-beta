# Present, phone, and PDF

How the starter renders each mode, and the traps that have broken real decks.

## How the modes work

**Present (800px and wider).** The deck scrolls like a web page: every slide is a full-screen `.deck-frame` in its slide's tone, stacked, with scroll snapping, so a mouse wheel, trackpad, or swipe moves one slide at a time. Inside each frame the fixed 1920×1080 slide is scaled with `transform: scale(var(--s))` where `--s = min(innerWidth / 1920, innerHeight / 1080)`. The slide holding most of the screen is `.is-active`, and the URL hash holds its number. Keys: arrows, Space, Page Up and Down, Home, End; `f` for fullscreen; `n` for speaker notes. The controls fade while the mouse is still. A slide's entrance plays the first time it comes into view; coming back shows it finished (`.is-replay`).

**Phone (below 800px).** Same stack, but each slide is the screen itself, `100svh` tall, laid out at phone size instead of scaled. The tokens in `deck.css` switch to the phone scale. Each slide's own `@media (max-width: 799px)` block handles the rest: usually a single column, smaller fixed sizes, and `mobile-hide` on secondary content.

**PDF.** `npm run build` ends by rendering `dist/deck.pdf` (`bin/pdf.mjs`): it opens `/?pdf=1` at 1920×1080 in screen media, waits for `window.__deckReady` (fonts and every image loaded), then prints one 1920×1080 page per slide. `?pdf=1` adds `is-pdf` and `is-static` to `<html>` before first paint: every slide visible at full size, animations at their end state, controls hidden. Because the PDF prints the same stage as present mode, there is no separate print stylesheet to keep in sync. The audit renders the PDF the same way to count its pages.

## Rules

- Size everything on the stage in stage pixels or tokens. Don't use `vw`, `vh`, or `clamp()` inside slides; the stage is scaled as a whole.
- A slide never scrolls internally. Don't add `overflow: auto` to a slide in any mode. If content doesn't fit, cut or move it.
- Keep phone fixes inside the slide's own media block, so a phone fix can't disturb the stage or the PDF.
- On phones, drop secondary content before shrinking type below the token scale (11px minimum).
- Check two phone sizes: 393×745 (a current iPhone with browser bars) and 375×667 (the smallest still common). The audit does both.
- Content must be visible without JavaScript. Entrance animations only run on the active slide, and static modes jump to the end state rather than turning animation off.
- Effects driven by JavaScript (counters, typing) must check `window.deckStill()` and render their finished state when it returns true.

## Traps

1. **`100vh` is not the visible phone screen.** iOS counts the area under the browser bars. Use `100svh`.
2. **Layout overflow is not visible overflow.** Slide-level `scrollHeight` misses absolutely positioned children that the slide clips. The audit checks each element's box against the slide edge. Mark intentional bleeds, such as a decorative circle running off the edge, with `data-bleed` or `aria-hidden="true"`. The audit also flags text that covers other text (a label under a name, a caption over a chart value); when an overlap is the design, such as type set over a big outlined number, mark it `data-overlap-ok`.
3. **Negative insets widen the phone page.** A glow at `inset: -30px` or an element at `right: -200px` adds horizontal scroll on phones. Shrink or drop it in the phone block.
4. **Percentage positions overflow on narrow screens.** An absolutely positioned item at `left: 82%` with a fixed width runs off a 375px screen. Anchor it with `right:` or stack it on phones.
5. **Grid spans fight fewer columns.** If a child spans 3 of 5 columns and a phone or print rule sets 2 columns, it wraps onto its own row. Change the spans together with the template.
6. **Missing glyphs in headless renders.** Symbols such as ●, ✳, or arrows may be absent from the web font, so they render as boxes or fallbacks in the PDF. Draw them as inline SVG.
7. **Logo files carry baked backgrounds.** Many PNG logos have a square or circle fill. Check before placing them in a row of pills; use an SVG or a text pill instead.
8. **Animations stuck on frame one.** Disabling animation in PDF mode leaves elements at their starting state: counters at 0, items invisible. Jump to the end state (the starter's `is-static` rule).
9. **The dev toolbar adds a blank PDF page.** The exporter and scripts remove `astro-dev-toolbar` before capturing.
10. **Scaling a slide to make it fit.** `transform: scale(0.85)` on one slide makes its type smaller than its neighbors and looks broken. Tighten the content instead.
11. **Desktop alignment leaves holes on phones.** `justify-content: flex-end` or `space-between` that looks balanced on the stage can strand content at the bottom of a phone screen. Center or start-align in the phone block.
12. **The controls cover a corner.** On the stage they sit bottom right (they fade while presenting); on phones, top right. Keep important content out of those corners.

## Hosting

The build is static and every asset path is relative (`assetsPrefix: '.'` with inlined stylesheets), so `dist/` works from any folder on any static host. Keep it that way: don't reference assets with root-absolute paths like `/images/x.png`; import them or use relative paths.

Hosted on pitchunfairly.com, the deck runs inside a sandboxed iframe with no cookies or storage. `localStorage` and `document.cookie` are unavailable there; don't depend on them. The deck shell detects the frame (`is-framed` on `<html>`), reports slide changes to it, and asks it for fullscreen so the frame's badge stays visible.
