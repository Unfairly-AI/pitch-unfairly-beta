# Slide craft

What separates a composed slide from a generated one. Apply these as defaults; the user's brand and explicit requests win.

## The rules that matter most

1. **One focal element per slide.** Only the focal element gets the strong treatment: color, a hard shadow, a border, scale. Supporting elements stay quiet: no box, no shadow, muted color.
2. **The headline is the point.** A full sentence the audience could repeat. One accent phrase per headline (`<span class="hl">`), usually the second clause or the key number.
3. **The slide is the canvas.** No frame inside a frame and no decorative props around the content. If removing an element doesn't change what the slide says, remove it.
4. **One line of body copy, at most.** Once the visual carries the point, delete the eyebrow, footnote, or caption that repeats it. Move sources and nuance into speaker notes.
5. **Show, don't list.** Replace a bullet list with one concrete artifact: a real screenshot in window chrome, a number at poster size, a before-and-after, a receipt, a single chart. Bullets are a last resort, three at most.
6. **Diagrams must actually connect.** Arrows end at their target. No "+3 more" placeholder tiles. If a connector is decorative, label the direction in text so the phone layout can drop the line.
7. **Real beats invented.** Use real product screenshots and official logos when they exist. Mark anything illustrative as illustrative, close to the claim.
8. **Don't decorate data.** No shadows, rotations, or gradients on chart marks. Use the deck palette for series colors.
9. **Observation over accusation.** "The team can't see it yet" lands better than "The team failed".
10. **Reveals play by themselves.** No slide should need several clicks to finish building.
11. **Decoration must mean something.** A shape that isn't the product, the data, or a label for either is noise. If you'd have to explain it, cut it.
12. **Art must read against its background.** A brand-colored illustration on a brand-colored slide disappears (a green mascot on a green cover). Put it on paper or a neutral card.
13. **Speak the brand's visual language.** Tokens carry color and type; composition carries the rest. Match the brand's density, imagery, and attitude, not only its palette.

## What makes a deck look generated

These are the tells. The audit counts the first three, and a design review fails slides for any of them.

14. **Most slides have no box.** A bordered or shadowed card is a way to make one thing the focal point. At most half the slides use one, and a slide uses one, not a row of them. Type at scale, a number, a photo, a chart, or full-bleed color carry the rest.
15. **No equal-weight grids.** Three or four same-size boxes (the problems, the steps, the use of funds, a timeline) have no focal point. Make one item the hero and set the others as a quiet list beside it, or cut to the one that matters.
16. **Paragraphs are big or gone.** Body copy is 30px or larger on the stage. If text has to shrink to fit, there's too much of it: cut it to a label or move it to speaker notes.
17. **No clip-art.** Don't build objects out of CSS boxes: a truck from rectangles, a building from squares, a phone from divs. Use the brand's real imagery or illustration style, a photo, an icon from a proper set, a typographic treatment, or the data itself. If an illustration wouldn't appear on the brand's own website, it doesn't go in the deck.
18. **Vary the composition, not just the color.** No more than two slides in a row with the same structure (headline left, visual right). Mix in full-bleed type, a centered statement, a single image, an edge-to-edge chart.

## The design floor

Adapted from Impeccable's craft floor by Paul Bakaus (Apache 2.0), rewritten for slides; see THIRD_PARTY_NOTICES.md at the plugin's root.

The floor holds the mechanics; it never picks the direction. The brand kit and the user's explicit request win over anything here: a brand that really is neobrutalist earns hard offset shadows, and a brand whose own site sets gradient type earns it in the deck. Reaching for one of these when the brand didn't choose it means nobody decided.

Check these on the built slides, in the same round as the audit and screenshots:

19. **Contrast.** Text against whatever is behind it is at least 4.5:1, display type at least 3:1. On a colored or photographic slide, tint secondary text from that color or the ink, never a mid-gray. Text over a photo sits on a quiet area of it or on a scrim.
20. **Spacing has a rhythm.** Tight inside a group, generous between groups, more room above a headline than below it. One spacing value repeated everywhere makes every element equal. Squint at the contact sheet: on each slide the focal element should still be the first thing you see.
21. **Dark slides get compensated type.** Light text on a dark slide needs a touch more line height, tracking, and weight than the same text on paper.
22. **Numbers line up.** Counters, tables, and figures that change or sit in columns use tabular figures (`font-variant-numeric: tabular-nums`).
23. **The browser's own surfaces are designed too.** Text selection, focus rings, link underlines, and the controls on interactive slides (sliders, tabs, inputs) take the palette, not browser defaults. Every control works by keyboard and shows hover, focus, and disabled states.
24. **Not the same entrance everywhere.** One authored moment per slide (see Motion). If every slide rises in the same way, the deck reads as a template.

