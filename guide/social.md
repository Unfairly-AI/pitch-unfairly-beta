# Social: posts and ads for every platform

The social engine renders one campaign to every placement a brand posts or advertises in:
Instagram, Facebook, Threads, LinkedIn, X, TikTok, YouTube, Pinterest, Snapchat, Google Ads and
Reddit. That's 186 formats, each at its exact canvas, inside its safe zone, under its file and
length limits, with copy checked against its character limits. Every number comes from the
platform's own documentation; `npm run social:formats -- --sources` prints them with their links.

You write the campaign (the angles, the product moments, the copy). The engine lays out every
format from its spec, renders it, and checks it. Nothing is placed by hand.

## The loop

1. **`npm run social:new`** writes `social/` from the example: `campaign.json`, `styles.css` and
   one example moment in `moments/`.
2. **Write the campaign** (below). Pick the formats in `formats.include`: `["linkedin.*",
   "instagram.*"]`, or leave it empty for all of them. `npm run social:formats -- linkedin` lists
   what a pattern selects.
3. **`npm run social:check`** checks the campaign without rendering: every angle has the copy each
   size needs, nothing uses a banned phrase, and every line of copy fits the tightest limit
   among the placements it runs in.
4. **`npm run social:build -- --stills`** lays out and checks every format as an image, fast.
   Open `artifacts/social/sheets/<platform>.png` and look at every one. The checks prove sizes,
   limits, safe zones and collisions; only your eyes prove it's good.
5. **`npm run social:build`** renders the videos too (needs `ffmpeg`), stitches document PDFs,
   and writes `artifacts/social/REPORT.md`. Every file is checked again after encoding.

The upload-ready files land in `artifacts/social/<platform>/<format>/`: `A.png`, `A.mp4`,
`card1.png`…, `document.pdf`. `previews/` holds looping GIFs for email and chat.

## campaign.json

```json
{
  "engine": "social@1.0",
  "url": "example.com",
  "cta": "Book a demo",
  "offer": "One line that says what happens when they click.",
  "avoid": ["seamless", "game-changer"],
  "formats": { "include": ["linkedin.*", "instagram.*"] },
  "angles": {
    "A": {
      "head": "The headline for big formats.", "ac": "Its accent line.",
      "sub": "One sentence that makes it concrete.",
      "short": "The same idea, shorter.", "shortAc": "For small formats.",
      "micro": "One line for 320×50",
      "note": "Example data", "tint": "var(--c-yellow)", "dark": false, "moment": "metric"
    }
  },
  "cards": [{ "head": "The hook", "ac": "…", "sub": "…" }, { "angle": "A" }, { "close": true, "head": "The next step", "ac": "…" }],
  "copy": { "linkedin": { "ad": { "A": { "primary": "…", "headline": "…" } } } }
}
```

- **An angle is one idea** said at three lengths. `head` + `ac` carry big formats; `short` +
  `shortAc` carry covers, thumbnails and small ads; `micro` (40 characters at most) carries the
  320×50 strip. Write all three; the engine picks by the room each format has.
- **`moment`** names the file in `social/moments/` that draws the product moment for this angle.
  `tint` colours the block behind it; use the kit's tokens (`var(--surface)`,
  `var(--c-<extra>)`, `var(--night)` with `"dark": true`).
- **`cards`** is the carousel and document sequence (LinkedIn documents become a PDF). A card is
  a hook (`head`, `ac`, `sub`), an angle (`{ "angle": "A" }`, shown with its moment), or the
  close (`"close": true`).
- **`copy`** is keyed by platform (`"instagram"`) or by a format pattern
  (`"facebook.ad.reels.*"`), then `organic` or `ad`, then the angle. Field names are the
  registry's: `primary`, `headline`, `description`, and so on. When one line can't fit every
  placement (Facebook Reels ads cut primary text at 40 characters), give that placement its own
  pattern. The check names the format whose limit you hit.

## Moments: the product, moving

A moment is the real product doing the one thing the angle claims: the panel that shows who
read the proposal, the calculator answering back, the dashboard filling in. It is HTML you write
in `social/moments/<name>.js`, styled in `social/styles.css` with the brand tokens:

```js
SOCIAL.moment('metric', {
  w: 600, h: 440, end: 3.2,            // design size (the engine scales it), when its story ends
  html: `<div class="m-card"><p class="m-n"><span data-k="n">0</span>%</p></div>`,
  update(t, root) {                     // draw the moment at t seconds: pure, so frames are exact
    const { k, q, E } = SOCIAL.anim;
    q(root, 'n').textContent = Math.round(84 * k(t, 0.3, 1.8, E.out));
  },
});
```

- **Real product only.** Rebuild the product's own screens and panels, with its own colours and
  numbers, or use its real screenshots (`social/assets/`). Never draw an imitation of a product.
  Example data says so in the angle's `note`.
- **The story fits in four seconds and reads with the sound off.** One change at a time, each
  one visible: a row arrives, a number counts, a bar fills, a step ticks.
- **`update` is a pure function of `t`.** No timers, no `requestAnimationFrame`, no randomness:
  the renderer seeks frame by frame. Use `SOCIAL.anim`: `k(t, at, dur, ease)` for a step's
  progress, `show(node, x)` to fade one in, `lerp`, `E.out`/`E.expo`/`E.inOut`/`E.back`.
- **Design it at one size.** The engine scales the moment into every format; keep its text
  large enough to read at a third of its size.

## What the engine does for you

- **Layout by shape.** A strip (728×90) is logo, headline and button in one row; a landscape
  format puts the copy left and the moment right; squares, portraits and stories stack. Covers,
  thumbnails, profile images and wide logos have their own layouts. Headlines shrink until they
  fit their box.
- **Safe zones.** Text stays out of what the platform covers: Meta's Stories and Reels UI, the
  Snapchat and Pinterest bars, YouTube's channel-art crop, and the Instagram grid's 3:4 tile.
  Where a platform publishes none (TikTok, Shorts), a conservative house margin holds, and the
  report says so.
- **Checks.** Every file's size, type, bytes and duration against the spec; every text box against
  the safe zone; no text box overlapping another or the moment; every font actually loaded; every
  line of copy against its limits.
- **Square feed ads leave out the button** (the platform adds its own); stories land the CTA after
  the moment; videos below a placement's minimum length hold their last frame.

## Rules

- Copy follows the voice guide (`deck_guide` topic `voice`): plain, concrete, the buyer's words.
  No invented numbers: a figure in an ad is the brand's own or a cited source.
- One angle, one idea. Don't make a format say two things because it has room.
- Look at every sheet before you hand anything over. A passing report means it fits; it doesn't
  mean it's good.
