# Pitch Unfairly: landing pages

A landing page is the page a paid ad, a campaign email or a campaign link sends people to. It has one job: turn the click into one action, usually a booked call, a demo or a sign-up. It's a `page` link (`type: "page"`), built with the sites engine; the `sites` guide holds the project, the commands, the checks and publishing. This guide adds what an ad page needs on top: the brief, the section order, message match, the ask, proof, measurement and how to learn from low traffic.

The evidence behind each rule is in the research report "Ad landing page playbook" (Unfairly, November 2026). The short version: match the ad, prove fit, book on the spot. The large measured effects are at the seams between steps (ad to page, form to calendar, click to CRM), not in copy polish.

## Write the brief before any section

No page starts without a brief. Ask the user for what's missing; never fill a field with invention. One brief per ad group or audience, because each one carries different ad copy to continue.

| Field | What to write |
|---|---|
| Traffic | Platform, campaign, ad group, keyword theme or audience, and the exact ad headlines, descriptions and CTA this page continues |
| Audience | Title, company size and stage, team shape, the trigger that made them search |
| Awareness | Unaware, problem aware, solution aware, product aware or most aware, and why you think so. Search traffic is usually solution or product aware; a social feed click is usually problem aware |
| Job and alternatives | What they're trying to get done, and what they'd do instead: hire, freelancers, a big agency, a tool, nothing |
| Core promise | One sentence in the buyer's words. The H1 carries it |
| Claims with proof | Each differentiator beside the sourced proof behind it. A claim with no proof is cut |
| Offer | What the action is: for a call, its length, who is on it (name and title), what the buyer leaves with, what happens next |
| Price position | A floor or range and what scopes it, or the reason it isn't published |
| Top five objections | Each with its answer and the section that answers it |
| Proof inventory | Logos with permission, client results with sources, named quotes with titles, review profiles, the call-taker's credentials |
| Customer phrases | 5 to 10 verbatim phrases from calls, reviews or surveys, reused in the copy |
| Qualification | Visible fields, enriched fields, the path for a visitor who doesn't qualify, the calendar pool and slot policy |
| One CTA | The exact button text and where it repeats |
| Measurement | The conversion ladder, the action bidding optimizes for, click id and UTM capture |
| Learning plan | What gets message-tested before launch, the ad angles under test, the one bold page change and its decision rule |

Awareness sets the length and the opening. Most-aware visitors need the offer and the ask. Problem-aware visitors need their situation reflected first. Extra length on a call page belongs to proof and objections, not to explaining the category.

## Section order for a page that books calls

No order is proven by a controlled test; this one follows the evidence that exists. Cut a section the brief can't fill. Never pad one.

