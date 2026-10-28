# Email: campaigns, newsletters and one-to-one emails

The email engine builds one email in the brand: send-ready HTML that holds up in Gmail, Outlook and
Apple Mail, its plain-text part, renders of how it looks in the inbox, and a preview page to publish.
It's the right format when someone asks for an email, a newsletter, an email campaign or an
announcement email. It doesn't send to lists: the customer imports the HTML into their email
platform (Mailchimp, HubSpot, Klaviyo and the like), which handles lists, consent and unsubscribes.

An inbox is a hostile renderer. Outlook for Windows lays mail out with Word, Gmail strips styles in
some views and clips anything over 102 KB, and dark mode rewrites colors. So emails are written in
MJML, which the engine compiles to table-based, inlined HTML, and the brand comes in as literal values,
never CSS variables.

## The loop

1. **`npm run email:new`** writes `email/` from the example: `email.json` and three placeholder
   blocks (masthead, story, footer). They carry no look; replace them.
2. **Decide the one thing the email says and the one action.** Write the subject and preheader first:
   they're what the inbox shows.
3. **Write one block per file** in `email/blocks/`, in file-name order, each an `mj-section` or
   `mj-wrapper`, from the brand's own emails when there are any.
4. **`npm run email:build -- --html`** compiles the email and runs the static checks, fast.
5. **`npm run email:build`** does everything: the HTML, the checks, the renders, the preview page in
   `dist-email/`, and the preview page's QA gate. It fails on any problem. Look at
   `artifacts/email/contact-sheet.png` before you hand anything over.

## email.json

```json
{
  "engine": "email@1.0",
  "kind": "campaign",
  "platform": "mailchimp",
  "from_name": "Pitch Unfairly",
  "subject": "Your deck keeps talking after you hit send",
  "preheader": "A short whitepaper on what a link tells you, and protects, once it leaves your hands.",
  "fonts": { "Sora": "https://fonts.googleapis.com/css2?family=Sora:wght@600;800&display=swap" },
  "merge": {},
  "neutrals": [],
  "facts": { "paper": "https://pitchunfairly.com/..." }
}
```

- **`kind`**: `campaign` or `newsletter` (needs an unsubscribe link and the sender's postal
  address), or `one-to-one` (a single person's email, which needs neither).
- **`platform`**: whose merge tags `[[unsubscribe]]`, `[[address]]` and `[[view_online]]` become:
  `mailchimp`, `hubspot` or `klaviyo`. `merge` overrides any of them, or adds one for another
  platform.
- **`fonts`**: a web font's stylesheet, for the mail apps that load one (Apple Mail, iOS Mail). Every
  other app falls back to the stack, so the email must read well in it too.
- **`facts`**: values the blocks read as `{{facts.name}}`, such as the page the button opens.

## Blocks

- `{{color.<role>}}` is a brand color as a hex: any palette role (`accent`, `ink`, `night`,
  `on_night`) or extra (`yellow`). Only the brand's colors and the email's `neutrals` may appear.
- `{{font.display}}`, `{{font.body}}` and `{{font.mono}}` are the brand's families with their
  fallback stacks (the kit's `fallback_stack` when it has one).
- `[[unsubscribe]]`, `[[address]]` and `[[view_online]]` are the platform's merge tags.
- The engine sets the brand's defaults on every text, button and divider, so most blocks only say what
  differs.

**Dark mode.** Give a section on the paper color `css-class="em-paper"` and its text
`css-class="em-ink"`: in dark mode they turn to the brand's night and on-night colors. Mark accent text
`class="em-accent"` so it takes the accent meant for dark grounds. A block that's already dark, like an
ink hero, needs neither. The renders show both, plus a forced inversion like some apps apply.

**Images** must be hosted where they won't move, at an absolute `https` address, with `alt` text and
a `width`. Never point them at a deck link: a link serves only its current version, so republishing it
breaks every email already sent. Use PNG or JPG, never SVG. The email has to read with images off.

## What the checks hold

- the subject is under 60 characters, the preheader between 40 and 110, and the preheader doesn't
  repeat the first line
- the HTML stays under Gmail's 102 KB clip (a warning from 90)
- nothing a mail app drops is load-bearing: flex or grid layout, positioned elements, CSS variables,
  SVG, a font with no fallback, background images, forms, video or scripts
- every link is absolute `https` (or `mailto:`/`tel:`), and none points at a draft preview
- every image is hosted, has `alt` text and a width
- a campaign or newsletter has its unsubscribe link and postal address
- only the brand's colors
- the copy rules every page follows, the banned list, and the words the brand's voice bans
- in the renders: no sideways scroll on a phone, and text keeps its contrast in light and dark mode

Chromium renders the previews. It isn't Outlook: the compatibility check stands in for Outlook's
renderer, and the hand-over should say Outlook was checked by rule, not by eye.

## Publishing

Publish `dist-email/` as type `email`. The link shows the subject and preheader, the email live, the
renders, and the HTML and plain-text part to download. To send it, import `email.html` and `email.txt`
into the email platform named in `platform`, and send a test to yourself from there first.
