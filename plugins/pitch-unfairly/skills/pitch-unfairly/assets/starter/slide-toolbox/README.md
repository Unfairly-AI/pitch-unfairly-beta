# Slide toolbox

Slide layouts a deck reaches for every time, already designed: coded Astro slides that wear any brand, the way the site toolbox's components do for sites. Start a slide from the layout that does its job, fill its props with the deck's words, and change the layout where the slide's point needs it. Every deck still has to look like it came from its brand and not from us (craft guide, "Distinctive, not a template"): the layouts carry composition, the kit carries everything else.

- `layouts/<type>-<variant>.astro`: one slide per file. The type is the slide's job (title, quote, big-number), the variant its shape. Each wraps `src/components/Slide.astro`, takes its content as typed props (and a slot for markup where a prop can't carry it), and holds its own styles, with its phone and PDF rules.
- `catalog.json`: one entry per layout: its type and variant, the job it does, when to use it and when not, its props, its default tone, and the reference slides it was designed from. `planned` lists the types and variants still to build.
- `example.json`: the worked example (Northline, a made-up crew-scheduling vendor, pitching Harlow Services). Its `slides` hold each layout's props; an array shows the layout once per entry, on different tones.
- `lib.ts`: what the layouts share: the props every one passes to `Slide` (`SlideBase`), the accent-phrase split, and the type fitting.
- `npm run deck:gallery` builds every layout, filled from `example.json`, in this project's brand into `dist-gallery/`, each labelled with its name, its job and its tone, then screenshots every slide headless and writes `dist-gallery/contact-sheet.png` (the stage, as the PDF renders it) and `contact-sheet-mobile.png` (393 wide). `-- --wire` builds the same gallery as a wireframe into `dist-gallery-wire/`; `-- --kit <folder>` builds it in another brand-kit@1 folder's brand into `dist-gallery-<folder>/`; `-- --photos <folder or a,b>` (and `--faces` for portraits) puts real photos in place of the example's stand-ins, the only way to judge a photo layout's crops and its contrast over an image; `-- --audit` then runs every deck check on the build; `-- --no-shots` skips the screenshots. Run it once a customer's brand is in, before choosing layouts, and after any change to a layout.

## Using a layout

Import it in a slide file and pass the props. The slide file stays the deck's: its order in `src/pages/index.astro`, its words from `story.md`.

```astro
---
// src/slides/04-cost.astro
import BigNumber from '../../slide-toolbox/layouts/big-number-number-label.astro';
---

<BigNumber
  id="cost"
  tone="warm"
  headline="Every crew loses this much of its day to re-routing."
  number="41"
  unit="min"
  caption="Average per crew, March to May 2026"
  supports={[{ label: 'Crews on the road', value: '62' }]}
  notes="Source: Harlow's dispatch logs, March to May 2026."
/>
```

Every layout takes `id` (required), `label`, `tone`, `notes` and `brand`, and passes them to `Slide`. Headlines and quotes are set at the largest size that fits their box (three lines on the stage, four on a phone), so a shorter line comes out bigger. The size is estimated from the character count when the slide builds, then measured in the page once the brand's fonts have loaded (`src/scripts/fit-text.js`, before shots, the PDF and the audit run): an element marked `data-fit="<stage lines> <phone lines>"` shrinks until it sets on that many lines, and further while its slide overflows, so a wide face (a semi mono, a heavy grotesk) fits as well as the one the estimate assumes. Small accent text (a step number, a date) takes `--hl-text`, the kit's accent step that reads at 4.5:1, not `--hl-color`, which only large type can wear; a phrase in `hl` must appear in the sentence word for word, or the build stops and says so. A prop past its limit (a fourth meta fact, a quote over 140 characters) stops the build too, with the fix.

## Wireframe mode

`.is-wire` on `<html>` swaps the brand kit's tokens for greys and the system font (`src/styles/wire.css`): every color role, the fonts, the type weights and tracking, the radius, the border and the shadow. Slides and layouts don't change; the same files wear the kit again when it's off. It's the wireframe stage of a build: structure and hierarchy, judged before color and type can flatter them.

- `DECK_WIRE=1 npm run dev` or `DECK_WIRE=1 npm run build`: the deck as a wireframe. Never publish a wireframe build; rebuild without it first.
- `?wire=1` on any page's URL: the same switch at runtime, for a quick look at a built deck.
- `npm run deck:gallery -- --wire`: the toolbox as a wireframe.

## The rules every layout keeps

These are the craft guide's rules, held in code so a builder starts from a slide that already passes them.

- **One focal element with real scale.** The figure, the quote, the promise. Only it gets the accent or the weight; everything else is quiet support.
- **Three text levels at most.** The headline, the focal element, quiet support (a caption, a ledger, an attribution). A layout has no slot for a fourth.
- **Whitespace is intentional.** The space in a layout is part of its composition: between a cover's mark and its promise, above a quote. No layout is a small headline on a blank page; the type fitting sizes the focal element to its box.
- **Brand tokens only.** A layout's `<style>` reads the kit's tokens (`--paper`, `--ink`, `--accent`, `--hl-color`, `--font-display`, `--t-*`, `--gap` and the rest) and tints them with `color-mix` against `currentColor`, so it reads on any tone. No raw color and no font name: `test/slide-toolbox.test.mjs` fails on one.
- **The accent marks one idea.** A layout with an `hl` phrase moves the accent to it and takes it off its other element (the quote's mark goes quiet).
- **Phone.** Under 800px wide: one column, nothing sideways, and the focal element keeps the largest size the phone allows (sized to the phone's width, not shrunk with the type scale).
- **PDF and static.** Every resting state is the finished state: a counter prints its final figure, entrances are done, nothing interactive is needed to read the slide. Each layout says so in an `html.is-static` rule.
- **Motion.** One showpiece per layout (the figure counts up, the quote mark pops), everything else rises in reading order.
- **Words come in, never live in the layout.** No copy is typed into a layout. The words are the deck's, from its story.

## Breaking from a layout (color outside the lines)

A layout is where a slide starts, not a cage. When the slide's point needs something the layout doesn't do (a second exhibit beside the figure, the brand's illustration where the quote mark is, a photo bleeding off the edge), break from it:

1. **Copy, don't fork in place.** Copy the layout's file into `src/slides/` as that slide (`src/slides/04-cost.astro`), fix its imports (`../components/Slide.astro`, `../../slide-toolbox/lib`), and edit the copy. The toolbox file stays as it is for every other slide and deck.
2. **Keep the bones that make it work.** The one focal element, the three levels, the phone rules, the `is-static` rule, tokens only. Change the composition, not the discipline.
3. **Change for the point, not for variety.** A break earns its place when the slide says something the layout can't. "It looks like the last slide" is a reason to pick another layout, not to bend this one.
4. **Check it like any slide.** `npm run audit` and `npm run shots`, on the stage, on the phone and in the PDF.
5. **If the break is good for every deck, bring it back.** A change that would help every use of the layout belongs in the layout: update it, its catalog entry and its example, and rebuild the gallery.

## Adding a layout

Name it `<type>-<variant>.astro` with a type and variant from `catalog.json`'s `planned`, and copy the shape of the first three: the doc comment saying what it is, `Props extends SlideBase` with a comment on every prop and its limit, errors that say the fix, styles scoped to one `st-<type>` root with a phone block and an `html.is-static` block. Then add its catalog entry (with one to three reference slides from the layout research), its props in `example.json`, run `npm run deck:gallery` with and without `--wire`, look at both contact sheets on the stage and the phone, and run `npm test`.
