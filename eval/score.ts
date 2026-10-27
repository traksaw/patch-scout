// Label rule for judgments.csv:
// yes = the evidence link shows them doing the theme (built it, taught it, performed it,
// spoke on it). A matching job title or skills list alone is no.
import { readFileSync } from 'node:fs'
import { normalizeName } from '../src/merge.js'
import { parseCsv } from './csv.js'
import { methodMetrics, summarize, formatRange } from './metrics.js'
import { THEMES } from './themes.js'

type RunRecord = { theme: string; method: 'a' | 'b'; costDollars: number; seconds: number; returned: number; topNames: string[], round: number }

const [header, ...rows] = parseCsv(readFileSync('eval/out/judgments.csv', 'utf8'))
if (!header) throw new Error('judgments.csv is empty. Run npm run eval:pool first.')
const col = (name: string) => header.indexOf(name)
const { runs } = JSON.parse(readFileSync('eval/out/pool.json', 'utf8')) as { runs: RunRecord[] }

const unlabeled = rows.filter((r) => !r[col('label')]?.trim()).length
if (unlabeled) console.error(`warning: ${unlabeled} rows have no label; they count as not relevant.`)
const isYes = (r: string[]) => r[col('label')]?.trim().toLowerCase() === 'yes'
const avg = (nums: number[]) => nums.reduce((a, c) => a + c, 0) / nums.length
const rounds = [... new Set(runs.map((r) => r.round))]
const results = (['a', 'b'] as const).map((method) => {
    const perRound = rounds.map((round) => {
        const perTheme = THEMES.map((theme) => {
            const yes = new Set(rows.filter((r) => theme === r[0] && isYes(r)).map((r) => normalizeName(r[col('name')] ?? '')))
            const run = runs.find((x) => x.method === method && x.theme === theme && x.round === round)
            if (!run) throw new Error(`pool.json has no run for ${theme}/${method}. Run npm run eval:pool again.`)
            return { ...methodMetrics({ topNames: run.topNames, yes, allYes: yes }), cost: run.costDollars, seconds: run.seconds }
        })
        return perTheme
    })

    return { method, perRound }
})

const lines = ['| Method | Precision@10 | Avg returned | Relative recall | $ / theme | s / theme | ', '|---|---|---|---|---|---|']
for (const r of results) {
    const label = r.method === 'a' ? 'A: people category' : 'B: evidence-first'

    // for one column: average the themes in each round, then summarize the rounds
    const perRoundAvg = (pick: (t: (typeof r.perRound)[0][0]) => number) =>
        summarize(r.perRound.map((themes) => avg(themes.map(pick))))

    const precision = perRoundAvg((t) => t.precisionAt10)
    const returned = perRoundAvg((t) => t.returned)
    const recall = perRoundAvg((t) => t.relativeRecall)
    const cost = perRoundAvg((t) => t.cost)
    const seconds = perRoundAvg((t) => t.seconds)

    lines.push(`| ${label} | ${formatRange(precision, 'percent')} | ${formatRange(returned, 'number')} | ${formatRange(recall, 'percent')} | $${cost.mean.toFixed(4)} | ${formatRange(seconds, 'number')} |`)
}

console.log(lines.join('\n'))
