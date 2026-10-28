# Pitch Unfairly: deal rooms

A deal room is one link the seller sends a buyer for one deal. It holds that deal's own links (the deck, the proposal, the agreement, case studies, file pages) and the buyer opens all of them from it. It's its own link type, `deal_room`: a page built with the sites engine, published with `type: "deal_room"`.

## What it's made of

- **The room page**: a sites-engine page in the seller's brand (`brand_kit_get`). One short hero (who it's for and the deal, in a sentence), one card per link in the room, and one next step. Each card says what the link is and what the buyer does with it ("Read the proposal", "Sign the agreement"), and links to that link's own URL.
- **What it holds**: the `deal_room` tool. Pass `add`, `remove` or `order` with slugs from the room's workspace. A room holds up to 12 links, never another room, and only its own workspace's links.
- **Who can open it**: the room's people list (`deck_people` on the room). Anyone on it opens every link in the room on that link's own link, with one email code for the lot. Being on one link's list never opens the room. A link with a password still asks for it.
- **Who opened what**: `deal_room` with no changes reports views per link and, per person, which links they opened, how often and for how long. The team, automated browsers and review-link opens aren't counted, as in `deck_stats`.

## Building one

1. Publish the deal's links first, each as its own type.
2. Build the room page: `deal_room` gives each link's title, type and URL for the cards. Put the URLs in `site.json` facts and show them by token, so a rebuild picks up a change.
3. Publish it with `type: "deal_room"`, then `deal_room` with `add` to fill it, in the order the buyer should read.
4. Turn on email verification for the room and add the buyer's people with `deck_people`. Send the room's link, never each link.
5. When the links change, update them with `deal_room` and rebuild the page from its list.

Never restate the proposal's argument, prices or terms on the room page. They live in the linked pages.
