// Response shapes observed 2026-10-01 (exa-js 2.25.0, live calls):
// - costDollars: { total: number, search: { neural: number } } (~$0.007 per call)
// - searchTime: number, milliseconds
// - output.content: an object (not a JSON string) when outputSchema is set
// - output.grounding: [{ field: "people[0].name", citations: [{ url, title }], confidence: "high" | ... }]
// - results[i] keys: id, title, url, highlights (string[]), image, and publishedDate when known.
//   No `score` field, so relevance falls back to 1 - rank/N (as the spec allows).
// - category "people" results also carry `entities`.
import 'dotenv/config'
import { Exa } from 'exa-js'
import { writeFileSync, mkdirSync } from 'node:fs'

if (!process.env.EXA_API_KEY) {
  console.error('Set EXA_API_KEY in .env (see .env.example).')
  process.exit(1)
}

const exa = new Exa(process.env.EXA_API_KEY)
mkdirSync('tests/fixtures', { recursive: true })

const theme = 'NFC and tap automations'

const a = await exa.search(`${theme} Philadelphia`, {
  type: 'auto',
  category: 'people',
  contents: { highlights: true },
} as never)
writeFileSync('tests/fixtures/strategy-a.json', JSON.stringify(a, null, 2))

const b = await exa.search(`${theme} workshop or talk in Philadelphia`, {
  type: 'auto',
  systemPrompt:
    'Keep a person only when the page shows they taught, built, or wrote the work. Mark philly true only when the page ties them to Philadelphia. Never guess a name.',
  outputSchema: {
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
  },
  contents: { highlights: true },
} as never)
writeFileSync('tests/fixtures/strategy-b.json', JSON.stringify(b, null, 2))

console.log('Wrote tests/fixtures/strategy-a.json and strategy-b.json')