1. **Header.** The logo, linked to the company's home page, and nothing else: no site navigation, no other outbound links. Company, privacy and terms go in the footer. Removing navigation breaks no Google policy; Google only penalizes pages that are hard to navigate.
2. **Hero.** The H1 restates the ad's promise in the searcher's words. One line under it says what the service is and who it's for. One CTA. A credibility line close by (logos, or one sourced client result). For a call, the face and title of the person they'll meet. The hero must carry the match and the ask: the top screen still gets well over half of viewing time.
3. **Status quo.** Their current options in their words, and what each costs them.
4. **How it works, including the call.** Three or four steps: the call (length, who, what they leave with), the plan and price, the start.
5. **Proof, then the CTA again.** One quantified result from a named client in the buyer's role, two or three named quotes, a review badge if there is one. Proof goes before or beside the ask, never only after it.
6. **Why this over each alternative.** A short comparison against the alternatives from the brief.
7. **Fit.** Who it's built for and who it isn't. This qualifies in copy, before the form does.
8. **Price.** "Engagements start at $X a month" and what scopes it. Buyers rank pricing as the thing they most want from vendor sites; a floor also screens out leads below it.
9. **Objections.** The deal-breakers (commitment, timeline, team size, what the call is and isn't), after the main proof and before the final CTA.
10. **Final CTA with booking.** See "The ask" below.

## Message match

The page continues the click. Keyword, ad and page carry the same promise, the same offer and the same CTA.

- The H1 or the line under it restates the ad's core promise and the keyword theme's main noun phrase. Paraphrase is fine; Google says the exact search phrase needn't appear on the page. Never keyword-stuff the H1.
- The offer, price and CTA in the ad match the page exactly. A changed offer breaks the match faster than reworded copy.
- Proof named in the ad reappears on the page, with the same number. An ad that says "4M+ teams" landing on a page that says "3M+" teaches the visitor to distrust both.
- One page can serve several ads when each ad's angle swaps the hero (an angle id in `utm_content` read before first paint). Everything below the hero stays shared.
- Landing page experience feeds Google's Ad Rank in every auction, so a mismatch costs CPC and eligibility, not just conversions. (Quality Score itself is a diagnostic, not an auction input.)

In Unfairly's 223 traced campaign walks, only 61% of landing H1s repeated the ad. Google ads matched worst (47%), and so did dedicated campaign pages (45%). A dedicated URL doesn't guarantee a matched page; check every ad against its page before launch.

## The ask

One action per page. Every button on the page does the same thing (`data-cta`, filled, one id across the page), and the first one sits on the first screen (`site:check` enforces it).

- **Button words:** "Book a call", "Chat with us", "Book a 20-minute call". Prefer "Book" over "Request".
- **Book on the spot.** When a calendar appears right after a short form, scheduling vendors report 62 to 67% of qualified form fills book, against about 30% when someone emails back (vendor data). Never route the visitor into an email loop.
- **Fields earn their place.** Each one either routes or qualifies: work email, name, company, role, and one or two routing questions (team size, volume, budget band). Enrich the rest. Booking rates barely move between 2 and 13 fields when every field routes, but every extra field still costs form completion.
- **Pool the calendar.** Show the named senior person, and book against everyone who can take the call, or guarantee that person same-day and next-day slots. Vendor data: 76% booked with pooled availability against 18% with one person's calendar. Same-day meetings have the fewest no-shows.
- **A visitor who doesn't qualify** gets something useful (examples, a guide, a smaller offer), never a dead end.
- **Link out or embed.** A link to a scheduler page is simplest. An embedded scheduler keeps the visitor on the page, but on a phone it is often the heaviest element; measure it.

## Proof

- Every number is the client's own, from a source (a `site.json` fact with `sources`). Never round, project or invent a result; a section with no proof is cut, not filled.
- Lead with checkable proof: named clients, named people with titles, review platforms. Marketing leaders rate third-party reviews far above vendor claims.
- Placement: logos or one result in or under the hero, the strongest case beside the first CTA repeat, the call-taker's face beside the booking step.
- Show proof; never claim trust ("trusted by", "you can trust us") without the evidence next to it.
- A sample or rebuilt piece is captioned as one. Never present it as client work.

## Copy

Hold every line to the `voice` guide and the `banned` list. For ad pages specifically:

- Plain words. Short sentences. In Unbounce's 2024 data, professional-services pages written at a 5th to 7th grade reading level converted at a 12.9% median against 6.6% for 8th to 9th grade (correlational, vendor data).
- About 500 to 900 words for search traffic. Social traffic gets a problem-led opening or a lighter first step than a call.
- Name the alternative you're replacing in the buyer's terms; don't explain the category.
- No small print, no explanatory captions, no disclaimers under buttons.

## The technical floor

A page that fails these doesn't underperform; it gets the ads disapproved or loses the click.

- **Google's crawler reaches it.** AdsBot-Google must load the page with no bot challenge, firewall block, login or CAPTCHA. It ignores `User-agent: *` in robots.txt and obeys only rules that name it. A plain `noindex` (to keep a paid-only page out of search) doesn't affect ads; a rule naming AdsBot does.
- **The final URL stays on the ad's display domain**, and any redirect keeps the query string.
- **It accepts any query parameters** (gclid, gbraid, wbraid, li_fat_id, utm_*) without breaking or stripping them.
- **Speed:** Core Web Vitals at the 75th percentile on phones: LCP 2.5 s or less, INP 200 ms or less, CLS 0.1 or less. Most paid clicks are on phones, and phones convert worse, so the phone layout is the one to perfect.
- **Accessibility:** text contrast at least 4.5:1, a label on every input, tap targets at least 24 px. Pale text over a gradient and placeholder-only labels are conversion bugs too.

## Measurement

Count the booked call, never only the click. Set this up before the ads run.

- **The ladder:** CTA click (reported, never bid on), scheduler opened, call booked, call held, opportunity. Bidding optimizes for "call booked" until "call held" has the volume to take over.
- **Google Ads:** auto-tagging on. Put UTMs in the campaign's final URL suffix rather than typing them into each final URL. GA4 credits the gclid over UTMs when both are present.
- **Carry the source through the booking.** Pass the page's UTMs into the scheduler link or embed so the booking records which ad and angle it came from. Store gclid and UTMs on the lead record when there's a form.
- **Count the booking on your own page.** A scheduler redirect to a thank-you page (`/booked/`, noindex, fires the booked conversion once per visit) or the scheduler's JavaScript embed event (`calendly.event_scheduled` only fires from Calendly's widget embed, not a plain iframe). If visitors leave for the scheduler's domain and come back, list that domain as an unwanted referral in GA4 so the booking keeps the ad as its source.
- **Enhanced conversions for leads** need the email captured on your own page at submit, not inside a third-party widget. Offline imports of held meetings go through Google's Data Manager API (since June 2026).
- **LinkedIn:** the Insight Tag plus the Conversions API with a shared event id. A LinkedIn landing page has to justify its friction against LinkedIn's own Lead Gen Form; compare them on cost per held call, not cost per lead.
- **Privacy:** honor Global Privacy Control, keep consent defaults for regions that need them, and never send a typed email, name or site to an ad platform except as a hashed enhanced-conversion field.

