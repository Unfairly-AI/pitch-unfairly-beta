# Site toolbox

The components a proposal site reaches for every time, already built: the hero, the glance band, what you asked for, the calculator, the comparison table, plan cards, the price builder, the scope, tabs, stats, quotes, the team, the client's photos, a statement, the timeline, the close, the sticky header, the sample line, and the viewer panel. Start from these instead of inventing a component. Every section is still written for its reader: copy the component, then change the words, the tokens, the count of items, and the layout where the point needs it.

- `toolbox.css`: every component's styles. It reads only the brand kit's tokens (`--paper`, `--surface`, `--ink`, `--ink-muted`, `--accent`, `--accent-dark`, `--night`, `--on-night`, `--accent-on-night`, `--font-display`, `--font-body`, `--radius-base`, `--radius-button`), so it takes any brand. Copy it to `site/toolbox.css`: the build loads it after the brand and before `site/styles.css`, where the site adapts it. Every class starts with `tb-`.
- `components/*.html`: one snippet per component, with the engine's attributes and `{{tokens}}` from `example.json`. The comment at the top of each says what it's for.
- `example.json`: the worked example's model and facts (a made-up scheduling vendor, Northline, proposing to a made-up client). Rename the tokens to your model's.
- `templates.json`: the two proposal templates, as lists of components in page order.
- `npm run site:new -- <template>` writes `site/` from a template; `npm run site:new -- --list` shows them.
- `npm run site:gallery` builds every component on one page in this project's brand (`dist-gallery/`), each labelled with its name and what it's for. Run it once a customer's brand is in, before choosing components, and again after a change to `toolbox.css`.

Every component lays out for a phone at 390 wide (one column, 44px controls, nothing scrolls sideways; a wide table scrolls inside its `data-scroll` wrapper) and for the PDF (`.is-pdf` rules; `data-pdf-hide` on web-only controls; `data-pdf-open` on detail worth printing).

## Locking a site for production

While a site is being built it reads the live toolbox, so improvements to a component reach it. When the site goes to a real reader, lock it: `npm run site:variants -- lock`. Every component its sections use becomes a variant in `site/variants/`: that component's rules (with its phone and PDF rules) as they are in this engine, then a place for the site's own skin. From then on `site:build` reads only `site/variants/`, so a later toolbox change never moves a page someone has already seen.

- `npm run site:variants -- status` lists the locked components whose toolbox version has changed since (`--json` for one machine-readable line).
- `npm run site:variants -- upgrade <component>` re-locks one variant to the current toolbox and keeps its skin. Rebuild and compare the sections that use it before publishing.
- Put a site's adaptations of a locked component in that variant's skin, below its marker, rather than in `styles.css`, so they travel with the component they change.

## The rules every component keeps

- **One job per screen.** A screen holds one point, made in its headline, with its proof beside or below it. If a section needs a second point, it's a second section.
- **One primary action per screen.** Everything else is a text link.
- **Numbers live in the model.** Every figure is a `{{token}}`; nothing is typed.
- **Detail is one click away.** Assumptions, methods, full tables and sources go in `<details class="tb-more">`, never in the reader's path.
- **Real words, real colors.** A quote is a fact with who said it, word for word (`facts.quotes`); every color is a brand token. `site:check` warns on a quote typed into the page and on a raw color in a section or `styles.css`.
- **Simple copy.** Headlines under 18 words (12 in the hero), ledes under 35, paragraphs under 60, one idea per sentence (voice guide, "Simplify the copy"). `npm run site:check` warns past each limit.

## Motion for charts

Mainstay's sites are the reference: every number and chart moves, quietly, three ways. The components already do all of it; keep it when you adapt them.

- **It enters once.** A headline figure counts up (`data-count`) when it comes into view. Bars `wipe`, columns `grow`, lines `draw` (with `pathLength="1"`), each staggered with `--d` (0, 120, 240ms). The glance band's accent rules and the timeline's steps arrive one after another.
- **It glides when an input changes.** Every element bound with `data-bar` transitions its width, or its height and y for an SVG column, over 450ms, so a chart follows a slider instead of jumping. Changed figures roll to their new value.
- **What changed flashes.** A figure the calculator changed flashes the accent; on the accent answer and on night it gets a soft wash instead, so it still shows.
- **Was and now.** Where the page replaces one figure with another (the renewal against the worst case, a laser against none), put the old one in `tb-was` and the new one in `tb-now` inside a `data-in` parent: the old one is struck through, then the new one lifts in, as on Mainstay's prices.
- **Today, from the viewer's clock.** A timeline with `data-dates` and a `data-date` on each step marks the current, past and next steps at load, fills its line to today, and moves the `data-today` marker. The classes written in the page are the fallback without script.