Refuse these unless the brand chose them:

25. **Gradient text.** Emphasis comes from weight, size, or the accent color.
26. **Glass and blur as decoration.** Frosted panels and backdrop blur only when the brand's own surfaces use them.
27. **Side stripes.** A colored border thicker than 1px on one side of a card, quote, or callout.
28. **Glow halos.** A shadow with no offset in a bright color is decoration, not depth. Shadows come from the kit's tokens.
29. **Nested cards.** A card inside a card is always wrong.
30. **Emoji or symbols as icons.** Icons come from a real set or the brand's own, in one stroke weight.
31. **Mono as a costume.** Monospace is for code, data, figures, and labels on them, not a way to look technical.
32. **A system font as the display face.** Arial, Helvetica, Impact, or the operating system's sans standing in for the brand's display face. Use the brand's face or an open stand-in from Fontsource, named on the board.
33. **Sketchy illustration.** Hand-drawn-style SVG scenes, doodles, and noise-grain filters read as amateur. Crisp shapes, diagrams, drawn lines, and the brand's real illustration are fine.
34. **Pattern backgrounds.** Stripes and grid paper need a subject that is a blueprint, map, chart, or measuring tool.
35. **Fake cut-outs.** A circle or polygon mask standing in for the outline of a person or product. Use a real cut-out or the plain photo.

When every check is green, spend the rest on the brand. Torn between refined and committed, commit.

## Slide patterns

Starting points, not templates. Pick by the slide's job, then compose for its content.

| Job | Pattern | What makes it work |
|---|---|---|
| Open | Cover | Full accent background, the promise at hero size, one sub-line, and at most one image, mark, or typographic gesture from the brand. Nothing else. |
| Name the problem | Split | Headline and one line on the left (about 5fr), a single visual on the right (about 6fr) that makes the problem visible. The visual has one focal element. |
| Show traction | Hero metric | One number is the hero, at poster size, with its time frame ("22% month over month, last 4 months"). The other metrics sit in a quiet row of mono label and value pairs. Four equal stat boxes have no focal point. |
| Land a number | Big number | The number at poster scale (500px+ on the stage) in the accent color, a short headline completing the sentence beside it, up to three one-line supports. |
| Prove it with voices | Quote wall | Dark slide, three to five short real quotes set as large type with a mono attribution; one of them bigger than the rest. Cards only if the brand uses them. On phones, show only the three shortest. |
| Contrast old and new | Before and after | The old way grayscale and faded, the new way in color with the only focal shadow and a small tilted sticker. An arrow between them on wide screens only. |
| Show the product | Mockup | A real screenshot, or a faithful HTML mockup, inside window chrome, rotated 1 to 2 degrees with the focal shadow (`--shadow-focal`). Steps or claims beside it, not on top of it. |
| Show progression | You are here | One line with three points: past (faded), present (bold, with a "you are here" pin), next (in the accent). Labels sit on the line, not in boxes. |
| Size a market | Venn or stack | Overlapping circles or stacked bars with one highlighted region and its figure; the math in mono rows underneath. |
| Introduce people | Team | Photos at equal size, names and one credential each. Personality comes from one playful element, not from more text. |
| Close | Ask | Dark or accent slide, the request at hero size, one button-like element. One CTA, no filler line. |

## Type

The starter's tokens (stage pixels at 1920×1080; phone values in parentheses):

| Token | Use | Stage (phone) |
|---|---|---|
| `--t-hero` | Cover and close headlines | 176 (54) |
| `--t-display` | Normal slide headlines | 124 (42) |
| `--t-title` | Headlines with a dense visual | 84 (30) |
| `--t-lede` | The one line of body copy | 40 (18) |
| `--t-body` | Lists, card copy | 30 (15) |
| `--t-label` | Chips, captions, chart labels | 22 (11) |
| `--t-fine` | Sources, page numbers | 18 (11) |

