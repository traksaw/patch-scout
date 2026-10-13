import type { EvidenceKind } from './types.js'
import { normalizeName } from './merge.js'
// Whole teaching words only: \b stops "classic" from matching "class".
const TEACHING = /\b(taught|teach|teaching|instructs|instructing|class|course|talk|teaches|lectures|speaks|speaking|lecture|lecturing|presenting|led|workshop)\b/i

export function checkRole(role: 'taught' | 'built' | 'wrote', quote: string, pageText: string): EvidenceKind {
    // 1. clean both strings the same way: lowercase, every run of spaces becomes one space, trim
    const cleanQuote = normalizeName(quote)
    const cleanPageText = normalizeName(pageText)
    // 2. no proof: the quote is under 20 characters, or it is not on the page → 'profile'
    const proof = cleanQuote.length >= 20 && cleanPageText.includes(cleanQuote)
    if (!proof) return 'profile' 
    // 3. taught, but no teaching word in the quote → 'built'
    const hasTeachingWord = TEACHING.test(cleanQuote)
    if (!hasTeachingWord && role === 'taught') return 'built'
    // 4. otherwise the model's role stands
    return role
}
