import { SEMANTIC_SEARCH_STORAGE_KEY } from './constants.js'
import { DEFAULT_SEMANTIC_SEARCH_SETTINGS, type SemanticSearchSettings } from './settingsTypes.js'

export type { SemanticSearchSettings } from './settingsTypes.js'
export { DEFAULT_SEMANTIC_SEARCH_SETTINGS } from './settingsTypes.js'

export async function loadSemanticSearchSettings(): Promise<SemanticSearchSettings> {
  const result = await browser.storage.sync.get(SEMANTIC_SEARCH_STORAGE_KEY)
  const stored = result[SEMANTIC_SEARCH_STORAGE_KEY] as Partial<SemanticSearchSettings> | undefined
  if (!stored) {
    return { ...DEFAULT_SEMANTIC_SEARCH_SETTINGS }
  }
  return {
    ...DEFAULT_SEMANTIC_SEARCH_SETTINGS,
    ...stored,
    mode: 'text-only',
    vectorDim: 256,
    inferenceDevice: stored.inferenceDevice ?? DEFAULT_SEMANTIC_SEARCH_SETTINGS.inferenceDevice,
  }
}

export async function saveSemanticSearchSettings(settings: SemanticSearchSettings): Promise<void> {
  await browser.storage.sync.set({ [SEMANTIC_SEARCH_STORAGE_KEY]: settings })
}
