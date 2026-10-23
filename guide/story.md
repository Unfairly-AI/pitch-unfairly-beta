# From a kernel to a story

Most people arrive with a kernel: a sentence, a pile of notes, a number they're proud of. A deck that works has a story: one tension, a turn, proof at every step, and an ask the audience can say yes to. This is how to get from one to the other before a single slide is designed.

## 1. Pull the story out (intake)

Ask only what you can't infer from the conversation, the workspace (`deck_context`), or the documents they gave you. Five questions, in plain words:

1. **Who is in the room?** Not "investors": which ones, how much they already know, what they're skeptical of.
2. **What should they do after the last slide?** A verb and a date: take the meeting, approve $531K, sign by Friday, adopt the dog.
3. **What is the one sentence you want them to repeat?** If they can't say it yet, that's the work.
4. **What has changed, or what's at stake?** The tension: a shift in the world, a broken number, a deadline, a risk.
5. **What proof do you actually have?** Numbers, customers, quotes, screenshots, a demo. List it; the story can only claim what the proof supports.

Also settle the format: presented, sent, or both. A sent deck can't lean on a speaker.

## 2. Find the angle

The same kernel can be told several ways. Write three angles, each one sentence, each built on a different tension, and recommend one:

- **The shift:** something changed in the world, and there will be winners and losers (streaming ate the video store).
- **The proof of behavior:** people already do this the hard way (Airbnb's couches and Craigslist listings).
- **The broken number:** one figure that can't stand (Jurassic Park's opening weekend, every KPI red).
- **The honest grade:** what didn't work and what fixed it (Apollo 13's five whys, Mean Girls' fetch post-mortem).
- **The audacious ask:** a clear, almost unreasonable goal with a plan (the moonshot, the Tesla master plan).

The angle decides which beats get the most room and which get cut. Pick the one the proof supports best, not the one that sounds best.

## 3. Pick a template

[templates.md](templates.md) is the library: categories by the job a deck does (pitch, sales, board, everyday work, launch, proposal, team, review, strategy, fun), each with its rules and common failures, and proven structures named for the famous decks they come from, each with a live example on pitchunfairly.com/templates.

- Choose the **category** from the job (step 1, question 2). Read its rules; they are evidence, not taste.
- Choose the **template** within it whose shape fits the angle. If the user came from a template page ("using Airbnb's 2009 seed deck structure"), use that one.
- The template's beats are the skeleton, not a cage. Merge, cut, or reorder beats when the angle calls for it, and say why in one line.

## 4. Write the beat sheet

Write `story.md`: the header (kernel, audience, after the last slide, format, template, angle), then one block per slide with its beat, job, headline, proof, and source. The starter's `story.md` shows the format.

- Each headline is a claim the audience could repeat, with the key phrase marked for emphasis. Never a topic label.
- Each headline is one whole sentence, written the way [voice.md](voice.md) says: no em dashes, no stacked fragments ("Your turn. Pitch unfairly."), no "Title: subtitle".
- One job per slide. Two slides with one job become one. A slide with no proof is a speaker line.
- Order for the audience, not for you: the strongest proof as early as the category allows.
- Never invent numbers, quotes, customers, or logos. Example data is labeled on the slide.

## 5. Critique it

Run `npm run story:check -- --templates <url>`, with the template library URL from `deck_guide`'s `templates` result. It fails on missing header fields, topic-label headlines, and slides without proof; it warns on unsourced numbers, duplicate jobs, template beats with no slide, and length past the category's norm. Then read it as the audience would, in order, headlines only:

- Do the headlines alone tell the story? If not, rewrite headlines, not slides.
- Is the tension on slide 1 or 2? Is the ask unmistakable and answerable?
- Does every claim have its proof on the same slide?
- Is anything there for you rather than for them? Cut it.

## 6. Sign off

Show the user the angle, the template, and every headline, numbered, with its one-line job, in the same message that asks for approval (not the whole file, and never just a path to it), and settle them before composing. Ask for the story and the brand in one checkpoint. Changing a headline now costs a sentence; later it costs a slide.

## A proposal site's story plan

