# patch-scout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Exception for this repo:** Tasks 4 and 5 (`merge.ts`, `rank.ts`) are written by Waskar, not by an agent. An agent supplies the failing tests (given below), then stops and hands over. Claude reviews his code afterward. See "Who writes what" in the spec.

**Goal:** A CLI that takes a PATCH theme and returns a ranked list of Philadelphia-area people who taught, built, or wrote about it, with evidence links, plus a pooled eval that compares an evidence-first method (B) against Exa's `people` category (A).

**Architecture:** Two strategies share one shape, `(theme) => Promise<Candidate[]>`. Strategy B runs 3 Exa `/search` calls with `systemPrompt` + `outputSchema` to extract people from evidence pages, then pure functions merge identities and rank them. Strategy A runs one `category: "people"` search as the naive baseline and goes through the same merge and rank. An eval script pools both top-10 lists for hand labeling; a score script prints precision, relative recall, cost, and latency.

**Tech Stack:** Node 22, TypeScript (strict, ESM), `exa-js`, `vitest`, `tsx`, `dotenv`.

**Spec:** `docs/superpowers/specs/2026-09-25-patch-scout-design.md`

## Schedule (ship Tue 2026-10-06)

| Day | Tasks |
|---|---|
| Thu 10/1 night | Task 1 (setup), Task 2 (record fixtures) if the API key is ready |
| Fri 10/2 | Task 3 (types + exa wrapper), Task 4 (Waskar: merge) |
| Sat 10/3 | Task 5 (Waskar: rank), Task 6 (strategy B) |
| Sun 10/4 | Task 7 (strategy A + CLI), Task 8 (eval) |
| Mon 10/5 | Live runs, ~20 min of labeling, Task 9 (README with real numbers) |
| Tue 10/6 | Task 10 (go public) |

If time runs short, cut the third eval theme (voice agents) before cutting the A-vs-B comparison. The comparison is the point.

## Global Constraints

- Exa requests follow the spec's "Exa guidance applied": `query` is retrieval intent only; keep/drop rules go in `systemPrompt`; fields go in `outputSchema`; `contents: { highlights: true }`; no `category` (except strategy A), no domain filters, no date filters, no `numResults`.
- `findSimilar` is not used. `contents.summary` is not used.
- Merge rule order is fixed: (1) pages link to each other or share a handle; (2) exact full-name match AND both Philly; (3) otherwise separate, flagged as a possible duplicate. When unsure, do not merge.
- Kind weights: taught 1.0, built 0.7, wrote 0.5, profile 0.3. Recency half-life 2 years; undated items get 0.5. Person score = items sorted by strength, weighted 1, 1/2, 1/4, ...
- Philly gate: a person needs at least one Philly evidence item, or they are dropped. No fallback to non-Philly people.
- Exa failure: retry twice with backoff, then skip that query, record it, and continue.
- Missing `EXA_API_KEY`: exit with a one-line setup message.
- No live API calls in the test suite.
- `judgments.csv` and raw run outputs are git-ignored. The public repo commits only the aggregate table.
- The README reports results as they come out, including if B loses, and names the limits: 3 themes, one judge, relative recall.
- Public repo on the personal account (`traksaw`), not the philaconvalley org. Waskar pushes; agents do not push.

## Review Focus

1. **A cited URL that is not in the search results.** The model may cite a page that is not in `results`. Expected: the mention is dropped and counted in `dropped`, never kept with made-up metadata. Test in Task 6.
2. **Model output that does not match the schema** (missing `people`, a person with no `url`, `role` outside the enum). Expected: drop that item, count it, keep the rest. Test in Task 6 (`parsePeopleOutput`).
3. **Name variants of one person** ("Jen Smith" vs "Jennifer Smith", case and extra spaces). Expected: case and whitespace differences merge under rule 2; true nickname variants stay separate and visible. Test in Task 4.
4. **Every query for a theme fails.** Expected: the CLI prints warnings and "No Philadelphia candidates found", exits 0, and does not crash. Test in Task 6.
5. **Real names in committed fixtures.** Fixtures from live Exa calls contain real people's names. Expected: fixtures are reviewed by Waskar before the repo goes public. Check in Task 10, step 1.

---

### Task 1: Project setup

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.env.example`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `npm test` runs vitest; `npm run scout -- "<theme>"` runs the CLI (wired in Task 7).

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "patch-scout",
  "version": "0.1.0",
  "description": "Find Philadelphia people who can teach a PATCH night theme, using the Exa API.",
  "type": "module",
  "private": true,
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "scout": "tsx src/cli.ts",
    "record": "tsx scripts/record-fixtures.ts",
    "eval:pool": "tsx eval/pool.ts",
    "eval:score": "tsx eval/score.ts"
  },
  "engines": { "node": ">=22" }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install exa-js dotenv && npm install -D typescript tsx vitest @types/node`
Expected: `node_modules/` created, `package-lock.json` written, no errors.

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "outDir": "dist"
  },
  "include": ["src", "eval", "scripts", "tests"]
}
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'] },
})
```

- [ ] **Step 5: Replace `.gitignore`**

The current file is missing a trailing newline after `*.log`. Replace it with:

```
.env
node_modules/
dist/
*.log
eval/out/
runs/
```

- [ ] **Step 6: Create `.env.example`**

```
EXA_API_KEY=
```

- [ ] **Step 7: Add a smoke test and run it**

Create `tests/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

describe('setup', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

Run: `npm test` → Expected: 1 passed. Run: `npm run typecheck` → Expected: no output, exit 0.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore .env.example tests/smoke.test.ts skills-lock.json .agents
git commit -m "chore: set up TypeScript, vitest, and exa-js"
```

---

### Task 2: Record one real Exa response per strategy

Why first: the Exa reference documents `costDollars`, `searchTime`, `output.content`, and `output.grounding`, but not their exact shapes. Tasks 3 and 6 read these fields. This task captures real responses so later code reads what Exa actually returns.

**Files:**
- Create: `scripts/record-fixtures.ts`
- Create (generated): `tests/fixtures/strategy-a.json`, `tests/fixtures/strategy-b.json`

**Interfaces:**
- Produces: two fixture files. Task 3 reads their `costDollars` and `searchTime` shapes. Task 6 reads `output.content` and `results` from `strategy-b.json`. Task 7 reads `results` from `strategy-a.json`.

- [ ] **Step 1: Put the key in `.env`**

```
EXA_API_KEY=<your key from dashboard.exa.ai>
```

Run: `git status --short .env` → Expected: no output (ignored).

- [ ] **Step 2: Write `scripts/record-fixtures.ts`**

```ts
import 'dotenv/config'
import Exa from 'exa-js'
import { writeFileSync, mkdirSync } from 'node:fs'

if (!process.env.EXA_API_KEY) {
  console.error('Set EXA_API_KEY in .env (see .env.example).')
  process.exit(1)
}

const exa = new Exa(process.env.EXA_API_KEY)
mkdirSync('tests/fixtures', { recursive: true })

const theme = 'NFC and tap automations'

const a = await exa.search(`${theme} Philadelphia`, {
  type: 'auto',
  category: 'people',
  contents: { highlights: true },
} as never)
writeFileSync('tests/fixtures/strategy-a.json', JSON.stringify(a, null, 2))

const b = await exa.search(`${theme} workshop or talk in Philadelphia`, {
  type: 'auto',
  systemPrompt:
    'Keep a person only when the page shows they taught, built, or wrote the work. Mark philly true only when the page ties them to Philadelphia. Never guess a name.',
  outputSchema: {
    type: 'object',
    properties: {
      people: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            handle: { type: 'string' },
            role: { type: 'string', enum: ['taught', 'built', 'wrote'] },
            url: { type: 'string' },
            philly: { type: 'boolean' },
            linkedUrls: { type: 'array', items: { type: 'string' } },
          },
          required: ['name', 'role', 'url', 'philly'],
        },
      },
    },
    required: ['people'],
  },
  contents: { highlights: true },
} as never)
writeFileSync('tests/fixtures/strategy-b.json', JSON.stringify(b, null, 2))

