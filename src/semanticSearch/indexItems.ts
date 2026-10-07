import type { ImageDisplayData } from '../types.js'
import { imageDocumentText } from './documentText.js'
import { isGenericImageLabel } from './imageLabels.js'

export type SemanticIndexItem = { id: string; text: string }

function meaningfulFilenameFromUrl(url: string): string | null {
  try {
    const filename = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || '')
    if (filename.length < 4) {
      return null
    }
    const stem = filename.replace(/\.[a-z0-9]+$/i, '')
    if (stem.length >= 16 && /^[a-f0-9._-]+$/i.test(stem)) {
      return null
    }
    if (/[a-z]{3,}/i.test(filename)) {
      return filename
    }
    return null
  } catch {
    return null
  }
}

/** Text-only phase: skip images with no real alt/label and no descriptive filename. */
export function shouldIndexForSemanticSearch(image: ImageDisplayData): boolean {
  const alt = image.a?.trim()
  if (alt && !isGenericImageLabel(alt)) {
    return true
  }
  if (meaningfulFilenameFromUrl(image.u)) {
    return true
  }
  return false
}

function pickRicherImage(a: ImageDisplayData, b: ImageDisplayData): ImageDisplayData {
  const aLen = a.a?.trim().length ?? 0
  const bLen = b.a?.trim().length ?? 0
  return bLen > aLen ? b : a
}

/** Dedupe by URL for embedding text; fan out same vector to every display id sharing that URL. */
export function prepareSemanticIndexItems(
  images: ImageDisplayData[],
  pageTitle?: string,
): SemanticIndexItem[] {
  const idsByUrl = new Map<string, string[]>()
  const canonicalByUrl = new Map<string, ImageDisplayData>()
  for (const image of images) {
    const list = idsByUrl.get(image.u)
    if (list) {
      list.push(image.id)
      const prev = canonicalByUrl.get(image.u)
      if (prev) {
        canonicalByUrl.set(image.u, pickRicherImage(prev, image))
      }
    } else {
      idsByUrl.set(image.u, [image.id])
      canonicalByUrl.set(image.u, image)
    }
  }

  const items: SemanticIndexItem[] = []
  for (const [url, ids] of idsByUrl) {
    const canonical = canonicalByUrl.get(url)
    if (!canonical) {
      continue
    }
    if (!shouldIndexForSemanticSearch(canonical)) {
      continue
    }
    const text = imageDocumentText(canonical, pageTitle)
    for (const id of ids) {
      items.push({ id, text })
    }
  }
  return items
}
