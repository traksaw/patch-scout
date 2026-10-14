import { ExtractedPerson } from "./types.js"
const ROLES = new Set(['taught', 'built', 'wrote'])
const PLACEHOLDERS = new Set(['n/a', 'none', 'unknown', '-', 'null'])
const ORG_WORDS = new Set([
    'chapter', 'club', 'books', 'valley', 'center', 'society', 'association', 'team', 'group',
    'organization', 'company', 'inc', 'llc', 'ltd', 'foundation', 'institute', 'school',
    'academy', 'university', 'college', 'committee', 'council', 'network', 'lab', 'labs',
    'laboratory', 'studio', 'magazine', 'conference', 'festival', 'expo', 'meetup',
    'hackathon', 'workshop', 'collective',
])
export function isRecord(v: unknown): v is Record<string, unknown> {
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) return true
    return false
} // checks if a value is a plain object (record)

export function parsePeopleOutput(content: unknown): { people: ExtractedPerson[], dropped: number } {
    let value: unknown = content

    if (typeof value === 'string') {
        try {
            value = JSON.parse(value)
        } catch {
            return { people: [], dropped: 1 } // if JSON parsing fails, return empty array and 1 dropped item
        }
    }
    if (!isRecord(value) || !Array.isArray(value.people)) {
        return { people: [], dropped: 1 } // if the parsed value is not a record, return empty array and 1 dropped item
    }
    const people: ExtractedPerson[] = []
    let dropped = 0

    for (const item of value.people) {
        if (!isRecord(item)) { dropped++; continue }

        const name = typeof item.name === 'string' ? item.name.trim() : ''
        const url = typeof item.url === 'string' ? item.url.trim() : ''
        const role = typeof item.role === 'string' ? item.role : ''
        const handle = typeof item.handle === 'string' ? item.handle.trim() : ''
        const philly = item.philly === true
        const linkedUrls = Array.isArray(item.linkedUrls) ? item.linkedUrls.filter((u): u is string => typeof u === 'string') : []
        const quote = typeof item.quote === 'string' ? item.quote.trim() : ''
        const entity = typeof item.entity === 'string' ? item.entity : ''
        const words = name.toLowerCase().split(/\s+/)
        if ((name === '' || url === '') || (!ROLES.has(role) || (words.some((word) => ORG_WORDS.has(word)) || words.length < 2) || (entity.length > 0 && entity !== 'person') || (PLACEHOLDERS.has(name.toLowerCase()) || !/\p{L}/u.test(name)))) { dropped++; continue }
        people.push({
            name,
            url,
            role: role as ExtractedPerson['role'], // safe: ROLES.has(role) checked it above
            handle: PLACEHOLDERS.has(handle.toLowerCase()) || handle.length === 0 ? undefined : handle,
            philly: philly,
            linkedUrls: linkedUrls,
            quote: quote,
        })

    }

    return { people, dropped } // return the parsed people array and the count of dropped items
}