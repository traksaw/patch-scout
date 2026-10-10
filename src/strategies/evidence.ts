import { isRecord, parsePeopleOutput } from '../parse.js'
import { createSearcher, type SearchFn } from '../exa.js'
import { mergeMentions } from '../merge.js'
import { rankPeople } from '../rank.js'
import type { Mention, Evidence, Strategy, Result } from '../types.js'

export const EVIDENCE_QUERIES = (theme: string): string[] => {
    return [`${theme} workshop or talk in Philadelphia`,
    `${theme} open source project by a Philadelphia developer`,
    `${theme} blog post or tutorial by a Philadelphia builder`]
}

export const SYSTEM_PROMPT = [
    'Extract the people who did the work shown on each page.',
    'Keep a person only when the page shows they taught, built, or wrote the work.',
    'Set role to taught, built, or wrote to match what the page shows.',
    'Set philly to true only when the page ties the person to Philadelphia.',
    "Set url to the page that shows the work. List outbound links from that page to the person's own site or profiles in linkedUrls.",
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

export function readResults(data: unknown): Result[] {
    if (!isRecord(data) || !Array.isArray(data.results)) return [] // return an empty array if data isn't a record or data isnt an array
    return data.results.filter((x): x is Result => isRecord(x) && typeof x.url === 'string' && x.url !== '')
}

function readContent(data: unknown): unknown {
    if (!isRecord(data)) return undefined
    if (!isRecord(data.output)) return undefined
    return data.output.content
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
            if (!res.ok) {
                warnings.push(`Query failed after retries, skipped: "${query}" (${res.error})`);
                continue
            }
            const results = readResults(res.data)
            const byUrl = new Map(results.map((r,i) =>[ r.url, { r, i } ]))
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
        if (!candidates.length) {
            warnings.push('No Philadelphia candidates found.')
        }
        return { candidates, stats: { calls: searcher.calls, dropped, warnings }}
    }
}
