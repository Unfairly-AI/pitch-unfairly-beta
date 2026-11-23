# Slide craft

What separates a composed slide from a generated one. Apply these as defaults; the user's brand and explicit requests win.

## The rules that matter most

1. **One focal element per slide.** Only the focal element gets the strong treatment: color, a hard shadow, a border, scale. Supporting elements stay quiet: no box, no shadow, muted color.
2. **The headline is the point.** A full sentence the audience could repeat. Most headlines carry no colored phrase at all; emphasis comes from the sentence itself. Use an accent phrase (`<span class="hl">`) only where the brand's own site colors words for emphasis, and then on a few headlines, never on every one.
3. **The slide is the canvas.** No frame inside a frame and no decorative props around the content. If removing an element doesn't change what the slide says, remove it.
4. **No body copy that repeats the visual.** A sentence that explains what the diagram, chart, or number already shows is over-copy: cut it. A line that carries a fact the visual doesn't (a number, a customer, a date, a source) is proof, and proof stays: a slide whose job needs evidence shows the brief's real facts on the slide, not only in the notes. No footers either: no website, no "illustrative" caption, no disclaimer. The logo already says whose deck it is. **Provenance lives off the slide:** every figure is traced to a source in the speaker notes and `artifacts/source.json`. On the slide, at most a short source label beside the figure ("Metaview, 2026") at `--t-fine`. A sentence explaining where a screenshot or number came from ("The screenshot uses the vendor's demo data…") is a disclaimer, not proof: it goes in the notes.
5. **Show, don't list.** Replace a bullet list with one concrete artifact: a real screenshot in window chrome, a number at poster size, a before-and-after, a receipt, a single chart. Bullets are a last resort, three at most.
6. **Diagrams must actually connect.** Arrows end at their target. No "+3 more" placeholder tiles. If a connector is decorative, label the direction in text so the phone layout can drop the line.
7. **Real beats invented.** Use real product screenshots and official logos when they exist. Label invented evidence as an example, right on it, in one or two words: a made-up number, quote, customer, or screenshot ("Example"). The label is a tag, never a sentence about where the example came from; that goes in the notes. A concept diagram (a flow, a before-and-after, a stack) isn't evidence and gets no label.
8. **Don't decorate data.** No shadows, rotations, or gradients on chart marks. Use the deck palette for series colors.
9. **Observation over accusation.** "The team can't see it yet" lands better than "The team failed".
10. **Reveals play by themselves.** No slide should need several clicks to finish building.
11. **Decoration must mean something.** A shape that isn't the product, the data, or a label for either is noise. If you'd have to explain it, cut it.
12. **Art must read against its background.** A brand-colored illustration on a brand-colored slide disappears (a green mascot on a green cover). Put it on paper or a neutral card.
13. **Speak the brand's visual language.** Tokens carry color and type; composition carries the rest. Match the brand's density, imagery, and attitude, not only its palette.

## Whitespace is the design

Empty space is intentional, not unfinished. A slide may be only a headline, only a quote, or only a number, set large with nothing else on it. The best decks in the template library (see Restrained references below) leave most of each slide empty and let type, one image, and the copy carry it. Don't add a stat row, a caption, a second visual, or a supporting line because the slide "looks empty". Add something only when the slide's job is unproven without it. A sparse slide is never a defect; a full one usually is.

## Hierarchy and weight

A slide that adds copy until it feels complete ends up with four voices at similar volume and no hierarchy. Squint at the slide: you should see the headline, then the one focal thing, then nothing else until you look for it.

