# Webflow: put a site into the customer's Webflow

The Webflow target takes a page the sites engine built and puts it into a customer's own Webflow
site as native Webflow: classes, a variable collection for the brand tokens, images in the asset
library, fonts, focus states and scroll reveals as Webflow interactions. Webflow serves the page on
the customer's domain, inside their analytics, pixels and privacy settings, and their team can edit
it in the Designer like any page they built.

The engine plans and checks. You make each Webflow call with the customer's Webflow MCP connector:
the engine prints the next call, you make it, and you hand the reply back. It never holds a Webflow
token.

## Rules

- Only a Webflow site the customer connected for this job, with their Webflow MCP connector. Never
  another workspace.
- Publish to the site's webflow.io address only. The engine's publish step sets
  `customDomains: []`; never change it. The customer publishes to their domain after they review.
- No custom code and no forms. The page carries no scripts: anything the source did with
  JavaScript, other than the reveals below, doesn't come across.
- Every class carries the run's prefix (`--class-prefix`), so the page never edits a class the
  site already has. Use a new prefix for each page.

## The loop

1. Build the page and get `npm run site:audit` to "All modes clean". The target reads
   `dist-site/index.html`.
2. Find the site: `data_sites_tool` > `list_sites`.
3. **`npm run -s site:webflow -- plan --site <id> --collection "<Brand> tokens" --page-slug <slug>
   --page-title "<title>" --class-prefix <brand>-`** compiles the page and starts a run in
   `artifacts/webflow/`. Pass `--page <id>` instead to fill an existing page. It downloads the
   images and font files, and reports the breakpoint bands (below).
4. **`npm run -s site:webflow -- next`** prints the next call as JSON: `step`, `tool` and `args`.
   Add `session_id`, `agent_id` and `context`, make the call, and save the tool's whole reply to a
   file.
5. **`npm run -s site:webflow -- record <step> <reply-file>`** keeps the ids the reply returned and
   does any upload it set up (images and fonts go to Webflow's storage from your machine). Then
   `next` again, until it prints "Done".
6. **`npm run -s site:webflow -- verify`** opens the published page and checks it, below. It must
   pass before you hand the page over.

`status` shows what's done and what's next. A run that stops can pick up where it left off: `next`
always starts from the ledger. A re-run skips what the site already has (tokens, fonts, images
Webflow already stores).

The steps, in order: the site and page, the page's body, the classes already there, the variable
collection and its tokens, images, fonts, the page's sections (five per call), the inserted links,
steps and reveals, focus states, links that open in a new tab, interactions, publish.

## Reveals

A reveal is an element that fades and rises in as a step scrolls past the middle of the screen.
Mark them in the source:

- `data-wf-step="k"` on the element that starts it, usually a scroll step's section.
- `data-wf-reveal="k"` on each element that appears when step `k` arrives. Optional
  `data-wf-y` (rise in px, default 20) and `data-wf-duration` (seconds, default 0.5).
- `data-wf-reveal="load"` on an element that appears when the page loads.

Each step becomes one Webflow interaction. Scrolling back up plays it in reverse, and a visitor
who asks for reduced motion sees the finished state.

## Breakpoints

Webflow has four fixed breakpoints: 992px and up, 768–991, 480–767 and up to 479. The compiler
moves each of the source's media queries to the nearest Webflow breakpoint, so between the
source's width and Webflow's the page can lay out differently. `plan` prints these bands. To
shrink them, write the source's media queries at Webflow's widths.

## Verify

`verify --widths 1440,1000,767,600,479,390` loads the published page at each width with page
scripts off, and compares every element's computed style and the page's text. It makes two checks:

- **Against the plan** (`artifacts/webflow/preview.html`, what the compiled page should render):
  every width must match. A difference means the push went wrong.
- **Against the source**: reported, and judged only outside the breakpoint bands.

`--block-fonts` blocks font files on both sides, for a source whose fonts are licensed to its own
domain. `--root <selector>` names the source's page root when it isn't `main`. The result is in
`artifacts/webflow/verify.json`.

Hand over the webflow.io link, what verify reported and any warnings `record` printed (a font
Webflow couldn't install, for example). The customer reviews the page in their Designer and
publishes it to their domain.

(End of the webflow guide.)
