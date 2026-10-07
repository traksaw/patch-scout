import type { EvidenceKind, Evidence, MergedPerson, Candidate, ScoreLine } from './types.js'

export const KIND_WEIGHTS: Record<EvidenceKind, number> = {
    taught: 1.0,
    built: 0.7,
    wrote: 0.5,
    profile: 0.3
}

// Calculate a recency factor for an item based on its published date and the current date.
// The recency factor decreases exponentially with the age of the item, with a half-life of 2 years.
export function recencyFactor(publishedDate: string | undefined, now: Date): number {
    if (!publishedDate) { // check if the published date is missing
        return 0.5
    }
    const published = new Date(publishedDate)
    if (Number.isNaN(published.getTime())) { // check if the date is valid
        return 0.5
    }

    const ageMs = now.getTime() - published.getTime(); // calculate age in milliseconds
    if (ageMs < 0) { // check if the published date is in the future
        return 1
    }
    const ageYears = ageMs / (1000 * 60 * 60 * 24 * 365.25) // convert age from milliseconds to years

    return 0.5 ** (ageYears / 2)
}
// Calculate the strength of an item based on its kind, recency, and relevance.
export function itemStrength(e: Evidence, now: Date): number {
    return KIND_WEIGHTS[e.kind] * recencyFactor(e.publishedDate, now) * e.relevance
}

export function rankPeople(people: MergedPerson[], opts: { now: Date; limit?: number }): Candidate[] {
    const local = people.filter((p) => p.evidence.some((e) => e.philly)) // gate on the evidence itself (source of truth), not the derived p.philly flag
    const candidates = local.map((p) => {
        const sorted = [...p.evidence].sort((a, b) => (itemStrength(b, opts.now) - itemStrength(a, opts.now)));
        const breakdown: ScoreLine[] = sorted.map((e, i) => {
            const strength = itemStrength(e, opts.now);
            const multiplier = 0.5 ** i; // simple positional multiplier, decreasing with rank
            return {
                url: e.url,
                kind: e.kind,
                kindWeight: KIND_WEIGHTS[e.kind],
                relevance: e.relevance,
                recency: recencyFactor(e.publishedDate, opts.now),
                strength,
                multiplier,
                contribution: strength * multiplier,

            }

        })

        const score = breakdown.reduce((acc, line) => acc + line.contribution, 0)
        return { ...p, score, breakdown }
    })
    candidates.sort((a, b) => {
        if (a.score !== b.score) {
            return b.score - a.score
        }
        return a.name.localeCompare(b.name)
    })
    return candidates.slice(0, opts.limit ?? 10)

}


