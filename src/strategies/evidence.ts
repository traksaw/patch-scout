import { isRecord, parsePeopleOutput } from '../parse.js'
import { createSearcher, type SearchFn } from '../exa.js'
import { mergeMentions } from '../merge.js'
import { rankPeople } from '../rank.js'
import type { Mention, Evidence, Strategy, Result } from '../types.js'
import { checkRole } from '../role.js'

export const EVIDENCE_QUERIES = (theme: string): string[] => {
    return [`${theme} workshop or talk in Philadelphia`,
    `${theme} meetup in Philadelphia`,
    `${theme} hackathon or demo night in Philadelphia`
    ]
}

export const SYSTEM_PROMPT = [
    'Extract the people who did the work shown on each page.',
    'Keep a person only when the page shows they taught, built, or wrote the work.',
    'Set role to taught, built, or wrote to match what the page shows.',
    'taught means the page shows them teaching a specific workshop, class, course, or talk. A job title such as professor or instructor is not taught.',
    'built means they made the project. wrote means they wrote the post, tutorial, or article.',
    'Set quote to one exact sentence copied from the page that shows the role. Copy it word for word. Do not paraphrase.',
    'Set philly to true only when the page ties the person to Philadelphia.',
    "Set url to the page that shows the work. List outbound links from that page to the person's own site or profiles in linkedUrls.",
    'Set entity to person for one individual human, to organization for a company or group, to team for a named team, and to event for an event or meetup.',
    'Never guess a name. Omit a person whose name the page does not state.',
    'Go through every page one by one. Return every named person from every page that shows their work, not only the first few. A list of ten or more people is fine.'
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
                    quote: { type: 'string' },
                    entity: { type: 'string', enum: ['person', 'team', 'organization', 'event'] }
                },
                required: ['name', 'role', 'url', 'philly', 'quote', 'entity'],
            },
        },
    },
    required: ['people'],
}

export function readResults(data: unknown): Result[] {
    if (!isRecord(data) || !Array.isArray(data.results)) return [] // return an empty array if data isn't a record or data isnt an array
    return data.results.filter((x): x is Result => isRecord(x) && typeof x.url === 'string' && x.url !== '')
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
                contents: { text: true, summary: { query: SYSTEM_PROMPT, schema: OUTPUT_SCHEMA } },
            })
            if (!res.ok) {
                warnings.push(`Query failed after retries, skipped: "${query}" (${res.error})`);
                continue
            }
            const results = readResults(res.data)
            for (const [i, page] of results.entries()) {
                const parsed = parsePeopleOutput(page.summary)
                dropped += parsed.dropped

                for (const person of parsed.people) {
                    const relevance = typeof page.score === 'number' ? page.score : 1 - i / results.length
                    const kind = checkRole(person.role, person.quote, page.text ?? '')
                    const evidence: Evidence = {
                        url: page.url,
                        title: page.title ?? page.url,
                        excerpt: kind === 'profile' ? '' : person.quote,
                        kind: kind,
                        publishedDate: page.publishedDate,
                        philly: person.philly,
                        linkedUrls: person.linkedUrls,
                        relevance,
                    }
                    mentions.push({ name: person.name, handle: person.handle, evidence })
                }
            }
        }
        const merged = mergeMentions(mentions)
        const proven = merged.filter((person) => person.evidence.some((e) => e.kind !== 'profile'))
        dropped += merged.length - proven.length
        const candidates = rankPeople(proven, { now })
        if (!candidates.length) {
            warnings.push('No Philadelphia candidates found.')
        }
        return { candidates, stats: { calls: searcher.calls, dropped: dropped, warnings } }
    }
}