- **Three levels, no more.** The headline, the focal element, and quiet support. Count the text blocks: a headline, a three-step flow, a sentence under it, and a caption is four levels, and the eye has nowhere to land. Cut until three remain. An eyebrow, a headline, a quote in two sizes, an attribution, and a stat row is six levels; that slide holds two ideas and none of them lands.
- **The focal element outweighs its neighbors.** Inside a visual, the item that carries the point is at least twice the size or weight of the items around it, and the others drop to muted ink at a smaller size. Three labels at the same size in a row is an equal-weight grid (rule 15), even with no boxes around them.
- **The accent marks one idea.** The accent color goes on one thing per slide. If the headline's accent phrase and the visual's focal element are different ideas (the promise and the pain), only one of them gets it; the other gets weight or scale.
- **One headline.** Nothing else on the slide is set near headline scale. A big second line under the headline ("A new connection.") is a second headline, and the eye can't tell which one is the point.
- **A quote is one unit at one size.** Set the whole quote in one size and weight with a small attribution under it. Never split it into a big pull line and a smaller remainder, and never bolt an unrelated stat row under it.
- **The headline doesn't restate its own quote or visual.** If the headline paraphrases the quote under it, or narrates the chart beside it, one of them goes. A quote slide can be the quote alone, with no headline at all.
- **Say it once.** If chips, an eyebrow, a subhead, and a summary line all name the same things, the slide is saying it four times. Keep the one form that carries the point and cut the rest.
- **Labels earn their place.** An uppercase label over a block that already says what it is ("THE WORKFLOW" over a list of steps, "YOUR CONTROL" over a sentence about control) is noise.
- **Words beside a screenshot match the screenshot.** Use the product's own names for its steps. A list that renames the steps the screenshot already shows contradicts it; point at the one step that matters (a ring, or a close shot of it taken at its own pixels) instead of listing them all.
- **Images at their pixels, and whole.** A screenshot or photo is never shown larger than three quarters of its pixel width on the 1920 stage: a laptop at 2x draws the stage at 1.5 screen pixels per stage pixel, and an enlarged image reads as soft and cheap. Need it bigger? Get the original file, not a screenshot of it: the workspace's own assets, the brand's press or media kit (`asset:grab -- press <site>`), the site image's original file (`-- page <url>`, `-- original <image-url>` undo a CDN's resize), and only then a re-shoot of the panel at the scale the slide needs (`-- shot <url> --selector "<css>" --fit <width on the slide>`); never blow up a crop. Product UI goes whole into window or phone chrome (`product-browser`, `product-phone`) or `object-fit: contain`; `object-fit: cover` on a screen cuts through its text and controls. The audit measures every slide image and blocks one shown past 1.5x its pixels on a 2x screen, or stretched.
- **Nothing pretends to be clickable.** Tabs, toggles, or chips with one state showing don't work in a PDF or a sent deck. Give each case its own slide, or show them all at once with one emphasized.
- **The point gets the weight.** When a list or flow has steps that set the company apart, those steps carry the weight, and the generic ones go quiet. Four rows of equal type say every step matters the same.
- **Weight before size.** Give the focal element a heavier weight, more scale, or the slide's only color, and take those away from everything else. Making everything a little bigger makes nothing more important.

## Distinctive, not a template

A deck should look like it came from the brand, not from us. Put ten decks for ten brands side by side: if their covers, layouts, and details match, the builder has a house style, and every one of them reads as generated however well each slide is made.

- **Start from the brand's world.** Look at what the brand's own site and materials lead with: photography, illustration, type, the product, or data. The deck leads with the same thing. A brand that shows people and places opens on a photograph; an editorial brand opens on type; a product brand opens on the product.
- **These are our defaults, not the brand's.** Use each only when the brand calls for it: a colored final phrase in the headline, floating rounded cards with soft shadows, monospace micro-labels, pill-shaped progress bars, a browser window with three dots around a mockup, a slide number on every slide, a cover that is a full field of the accent color.
- **Vary the skeleton.** A headline on the left with one exhibit on the right is one layout among many; give it at most a third of the slides. Others: a full-bleed photograph with the headline set on it, a centered statement alone, a chart edge to edge with the headline above it, a wide exhibit under a stacked headline, a grid of real photos, a single object at scale.
- **When the brief has photography, use it.** If the brand works in photos, slides use them: the brand's own, or a clearly labeled placeholder in the photo's position and crop. Don't turn a photographic brand into type and cards.
- **The logo test.** Cover the logo on any slide. Someone who knows the brand should still recognize it from the type, color, imagery, and attitude.

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

## Copy that sounds written, not generated

Generated copy gives a deck away faster than generated design. [voice.md](voice.md) has the full guide; these are the rules a slide is judged on.

