const GENERIC_IMAGE_LABELS = new Set(['pin', 'image', 'photo', 'img', 'picture', 'thumbnail'])

export function isGenericImageLabel(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim().toLowerCase()
  if (!normalized) {
    return true
  }
  if (GENERIC_IMAGE_LABELS.has(normalized)) {
    return true
  }
  if (normalized === 'pin' || (normalized.startsWith('pin ') && normalized.length < 24)) {
    return true
  }
  return false
}
