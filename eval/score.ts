// Label rule for judgments.csv:
// yes = the evidence link shows them doing the theme (built it, taught it, performed it,
// spoke on it). A matching job title or skills list alone is no.
import { readFileSync } from 'node:fs'
import { normalizeName } from '../src/merge.js'
import { parseCsv } from './csv.js'
import { methodMetrics, summarize, formatRange } from './metrics.js'
import { THEMES } from './themes.js'

type RunRecord = { theme: string; method: 'a' | 'b'; costDollars: number; seconds: number; returned: number; topNames: string[], round: number }

type Round = { rows: string[][]; col: (name: string) => number; runs: RunRecord[] }

function loadDir(dir: string) {
    const [header, ...rows] = parseCsv(readFileSync(`${dir}/judgments.csv`, 'utf8'))
    if (!header) throw new Error(`${dir}/judgments.csv is empty.`)
    const col = (name: string) => header.indexOf(name)
    const { runs } = JSON.parse(readFileSync(`${dir}/pool.json`, 'utf8')) as { runs: RunRecord[] }
    const unlabeled = rows.filter((r) => !r[col('label')]?.trim()).length
    if (unlabeled) console.error(`warning: ${dir}: ${unlabeled} rows have no label; they count as not relevant.`)
    return { rows, col, runs }
}

const dirs = process.argv.slice(2)
const rounds: Round[] = dirs.length
    ? dirs.map((dir) => {
        const d = loadDir(dir)
        const first = Math.min(...d.runs.map((r) => r.round))
        return { ...d, runs: d.runs.filter((r) => r.round === first) }      // blank 1: keep only the first round
    })
    : (() => {
        const d = loadDir('eval/out')
        return [...new Set(d.runs.map((r) => r.round))].map((round) => ({ ...d, runs: d.runs.filter((r) => r.round === round) }))
    })()

const results = (['a', 'b'] as const).map((method) => {
    const perRound = rounds.map((round) => {
        const perTheme = THEMES.map((theme) => {
            const isYes = (r: string[]) => r[round.col('label')]?.trim().toLowerCase() === 'yes'
            const yes = new Set(round.rows.filter((r) => theme === r[0] && isYes(r)).map((r) => normalizeName(r[round.col('name')] ?? '')))
            const run = round.runs.find((x) => x.method === method && x.theme === theme)
            if (!run) throw new Error(`pool.json has no run for ${theme}/${method}. Run npm run eval:pool again.`)
            return { ...methodMetrics({ topNames: run.topNames, yes, allYes: yes }), cost: run.costDollars, seconds: run.seconds }
        })
        return perTheme
    })

    return { method, perRound }
})

const lines = ['| Method | Precision@10 | Share correct | Avg returned | Relative recall | $ / theme | s / theme | ', '|---|---|---|---|---|---|---|']
for (const r of results) {
    const label = r.method === 'a' ? 'A: people category' : 'B: evidence-first'
        // share of returned names that are correct: pooled across the themes in each round, then summarized
    const shareCorrect = summarize(r.perRound.map((themes) => {
        const returned = themes.reduce((sum, t) => sum + t.returned, 0)
        const found = themes.reduce((sum, t) => sum + t.found, 0)
        return returned === 0 ? 0 : found / returned
    }))


    // for one column: average the themes in each round, then summarize the rounds
    const avg = (nums: number[]) => nums.reduce((a, c) => a + c, 0) / nums.length
    const perRoundAvg = (pick: (t: (typeof r.perRound)[0][0]) => number) =>
        summarize(r.perRound.map((themes) => avg(themes.map(pick))))

    const precision = perRoundAvg((t) => t.precisionAt10)
    const returned = perRoundAvg((t) => t.returned)
    const recall = perRoundAvg((t) => t.relativeRecall)
    const cost = perRoundAvg((t) => t.cost)
    const seconds = perRoundAvg((t) => t.seconds)

    lines.push(`| ${label} | ${formatRange(precision, 'percent')} | ${formatRange(shareCorrect, 'percent')} | ${formatRange(returned, 'number')} | ${formatRange(recall, 'percent')} | $${cost.mean.toFixed(4)} | ${formatRange(seconds, 'number')} |`)
}

console.log(lines.join('\n'))
