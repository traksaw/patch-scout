// Save today's labeled pool to eval/days/<local date>, so the next eval:pool cannot overwrite it.
// Refuses while any label is blank or not exactly yes / no.
// Usage: npm run eval:save
import { cpSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { parseCsv } from './csv.js'

// The local calendar date. toISOString() would give the UTC date, which is already tomorrow in the evening.
export function localDate(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Names of rows whose label is not exactly yes or no.
export function unfinishedRows(rows: string[][]): string[] {
    const [header, ...body] = rows
    const label = header?.indexOf('label') ?? -1
    const name = header?.indexOf('name') ?? -1
    return body
        .filter((r) => !['yes', 'no'].includes((r[label] ?? '').trim().toLowerCase()))
        .map((r) => r[name] ?? '')
}

// Run only from the command line, not when a test imports this file.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    const unfinished = unfinishedRows(parseCsv(readFileSync('eval/out/judgments.csv', 'utf8')))
    if (unfinished.length) {
        console.error(`Not saved: ${unfinished.length} rows need a yes or no label: ${unfinished.join(', ')}`)
        process.exit(1)
    }
    const dir = `eval/days/${localDate(new Date())}`
    cpSync('eval/out', dir, { recursive: true })
    console.log(`Saved eval/out to ${dir}.`)
}
