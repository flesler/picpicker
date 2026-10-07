import type { ImageDisplayData } from '../types.js'

/** Query appears as substring in alt and/or image URL (case-insensitive). */
export function semanticLexicalMatch(image: ImageDisplayData, query: string): boolean {
  const normalized = query.toLowerCase().trim()
  if (!normalized) {
    return false
  }
  const alt = (image.a || '').toLowerCase()
  const url = image.u.toLowerCase()
  if (alt.includes(normalized) || url.includes(normalized)) {
    return true
  }
  const terms = normalized.split(/\s+/).filter((term) => term.length >= 2)
  return terms.some((term) => alt.includes(term) || url.includes(term))
}

/** Stronger lexical hit for tie-breaks within the same embedding score. */
function lexicalMatchStrength(image: ImageDisplayData, query: string): number {
  const normalized = query.toLowerCase().trim()
  if (!normalized) {
    return 0
  }
  const alt = (image.a || '').toLowerCase()
  const url = image.u.toLowerCase()
  let strength = 0
  if (alt.includes(normalized)) {
    strength += 1000
  }
  if (url.includes(normalized)) {
    strength += 500
  }
  for (const term of normalized.split(/\s+/)) {
    if (term.length < 2) {
      continue
    }
    if (alt.includes(term)) {
      strength += 200
    }
    if (url.includes(term)) {
      strength += 100
    }
  }
  return strength
}

/** Lexical matches first; within each group sort by embedding, then lexical strength. */
export function compareSemanticRank(
  a: ImageDisplayData,
  b: ImageDisplayData,
  embeddingScoreA: number,
  embeddingScoreB: number,
  query: string,
): number {
  const matchA = semanticLexicalMatch(a, query)
  const matchB = semanticLexicalMatch(b, query)
  if (matchA !== matchB) {
    return Number(matchB) - Number(matchA)
  }
  if (embeddingScoreB !== embeddingScoreA) {
    return embeddingScoreB - embeddingScoreA
  }
  return lexicalMatchStrength(b, query) - lexicalMatchStrength(a, query)
}
