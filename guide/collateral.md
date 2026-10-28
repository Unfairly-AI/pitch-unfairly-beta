# Collateral: print, out-of-home and merch

The collateral engine renders a brand's printed pieces at their real size: posters, flyers and
one-pagers, bus shelters, pole banners, airport backlits, tumblers and shirts. It can also render
social posts, so a whole campaign set lives in one place. Each piece names a format. The engine
lays it out at that format's finished size with its bleed and safe area, then checks it against the
format and the brand. It writes print files: a PDF for print, with fonts embedded, and a transparent
PNG for merch. Every size comes from a published spec; `npm run collateral:formats -- --sources`
prints them with their links.

Collateral is hand-designed. There is no automatic layout: you write each piece from the brand's
own examples (its guidelines, its past work), and the engine makes sure it is the right size, inside
the safe area, in the brand's colors and fonts, and printable.

## The loop

1. **`npm run collateral:new`** writes `collateral/` from the example: `collateral.json` and two
   placeholder pieces that show the canvas contract. They carry no look; replace them.
2. **Pick formats.** `npm run collateral:formats` lists them (★ marks the most common size of each
   kind). `npm run social:formats` lists the social ones. When the printer, media owner or merch
   vendor has a template, their numbers win: say so in the hand-over.
3. **Write one HTML file per piece** in `collateral/pieces/`, from the brand's examples. Put the
   brand's own components (logo lockups, textures, headline treatments) in `collateral/kit/` and its
   photos in `collateral/assets/`.
4. **`npm run collateral:build -- --proofs`** lays out and checks every piece, fast. Look at every proof
   in `artifacts/collateral/proof/`. The checks prove size, safe area, color and fonts; only your eyes
   prove the piece matches the brand's examples.
5. **`npm run collateral:build`** writes the print files to `artifacts/collateral/print/` and
   `REPORT.md`.

## collateral.json

```json
{
  "engine": "collateral@1.0",
  "fonts": ["Brand Sans"],
  "neutrals": ["#f6f1e8"],
  "accents": { "colors": ["#40adf7", "#c2d961"], "max": 2, "max_by_variant": { "research": 1 } },
  "pieces": [
    { "id": "shelter", "file": "pieces/shelter.html", "format": "print.ooh.bus_shelter.47x68", "variant": "clinical" },
    { "id": "tee-back", "file": "pieces/tee.html", "format": "merch.tshirt.back", "logo_exempt": "the brand's tee back carries no lockup" },
    { "id": "tee-mockup", "file": "pieces/mock.html", "mockup": true, "canvas": { "w": 1600, "h": 1600 } }
  ]
}
```

- **`fonts`**: the families pieces may use. It defaults to the kit's display, body and mono families.
- **`neutrals`**: grounds the brand uses beyond its palette, such as a cream panel. Every other color must
  be in `brand/brand.json`.
- **`accents`**: when a brand limits how many accent colors one design uses, name the accents and
  the limit. `max_by_variant` sets a different limit per variant, such as a school's mission areas.
  A piece's `variant` picks the limit.
- **`logo_exempt`**: every stand-alone piece carries the logo. A piece that deliberately doesn't (the
  photo half of a poster pair, a shirt back) says why.
- **`mockup`**: a presentation image, such as the art on a tumbler. It takes a plain `canvas`, and its
  props aren't held to the palette.

## The canvas contract

A piece imports `../.engine/canvas.js` and calls `ready()` when it is drawn:

```html
<link rel="stylesheet" href="../.engine/brand.css">
<div class="canvas">…</div>
<script type="module">import { ready } from '../.engine/canvas.js'; ready();</script>
```

- **`.canvas` is the whole sheet**, bleed included: `width: var(--W); height: var(--H)`,
  `container-type: size`. Lay everything out in `cqw` and `cqh`, so one design holds at every size of
  its family (an 18 × 24 and a 24 × 36 poster).
- **Keep copy inside the safe area.** It is inset by `--bleed` plus `--safe-l`, `--safe-r`,
  `--safe-t` and `--safe-b`. Framed displays (shelters, dioramas) show less than the trim. Their safe
  area is the visible area plus half an inch, and pole banners lose 3–4 in to their pockets. Backgrounds
  and photos run to the edge of the bleed.
- **Mark the logo** with `data-logo`. **Mark textures** (grain, swirls) `data-texture` so they're
  not held to photo resolution, and give a colored texture its color in `data-color` so it counts toward
  the accent limit.
- **`ready(fn)`** waits for fonts and images, runs `fn` (draw a canvas texture there: it is drawn at
  the output resolution), then the build checks and renders.
- **brand.css** carries the kit's tokens (`var(--accent)`, `var(--font-display)`, `--c-<extra>`).

## What the checks hold

- **Problems** fail the build:
  - copy outside the safe area (sliced or clipped type is checked only where it shows)
  - a color outside the brand palette
  - more accents than the variant allows
  - a font the brand doesn't use, or one that didn't load
  - no logo
- **Warnings** go to the report: a photo below the format's resolution at finished size. Out-of-home needs
  80–150 pixels per inch at full size; a poster read up close needs 150–300. Web photos rarely pass.
  Ask for the originals before anything goes to print.
- **Print files**:
  - PDFs are the trim plus bleed in real inches, fonts embedded, at the format's resolution, capped
    so an 11 × 7 ft backlit stays a file a printer can open.
  - Merch PNGs are transparent and at the vendor's pixel size. A hairline seam (a half-transparent
    row between solid ink, where two clipped boxes meet mid-pixel) fails the piece. Leave garment-colored areas empty;
    don't print white ink on a white shirt.

## Rules

- Follow the brand's own examples. When its guidelines show the piece you're making, match the
  structure, type treatment and color balance, then make it at the real size. Use the brand's copy
  when the brief gives none; never invent claims, numbers or names.
- One piece, one idea. A poster pair is two files that read together.
- Look at every proof before you hand anything over. Name what the printer must confirm (their
  template, bleed, color mode) and which photos need originals.

## Hosting the set

Each deliverable becomes its own link in the client's gallery: `print`, `swag` or `social`, with a
proof to look at and its print file to download.
- **`pages` in collateral.json** names the links: their slug, title, pieces and a one-line caption.
- **`npm run collateral:pages`** builds one page per link. It takes the type from the format, the
  spec line from the registry, and the downloads from the build. It refuses a title or caption that
  doesn't name its piece's headline.
- **`npm run -s collateral:publish -- plan | start | record`** publishes within the host's limit of
  30 versions an hour.
- **`npm run collateral:live -- <urls>`** checks the live links at desktop and phone width and clicks
  every download.

The `rollout` guide runs the whole job, from a brand guide to a hosted brand, site and set.