console.log('Wrote tests/fixtures/strategy-a.json and strategy-b.json')
```

The `as never` casts exist only because the installed `exa-js` types may lag the API. Remove them in Step 4 if the types accept these options.

- [ ] **Step 3: Run it**

Run: `npm run record`
Expected: "Wrote tests/fixtures/strategy-a.json and strategy-b.json". Two live calls, a few cents.

- [ ] **Step 4: Read the shapes and write them down**

Run: `node -e "const b=require('./tests/fixtures/strategy-b.json'); console.log(Object.keys(b)); console.log(JSON.stringify(b.costDollars)); console.log(b.searchTime); console.log(JSON.stringify(b.output,null,2).slice(0,1500)); console.log(Object.keys(b.results[0]))"`

Record the answers at the top of `scripts/record-fixtures.ts` as a comment:
- Shape of `costDollars` (number, or an object; which key holds the total)
- Unit of `searchTime` (ms or s)
- Whether `output.content` is an object or a JSON string
- Shape of `output.grounding`
- Keys on each `results[i]` (expect `url`, `title`, `publishedDate`, `highlights`, maybe `score`)

If `exa-js` accepted the options without `as never`, remove the casts.

- [ ] **Step 5: Commit**

Do not commit the fixtures to a public repo yet. They hold real names; Task 10 reviews them.

```bash
git add scripts/record-fixtures.ts tests/fixtures/
git commit -m "chore: record one real Exa response per strategy"
```

---

### Task 3: Shared types and the Exa client wrapper

**Files:**
- Create: `src/types.ts`, `src/exa.ts`
- Test: `tests/exa.test.ts`
- Delete: `tests/smoke.test.ts`

**Interfaces:**
- Produces (`src/types.ts`):

```ts
export type EvidenceKind = 'taught' | 'built' | 'wrote' | 'profile'

export type Evidence = {
  url: string
  title: string
  excerpt: string
  kind: EvidenceKind
  publishedDate?: string   // ISO string from Exa, when present
  philly: boolean
  linkedUrls: string[]
  relevance: number        // 0..1. Exa result score when present, else 1 - rank/N. (Added to the spec's type: rank.ts needs it.)
}

export type Mention = {
  name: string
  handle?: string
  evidence: Evidence
}

export type MergedPerson = {
  name: string
  handles: string[]
  philly: boolean
  evidence: Evidence[]
  possibleDuplicateOf: string[]   // names of separate people with the same name
}

export type ScoreLine = {
  url: string
  kind: EvidenceKind
  kindWeight: number
  relevance: number
  recency: number
  strength: number
  multiplier: number
  contribution: number
}

export type Candidate = {
  name: string
  handles: string[]
  philly: boolean
  score: number
  breakdown: ScoreLine[]
  evidence: Evidence[]
  possibleDuplicateOf: string[]
}

export type RunStats = {
  calls: CallRecord[]
  dropped: number
  warnings: string[]
}

export type CallRecord = {
  query: string
  ok: boolean
  attempts: number
  costDollars: number
  ms: number
  error?: string
}

export type StrategyResult = { candidates: Candidate[]; stats: RunStats }

export type Strategy = (theme: string) => Promise<StrategyResult>
```

The spec's `Strategy` returns `Candidate[]`. This plan returns `StrategyResult` so the CLI and eval can show cost, latency, and the `dropped` count the spec's Errors section requires.

- Produces (`src/exa.ts`):

```ts
export interface SearchFn { (query: string, options: Record<string, unknown>): Promise<unknown> }
export type SearchOutcome = { ok: true; data: unknown } | { ok: false; error: string }
export function createSearcher(search: SearchFn, opts?: { retries?: number; baseDelayMs?: number; sleep?: (ms: number) => Promise<void> }): {
  search(query: string, options: Record<string, unknown>): Promise<SearchOutcome>
  calls: CallRecord[]
}
export function readCost(response: unknown): number
export function defaultSearchFn(): SearchFn   // real exa-js client; exits with the setup message if EXA_API_KEY is missing
```

- [ ] **Step 1: Write `src/types.ts`** with the block above.

- [ ] **Step 2: Write the failing test `tests/exa.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { createSearcher, readCost } from '../src/exa.js'

const noSleep = async () => {}

describe('createSearcher', () => {
  it('returns data and records one ok call', async () => {
    const s = createSearcher(async () => ({ costDollars: 0.01, results: [] }), { sleep: noSleep })
    const out = await s.search('q', {})
    expect(out.ok).toBe(true)
    expect(s.calls).toHaveLength(1)
    expect(s.calls[0]).toMatchObject({ query: 'q', ok: true, attempts: 1 })
  })

  it('retries twice, then reports failure without throwing', async () => {
    let n = 0
    const s = createSearcher(async () => { n++; throw new Error('boom') }, { sleep: noSleep })
    const out = await s.search('q', {})
    expect(out).toEqual({ ok: false, error: 'boom' })
    expect(n).toBe(3)
    expect(s.calls[0]).toMatchObject({ ok: false, attempts: 3, costDollars: 0 })
  })

  it('succeeds on a retry', async () => {
    let n = 0
    const s = createSearcher(async () => { n++; if (n < 2) throw new Error('flaky'); return { results: [] } }, { sleep: noSleep })
    const out = await s.search('q', {})
    expect(out.ok).toBe(true)
    expect(s.calls[0]?.attempts).toBe(2)
  })

  it('backs off with growing delays', async () => {
    const delays: number[] = []
    const s = createSearcher(async () => { throw new Error('x') }, { baseDelayMs: 100, sleep: async (ms) => { delays.push(ms) } })
    await s.search('q', {})
    expect(delays).toEqual([100, 200])
  })
})

describe('readCost', () => {
  it('reads a number', () => expect(readCost({ costDollars: 0.005 })).toBe(0.005))
  it('reads an object total', () => expect(readCost({ costDollars: { total: 0.007 } })).toBe(0.007))
  it('returns 0 when absent or malformed', () => {
    expect(readCost({})).toBe(0)
    expect(readCost(null)).toBe(0)
    expect(readCost({ costDollars: 'free' })).toBe(0)
  })
})
```

Adjust the `readCost` object case to the real shape you wrote down in Task 2, Step 4.

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run tests/exa.test.ts` → Expected: FAIL, cannot find module `../src/exa.js`.

- [ ] **Step 4: Write `src/exa.ts`**

