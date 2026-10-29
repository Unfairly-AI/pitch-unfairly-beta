# Brand kits

A deck looks like its brand because every slide reads one kit: `brand/brand.json` plus the files next to it. `npm run brand:apply` turns the kit into `src/brand/brand.css` (tokens), `src/brand/fonts.ts` (font imports), and `src/brand/assets.ts` (logo, imagery, lockup, texture, and element URLs). `npm run build` applies it first, so a kit change can't be forgotten.

## Getting a kit

1. **The user's saved kit.** When the deck hosting tools are connected, call `brand_kit_get`. If the user has a saved kit, use it unless they ask for another brand.
2. **Capture from a website.** `npm run brand:capture -- https://brand.com [https://brand.com/about]` writes a draft kit and evidence in `brand/capture/` (computed colors by area, button and card styles, type samples, font files the site loads, logo candidates, screenshots). It retains a small desktop/phone reference set with provenance in `brand/references/` for the existing source bundle and future revisions. It also saves the logo, large images, and transparent screenshots of illustrations drawn with SVG, canvas, or animation players.
3. **From brand guidelines or files the user gives you.** Fill the kit by hand from their guide, logo files, and font files. See "From a brand guide" below.

## Reviewing a captured draft

The capture measures; you judge. Open every screenshot in `brand/capture/` and correct the draft before applying it:

- **Roles.** The capture guesses `accent` from buttons and links; check it is the brand's signature color, not a secondary link blue. Fill `accent_dark`, `accent_secondary`, `highlight`, `positive`, and `extras` from what the site actually uses.
- **Dark sections.** Set `night`, `on_night`, and `accent_on_night` for slides with `tone="ink"`. Default is ink on paper reversed, which is wrong for brands whose text color is mid-gray or whose paper is already dark.
- **Emphasis.** `style.emphasis: "contrast"` for monochrome brands (headline muted, key phrase full strength); `"color"` otherwise.
- **Type.** If the brand face is open (on Fontsource or Google Fonts), the capture installs it. If it is commercial, the capture matches it by pixels: it renders the brand face on the site, scores about 75 open faces against it, picks the weight by stroke thickness, and writes the winner with `license: "stand-in"`, `stand_in_for`, weight, tracking and `display.scale`. Check `brand/capture/font-display.png` (the brand face above the top three) and `sources.typography.stand_ins` (confidence and alternatives). Swap in an alternative if it reads closer in the screenshots. At low confidence no open face is close (often an extended or condensed design): ask for the font files rather than ship the stand-in.
- **Physical style.** `radius`, `button_shape`, `border_width`, `shadow` (`none`, `soft`, `hard`, `drop`), `shadow_offset`, `texture`, `density`, `motion` (`calm`, `crisp`, `playful`), `tilt` (0 for serious brands, 1 for playful ones).
- **Imagery.** Look at each captured image. Keep only on-brand ones and give them roles: `hero` (a full-bleed cover photo), `illustration` (art for the cover and visuals), `product`, `people`, `texture`, or `reference` (shown on the brand board, not used in slides). Delete the rest.
- **Logos.** `primary` must read on `paper`; add `on_ink` and `on_accent` variants (recolor the SVG fill) when the primary would vanish on those backgrounds.
- **Words.** Write `photo_treatment`, `illustration_style`, `layout_notes`, `voice`, and `rules` from what you see. They guide your composition; be specific.
- **Gaps.** `sources.gaps` lists what a website can't show: positioning, messaging pillars and proof, voice tone and rules, the design treatments (icon style, illustration, photo treatment, motion, layout move), and email assets (a 2× PNG logo, light and dark, and a fallback font stack). The site's own meta descriptions come along as `seeds`. Ask the user or take them from their guide; never invent them. The organization's brand (brand-kit@2, `brand_kit_save` with scope organization) has a place for each.

Before adapting the brand to new content, privately reproduce representative source sections at matching desktop and phone viewports (see the sites guide). Record observed composition and imagery rules in the kit's existing style fields, then compare against the original screenshots. The reference is the brand's actual work, not just a board generated from your own inferred tokens. Keep source copy subject to the voice guide; visual fidelity does not excuse generic marketing language.

Then `npm run brand:apply`, `npm run dev`, and `npm run brand:board`. Show `artifacts/brand-board.png` to the user as an image in the sign-off message, alongside the story, when sign-off is required by the workflow. For an authorized end-to-end build, perform the comparison internally and include the brand in the hand-over; do not add a customer checkpoint.

## From a brand guide

A website capture usually fills none of the optional sections below, and that is fine: a kit without them renders exactly as before. A full brand guide defines more, and the kit has a place for each part of it. Every section is optional. Fill only what the guide actually defines, in the guide's own names and words, and never invent a tier, a treatment, or a message to make the kit look complete. Export the real files (logo versions, texture images, a crop of each element) into `brand/` rather than describing them.

