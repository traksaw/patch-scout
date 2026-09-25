# patch-scout — design

**Date:** 2026-09-25
**Due:** Friday 2026-09-26
**Status:** approved in conversation; this file records it

## Purpose

PhilaCon Valley runs PATCH nights: hands-on build nights around one theme (PATCH 001: sound-reactive visuals, PATCH 002: NFC). Each night needs a local person who can teach one craft. Today those people come from memory and word of mouth.

`patch-scout` takes a theme and returns a ranked list of Philadelphia-area people who have taught, built, or written about it, each with the links that justify the pick. It is built on the Exa API.

It also has to show retrieval judgment, not only API use: it measures itself against a simpler Exa mode.

## Scope (Friday)

In:
- Method **B** (evidence-first) as the product, run from a CLI.
- Method **A** (Exa `people` category search) as the one comparison.
- Pooled eval on **3 themes**: sound-reactive visuals, NFC and tap automations, voice agents.
- README with results table, limits, and next steps.

Out (listed in README as next steps):
- Method C: Exa's Agent API (`/agent`), which Exa's own guidance names as the surface for list-building. The strongest comparison, but async and slower; next step.
- Web page on Vercel.
- Probabilistic record linkage.
- More themes and more than one judge.

## Structure

All methods share one shape:

```ts
type Strategy = (theme: string) => Promise<Candidate[]>

type Candidate = {
  name: string
  handles: string[]          // github user, site domain, etc.
  philly: boolean
  score: number
  breakdown: ScoreLine[]     // why this score
  evidence: Evidence[]
}

type Evidence = {
  url: string
  title: string
  excerpt: string
  kind: 'taught' | 'built' | 'wrote' | 'profile'
  publishedDate?: string
  philly: boolean
  linkedUrls: string[]       // outbound links used by merge
}
```

```
src/
  exa.ts               Exa client wrapper: API key, retry, cost + latency tracking
  strategies/
    profiles.ts        A: category "people" search (raw profile documents; the naive baseline)
    evidence.ts        B: search for work → extract people → merge → rank
  merge.ts             identity rules (pure function)
  rank.ts              scoring rules (pure function)
  cli.ts               scout "<theme>" [--strategy a|b]  → ranked markdown
eval/
  pool.ts              run A + B per theme, blind + dedupe top 10s → judgments.csv
  score.ts             read labels → precision@10, relative recall, $ / theme, s / theme
```

## Method B pipeline

1. **Search for work, and extract people in the same call.** 3–4 Exa `/search` calls per theme, each aimed at a kind of evidence (workshops/talks/events, open-source projects, personal sites/posts). Each call sets:
   - `query`: retrieval intent only, e.g. "NFC workshop Philadelphia". No keep/drop words in the query.
   - `systemPrompt`: the rules. Keep a person only when the page shows they taught, built, or wrote the work; mark `philly` only when the page ties them to Philadelphia; never guess a name.
   - `outputSchema`: `{ people: [{ name, handle, role: taught|built|wrote, url, philly, linkedUrls }] }`.
   - `contents: { highlights: true }`, so each evidence item has an excerpt.
   - No `category`, no domain filters, no date filters, no boilerplate `numResults` (per Exa's guidance; categories like `github` do not exist). Recency is handled in ranking from `publishedDate`.
   Citations come from `output.grounding`. No second model or API key.
2. **Map to evidence.** Each extracted person + their cited URL becomes an `Evidence` item, joined to the result's `publishedDate` and highlights.
3. **Merge** (`merge.ts`):
   1. Merge when pages link to each other or share a handle.
   2. Merge when the full name matches exactly and both sides are Philly.
   3. Otherwise keep separate and flag as a possible duplicate.
   Rationale: a wrong merge silently gives one person another's evidence; a missed merge shows two visible rows. When unsure, do not merge.
4. **Rank** (`rank.ts`):
   - **Gate:** at least one Philly evidence item, or the person is dropped.
   - **Item strength** = kind weight × theme relevance (Exa result `score` when returned, else 1 − rank/N) × recency decay.
     - Kind weights: taught 1.0, built 0.7, wrote 0.5, profile 0.3.
     - Recency: half-life 2 years; undated items get 0.5.
   - **Person score** = items sorted by strength, weighted 1, 1/2, 1/4, … (diminishing returns).
   - All weights are stated guesses; the eval tests them.
5. **Output:** top 10, each with score breakdown and evidence links.

## Eval (pooled judging)

1. `pool.ts` runs A and B on each of the 3 themes and takes each top 10.
2. Dedupe, shuffle, hide which method found whom → `judgments.csv` (name, evidence links, empty `label`).
3. Waskar labels each row `yes` / `no` / `?` (~40–60 rows, ~20 min).
4. `score.ts` prints:

| Method | Precision@10 | Relative recall | $ / theme | s / theme |
|---|---|---|---|---|

`?` counts as not relevant. Relative recall = share of all `yes` people (found by either method) that this method found.

**Privacy:** `judgments.csv` and raw run outputs are git-ignored. `no` labels are opinions about real, named people. The public repo commits only the aggregate table, plus example output only with explicit approval.

**Honesty:** README reports results as they come out, including if B loses. It names the limits: 3 themes, one judge, relative (not absolute) recall.

## Errors

- Exa call fails → retry twice with backoff, then skip that query, record it, and continue. The CLI prints a warning line and the run still returns results.
- Summary missing or not matching the schema → drop that page, count it in a `dropped` total shown in output.
- No candidates pass the Philly gate → print that plainly; do not fall back to non-Philly people.
- Missing `EXA_API_KEY` → exit with a one-line setup message.

## Tests

- `merge.ts` and `rank.ts` are pure functions: unit tests with hand-written fixtures, written first (TDD). Cases: link-based merge, handle merge, same-name-different-city not merged, Philly gate drops a strong remote person, diminishing returns (ten weak items do not beat one strong taught item), recency decay.
- `exa.ts` is mocked in tests; no live API calls in the test suite.
- One recorded fixture of a real Exa response per strategy, for pipeline tests.

## Who writes what

Waskar writes `merge.ts` and `rank.ts` (the decisions he defended in decide-first); Claude coaches and reviews. Claude may scaffold `exa.ts`, CLI, eval scripts, and config, and walks Waskar through them before he sends the repo.

## Exa guidance applied (build-with-exa skill v0.2.0)

- Structured extraction uses `/search` + `outputSchema` + `systemPrompt`, not `contents.summary`.
- `category: "people"` is kept only for method A, whose purpose is the naive raw-profile baseline. Exa routes real list-building to `/agent`, which is why C is the Agent API.
- `findSimilar` is deprecated and not used.
- Cost comes from `costDollars` on each response; latency from `searchTime` plus wall clock.

## Open items

- Exa API key: must be in `EXA_API_KEY` before the first live run.
- GitHub account for the public repo (personal account, not the philaconvalley org, unless Waskar says otherwise).