```ts
import Exa from 'exa-js'
import type { CallRecord } from './types.js'

export interface SearchFn { (query: string, options: Record<string, unknown>): Promise<unknown> }
export type SearchOutcome = { ok: true; data: unknown } | { ok: false; error: string }

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

export function readCost(response: unknown): number {
  if (!isRecord(response)) return 0
  const c = response.costDollars
  if (typeof c === 'number') return c
  if (isRecord(c) && typeof c.total === 'number') return c.total
  return 0
}

export function createSearcher(
  search: SearchFn,
  opts: { retries?: number; baseDelayMs?: number; sleep?: (ms: number) => Promise<void> } = {},
) {
  const retries = opts.retries ?? 2
  const baseDelayMs = opts.baseDelayMs ?? 500
  const sleep = opts.sleep ?? realSleep
  const calls: CallRecord[] = []

  async function run(query: string, options: Record<string, unknown>): Promise<SearchOutcome> {
    const start = Date.now()
    let lastError = 'unknown error'
    for (let attempt = 1; attempt <= retries + 1; attempt++) {
      try {
        const data = await search(query, options)
        calls.push({ query, ok: true, attempts: attempt, costDollars: readCost(data), ms: Date.now() - start })
        return { ok: true, data }
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err)
        if (attempt <= retries) await sleep(baseDelayMs * 2 ** (attempt - 1))
      }
    }
    calls.push({ query, ok: false, attempts: retries + 1, costDollars: 0, ms: Date.now() - start, error: lastError })
    return { ok: false, error: lastError }
  }

  return { search: run, calls }
}

export function defaultSearchFn(): SearchFn {
  const key = process.env.EXA_API_KEY
  if (!key) {
    console.error('Missing EXA_API_KEY. Copy .env.example to .env and add your key from dashboard.exa.ai.')
    process.exit(1)
  }
  const exa = new Exa(key)
  return (query, options) => exa.search(query, options as never)
}
```

- [ ] **Step 5: Run tests**

Run: `npm test` → Expected: all `exa.test.ts` tests pass. Delete `tests/smoke.test.ts` and run again. Run `npm run typecheck` → exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/exa.ts tests/exa.test.ts
git rm tests/smoke.test.ts
git commit -m "feat: add shared types and an Exa searcher with retry and cost tracking"
```

---

### Task 4: `merge.ts` (Waskar writes this, test-first)

An agent writes the test file in Step 1, confirms it fails, and stops. Waskar writes `src/merge.ts`. No reference implementation is given here on purpose: this file holds the decisions he defends in an interview.

**Files:**
- Create: `src/merge.ts` (Waskar)
- Test: `tests/merge.test.ts`

**Interfaces:**
- Consumes: `Mention`, `MergedPerson`, `Evidence` from `src/types.ts`
- Produces: `export function mergeMentions(mentions: Mention[]): MergedPerson[]`
  - Output order: by first appearance in the input.
  - `name`: the name from the first mention in the group.
  - `handles`: unique, lowercased, in first-seen order.
  - `philly`: true when any evidence item is Philly.
  - `evidence`: all items in the group, duplicates by URL removed.
  - `possibleDuplicateOf`: names of other output people whose normalized name matches but who were not merged.
- Name normalization for rule 2: lowercase, trim, collapse internal whitespace. Nothing more. "Jen" and "Jennifer" are different names.

- [ ] **Step 1: Write the failing test `tests/merge.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { mergeMentions } from '../src/merge.js'
import type { Evidence, Mention } from '../src/types.js'

function ev(url: string, over: Partial<Evidence> = {}): Evidence {
  return { url, title: url, excerpt: '', kind: 'built', philly: true, linkedUrls: [], relevance: 1, ...over }
}
function m(name: string, url: string, over: Partial<Evidence> = {}, handle?: string): Mention {
  return { name, handle, evidence: ev(url, over) }
}

