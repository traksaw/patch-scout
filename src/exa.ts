import { Exa } from 'exa-js'
import type { CallRecord } from './types.js'

export interface SearchFn {
  (query: string, options: Record<string, unknown>): Promise<unknown>
}
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