## Learning at low traffic

A page with a few hundred clicks a week can't A/B test booked calls: at 200 clicks a week and a 5% booking rate, detecting a 50% lift takes about 12 weeks, and a 20% lift over a year. Learn this way instead:

1. **Message-test before launch.** Show the hero and value proposition to people in the target role (a panel, customer calls, a five-second test). Don't review messaging only internally.
2. **Test angles in the ads.** Ads get 10 to 100 times more impressions than clicks. One angle per ad, headline 1 pinned, ad rotation set to rotate evenly, and the winner moves into the page.
3. **Make bold page changes in sequence.** A new offer, a new hero concept, calendar against form. Freeze ad settings, compare whole weeks, write the expected result down before you start.
4. **A/B test only frequent actions** (CTA click, scheduler opened) and confirm direction on bookings.
5. **Never stop a test the first time it looks significant.** Repeated peeking inflates false wins several times over.

## Before publishing

- [ ] The brief is complete, and every claim on the page traces to it.
- [ ] Every ad's headline and offer reappear in its page's hero (open each ad's final URL with its `utm_content`).
- [ ] One action; the first CTA on the first screen; no site navigation; the logo goes to the home page.
- [ ] Every number is sourced; no invented clients, results or turnaround times; samples are captioned as samples.
- [ ] The price position from the brief is on the page or deliberately absent.
- [ ] The phone layout passes at 320, 390 and 430; Core Web Vitals pass on a phone.
- [ ] AdsBot can load the page; the final URL keeps its query string.
- [ ] A test booking (or the redirect page) fires the booked conversion exactly once, and the scheduler record carries the ad's UTMs.
- [ ] The design review passes (`deck_review`), then publish as a `page`.