36. **No em dashes**, in slide text or speaker notes, and no en dash or double hyphen standing in for one. Use a period, comma, colon, or parentheses.
37. **Whole sentences.** Headlines and body lines have a subject and a verb. No stacked fragments ("One link. Every screen.", "Faster. Smarter. Simpler."). Labels, chips, and buttons can be phrases.
38. **No subtitles.** Nothing under a headline that restates or teases it, and no "Title: subtitle" headlines. A line under the headline adds a fact (a number, a date, who it's for) or goes.
39. **No formulas.** No "It's not X, it's Y", no "Not just X, but Y", no colon reveals ("The result: 3x"), no rhythm-by-threes, no "unlock", "seamless", "elevate", "reimagine", or the rest of the list in voice.md.
40. **Say it the way the company would.** Specific names and numbers, contractions, the company's own words for its product. Read each headline aloud; if you wouldn't say it to the person across the table, rewrite it.
41. **Simplify the copy.** Every line in its shortest true form: one idea per sentence, plain words, no stacked clauses, a headline of 12 words or fewer, body lines short enough to read in a glance. Cut until it sounds like you explaining it (voice.md, "Simplify the copy", has the limits).

## Slide patterns

Starting points, not templates. Pick by the slide's job, then compose for its content.

| Job | Pattern | What makes it work |
|---|---|---|
| Open | Cover | Chosen from what the brand leads with: a full-bleed photograph with the promise set on it, an editorial type cover, the product or one object at scale, the one number that matters, or a quiet paper cover with the promise small and a lot of space. A full field of the accent color only when the brand's own front door is one. The promise, the company name or the date, nothing else, and no tagline under the promise. |
| Name the problem | Split | Headline and one line on the left (about 5fr), a single visual on the right (about 6fr) that makes the problem visible. The visual has one focal element. |
| Show traction | Hero metric | One number is the hero, at poster size, with its time frame ("22% month over month, last 4 months"). The other metrics sit in a quiet row of label and value pairs. Four equal stat boxes have no focal point. |
| Land a number | Big number | The number at poster scale (500px+ on the stage) in the accent color, a short headline completing the sentence beside it, up to three one-line supports. |
| Prove it with voices | Quote wall | Dark slide, three to five short real quotes set as large type with a small attribution; one of them bigger than the rest. Cards only if the brand uses them. On phones, show only the three shortest. |
| Contrast old and new | Before and after | The old way grayscale and faded, the new way in color with the only focal shadow and a small tilted sticker. An arrow between them on wide screens only. |
| Show the product | Mockup | A real screenshot at its own pixels (sharp on a 2x screen, never enlarged or cover-cropped), or a faithful HTML mockup, inside window chrome, rotated 1 to 2 degrees with the focal shadow (`--shadow-focal`). Steps or claims beside it, not on top of it. When one region proves the point, spotlight it (toolbox `product-spotlight`, the motion kit's Focus). |
| Show progression | You are here | One line with three points: past (faded), present (bold, with a "you are here" pin), next (in the accent). Labels sit on the line, not in boxes. |
| Size a market | Venn or stack | Overlapping circles or stacked bars with one highlighted region and its figure; the math in quiet rows underneath. |
| Introduce people | Team | Photos at equal size, names and one credential each. Personality comes from one playful element, not from more text. |
| Close | Ask | One ask in one line at hero size (the meeting, the decision, the signature), optionally the contact's name and email under it. No table, no who-does-what list, no dated plan, no "Thank you". The mutual action plan lives in the proposal or deal room (guide topic `deal-room`), not the deck. |

## Type

The starter's tokens (stage pixels at 1920×1080; phone values in parentheses):

| Token | Use | Stage (phone) |
|---|---|---|
| `--t-hero` | Cover and close headlines | 176 (54) |
| `--t-display` | Normal slide headlines | 124 (42) |
| `--t-title` | Headlines with a dense visual | 84 (30) |
| `--t-lede` | The one line of body copy | 40 (18) |
| `--t-body` | Lists, card copy | 30 (15) |
| `--t-label` | Chips, captions, chart labels | 22 (13) |
| `--t-fine` | Sources, page numbers | 18 (13) |

- Display type: line-height around 0.95, letter-spacing around -0.045em, `text-wrap: balance`. Large type needs tight tracking; small mono labels need loose tracking (0.08 to 0.14em, uppercase).
- **Headlines fit in three lines on the stage** (four on a phone); the audit enforces this. A headline column needs room: for `--t-display` that is at least half the content width. If the visual needs more width, drop the headline to `--t-title` or shorten it.
- Keep at least a 3:1 size jump between the headline and anything near it. Timid scale contrast is the most common reason a slide looks generated.
- Never break a number from its unit or a short accent phrase across lines (`white-space: nowrap` on that span).
- If a headline orphans a word or needs a fourth line, shorten the headline before changing the layout.
- Use three families at most: a display face, a body face, and, only when the brand has one, a mono for code and data.

## Color and rhythm

- Work from the brand kit's roles: paper, surface, ink, accent, and the night roles for dark sections. Extras and data colors are for categories and charts only.
- Vary the background across the deck so the contact sheet has rhythm: mostly the brand's main surface, a change every few slides, ink or photographic slides at story beats (the proof, the turn). The cover and the close take whatever the brand leads with, which is often a photograph or paper, not the accent. Never four identical backgrounds in a row.
- On an accent slide, the accent phrase switches to paper (the starter's `.tone-accent .hl` rule does this).
- **Text contrast: 4.5:1 for body copy and labels, 3:1 for large headlines.** The audit measures every run of text against what's behind it. The usual failure is an accent phrase set in a tint of its own background: pale lavender on purple, yellow on cream, yellow on green, white on lime. Use the kit's ink, paper, `accent-dark`, or `on-accent` instead, and check muted captions on dark slides, which fade below the floor first.
- **The fundamentals ship as tokens.** `brand.css` carries what the kit implies but doesn't say: `--accent-text` (the accent, or the nearest step of its own ramp that passes 4.5:1, for links and small accent words), `--accent-fill` with `--on-accent-fill` (a button fill that carries a 16px label, keeping the brand's own label color), `--ink-muted-text` (captions that pass on paper and surface), `--ramp-<role>-50…950` (tints and shades, the brand hex held exactly), `--step-xs…5xl` with `-lh` and `-tracking` (a fluid type scale), `--space-*`, `--caps-tracking` and `--measure` (66ch). Use them wherever the kit says nothing; the kit's own values always win. `npm run brand:apply` warns, with the fix, when a kit's own pairs fail.
- **Sites, collateral, social and long-form check them too.** Every run of text is measured against what's painted behind it (4.5:1, or 3:1 at 24px or 18.66px bold; APCA as a warning). Sites also fail running text over 100 characters a line and phone body copy under 14px, and warn on lines over 85, a section with no dominant headline, a heading closer to what precedes it than to what it heads, and a headline ending on one short word. Decorative numerals and mock UI that aren't reading text take `data-decor` or `data-ui`.

## Physical details

The brand kit decides the physical style; slides only apply it. Cards are rare (rule 14). When a slide does use one, use `.card` and the shadow tokens rather than writing borders and shadows by hand, so a hairline-and-no-shadow brand and a thick-outline-hard-shadow brand both come out right from the same slide code.

- Only the focal element gets `--shadow-focal`; supporting cards get `--shadow-card` or nothing.
- Rotations multiply by `--tilt` (`rotate(calc(4deg * var(--tilt)))`), so serious brands sit straight and playful ones lean. Never rotate body text or data.
- No eyebrow or section number ("02 / The rule") above a headline. The headline carries its own weight; a pill is for a category or a status the slide is about, in the brand's label style.
- At most one sticker or badge per slide.

## Motion

Motion is part of why a hosted deck feels alive, so treat it as design, not decoration. Quality still comes from whitespace, type and copy: motion serves the slide's point or stays out.

**One showpiece per slide, and it animates the point.** Pick it from the motion kit below. Everything else on the slide only enters: `.rise` (fade and lift) or `.pop` (scale in, for stickers and tiles), staggered by setting `--d` on each element in reading order. Many slides need no showpiece at all.

### The motion kit

Every primitive is timed by the brand's motion tokens, so the same slide moves differently in a calm kit and a crisp one. `style.motion` in the kit picks the preset: calm (Material 3's emphasized curve, entrances 600ms, steps hold 1.9s), crisp (Carbon's productive curve, 400ms, 1.3s) or playful (Carbon's expressive curve with an overshoot pop, 450ms, 1.45s). The tokens: `--ease` to enter, `--ease-exit` to leave, `--ease-move` to travel, `--ease-pop` to land; `--dur-micro`, `--dur-small`, `--dur-medium`, `--dur-large` (longer for farther moves), `--dur-enter`, `--stagger`, `--dwell`. Never write a `cubic-bezier()` or a raw duration in a slide; the audit fails it.

| Primitive | Use it when | How | Still (PDF, reduced motion) |
|---|---|---|---|
| Words | A short headline is the slide: a cover, a statement, a section title | `data-m="words"` on the heading (14 words or fewer); title-statement, statement-* and section-color-field do it | the whole line |
| Stagger | A list or a row of cards read in order | `data-m="stagger"` on the list; the sixth item and after arrive together | every item in place |
| Grow | A bar chart, a waterfall, a size comparison | `data-m="grow"` on the chart, `.m-grow` (up) or `.m-grow-x` (across) on each bar with `--i`; chart-bar-highlight, chart-waterfall, problem-cost-waterfall, model-nested-size | full bars |
| Draw | A line chart, a timeline, a ring around what matters | `data-m="draw"` on the chart, `.draw` on each path (`pathLength="1"`); chart-line-annotated, roadmap-* | drawn |
| Count | The slide's one number | `<CountUp to={41} />` (it marks itself `data-m="count"`); big-number-*, stats-* | the final figure |
| Focus | One region of a screenshot or photo proves the point | `<Focus src alt detail={{ x, y, w, h }} callout />` closes in, veils the rest and rings it (`veil="light"` on a dark screen); product-spotlight | closed in, ringed |
| Steps | A process the presenter walks through, beat by beat | `<Steps items />`: a title and one line per step, no numbers (the rule over the current step carries the order); a showpiece the viewer can click; how-it-works-step-build | every step shown, the last current |
| Carry | The same object on two neighbouring slides: a screen, then its detail | the same `data-carry="<key>"` on both (product-browser and title-split-product `carry`, Focus `carry`); it travels on `--ease-move` | each in its place |
| Marquee | A customer list too long for one row | `<Marquee logos />` drifts while its slide is on screen, with a pause button; proof-logo-marquee | one wrapped row |
| Ambient | A cover or section slide that wants the brand's light | `<Ambient colors={['--c-mint', '--c-cyan']} />` first in the slide, or the `ambient` prop on title-statement and section-color-field; it drifts once and rests | at rest |
| Type | A command or prompt typing | `.type` with `--chars` | typed |

Which one, by slide job: a cover or statement takes words; a list of reasons takes stagger; a chart grows or draws its marks (never both); a big number counts; a product screen with one region that matters takes focus, and a screen shown whole then in detail carries across the two slides; a process the presenter talks through takes steps; a long logo list takes the marquee; ambient light only on covers and section slides. Interactive mini-apps (calculators, toggles, compare sliders, step builds) are showpieces too: they declare the live-state contract (`data-showpiece`, `data-state`, `data-final`, `data-settle`, `data-drive` on each control) so the audit drives them.

Rules, held by the audit (`bin/motion-check.mjs`, from the /steal motion playbook):
- One kind of featured motion per slide: words, grow, draw, count, focus, steps or marquee. A count inside a growing chart is one.
- Everything lands within five entrances of the brand's timing (3s calm, 2s crisp); showpieces that declare `data-settle` and the ambient drift are timed on their own.
- Nothing loops forever unless it pauses: the marquee has its button, and `.breathe` is the deck's one quiet loop.
- Words being read never move: `data-m="words"` only on a headline of 14 words or fewer, never on body copy.
- At most one ambient field, never under a chart, a spotlight or steps.
- Move with transform, appear with opacity: no keyframe or transition on width, height, top, left, margin or padding.
- Every primitive rests on its finished state in the PDF and with reduced motion (checked on the stage and a phone), so a counter never prints 0 and nothing stays invisible. A `data-carry` has its partner on the slide before or after, and stepping in plays it.
- In a slide's scoped `<style>`, write `:global(.is-active) .thing`. Script-driven effects listen for the slide's `deck:enter` event and check `window.deckStill()` first, as `CountUp` and `Steps` do.
- Check motion like layout: `npm run motion` writes a filmstrip of every slide's entrance (`artifacts/motion-sheet.png`). Look for content that appears too late, two things moving at once, and frames where the slide is unreadable.

## On a phone

The phone layout is judged as hard as the stage. Each slide becomes a full screen 375 to 393px wide; the audit fails any text under 13px and body copy under 15px, and the design review sees every slide's phone screenshot at real size. What it flags most:

- **Restack, don't shrink.** A two- or three-column comparison, a timeline, a table, a row of four metrics, or a step diagram becomes one full-width column on a phone, every item at the phone token sizes. If the stack doesn't fit one screen, keep the two or three items that carry the point and `mobile-hide` the rest.
- **Cut before you shrink.** Captions, step descriptions under a label, footnotes, and source lines go first (`mobile-hide`), never down to a size nobody can read. Sources move to speaker notes.
- **The focal element stays the biggest thing.** The number, chart, or screenshot that carries the slide keeps its size on the phone; supporting lines give way to it.
- **Keep the argument whole.** A before and after keeps both sides, stacked. A flow keeps its connectors attached to what they connect. Dropping half a comparison leaves the headline's claim unproven.
- **No split groups.** The one layout bug here: two groups pinned to opposite edges (top and bottom, or left and right) with a dead gap between them, so they read as unrelated. Keep a group together: let it flow from the top with the token gap, or center it. Generous space around one group is fine; that is whitespace, not a gap.
- **Keep names whole.** A wordmark or logo is fully visible and unclipped on the smallest phone.
- Look at `artifacts/mobile/` at real size before every review: each label should read without zooming.

## Density

- One headline and one visual. A line of body copy only when the visual can't carry the point. Anything more needs a reason.
- On phones, the secondary visual or column goes (`mobile-hide`) before the type shrinks below the token scale.
- If a slide needs more than one idea, it is two slides.
- A slide with only a headline, a quote, or a number is complete. Density is a ceiling, never a target.

## What the design review blocks

The hosted design review reads this guide as its rubric. These hold a slide (blocking), however polished it looks:

- **More than three text levels** on one slide (count eyebrow, headline, subhead, body, quote sizes, captions, stat rows).
- **A headline that restates its own quote or visual**, or a quote split across two type sizes.
- **Filler copy:** a line that would fit on any company's slide, a caption explaining what the slide shows, a disclaimer about where the evidence came from, or a stat row unrelated to the headline.
- **More than one idea** on a slide.
- **A close that isn't one ask:** a table, a mutual action plan, a who-does-what list, or "Thank you".
- **A broken interactive slide in its live state:** an overlay, pill, or label covering the focal content or stretched out of shape, a control off the slide, a control at rest that hides what it compares, or a control that does nothing when used.

Not defects: whitespace, a slide that is only a headline, a quote, or a number, and a deck where several slides are type alone.

## Restrained references

The bar is the template rebuilds on pitchunfairly.com: each slide one idea, most of it empty. Open the example before composing a slide of the same job.

- **Airbnb, the ask** (https://pitchunfairly.com/templates/airbnb/deck/#10): "$600K. 80,000 trips in 12 months." and one ring counting the milestone. No use-of-funds table, no stat row.
- **Wonka, the ask** (https://pitchunfairly.com/templates/wonka/deck/#10): "Gates open February 1.", one short line, one button. The whole close is a date and a decision.
- **Jurassic Park, the close** (https://pitchunfairly.com/templates/jurassic-park/deck/#12): "Next meeting: on the mainland." and one chip. No thank-you, no action items.
- **The Devil Wears Prada, the close** (https://pitchunfairly.com/templates/prada/deck/#11): one sentence and a signature. The report's detail stays in the slides before it.
- **Netflix, a culture point** (https://pitchunfairly.com/templates/netflix/deck/#5): a headline and one line on an accent field, most of the slide empty.
- **iPhone, the cover** (https://pitchunfairly.com/templates/iphone/deck/#1): one sentence on a dark stage with a spotlight. The date is the only other text.

What they leave out is the lesson: no captions explaining the visual, no source sentences (sources are in the notes), no second stat row, no plan on the close.

## Charts on a phone

A chart drawn for the stage doesn't survive a phone. At 393 pixels wide its axis labels, gridlines, and legend shrink below anything a reader can take in, and resizing it only trades one problem for another. Give every chart a phone version instead.

- Keep the stage chart and add `mobile-hide` to it. Next to it, build the phone version with `mobile-only`.
- The phone version carries the chart's point and nothing else: the number at `--t-display`, or the shape of the trend as one thick line or a few bars, with two or three labels at `--t-label` or larger. No axes, no gridlines, no legend.
- Label the line or bars directly (the start, the end, the one value the headline is about). If the comparison needs more than three labels, show the result as a number instead.
- The phone version is real: same data, same colors, same claim as the stage chart.

```astro
<figure class="chart mobile-hide"><!-- the full stage chart --></figure>
<figure class="chart-phone mobile-only">
  <p class="chart-phone-number">38%</p>
  <svg viewBox="0 0 300 120" aria-hidden="true"><polyline points="0,100 150,70 300,20" /></svg>
  <p class="chart-phone-label">Gross margin, 2023 to 2026</p>
</figure>
```

The design review checks the phone too. Small chart labels on a phone are a polish note; when it asks for a phone chart, build the phone version, don't resize the stage one again.
