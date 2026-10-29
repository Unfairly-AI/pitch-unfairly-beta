# Long-form: e-books, whitepapers, reports and guidebooks

The long-form engine builds a document of chapters into two things from one source: a web version
people read at the link, and a print-quality PDF with a cover, a contents page with real page
numbers, running headers and page numbers, and bookmarks for every chapter. It's the right format
when someone asks for an e-book, a whitepaper, a report, a guidebook or a playbook to download. A
single web page (a one-pager, a landing page) is a site; a document someone reads in chapters or
prints is long-form.

Long-form is hand-designed, like a site. You write the cover and each chapter as HTML from the
brand's own examples and the reader's question; the engine owns the pages, the contents, the
headers, and the checks.

## The loop

1. **`npm run longform:new`** writes `longform/` from the example: `longform.json`, a cover, two
   placeholder chapters, the back page and an empty `styles.css`. They carry no look; replace them.
2. **Decide the reader and the question** the document answers, and the one thing they do after it.
   Outline chapters from that. Every claim comes from the company's own material or a named source;
   never invent numbers, customers or quotes.
3. **Write one file per chapter** in `longform/chapters/`, in file-name order, and design the
   document in `longform/styles.css`. Photos and drawings go in `longform/assets/`.
4. **`npm run longform:build -- --web`** builds only the web version, fast. Open `dist-longform/`
   and work on the reading layout.
5. **`npm run longform:build`** builds everything: the web version, the PDF, every check, page
   images and the web QA gate. It fails on any problem. Then look at
   `artifacts/longform/contact-sheet.png` (every PDF page) and `artifacts/gate/contact-sheet.png`
   (the web version at every width) before you hand anything over.

## longform.json

```json
{
  "engine": "longform@1.0",
  "title": "After you hit send",
  "short_title": "After you hit send",
  "description": "One sentence on what the reader gets from it.",
  "page": "letter",
  "margins": { "top": 0.9, "bottom": 0.85, "left": 0.85, "right": 0.85 },
  "contents_title": "Contents",
  "download_label": "Download the PDF",
  "neutrals": [],
  "facts": {}
}
```

- **`page`**: `letter` (8.5 × 11 in) or `a4`, portrait. `margins` are in inches.
- **`short_title`**: the document's name in every running header.
- **`neutrals`**: grounds the design uses beyond the brand's palette. Every other color printed must
  be in `brand/brand.json`.
- **`facts`**: values the copy reads as `{{facts.name}}`, the same tokens a site uses. Parts in
  `longform/parts/` are included with `{{> name}}`.

## The parts

- **`cover.html`**: one `<section>`. It's the first screen on the web and the first page of the PDF,
  edge to edge, with no header or page number.
- **`chapters/NN-name.html`**: one `<section data-chapter id="name">` each, with an `<h2>` title.
  The id is the chapter's link and its page name: lowercase letters, digits and dashes. The running
  header is the `h2`'s text; when that's longer than 48 characters, set a short one with
  `data-running="..."`. Leave `data-section` off; the engine adds it, so views count chapters the way
  they count a site's sections.
- **`back.html`**: optional, one `<section>`: who made it and how to reach them.

The engine adds the top bar (the short title and the PDF download, the page's one primary action),
the contents as a rail on wide screens and a disclosure on phones, and the printed contents page.

## How the PDF pages

- **Every chapter starts on a new page.** Headings stay with what follows. Figures, tables, quotes,
  `pre`, images and anything marked `data-keep` don't split across pages. Paragraphs keep at least
  two lines at each end.
- **Running headers.** Each chapter prints on its own named page, with the short title on the left,
  its running title on the right, and the page number at the bottom.
- **The contents is true.** The engine prints the front matter and each chapter on its own, counts
  their pages, writes the numbers into the contents, then prints the whole document and checks the
  total.
- **Only `background-color` prints.** Gradients and background images drop out of the PDF, and the
  text on them usually goes with them. Give every band a solid `background-color` in print and use an
  `<img>` for a photo.
- **The page is paper-colored.** The page itself takes the kit's `paper` color, so margins match.
- **Print-only and web-only.** `class="print-only"` shows only in the PDF; `data-print-hide` leaves
  something out of it. While printing, `<html>` has class `is-print`, and `@media print` rules in
  `styles.css` set the printed type (in pt) and layout on purpose. Design the page; don't shrink the
  web version onto it.

## What the checks hold

Before anything renders:
- every chapter has one `data-chapter` with an id and an `h2`, and no two share an id
- every token and part resolves
- the copy rules every site follows: no em dashes, middle dots, bold-label lines, "X, not Y" foils,
  hedges, or generated-sounding phrases (`data-copy-ok` for quoted words)
- the banned list, with the brand's own rules
- no inline background image or gradient, and no private file in `longform/assets/`

In the printed layout:
- nothing has a background image or gradient
- every printed color is in the brand's palette or `neutrals`, and every line of text is set in one of
  the brand's fonts, loaded
- nothing runs past the page's text block (the cover may bleed)
- photos print at 200 ppi or more (an error under 120)
- the PDF keeps a way to act: a visible `mailto:`, `tel:` or `https` link, or a `data-print-contact`
  line
- no web-only instruction ("click here", "scroll down", "swipe")
- the contents lists every chapter in order, on the page it starts on, and the PDF's page count is
  what the parts add up to
- no PDF page is blank (with poppler's `pdftoppm` installed, which also makes the page images)

On the web version, the sites QA gate at every width from 320 to 1920: no sideways scroll, no
clipped or colliding text, no empty grid cells, one-word-per-line columns, tap targets under 44px,
broken images or script errors. A clean run stamps `artifacts/gate/gate.json` for exactly these
files, and the upload refuses `dist-longform` without it. The build also saves the page at 2560 wide
(`artifacts/longform/web-2560.png`): look at it, because a reading column that suits a laptop can sit
lost on a big screen.

## Publishing

Publish `dist-longform/` as type `longform`: it's a site that carries its own `deck.pdf` and
`index.txt`, so the link's PDF and agent text serve this document behind the link's own gates.
Upload with `node bin/upload.mjs uploads.json dist-longform`.

## Rules

- Write for one reader with one question, and end on the one thing they do next.
- Use the company's own facts and name the source of anyone else's. A whitepaper earns trust by
  being specific; a number you can't source is a sentence you cut.
- Tables for rules and comparisons, prose for the argument. No stat tiles, icon grids or eyebrow
  labels over headings.
- Look at every PDF page and the web version at phone and wide widths before you hand it over.
