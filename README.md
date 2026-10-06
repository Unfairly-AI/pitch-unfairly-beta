# Pitch Unfairly (beta)

Pitch Unfairly builds presentation decks as real websites, on brand, with present mode, a phone layout and a PDF, then publishes them to an unlisted link on pitchunfairly.com.

This is the beta distribution of the plugin, for invited testers. It's proprietary software: see [LICENSE](LICENSE). Setup instructions for testers are at https://pitchunfairly.com/beta/.

## Install

**ChatGPT (desktop app):**

1. Add the plugin source (needs the Codex CLI: `npm i -g @openai/codex`):
   ```bash
   codex plugin marketplace add Unfairly-AI/pitch-unfairly-beta
   ```
2. Restart the ChatGPT desktop app, open Plugins, and install Pitch Unfairly.
3. In any chat, pick Pitch Unfairly with @ or the + menu and ask for a deck.

**Codex:**

```bash
codex plugin marketplace add Unfairly-AI/pitch-unfairly-beta
codex plugin add pitch-unfairly@pitch-unfairly
```

**ChatGPT Business or Enterprise (whole workspace, no terminal):** an admin goes to Admin Console, Plugins, Add, Import marketplace, and enters `https://github.com/Unfairly-AI/pitch-unfairly-beta`.

Questions: support@unfairly.ai
