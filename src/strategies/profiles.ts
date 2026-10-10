import { createSearcher, type SearchFn } from '../exa.js'
import { mergeMentions } from '../merge.js'
import { rankPeople } from '../rank.js'
import type { Mention, Strategy, Evidence } from '../types.js'
import { readResults } from './evidence.js'

export function nameFromTitle(title: string): string {
    return (title.split(/ [-|–] /)[0] ?? title).trim()
}

const PHILLY = /\b(philly|philadelphia)\b/i

export function profilesStrategy(search: SearchFn, now: Date = new Date()): Strategy {
    return async (theme) => {
        const searcher = createSearcher(search)
        const warnings: string[] = []
        const mentions: Mention[] = []

        const res = await searcher.search(`${theme} Philadelphia`, { type: 'auto', category: 'people', contents: { highlights: true } })
        if (!res.ok) {
            warnings.push(`Query failed after retries, skipped (${res.error})`)
        } else {
            const results = readResults(res.data)
            results.forEach((r, i) => {
                const title = r.title ?? ''
                const highlights = r.highlights ?? []
                const text = title + ' ' + (highlights.join(' '))
                const relevance = typeof r.score === 'number' ? r.score : 1 - i / results.length

                const evidence: Evidence = {
                    url: r.url,
                    title: r.title ?? r.url,
                    excerpt: r.highlights?.[0] ?? '',
                    kind: 'profile', // 'profile' is a default kind for profiles
                    publishedDate: r.publishedDate,
                    philly: PHILLY.test(text),
                    linkedUrls: [],
                    relevance,
                }
                mentions.push({ name: nameFromTitle(r.title ?? r.url), handle: r.url, evidence })
            })
        }

        const candidates = rankPeople(mergeMentions(mentions), { now })
        if (candidates.length === 0) {
            warnings.push('No Philadelphia candidates found.')
        }
        return { candidates, stats: { calls: searcher.calls, dropped: 0, warnings } }

    }

}