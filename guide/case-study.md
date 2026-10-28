# Pitch Unfairly: case studies

A case study is a page about one real customer: who they are, what they were up against, what they did with the seller, and what came of it. Prospects read it as proof. It's its own link type, `case_study`: publish with `type: "case_study"`, never as a proposal or a page. Build it with the sites engine (the `sites` guide holds the project, the commands, the checks and publishing); this guide adds what's different.

## The proof rule

Every result is the customer's own number (a site.json fact with a supplied or published source) or it stays qualitative; never invent precision, and never list the customer as fictional.

In the engine's terms (sites guide, "Commitments, sources and partial totals"):

- Every figure is a `site.json` fact or model input, shown by its token. None is typed into a section.
- Every fact the page uses has a `sources` entry. A number the customer gave you is `"supplied_by": "<who at the customer>", "received": "YYYY-MM-DD"`. A number they published is a `url` with `accessed`. A quote is `"verbatim": true`.
- `fictional` stays empty. A story about an invented customer isn't a case study; build a sample proposal instead.
- With no number, write the result in words. "New hires start on day one instead of week three" is fine when that's what the customer said. Never round, project, average or estimate a figure the customer didn't give, and never add one because a section looks thin.

When the customer can't supply a result, ask the user for it or leave the result qualitative. Say which in one line before you build.

## Start from the skeleton

`steal_examples` with `format: "case-study"` gives the section order: hero (the customer and the outcome), context (their situation, in their words), approach (what happened, in order), results (their numbers or plain words), quote (one, verbatim, with name and role), close (one next step). Fill every section with this customer's facts. Cut a section the customer can't supply; never fill it with invention.

## The brand

The seller's brand, from `brand_kit_get`, as for every sites build. The customer appears by name and logo, with their permission. Never restyle the page in the customer's brand.

## Review and publish

A case study publishes like a page: its client link moves only for a build whose design review the host verified (`deck_review`, then `deck_upload_start` with the bound review). An unreviewed build goes to its private preview with `draft: true`. The review holds the proof rule: it never asks you to add a number, and an unsourced figure is a finding.