describe('mergeMentions', () => {
  it('returns [] for no mentions', () => {
    expect(mergeMentions([])).toEqual([])
  })

  it('merges when one page links to the other (rule 1)', () => {
    const out = mergeMentions([
      m('Ana Ruiz', 'https://talk.example/nfc', { linkedUrls: ['https://ana.dev'] }),
      m('A. Ruiz', 'https://ana.dev'),
    ])
    expect(out).toHaveLength(1)
    expect(out[0]?.name).toBe('Ana Ruiz')
    expect(out[0]?.evidence.map((e) => e.url)).toEqual(['https://talk.example/nfc', 'https://ana.dev'])
  })

  it('merges on a shared handle, ignoring case (rule 1)', () => {
    const out = mergeMentions([
      m('Ana Ruiz', 'https://a.example', {}, 'AnaRuiz'),
      m('Ana R.', 'https://b.example', { philly: false }, 'anaruiz'),
    ])
    expect(out).toHaveLength(1)
    expect(out[0]?.handles).toEqual(['anaruiz'])
    expect(out[0]?.philly).toBe(true)
  })

  it('merges an exact name match when both are Philly (rule 2), ignoring case and spacing', () => {
    const out = mergeMentions([
      m('Ana  Ruiz', 'https://a.example'),
      m('ana ruiz', 'https://b.example'),
    ])
    expect(out).toHaveLength(1)
  })

  it('does not merge the same name when one is not Philly, and flags both', () => {
    const out = mergeMentions([
      m('Ana Ruiz', 'https://a.example', { philly: true }),
      m('Ana Ruiz', 'https://b.example', { philly: false }),
    ])
    expect(out).toHaveLength(2)
    expect(out[0]?.possibleDuplicateOf).toEqual(['Ana Ruiz'])
    expect(out[1]?.possibleDuplicateOf).toEqual(['Ana Ruiz'])
  })

  it('keeps nickname variants separate', () => {
    const out = mergeMentions([m('Jen Smith', 'https://a.example'), m('Jennifer Smith', 'https://b.example')])
    expect(out).toHaveLength(2)
    expect(out[0]?.possibleDuplicateOf).toEqual([])
  })

  it('merges transitively: A links B, B shares a handle with C', () => {
    const out = mergeMentions([
      m('Ana Ruiz', 'https://a.example', { linkedUrls: ['https://b.example'] }),
      m('Ana Ruiz', 'https://b.example', {}, 'anaruiz'),
      m('A. R.', 'https://c.example', { philly: false }, 'anaruiz'),
    ])
    expect(out).toHaveLength(1)
    expect(out[0]?.evidence).toHaveLength(3)
  })

  it('removes duplicate evidence URLs inside a merged person', () => {
    const out = mergeMentions([m('Ana Ruiz', 'https://a.example'), m('Ana Ruiz', 'https://a.example')])
    expect(out[0]?.evidence).toHaveLength(1)
  })

  it('keeps unrelated people separate, in input order', () => {
    const out = mergeMentions([m('Ana Ruiz', 'https://a.example'), m('Bo Chen', 'https://b.example')])
    expect(out.map((p) => p.name)).toEqual(['Ana Ruiz', 'Bo Chen'])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/merge.test.ts` → Expected: FAIL, cannot find module `../src/merge.js`. **Agent stops here and hands over to Waskar.**

- [ ] **Step 3: Waskar writes `src/merge.ts`**

Questions to answer in the code (decide-first material, not hints to copy):
- Rule 1 can chain (A to B to C). What data structure lets you join groups as you discover links, without re-scanning everything? (Search term if stuck: "union-find".)
- Rule 2 only applies when both sides are Philly. Do you check that per mention, or per group after rule 1 has run? What changes if you pick the other one?
- Where does the "flag, do not merge" path live, and how do you avoid flagging a person as a duplicate of themselves?

- [ ] **Step 4: Run the tests until they pass**

Run: `npx vitest run tests/merge.test.ts` → Expected: 9 passed. Then `npm run typecheck` → exit 0.

- [ ] **Step 5: Review, then commit**

Claude reviews `src/merge.ts` and asks Waskar to explain the grouping logic back (explain-before-accept). Then:

```bash
git add src/merge.ts tests/merge.test.ts
git commit -m "feat: merge person mentions by link, handle, and Philly name match"
```

---

### Task 5: `rank.ts` (Waskar writes this, test-first)

Same handover as Task 4.

**Files:**
- Create: `src/rank.ts` (Waskar)
- Test: `tests/rank.test.ts`

**Interfaces:**
- Consumes: `MergedPerson`, `Evidence`, `Candidate`, `ScoreLine` from `src/types.ts`
- Produces:
  - `export const KIND_WEIGHTS: Record<EvidenceKind, number>` = taught 1.0, built 0.7, wrote 0.5, profile 0.3
  - `export function recencyFactor(publishedDate: string | undefined, now: Date): number` — `0.5 ** (ageYears / 2)`; `undefined` or unparseable → 0.5; a future date → 1.0. Use 365.25 days per year.
  - `export function itemStrength(e: Evidence, now: Date): number` — `KIND_WEIGHTS[e.kind] * e.relevance * recencyFactor(e.publishedDate, now)`
  - `export function rankPeople(people: MergedPerson[], opts: { now: Date; limit?: number }): Candidate[]`
    - Drops anyone with zero Philly evidence items (gate checks items, not `person.philly`).
    - Person score: all items sorted by strength descending, multiplied by 1, 1/2, 1/4, ... and summed.
    - `breakdown`: one `ScoreLine` per item in that sorted order; contributions sum to `score`.
    - Sorted by score descending, ties by name ascending. `limit` defaults to 10.
    - Each `Candidate` copies `name`, `handles`, `philly`, `evidence`, and `possibleDuplicateOf` from the `MergedPerson` (the CLI prints the duplicate flag).

- [ ] **Step 1: Write the failing test `tests/rank.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { recencyFactor, itemStrength, rankPeople, KIND_WEIGHTS } from '../src/rank.js'
import type { Evidence, MergedPerson } from '../src/types.js'

const NOW = new Date('2026-10-01T00:00:00Z')

function ev(over: Partial<Evidence> = {}): Evidence {
  return { url: `https://x.example/${Math.random()}`, title: 't', excerpt: '', kind: 'taught', philly: true, linkedUrls: [], relevance: 1, publishedDate: '2026-10-01', ...over }
}
function person(name: string, evidence: Evidence[]): MergedPerson {
  return { name, handles: [], philly: evidence.some((e) => e.philly), evidence, possibleDuplicateOf: [] }
}

describe('recencyFactor', () => {
  it('is 1 for today', () => expect(recencyFactor('2026-10-01', NOW)).toBeCloseTo(1, 3))
  it('halves every 2 years', () => expect(recencyFactor('2024-10-01', NOW)).toBeCloseTo(0.5, 2))
  it('is 0.5 when undated or unparseable', () => {
    expect(recencyFactor(undefined, NOW)).toBe(0.5)
    expect(recencyFactor('not a date', NOW)).toBe(0.5)
  })
  it('is 1 for a future date', () => expect(recencyFactor('2027-01-01', NOW)).toBe(1))
})

describe('itemStrength', () => {
  it('orders kinds taught > built > wrote > profile', () => {
    const s = (['taught', 'built', 'wrote', 'profile'] as const).map((kind) => itemStrength(ev({ kind }), NOW))
    expect(s).toEqual([...s].sort((a, b) => b - a))
    expect(s[0]).toBeCloseTo(KIND_WEIGHTS.taught, 3)
  })
  it('multiplies kind, relevance, and recency', () => {
    expect(itemStrength(ev({ kind: 'built', relevance: 0.5, publishedDate: '2024-10-01' }), NOW)).toBeCloseTo(0.7 * 0.5 * 0.5, 2)
  })
})

describe('rankPeople', () => {
  it('drops a strong person with no Philly evidence', () => {
    const out = rankPeople([person('Remote Star', [ev({ philly: false })]), person('Local', [ev({ kind: 'wrote' })])], { now: NOW })
    expect(out.map((c) => c.name)).toEqual(['Local'])
  })

  it('keeps a person when only one of their items is Philly', () => {
    const out = rankPeople([person('Mixed', [ev({ philly: false }), ev({ philly: true, kind: 'profile' })])], { now: NOW })
    expect(out).toHaveLength(1)
  })

  it('applies diminishing returns: ten weak items do not beat one strong taught item', () => {
    const weak = Array.from({ length: 10 }, () => ev({ kind: 'wrote', relevance: 0.3, publishedDate: undefined }))
    const out = rankPeople([person('Many Weak', weak), person('One Strong', [ev()])], { now: NOW })
    expect(out[0]?.name).toBe('One Strong')
  })

  it('weights items 1, 1/2, 1/4 in strength order, and the breakdown sums to the score', () => {
    const out = rankPeople([person('A', [ev({ kind: 'wrote' }), ev({ kind: 'taught' }), ev({ kind: 'built' })])], { now: NOW })
    const c = out[0]!
    expect(c.breakdown.map((l) => l.multiplier)).toEqual([1, 0.5, 0.25])
    expect(c.breakdown.map((l) => l.kind)).toEqual(['taught', 'built', 'wrote'])
    expect(c.score).toBeCloseTo(1 + 0.7 / 2 + 0.5 / 4, 3)
    expect(c.breakdown.reduce((s, l) => s + l.contribution, 0)).toBeCloseTo(c.score, 6)
  })

  it('sorts by score, breaks ties by name, and caps at the limit', () => {
    const people = ['Cy', 'Al', 'Bo'].map((n) => person(n, [ev()]))
    expect(rankPeople(people, { now: NOW }).map((c) => c.name)).toEqual(['Al', 'Bo', 'Cy'])
    expect(rankPeople(people, { now: NOW, limit: 2 })).toHaveLength(2)
  })

  it('returns [] when nobody passes the gate', () => {
    expect(rankPeople([person('X', [ev({ philly: false })])], { now: NOW })).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/rank.test.ts` → Expected: FAIL, cannot find module. **Agent stops here and hands over to Waskar.**

- [ ] **Step 3: Waskar writes `src/rank.ts`**

Questions to answer in the code:
- Why does the gate check evidence items instead of the merged person's `philly` flag? (They give the same answer today. When would they differ?)
- `now` is a parameter instead of `new Date()` inside the function. What would break in the tests if it were not?
- Why does diminishing returns stop a prolific blogger from outranking someone who taught one workshop? Say it in one sentence for the README.

- [ ] **Step 4: Run the tests until they pass**

Run: `npx vitest run tests/rank.test.ts` → Expected: all pass. `npm run typecheck` → exit 0.

- [ ] **Step 5: Review, then commit**

Claude reviews and asks Waskar to walk through the scoring of the "1 + 0.7/2 + 0.5/4" test by hand. Then:

```bash
git add src/rank.ts tests/rank.test.ts
git commit -m "feat: rank people by evidence strength with a Philly gate and diminishing returns"
```

---

### Task 6: Strategy B (evidence-first)

**Files:**
- Create: `src/strategies/evidence.ts`, `src/parse.ts`
- Test: `tests/parse.test.ts`, `tests/evidence.test.ts`

**Interfaces:**
- Consumes: `createSearcher`, `SearchFn` (Task 3); `mergeMentions` (Task 4); `rankPeople` (Task 5); `tests/fixtures/strategy-b.json` (Task 2)
- Produces:
  - `src/parse.ts`: `export type ExtractedPerson = { name: string; handle?: string; role: 'taught' | 'built' | 'wrote'; url: string; philly: boolean; linkedUrls: string[] }` and `export function parsePeopleOutput(content: unknown): { people: ExtractedPerson[]; dropped: number }`
  - `src/strategies/evidence.ts`: `export const EVIDENCE_QUERIES: (theme: string) => string[]`, `export const SYSTEM_PROMPT: string`, `export const OUTPUT_SCHEMA: object`, `export function evidenceStrategy(search: SearchFn, now?: Date): Strategy`

- [ ] **Step 1: Write the failing parser test `tests/parse.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { parsePeopleOutput } from '../src/parse.js'

const good = { name: 'Ana Ruiz', role: 'taught', url: 'https://a.example', philly: true }

describe('parsePeopleOutput', () => {
  it('accepts a valid object', () => {
    expect(parsePeopleOutput({ people: [good] })).toEqual({ people: [{ ...good, linkedUrls: [] }], dropped: 0 })
  })
  it('accepts the same object as a JSON string', () => {
    expect(parsePeopleOutput(JSON.stringify({ people: [good] })).people).toHaveLength(1)
  })
  it('drops items with a missing url, empty name, or bad role, and counts them', () => {
    const out = parsePeopleOutput({ people: [good, { ...good, url: '' }, { ...good, name: '  ' }, { ...good, role: 'spoke' }] })
    expect(out.people).toHaveLength(1)
    expect(out.dropped).toBe(3)
  })
  it('treats a non-boolean philly as false, not as a drop', () => {
    expect(parsePeopleOutput({ people: [{ ...good, philly: 'yes' }] }).people[0]?.philly).toBe(false)
  })
  it('returns nothing and drops 1 for garbage', () => {
    expect(parsePeopleOutput('not json')).toEqual({ people: [], dropped: 1 })
    expect(parsePeopleOutput({ nope: true })).toEqual({ people: [], dropped: 1 })
  })
})
```

- [ ] **Step 2: Run to verify it fails**, then write `src/parse.ts`

Run: `npx vitest run tests/parse.test.ts` → FAIL. Then:

```ts
export type ExtractedPerson = {
  name: string
  handle?: string
  role: 'taught' | 'built' | 'wrote'
  url: string
  philly: boolean
  linkedUrls: string[]
}

const ROLES = new Set(['taught', 'built', 'wrote'])

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function parsePeopleOutput(content: unknown): { people: ExtractedPerson[]; dropped: number } {
  let value: unknown = content
  if (typeof value === 'string') {
    try { value = JSON.parse(value) } catch { return { people: [], dropped: 1 } }
  }
  if (!isRecord(value) || !Array.isArray(value.people)) return { people: [], dropped: 1 }

  const people: ExtractedPerson[] = []
  let dropped = 0
  for (const item of value.people) {
    if (!isRecord(item)) { dropped++; continue }
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    const url = typeof item.url === 'string' ? item.url.trim() : ''
    const role = item.role
    if (!name || !url || typeof role !== 'string' || !ROLES.has(role)) { dropped++; continue }
    people.push({
      name,
      url,
      role: role as ExtractedPerson['role'],
      handle: typeof item.handle === 'string' && item.handle.trim() ? item.handle.trim() : undefined,
      philly: item.philly === true,
      linkedUrls: Array.isArray(item.linkedUrls) ? item.linkedUrls.filter((u): u is string => typeof u === 'string') : [],
    })
  }
  return { people, dropped }
}
```

`role as ExtractedPerson['role']` is safe: `ROLES.has(role)` checked it on the line above. Run the test → Expected: 5 passed.

- [ ] **Step 3: Write the failing strategy test `tests/evidence.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { evidenceStrategy, EVIDENCE_QUERIES } from '../src/strategies/evidence.js'
import fixture from './fixtures/strategy-b.json' with { type: 'json' }

const NOW = new Date('2026-10-01T00:00:00Z')

describe('evidenceStrategy', () => {
  it('builds 3 queries with no keep/drop words', () => {
    const qs = EVIDENCE_QUERIES('NFC and tap automations')
    expect(qs).toHaveLength(3)
    for (const q of qs) expect(q).not.toMatch(/\b(only|include|exclude|drop|return)\b/i)
  })

  it('runs end to end on the recorded fixture', async () => {
    const run = evidenceStrategy(async () => fixture, NOW)
    const { candidates, stats } = await run('NFC and tap automations')
    expect(stats.calls).toHaveLength(3)
    for (const c of candidates) {
      expect(c.evidence.some((e) => e.philly)).toBe(true)
      expect(c.evidence.length).toBeGreaterThan(0)
    }
  })

  it('drops a cited URL that is not in the results, and counts it', async () => {
    const fake = {
      results: [{ url: 'https://in.example', title: 'In', highlights: ['x'], publishedDate: '2026-01-01' }],
      output: { content: { people: [
        { name: 'Kept', role: 'taught', url: 'https://in.example', philly: true },
        { name: 'Ghost', role: 'taught', url: 'https://not-in-results.example', philly: true },
      ] } },
    }
    const { candidates, stats } = await evidenceStrategy(async () => fake, NOW)('t')
    expect(candidates.map((c) => c.name)).toEqual(['Kept'])
    expect(stats.dropped).toBe(3) // Ghost once per query x 3 queries
  })

  it('survives every query failing', async () => {
    const run = evidenceStrategy(async () => { throw new Error('down') }, NOW, { sleep: async () => {} })
    const { candidates, stats } = await run('t')
    expect(candidates).toEqual([])
    expect(stats.warnings).toHaveLength(4)
    expect(stats.warnings.at(-1)).toBe('No Philadelphia candidates found.')
  })
})
```

The fixture import path assumes `resolveJsonModule` (Task 1). If the "end to end" test finds zero candidates because the fixture has no Philly people, it still passes; read the CLI output in Task 7 for a real check.

- [ ] **Step 4: Run to verify it fails**, then write `src/strategies/evidence.ts`

```ts
import { createSearcher, type SearchFn } from '../exa.js'
import { parsePeopleOutput } from '../parse.js'
import { mergeMentions } from '../merge.js'
import { rankPeople } from '../rank.js'
import type { Evidence, Mention, Strategy } from '../types.js'

export const EVIDENCE_QUERIES = (theme: string): string[] => [
  `${theme} workshop or talk in Philadelphia`,
  `${theme} open source project by a Philadelphia developer`,
  `${theme} blog post or tutorial by a Philadelphia builder`,
]

export const SYSTEM_PROMPT = [
  'Extract the people who did the work shown on each page.',
  'Keep a person only when the page shows they taught, built, or wrote the work.',
  'Set role to taught, built, or wrote to match what the page shows.',
  'Set philly to true only when the page ties the person to Philadelphia.',
  'Set url to the page that shows the work. List outbound links from that page to the person\'s own site or profiles in linkedUrls.',
  'Never guess a name. Omit a person whose name the page does not state.',
].join(' ')

export const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    people: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          handle: { type: 'string' },
          role: { type: 'string', enum: ['taught', 'built', 'wrote'] },
          url: { type: 'string' },
          philly: { type: 'boolean' },
          linkedUrls: { type: 'array', items: { type: 'string' } },
        },
        required: ['name', 'role', 'url', 'philly'],
      },
    },
  },
  required: ['people'],
}

type Result = { url: string; title?: string; highlights?: string[]; publishedDate?: string; score?: number }

function readResults(data: unknown): Result[] {
  if (typeof data !== 'object' || data === null) return []
  const r = (data as { results?: unknown }).results
  return Array.isArray(r) ? r.filter((x): x is Result => typeof x === 'object' && x !== null && typeof (x as Result).url === 'string') : []
}

function readContent(data: unknown): unknown {
  if (typeof data !== 'object' || data === null) return undefined
  const out = (data as { output?: { content?: unknown } }).output
  return out?.content
}

export function evidenceStrategy(
  search: SearchFn,
  now: Date = new Date(),
  searcherOpts: Parameters<typeof createSearcher>[1] = {},
): Strategy {
  return async (theme) => {
    const searcher = createSearcher(search, searcherOpts)
    const mentions: Mention[] = []
    const warnings: string[] = []
    let dropped = 0

    for (const query of EVIDENCE_QUERIES(theme)) {
      const res = await searcher.search(query, {
        type: 'auto',
        systemPrompt: SYSTEM_PROMPT,
        outputSchema: OUTPUT_SCHEMA,
        contents: { highlights: true },
      })
      if (!res.ok) { warnings.push(`Query failed after retries, skipped: "${query}" (${res.error})`); continue }

      const results = readResults(res.data)
      const byUrl = new Map(results.map((r, i) => [r.url, { r, i }]))
      const parsed = parsePeopleOutput(readContent(res.data))
      dropped += parsed.dropped

      for (const p of parsed.people) {
        const hit = byUrl.get(p.url)
        if (!hit) { dropped++; continue }
        const relevance = typeof hit.r.score === 'number' ? hit.r.score : 1 - hit.i / results.length
        const evidence: Evidence = {
          url: p.url,
          title: hit.r.title ?? p.url,
          excerpt: hit.r.highlights?.[0] ?? '',
          kind: p.role,
          publishedDate: hit.r.publishedDate,
          philly: p.philly,
          linkedUrls: p.linkedUrls,
          relevance,
        }
        mentions.push({ name: p.name, handle: p.handle, evidence })
      }
    }

    const candidates = rankPeople(mergeMentions(mentions), { now })
    if (candidates.length === 0) warnings.push('No Philadelphia candidates found.')
    return { candidates, stats: { calls: searcher.calls, dropped, warnings } }
  }
}
```

Two checks against Task 2's notes before running: (1) if `output.content` is a string, `parsePeopleOutput` already handles it; (2) if results carry no `score`, the `1 - rank/N` fallback applies, as the spec says. The third parameter lets tests skip the real retry delays.

- [ ] **Step 5: Run the tests**

Run: `npm test` → Expected: all pass. `npm run typecheck` → exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/parse.ts src/strategies/evidence.ts tests/parse.test.ts tests/evidence.test.ts
git commit -m "feat: add evidence-first strategy with schema extraction and grounding checks"
```

---

### Task 7: Strategy A (people category) and the CLI

**Files:**
- Create: `src/strategies/profiles.ts`, `src/render.ts`, `src/cli.ts`
- Test: `tests/profiles.test.ts`, `tests/render.test.ts`

**Interfaces:**
- Consumes: Tasks 3 to 6; `tests/fixtures/strategy-a.json`
- Produces:
  - `export function profilesStrategy(search: SearchFn, now?: Date): Strategy`
  - `export function nameFromTitle(title: string): string` — text before the first ` - `, ` | `, or ` – `, trimmed
  - `export function renderMarkdown(theme: string, strategy: 'a' | 'b', result: StrategyResult): string`
  - CLI: `npm run scout -- "<theme>" [--strategy a|b]` (default `b`), prints markdown to stdout, warnings to stderr

- [ ] **Step 1: Write the failing tests**

`tests/profiles.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { profilesStrategy, nameFromTitle } from '../src/strategies/profiles.js'
import fixture from './fixtures/strategy-a.json' with { type: 'json' }

describe('nameFromTitle', () => {
  it('takes the name before a separator', () => {
    expect(nameFromTitle('Ana Ruiz - Creative Technologist | LinkedIn')).toBe('Ana Ruiz')
    expect(nameFromTitle('Bo Chen | Portfolio')).toBe('Bo Chen')
    expect(nameFromTitle('Cy Diaz')).toBe('Cy Diaz')
  })
})

describe('profilesStrategy', () => {
  it('makes one call with category people and returns only Philly candidates', async () => {
    let seen: Record<string, unknown> = {}
    const run = profilesStrategy(async (_q, opts) => { seen = opts; return fixture })
    const { candidates, stats } = await run('NFC and tap automations')
    expect(seen.category).toBe('people')
    expect(stats.calls).toHaveLength(1)
    for (const c of candidates) expect(c.evidence.every((e) => e.kind === 'profile')).toBe(true)
  })
})
```

`tests/render.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { renderMarkdown } from '../src/render.js'

describe('renderMarkdown', () => {
  it('prints the no-candidates line plainly', () => {
    const md = renderMarkdown('t', 'b', { candidates: [], stats: { calls: [], dropped: 0, warnings: [] } })
    expect(md).toContain('No Philadelphia candidates found.')
  })
  it('prints rank, name, score, evidence links, dropped count, and cost', () => {
    const md = renderMarkdown('NFC', 'b', {
      candidates: [{ name: 'Ana Ruiz', handles: [], philly: true, score: 1.234, possibleDuplicateOf: [],
        breakdown: [{ url: 'https://a.example', kind: 'taught', kindWeight: 1, relevance: 1, recency: 1, strength: 1, multiplier: 1, contribution: 1 }],
        evidence: [{ url: 'https://a.example', title: 'NFC night', excerpt: 'Ana led...', kind: 'taught', philly: true, linkedUrls: [], relevance: 1 }] }],
      stats: { calls: [{ query: 'q', ok: true, attempts: 1, costDollars: 0.0123, ms: 900 }], dropped: 2, warnings: [] },
    })
    expect(md).toContain('1. **Ana Ruiz**')
    expect(md).toContain('1.23')
    expect(md).toContain('https://a.example')
    expect(md).toContain('Dropped: 2')
    expect(md).toContain('$0.0123')
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test` → Expected: FAIL on the two new files.

- [ ] **Step 3: Write `src/strategies/profiles.ts`**

```ts
import { createSearcher, type SearchFn } from '../exa.js'
import { mergeMentions } from '../merge.js'
import { rankPeople } from '../rank.js'
import type { Mention, Strategy } from '../types.js'

const PHILLY = /\b(philadelphia|philly)\b/i

export function nameFromTitle(title: string): string {
  return (title.split(/ [-|–] /)[0] ?? title).trim()
}

type Result = { url: string; title?: string; highlights?: string[]; publishedDate?: string; score?: number }

export function profilesStrategy(search: SearchFn, now: Date = new Date()): Strategy {
  return async (theme) => {
    const searcher = createSearcher(search)
    const warnings: string[] = []
    const res = await searcher.search(`${theme} Philadelphia`, { type: 'auto', category: 'people', contents: { highlights: true } })
    const mentions: Mention[] = []
    if (!res.ok) {
      warnings.push(`Query failed after retries, skipped (${res.error})`)
    } else {
      const raw = (res.data as { results?: unknown }).results
      const results = Array.isArray(raw) ? (raw as Result[]).filter((r) => typeof r?.url === 'string') : []
      results.forEach((r, i) => {
        const text = `${r.title ?? ''} ${(r.highlights ?? []).join(' ')}`
        mentions.push({
          name: nameFromTitle(r.title ?? r.url),
          handle: r.url,
          evidence: {
            url: r.url, title: r.title ?? r.url, excerpt: r.highlights?.[0] ?? '', kind: 'profile',
            publishedDate: r.publishedDate, philly: PHILLY.test(text), linkedUrls: [],
            relevance: typeof r.score === 'number' ? r.score : 1 - i / results.length,
          },
        })
      })
    }
    const candidates = rankPeople(mergeMentions(mentions), { now })
    if (candidates.length === 0) warnings.push('No Philadelphia candidates found.')
    return { candidates, stats: { calls: searcher.calls, dropped: 0, warnings } }
  }
}
```

- [ ] **Step 4: Write `src/render.ts`**

```ts
import type { StrategyResult } from './types.js'

export function renderMarkdown(theme: string, strategy: 'a' | 'b', result: StrategyResult): string {
  const { candidates, stats } = result
  const cost = stats.calls.reduce((s, c) => s + c.costDollars, 0)
  const ms = stats.calls.reduce((s, c) => s + c.ms, 0)
  const lines = [`# patch-scout: ${theme}`, '', `Strategy ${strategy.toUpperCase()} · ${stats.calls.length} calls · $${cost.toFixed(4)} · ${(ms / 1000).toFixed(1)}s · Dropped: ${stats.dropped}`, '']
  if (candidates.length === 0) {
    lines.push('No Philadelphia candidates found.')
    return lines.join('\n')
  }
  candidates.forEach((c, i) => {
    const dup = c.possibleDuplicateOf.length ? ` _(possible duplicate of ${c.possibleDuplicateOf.join(', ')})_` : ''
    lines.push(`${i + 1}. **${c.name}** · score ${c.score.toFixed(2)}${dup}`)
    for (const l of c.breakdown) lines.push(`   - ${l.kind} · ${l.contribution.toFixed(2)} · ${l.url}`)
  })
  return lines.join('\n')
}
```

- [ ] **Step 5: Write `src/cli.ts`**

```ts
import 'dotenv/config'
import { defaultSearchFn } from './exa.js'
import { evidenceStrategy } from './strategies/evidence.js'
import { profilesStrategy } from './strategies/profiles.js'
import { renderMarkdown } from './render.js'

const args = process.argv.slice(2)
const flag = args.indexOf('--strategy')
const strategy = flag >= 0 ? args[flag + 1] : 'b'
const theme = args.filter((_, i) => i !== flag && i !== flag + 1).join(' ').trim()

if (!theme || (strategy !== 'a' && strategy !== 'b')) {
  console.error('Usage: npm run scout -- "<theme>" [--strategy a|b]')
  process.exit(1)
}

const search = defaultSearchFn()
const run = strategy === 'a' ? profilesStrategy(search) : evidenceStrategy(search)
const result = await run(theme)
for (const w of result.stats.warnings) console.error(`warning: ${w}`)
console.log(renderMarkdown(theme, strategy, result))
```

- [ ] **Step 6: Run tests, then one live run**

Run: `npm test` → all pass. `npm run typecheck` → exit 0.
Run: `npm run scout -- "NFC and tap automations"` → Expected: a ranked markdown list (or the no-candidates line), cost under $0.10.
Run without a key: `EXA_API_KEY= npm run scout -- "x"` → Expected: the one-line setup message, exit 1.

- [ ] **Step 7: Commit**

```bash
git add src/strategies/profiles.ts src/render.ts src/cli.ts tests/profiles.test.ts tests/render.test.ts
git commit -m "feat: add people-category baseline and the scout CLI"
```

---

### Task 8: Pooled eval

**Files:**
- Create: `eval/themes.ts`, `eval/csv.ts`, `eval/metrics.ts`, `eval/pool.ts`, `eval/score.ts`
- Test: `tests/csv.test.ts`, `tests/metrics.test.ts`

**Interfaces:**
- Produces:
  - `eval/themes.ts`: `export const THEMES = ['sound-reactive visuals', 'NFC and tap automations', 'voice agents']`
  - `eval/csv.ts`: `export function toCsv(rows: string[][]): string`, `export function parseCsv(text: string): string[][]`
  - `eval/metrics.ts`: `export function methodMetrics(input: { topNames: string[]; yes: Set<string>; allYes: Set<string> }): { precisionAt10: number; relativeRecall: number; returned: number }`
  - `npm run eval:pool` writes `eval/out/judgments.csv` (columns `theme,id,name,evidence,label`, label empty, rows shuffled) and `eval/out/pool.json` (which method found each id, plus per-run cost and latency). Both are git-ignored.
  - `npm run eval:score` reads both and prints the results table.

Rules: names are pooled per theme after normalization (lowercase, trim, collapse spaces). `?` and empty labels count as not relevant. Precision@10 divides by 10, not by the number returned, so a method that returns 4 people cannot score 100%; `returned` is printed next to it. Relative recall = this method's `yes` people / all `yes` people for that theme. Both are averaged over themes.

- [ ] **Step 1: Write the failing tests**

`tests/csv.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { toCsv, parseCsv } from '../eval/csv.js'

describe('csv', () => {
  it('round-trips commas, quotes, and newlines', () => {
    const rows = [['a', 'b,c', 'say "hi"', 'line1\nline2']]
    expect(parseCsv(toCsv(rows))).toEqual(rows)
  })
})
```

`tests/metrics.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { methodMetrics } from '../eval/metrics.js'

describe('methodMetrics', () => {
  it('divides precision by 10 and recall by all yes people', () => {
    const r = methodMetrics({ topNames: ['a', 'b', 'c', 'd'], yes: new Set(['a', 'b']), allYes: new Set(['a', 'b', 'x', 'y']) })
    expect(r).toEqual({ precisionAt10: 0.2, relativeRecall: 0.5, returned: 4 })
  })
  it('handles no yes people at all', () => {
    expect(methodMetrics({ topNames: [], yes: new Set(), allYes: new Set() })).toEqual({ precisionAt10: 0, relativeRecall: 0, returned: 0 })
  })
})
```

- [ ] **Step 2: Run to verify they fail**, then write `eval/csv.ts` and `eval/metrics.ts`

```ts
// eval/csv.ts
export function toCsv(rows: string[][]): string {
  const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  return rows.map((r) => r.map(cell).join(',')).join('\n') + '\n'
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
    else cell += ch
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows
}
```

```ts
// eval/metrics.ts
export function methodMetrics(input: { topNames: string[]; yes: Set<string>; allYes: Set<string> }) {
  const found = input.topNames.filter((n) => input.yes.has(n)).length
  return {
    precisionAt10: found / 10,
    relativeRecall: input.allYes.size === 0 ? 0 : found / input.allYes.size,
    returned: input.topNames.length,
  }
}
```

Run: `npm test` → all pass.

- [ ] **Step 3: Write `eval/themes.ts`**

```ts
export const THEMES = ['sound-reactive visuals', 'NFC and tap automations', 'voice agents']
```

- [ ] **Step 4: Write `eval/pool.ts`**

```ts
import 'dotenv/config'
import { mkdirSync, writeFileSync } from 'node:fs'
import { defaultSearchFn } from '../src/exa.js'
import { evidenceStrategy } from '../src/strategies/evidence.js'
import { profilesStrategy } from '../src/strategies/profiles.js'
import { THEMES } from './themes.js'
import { toCsv } from './csv.js'

const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ')
const search = defaultSearchFn()
const methods = { a: profilesStrategy(search), b: evidenceStrategy(search) }

type PoolEntry = { theme: string; id: string; name: string; evidence: string[]; foundBy: ('a' | 'b')[] }
const pool: PoolEntry[] = []
const runs: { theme: string; method: string; costDollars: number; seconds: number; returned: number; topNames: string[] }[] = []

for (const theme of THEMES) {
  const byName = new Map<string, PoolEntry>()
  for (const [method, run] of Object.entries(methods) as ['a' | 'b', typeof methods.a][]) {
    const started = Date.now()
    const { candidates, stats } = await run(theme)
    const top = candidates.slice(0, 10)
    runs.push({
      theme, method,
      costDollars: stats.calls.reduce((s, c) => s + c.costDollars, 0),
      seconds: (Date.now() - started) / 1000,
      returned: top.length,
      topNames: top.map((c) => norm(c.name)),
    })
    for (const w of stats.warnings) console.error(`[${theme}/${method}] ${w}`)
    for (const c of top) {
      const key = norm(c.name)
      const entry = byName.get(key) ?? { theme, id: '', name: c.name, evidence: [], foundBy: [] }
      entry.foundBy.push(method)
      for (const e of c.evidence) if (!entry.evidence.includes(e.url)) entry.evidence.push(e.url)
      byName.set(key, entry)
    }
  }
  pool.push(...byName.values())
}

// Shuffle so the labeler cannot tell which method found whom.
for (let i = pool.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1))
  ;[pool[i], pool[j]] = [pool[j]!, pool[i]!]
}
pool.forEach((p, i) => { p.id = String(i + 1) })

