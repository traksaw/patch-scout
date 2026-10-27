export function parseRounds(args: string[]): number {
    const flag = args.indexOf('--rounds')
    if (flag === -1) return 1                       // no flag: the default
    const rounds = Number(args[flag + 1])                  // the value right after the flag
    if (!Number.isInteger(rounds) || rounds < 1) {
        throw new Error(`--rounds needs a whole number of at least 1, got "${args[flag + 1]}"`)
    }
    return rounds
}