Reduced motion and the PDF show every finished state. `site:check` warns on a `data-bar` with no `wipe` or `grow` and on a glance, stat, answer or versus figure without `data-count`.

## Components

### hero
**Use it** to open every proposal. **Hierarchy:** who it's for (the `tb-for` chip) → a two-part headline (the second part `.hl`, in the accent) → one sentence → one primary button and one text link ("See the numbers") → the art (a line drawing as `<img data-draw>`, the brand's illustration, or a photo). **Limits:** headline 12 words or fewer, about 5 and 5; lede one sentence, 30 words or fewer; two figures at most; about 80 words in all. **Mistakes:** the decision, the price, or a row of numbers in the hero (they go in the glance band); a second and third button ("Save as PDF" belongs in the close and the footer); a lede that lists who it's for, who it's from, and the date (the chip says who; the footer says when).

### glance
**Use it** right below the hero, in the hero's own file, after its `</section>` and with no `data-section` of its own, so it lifts over the seam on the web and shares the hero's page in the PDF. **Hierarchy:** "The decision" pill and the decision in one sentence → three or four numbers, each a short label, the figure, and a caption under ten words. Mark the number that carries the case `is-focal`. Set `--n` to the count. **Mistakes:** a fifth number; a caption that's a sentence of argument; numbers that aren't in the model.

### heard
**Use it** early, right after the hero, so the page reads as a reply: three to five things the reader asked for, each answered by the plan in one line. The ask is a short title in the reader's terms (`h3`), the answer one sentence beside it; mark the ask that decides the deal `is-focal`. **Limits:** ask under 7 words, answer under 25. **Mistakes:** asks nobody made ("Best-in-class support"); an answer that's a feature list; quoting the reader without the exact words in the facts.

### split
**Use it** for the problem or context: the headline on the left, one short paragraph and the proof on the right (two or three `tb-bar-row` compare bars, a `tb-stats` block, or an image). **Limits:** one paragraph, under 40 words. **Mistakes:** three paragraphs explaining the market; bars without their figures printed.

### cards
**Use it** for how it works: three (at most four) steps or pillars, each a number or icon, a short title, and one line. Mark the one that matters most `is-focal`. **Limits:** title under 7 words, line under 20. **Mistakes:** bullet lists inside cards; five cards.

### calculator
**Use it** when the reader has a choice to make or wants to try their own numbers. **Hierarchy:** a control panel (a `data-choice` segmented control for the option, `data-preset` buttons for named scenarios, two or three sliders) → one big live answer (`tb-answer-n`) with a one-line consequence → a chart (`tb-hbar` rows in a `data-scale` parent) → the detail table behind `<details class="tb-more">`. A `tb-flag` with `data-when` (start it `hidden`) says when the numbers turn against the reader. Put the whole thing in a `data-calc` so its presets reset only its own sliders. On a phone the answer leads and stays pinned while the reader works the controls. **Limits:** three sliders, four presets, one answer. **Mistakes:** two big numbers fighting for the eye; the assumptions as a paragraph under the chart; a headline the sliders can make false (say what the model guarantees, or show it only `data-when`).

### versus
**Use it** for the risk or edge case: two outcomes side by side, the one in the reader's favor lit (`is-focal`). **Hierarchy:** a label, one big figure, one line each. When the headline depends on the numbers, write both versions with `data-when` and start the second `hidden`. **Mistakes:** a third column; a headline that's true only at the default inputs.

### compare
**Use it** to compare terms or plans. Options in columns, the recommended one lit: `is-rec` on its header cell and every cell in its column, with `<span class="tb-rec">Recommended</span>` in the header. Price first, then five or six terms; `tb-yes` and `tb-no` for included and not; a `tb-tag` under a cell names its source ("List price", "Typical market term"); `tb-tag-ex` marks an example. Give each cell `data-label`. On a phone the option names stay as columns and each term's label spans above its values; for a comparison of sentences rather than marks and prices, add `is-text` and each term stacks instead, the lit option first and the other muted below it. **Mistakes:** paragraphs in cells (one line each); more than four columns; a recommendation the table doesn't support.

### tiers
**Use it** for two to four plans as cards, when each plan is easier to read whole than row by row. The recommended plan is lit (`is-rec`, the `tb-rec` pill) and is the only one with a button. Each card: the name, the price with its unit (`tb-tier-price`, the figure with `data-count`), who it's for in one line, three to five lines of what it adds, and the year-one total. On a phone the recommended card comes first. **Mistakes:** a button on every card; a fifth plan; prices typed in. For terms that need comparing line by line, use compare.

