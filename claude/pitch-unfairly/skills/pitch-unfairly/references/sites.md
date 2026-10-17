# Pitch Unfairly: sites

A site is a scrolling page published like a deck: the same link, password, named links, gallery, versions, and views (one per section instead of one per slide). Use one when the reader will scroll, compare, and try numbers on their own, such as a proposal a broker forwards, a pricing page for one customer, or a business case. Use a deck when someone will present it.

Start from the toolbox, not a blank page. The starter carries a toolbox of proven components (hero, glance band, what you asked for, calculator, comparison table, plan cards, scope, stats, quotes, team, statement, timeline, FAQ, close, sticky header, sample band) and two proposal templates built from them. They are the default for every common job: copy the component that does the job, then write it for this reader and this point, and adapt its layout where the point needs it. Invent a component only for a job the toolbox doesn't do. Under the components, the starter gives you the machinery that has to be right every time: the numbers, the brand, the controls, the checks, and publishing.

## The project

A site lives in the same project as a deck, under `site/`:

```
site/site.json          engine, title, description, sample, model, facts
site/header.html        optional, before the sections (a sticky header is <header class="top">)
site/sections/*.html    the page, one file per section, in file-name order: 01-hero.html, 02-...
site/parts/*.html       pieces a section includes: generated maps, or a block several sections share
site/data/              what the tools read: sites.json, map.json, the census summary (never the raw census)
site/footer.html        optional, after the sections
site/toolbox.css        the toolbox's components, copied by site:new (loaded before styles.css)
site/styles.css         the site's own design
site/assets/            images and drawings, referenced as assets/...
brand/brand.json        the brand kit, as for a deck
story.md                the story: audience, the action, and one block per section
```

`site.json` names the engine it was built with, `"engine": "sites@1.3"`. A site keeps building with any newer 1.x, and the check refuses an engine older than its pin or a different major version, so a copy made a year from now still builds the way it did. A new site gets the current pin; update an old one's only when you've rebuilt and looked at it.

Commands, from the project folder:

- `npm run site:new -- data-proposal` (or `proposal`) writes `site/` from a proposal template: its sections from the toolbox in order, the header and footer, `toolbox.css`, and the example model. `--list` shows the templates.
- `npm run site:gallery` builds every toolbox component on one page in this project's brand (`dist-gallery/`), each labelled. Look at it once the brand is in, before choosing components.
- `npm run site:check` checks the source in a second. Run it often.
- `npm run site:build` builds `dist-site/`, a static folder that works on any host.
- `npm run site:audit` checks, builds, opens the page at 390, 1280, and 1920 wide, screenshots every section into `artifacts/site/`, works every control, checks tap targets on the phone, and writes the PDF (`dist-site/deck.pdf`). Publishing needs a clean audit newer than every edit.
- `npm run -s site:manifest` prints the arguments for `deck_upload_start`.

## Numbers come from the model

Every figure on the page comes from `site.json`, never typed into a section. That's what keeps the page, the calculators, and the PDF agreeing, and it's what makes a site reusable: copy it, change the inputs, and every figure follows. `site:check` refuses dollar amounts, percentages, and multiples typed into a section, and any fact (a name, a date) typed instead of its token, and warns when a plain number in a section equals a model value ("92 of 133 enrolled"), since that's usually the value typed in.

```json
{
  "title": "Catering for Example Co",
  "description": "A catering plan for Example Co.",
  "model": {
    "inputs": { "people": 40, "per_head": 12, "days": 5 },
    "formulas": { "weekly": "people * per_head * days", "yearly": "weekly * 48" },
    "formats": { "weekly": "money", "yearly": "money", "per_head": "money" }
  },
  "facts": { "client": { "name": "Example Co", "short": "Example" }, "start": "March 1, 2027" }
}
```

- **Inputs** are the numbers you were given. **Formulas** run in order, each over the inputs and the formulas before it. The grammar is arithmetic, comparisons, `&&` `||` `!`, `name[i]`, and `min max round floor ceil abs if(cond, a, b) sum(list)`. Nothing else runs.
- **Formats:** `money` ($2,400), `money_k` ($2K), `money_exact` ($27.4), `pct` (0.35 shows 35%), `pct1` (0.075 shows 7.5%, for published averages), `mult` (1.5×), `int` (1,129), `number`.
- **Facts** are text: names, dates, places. Anything that changes from one customer to the next is a fact.

