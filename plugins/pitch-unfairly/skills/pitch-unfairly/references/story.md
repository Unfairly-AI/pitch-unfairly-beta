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

- **The shift:** something changed in the world, and there will be winners and losers (Zuora's subscription economy).
- **The proof of behavior:** people already do this the hard way (Airbnb's couches and Craigslist listings).
- **The broken number:** one figure that can't stand (Ford's 370% turnover, every KPI red).
- **The honest grade:** what didn't work and what fixed it (Front grading its own slides, Apollo 13's five whys).
- **The audacious ask:** a clear, almost unreasonable goal with a plan (the moonshot, the Eiffel bid).

The angle decides which beats get the most room and which get cut. Pick the one the proof supports best, not the one that sounds best.

## 3. Pick a template

[templates.md](templates.md) is the library: categories by the job a deck does (pitch, sales, board, everyday work, launch, proposal, team, review, strategy, fun), each with its rules and common failures, and proven structures named for the famous decks they come from, each with a live example on pitchunfairly.com/templates.

- Choose the **category** from the job (step 1, question 2). Read its rules; they are evidence, not taste.
- Choose the **template** within it whose shape fits the angle. If the user came from a template page ("using Airbnb's 2009 seed deck structure"), use that one.
- The template's beats are the skeleton, not a cage. Merge, cut, or reorder beats when the angle calls for it, and say why in one line.

## 4. Write the beat sheet

Write `story.md`: the header (kernel, audience, after the last slide, format, template, angle), then one block per slide with its beat, job, headline, proof, and source. The starter's `story.md` shows the format.

- Each headline is a claim the audience could repeat, with the key phrase marked for emphasis. Never a topic label.
- One job per slide. Two slides with one job become one. A slide with no proof is a speaker line.
- Order for the audience, not for you: the strongest proof as early as the category allows.
- Never invent numbers, quotes, customers, or logos. Example data is labeled on the slide.

## 5. Critique it

Run `npm run story:check -- --templates <skill>/references/templates.json`. It fails on missing header fields, topic-label headlines, and slides without proof; it warns on unsourced numbers, duplicate jobs, template beats with no slide, and length past the category's norm. Then read it as the audience would, in order, headlines only:

- Do the headlines alone tell the story? If not, rewrite headlines, not slides.
- Is the tension on slide 1 or 2? Is the ask unmistakable and answerable?
- Does every claim have its proof on the same slide?
- Is anything there for you rather than for them? Cut it.

## 6. Sign off

Show the user the angle, the template, and the headlines (not the whole file) and settle them before composing. Changing a headline now costs a sentence; later it costs a slide.
