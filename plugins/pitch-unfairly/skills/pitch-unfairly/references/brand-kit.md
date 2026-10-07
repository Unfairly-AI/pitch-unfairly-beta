# Brand kits

A deck looks like its brand because every slide reads one kit: `brand/brand.json` plus the files next to it. `npm run brand:apply` turns the kit into `src/brand/brand.css` (tokens), `src/brand/fonts.ts` (font imports), and `src/brand/assets.ts` (logo and imagery URLs). `npm run build` applies it first, so a kit change can't be forgotten.

## Getting a kit

1. **The user's saved kit.** When the deck hosting tools are connected, call `brand_kit_get`. If the user has a saved kit, use it unless they ask for another brand.
2. **Capture from a website.** `npm run brand:capture -- https://brand.com [https://brand.com/about]` writes a draft kit and evidence in `brand/capture/` (computed colors by area, button and card styles, type samples, font files the site loads, logo candidates, screenshots). It also saves the logo, large images, and transparent screenshots of illustrations drawn with SVG, canvas, or animation players.
3. **From brand guidelines or files the user gives you.** Fill the kit by hand from their guide, logo files, and font files.

## Reviewing a captured draft

The capture measures; you judge. Open every screenshot in `brand/capture/` and correct the draft before applying it:

- **Roles.** The capture guesses `accent` from buttons and links; check it is the brand's signature color, not a secondary link blue. Fill `accent_dark`, `accent_secondary`, `highlight`, `positive`, and `extras` from what the site actually uses.
- **Dark sections.** Set `night`, `on_night`, and `accent_on_night` for slides with `tone="ink"`. Default is ink on paper reversed, which is wrong for brands whose text color is mid-gray or whose paper is already dark.
- **Emphasis.** `style.emphasis: "contrast"` for monochrome brands (headline muted, key phrase full strength); `"color"` otherwise.
- **Type.** If the brand face is open (on Fontsource or Google Fonts), the capture installs it. If it is commercial, pick the closest open face by eye (width, x-height, terminals, weight) and keep `license: "stand-in"` with `stand_in_for`. Match weight, tracking, and case from the screenshots, and set `display.scale` so headlines fit (wide faces below 1).
- **Physical style.** `radius`, `button_shape`, `border_width`, `shadow` (`none`, `soft`, `hard`, `drop`), `shadow_offset`, `texture`, `density`, `motion` (`calm`, `crisp`, `playful`), `tilt` (0 for serious brands, 1 for playful ones).
- **Imagery.** Look at each captured image. Keep only on-brand ones and give them roles: `hero` (a full-bleed cover photo), `illustration` (art for the cover and visuals), `product`, `people`, `texture`, or `reference` (shown on the brand board, not used in slides). Delete the rest.
- **Logos.** `primary` must read on `paper`; add `on_ink` and `on_accent` variants (recolor the SVG fill) when the primary would vanish on those backgrounds.
- **Words.** Write `photo_treatment`, `illustration_style`, `layout_notes`, `voice`, and `rules` from what you see. They guide your composition; be specific.

Then `npm run brand:apply`, `npm run dev`, and `npm run brand:board`. Show `artifacts/brand-board.png` to the user as an image in the sign-off message, alongside the story, and get a yes before composing slides.

## Fonts and licensing

- Open fonts install from Fontsource (`source: "fontsource"`, `package: "@fontsource-variable/…"` or `"@fontsource/…"`).
- Commercial fonts are used only from files the user supplies or confirms they license for the web (`source: "files"`, `license: "user-supplied"`, files in `brand/fonts/`). Never copy font files from a website: hosting them redistributes someone else's font.
- Otherwise use an open stand-in and say so on the brand board.

## Schema (brand-kit@1)

```jsonc
{
  "schema": "brand-kit@1",
  "identity": { "name": "", "domain": "", "wordmark": "", "logos": { "primary": "logos/primary.svg", "on_ink": "", "on_accent": "" } },
  "palette": {
    // required: paper, ink, accent. Others derive from these when absent.
    "paper": "#hex", "surface": "#hex", "ink": "#hex", "ink_muted": "#hex",
    "accent": "#hex", "accent_dark": "#hex", "accent_secondary": "#hex", "on_accent": "#hex",
    "highlight": "#hex", "positive": "#hex", "border": "#hex",
    "night": "#hex", "on_night": "#hex", "accent_on_night": "#hex",
    "extras": [{ "name": "kebab-name", "hex": "#hex" }],   // → var(--c-name)
    "data": ["#hex"]                                        // → var(--data-1…)
  },
  "typography": {
    "display": { "family": "", "source": "fontsource|files|system", "package": "", "files": [{ "path": "fonts/x.woff2", "weight": 700 }],
                 "weight": 700, "tracking": -0.03, "line_height": 1, "case": "none|uppercase", "scale": 1,
                 "license": "open|user-supplied|stand-in", "stand_in_for": null, "fallback": "sans|serif|mono" },
    "body": { /* same, no scale */ },
    "mono": { /* optional */ }
  },
  "style": {
    "radius": 16, "button_shape": "rounded|pill", "border_width": 1,
    "shadow": "none|soft|hard|drop", "shadow_offset": 12, "texture": "none|grain|dots|lines",
    "density": "airy|balanced|dense", "motion": "calm|crisp|playful", "tilt": 0, "emphasis": "color|contrast",
    "photo_treatment": "", "illustration_style": "", "layout_notes": ""
  },
  "imagery": [{ "path": "imagery/x.jpg", "role": "hero|illustration|product|people|texture|reference", "alt": "", "notes": "" }],
  "voice": [""], "rules": [""],
  "sources": { "palette": { "from": "", "confidence": "high|medium|low" } }
}
```

## Tokens slides use

Colors: `--paper --surface --ink --ink-muted --ink-faint --accent --accent-dark --accent-2 --on-accent --highlight --positive --border-color --night --on-night`, derived tints `--tint-1…4`, `--ink-raised`, `--paper-on-ink`, transparent variants (`--paper-a35`, `--on-night-a72`, …), `--c-<extra>`, `--data-<n>`.
Type: `--font-display --font-body --font-mono`, `--display-weight --display-tracking --display-line --display-case`, sizes `--t-hero … --t-fine`.
Physical: `--radius --radius-button --border-w --shadow-card --shadow-focal --shadow-contrast --tilt` (multiply rotations: `rotate(calc(4deg * var(--tilt)))`).
Motion: `--ease --ease-pop --dur-enter --stagger`.

Never write a raw color in a slide; the audit fails on one. Logos go through `<BrandMark on="paper|ink|accent" />`; imagery through `imagery` from `src/brand/assets`.
