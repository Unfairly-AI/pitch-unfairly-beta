---
name: pitch-unfairly
description: Build or redesign a presentation deck where every slide is hand-composed in Astro, with present mode, speaker notes, PDF export, and audits for desktop, phone, and PDF. Use when someone asks for a pitch deck, board deck, sales deck, talk slides, or any presentation built as a web page or PDF. Use another workflow for editing native PowerPoint or Google Slides files.
---

# Pitch Unfairly

Make a deck that tells one clear story, with every slide designed for its own job, and that holds up on a laptop, a phone, and a 16:9 PDF page.

The difference from a template is the point: each slide is its own composition, not content poured into a shared layout. Templates make every slide look equal, so the slide that matters can't stand out.

## Workflow

### 0. Start setup first

The first run downloads what the workflow needs, so start it before anything else and talk with the user while it runs. Ask where to keep the deck if they haven't said (default: a new folder named for the deck in the current workspace), then run:

```sh
sh <this skill's folder>/scripts/setup.sh <deck-dir>
```

This skill's folder is the one that holds this SKILL.md (it ends in `skills/pitch-unfairly`), not the plugin's root; the same goes for every `references/` and `assets/` path below.

It creates the deck from the starter and installs everything into `~/.pitch-unfairly`, without admin rights: a private Node.js if the installed one is missing or older than 22.12, the starter's packages, and Chrome for the audits and PDF (the installed Google Chrome when it works). The first run takes a few minutes and a few hundred MB; after that a new deck is ready in seconds. Tell the user once, in a sentence, that it's a one-time setup, then move on to the story while it works. All downloads happen in this one command, so in a sandbox ask for network access for it once rather than for each step.

Run every npm command in the deck as `. ~/.pitch-unfairly/env.sh && npm run <script>` (setup prints the exact line), so the right Node.js is on the path. In a sandbox that can't write to the home folder, setup keeps its tools in `./.pitch-unfairly` instead and prints that path; use the line it prints. If setup reports that Chrome can't launch (a sandbox blocking browsers), keep going: write the story and the slides, then ask the user's permission to run the audit, shots, and PDF outside the sandbox. The audit is not optional (see step 5).

