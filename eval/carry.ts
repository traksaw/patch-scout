// Copy labels from an older judgments.csv into the new one.
// A label carries over only when theme, name, and evidence links all match,
// because the label rule judges the link, not the person.
// Usage: npm run eval:carry -- <old judgments.csv>
import { readFileSync, writeFileSync } from 'node:fs'
import { normalizeName } from '../src/merge.js'
import { parseCsv, toCsv } from './csv.js'

const NEW = 'eval/out/judgments.csv'
const oldPath = process.argv[2]
if (!oldPath) throw new Error('Pass the old judgments.csv, e.g. npm run eval:carry -- eval/out-2026-10-10/judgments.csv')

// Same links in any order count as the same evidence.
const key = (theme: string, name: string, evidence: string) =>
    [theme.trim(), normalizeName(name), evidence.split(/\s+/).filter(Boolean).sort().join(' ')].join('|')

const read = (path: string) => {
    const [header, ...rows] = parseCsv(readFileSync(path, 'utf8'))
    if (!header) throw new Error(`${path} is empty.`)
    const col = (name: string) => {
        const i = header.indexOf(name)
        if (i === -1) throw new Error(`${path} has no "${name}" column.`)
        return i
    }
    return { header, rows, theme: col('theme'), name: col('name'), evidence: col('evidence'), label: col('label') }
}

const old = read(oldPath)
const oldLabels = new Map<string, string>()
for (const r of old.rows) {
    const label = r[old.label]?.trim() ?? ''
    if (label) oldLabels.set(key(r[old.theme] ?? '', r[old.name] ?? '', r[old.evidence] ?? ''), label)
}

const now = read(NEW)
let copied = 0
for (const r of now.rows) {
    if (r[now.label]?.trim()) continue // never overwrite a label already typed in the new file
    const label = oldLabels.get(key(r[now.theme] ?? '', r[now.name] ?? '', r[now.evidence] ?? ''))
    if (label) { r[now.label] = label; copied++ }
}

// A leading space ends the link before the label, so cmd+click opens only the URL.
// score.ts trims labels, so the space does not change any result.
for (const r of now.rows) r[now.label] = ` ${r[now.label]?.trim() ?? ''}`

writeFileSync(NEW, toCsv([now.header, ...now.rows]))
const left = now.rows.filter((r) => !r[now.label]?.trim()).length
console.log(`Copied ${copied} labels. ${left} of ${now.rows.length} rows still need a label in ${NEW}.`)
