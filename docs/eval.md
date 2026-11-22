# patch-scout evaluation

How strategy A (Exa people search) and strategy B (evidence-first) are measured, the full results, and what changed along the way. The README has the short version.

## Method and latest results

Three themes (sound-reactive visuals, NFC and tap automations, voice agents). For each theme, both strategies ran, the results were pooled, and one judge labeled every person blind to which strategy found them. The rule: `yes` only when the evidence link shows the person doing the theme (built it, taught it, performed it, spoke on it). A matching job title or skills list alone is `no`. The judge is also a PhilaCon Valley organizer and labels their own entry `no` wherever it appears.

Latest eval: one run per day on three days (2026-11-17, 11-19, and 11-21), each day scored with its own labels, with the same code on all three days. Each cell is the mean, with the lowest and highest day in parentheses:

| Method | Precision@10 | Share correct | Avg returned | Relative recall | $ / theme | s / theme | 
|---|---|---|---|---|---|---|
| A: people category | 30% | 31% (30–31%) | 9.8 (9.7–10.0) | 31% (27–34%) | $0.0070 | 1.5 (1.4–1.6) |
| B: evidence-first | 56% (43–67%) | 75% (72–80%) | 7.3 (6.0–8.3) | 69% (66–73%) | $0.0420 | 5.7 (5.5–6.1) |

**How to read this table:**

- **A result counts as real only when the two ranges do not overlap.** Exa returns different pages from day to day, so one run can be lucky or unlucky by 10 points or more. If B's worst day beats A's best day, no lucky or unlucky day explains the gap.
- **B beats A on every quality measure, on every day.** B's worst day beat A's best day on Precision@10 (43% vs 30%), on the share of returned names that are correct (72% vs 31%), and on relative recall (66% vs 34%). In the first round, only the share correct separated.
- **A barely changes from day to day.** Exa's people search returned almost the same profiles on all three days, so A's ranges are narrow. B searches event pages, which change more.
- **Relative recall is a share of the people both strategies found together.** B's recall rose partly because A found fewer correct people this round, not only because B found more. A and B have not found a single person in common on any of the six days measured.
- **B costs 6× more than A and takes about 4× longer,** because it runs six searches with structured output and downloads each page's full text for the role check. The six searches run in parallel.

The honest summary: **on the current code, B finds more of the right people, and about 3 of every 4 names it returns are right; for A it is about 1 in 3.**

**Round 1 compared with round 2.** The first three-day round ran 2026-10-26 to 10-28:

| Method | Precision@10 | Share correct | Avg returned | Relative recall | $ / theme | s / theme | 
|---|---|---|---|---|---|---|
| A: people category | 33% (30–37%) | 38% (33–44%) | 8.9 (8.3–9.3) | 45% (41–49%) | $0.0070 | 3.0 (2.2–4.5) |
| B: evidence-first | 42% (33–50%) | 69% (62–79%) | 6.1 (5.0–7.0) | 52% (48–56%) | $0.0420 | 6.5 (5.0–8.7) |

B's share correct and Precision@10 rose between rounds, but the two rounds' ranges overlap, so the gain is not proven. Three things changed between rounds: the rule that drops names written as a first name and a last initial, the merge fix for same-name people, and three weeks of changes in Exa's index. No single change can take the credit.

**Why three days and not three runs in a row.** The first repeated eval ran three rounds back to back, and strategy A returned identical results all three times: searches minutes apart return the same pages. The swing that matters happens across days (B read 57% on 10/24 and 36% on 10/26 with the same code), so each day counts as one round, and the code stays the same until the third day is labeled.