### scope
**Use it** when what's left out matters as much as what's in: a scope of work, an implementation, a pilot. Two lists side by side, included (`is-in`, with marks) and not included (`is-out`, muted), four to seven plain phrases a side. **Mistakes:** a sentence of argument per line; an empty "not included" list (cut the component instead); hiding a cost the reader will meet later.

### price
**Use it** when there is one price, to show it and how it's built. **Hierarchy:** a card with the plan's name, the figure (`tb-price-n`, with `data-count`) and its unit, one line on how it's billed, two to four ticked inclusions (`tb-ticks`), and what the fee covers behind `<details class="tb-more" data-pdf-open>` → beside it the arithmetic (`tb-build`), one line at a time: the reader's own count in a stepper (`tb-stepper`: a `data-input` number input with `data-step` buttons, so every total follows it), the rate, then the totals (`is-total`), and a `data-reset` link back to the proposal's count. The card carries `data-tone="night"` so it reads as the answer. On a phone the card leads and each line stacks; the PDF drops the stepper's buttons and prints the totals at the proposal's count. **Limits:** five lines of arithmetic, three or four inclusions. **Mistakes:** a figure typed into a line (every one is a `{{token}}`); a second price (that's tiers or compare); a stepper on a count the reader can't change.

### stats
**Use it** for proof: three or four big numbers, each with a short label and its exact qualifier (what was measured, over what, when) in `tb-stat-q`. The first number takes the accent. **Mistakes:** rounding a published figure ("about 95%" for 94%); dropping the qualifier; a stat without a source in the facts.

### tabs
**Use it** when one idea has three to five facets and the reader only needs the one that's theirs: who it helps, what each role does, how each site works. Tabs (`tb-tab`, each a short label and a title, optionally a `tb-tab-ic` icon) sit beside the open panel; each panel has a label, a headline, two to four ticked points (`tb-ticks`) and one closing line (`tb-tabpanel-foot`). Put the whole thing in `data-picker`; each tab's `aria-controls` names its panel, and the first tab and panel carry `is-on`. Set `--n` to the count so the PDF can print every panel side by side. Arrow keys move between tabs. **Limits:** five tabs, four points a panel. **Mistakes:** the page's main point behind a tab the reader may not open (a tab holds detail, not the case); tabs with one panel's worth of content; panels that need the others to make sense.

### quotes
**Use it** for testimonials. One large pull quote (`tb-pull`: an oversized quotation mark, the quote in the display face, then a hairline and the attribution: a monogram or logo, name, title and company), then optionally a row of two or three cards (`tb-quotes`, `--n` set to the count). **Rules:** quote the shortest verbatim excerpt that carries the point, word for word, with the attribution as published. Never stack several long quotes; never invent or tidy one. Quotes sit in `<blockquote>`, so the copy check leaves their words alone. **Mistakes:** five quotes in a column; a quote with no title or company; italics for the whole quote.

### team
**Use it** for the two to four people the reader will actually work with: a photo (an `<img>` in `tb-person-face`) or a monogram, name, role, and one line on what they do on this account. Names, roles and lines are facts (`facts.team`). **Mistakes:** the whole leadership team; bios; stock photos.

### photos
**Use it** when the client's world is easier to see than to describe: their premises, their crews, their product in use. One lead photo (`is-lead`) and two beside it, each a `<figure class="tb-photo">` with a one-line caption; under them one credit line (`tb-photo-credit`). Every photo, alt, caption and the credit are facts (`facts.photos`). **Where the photos come from:** the client's own website first. In a proposal kit, declare `inputs.photos` in `kit.json` and the engine fetches them before the build (unfairly-app `docs/proposal-engine.md`, "Request photos"): the request the kit reads carries `photos[]`, each `{file, width, height, alt, context, method, credit?}`, site photos first. Copy each `file` into `site/assets/` and set `facts.photos.p1` and so on from it (`context`, the heading it sat under on their site, is a good start for the caption). Stock (`method: "stock"`) only fills a gap; then the credit line names each photographer and Pexels ("Photos: Ana Ruiz and Sam Lee on Pexels"), which Pexels asks for. On a phone the lead photo spans the width and the other two sit side by side; the PDF gives the band a fixed height. **Limits:** three photos, a caption under 12 words. **Mistakes:** a stock photo where the client has their own; a photo of someone else's brand or premises; a caption that restates the headline; a logo or a screenshot (that's the hero art or split).

