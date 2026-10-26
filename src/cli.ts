import 'dotenv/config'
import { defaultSearchFn } from './exa.js'
import { evidenceStrategy } from './strategies/evidence.js'
import { profilesStrategy } from './strategies/profiles.js'
import { renderMarkdown } from './render.js'

const args = process.argv.slice(2)
const flag = args.indexOf('--strategy')
const strategy = flag >= 0 ? args[flag + 1] : 'b'
const rest = flag >= 0 ? args.filter((_, i) => i !== flag && i !== flag + 1) : args
const theme = rest.join(' ').trim()

if (!theme || (strategy !== 'a' && strategy !== 'b')) {
    console.error('Usage: npm run scout -- "<theme>" [--strategy a|b]')
    process.exit(1) // stop: missing theme or unknown strategy
}

const search = defaultSearchFn()
const run = strategy === 'a' ? profilesStrategy(search) : evidenceStrategy(search)
const started = Date.now()
const result = await run(theme)
for (const w of result.stats.warnings) console.error(`warning: ${w}`)

console.log(renderMarkdown(theme, strategy, result, (Date.now() - started)))

