# Brand rollout: a client's brand guide to a hosted brand, site and collateral set

A brand rollout takes two inputs, the client's brand guide (a PDF) and their website, and leaves
three things in the client's Unfairly organization:

1. **Their brand**, as a brand kit the Brain holds and the brand book renders.
2. **Their website, rebuilt** on that kit and published as a page.
3. **A collateral set**: print, out-of-home, merch and social. Each piece gets its own link in the
   client's Decks gallery, with a view, its print file to download, review and publish.

This is the runbook. Run the steps in order. A step is done when its gate passes, never before.
The first rollout was CU Anschutz School of Dental Medicine (repo `Unfairly-AI/cu-anschutz-dental-site`).
When this guide is unclear, do what that repo does.

## Before you start

Ask for these. Ask once, in one message:
- **The brand guide PDF.** Use the latest version and note its date.
- **The website URL.**
- **The client's Unfairly organization and its Pitch Unfairly workspace slug.** `deck_list` shows
  the workspaces you can publish into. Never publish a client's work into your own default workspace.
- **The pieces they want.** If they don't say, offer the set the guide itself shows.
- **Original photos.** Ask for their photo library or originals now, not at print time. Web photos
  print at 10 to 40 ppi out of home.

Make one repo per client, `Unfairly-AI/<client>-site`, from the CU repo's layout:
- `brand/`: `brand.json`, lockups, textures and components
- `collateral/`
- the site sources
- `tools/engine/`: the starter's `bin/` collateral and site engines, copied in
- `package.json`, whose `npm run build` runs `brand:check`, `site:build`, `collateral:build` and `gallery`

## 1. Read the whole guide (by hand)

- **Input:** the guide PDF.
- **Output:** `references/guide.txt` (from `pdftotext -layout`), the guide's images (from
  `pdfimages -png`), and `copy.md`.
- **What `copy.md` holds:** every headline, tagline, claim and number the guide prints, each with its
  page. Pieces may only use copy from this file.
- **Gate:** you have read every page, and `copy.md` cites a page for every line.

Rules:
- **Use the guide's own words.** Never invent a claim, a number, a name or a headline. If the guide
  shows an example headline for a piece, use it ("WE create", not your own line).
- **Flag typos and slips to the client. Don't copy them and don't fix them silently.** CU's 1-pager
  says "Doctoral of Dental Surgery". We set "Doctor" and told them.

## 2. Brand kit (by hand, checked)

- **Input:** the guide, plus logo files from the client or the guide.
- **Output:** `brand/brand.json`, a brand-kit@1 file.
- **Start from the CU kit.** It is the reference template in unfairly-app,
  `src/lib/brand/kit-templates/`. It holds every lockup with where it may be used, color tiers, color
  balance by context, type roles, textures and grain, graphic elements and messaging.
- **Brand components:** put the brand's own headline treatments, frames and grain in
  `brand/components/*.css|js`.
- **Gate:** `npm run brand:check` passes. Also look at the brand board next to the guide's pages.

Two things to check by hand:
- Lockups are real files from the guide or the client, never redrawn.
- System fonts (Helvetica Neue) are declared, not shipped. Check that weight 300 renders as Light,
  not Thin.

## 3. Brand assets link, then the Brain

The Brain kit links to the kit's files: lockups and textures. **Host those files on their own link,
never on the site's link.** The CDN (`cdn.pitchunfairly.com/d/<id>/v<N>/`) serves only a link's
current version, so republishing the site turns every old file URL into a 404.

1. **Build `<client>-brand-assets`.** This is a page holding `brand.json`, `lockups/` and `textures/`.
   Publish it as type `page` in the client's workspace.
2. **Put the kit in the org's Brain.** It goes in the "Visual identity" doc as a ```` ```brand-kit ````
   block (brand-kit@1). Its file URLs must point at the brand-assets link's version URL.
3. **Gate:** open the control plane at `?view=brain&vault=brand` as a member of the org. The brand
   book must show:
   - the lockups, color tiers, type roles, graphic elements and messaging
   - every image loaded

Writing the Brain doc is **manual** today. One way is the Unfairly MCP edit tools on the org's
Visual identity doc. The other is a service-role script, run through `infisical run --env=prod`.

## 4. The website

- **Input:** the client's site (pages, copy, photos) plus the kit.
- **Output:** the rebuilt site in `dist/`.
- **How:** rebuild it on the kit with the sites engine, using the `sites` guide. Use the client's own
  pages and copy. Don't add pages they don't have.
- **Publish:** publish it as type `page`. Run the site audit and its design review before publishing.
- **Gate:**
  - the site audit is clean
  - you have looked at every section at desktop and at 390 px wide
  - the live link opens

## 5. Collateral pieces (by hand, checked by the engine)

Read the `collateral` guide. Then:

1. `npm run collateral:new`, then `npm run collateral:formats`. Pick a sourced format for each piece.
   If the printer, media owner or merch vendor has a template, their numbers win.
2. **Write each piece by hand** from the guide's own example of it, in container units
   (`collateral/pieces/*.html`).
   - **Don't auto-lay pieces out.** The social and sites layout engines lost to hand-built pieces on
     CU. They had no real lockups and only one headline treatment. They had no grain, used accent
     colors as slabs, and couldn't make print or merch formats.
   - **Give every piece a `<title>` of the form `Name: headline`**, such as `Poster 1a: Transforming
     smiles`. The photo half of a pair uses `Poster 1b: photo`. The hosted pages check their titles
     and captions against this headline.
3. `npm run collateral:build -- --proofs`. **Look at every proof** in `artifacts/collateral/proof/`
   beside the guide page it copies.
