---
name: pitch-unfairly
description: Build or redesign a presentation deck as an interactive website in the user's brand, with every slide designed for its job, present mode, speaker notes, PDF export, and checks on desktop, phone, and PDF. Use when someone asks for a pitch deck, board deck, sales deck, talk slides, or any presentation built as a web page or PDF. Use another workflow for editing native PowerPoint or Google Slides files.
---

# Pitch Unfairly

Make a deck that tells one clear story, with every slide designed for its own job, and that holds up on a laptop, a phone, and a 16:9 PDF page. Each slide is its own composition, not content poured into a shared layout.

## Where to build

**Build locally whenever setup says this environment can.** That is the default and the richer loop, so use it even when the deck studio tools are also connected. Build in the deck studio instead when there is no shell at all (plain ChatGPT chat), or when setup reports `NETWORK_BLOCKED` (a sandbox that can't reach Unfairly, as in some chat apps): if the `studio_start` tool is available, build there (the workflow's "Building without a shell" section); do not send the user to another app. If `studio_start` is absent, explain that the Pitch Unfairly connector isn't connected in this chat and tell them to connect it from the plugin's Connectors tab (on Team and Enterprise plans an Owner adds it first); do not claim to have captured, saved, checked, or published anything.

For proposals, follow the sites guide: research first, reuse the kit, rehearse brand fidelity, and check inherited copy.

## 1. Start setup

The first run downloads what the workflow needs, so start it before anything else and talk with the user while it runs. Ask where to keep the deck if they haven't said (default: a new folder named for the deck in the current workspace), then run:

```sh
sh <this skill's folder>/scripts/setup.sh <deck-dir>
```

This skill's folder is the one that holds this SKILL.md (it ends in `skills/pitch-unfairly`), not the plugin's root. Where the agent provides it as a variable, such as `${CLAUDE_SKILL_DIR}`, use that.

It creates the deck from the starter and keeps its tools in `~/.pitch-unfairly`, a folder in the user's home; nothing is installed system-wide and nothing needs `sudo`. It installs the starter's npm packages from its lockfile and uses the Node.js and browser already installed. It never downloads a program on its own: when something is missing, its message says what the user can do, and you pass any option it offers only after the user agrees. Tell the user in a sentence that setup installs the deck's packages, and run it. The first run takes a minute or two; after that a new deck is ready in seconds. If the environment asks for network access, the user approves it; never change sandbox or permission settings yourself.

- **`NETWORK_BLOCKED`** (this environment can't reach Unfairly): nothing was installed. Build in the deck studio, as "Where to build" says.
- **`NEEDS_NODE`** (no Node.js 22.12 or newer): nothing was installed. Tell the user, plainly and briefly, the choices setup's message gives, and act on the one they pick.
- **`NEEDS_CHROME`** (no working Chrome, Chromium, Edge, or Brave): setup still created the deck, so write the story and slides. The audit, shots, and PDF need a browser: give the user the choices setup's message offers; if they'd rather not install anything, run the checks and publish in the deck studio as the workflow's "When the browser is blocked" section says. If setup says Chrome is installed but can't launch here, ask the user how they want to run those commands. Don't try to work around a sandbox.
- **`BROWSER_BLOCKED`** (a sandbox that stops any browser from starting): keep writing and previewing locally, and run the brand capture, checks, and publish in the deck studio instead, as the workflow's "When the browser is blocked" section says. Don't ask the user to change settings, download a browser, open another app, or try any other way around it.

Run every npm command in the deck as `. ~/.pitch-unfairly/env.sh && npm run <script>` (setup prints the exact line).

## 2. Read the workflow

While setup runs, read `references/workflow.md` in this skill's folder in full and follow it from step 1 (its step 0 is the setup already running). It is the complete method, and it names the references to read along the way, which sit beside it in `references/`: `story.md`, `craft.md`, `voice.md`, `brand-kit.md`, `modes.md`, and `templates.md`. Read each one when the workflow says to, before the step that needs it.

The first call to an Unfairly tool asks the user to sign in, which also sets up hosting for the deck.

## Rules that always hold

- Story before slides: write `story.md` (audience, the action after the last slide, angle, template, and one block per slide with its job, headline, proof, and source) and run `npm run story:check` before composing. Headlines state the point as a sentence, never a topic label. One job per slide.
- Use the user's facts. Never invent numbers, quotes, customers, or logos; label example data on the slide.
- A site (a scrolling page with live numbers, published like a deck) is built in the same project under `site/`: read the `sites` guide first. Start it from the starter's site toolbox (`npm run site:new -- data-proposal`, or `proposal`). Its figures come from `site/site.json`, never typed into the page, and `npm run site:audit` must end with "All modes clean" before it publishes.
- Print, out-of-home and merch pieces go under `collateral/`: read the `collateral` guide first, and `npm run collateral:build` must pass before anything is printed.
- Copy reads as written by a person, in its shortest true form: one idea per sentence, plain words, no em dashes, no stacked fragments or clauses, no filler lines (the `voice` guide has the rest).
- No deck ships in the starter's house brand (magenta and cream, Sora and DM Sans). Use the user's saved kit (`brand_kit_get`), capture the brand from its website (`npm run brand:capture -- https://…`), or write an art direction for a brand that has no site.
- The audit is mandatory: the deck isn't done until `npm run audit` ends with "All modes clean", and the design review (`deck_review_start`, `deck_review`) marks every slide ready. `npm run upload` refuses to publish without that review; there is no review bypass.
- **Publish by default.** Once the bar passes, publish (`deck_upload_start`, `npm run upload`, `deck_publish`) unless the user said not to or the deck looks confidential. Hand it over in plain words with both links: the unlisted presentation link to share, and the signed-in `app.unfairly.ai` link opens that exact deck in their workspace.
- Only publish or take down decks the user made. For anyone else's deck, point them to https://pitchunfairly.com/support.

## Without the hosting tools

If the Unfairly tools aren't connected (or return errors), say so in one line and build anyway, following the workflow up to publishing: setup, `story.md` and `npm run story:check`, the brand, every slide, `npm run audit` until it's clean, `npm run shots` and look at every slide, then `npm run build`. Without the hosting tools there is no design review or publishing, so give the user the `dist/` folder: it works on any static host. If the tools connect later, pick up the workflow from where you are.
