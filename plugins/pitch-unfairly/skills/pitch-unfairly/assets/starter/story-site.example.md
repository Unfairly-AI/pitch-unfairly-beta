# Tidewater Routing proposal for Marlow Provisions (sample plan)

<!--
A format reference for a proposal site's story plan, checked by
`npm run story:check -- story-site.example.md`. Both companies are fictional
(.example domains). Don't adapt this plan: write the prospect's own from their
facts.json and buyers.json, so no two pages share an arc (rule 9).

Header lines with several values (Commitment, Assumption, Objection, Cut) repeat
the key. Pipe-separated parts are "key: value".

buyers.json beside story.md (optional) feeds the Buyer phrase check:
{
  "lexicon": [
    { "phrase": "re-planning routes every morning", "source": "https://tidewater-routing.example/stories/northfield" },
    { "phrase": "dwell time", "source": "https://tidewater-routing.example/stories/harbor-dairy" }
  ],
  "roles": ["VP of Operations", "fleet manager", "CFO"],
  "triggers": ["fleet lease renewal", "a new depot"],
  "objections": ["drivers won't learn another app"]
}
-->

Format: proposal site
Mode: lead
Seller: Tidewater Routing (fictional), route-planning software for regional food distributors
Audience: Marlow Provisions, a fictional regional food distributor; the VP of Operations reads first and forwards it to the CFO
Decision: pilot route planning on Marlow's two busiest depots, keep re-planning routes by hand in spreadsheets, or wait for the fleet lease renewal
Decider: VP of Operations, with the CFO signing anything over the operations budget
Motion: consultative
Stage: has seen a demo and asked how a pilot would work with their own stop data
Next step: book a 45-minute pilot scoping call with Tidewater's solutions team
Commits them to: nothing yet; the scoping call is free, and the pilot itself needs a signed order form
Prerequisites: a pilot quote, an export of 90 days of stop data, and IT's security review of the driver app
Angle: the routes Marlow plans by hand already cost a measurable number of driver hours every week
Showpiece: a model of weekly driver hours across two depots, from stops per route and average dwell time
Example: Tidewater's public pilot one-pager (see example.md), with the hours model in place of its static before-and-after table

Scenario 1: the VP of Operations at a regional distributor decides whether to pilot route planning on two depots before the fleet lease renews
Scenario 2: a fleet manager at a dairy cooperative weighs Tidewater against the telematics vendor's bundled routing add-on
Scenario 3: a procurement lead for a grocery chain's private fleet runs a formal RFP covering forty stores
Chosen: 1, because Tidewater's case studies and pilot page speak to distributors' operations leads, and its published pilot terms support a scoping call as the next decision

Commitment: a free 45-minute scoping call | kind: sourced | source: https://tidewater-routing.example/pilot
Commitment: the pilot covers up to two depots for 30 days | kind: sourced | source: pilot-terms
Commitment: the pilot starts after IT's security review and the stop-data export | kind: proposed | source: scenario assumption

Assumption: driver hours returned per week | type: time | source: dwell-study | excludes: overtime pay and fuel | from: the first full week of the pilot
Assumption: stops per route | type: count | source: example input, labelled on the page
Assumption: on-time delivery rate | type: rate | source: otd-northfield

Objection: our dispatchers know the routes better than software | answered in: 04
Objection: drivers learning a new app in the busy season | answered in: 05
Objection: IT won't approve another app on driver phones | answered in: 06
Objection: what if the pilot shows nothing | answered in: 06
Objection: the CFO wants cash, not hours | answered in: open

Cut: a glance band of headline stats, because the hours model makes the same point with Marlow's own numbers
Cut: a feature tour, because the VP has already seen the demo
Cut: a dated rollout calendar, because no real dates exist yet

## 01 opening
- Job: say who is selling what to whom, and the decision on the table
- Headline: Marlow's two busiest depots can test route planning before the lease renews.
- Buyer phrase: fleet lease renewal

## 02 the hand-planned morning
- Job: show what planning by hand costs Marlow each week
- Headline: Dispatchers spend the first hours of every shift re-planning routes.
- Proof: dispatch-survey, northfield-quote
- Buyer phrase: re-planning routes every morning

## 03 driver hours model
- Job: let the VP see the weekly hours at Marlow's own stop counts
- Headline: Your stop counts decide how many driver hours come back each week.
- Proof: dwell-study, otd-northfield
- Buyer phrase: dwell time
- Interactive: stops per route, minutes of dwell per stop, and one or two depots
- Changes: the weekly hours figure, the pilot scope line in section 06, and the depot count in the call request
- Empty state: With no stops entered, the model reads "Add a stop count to see the weekly hours."
- Prints: the default state (two depots, 18 stops, 6 minutes of dwell) with its hours, its assumptions and the scoping-call contact

## 04 a distributor like Marlow
- Job: prove that dispatchers keep their judgment and lose the busywork
- Headline: Northfield's dispatchers still choose the routes, in twenty minutes instead of a morning.
- Proof: northfield-quote, https://tidewater-routing.example/stories/northfield
- Buyer phrase: re-planning routes every morning

## 05 drivers keep their handhelds
- Job: answer the switching cost for drivers
- Headline: Drivers keep their handhelds and only the stop order changes.
- Proof: driver-app-compat
- Buyer phrase: drivers won't learn another app

## 06 how the pilot runs
- Job: lay out the pilot by dependency, with what happens if it shows nothing
- Headline: The pilot starts once IT clears the app and the stop data is in.
- Proof: pilot-terms, security-pack
- Buyer phrase: a new depot

## 07 the next step
- Job: ask for one step the buyer can take today
- Headline: A scoping call settles the pilot's depots, data and price.
- Proof: https://tidewater-routing.example/pilot
- Buyer phrase: fleet lease renewal
