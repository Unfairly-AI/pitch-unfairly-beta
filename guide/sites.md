# Pitch Unfairly: sites

A site is a scrolling page published like a deck: the same link, password, named links, gallery, versions, and views (one per section instead of one per slide). Use one when the reader will scroll, compare, and try numbers on their own, such as a proposal a broker forwards, a pricing page for one customer, or a business case. Use a deck when someone will present it.

Start from the toolbox, not a blank page. The starter carries a toolbox of proven components (hero, glance band, what you asked for, calculator, comparison table, plan cards, price builder, scope, tabs, stats, quotes, team, photos, statement, timeline, FAQ, close, sticky header, sample band) and two proposal templates built from them. They are the default for every common job: copy the component that does the job, then write it for this reader and this point, and adapt its layout where the point needs it. Invent a component only for a job the toolbox doesn't do. Under the components, the starter gives you the machinery that has to be right every time: the numbers, the brand, the controls, the checks, and publishing.

## Understand the company before writing

Use the existing workflow, company Brain, customer kit, layered context and review engine. This is preparation for those tools, not another proposal generator. First identify the seller, buyer, sender, format and sample wrapper. Prefer the customer's promoted kit and its pinned engine. Read `deck_context`, the company/positioning/competition/ICP/brand docs, segment playbooks and accepted lessons. For a prospect sample, keep the prospect's seller research in that prospect's scoped account/project; never seed it as Unfairly's own company context.

Research the website deeply, then go beyond it. Read relevant product, pricing, customer proof, implementation, founder and brand pages. Search the market, buyers and alternatives; open the competitors' own product/pricing pages and credible independent sources. Learn enough to explain:

- What they sell, how they make money, their founder thesis, delivery constraints and what they cannot promise.
- Best-fit and poor-fit ICPs, users, champions, economic buyers, buying committees, triggers, procurement, objections and the cost of doing nothing.
- Market dynamics, direct competitors, substitutes, internal/manual work and the status quo; where each alternative wins and what differentiation the evidence actually supports.
- Customer proof, qualified outcomes, pricing uncertainty, category language and distinctive voice.

Keep findings in the existing Company/Playbooks/Deals layers; a local authoring project can keep a public-only synthesis in `brand/seller-understanding.md`, which the existing source bundle retains. Record source URL, access date, publication date when known, claim/qualifier, confidence, and fact versus hypothesis. Preserve contradictions and questions. Do not manufacture TAM, ROI, superiority or buyer motives. Competitor comparisons must be current and cite the competitor, not merely the seller's claims about it. Private account context stays in the Brain, outside the public authoring bundle.

Before writing, make an internal readiness decision: can you explain the offer, who buys and why, the alternatives, the defensible difference, the proof and the constraints? Answer each from evidence, identify its uncertainty, and name what the proposal will omit. Missing critical positioning or an unresolved contradiction stops unsupported copy. A nonessential gap can remain explicit. A failed search is a gap, never evidence of no competition. Refresh stale research instead of starting over for every proposal.

## Reproduce the brand before adapting it

A logo and token palette are the beginning. Capture the home page and two representative product/campaign pages with `brand:capture`; inspect their original desktop and phone screenshots. Prefer approved brand guidelines when supplied. Record representative compositions in `brand/brand.json`'s existing `style.layout_notes`, `illustration_style`, `photo_treatment`, `voice`, `rules` and source evidence: type scale and wrapping, grid proportions, spacing, section rhythm, imagery, borders, buttons, diagrams and meaningful motion. Name required assets and unresolved font substitutions. Never silently treat a stand-in as an exact match.

Once the kit is curated, refresh the evidence with `npm run brand:capture -- --evidence-only <urls>`. It adds reference screenshots to `brand/references/` (with URL, viewport and date) and never rewrites `brand.json`, logos or imagery.

Privately reproduce a hero, an ordinary content section and one distinctive visual section using the existing site files and engine. Match the actual composition first: preserve proportions, alignment, scale, whitespace, image crop and visual treatment. Compare source and reproduction at the same viewport. This is the Hampton lesson: a section-by-section reconstruction was closer than a redesign wearing the same colors. The rehearsal is internal and never becomes a customer proposal by accident. Do not copy an entire application, tracking scripts or source-site forms.

Only then adapt the visual grammar to the buyer's decision. The toolbox supplies mechanics and common structure; it must not flatten every brand into the same cards. Choose custom composition or a missing component where the source evidence calls for it. For each proposal section record the buying question, evidence, focal visual and useful interaction in `story.md`'s existing Job/Proof/Source fields. Keep sources/assumptions accessible without turning the page into a report.

