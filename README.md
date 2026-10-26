# patch-scout

Give it a theme, and it returns a ranked list of Philadelphia-area people who have taught, built, or written about that theme. Each person comes with the links that justify the pick.

PhilaCon Valley runs PATCH nights: hands-on build nights around one theme, such as sound-reactive visuals or NFC. Each night needs a local person who can teach one craft. Until now those people came from memory and word of mouth. patch-scout finds them with the [Exa API](https://exa.ai), and it measures itself against a simpler Exa mode.

## Quick start

Requires Node 22 or later and an Exa API key.

```bash
npm install
cp .env.example .env        # then set EXA_API_KEY in .env
npm run scout -- "NFC and tap automations"
```

Add `--strategy a` to run the baseline instead. The default is strategy B.

## How it works

Strategy B (evidence-first) is the product. It looks for the work first and finds the people through it:

1. **Search for local events, twice.** Run three Exa searches per theme: workshops or talks, meetups, and hackathons or demo nights, each in Philadelphia. Then run the same three again, limited with `includeDomains` to Philadelphia venue sites (Temple, Drexel, Penn, the Free Library, NextFab, Hive76, Iffy Books, Meetup, and others). Event pages name a person, a place, and a date on the same page, and the venue sites reach people the open web misses: in a test, the two searches shared only 5 of 18 people.
2. **Extract people with `outputSchema`.** Each search asks Exa for structured output: the name, the role (`taught`, `built`, or `wrote`), the page that shows the work, whether the page ties the person to Philadelphia, the person's own links, and whether the item is a `person`, `organization`, `team`, or `event`.
3. **Clean the model's output.** The model labels organizations as people and fills empty fields with placeholders, so the code checks the names itself. It drops a name that is a placeholder (`null`, `N/A`), has no letters, has only one word (`philly`, `Jacob`), or contains an organization word (`club`, `books`, `chapter`, `valley`, ...). It also drops items the model marks as not a person, and treats placeholder handles as no handle (see the merge rules below).
4. **Check each cited URL against the results.** The code drops a person when the cited page is not one of the search results that came back. The model must point to a page the search actually returned.
5. **Check each role against a quote.** The model must also copy one sentence from the page that shows the role. The code looks for that sentence in the page's full text. If the quote is not on the page, the evidence drops to `profile`. If the role is `taught` but the quote has no teaching word (workshop, class, talk, led, ...), the role drops to `built`.
6. **Merge.** Combine mentions of the same person across pages (rules below).
7. **Drop people with no proof.** After the merge, keep a person only when at least one piece of their evidence passed the quote check.
8. **Rank.** Score each person by the strength of their evidence, and keep only people with at least one Philadelphia-linked piece of evidence.

Strategy A (people category) is the baseline. It runs one Exa search with `category: "people"` for `"<theme> Philadelphia"` and ranks the profiles that come back. It is the simplest reasonable way to use Exa for this job, so strategy B must beat it to be worth its extra calls.

## Results

Three themes (sound-reactive visuals, NFC and tap automations, voice agents). For each theme, both strategies ran, the results were pooled, and one judge labeled every person blind to which strategy found them. The rule: `yes` only when the evidence link shows the person doing the theme (built it, taught it, performed it, spoke on it). A matching job title or skills list alone is `no`. The judge is also a PhilaCon Valley organizer and labels their own entry `no` wherever it appears.

Latest run (2026-10-24, with venue-site searches, 47 labeled people):

| Method | Precision@10 | Avg returned | Relative recall | $ / theme | s / theme | 
|---|---|---|---|---|---|
| A: people category | 33% | 9.0 | 35% | $0.0070 | 1.3 |
| B: evidence-first | 57% | 6.7 | 65% | $0.0420 | 22.7 |

**How to read this table:**

- **B now leads on every measure of quality.** Per name returned, 17 of B's 20 names were `yes` (85%), against 10 of 27 for A (37%). One person appears twice in B's list under two spellings, so B found 16 different correct people, about twice as many as any earlier version.
- **The venue searches did most of the work.** Voice agents went from 1 correct person to 8. Most new people came from university and library event pages and a Drexel hackathon story, which the open-web searches never returned.
- **The pool held 27 `yes` rows** (26 different people). A found 10, B found 17, and no person was found by both.
- **B costs 6× more than A**, because it runs six searches with structured output and downloads each page's full text for the role check. The 22.7 s in the table was measured when the six searches ran one after another. They now run in parallel: one timed run for voice agents took 5.1 s, against about 24 s before.
- **Before publishing, four risky `yes` labels were checked against their pages.** Two became `no`: an online real-estate automation session from a New Jersey Meetup group (under NFC), and a speaker's marketing page that only names Philadelphia (under voice agents). Both came from loose matches, not from the venue calendars.

The honest summary: **strategy B is now both precise and useful: about 5 correct people per theme, against about 3 for A.** The two still find different people, so a combined list would be larger than either.

The sample is small (47 labeled people, one judge, one run). The gap between B's 57% and its earlier 23% is far larger than the run-to-run noise seen so far (about 10 points), so it is very likely real, but treat the exact numbers as a direction.

### Per-page extraction: tried, and not kept

Strategy B asks Exa for one structured answer for each whole search, and the model lists only a few people from ten pages. To get more, a version asked Exa for one structured summary per page (`contents.summary` with a schema). Both versions ran with the same filters:

| B version (2026-10-13 and 14) | Names returned | Correct names | Share correct | Precision@10 | $ / theme | s / theme |
|---|---|---|---|---|---|---|
| One answer per search, handle fix only | 9 | 8 | 89% | 27% | $0.021 | 21.4 |
| One answer per page, all filters | 17 | 9 | 53% | 30% | $0.051 | 34.5 |
| **One answer per search, all filters (current)** | 8 | 7 | 88% | 23% | $0.021 | 14.5 |

Per-page extraction nearly doubled the names but added at most one or two correct people, which is within run-to-run noise. Most new names were organizations the word list missed and people from off-topic hackathons. It cost 2.4× more and ran more than twice as slowly as the current version, so B keeps one answer per search. Every version found about 8 correct people across the three themes, which pointed at the searches, not the extraction, as the limit. Adding the venue-site searches later confirmed it: B's correct people doubled with no change to extraction.

### Earlier runs, and bugs that affected them

| Run | Change | B Precision@10 | B per name | B relative recall |
|---|---|---|---|---|
| 2026-10-10 | first version | 20% | 6 of 8 | 53% |
| 2026-10-13 | role check | 20% | 6 of 9 | 52% |
| 2026-10-13 | entity field, event queries, handle fix | 27% | 8 of 9 | 59% |
| 2026-10-14 | name and proof filters | 23% | 7 of 8 | 43% |
| 2026-10-24 | venue-site searches (current) | 57% | 17 of 20 | 65% |

**The first two B rows were affected by a merge bug.** The model writes `"N/A"` as the handle for anyone with no handle on the page. Merge rule 1 joins mentions with matching handles, so every such person in a run became one person holding the others' evidence. In one run, one person's evidence included two other people's event pages, and those two people disappeared from the list. The parser now treats placeholder handles as missing.

**Exa results vary from run to run.** Strategy A's code did not change across these runs, and its Precision@10 still moved between 33% and 43%. B's recall moves with A's, because relative recall shares one pool. A change smaller than about 10 points cannot be told apart from noise at this sample size.

**What the role check changed:** no measurable change in relevance. The eval labels whether a person is relevant, not whether their role is right, so it does not measure what the role check is for. The role check sets the evidence `kind`, which sets the ranking weight, and it shows a real quote from the page as proof.

## Design decisions

**Merge rules, in order.** Two mentions are the same person when (1) their handles match, ignoring case, or (2) one mention's page links to the other's page, or (3) both are tied to Philadelphia and their names match after removing case, extra spaces, text in parentheses, and middle initials, as long as the two names do not have different initials. A name match without the Philadelphia condition is not a merge. Two different initials (`John A. Smith`, `John B. Smith`) and a first name with a matching last initial (`Tony S.`, `Tony Siu`) are not merges either. Each of these only marks the two people as a possible duplicate. A wrong merge is worse than a missed one: it gives one person another person's evidence, and the tool then recommends the wrong person with a confident reason. A missed merge only shows the same person twice, and a human sees that at once.

**Ranking weights are stated guesses.** Evidence strength = kind weight × recency × relevance. The kind weights are `taught` 1.0, `built` 0.7, `wrote` 0.5, `profile` 0.3, because teaching a PATCH night is the job. Recency halves every two years. These numbers are not tuned. The eval exists to test them.

**The code checks the model's role, instead of trusting it.** The role sets most of a person's score, and a model can call a professor `taught` with no workshop on the page. A quote that must appear word for word in the page text is cheap to check in code. A role with no proof drops to `profile`, the lowest weight, and a person whose evidence is all `profile` is dropped from strategy B. A quote under 20 characters counts as no proof, because a short phrase such as "led a workshop" can match a page by chance.

**Placeholder values from the model count as missing.** A model fills a field it was told to fill, even when the page has no answer: it writes `N/A`, `none`, or `unknown`. Any field used to match records needs that check at the point where model output enters the code. Here it is the handle, because merge rule 1 trusts it, and the name, which is what the organizer reads.

**The code reads the name to find organizations, because the model's label is wrong.** The schema has a required `entity` field (person, organization, team, or event), and the code drops anything that is not a person. In practice the model often labels organizations as `person`, so no condition on that label can catch them. The code also drops names that contain an organization word or have only one word. Words that are also common surnames (`green`, `hall`, `park`, `press`) stay off the list, so a person such as Richard Green is kept. The list still misses some names, such as an organization written as one invented word.

**Diminishing returns.** Each person's evidence is sorted strongest first, and each next item counts half as much as the one before it, so ten weak blog posts cannot outrank one workshop that a person actually taught.

## Limits

- Three themes only.
- One judge, who also built the tool and organizes PATCH nights.
- One run per eval. Exa returns different pages from run to run, and A's precision moved by 7 points with no code change.
- Recall is relative to the pooled results of these two strategies, not to every qualified person in Philadelphia.
- The ranking weights are not tuned.
- The organization word list is hand-made and misses some names.
- The venue list is hand-made. `meetup.com` is on it but hosts groups from anywhere, which let in a New Jersey group.
- A hyphenated second surname is not merged with the shorter name ("Diego Mendoza" and "Diego Mendoza-Ramos" appear as two people).

## Next steps

In order of expected value:

1. **Tighten the venue list.** Replace `meetup.com` with the specific Philadelphia groups that host theme events, and add other venue calendars (galleries, community centers, local news event listings). Measure new correct people per added site.
2. **Make the eval repeatable.** Run each strategy three times per theme and report the average and the spread. Until then, a gain smaller than about 10 points of Precision@10 cannot be told apart from noise.
3. **Combine A and B.** They found no person in common across three runs. B's list plus A's best profiles may beat either one alone.
4. **Merge hyphenated surnames,** so a person with one or two surnames is one candidate.
5. **Strategy C on the Agent API (`/agent`)**, which Exa recommends for list-building. It is the strongest comparison, but it is asynchronous and slower.
6. **Label each role, not only each person,** so the eval can measure the role check.
7. **More themes and a second judge** who is not an organizer.
8. **A web page on Vercel,** so organizers can use it without a terminal.
