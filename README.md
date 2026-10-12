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

1. **Search for work.** Run three Exa searches per theme: workshops or talks in Philadelphia, open-source projects by Philadelphia developers, and blog posts or tutorials by Philadelphia builders.
2. **Extract people with `outputSchema`.** Each search asks Exa for structured output: the name, the role (`taught`, `built`, or `wrote`), the page that shows the work, whether the page ties the person to Philadelphia, and the person's own links.
3. **Check each cited URL against the results.** The code drops a person when the cited page is not one of the search results that came back. The model must point to a page the search actually returned.
4. **Merge.** Combine mentions of the same person across pages (rules below).
5. **Rank.** Score each person by the strength of their evidence, and keep only people with at least one Philadelphia-linked piece of evidence.

Strategy A (people category) is the baseline. It runs one Exa search with `category: "people"` for `"<theme> Philadelphia"` and ranks the profiles that come back. It is the simplest reasonable way to use Exa for this job, so strategy B must beat it to be worth its extra calls.

## Results

Three themes (sound-reactive visuals, NFC and tap automations, voice agents). For each theme, both strategies ran, the results were pooled, and one judge labeled every person blind to which strategy found them. The rule: `yes` only when the evidence link shows the person doing the theme (built it, taught it, performed it, spoke on it). A matching job title or skills list alone is `no`.

| Method | Precision@10 | Avg returned | Relative recall | $ / theme | s / theme | 
|---|---|---|---|---|---|
| A: people category | 40% | 9.3 | 47% | $0.0070 | 2.0 |
| B: evidence-first | 20% | 2.7 | 53% | $0.0210 | 8.4 |

**How to read this table:**

- **Precision@10 divides by 10 even when a strategy returns fewer names.** Strategy B returned only 8 people across the three themes, so most of its slots are empty. Per name returned, B is more accurate: 6 of its 8 names were `yes` (75%), against 12 of 28 for A (43%).
- **A finds more good people in total.** A found 12 of the 18 `yes` people in the pool, and B found 6. B's higher relative recall comes from one theme: NFC had only one `yes` person in the whole pool, and B found that person while A did not. Recall is averaged per theme, so that one hit counts as 100% for the NFC theme.
- **B costs 3× more and takes 4× longer**, because it runs three searches with structured output instead of one.

The honest summary: **strategy B is precise but finds too few people. Strategy A finds more people, but more than half of them are wrong.** Neither one wins clearly. The next improvement is to make B return more people (more queries per theme) without losing its precision.

The sample is small (36 labeled people, one judge), so treat these numbers as a direction, not a measurement.

## Design decisions

**Merge rules, in order.** Two mentions are the same person when (1) their handles match, ignoring case, or (2) one mention's page links to the other's page, or (3) both are tied to Philadelphia and their names match after normalizing case and spaces. A name match without the Philadelphia condition is not a merge. It only marks the two people as a possible duplicate. A wrong merge is worse than a missed one: it gives one person another person's evidence, and the tool then recommends the wrong person with a confident reason. A missed merge only shows the same person twice, and a human sees that at once.

**Ranking weights are stated guesses.** Evidence strength = kind weight × recency × relevance. The kind weights are `taught` 1.0, `built` 0.7, `wrote` 0.5, `profile` 0.3, because teaching a PATCH night is the job. Recency halves every two years. These numbers are not tuned. The eval exists to test them.

**Diminishing returns.** Each person's evidence is sorted strongest first, and each next item counts half as much as the one before it, so ten weak blog posts cannot outrank one workshop that a person actually taught.

## Limits

- Three themes only.
- One judge, who also built the tool.
- Recall is relative to the pooled results of these two strategies, not to every qualified person in Philadelphia.
- The ranking weights are not tuned.

## Next steps

- **Strategy C on the Agent API (`/agent`)**, which Exa recommends for list-building. It is the strongest comparison, but it is asynchronous and slower.
- A web page on Vercel, so organizers can use it without a terminal.
- More themes and more than one judge.
- Probabilistic record linkage, instead of fixed merge rules.