mkdirSync('eval/out', { recursive: true })
writeFileSync('eval/out/judgments.csv', toCsv([['theme', 'id', 'name', 'evidence', 'label'], ...pool.map((p) => [p.theme, p.id, p.name, p.evidence.join(' '), ''])]))
writeFileSync('eval/out/pool.json', JSON.stringify({ pool, runs }, null, 2))
console.log(`Wrote ${pool.length} rows to eval/out/judgments.csv. Label each row yes / no / ?.`)
```

- [ ] **Step 5: Write `eval/score.ts`**

```ts
import { readFileSync } from 'node:fs'
import { parseCsv } from './csv.js'
import { methodMetrics } from './metrics.js'
import { THEMES } from './themes.js'

const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ')
const [header, ...rows] = parseCsv(readFileSync('eval/out/judgments.csv', 'utf8'))
const col = (name: string) => header!.indexOf(name)
const { runs } = JSON.parse(readFileSync('eval/out/pool.json', 'utf8')) as {
  runs: { theme: string; method: string; costDollars: number; seconds: number; returned: number; topNames: string[] }[]
}

const unlabeled = rows.filter((r) => !(r[col('label')] ?? '').trim()).length
if (unlabeled) console.error(`warning: ${unlabeled} rows have no label; they count as not relevant.`)