**Build locally whenever you can run shell commands.** That is the default and the richer loop, so use it even when the deck studio tools are also connected. Only when there is no shell at all (plain ChatGPT chat): if the `studio_start` tool is available, build in the deck studio instead (see [Building without a shell](#building-without-a-shell)); do not redirect the user to ChatGPT Work or Codex. In a regular ChatGPT chat the user must select Pitch Unfairly from the composer&rsquo;s **Add files and more** menu before sending the request. If `studio_start` is absent, explain that the plugin is not active in this chat and tell them how to select it; do not claim to have captured, saved, checked, or published anything.

### 1. Story before slides

**Start from what the workspace already knows.** If the hosting tools are connected, call `deck_context` with the workspace and a short topic (who the deck is for and what it's about) before writing anything. When the deck is about the user's own company, also pass its website as `company_website`: the first time, Unfairly researches the company from public sources into the organization's vault (company, positioning, ICP, voice) and returns it as `about_company` a minute or two later, so call `deck_context` again before writing claims. Mention once and lightly that you pulled what's public about the company ("I pulled what's public about Acme; tell me if anything's off"), use it as the source of truth, and never pass a client's or another company's site. It returns:

- **Lessons:** preferences and corrections from earlier decks ("one number per slide", "we say GTM engineer, never growth agent"). Follow them without being told again.
- **Recent decks and their stories:** reuse the claims, sources, and structure that already worked, keep numbers consistent with them, and say so when this deck deliberately changes one.
- **Facts from the organization's vaults** that match the topic: positioning, metrics, customer proof. Prefer these to anything invented, and cite the vault document as the source.

Then turn the user's kernel into a story before writing any markup. Read [references/story.md](references/story.md) and follow its steps:

1. **Intake.** Ask only what you can't infer: who is in the room, what they should do after the last slide, the one sentence they should repeat, what's at stake, and what proof exists. Settle whether the deck is presented, sent, or both.
2. **Angle.** Write three one-sentence angles built on different tensions and recommend the one the proof supports best.
3. **Template.** Pick the category from the deck's job and a template from [references/templates.md](references/templates.md), the same library as pitchunfairly.com/templates. Follow the category's rules. If the user arrived from a template page ("using Airbnb's 2009 seed deck structure"), use that template.
4. **Beat sheet.** Write `story.md` in the deck project: the header (kernel, audience, after the last slide, format, template, angle), then one block per slide with its beat, job, headline, proof, and source. The starter's `story.md` shows the format.
5. **Critique.** Run `npm run story:check -- --templates <this skill's folder>/references/templates.json` and fix every error; weigh every warning. Without a shell, apply the same checks by hand. Then read the headlines alone, in order: they should tell the story.
6. **Sign off.** One checkpoint, before composing, covering the story and the brand together (section 3). Put everything being approved in that same message: the angle in a sentence, the template, and every slide numbered with its headline and one-line job, plus the brand board image (or, without one, the art direction). Never ask for approval of something the message doesn't show, and never point to a file path instead; the user can't see your files. Skip it when the request already says what to make and who it's for and asks you to make or publish it ("make a 6-slide seed deck for our investor meeting and publish it", "just build it"): build, publish, and show the story and brand in the hand-over instead (step 7), where changing anything keeps the same link. Keep the checkpoint when the request is thin (a topic with no audience or goal) or the user asks to see the outline first. When it's held, changing a headline is cheap now and expensive later.

The rules that hold throughout:

- The headline states the point as a sentence ("Every slide looks the same"), never a topic label ("The problem").
- One job per slide. Merge slides that share a job; cut a slide that has no proof.
- A deck that will be sent rather than presented can't lean on the speaker. Cut beats that only work out loud.
- Use the user's facts. Never invent numbers, quotes, customers, or logos. When the user wants example data, label it on the slide, close to the claim ("Example figure"). Put sources and caveats in speaker notes.

**Keep what the user teaches you.** When the user corrects something that should hold for future decks (a phrase to avoid, how they like charts, a fact that changed, an audience's taste), call `deck_learn` with it as one sentence. If it supersedes an earlier lesson, pass that lesson's id as `replaces`. Don't record one-off edits to this deck.

### 2. Set up the project

Setup (step 0) created the deck from [assets/starter](assets/starter/). Start `npm run dev` and keep it running. If port 4321 is taken, Astro moves to the next free port: pass the URL it prints to the audit, shots, and motion scripts (`npm run audit -- http://localhost:4322`). They refuse to check a page that isn't this deck.

Replace the example slides in `src/slides/` and the order in `src/pages/index.astro`. Keep the deck shell in `src/layouts/Deck.astro` and the `Slide` component; they provide navigation, present mode, notes, the phone layout, and PDF mode.

To set up an existing deck that has the starter's `package.json`, run setup with its folder; it installs the packages without touching the slides. In any other existing project, port the mechanics (the stage, the three modes, the audits) rather than replacing their app.

### 3. Get the brand right

Every deck is built in one brand: its fonts, colors, logo, imagery, illustration style, and physical feel. The brand lives in `brand/brand.json` and the files beside it; every slide reads it through tokens, so the deck can't drift off brand. Read [references/brand-kit.md](references/brand-kit.md) for the format and review checklist.

**No deck ships in the starter's house brand.** The starter's magenta-and-cream kit with Sora and DM Sans is Pitch Unfairly's own look; a deck wearing it reads as a template, whatever its content (the audit fails it). Every deck gets a real brand before the first slide is composed:

- The user's own company: call `brand_kit_get` first (when the hosting tools are connected) and use the saved or organization kit unless they want another brand for this deck. With no kit, capture it from their website.
- Another real company: capture it from its website: `npm run brand:capture -- https://brand.com`.
- A new or imagined company with no site (a startup idea, "a taco truck"): write an art direction before anything else, in a few sentences: who it's for, three adjectives, and one concrete visual reference (for example "a 1970s Mexican street-food poster: hand-painted signage, sun-faded red and turquoise, chunky condensed type"). Build the kit from it: a palette from that reference, a type pairing from Fontsource that fits it and isn't the starter's, the physical style (radius, borders, shadows, texture), and how imagery or illustration will look. Show the brand board and the art direction in the sign-off message (step 1.6), or in the hand-over when sign-off is skipped.

For a captured brand, review every screenshot in `brand/capture/` and correct the draft. The capture measures; you decide the roles, dark sections, stand-in fonts, physical style, which imagery is on brand, and the logo variants.

Then, for every brand:

- Run `npm run brand:apply` and `npm run brand:board`, and include `artifacts/brand-board.png` as an image in the sign-off message (step 1.6), or the hand-over when sign-off is skipped, not as a path. Fix what they correct before composing.
- If the user asked to keep this brand, save it so their next deck starts from it: call `brand_kit_save` with the kit and its files, PUT each file to its `upload_url`, then call `brand_kit_publish` with the `version_id`. A user has one saved kit; saving replaces it.

Commercial fonts: use only files the user supplies or licenses; otherwise an open stand-in, named on the board. Never copy font files off a website.

### 4. Compose each slide

Each slide is one file in `src/slides/` with its own markup and scoped `<style>`, including its phone overrides. Design it on the fixed 1920×1080 stage in stage pixels, using the tokens for color, type, spacing, borders, and shadows; never a raw color (the audit fails on one). Use the brand's logo through `<BrandMark>` and its imagery from `src/brand/assets`, and compose in the brand's own manner: a photographic brand opens on its photography, an illustrated brand on its art, a monochrome brand on type and space.

For every slide, decide the one focal element first: the number, the chart, the screenshot, the quote. Then build everything else around it, quieter. Read [references/craft.md](references/craft.md) before composing; it covers the slide patterns, type scale, color rhythm, motion, and the physical details that make slides feel made rather than generated. Give each slide one motion showpiece that animates its point, using the kit in `deck.css` and `src/components/motion/`.

Give each slide `id`, `label`, `tone`, and `notes` on `<Slide>`. Ids must be unique and stable; links, audits, and screenshots use them.

### 5. Verify all three modes

Every slide renders three ways, and a fix in one mode does not fix the others:

| Mode | Where | How it renders |
|---|---|---|
| Present | Desktop browser | One slide per screen, scaled to fit; scroll, swipe, or arrow keys move a slide at a time |
| Phone | Below 800px wide | One full-height slide per screen, phone token scale, per-slide overrides |
| PDF | `dist/deck.pdf` (built by `npm run build`) | The stage printed 1:1, one page per slide |

**The audit is mandatory.** The deck is not done, and can't be published, until `npm run audit` ends with "All modes clean". A clean audit stamps the deck; `npm run manifest` refuses to publish a deck that has no stamp or has changed since. If Chrome can't launch where you are, request permission to run the audit outside the sandbox; never hand back a deck you couldn't audit as finished.

Work in few, big rounds: compose every slide before the first check, then fix everything a check reports in one pass. While iterating, add `--quick` to the audit and screenshots (`npm run audit -- <url> --quick`) to skip the PDF, the slow part; a quick audit never stamps, so run the full `npm run audit` before publishing. It checks the stage, two phone sizes, keyboard navigation, and the real PDF's page count. It flags content that overflows or sticks out of a slide (naming the element), text that collides with other text, text below the readable minimum, missing headlines, failed images, and fallback fonts.

A clean audit is necessary, not sufficient. Run `npm run shots` and `npm run motion`, and look at `artifacts/contact-sheet.png`, `artifacts/contact-sheet-mobile.png`, `artifacts/motion-sheet.png`, and the PDF pages in `artifacts/pdf/` yourself. Then get the design review, a design director's verdict on every slide against the craft guide:

1. Call `deck_review_start` with the files from `npm run -s review-files` (the stage screenshots and both contact sheets), save its result as `review-uploads.json`, and run `npm run upload -- review-uploads.json artifacts`.
2. Call `deck_review` with the `review_id` and the deck's slug as `deck` (so each round is judged against the last round's notes), and save the JSON it ends with as `artifacts/review.json`.
3. Fix every slide it marks in one pass, retake the screenshots, and review again. Blocking notes must be fixed; polish notes don't hold the deck, so fix them when they're quick. Slides that didn't change keep their verdict; three to five rounds is typical.

The review catches what the audit can't: an orphaned word, a number broken across lines, a crowded slide, a weak focal point, clip-art, a run of slides that look alike. Fix by tightening copy first and layout second. Read [references/modes.md](references/modes.md) when a mode misbehaves; it lists the known traps.

Before calling the deck done, the full audit is clean, the latest review marks every slide ready, you have looked at every slide in all three modes, and the story still reads in order from the contact sheet alone. `npm run upload` refuses to publish without that review; there is no review bypass, including for updates to an existing deck. Keep the audit lines and round counts for yourself; the final message (step 7) says it in plain words.

### 6. Build and publish

`npm run build` writes a static deck to `dist/`, including `dist/deck.pdf`. Every asset path is relative, so the folder works wherever it is hosted.

**Publish by default.** A deck the person can't open from a link isn't finished: a folder on disk, a `localhost` preview (it stops working when you do), and a PDF are not what they asked for. Once the audit is clean and the review marks every slide ready, publish without asking. The link is unlisted, so publishing doesn't make the deck public. Skip publishing only when the user said not to ("keep it local", "just the PDF"), or when the deck holds material that looks confidential (unreleased financials, a client's private data, anything the user called private): then ask once, in one plain sentence, before publishing.

Publish it with the plugin's `unfairly-decks` tools, which host it at an unlisted link: `pitchunfairly.com/<workspace>/<deck>-<code>`. The random code keeps the link private; anyone who has it can view the deck, and decks are never indexed. The first call asks the user to sign in to Unfairly. A new email gets an account, and someone without a team can set up a workspace for their company in the same step: Unfairly reads their website for positioning and brand, so `deck_context` and `brand_kit_get` know the company from the first deck.

1. Run `npm run -s manifest > manifest.json` and `npm run -s source:pack` (it packs the deck's project and prints its `size`), then call `deck_upload_start` with the deck's title, that file list, the contents of `story.md` as `story`, `brand/brand.json` as `brand_kit`, and `source` with that size. The source keeps the project with this version, so the user, or anyone on their team, can update the deck later from any machine. The story is what later decks learn from; in an organization it is also filed in the org's Decks vault, where teammates and their agents can find it. Decks go into the user's default organization's workspace; if they belong to several (an agency with client workspaces), call `deck_list` and pass the right `workspace`, or ask. To update a deck, pass its `slug` and `workspace` (see "Updating a deck" below); without a slug you get a new link.
2. Save the tool's JSON result to `uploads.json` and run `npm run upload -- uploads.json`. It uploads the built deck and the project.
3. Call `deck_publish` with the `version_id`.

The publish result has two different destinations. Always give the user both: the unlisted `pitchunfairly.com` presentation link is what they share with viewers, and the signed-in `app.unfairly.ai` link opens that exact deck in their workspace so they can manage it, inspect its story and versions, and find it again later. Do not collapse these into one link or describe the app link as public.

Free decks show a small "Made with Unfairly" badge. Only publish decks the user made. If the hosting tools aren't available, say so plainly and give them the `dist/` folder: it works on any static host.

### 7. Hand it over

The person reading your last message may have never heard of Pitch Unfairly. Write it for them, not for a developer: short, warm, and in plain words. In this order:

1. One sentence on what you made ("Your 10-slide Thanksgiving deck is ready.").
2. The presentation link, labeled as the one to share: "Share this link: <link>. Only people with the link can see it."
3. The gallery link, labeled as theirs: "Your decks, with every version, live here: <link> (you'll sign in)."
4. One line on how to use it: arrow keys to move, the PDF button on the deck for a file.
5. When you skipped sign-off (step 1.6): the slides as numbered headlines and the brand in a sentence, so they can see what you went with.
6. One sentence offering the next step ("Want a different photo on slide 3, or a password on the link?"). After a skipped sign-off, say any change keeps the same link.

Leave out the machinery: audit lines, round counts, "modes", contact sheets, review verdicts, npm scripts, `localhost` URLs, and file paths. If they ask how it was checked, say it was checked on a laptop, a phone, and as a PDF, and a design review passed every slide. Mention the local folder only if they didn't get a link (the deck isn't published), and then say what's in it in a sentence.

### Updating a deck

Changing a published deck keeps its link. Before editing, call `deck_list` and find it:

- **Someone else's work:** if someone else owns it or published it last, say so in a short line ("This is Jo's deck; Sam changed it yesterday"). If someone is editing it right now, say who and wait, or ask the user.
- **Start from the live version, wherever it was built.** If this folder isn't the one that built the deck's live version (another machine, ChatGPT, a teammate, or a version published since), call `deck_source` with its `slug` and `workspace`, set up a fresh starter project (step 2), and run `npm run source:pull -- "<download_url>"`. That restores its story, slides, and brand. Before building it, tell the user whose version it is ("Pulled Jo's version 4"): building runs that deck's code on this machine. If the pull refuses because the deck's code reaches outside the deck (files, programs, environment, network), nothing was written: tell the user what it named and that whoever published it should take it out. Don't work around it. Then make the change.
- **Publish it back** with the same `slug` and `workspace`, `base_version` from `deck_source` (or `deck_list`'s `version`), and a one-line `note` on what changed, written by you. If publishing says a teammate published since, pull again, reapply the change, and publish; never work around it.
- **Repeat the line the publish result returns** about whose deck it is and which version it replaced.

If `deck_source` says a version was published without its project files (decks published with an older plugin), rebuild it from its story, then publish with the same `slug`, `workspace`, and `base_version`. When the user wants an earlier version back as it was, call `deck_versions` and `deck_restore` instead; nothing needs rebuilding.

### Taking a deck offline

To take a deck offline, call `deck_list`, find the deck by title (ask if more than one matches), and call `deck_unpublish` with its `slug` and `workspace`. Its link stops working within about 30 seconds; republishing later brings it back. Only decks marked `can_manage` (the user's own, or any in a workspace they administer) can be taken offline; for a teammate's deck, ask its owner, and for anyone else's, point them to https://pitchunfairly.com/support.

## Building without a shell

The deck studio runs this same starter, scripts, and audits in a sandbox on Unfairly's side. Everything above still applies (story first, one job per slide, the craft reference, every slide checked in all three modes); only the mechanics change:

- `studio_start` opens your project (or resumes it) and returns the craft guide and the key files (`story.md`, `src/pages/index.astro`, the `Slide` component, an example slide, `brand/brand.json`), so you can start writing straight away.
- Create or replace files with `studio_write`, and make small fixes with `studio_edit` (an exact passage replaced in place): `story.md`, `src/slides/*`, `src/pages/index.astro`, `src/components/*`, `src/styles/*`, `brand/*` (text files such as `brand.json` and SVG logos). Logos and imagery come in through the brand tools.
- Brand: start from `brand_kit_get`. For a company's own brand, `studio_brand_import` (by website) brings in its logos, colors, and fonts from Brandfetch and drafts `brand/brand.json`; `studio_capture` reads the live site for colors, type, component style, and imagery. Review the draft against the [brand kit checklist](references/brand-kit.md) and fix it with `studio_write` before composing.
- Work in few, big rounds. Draft the whole deck (story, brand, every slide) before the first `studio_check`, then fix every slide it flags in one pass before checking again. A good deck takes three to five rounds, not twenty.
- Sign-off (step 1.6) works the same in chat: when it's held, the numbered headlines with their jobs and the brand (palette, fonts, logo, look in a sentence) go in the message that asks for approval.
- `studio_check` is your eyes: it audits desktop and phone, takes the screenshots, and has a design director review every changed slide against the craft guide, with a ready or fix verdict and a concrete fix for each. Send the user the live preview link after the first check, so they watch the deck come together.
- `studio_publish` publishes the last build to the unlisted link; there's no manifest or upload step.
- Publish by default once the bar passes, as in step 6; there's nothing to ask unless the user said not to or the deck looks confidential.
- After `studio_publish`, hand it over as in step 7: the unlisted presentation link to share, the signed-in gallery link for the exact deck, in plain words with no checker output.

## Where this runs

The local workflow needs a shell on macOS, Linux, or WSL, as in Codex or ChatGPT Work; without one, the deck studio builds it on Unfairly's side. Setup supplies Node.js and Chrome when the machine lacks them. If Chrome can't launch in a sandbox, run the audit, shots, and PDF outside it with the user's permission. If they can't run anywhere, say plainly that the deck is unaudited and not ready to publish.