- Display type: line-height around 0.95, letter-spacing around -0.045em, `text-wrap: balance`. Large type needs tight tracking; small mono labels need loose tracking (0.08 to 0.14em, uppercase).
- **Headlines fit in three lines on the stage** (four on a phone); the audit enforces this. A headline column needs room: for `--t-display` that is at least half the content width. If the visual needs more width, drop the headline to `--t-title` or shorten it.
- Keep at least a 3:1 size jump between the headline and anything near it. Timid scale contrast is the most common reason a slide looks generated.
- Never break a number from its unit or a short accent phrase across lines (`white-space: nowrap` on that span).
- If a headline orphans a word or needs a fourth line, shorten the headline before changing the layout.
- Use three families at most: a display face, a body face, and a mono for labels and data.

## Color and rhythm

- Work from the brand kit's roles: paper, surface, ink, accent, and the night roles for dark sections. Extras and data colors are for categories and charts only.
- Vary the background across the deck so the contact sheet has rhythm: mostly paper, a warm slide every few, ink slides at story beats (the proof, the turn), accent on the cover and the close. Never four identical backgrounds in a row.
- On an accent slide, the accent phrase switches to paper (the starter's `.tone-accent .hl` rule does this).

## Physical details

The brand kit decides the physical style; slides only apply it. Cards are rare (rule 14). When a slide does use one, use `.card` and the shadow tokens rather than writing borders and shadows by hand, so a hairline-and-no-shadow brand and a thick-outline-hard-shadow brand both come out right from the same slide code.

- Only the focal element gets `--shadow-focal`; supporting cards get `--shadow-card` or nothing.
- Rotations multiply by `--tilt` (`rotate(calc(4deg * var(--tilt)))`), so serious brands sit straight and playful ones lean. Never rotate body text or data.
- No eyebrow or section number ("02 / The rule") above a headline. The headline carries its own weight; a pill is for a category or a status the slide is about, in the brand's mono face.
- At most one sticker or badge per slide.

## Motion

Motion is part of why a hosted deck feels alive, so treat it as design, not decoration.

**One showpiece per slide, and it animates the point.** A number counting to its value, a bar growing to its length, a ring drawing around the thing that matters, a command typing and its checks landing. Everything else on the slide only enters: `.rise` (fade and lift) or `.pop` (scale in, for stickers and tiles), staggered by setting `--d` on each element in reading order.

| Tool | Use it for | How |
|---|---|---|
| `.rise`, `.pop` | Entrances, staggered | `class="rise" style="--d: 140ms"` |
| `.draw` | Drawing an SVG stroke on: rings, underlines, connectors | On the path or shape, with `pathLength="1"` |
| `.wipe` | A bar or row revealing left to right without scaling its text | On the element; set `--d` |
| `.type` | Typing one monospace line | `style="--chars: 13; --d: 400ms"` with the line's exact length |
| `<CountUp>` | A number counting to its value | `<CountUp to={18} suffix="%" />` from `src/components/motion/` |
| `.breathe` | The deck's one ambient loop | On a wrapper, never on the element that enters |

Timing comes from the tokens in `deck.css`: entrances 400ms ease-out-quart (`--ease`), stagger around 70ms, hovers 160ms (`--ease-hover`), ambient loops 3s or slower. A slide's whole entrance should settle within about 1.5 seconds; nobody waits for a slide.

Rules:
- Every animated element's resting style is its finished state. The PDF, reduced motion, and no-JavaScript all show the end, so a counter never prints 0 and nothing stays invisible.
- In a slide's scoped `<style>`, write `:global(.is-active) .thing`. The `.is-active` class sits on the shared `Slide` section, which a plain `.is-active` selector in the slide file doesn't match.
- No bounce on text, no looping wiggles, no motion on data marks beyond revealing them. At most one ambient loop in the whole deck.
- Script-driven effects listen for the slide's `deck:enter` event and check `window.deckStill()` first, as `CountUp` does.
- Check motion like layout: `npm run motion` writes a filmstrip of every slide's entrance (`artifacts/motion-sheet.png`). Look for content that appears too late, two things moving at once, and frames where the slide is unreadable.

## Density

- One headline, one visual, one line. Anything more needs a reason.
- On phones, the secondary visual or column goes (`mobile-hide`) before the type shrinks below the token scale.
- If a slide needs more than one idea, it is two slides.
