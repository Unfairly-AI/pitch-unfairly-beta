# The banned list

Patterns a site never ships. Each one is a rule from the craft or sites guide, or a correction the founder made on a real job that we never want to hear twice. The list is machine-readable and enforced: `site:check` reads the source patterns, and `site:audit` and `site:gate` run the page detectors at every width. A violation fails the check. What can't be detected goes to the critic as its rubric.

The house list is the engine's banned-patterns file, `bin/site/banned.json` in the starter (versioned with the sites engine). A client's own additions live in its `brand/brand.json` `rules`.

## The house entries

| Id | Rule | Enforced by |
|---|---|---|
| `eyebrow` | No eyebrows or kickers: no small uppercase label over a heading. | source pattern and page detector |
| `accent-text-on-light` | No accent-coloured text on a light ground. | page detector |
| `accent-underline-link` | No accent-coloured underlines or bars under links and labels. | page detector |
| `outlined-secondary` | One primary action per screen; no outlined, ghost or bracketed secondary buttons. | page detector |
| `hover-lift` | Nothing lifts on hover. | source pattern and page detector |
| `blur-noise-decoration` | No blurred blobs, glows or generated noise as decoration. | source pattern and page detector |
| `image-reveal` | Photos don't wipe, slide, zoom or unmask in. | page detector |
| `on-this-page-bar` | No "On this page" bar or jump-link strip. | source pattern and page detector |
| `visible-placeholder` | No `{{?…}}`, "To confirm" chips, lorem ipsum, TBD or placeholder panels. | source pattern and page detector |
| `crowded-hero` | The hero has the point, one primary action and at most one text link. No chips. | page detector |
| `wall-of-text` | No paragraph over 60 words outside a `<details>`. | page detector |
| `native-select-desktop` | No native select at 768 wide and up. | page detector |
| `double-logo` | One logo in the header. | page detector |
| `draft-banner` | No draft or preview banner on the page. | page detector |
| `clip-art` | No clip-art, cartoon objects or supplied vectors as decoration. | critic |
| `equal-weight-grid` | No equal three-up or four-up of identical cards. | critic |
| `campaign-art-on-web` | Poster, banner and bus-stop compositions stay off web pages. | critic |
| `double-subheadline` | One headline and at most one line under it. | critic |
| `invented-components` | Nothing the brief and spec don't call for. | critic (a warning) |

`bin/site/banned.json` holds each entry's reason and where it came from.

## A client's rules

`brand/brand.json` `rules` takes two kinds of entry. A sentence is guidance for the builder and the critic, as before. An object is a banned entry for this client, enforced the same way as the house ones:

```json
"rules": [
  "Every piece carries both the Frame and the Grain.",
  { "id": "no-gold-text", "rule": "Never set text in CU Gold on a light ground.",
    "source": ["Bob, CU Anschutz, 2026-10-27"],
    "detect": { "dom": "accent-text", "params": { "colors": ["#CFB87C"] } } },
  { "id": "wall-of-text", "detect": { "dom": "wall-of-text", "params": { "words": 45 } } },
  { "id": "native-select-desktop", "off": true, "why": "The client's forms team requires the OS picker." }
]
```

- A new `id` adds an entry. It needs a `rule`; `severity` defaults to `block`.
- An `id` the house list already has overrides that entry's fields for this client, for example a lower word limit.
- `"off": true` drops a house entry for this client. Say why in `why`, and put it on the spec sheet as a house override.

## Adding an entry when the founder corrects something

Do it in the same turn as the correction, before anything else is changed. A memory note or a promise to remember doesn't hold the next build.

1. **Decide where it lives.** A rule for this client only (a brand colour, a house override of their guide) goes in `brand/brand.json` `rules`. A rule for every client goes in the engine's `bin/site/banned.json`, through an engine release (step 5).
2. **Write the entry**: a kebab-case `id`, the `rule` as one plain sentence, `why`, `source` (who said it, on which job, and when, quoting their words), and `severity` (`block` unless it's a judgment call).
3. **Give it a detector if the pattern is visible in code or on the page.** Use the cheapest that catches it:
   - A **source pattern** (`detect.source`: `{ "in": "html" | "css", "pattern": "<regex>" }`) when the bad thing has a recognisable spelling: a class name, a CSS declaration, a phrase. `site:check` runs it.
   - An **existing page detector** with params (`detect.dom` and `detect.params`): `accent-text` with `colors`, `wall-of-text` with `words`, `native-select` with `min_width`.
   - A **generic page detector**: `selector` (any visible element matching `params.selector`, optionally whose text matches `params.text`) or `text` (visible text matching `params.pattern`). These need no code, so a client rule can use them.
   - A **new page detector** when the pattern is about computed layout or style (a colour, a size, a position). Add a function to `DETECTORS` in `bin/site/banned.mjs`, then a case to `test/site-banned.test.mjs` that renders the bad pattern and a clean page and asserts the detector fires on one and not the other.
   - If nothing in the code or the DOM can tell, write a `rubric` line instead: what the critic should look for, in one or two sentences.
4. **Run the check on the current build** (`npm run site:check`, then `npm run site:audit` or `npm run site:gate -- <dir>`) and fix what it finds, by rebuilding the component.
5. **For a house entry**, the change ships as an engine release: bump `ENGINE` in `bin/site/version.mjs` (a minor version for a new rule), add the entry to the table above, and run the starter's tests. A new rule blocks sites pinned to the new engine and warns on older pins.

## What the critic gets

The critic reads every entry without a detector as a rubric line, every enforced entry as a reminder, and the client's sentence rules. `rubric(kit)` in `bin/site/banned.mjs` returns all three. An enforced entry the critic sees broken on the page is still a blocking finding: detectors catch the common shape, not every one.