4. `npm run collateral:build`. It writes the print PDFs, the merch PNGs and `REPORT.md`.
   **Gate:**
   - every piece passes
   - the seam check finds no hairline rows in the merch art. The build runs it on every merch PNG
     (`bin/collateral/seams.mjs`), and `collateral:pages` runs it again before hosting
   - every ppi warning is in the hand-over as "needs original"
5. **Mockups** (a tumbler, a tee) are pieces with `"mockup": true`. Name them after their art:
   `tee-art` and `tee-mockup`.

Pitfalls with the pieces:
- **Sliced-stack headlines.** Never clean up hairlines in the output after the build (with a sharp
  pass or by hand). Fix the piece and rebuild. A broad clean-up pass erased thin letter bars on CU.
- **White-ink merch.** Leave the areas that will be garment color empty. The piece page shows the
  art on the garment color by itself.

## 6. Hosted piece pages

Add `pages` to `collateral/collateral.json`. It lists one link per deliverable: a pair of posters
is one link. Each link gets:
- a **slug** with the client's prefix
- the **title** people see
- the **pieces** on it, mockup first
- a one-line **caption** in the guide's words

```json
"pages": {
  "suffix": "CU Anschutz SDM",
  "variants": { "clinical": "Clinical care" },
  "links": [
    { "slug": "cu-sdm-poster-transforming-smiles", "title": "Poster: Transforming smiles",
      "pieces": ["poster-1a", "poster-1b"], "caption": "Transforming smiles. Advancing health. …" },
    { "slug": "cu-sdm-tee", "title": "T-shirt", "pieces": ["tee-mockup", "tee-art"], "caption": "The sliced repeat of transforming …" }
  ]
}
```

Then run `npm run collateral:pages`. It writes `artifacts/collateral/pages/<slug>/` and `pages.json`.

**Derived, never typed:**
- **The type comes from the format:** print stays print, merch is `swag`, a social format is `social`.
- **The eyebrow** is the type plus the variant's label, never the type twice.
- **The spec line** comes from the format registry.
- **Downloads:**
  - a print piece downloads its print PDF
  - merch downloads its transparent PNG
  - a social piece downloads its PNG
  - a mockup has nothing to download
- **The view image is a separate file from the download.** An `<a download>` pointing at the image
  the page shows opens in the frame instead of saving.

**The build refuses a page whose title or caption doesn't name the headline of a piece on it.** That
catches swapped posters and captions describing the wrong post: we shipped both on CU. It also
refuses a piece that sits on no link (list it in `pages.unlinked` to leave it out on purpose).

**Gate:** open every `index.html` at desktop width and at 390 px. Check that each title matches the
image under it.

## 7. Publish within the limit

The host takes **30 new versions per person per rolling hour**. A site, the brand-assets link and
every piece link all count.

1. Run `npm run -s collateral:publish -- plan --used <N>`, where N is the number you published
   elsewhere this hour. It shows:
   - what fits now
   - what waits
   - when the next slot opens
2. For each link in the "Now" batch:
   1. Run `npm run -s collateral:publish -- start <slug> --workspace <client-ws> > artifacts/start.json`
      and pass that file to `deck_upload_start`.
   2. Save the reply as `artifacts/uploads.json`. The reply for a big upload is huge: always work
      from the saved file.
   3. Run `npm run -s collateral:publish -- record <slug> artifacts/uploads.json`. It logs the upload
      against the limit and prints the upload command, `node bin/upload.mjs …`. Run that.
   4. Call `deck_publish`.
3. Run `plan` again. A link whose files changed since its last upload shows again, so a rebuild
   republishes only what moved.

`deck_upload_start` accepts the `print`, `swag` and `social` types even when a client's tool schema
lists fewer.

## 8. Live QA

Run `node bin/collateral-live.mjs <every link url>`. It opens each live link at 1280 and at 390 px
and checks that:
- the images load
- nothing scrolls sideways
- the heading is the link's title
- every download button saves a file of the size you built

**Gate:** every page passes. The client's Decks gallery
(`app.unfairly.ai/?view=decks&org=<org id>`) shows exactly the links you meant, with the right types.
Look at it yourself.

## 9. Clean up and hand over

- **A slug that no longer matches its content can't be renamed.** Publish a new slug, take the old
  one offline (`deck_unpublish`), and archive it (`archived_at`) so the gallery stays clean.
  Archiving is a manual SQL step today.
- **The hand-over covers:**
  - what the printer must confirm: their template, the bleed, the color mode (the engine writes
    RGB; ask whether they need CMYK or PMS)
  - every photo that needs its original
  - every guide typo you flagged
  - every link, grouped by type

## Gotchas, all of them

- Brain kit URLs point at the brand-assets link, never at the site link (3).
- 30 versions an hour per person; plan with `collateral:publish -- plan` (7).
- Save the upload reply to a file and work from the file (7).
- The view and the download are always different files (6).
- White-ink merch goes on the garment color (6, automatic).
- Titles and captions come from the piece source and are checked; never hand-type them per page (6).
- Never repeat the type as the area ("Swag · Swag") (6, automatic).
- Sliced-stack hairlines: fix them in the piece and gate on the seam check; never clean the output (5).
- Web photos are not print photos; ask for originals up front and list every ppi warning (0, 5).
- Flag guide typos; don't copy or silently fix them (1).
- Use the guide's own headlines and copy (1, 5).
- Slugs can't be renamed: publish new, unpublish, archive (9).
- Publish into the client's workspace, never a personal default (0, 7).
