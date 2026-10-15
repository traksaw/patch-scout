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

1. **Search for local events.** Run three Exa searches per theme: workshops or talks, meetups, and hackathons or demo nights, each in Philadelphia. Event pages name a person, a place, and a date on the same page. Earlier versions also searched for open-source projects and blog posts, but those pages rarely name a city: across three themes they gave 3 Philadelphia people from 60 pages, against 7 from 30 workshop pages.
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

Latest run (2026-10-14, with the name and proof filters, 37 labeled people):

| Method | Precision@10 | Avg returned | Relative recall | $ / theme | s / theme | 
|---|---|---|---|---|---|
| A: people category | 43% | 9.7 | 57% | $0.0070 | 3.0 |
| B: evidence-first | 23% | 2.7 | 43% | $0.0210 | 14.5 |

**How to read this table:**

- **Precision@10 divides by 10 even when a strategy returns fewer names.** Strategy B returned 8 people across the three themes, so most of its slots are empty. Per name returned, B is far more accurate: 7 of its 8 names were `yes` (88%), against 13 of 29 for A (45%).
- **A finds more good people in total.** The pool held 20 `yes` people. A found 13, B found 7, and no person was found by both. B found 2 of the 3 NFC people; A found 8 of the 9 voice-agent people.
- **B costs 3× more and takes about 5× longer**, because it runs three searches with structured output and downloads each page's full text for the role check.

The honest summary: **strategy B is precise, but it finds only about 3 people per theme. Strategy A finds about 10, and more than half of them are wrong.** The two find different people, so they work best together.

The sample is small (37 labeled people, 8 from B, one judge). One label moves B's per-name precision by about 12 points, so treat these numbers as a direction, not a measurement.

### Per-page extraction: tried, and not kept

Strategy B asks Exa for one structured answer for each whole search, and the model lists only a few people from ten pages. To get more, a version asked Exa for one structured summary per page (`contents.summary` with a schema). Both versions ran with the same filters:

| B version (2026-10-13 and 14) | Names returned | Correct names | Share correct | Precision@10 | $ / theme | s / theme |
|---|---|---|---|---|---|---|
| One answer per search, handle fix only | 9 | 8 | 89% | 27% | $0.021 | 21.4 |
| One answer per page, all filters | 17 | 9 | 53% | 30% | $0.051 | 34.5 |
| **One answer per search, all filters (current)** | 8 | 7 | 88% | 23% | $0.021 | 14.5 |

Per-page extraction nearly doubled the names but added at most one or two correct people, which is within run-to-run noise. Most new names were organizations the word list missed and people from off-topic hackathons. It cost 2.4× more and ran more than twice as slowly as the current version, so B keeps one answer per search. Every version found about 8 correct people across the three themes, which points at the searches, not the extraction, as the limit.

### Earlier runs, and bugs that affected them

| Run | Change | B Precision@10 | B per name | B relative recall |
|---|---|---|---|---|
| 2026-10-10 | first version | 20% | 6 of 8 | 53% |
| 2026-10-13 | role check | 20% | 6 of 9 | 52% |
| 2026-10-13 | entity field, event queries, handle fix | 27% | 8 of 9 | 59% |
| 2026-10-14 | name and proof filters (current) | 23% | 7 of 8 | 43% |

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

## Next steps

In order of expected value:

1. **Search more kinds of local sources.** Every version of B found about 8 correct people across three themes, whether it read each page on its own or not. The limit is which pages the three event searches return, and PhilaCon Valley's own pages fill many of those slots. Try more source types (venue calendars such as makerspaces and libraries, university event pages, meetup group pages, local news) and filter out the organizer's own pages, so B finds people the organizers do not already know.
2. **Make the eval repeatable.** Run each strategy three times per theme and report the average and the spread. Until then, a gain smaller than about 10 points of Precision@10 cannot be told apart from noise.
3. **Combine A and B.** They found no person in common across two runs. B's precise list plus A's best profiles may beat either one alone.
4. **Run B's three searches in parallel.** They run one after another today. Running them at the same time should bring the time close to the slowest single search.
5. **Strategy C on the Agent API (`/agent`)**, which Exa recommends for list-building. It is the strongest comparison, but it is asynchronous and slower.
6. **Label each role, not only each person,** so the eval can measure the role check.
7. **More themes and a second judge** who is not an organizer.
8. **A web page on Vercel,** so organizers can use it without a terminal.