In a section:

- `{{weekly}}` prints a model value, formatted. It's live: when a reader changes an input, it updates.
- `{{facts.client.name}}` prints a fact.
- `{{= yearly / 12 | money}}` prints a one-off formula. Keep comparisons (`<`, `>`) out of these; put them in `site.json` or a `data-when`.
- Tokens work inside attributes too (`alt="{{facts.client.name}}"`), as plain text.

A headline that makes a claim has to stay true when the inputs change. "Pays for itself in year one" is only safe if the model says so; when it might not, write a claim the model guarantees, or show the line only `data-when="ret1 >= 1"`.

## Copy is held to the deck rules

A site's words get the same review a deck's do (`voice.md`), read off the page with its tokens filled in. `site:check` refuses an em dash (or a spaced en dash or double hyphen used as one), fragments strung together with middle dots, and a line that opens with a bold label and a colon. It warns, for you to read and decide, on generated-sounding words (unlock, seamless, empower, streamline, leverage and the like), "not just X but Y", a "Title: subtitle" headline, a headline over 110 characters, and an eyebrow or label that only says "Overview" or "Next steps". Quoted words in a `<blockquote>`, or in any element marked `data-copy-ok` (a verbatim quote that keeps its own dash), are someone else's and aren't checked. The blocking rules came with `sites@1.2`; a site pinned to 1.1 sees them as warnings until it's re-pinned.

The voice guide's "Simplify the copy" rule is measured too, as warnings: a hero headline over 12 words, a hero lede over 30 words or longer than one sentence, a hero with more than one button or more than two figures, a section headline over 18 words, a lede over 35, a paragraph over 60, and a sentence over 30. Detail inside `<details>`, tables and quotes doesn't count: one click away is where it belongs. Read each warning, then cut, or keep the line on purpose.

## Interactivity is attributes

Sections carry no scripts. The page script reads these attributes, so any layout you invent gets working controls:

- **Sections:** each file has exactly one `<section id="..." data-section="name">`. It's what views count, how `#3` links jump, and what the gallery lists.
- **Inputs:** `<input type="number" data-input="people" min="1" max="500">` or `type="range"` change a model input. Buttons `data-step="-1" data-for="people"` step it; `data-reset="people"` returns it to the model's value (and shows only once it differs). A range shows its value in `<output data-out="people">`, formatted by its `data-format`.
- **Presets:** `<button data-preset='{"e1":"cons_e","s1":0.15}'>` sets several inputs at once, from numbers or the model's own names (so a copy keeps working). `data-preset='{}'` puts everything back. Inside a `data-calc` element, a preset resets and marks only that calculator's sliders and presets, so two calculators on one page leave each other alone.
- **Choices:** a `data-choice` group of `<button data-set='{"plan_i":1}'>` buttons is a segmented control: a click sets those inputs and nothing else (the sliders keep their values) and marks itself on. Use it for the option the reader picks (a plan, a deductible).
- **Conditions:** `data-when="sav1 < fee1"` shows an element only while the formula holds. Start it `hidden`.
- **Bars from the model:** inside a `data-scale` parent, `data-bar="name"` sizes each bar against the largest in that parent (or against a model value with `data-scale-to="name"`, so the whole chart grows as an input moves): an SVG `<rect>` grows up from `data-base` (default 190) to `data-max` tall (default 180); anything else sets its width.
- **Pickers:** a `data-picker` holding `role="tab"` buttons with `aria-controls`, and `role="tabpanel"` panels with matching ids. Arrow keys work. Without script, and in the PDF, every panel shows. A panel gets `is-shown` each time it opens, for an entrance you style.
- **Dated paths:** a `data-dates` element whose steps carry `data-date="2026-11-20"`. At load, from the viewer's clock (or `?today=2026-11-25` to check one), the last step on or before today gets `is-now`, earlier ones `is-done`, the next `is-next`; the path gets `--now`, today's position in steps (1.5 is halfway from the second step to the third); and a `data-today` marker moves into the current step's `data-date-label`, hiding before the path starts. Write the classes for the day you build too: without script they stand.
- **Calls to action:** `data-cta="accept"` or `data-cta="book_meeting"` (or the site's own short id: letters, digits, `_` and `-`, up to 40) on a button that should count. On pitchunfairly.com a click posts `deck:cta` to the frame just before the link opens, and the owner sees it with the views. A link out has to open in a new tab (`target="_blank" rel="noopener"`) so the frame stays open to report it; `site:check` says when one doesn't.
- **Toggles:** a `data-toggle` holding `<button data-i="0">` buttons; every `data-values='[18,37,58]'` inside shows the chosen entry, and with `data-of="133"` sets its width as a share.

## Motion

Motion is opt-in and plays once. The motion kit is the deck's, keyed to sections: a section gets `is-active` the first time a quarter of it is on screen, and these classes play then. Each class's resting style is its finished state, so the PDF and reduced motion show the end. Stagger with `style="--d: 120ms"`.

- `rise` lifts in, and `pop` scales in.
- `draw` traces an SVG stroke (give the path `pathLength="1"`): outlines, maps, charts' lines.
- `wipe` reveals left to right: every horizontal bar.
- `grow` grows up from the bottom: every column, SVG `<rect>`s included.
- `type` types one line (set `--chars`), and `breathe` is the one ambient loop.

Animate every chart with the kit, so bars and columns grow into their values. The toolbox's README has "Motion for charts": every headline figure counts up, every chart enters once with a stagger, every `data-bar` glides when an input moves (the engine sets a column's height and y as style, so a CSS transition on them works), changed figures flash, and a figure that replaces another is struck through before the new one lands. `site:check` warns on a `data-bar` with no `wipe` or `grow` and on a toolbox figure without `data-count`. Beyond the kit:

- Each section's blocks below the fold lift in as they arrive.
- `data-count` counts a figure up from zero when it comes into view.
- `data-grow` grows a bar from zero to its width.
- `data-in` adds `is-in` once seen, for an entrance you style; a picker marked `data-in` also plays its open panel's entrance.
- `<img data-draw src="assets/drawing.svg">` traces a line drawing like a pen, then inks it in. Use it on the hero drawing, not everywhere.
- A sticky `<header class="top">` gets a reading-progress hairline.
- Changed figures flash the accent.

All of it respects reduced motion and is finished in the PDF.

## Parts and tools

A section can include a part: `{{> parts/where-map}}` puts `site/parts/where-map.html` there, before tokens are filled, so a part can hold `{{tokens}}` too. Parts can include parts, three deep. Use them for what a tool generates and for a block two sections share; write everything else in the section itself.

Two tools turn a customer's census into parts. Keep the raw census out of `site/`: it describes each employee, and the project's files are published with every version. The tools write only counts.

- `npm run site:census -- <census.csv or .xlsx> --site "Downtown:20005" --out site/data/census.json` reads an enrollment census (one row per employee or dependent, with a ZIP code column) and writes the summary: enrolled and eligible counts, tiers, how many live in each state (`by_state`), and how many live within each distance of the sites (`--radii 5,10,20`). Sites come from `site/data/sites.json` (`{"sites": [{"name", "zip"}]}`) and from each `--site`; the employer's own places go first. A state or ZIP code with fewer than three people is counted but never named (`small_states`), so the summary can't point at anyone. Put the figures in `site.json` and write the sentences yourself.
- `npm run site:map -- --states VA,DC,MD` draws where people live as `site/parts/where-map.html`: real state outlines (from the Census Bureau's boundaries) drawn as an uneven pen line, hatched denser where more people live, with each state's count as a button that shows a callout on hover or tap, and the people elsewhere as one "in N other states" button. Callouts come from `site/data/map-callouts.json` (`{"VA": {"head", "body"}}`); `--frame west,south,east,north` sets the view. With no census summary, write the whole spec in `site/data/map.json` and run `npm run site:map -- --spec site/data/map.json`. A state too small to hold its label is inked solid with a leader to it. The map takes the brand's ink and accent, the kit draws it in, and the PDF shows it finished.

Rerun a tool rather than editing what it wrote.

`npm run site:vendor` saves the brand's fonts into `vendor/fonts/`, so the site then builds with plain Node and no `npm install` (`node bin/site-build.mjs <out-dir>`): from a plain copy of the project, or in a sandbox with no network.

## Design

`brand.css` is loaded first: the kit's tokens (`--paper`, `--surface`, `--ink`, `--ink-muted`, `--accent`, `--accent-dark`, `--night`, `--on-night`, `--accent-on-night`, `--border-color`, `--font-display`, `--font-body`, and the rest from the brand-kit guide), its fonts bundled with the page, and a base that sets body type and headings from them. Write everything else in `site/styles.css`, reading the tokens. A brand with its own vocabulary can name them once at the top (`--poppy: var(--accent)`).

Design it as a web page, not slides stacked vertically:

- One point per section, made in its headline, with the proof beside or below it.
- **The hero is calm.** It holds who it's for, a short two-part headline, one sentence, one primary action with one text link ("See the numbers"), and the art. Nothing else. This isn't a PDF cover: the reader scrolls, so the decision and the three or four numbers that matter go in a glance band right below the hero, each number standing alone with a short label and caption. Every first build crams the hero; check yours against this list.
- Prefer a control over a paragraph when the reader has a choice to make: a picker for three options, a toggle for distances, a calculator for "what if".
- Put assumptions and sources one click away (`<details>`), never in the reader's path.
- One primary action per screen; every other action is a text link.
- Use the toolbox's treatments for quotes and timelines: a large pull quote with a proper attribution, and a dated timeline with owners and today marked. A quote in plain body text or a timeline as a list of dates reads as a document, not a site.
- End with the ask: what happens next, who to contact, and the PDF.
- At 390 wide nothing scrolls sideways (wrap a wide table in `.table-wrap` or `data-scroll` to let it scroll on its own), text is at least 12px, and controls are at least 44px tall.

Everything loads from the site itself: download images into `site/assets/` (the content host blocks requests to other sites).

## The toolbox

The toolbox is in the project at `site-toolbox/`: `toolbox.css`, one snippet per component in `components/`, the example model (`example.json`), and the templates (`templates.json`). Its `README.md` gives each component's job, the hierarchy it enforces, its limits, and its common mistakes; read it before composing. `site:new` copies `toolbox.css` to `site/toolbox.css`; to use a component in a site built some other way, copy that file once and paste the snippet.

The CSS reads only the brand kit's tokens, so it takes any brand, and every class starts with `tb-`, so the site's own `styles.css` adapts it without collisions. Each component already lays out for a phone at 390 and for the PDF.

A sample (`"sample": true`) carries the sample band: one slim band above the header, in the Pitch Unfairly house palette whatever the page's (a yellow, cyan or pink band, a magenta pill, Sora and DM Sans), saying what's fictional, with "Book 30 minutes" and "Email us" as tracked calls to action. It's what makes a sample read as not the provider's own page, so it must never share the provider's hues: set `data-sample-tone` and `data-sample-pill` from `sampleTone(brand)` in `site-toolbox/sample-tone.mjs`, which picks the band tone and pill farthest from the brand's colors. `site:check` warns on a sample without it.

| Job | Component | What it holds |
|---|---|---|
| Open the page | `hero` | Who it's for, a two-part headline, one sentence, one button and one text link, the art |
| The decision and the numbers | `glance` | The decision in one sentence; three or four numbers with labels and captions |
| Problem or context | `split` | Headline left; one paragraph and two or three compare bars right |
| A reply to what they asked | `heard` | Three to five asks in the reader's terms, each answered in one line |
| How it works | `cards` | Three or four steps, each a title and one line |
| What's in and what isn't | `scope` | Included, with marks; not included, muted; four to seven phrases a side |
| Try the numbers | `calculator` | Choice, presets and sliders; one big live answer and its consequence; a chart; the detail in a toggle |
| The risk or edge case | `versus` | Two outcomes side by side, the reader's lit |
| Compare terms or plans | `compare` | Options in columns, the recommended one lit, sources as small tags |
| Plans as cards | `tiers` | Two to four plans, the recommended one lit and the only one with a button |
| Proof | `stats` | Three or four big numbers, each with its exact qualifier |
| Testimonials | `quotes` | One large pull quote, then a row of two or three |
| Who they'll work with | `team` | Two to four people: face or monogram, name, role, one line on this account |
| The turn in the argument | `statement` | One sentence set big, once a page |
| The path to the start | `timeline` | Four to six dated steps with owners, today marked |
| Questions | `faq` | Four to eight questions in an accordion |
| The ask | `close` | One action, two or three steps, who to contact, Save as PDF |
| Navigation | `header` | Mark, five to seven nav links, one button |
| A sample | `sample` (the band in `header.html`, `parts/sample.html` for the PDF) | One slim band in the house palette, off the provider's hues: what's fictional, Book 30 minutes, Email us |
| Who read it (Unfairly samples) | `viewers` | Illustrative views by named link |

## Proposal templates

A proposal follows a shape the reader already knows, so start from one of these. Cut a section the reader doesn't need; add one only for a point no section makes.

**The data-heavy proposal** (`npm run site:new -- data-proposal`), for a reader who compares options and tries numbers: a pricing or savings case, a plan with tiers, a business case someone forwards.

| # | Section | Component | What goes in | What doesn't |
|---|---|---|---|---|
| 1 | Hero | `hero` | Who it's for, the promise in two short parts, one sentence, one action | The decision, prices, a row of numbers, a second button |
| 2 | Glance | `glance` (in the hero's file) | The decision in one sentence; the three or four numbers the decision rests on | A fifth number; argument |
| 3 | Problem or context | `split` | What it costs the reader today, with one proof | The market's history; three paragraphs |
| 4 | How it works | `cards` | Three steps or pillars, one line each | Feature lists |
| 5 | The calculator | `calculator` | The choice, the reader's own numbers, one answer | Every assumption in the reader's path |
| 6 | The risk or edge case | `versus` | The case the reader worries about, with its number | A claim the inputs can make false |
| 7 | Terms comparison | `compare` | The options or the market's terms against yours, sourced | Paragraphs in cells |
| 8 | Proof and quotes | `stats`, then `quotes` | Published numbers with qualifiers; one pull quote, two or three more | A wall of quotes |
| 9 | Timeline | `timeline` | Dated steps with owners from today to the start | Undated phases |
| 10 | FAQ | `faq` | The questions asked before a yes | Restating sections |
| 11 | Close | `close` | The ask by a date, the steps after yes, a named contact, the PDF | A summary of the page |

**The standard proposal** (`npm run site:new -- proposal`), with no calculator: a scope of work, a partnership, a service with one price. Hero and glance, what you asked for (`heard`), how it works (`cards`), the scope, the team, quotes, timeline, FAQ, close.

**Keep any one screen from overwhelming the reader.** One point and one focal element per screen: the answer in the calculator, the lit column in the comparison, the pull quote. Three to four of anything (numbers, cards, steps of the close), never seven. Detail goes behind `<details>`. If a section needs more than a screen and a half at 1280 wide, it's two sections, or its detail belongs in a toggle. Write the copy short first (voice guide, "Simplify the copy"), then design; `site:check` warns where a line runs long.

## The PDF

The PDF reads like a deck: each section on its own 16:9 page, in the site's own design, with toggles as the web shows them (closed). A section taller than a page is scaled down to fit, and the audit warns when that drops below 60%: fold the detail into a toggle, or split the section. Two attributes shape it:

- `data-pdf-open` on a `<details>` opens it in the PDF (a year-by-year table the reader would want on paper).
- `data-pdf-hide` leaves an element out of the PDF (controls that only work on the web, like a slider panel or a booking widget).
- `class="pdf-only"` shows an element only in the PDF (the contacts in place of a booking widget).
- While it exports, `<html>` has class `is-pdf`: write `.is-pdf` rules in `styles.css` to lay a section out for the page (side by side instead of stacked, tighter rows, a shorter photo). Each page is laid out at 1280×720 with an even margin and scaled to fill it, so design the page rather than shrinking the web one.

The page also has print styles for someone who prints from the browser; the PDF doesn't use them.

## Copying a site

Every published version keeps its project files. To make a new site from one that worked:

1. `deck_source` for the published site, then `npm run source:pull <download_url>` in a new project folder.
2. Change `site.json`: the inputs, the facts, the title. `npm run site:check` lists everything still pointing at the old customer.
3. Rewrite the sections that should differ, add sections this reader needs, and delete the ones they don't.
4. Update `story.md`, run `npm run site:audit`, and look at every screenshot.

## Publish

1. `npm run site:audit` until it says "All modes clean", then look at every screenshot in `artifacts/site/` (phone, laptop, wide) as you would a deck's.
2. `npm run -s source:pack`.
3. `npm run -s site:manifest > artifacts/site-start.json`. Pass it to `deck_upload_start` with the workspace, the source size, and a password if the content is confidential. Save the reply as `artifacts/uploads.json`.
4. `node bin/upload.mjs artifacts/uploads.json dist-site`, then `deck_publish`. Named links (`deck_link`) and the password (`deck_password`) work as for decks.