### statement
**Use it** once, for the turn in the argument: the belief the plan rests on, or the line the reader should repeat to their boss. One sentence (`h2.tb-statement-line`) with its second part in the accent, and at most one short line under it. Night or surface tone. **Limits:** 18 words or fewer. **Mistakes:** a slogan the page doesn't prove; two statements on one page; a figure (that's stats or the glance band).

### timeline
**Use it** for the dated path from now to the start. Four to six steps, each a date, a title, an owner (`tb-step-who`), and one line. Set `--n` to the count and `--now` to today's step (0 is the first); give that step `is-now` and a `tb-today` pill, steps before it `is-done`, the last `is-end`, and the one step the reader acts on (the decision) `is-key`, so it carries the weight. On a wide screen it's horizontal with the path so far filled in the accent; on a phone it's a vertical stepper. **Limits:** one line of 12 words or fewer a step. **Mistakes:** steps with no date or no owner; "Q1" for a date; a sixth step that's a detail of the fifth.

### close
**Use it** to end. **Hierarchy:** the ask as the headline (what to do, by when) → two or three numbered steps after yes → one primary button and a "Save as PDF" text link → a contact card (name, role, email). The card replaces the button in the PDF. The primary button carries `data-cta="accept"` (or `book_meeting` for a booking link) and opens in a new tab, so a hosted page reports the click (`deck:cta`); the hero's button carries its own short id. **Mistakes:** three buttons; no named person; a close that summarizes the page again.

### header
**Use it** on any page longer than five screens: the sender's mark, a nav of five to seven sections (it hides under 1100px; the engine marks the section being read and draws a reading-progress hairline), and one button. **Mistakes:** a nav item per section; two buttons.

### sample band (the `sample` component: the band in `components/header.html`, the PDF strip in `parts/sample.html`)
**Use it** on every sample or spec (`"sample": true` in `site.json`): one slim band at the top of the sticky header, in the Pitch Unfairly house palette (a yellow, cyan or pink band with ink type and a 2px ink rule, the line in DM Sans) whatever the page's brand, so it can't be mistaken for the provider's page. It says, in one line, that this is a sample and what's fictional, and carries at most one link: **Made by Unfairly** (`data-cta="made_by"`, `facts.sample.made_by_label` and `made_by_href`, which goes to an Unfairly home page: `https://unfairly.ai/` by default, never a booking calendar, `mailto:` or a claim flow; from engine 1.11 `site:check` blocks any other target, on screen or in the PDF strip, and reads the old `book_href`/`book_print` with a warning to rename them). **It is never an ad.** A sample is a proposal the seller could send; Unfairly's booking buttons ("Book 30 minutes", "Email us"), "yours could look like this", a who-read-it demo and a house close are our pitch, and our pitch goes in the note that carries the link. From engine 1.10 `site:check` blocks all of them on any sample, lead or not (a warning on an older pin). The palette is tokens (`--tb-sample-paper`, `-ink`, `-magenta`, `-magenta-dark`, `-periwinkle`, `-yellow`, `-cyan`, `-pink`, `--tb-sample-display`, `--tb-sample-body`, and the roles `--tb-sample-band` and `-pill`), so another kit sets its own. **The clash rule:** the band must never share a hue with the provider. `sampleTone(brand)` in `sample-tone.mjs` reads the provider's saturated colors and returns `{ tone, pill }` for `data-sample-tone` and `data-sample-pill`: the band is whichever of yellow, cyan and pink sits farthest in hue from every provider color. Ink on each band tone is 4.5:1 or better. On a phone it is one short line that still names the seller and the buyer ("Sample: Northline for Harlow Services."), with its link in view, which `site:audit` checks at 390 and 320 from engine 1.11; the PDF, which has no header, carries `parts/sample.html` on its first page. **Limits:** one line of copy, under 20 words; one link at most. **Mistakes:** the provider's colors (then it reads as their UI); booking or email buttons; a second link; a modal or overlay that blocks the proposal. A real proposal for a real client drops the band and `"sample": true`; `site:check` warns on a sample without the band.

## Templates

`npm run site:new -- data-proposal` for a proposal where the reader compares options and tries numbers; `npm run site:new -- proposal` for a standard one (hero, what you asked for, how it works, the client's photos, the scope, the price, the team, quotes, the timeline, the close). A template is a starting order, not a page: cut what this reader doesn't need, and swap in tiers or a statement where the point calls for it. The sites guide (`deck_guide` topic `sites`, "Proposal templates") says what goes in each section and what doesn't.