Work through the guide page by page:

- [ ] **Logo versions.** Every approved version goes in `identity.lockups` with the background it is approved for and where it may be used ("website masthead only", "print; preferred"). Then choose `logos.primary` (reads on paper) and `logos.on_ink` from among them; those stay the ones slides render.
- [ ] **Colors and their tiers.** Every named color goes in `palette.extras` with its `group` (`primary`, `secondary`, `tertiary`, as the guide tiers them) and a `use` line from the guide. Map the main ones onto the palette roles too.
- [ ] **Color application pages.** Pages that say which colors lead for an audience, product line, or program become `palette.applications`: the set of colors and the guide's notes on balance.
- [ ] **Type hierarchy.** Each named level (eyebrow, intro, quote, headline, label) becomes a `typography.roles` entry on the display, body, or mono face the kit already loads, with its weight, style, tracking, line height, case, and size relative to the text around it.
- [ ] **Headline treatments and graphic elements.** Frames around photos, brackets around text, a bar under a word, rules, words filled with a texture, stacked or sliced words become `elements`. Give each a `use` line and an `example` image cropped from the guide; the ones with CSS also get a class.
- [ ] **Grain and texture pages.** Export the actual texture images into `brand/textures/` and list them in `textures` (`background` for page fills, `accent` for small areas and knockout words).
- [ ] **Gradients.** Each one goes in `palette.gradients`, its stops named by palette role or extra so they follow the colors.
- [ ] **Mission, positioning, and key messages.** The brand's essence, its taglines, the key messages by area, and its attributes go in `messaging`. Copy written from these still follows the voice guide.

Example, for a fictional pottery school:

```jsonc
"identity": { "lockups": [
  { "name": "stacked", "path": "logos/stacked.svg", "background": "light", "use": "Preferred. Print, signage, and anything square." },
  { "name": "horizontal-reversed", "path": "logos/horizontal-reversed.svg", "background": "dark", "use": "Website masthead and dark photography only." }
] },
"palette": {
  "extras": [{ "name": "pine", "hex": "#2f4a3a", "group": "primary", "use": "Headlines and the logo field." }],
  "gradients": [{ "name": "firing", "angle": 120, "stops": [{ "color": "clay", "at": 0 }, { "color": "glaze", "at": 100 }] }],
  "applications": [{ "name": "Classes and workshops", "colors": ["pine", "glaze", "paper"], "notes": "Pine leads; glaze only for dates and prices." }]
},
"typography": { "roles": { "eyebrow": { "font": "body", "weight": 600, "tracking": 0.14, "case": "uppercase", "scale": 0.7 } } },
"textures": [{ "name": "clay-grain", "path": "textures/clay-grain.png", "kind": "accent" }],
"elements": [
  { "name": "photo-frame", "kind": "frame", "color": "pine", "weight": 14, "use": "Around one photograph per page." },
  { "name": "grain-word", "kind": "knockout-word", "texture": "clay-grain", "use": "One big word on a cover." }
],
"messaging": { "essence": "Everyone can make something that lasts.", "taglines": ["Make more mugs."] }
```

`npm run brand:board` shows these on a second sheet, `artifacts/brand-board-2.png`: lockups on their backgrounds, colors by tier, gradients, color by context, type role specimens, textures, each element drawn live (or its example image), and the messaging. Show it with the first sheet.

## Fonts and licensing

- Open fonts install from Fontsource (`source: "fontsource"`, `package: "@fontsource-variable/…"` or `"@fontsource/…"`).
- Commercial fonts are used only from files the user supplies or confirms they license for the web (`source: "files"`, `license: "user-supplied"`, files in `brand/fonts/`). Never copy font files from a website: hosting them redistributes someone else's font.
- Otherwise use an open stand-in and say so on the brand board.

## Schema (brand-kit@1)

