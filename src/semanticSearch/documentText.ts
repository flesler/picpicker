import type { ImageDisplayData } from '../types.js'

export const QUERY_PREFIX = 'task: search result | query: '

export function imageDocumentText(image: ImageDisplayData, pageTitle?: string): string {
  const title = pageTitle?.trim() || 'none'
  const textParts: string[] = []
  if (image.a?.trim()) {
    textParts.push(image.a.trim())
  }
  try {
    const parsed = new URL(image.u)
    const filename = parsed.pathname.split('/').filter(Boolean).pop()
    if (filename) {
      textParts.push(decodeURIComponent(filename))
    }
  } catch {
    textParts.push(image.u)
  }
  const content = textParts.join(' ').replace(/\s+/g, ' ').trim()
  if (!content) {
    return `title: ${title} | text: none`
  }
  return `title: ${title} | text: ${content}`
}

export function queryText(userQuery: string): string {
  return `${QUERY_PREFIX}${userQuery.trim()}`
}