Visual fidelity does not require repeating bad marketing copy. Keep factual meaning, named products, category terms, genuine voice and attributed quotes. Rewrite interchangeable promises, jargon, repetitive slogans and empty superlatives even when they came from the customer's site. Never replace vague copy with invented results. Use the voice guide and existing copy checks on rendered copy, including inherited website wording. `data-copy-ok` is only for an attributed verbatim quote, with `data-copy-source="https://..."`; it is not a blanket exemption for copied headlines or whole sections.

Run the existing site audit and evaluator with the brand kit and representative references. Brand fidelity, persuasion and technical correctness are separate judgments; passing layout checks proves only layout. Review against the source images, not just the kit you inferred. Inspect once across desktop, phone, alternate interaction states and PDF, repair in a batch and confirm once. A remaining material defect stays incomplete. Preserve accepted brand changes in the existing kit release and durable lessons in their existing scoped home.

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
- `npm run site:build` builds `dist-site/`, a static folder that works on any host. Beside `index.html` it writes `index.txt`, the page as plain text for AI agents, from the same filled sections. Once published, the host serves it at `<link>/index.txt` behind the link's own gates and points agents at it from the page; decorative text that would only add noise (a marquee repeating a heading) can be marked `data-text="skip"`.
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

A site's words get the same review a deck's do (`voice.md`), read off the page with its tokens filled in. `site:check` refuses an em dash (or a spaced en dash or double hyphen used as one), fragments strung together with middle dots, and a line that opens with a bold label and a colon. It warns, for you to read and decide, on generated-sounding words (unlock, seamless, empower, streamline, leverage and the like), "not just X but Y", a "Title: subtitle" headline, a headline over 110 characters, and an eyebrow or label that only says "Overview" or "Next steps". Attributed quoted words in a `<blockquote>`, or in an element marked `data-copy-ok` and `data-copy-source="https://..."` (a verbatim quote that keeps its own dash), are someone else's and aren't checked. The blocking rules came with `sites@1.2`; a site pinned to 1.1 sees them as warnings until it's re-pinned.

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
| One price, and how it's built | `price` | The figure and what it includes; beside it the arithmetic from the reader's own count (a stepper) to the month and year |
| Plans as cards | `tiers` | Two to four plans, the recommended one lit and the only one with a button |
| Proof | `stats` | Three or four big numbers, each with its exact qualifier |
| Testimonials | `quotes` | One large pull quote, then a row of two or three |
| Facets of one idea | `tabs` | Three to five tabs beside the open panel; each panel a headline, ticked points, one closing line; the PDF prints them all |
| Who they'll work with | `team` | Two to four people: face or monogram, name, role, one line on this account |
| The client's world | `photos` | One lead photo and two beside it, captioned, from the client's own site; stock only for a gap, credited |
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

**The standard proposal** (`npm run site:new -- proposal`), with no calculator: a scope of work, a partnership, a service with one price. Hero and glance, what you asked for (`heard`), how it works (`cards`), the client's photos (`photos`), the scope, the price (`price`), the team, quotes, timeline, FAQ, close.

**Keep any one screen from overwhelming the reader.** One point and one focal element per screen: the answer in the calculator, the lit column in the comparison, the pull quote. Three to four of anything (numbers, cards, steps of the close), never seven. Detail goes behind `<details>`. If a section needs more than a screen and a half at 1280 wide, it's two sections, or its detail belongs in a toggle. Write the copy short first (voice guide, "Simplify the copy"), then design; `site:check` warns where a line runs long.

## Commitments, sources and partial totals

From engine 1.8 (pinned `sites@1.8` or unpinned). Older pins get these as warnings.

- **Dates and terms.** Every `data-date` or `data-commitment` element carries `data-basis`:
  - `sourced`: a vendor term. Add `data-source="<fact path>"`, with that fact's published entry in `sources`. The element shows `{{facts.<that path>}}` and types no term beside it, so the page says exactly what the source says.
  - `supplied`: a deal fact the seller gave. Add `data-source` naming a supplied entry: `{ "supplied_by": "<who>", "received": "YYYY-MM-DD", "note"? }`. The element shows that fact's token, so the evidence vouches for exactly what's on the page. A real, approved schedule stays as it is.
  - `proposed`: a scenario assumption. A visible `[data-conditional]` note must sit in the same section file ("Proposed: the dates move with contract signature"). A footer disclaimer can't qualify a promise.
  - Unknowns never become promises. With no real dates, order the steps by dependency, not on a calendar.