```jsonc
{
  "schema": "brand-kit@1",
  "identity": { "name": "", "domain": "", "wordmark": "", "logos": { "primary": "logos/primary.svg", "on_ink": "", "on_accent": "" },
                // optional, max 12: every approved logo version and where it may be used
                "lockups": [{ "name": "kebab-name", "path": "logos/x.svg", "background": "light|dark|any", "use": "" }] },
  "palette": {
    // required: paper, ink, accent. Others derive from these when absent.
    "paper": "#hex", "surface": "#hex", "ink": "#hex", "ink_muted": "#hex",
    "accent": "#hex", "accent_dark": "#hex", "accent_secondary": "#hex", "on_accent": "#hex",
    "highlight": "#hex", "positive": "#hex", "border": "#hex",
    "night": "#hex", "on_night": "#hex", "accent_on_night": "#hex",
    "extras": [{ "name": "kebab-name", "hex": "#hex", "group": "primary", "use": "" }],   // max 24 → var(--c-name)
    "data": ["#hex"],                                       // → var(--data-1…)
    // A "color" below is a hex, a role name (accent, ink_muted…), or an extras name.
    "gradients": [{ "name": "kebab-name", "kind": "linear|radial", "angle": 120,          // max 12 → var(--g-name)
                    "stops": [{ "color": "accent", "at": 0 }, { "color": "#hex" }], "use": "" }],   // 2 to 6 stops; at is 0 to 100
    "applications": [{ "name": "", "colors": ["accent", "paper"], "notes": "" }]          // max 12; guidance and a swatch set, no CSS
  },
  "typography": {
    "display": { "family": "", "source": "fontsource|files|system", "package": "", "files": [{ "path": "fonts/x.woff2", "weight": 700 }],
                 "weight": 700, "tracking": -0.03, "line_height": 1, "case": "none|uppercase", "scale": 1,
                 "license": "open|user-supplied|stand-in", "stand_in_for": null, "fallback": "sans|serif|mono" },
    "body": { /* same, no scale */ },
    "mono": { /* optional */ },
    // optional, max 12, on a face the kit loads → var(--type-<role>-font|weight|style|tracking|line|case|scale) and .type-<role>
    "roles": { "eyebrow": { "font": "display|body|mono", "weight": 600, "style": "normal|italic", "tracking": 0.14,
                            "line_height": 1.2, "case": "none|uppercase|lowercase", "scale": 0.7, "use": "" } }
  },
  "style": {
    "radius": 16, "button_shape": "rounded|pill", "border_width": 1,
    "shadow": "none|soft|hard|drop", "shadow_offset": 12, "texture": "none|grain|dots|lines",
    "density": "airy|balanced|dense", "motion": "calm|crisp|playful", "tilt": 0, "emphasis": "color|contrast",
    "photo_treatment": "", "illustration_style": "", "layout_notes": ""
  },
  "imagery": [{ "path": "imagery/x.jpg", "role": "hero|illustration|product|people|texture|reference", "alt": "", "notes": "" }],
  // optional, max 24: real texture images from the guide → var(--tex-name)
  "textures": [{ "name": "kebab-name", "path": "textures/x.png", "kind": "background|accent", "tint": "paper",
                 "blend": "normal|multiply|screen|overlay|soft-light", "use": "" }],
  // optional, max 20: graphic elements and headline treatments → .el-<name> for frame, bracket, bar-under, rule, knockout-word
  "elements": [{ "name": "kebab-name", "kind": "frame|bracket|bar-under|rule|stacked-word|sliced-word|knockout-word|other",
                 "color": "accent", "weight": 12, "texture": "a textures name (knockout-word)", "use": "", "example": "elements/x.png" }],
  // optional
  "messaging": { "essence": "", "taglines": [""], "key_messages": [{ "area": "", "headline": "", "body": "" }], "attributes": [""] },
  "voice": [""], "rules": [""],                           // rules: max 40
  "sources": { "palette": { "from": "", "confidence": "high|medium|low" } }
}
```

## Tokens slides use

Colors: `--paper --surface --ink --ink-muted --ink-faint --accent --accent-dark --accent-2 --on-accent --highlight --positive --border-color --night --on-night`, derived tints `--tint-1…4`, `--ink-raised`, `--paper-on-ink`, transparent variants (`--paper-a35`, `--on-night-a72`, …), `--c-<extra>`, `--data-<n>`.
Type: `--font-display --font-body --font-mono`, `--display-weight --display-tracking --display-line --display-case`, sizes `--t-hero … --t-fine`.
Physical: `--radius --radius-button --border-w --shadow-card --shadow-focal --shadow-contrast --tilt` (multiply rotations: `rotate(calc(4deg * var(--tilt)))`).
Motion: `--ease --ease-pop --dur-enter --stagger`.
From a brand guide, when the kit defines them: gradients `--g-<name>`; type roles `--type-<role>-font` (and `-weight -style -tracking -line -case -scale` for what the role sets) with a class `.type-<role>`; textures `--tex-<name>`; element classes `.el-<name>`. A frame is a solid border around a photo or block, a bracket puts corner rails at both sides of a text box, a bar-under is a highlighter bar behind the lower part of a word, a rule is a line (use it on an `<hr>`), and a knockout-word fills its letters with its texture (use it on large type, including `.display` headlines). Stacked, sliced, and other treatments have no class: compose them from their `use` and `example`. `src/brand/assets` also exports `lockups`, `textures`, `elements`, `typeRoles`, `gradients`, and `messaging`.

Never write a raw color in a slide; the audit fails on one. Logos go through `<BrandMark on="paper|ink|accent" />`; imagery through `imagery` from `src/brand/assets`.