**Labeling checks.** One judge labels every round, so each `yes` is checked against the written rule before scoring. In round 2 that check changed two kinds of labels: LinkedIn profiles that only list titles and skills (strategy A's share correct on day 1 dropped from 69% to 31% after the re-check), and three members of a hackathon team that built a scholarship-matching agent, listed under voice agents.

To reproduce: run `npm run eval:pool` once a day, copy earlier labels with `npm run eval:carry -- <earlier day>/judgments.csv`, label the rest, run `npm run eval:save`, and score with `npm run eval:score -- eval/days/<day 1> eval/days/<day 2> eval/days/<day 3>`.

The sample is still small: three themes, one judge, two three-day rounds.

**Meetup check (from round 1).** The rule that drops first-name-and-initial names was adopted with a condition: if Meetup still gave more wrong people than correct ones over the next three-day round, `meetup.com` would be replaced with known Philadelphia groups. In round 2 Meetup gave 3 correct people and 1 wrong one, so `meetup.com` stays.

## Per-page extraction: tried, and not kept

Strategy B asks Exa for one structured answer for each whole search, and the model lists only a few people from ten pages. To get more, a version asked Exa for one structured summary per page (`contents.summary` with a schema). Both versions ran with the same filters:

| B version (2026-10-13 and 14) | Names returned | Correct names | Share correct | Precision@10 | $ / theme | s / theme |
|---|---|---|---|---|---|---|
| One answer per search, handle fix only | 9 | 8 | 89% | 27% | $0.021 | 21.4 |
| One answer per page, all filters | 17 | 9 | 53% | 30% | $0.051 | 34.5 |
| **One answer per search, all filters (current)** | 8 | 7 | 88% | 23% | $0.021 | 14.5 |

Per-page extraction nearly doubled the names but added at most one or two correct people, which is within run-to-run noise. Most new names were organizations the word list missed and people from off-topic hackathons. It cost 2.4× more and ran more than twice as slowly as the current version, so B keeps one answer per search. Every version found about 8 correct people across the three themes, which pointed at the searches, not the extraction, as the limit. Adding the venue-site searches later confirmed it: B's correct people doubled with no change to extraction.

## Earlier runs, and bugs that affected them

| Run | Change | B Precision@10 | B share correct | B relative recall |
|---|---|---|---|---|
| 2026-10-10 | first version | 20% | 6 of 8 | 53% |
| 2026-10-13 | role check | 20% | 6 of 9 | 52% |
| 2026-10-13 | entity field, event queries, handle fix | 27% | 8 of 9 | 59% |
| 2026-10-14 | name and proof filters | 23% | 7 of 8 | 43% |
| 2026-10-24 | venue-site searches (one run) | 57% | 17 of 20 | 65% |
| 2026-10-26 to 28 | three days, scored together | 42% (33–50%) | 69% (62–79%) | 52% (48–56%) |
| 2026-11-17 to 21 | initial-surname rule; three days (current) | 56% (43–67%) | 75% (72–80%) | 69% (66–73%) |

**The first two B rows were affected by a merge bug.** The model writes `"N/A"` as the handle for anyone with no handle on the page. Merge rule 1 joins mentions with matching handles, so every such person in a run became one person holding the others' evidence. In one run, one person's evidence included two other people's event pages, and those two people disappeared from the list. The parser now treats placeholder handles as missing.

**Exa results vary from run to run.** Strategy A's code did not change across these runs, and its Precision@10 still moved between 33% and 43%. B's recall moves with A's, because relative recall shares one pool. A change smaller than about 10 points cannot be told apart from noise at this sample size.

**What the role check changed:** no measurable change in relevance. The eval labels whether a person is relevant, not whether their role is right, so it does not measure what the role check is for. The role check sets the evidence `kind`, which sets the ranking weight, and it shows a real quote from the page as proof.

## Next steps

In order of expected value, based on where strategy B's 11 wrong names came from over the second three-day round:

1. **Add a topic check.** At least four of B's wrong names did the right kind of work on the wrong theme. A Drexel hackathon story listed several teams, and the model took all three members of a team that built a scholarship-matching agent as "voice agents", next to the team that did build one. An NFC teacher came back under sound-reactive visuals. A check that the quoted work is about the theme, not only near it, would catch these.
2. **Skip the organizers' own names.** Two of B's wrong names were a PhilaCon Valley organizer, found through the organization's own event pages. The tool exists to find people the organizers do not already know.
3. **More themes and a second judge** who is not an organizer. Three themes and one judge are the main limit on how small a change the eval can measure.
4. **Combine A and B.** They have not found a single person in common on any of the six days measured. A's list is about two-thirds wrong, so its names would need a filter before joining B's.
5. **Label each role, not only each person,** so the eval can measure the role check.
6. **Merge hyphenated surnames,** so "Diego Mendoza" and "Diego Mendoza-Ramos" are one candidate.
7. **Strategy C on the Agent API (`/agent`)**, which Exa recommends for list-building. It is the strongest comparison, but it is asynchronous and slower.
8. **A web page on Vercel,** so organizers can use it without a terminal.
