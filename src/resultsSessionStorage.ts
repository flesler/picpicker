import env from './env.js'
import type { ExtractedImage, PageInfo } from './types.js'

export const PERSIST_RESULTS_SESSIONS_KEY = 'picpickerPersistResultsSessions'
const SESSION_INDEX_KEY = 'picpickerResultsSessionIds'
const SESSION_DATA_PREFIX = 'picpickerResultsSession:'
const MAX_SESSIONS = 3

export type ResultsSessionPayload = { images: ExtractedImage[]; pageInfo: PageInfo }

export async function isPersistResultsSessionsEnabled(): Promise<boolean> {
  const stored = await browser.storage.local.get(PERSIST_RESULTS_SESSIONS_KEY)
  const flag = stored[PERSIST_RESULTS_SESSIONS_KEY]
  if (flag === true) {
    return true
  }
  if (flag === false) {
    return false
  }
  return env.DEV_PERSIST_RESULTS_SESSIONS_DEFAULT
}

export async function persistResultsSession(sessionId: string, payload: ResultsSessionPayload): Promise<void> {
  if (!await isPersistResultsSessionsEnabled()) {
    return
  }
  await browser.storage.local.set({
    [`${SESSION_DATA_PREFIX}${sessionId}`]: payload,
  })
  const indexStored = await browser.storage.local.get(SESSION_INDEX_KEY)
  const ids = (indexStored[SESSION_INDEX_KEY] as string[] | undefined) ?? []
  const nextIds = [...ids.filter((id) => id !== sessionId), sessionId]
  while (nextIds.length > MAX_SESSIONS) {
    const removed = nextIds.shift()
    if (removed) {
      await browser.storage.local.remove(`${SESSION_DATA_PREFIX}${removed}`)
    }
  }
  await browser.storage.local.set({ [SESSION_INDEX_KEY]: nextIds })
}

export async function loadPersistedResultsSession(sessionId: string): Promise<ResultsSessionPayload | null> {
  if (!await isPersistResultsSessionsEnabled()) {
    return null
  }
  const stored = await browser.storage.local.get(`${SESSION_DATA_PREFIX}${sessionId}`)
  const payload = stored[`${SESSION_DATA_PREFIX}${sessionId}`] as ResultsSessionPayload | undefined
  if (!payload?.images.length) {
    return null
  }
  return payload
}
