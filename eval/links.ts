export function normalizeUrl(url: string): string {
    return url
        .replace(/^https?:\/\//, '')   // 1. drop http:// or https:// at the start
        .replace(/^www\./, '')         // 2. drop www. at the start
        .replace(/\/$/, '')            // 3. drop one / at the end
}