- **`sources`** in site.json: `{ "<fact path>": { "url": "https://…", "accessed": "YYYY-MM-DD", "verbatim": true|false, "qualifier"?, "scope"? } }`. An entry for an ancestor path covers the facts under it. A fact quoted in a `<blockquote>` must be `"verbatim": true`. Dated proof (ranks, awards, ratings, reports, surveys) read more than 30 days ago warns: re-verify it on publish day.
- **`fictional`** in site.json lists the fact-path prefixes and model inputs that are the fictional buyer's example data, so they need no source. A fictional fact that carries a date, duration or trial must still be a proposed commitment with its conditional.
- **Qualifiers must stay visible.** A `data-conditional` or `data-excludes` must show on the screen and in the PDF.
  - One element can do both, or one each: a `data-pdf-hide` note for the web plus a `.pdf-only` one for the paper.
  - `hidden`, `sr-only`, `display:none` and a closed `<details>` don't count.
  - The audit also checks it's visible, in its section and near its promise, at every width and on each PDF page.
- **`model.types`**: `{ name: "cash"|"capacity"|"time"|"count"|"rate" }`. A capacity, time or count figure formatted as money is an error, inline `{{= … | money}}` expressions included: that's capacity shown as cash. A count or time multiplied by a `cash` or `rate` figure is money (seats × price), so it passes.
- **`model.excludes`**: `{ name: "what this total leaves out" }`. Where such a figure shows, a visible `data-excludes="name"` line must sit in the same section, naming what it leaves out.
- **Scroll links.** A link that only scrolls never starts with Run, Calculate, Compute, Estimate or "Get results": say where it goes ("See the numbers"). Those verbs belong on a control that computes in place.

## Lead samples

A sample built to show a prospect what their own proposal could look like declares `"sample": { "lead": true, "seller": "<Company>", "buyer": "<a health plan>", "exclude_names": [<other prospects>] }` in site.json. Plan it first: `story.md` in site format with `Mode: lead` (see the story guide). In lead mode:

- **The sample band.** The band says "Example: a proposal <seller> could send <buyer>" and carries one call to action, "Made by Unfairly". The page names Unfairly at most twice on screen (the band and the footer), so drop the toolbox band's wordmark.
- **No pitch on the page.** Outside the band there is no link to Unfairly's sites, and no copy that names us as maker or sender ("A note from Unfairly", "from Unfairly"); our pitch goes in the note. The seller's own calls to action and offer copy ("Email us for a hospitality quote", "Book 30 minutes", "within 48 hours") are fine. There is also no guarantee or savings projection in our own words, and no other prospect's name.
- **Every claim sourced.** Every `{{facts.*}}` the page uses has a `sources` entry or is `fictional`. A plain number typed into the copy (two or more digits, not a year, not in a link or button label) is an error. Every money figure in the model, inputs included, declares its type. The evaluator flags prose claims about the seller that nothing on the page attributes.
- **No typed commitments.** A date, duration or trial typed as text ("a 30-day evaluation", "Nov 20 kickoff") is an error unless it's a marked commitment.
- **Motion is required.** In lead mode a page with no motion is an error, not a warning.
- **A real buyer, a real showpiece, real numbers.**
  - The fictional buyer needs a real-sounding name ("Quillan Ridge Foods"), never "Example manufacturer". Label it fictional once, in the band or the footer.
  - At least one section gives the buyer two controls that move its figures (their numbers and a choice), not one input times a fixed rate.
  - Money prints as whole dollars (`money`) or cents (`money_exact` always prints two digits), never "$158.4".
- **Conviction.** More than four hedges ("illustrative", "not a forecast", "actual results vary") on a page earns a warning: keep one qualifier beside each figure and say the rest plainly. In the plan, a headline that invites ("Explore…", "Discover…") instead of claiming fails.

## What the audit checks beyond the screenshots

From engine 1.8, `site:audit` also:

- **Works every control**, at laptop width, and watches the rest of the page while it does: a control that blanks a date, a CTA or a figure in another section fails too. each input must move an answer in its section. With everything at its lowest or off, the page must still read (no blank, NaN or negative-duration figure). Reset must restore the page exactly. A preset must give the same state on its second click. A "Calculate" must compute something.
- **Lays the page out** at 320, 430, 768 and 2560 as well. On a phone it must not hide a `data-cta`, `data-conditional` or `data-excludes`.
- **Counts AI-template tells**: default fonts, unchosen purple, gradient text, glows, a centered hero with a badge, icon-card grids, eyebrows on most sections, stat tiles, one skeleton for every section. Four or more is an error and two or three a warning. A color or font the brand kit names doesn't count.
- **Checks the brand fonts actually rendered**, and warns when every section has the same background.
- **Checks the link preview and page weight**: title, description, `og:title`/`og:description` (and `og:image` from `site.image`). Over 15 MB is an error.
- **Holds the PDF to the rules above.**
  - Before export it marks each interactive section `data-pdf-interactive`: `kept`, or what the export removes.
  - A section whose controls or results are removed must print a `data-pdf-summary` that carries at least one live figure, stating the result and what it assumes.