const lines = ['| Method | Precision@10 | Relative recall | Avg returned | $ / theme | s / theme |', '|---|---|---|---|---|---|']
for (const method of ['a', 'b']) {
  const per = THEMES.map((theme) => {
    const yes = new Set(rows.filter((r) => r[col('theme')] === theme && r[col('label')]?.trim().toLowerCase() === 'yes').map((r) => norm(r[col('name')] ?? '')))
    const run = runs.find((x) => x.theme === theme && x.method === method)!
    return { ...methodMetrics({ topNames: run.topNames, yes, allYes: yes }), cost: run.costDollars, s: run.seconds }
  })
  const avg = (f: (x: (typeof per)[number]) => number) => per.reduce((s, x) => s + f(x), 0) / per.length
  const label = method === 'a' ? 'A: people category' : 'B: evidence-first'
  lines.push(`| ${label} | ${(avg((x) => x.precisionAt10) * 100).toFixed(0)}% | ${(avg((x) => x.relativeRecall) * 100).toFixed(0)}% | ${avg((x) => x.returned).toFixed(1)} | $${avg((x) => x.cost).toFixed(4)} | ${avg((x) => x.s).toFixed(1)} |`)
}
console.log(lines.join('\n'))
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npm test` → all pass. `npm run typecheck` → exit 0.

- [ ] **Step 7: Commit**

```bash
git add eval/ tests/csv.test.ts tests/metrics.test.ts
git commit -m "feat: add pooled eval with blind labeling and a results table"
```

---

### Task 9: Live eval and README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Run the pool**

Run: `npm run eval:pool` → Expected: "Wrote N rows to eval/out/judgments.csv". 6 strategy runs, under $1 in total.

- [ ] **Step 2: Waskar labels** each row of `eval/out/judgments.csv` as `yes`, `no`, or `?` (about 20 minutes). Open the evidence links. `yes` = "I would invite this person to teach this theme at a PATCH night."

- [ ] **Step 3: Score**

Run: `npm run eval:score` → copy the table into the README exactly as printed, whichever method wins.

- [ ] **Step 4: Write `README.md`**

Sections, in this order:
1. **What it does** (two sentences) and the PATCH problem it solves.
2. **Quick start:** `npm install`, copy `.env.example` to `.env`, `npm run scout -- "NFC and tap automations"`.
3. **How it works:** strategy B in five numbered steps (search for work, extract people with `outputSchema`, check each cited URL against the results, merge, rank), and why A is the baseline.
4. **Results:** the table from Step 3, unedited.
5. **Design decisions:** the merge rule order and why a wrong merge is worse than a missed one; the ranking weights are stated guesses that the eval tests; one sentence on diminishing returns (from Task 5, Step 3).
6. **Limits:** 3 themes, one judge, relative recall only, weights not tuned.
7. **Next steps:** strategy C on the Agent API (`/agent`), which Exa recommends for list-building; a web page on Vercel; more themes and judges; probabilistic record linkage.

No example output with real names unless Waskar approves it. No `judgments.csv` content.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: add README with eval results and limits"
```

---

### Task 10: Ship (Tue 10/6)

- [ ] **Step 1: Pre-publish check**

Run: `git ls-files | grep -E 'judgments|eval/out|runs/|\.env$'` → Expected: no output.
Run: `git log -p | grep -n -E "EXA_API_KEY=.+"` → Expected: no output.
Waskar opens `tests/fixtures/strategy-a.json` and `strategy-b.json` and decides: keep as recorded, or replace real names with placeholders before going public. Commit any change.

- [ ] **Step 2: Waskar creates the public repo and pushes**

```bash
gh repo create traksaw/patch-scout --public --source=. --remote=origin --description "Find Philadelphia people who can teach a PATCH night theme, using the Exa API"
git push -u origin main
```

Agents do not run this step.