A proposal site's `story.md` says `Format: site`. It is checked before any component is chosen, and the kit or toolbox never decides the section order:
`npm run story:check -- [--buyers buyers.json] [--against <folder of other plans>] story.md`.
The starter's `story-site.example.md` shows every field, using fictional companies. Don't adapt it.

**Header.** Name the decision before anything else:
- `Audience:` the buyer and who reads it. `Decider:` the role that decides.
- `Decision:` what they choose between, doing nothing included.
- `Motion:` the company's real sales motion: self-serve, quoted purchase, consultative, evaluation or partnership. `Stage:` where this buyer is now.
- `Next step:` the buyer's next step with the seller, never Unfairly's. `Commits them to:` what acting commits them to. "Nothing yet" is fine, but say it. `Prerequisites:` quote, eligibility, security, data access, approvals ("none" if none).
- `Angle:` the tension. `Showpiece:` the one interactive piece, named by its unit ("a model of weekly driver hours", never "a savings model").
- `Example:` the real proposal or RFP response the page follows. `Mode: lead` for an unattended sample, which has no approval stop; `user` for a seller's real deal.

**Pick the scenario first.** `Scenario 1:` to `Scenario 3:` must differ in buyer, use case and decision, not just wording. `Chosen:` names one and says why, from the evidence. When the evidence is thin, choose a modest next decision.

**Commitments.** Every date, duration, trial and term on the page is a line:
`Commitment: <what> | kind: sourced|supplied|proposed|unknown | source: <url or fact id>`.
- Sourced and supplied commitments need a source.
- An unknown one can't go on the page: drop it or make it a prerequisite.
- A proposed one is sequenced by dependency ("after the security review"), not by calendar.

**Figures.** Every financial figure is a structured assumption:
`Assumption: <name> | type: cash|capacity|time|count|rate | source: … | excludes: … | from: <date it counts from>`.
Capacity and time are never shown as cash.

**Objections and restraint.**
- `Objection: <objection> | answered in: NN` takes a section number, or `open`. Read the plan as the champion, the economic buyer and procurement would.
- `Cut: <what> because <why>` records what you left out.

**Sections.** One `## NN name` block each:
- `Job:` one job.
- `Headline:` a claim, never a label. A headline that opens with an invitation (Explore, Discover, Learn, See, Consider, Imagine, Find out, Unlock, Meet, Introducing, Welcome) fails in a lead plan and warns otherwise: say what the seller does for this buyer, with the proof under it.
- `Proof:` fact ids or a source URL. Repeatable; the first section may skip it.
- `Buyer phrase:` the buyer's own words this section answers, from `buyers.json`.
- An `Interactive:` section also says:
  - `Changes:` what moves downstream (the headline, offer, CTA, dates).
  - `Empty state:` what it reads with nothing entered, as a sentence.
  - `Prints:` the state the PDF shows, with its assumptions and the next step, never "move the slider".

**buyers.json** sits beside story.md: `{ "lexicon": [{ "phrase", "source" }], "roles", "triggers", "objections" }`. Every lexicon phrase carries the URL it came from: case studies, RFPs, job posts, reviews.

**What fails:**
- a missing header field or an invalid motion;
- fewer than three scenarios;
- a commitment with no kind, an unknown commitment, or a sourced or supplied one with no source;
- an assumption with no type, or an objection pointing at a section that doesn't exist;
- a section with no job, headline or proof, or an interactive section missing Changes, Empty state or Prints;
- in a lead plan, a headline that invites ("Explore ...") instead of claiming;
- an unsourced lexicon phrase.

**What warns:**
- near-duplicate scenarios;
- a proposed commitment with a calendar date;
- a showpiece with no unit, or one that names a single input (a lead showpiece needs at least two controls: name the inputs, choice, tabs or presets);
- an invitation headline in a user plan (in a lead plan it fails);
- fewer than two objections, or nothing cut;
- a missing or unlisted buyer phrase;
- a section order that matches another plan by more than 60% (`--against`).

A lead plan that holds prints "Plan holds. Build from it." and the build goes on with no sign-off. A user plan still gets the sign-off in step 6: show the decision, the chosen scenario and every headline.