- **Checks presets that own a label**, if the site opts in. Mark the label with `data-preset-label`; it must not follow inputs the preset doesn't set ("half the published rate" worked from the reader's own numbers fails).

Only public files publish:
- From `brand/`, that means images and fonts, never `brand.json`, notes, `brand/capture/` or `brand/references/`.
- `site/assets/` takes only images, fonts, mp4, webm, mp3 and pdf.
- A name like research, story, facts, buyers, notes, seller-understanding, references or capture, anywhere in a path, never publishes. Neither does a dotfile, `..`, an absolute path or a backslash.
- `site:manifest` and the upload refuse a `dist-site` holding anything else.

A design review comes from the server, never from the builder: `artifacts/review.json` must be the JSON `deck_review` returned, with its `review_id`. `site:manifest` sends that id and the engine version to `deck_upload_start`, and a site on engine 1.8 is refused unless the server holds that finished review for you with no blocking verdict. A builder's own review file is refused locally too.

A design review covers one exact audit:
- `review-files --site` refuses unless laptop and phone hold the same, complete set of section screenshots, byte-identical to the audit stamp.
- Publishing refuses if any audited screenshot, or any copy sent for review, has changed since.

## Locking a site for production

Before a site goes to its real reader, run `npm run site:variants -- lock`. Each toolbox component the site uses is copied into `site/variants/` as it is in this engine, and the build reads only those copies from then on, so a later toolbox change can't move a page the reader has seen. `npm run site:variants -- status` says which components have changed upstream since; `upgrade <component>` takes one on purpose, keeping the site's own adaptations (its skin, below the marker in that variant's file). Check the sections that use an upgraded component before you publish again.

## The PDF

The PDF reads like a deck: each section on its own 16:9 page, in the site's own design, with toggles as the web shows them (closed). A section taller than a page is scaled down to fit, and the audit warns when that drops below 60%: fold the detail into a toggle, or split the section. Two attributes shape it:

- `data-pdf-open` on a `<details>` opens it in the PDF (a year-by-year table the reader would want on paper).
- `data-pdf-hide` leaves an element out of the PDF (controls that only work on the web, like a slider panel or a booking widget).
- `class="pdf-only"` shows an element only in the PDF (the contacts in place of a booking widget).
- `data-pdf-state="<id>"` on a section prints the state after clicking `#<id>` in it (a preset, tab or choice), so the PDF shows a representative scenario rather than only the default.
- `data-pdf-summary` is a printed sentence stating an interactive section's result and what it assumes. Every PDF page with controls must show a result: this, or a live figure.
- `data-pdf-contact` marks the printed contact or next step for when the web CTA is `data-pdf-hide`. The PDF must keep one way to act: a visible `a[data-cta]`, a `mailto:` or `tel:` link, or a `data-pdf-contact`.
- No page may carry a web-only instruction ("move the slider", "click", "tap", "use the toggle"). Hide it, or say what the printed figure assumes.
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
2. `npm run -s review-files -- --site` (after a clean audit of the current source) records the exact source state the review covers (fingerprint, story, engine, every laptop and phone section) and prepares the laptop and phone sections plus brand evidence for the existing `deck_review_start` / `deck_review` tools. Upload its file list through that protocol and save the returned review JSON as `artifacts/review.json`. Review at most 16 sections per call. Fix blockers in one batch, rerun the audit and confirm once. Sites pinned to `sites@1.7` or newer require a current site-format review covering every section; the upload command refuses a missing, stale or blocked review. If more than 16 sections are necessary, do not omit any from the review: keep the draft unpublished until complete review coverage is available.
3. `npm run -s source:pack`.
4. `npm run -s site:manifest > artifacts/site-start.json`. Pass it to `deck_upload_start` with the workspace, the source size, and a password if the content is confidential. Save the reply as `artifacts/uploads.json`.
5. `node bin/upload.mjs artifacts/uploads.json dist-site`, then `deck_publish`. Named links (`deck_link`) and the password (`deck_password`) work as for decks.
