import 'dotenv/config'
import { mkdirSync, writeFileSync } from 'node:fs'
import { defaultSearchFn } from '../src/exa.js'
import { normalizeName } from '../src/merge.js'
import { evidenceStrategy } from '../src/strategies/evidence.js'
import { profilesStrategy } from '../src/strategies/profiles.js'
import { THEMES } from './themes.js'
import { toCsv } from './csv.js'
import { parseRounds } from './args.js'

const search = defaultSearchFn()
const methods = { a: profilesStrategy(search), b: evidenceStrategy(search) }

type Method = keyof typeof methods // 'a' | 'b'
type PoolEntry = { theme: string; id: string; name: string; evidence: string[]; foundBy: Method[] }
type RunRecord = { theme: string; method: Method; costDollars: number; seconds: number; returned: number; topNames: string[]; round: number }

const pool: PoolEntry[] = []
const runs: RunRecord[] = []
const byName = new Map<string, PoolEntry>()
const ROUNDS = parseRounds(process.argv.slice(2))

for (let round = 1; round <= ROUNDS; round++) {
    for (const theme of THEMES) {
        for (const method of ['a', 'b'] as const) {
            const started = Date.now()
            const { candidates, stats } = await methods[method](theme)
            const seconds = (Date.now() - started) / 1000
            const top = candidates.slice(0, 10) // the first 10 candidates
            runs.push({
                round,
                theme, method, seconds,
                costDollars: stats.calls.reduce((a, c) => a + c.costDollars, 0), // the sum of costDollars over stats.calls
                returned: top.length,    // how many people are in top
                topNames: top.map((candidate) => normalizeName(candidate.name))    // the normalized name of each person in top
            })
            for (const w of stats.warnings) console.error(`[${theme}/${method}] ${w}`)
            for (const c of top) {
                const key = `${theme}|${normalizeName(c.name)}`
                const entry = byName.get(key) ?? { theme, id: '', name: c.name, evidence: [], foundBy: [] }
                if (!entry.foundBy.includes(method)) entry.foundBy.push(method)
                for (const e of c.evidence) if (!entry.evidence.includes(e.url)) entry.evidence.push(e.url)
                byName.set(key, entry)
            }
        }
    }

}
pool.push(...byName.values())
// Shuffle so the labeler cannot tell which method found whom.
for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
        ;[pool[i], pool[j]] = [pool[j]!, pool[i]!]
}
pool.forEach((p, i) => { p.id = String(i + 1) })

mkdirSync('eval/out', { recursive: true })
const header = ['theme', 'id', 'name', 'evidence', 'label']
const lines = pool.map((p) => {
    return [p.theme, p.id, p.name, p.evidence.join(' '), '']
})
writeFileSync('eval/out/judgments.csv', toCsv([header, ...lines]))
writeFileSync('eval/out/pool.json', JSON.stringify({ pool, runs }, null, 2))
console.log(`Wrote ${pool.length} rows to eval/out/judgments.csv. Label each row yes / no / ?.`)
