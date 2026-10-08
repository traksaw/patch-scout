export type EvidenceKind = 'taught' | 'built' | 'wrote' | 'profile'

export type Evidence = {
  url: string
  title: string
  excerpt: string
  kind: EvidenceKind
  publishedDate?: string // ISO string from Exa, when present
  philly: boolean
  linkedUrls: string[]
  relevance: number // 0..1. Exa result score when present, else 1 - rank/N.
}

export type Mention = {
  name: string
  handle?: string
  evidence: Evidence
}

export type MergedPerson = {
  name: string
  handles: string[]
  philly: boolean
  evidence: Evidence[]
  possibleDuplicateOf: string[] // names of separate people with the same name
}

export type ScoreLine = {
  url: string
  kind: EvidenceKind
  kindWeight: number
  relevance: number
  recency: number
  strength: number
  multiplier: number
  contribution: number
}

export type Candidate = {
  name: string
  handles: string[]
  philly: boolean
  score: number
  breakdown: ScoreLine[]
  evidence: Evidence[]
  possibleDuplicateOf: string[]
}

export type CallRecord = {
  query: string
  ok: boolean
  attempts: number
  costDollars: number
  ms: number
  error?: string
}

export type RunStats = {
  calls: CallRecord[]
  dropped: number
  warnings: string[]
}

export type Result = {
    url: string, 
    title?: string,
    highlights?: string[];
    publishedDate?: string;
    score?: number
}

export type ExtractedPerson = {
    name: string,
    handle?: string,
    role: 'taught' | 'built' | 'wrote',
    url: string,
    philly: boolean,
    linkedUrls: string[],
} // represents the schema of an extracted person


export type StrategyResult = { candidates: Candidate[]; stats: RunStats }

export type Strategy = (theme: string) => Promise<StrategyResult>
