---
name: pitch-unfairly
description: Build or redesign a presentation deck where every slide is hand-composed in Astro, with present mode, speaker notes, PDF export, and audits for desktop, phone, and PDF. Use when someone asks for a pitch deck, board deck, sales deck, talk slides, or any presentation built as a web page or PDF. Use another workflow for editing native PowerPoint or Google Slides files.
---

# Pitch Unfairly

Make a deck that tells one clear story, with every slide designed for its own job, and that holds up on a laptop, a phone, and a 16:9 PDF page. Each slide is its own composition, not content poured into a shared layout.

## Where to build

**Build locally whenever you can run shell commands.** That is the default and the richer loop, so use it even when the deck studio tools are also connected. Only when there is no shell at all (plain ChatGPT chat): if the `studio_start` tool is available, build in the deck studio instead (the workflow's "Building without a shell" section); do not redirect the user to ChatGPT Work or Codex. In a regular ChatGPT chat the user must select Pitch Unfairly from the composer&rsquo;s **Add files and more** menu before sending the request. If `studio_start` is absent, explain that the plugin is not active in this chat and tell them how to select it; do not claim to have captured, saved, checked, or published anything.

## 1. Start setup

The first run downloads what the workflow needs, so start it before anything else and talk with the user while it runs. Ask where to keep the deck if they haven't said (default: a new folder named for the deck in the current workspace), then run:

```sh
sh <this skill's folder>/scripts/setup.sh <deck-dir>
```

This skill's folder is the one that holds this SKILL.md (it ends in `skills/pitch-unfairly`), not the plugin's root.

It creates the deck from the starter and installs everything into `~/.pitch-unfairly`, without admin rights: a private Node.js if the installed one is missing or older than 22.12, the starter's packages, and Chrome for the audits and PDF. The first run takes a few minutes; after that a new deck is ready in seconds. Tell the user once, in a sentence, that it's a one-time setup. All downloads happen in this one command, so in a sandbox ask for network access for it once.

Run every npm command in the deck as `. ~/.pitch-unfairly/env.sh && npm run <script>` (setup prints the exact line). If setup reports that Chrome can't launch (a sandbox blocking browsers), keep going, then ask the user's permission to run the audit, shots, and PDF outside the sandbox.

## 2. Get the workflow

While setup runs, call the `deck_guide` tool with topic `workflow`, read it in full, and follow it from step 1 (its step 0 is the setup already running). It is the complete method (story, brand, composing, the three-mode checks, the design review, publishing, the hand-over, updating and taking decks offline) and it names the references to read along the way, which come from the same tool: `story`, `craft`, `voice`, `brand-kit`, `modes`, and `templates`. Read each one when the workflow says to, before the step that needs it; they are kept current on Unfairly's side, so always read them from the tool rather than from memory. Ask for one topic per call, never several in one script or batch: a long combined result gets cut off in the middle. Every result ends with "(End of the … guide.)"; if that line is missing, the result was cut short, so ask for that topic again on its own.

The first call to an Unfairly tool asks the user to sign in, which also sets up hosting for the deck.

## Rules that always hold

- Story before slides: write `story.md` (audience, the action after the last slide, angle, template, and one block per slide with its job, headline, proof, and source) and run `npm run story:check` before composing. Headlines state the point as a sentence, never a topic label. One job per slide.
- Use the user's facts. Never invent numbers, quotes, customers, or logos; label example data on the slide.
- Copy reads as written by a person: no em dashes, no stacked fragments, no filler lines (the `voice` guide has the rest).
- No deck ships in the starter's house brand (magenta and cream, Sora and DM Sans). Use the user's saved kit (`brand_kit_get`), capture the brand from its website (`npm run brand:capture -- https://…`), or write an art direction for a brand that has no site.
- The audit is mandatory: the deck isn't done until `npm run audit` ends with "All modes clean", and the design review (`deck_review_start`, `deck_review`) marks every slide ready. `npm run upload` refuses to publish without that review; there is no review bypass.
- **Publish by default.** Once the bar passes, publish (`deck_upload_start`, `npm run upload`, `deck_publish`) unless the user said not to or the deck looks confidential. Hand it over in plain words with both links: the unlisted presentation link to share, and the signed-in `app.unfairly.ai` link opens that exact deck in their workspace.
- Only publish or take down decks the user made. For anyone else's deck, point them to https://pitchunfairly.com/support.

## If the guide can't be reached

If `deck_guide` isn't available (the hosting tools aren't connected, or it returns an error), say so in one line and build anyway from the rules above, in this order: setup, `story.md` and `npm run story:check`, the brand (`npm run brand:apply`, `npm run brand:board`), every slide in `src/slides/` composed on the 1920×1080 stage with the brand's tokens and one focal point each, `npm run audit` until it's clean, `npm run shots` and look at every slide, then `npm run build`. Without the hosting tools, give the user the `dist/` folder: it works on any static host. Try `deck_guide` again before publishing; once it answers, follow the workflow from where you are.
