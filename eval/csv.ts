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
        else if (ch === ',') {
            row.push(cell)
            cell = ''
        }
        else if (ch === '\n') {
            row.push(cell)
            cell = ''
            rows.push(row)
            row = []
        }
        else cell += ch
    }
    if (cell !== '' || row.length) {
        row.push(cell)
        rows.push(row)
    }
    return rows
}
