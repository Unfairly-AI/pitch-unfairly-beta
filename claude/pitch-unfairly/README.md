# Pitch Unfairly

Pitch Unfairly builds presentation decks as real websites, in your brand, and hands them back as a link and a PDF. Tell Claude what the deck is for, or give it your notes, and it writes the story slide by slide, designs each slide for its one job, checks every slide on a desktop screen, two phone sizes, and a 16:9 PDF page, runs a design review, and publishes the deck to an unlisted link on pitchunfairly.com. Every deck has present mode, speaker notes, keyboard controls, and a phone layout. Change something later and the same link shows the new version.

## Use it

Ask for a deck in plain words, for example "turn my notes into a 10-slide seed pitch deck I can send as a link". The first time, Claude asks you to sign in to Unfairly, which sets up hosting for your decks. A free account works.

- **Claude Code:** install it with

  ```
  /plugin install pitch-unfairly --marketplace Unfairly-AI/pitch-unfairly-beta
  ```

  It builds the deck in a folder on your computer, previews it locally, and checks it with your installed Chrome before publishing.
- **Claude on the web, desktop, and mobile:** builds the deck in Unfairly's deck studio, so nothing installs on your device. Turn on code execution in Claude's settings for the plugin's skill to run. On Team and Enterprise plans, an Owner adds the Pitch Unfairly connector for the organization first.

It doesn't edit PowerPoint or Google Slides files.

## What it runs, sends, and fetches

**On your computer (Claude Code):** the skill's `setup.sh` checks that app.unfairly.ai can be reached, then installs the starter's npm packages from its lockfile (`npm ci`, from the npm registry) into `~/.pitch-unfairly`, or into the deck folder when the home folder isn't writable. It uses the Node.js and Chrome, Chromium, Edge, or Brave already installed and never downloads a program itself; if one is missing, it asks you to install it or builds in the deck studio instead. It never uses `sudo` or changes system settings. The deck's own scripts run a local preview server, the audit, screenshots, and the PDF.

**To Unfairly** (app.unfairly.ai and pitchunfairly.com): the deck's source and built files when you publish, slide screenshots for the design review, your brand kit when you save one, and what you tell Claude about the deck at publish time, so later decks start with your preferences. In the deck studio, the deck is written and built on Unfairly's side.

**From the web:** your company's website, when you ask Claude to capture your brand from it, and, through Unfairly's server, your logos and colors from Brandfetch.

Published decks are unlisted: they aren't indexed, and anyone with the link can view them until you take them offline. Free decks show a small "Made with Unfairly" badge. How Unfairly collects, uses, shares, and keeps data, and how to delete it, is in the privacy policy: https://pitchunfairly.com/privacy. Pitch Unfairly is for people 18 and older.

## Support

Questions and account help: support@unfairly.ai or https://pitchunfairly.com/support. To report a security issue: security@unfairly.ai.

## License

Licensed for use with Unfairly's service, not for redistribution. See [LICENSE](LICENSE). Third-party components keep their own licenses: see `THIRD_PARTY_NOTICES.md`.
