import type { Mention, MergedPerson } from './types.js'
function find(boss: number[], i: number): number {
    //follow boss[i] up until you reach an index that is its own boss
    while (boss[i] !== i) {
        i = boss[i]! // follow the chain of bosses; also ensure the type error is resolved with the !
    }
    return i
}

function union(boss: number[], a: number, b: number): void {
    //find both top bosses; if different, make one report to the other
    const rootA = find(boss, a) // find the top boss of a
    const rootB = find(boss, b) // find the top boss of b

    if (rootA !== rootB) {
        boss[Math.max(rootA, rootB)] = Math.min(rootA, rootB) //always assign the boss with the lowest index
    }
}


//mergeMentions takes a list of mentions and gives back a list of merged people

export function mergeMentions(mentions: Mention[]): MergedPerson[] {
    // a cleaned name seen with 2+ different initials is ambiguous: a plain version could be any of them
    const initialsByKey = new Map<string, Set<string>>()
    for (const m of mentions) {
        const i = initials(m.name)
        if (i === '') continue                              // plain names don't add an initial
        const key = nameKey(m.name)
        const seen = initialsByKey.get(key) ?? new Set<string>()
        seen.add(i)
        initialsByKey.set(key, seen)
    }
    const ambiguous = new Set([...initialsByKey].filter(([, s]) => s.size >= 2).map(([key]) => key))

    const bossIndex = mentions.map((_, index) => index) // each mention starts as its own boss.

    for (let i = 0; i < mentions.length; i++) {
        for (let j = i + 1; j < mentions.length; j++) {
            if (isSamePerson(mentions[i]!, mentions[j]!, ambiguous)) { //if the mentions refer to the same person, we will union them in the bossIndex array
                union(bossIndex, i, j)
            }
        }
    }
    const sheets = new Map<number, MergedPerson>()

    for (let i = 0; i < mentions.length; i++) {
        const m = mentions[i]! // get the current mention 
        const root = find(bossIndex, i) // find the top boss of the current mention
        const sheet = sheets.get(root) // get the existing merged person sheet for the root index

        if (!sheet) {
            sheets.set(root, {
                name: m.name,
                handles: m.handle ? [m.handle.toLowerCase()] : [],
                philly: m.evidence.philly,
                evidence: [m.evidence],
                possibleDuplicateOf: [],
            })
        }
        else {
            sheet.philly = sheet.philly || m.evidence.philly
            if (m.handle && !sheet.handles.includes(m.handle.toLowerCase())) {
                sheet.handles.push(m.handle.toLowerCase())
            }
            if (!sheet.evidence.some((e) => e.url === m.evidence.url)) {
                sheet.evidence.push(m.evidence)
            }

        }
    }

    const people = [...sheets.values()]
    for (let i = 0; i < people.length; i++) {
        for (let j = i + 1; j < people.length; j++) {
            if (nameKey(people[i]!.name) === nameKey(people[j]!.name) || (isShortFormOf(people[i]!.name, people[j]!.name)) || isShortFormOf(people[j]!.name, people[i]!.name)) { //this will compare if the names are the same in each merged person sheet
                people[i]!.possibleDuplicateOf.push(people[j]!.name); // mark the other person as a possible duplicate 
                people[j]!.possibleDuplicateOf.push(people[i]!.name);
            }
        }
    }
    return people // return the list of merged people with possible duplicates marked
}

//isSamePerson checks if two mentions refer to the same person based on handle or linked URLs as well as the name match.

function isSamePerson(a: Mention, b: Mention, ambiguous: Set<string>): boolean {
    // Check if both mentions have handles and if they match (case-insensitive)
    if ((a.handle && b.handle) && (a.handle.toLowerCase() === b.handle.toLowerCase())) {
        return true
    }
    // Check if either mention's linked URLs include the other's URL
    if (a.evidence.linkedUrls.includes(b.evidence.url) || b.evidence.linkedUrls.includes(a.evidence.url)) {
        return true
    }

    if (
        a.evidence.philly && b.evidence.philly
        && nameKey(a.name) === nameKey(b.name)
        && !(initials(a.name) !== '' && initials(b.name) !== '' && initials(a.name) !== initials(b.name))   // no conflicting initials
        && !(ambiguous.has(nameKey(a.name)) && (initials(a.name) === '' || initials(b.name) === ''))       // no plain name when ambiguous
    ) {
        return true
    }
    // If neither the handles nor the linked URLs match, the mentions are not considered the same person, so we will make a new pile
    return false
}

export function normalizeName(name: string): string {
    // Normalize the name by converting it to lowercase and removing any leading/trailing whitespace
    return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function nameKey(name: string): string {
    return normalizeName(name.replace(/\(.*?\)/g, ' '))
        .split(/\s+/)
        .filter((word) => !/^\p{L}\.?$/u.test(word))
        .join(' ')
}

function initials(name: string): string {
    return normalizeName(name.replace(/\(.*?\)/g, ' '))
        .split(/\s+/)
        .filter((word) => /^\p{L}\.?$/u.test(word))     // keep ONLY the one-letter words
        .map((word) => word.replace('.', ''))           // 'm.' → 'm'
        .join('')
}

function isShortFormOf(short: string, full: string): boolean {
    const s = normalizeName(short).split(/\s+/)
    const f = normalizeName(full).split(/\s+/)

    if (s.length !== 2 || f.length < 2) return false
    const initial = s[1]!.replace('.', '')
    return initial.length === 1 && s[0] === f[0] && f.at(-1)!.startsWith(initial)
}
