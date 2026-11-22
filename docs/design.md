# patch-scout design

How strategy B works step by step, and why each rule is there. The README has the short version.

## Pipeline

Strategy B (evidence-first) is the product. It looks for the work first and finds the people through it:

1. **Search for local events, twice.** Run three Exa searches per theme: workshops or talks, meetups, and hackathons or demo nights, each in Philadelphia. Then run the same three again, limited with `includeDomains` to Philadelphia venue sites (Temple, Drexel, Penn, the Free Library, NextFab, Hive76, Iffy Books, Meetup, and others). Event pages name a person, a place, and a date on the same page, and the venue sites reach people the open web misses: in a test, the two searches shared only 5 of 18 people.
2. **Extract people with `outputSchema`.** Each search asks Exa for structured output: the name, the role (`taught`, `built`, or `wrote`), the page that shows the work, whether the page ties the person to Philadelphia, the person's own links, and whether the item is a `person`, `organization`, `team`, or `event`.
3. **Clean the model's output.** The model labels organizations as people and fills empty fields with placeholders, so the code checks the names itself. It drops a name that is a placeholder (`null`, `N/A`), has no letters, has only one word (`philly`, `Jacob`), ends in a single initial instead of a surname (`David W.`), or contains an organization word (`club`, `books`, `chapter`, `valley`, ...). It also drops items the model marks as not a person, and treats placeholder handles as no handle (see the merge rules below).
4. **Check each cited URL against the results.** The code drops a person when the cited page is not one of the search results that came back. The model must point to a page the search actually returned.
5. **Check each role against a quote.** The model must also copy one sentence from the page that shows the role. The code looks for that sentence in the page's full text. If the quote is not on the page, the evidence drops to `profile`. If the role is `taught` but the quote has no teaching word (workshop, class, talk, led, ...), the role drops to `built`.
6. **Merge.** Combine mentions of the same person across pages (rules below).
7. **Drop people with no proof.** After the merge, keep a person only when at least one piece of their evidence passed the quote check.
8. **Rank.** Score each person by the strength of their evidence, and keep only people with at least one Philadelphia-linked piece of evidence.

Strategy A (people category) is the baseline. It runs one Exa search with `category: "people"` for `"<theme> Philadelphia"` and ranks the profiles that come back. It is the simplest reasonable way to use Exa for this job, so strategy B must beat it to be worth its extra calls.

## Decisions

**Merge rules, in order.** Two mentions are the same person when (1) their handles match, ignoring case, or (2) one mention's page links to the other's page, or (3) both are tied to Philadelphia and their names match after removing case, extra spaces, text in parentheses, and middle initials, as long as the two names do not have different initials. A name match without the Philadelphia condition is not a merge. Two different initials (`John A. Smith`, `John B. Smith`) and a first name with a matching last initial (`Tony S.`, `Tony Siu`) are not merges either. Each of these only marks the two people as a possible duplicate. A wrong merge is worse than a missed one: it gives one person another person's evidence, and the tool then recommends the wrong person with a confident reason. A missed merge only shows the same person twice, and a human sees that at once.

**Ranking weights are stated guesses.** Evidence strength = kind weight × recency × relevance. The kind weights are `taught` 1.0, `built` 0.7, `wrote` 0.5, `profile` 0.3, because teaching a PATCH night is the job. Recency halves every two years. These numbers are not tuned. The eval exists to test them.

**The code checks the model's role, instead of trusting it.** The role sets most of a person's score, and a model can call a professor `taught` with no workshop on the page. A quote that must appear word for word in the page text is cheap to check in code. A role with no proof drops to `profile`, the lowest weight, and a person whose evidence is all `profile` is dropped from strategy B. A quote under 20 characters counts as no proof, because a short phrase such as "led a workshop" can match a page by chance.

**Placeholder values from the model count as missing.** A model fills a field it was told to fill, even when the page has no answer: it writes `N/A`, `none`, or `unknown`. Any field used to match records needs that check at the point where model output enters the code. Here it is the handle, because merge rule 1 trusts it, and the name, which is what the organizer reads.

**The code reads the name to find organizations, because the model's label is wrong.** The schema has a required `entity` field (person, organization, team, or event), and the code drops anything that is not a person. In practice the model often labels organizations as `person`, so no condition on that label can catch them. The code also drops names that contain an organization word or have only one word. Words that are also common surnames (`green`, `hall`, `park`, `press`) stay off the list, so a person such as Richard Green is kept. The list still misses some names, such as an organization written as one invented word.

**Diminishing returns.** Each person's evidence is sorted strongest first, and each next item counts half as much as the one before it, so ten weak blog posts cannot outrank one workshop that a person actually taught.

## Known limits of these rules

- The organization word list is hand-made and misses some names.
- The venue list is hand-made. `meetup.com` is on it but hosts groups from anywhere, and its event pages list attendees by first name and last initial; over the first three-day round it gave 5 wrong people out of 7, and 1 of 4 in the second.
- A hyphenated second surname is not merged with the shorter name ("Diego Mendoza" and "Diego Mendoza-Ramos" appear as two people).
