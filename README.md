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

Strategy B (evidence-first) looks for the work first and finds the people through it:

1. **Search for local events.** Six Exa searches per theme: workshops, meetups, and hackathons in Philadelphia, each on the open web and again on Philadelphia venue sites (Temple, Drexel, Penn, the Free Library, NextFab, and others).
2. **Extract people.** Exa returns structured output for each search: the name, the role (`taught`, `built`, or `wrote`), the page that shows the work, and a quote from that page.
3. **Check the model's output in code.** Drop names that are placeholders, organizations, or not contactable. Keep a role only when its quote appears word for word on the page.
4. **Merge and rank.** Combine mentions of the same person, keep people with Philadelphia-linked evidence, and rank them by the strength of that evidence.

Strategy A (the baseline) runs one Exa search with `category: "people"` and ranks the profiles that come back.

Every rule and the reason for it: [docs/design.md](docs/design.md).

## Results

**About 3 of every 4 names B returns are right; for A it is about 1 in 3.** Measured on three separate days (2026-11-17 to 11-21), with the same code on all three. Each cell is the mean, with the lowest and highest day in parentheses:

| Method | Precision@10 | Share correct | Relative recall | $ / theme | s / theme |
|---|---|---|---|---|---|
| A: people category | 30% | 31% (30–31%) | 31% (27–34%) | $0.0070 | 1.5 |
| B: evidence-first | 56% (43–67%) | 75% (72–80%) | 69% (66–73%) | $0.0420 | 5.7 |

- **The gap is not luck.** On every quality measure, B's worst day beat A's best day.
- **B costs 6× more per theme** (about 4 cents) and takes about 4× longer.
- **They find different people.** A and B have not found a single person in common on any of the six days measured.

One judge labeled every person blind to which strategy found them: `yes` only when the evidence page shows the person doing the theme. The method, both three-day rounds, labeling checks, and the full history: [docs/eval.md](docs/eval.md).

## Limits

- Three themes and one judge, who also organizes PATCH nights.
- Recall is relative to what the two strategies found together, not to every qualified person in Philadelphia.
- The ranking weights are stated guesses, not tuned.

## Next steps

1. **Add a topic check.** The largest group of B's wrong names did the right kind of work on the wrong theme, such as a hackathon team that built a scholarship agent, listed under voice agents.
2. **Skip the organizers' own names,** found through their own event pages.
3. **More themes and a second judge,** so the eval can measure smaller changes.

The full list, with the evidence for each: [docs/eval.md](docs/eval.md#next-steps).
