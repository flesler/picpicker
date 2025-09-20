import env from './env.js'

// Firefox background context already has `browser`
if (env.POLYFILL && typeof browser === 'undefined') {
  // Chrome service worker context
  importScripts(env.POLYFILL)
}

import type { ExtractedImage, ExtractImagesRequest, GetSessionDataRequest, PageInfo } from './types.js'
import { MessageAction } from './types.js'
import { logger } from './utils.js'

browser.runtime.onInstalled.addListener(() => {
  logger.info('extension installed')
})

browser.runtime.onStartup.addListener(() => {
  logger.info('extension started')
})

// Handle extension button click for image extraction
browser.action.onClicked.addListener(async (tab) => {
  if (tab.id) {
    try {
      await extractImagesFromTab(tab.id)
    } catch (error) {
      logger.error('Extension button image extraction failed', error)
    }
  }
})

// Handle keyboard shortcut for image extraction
browser.commands.onCommand.addListener(async (command: string) => {
  if (command === 'extract-images') {
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true })
      if (tabs[0]?.id) {
        await extractImagesFromTab(tabs[0].id)
      }
    } catch (error) {
      logger.error('Keyboard shortcut image extraction failed', error)
    }
  }
})

async function extractImagesFromTab(tabId: number) {
  try {
    // Inject polyfill first, then content script
    logger.info('Injecting content script into active tab')
    await browser.scripting.executeScript({
      target: { tabId },
      files: [env.POLYFILL, 'content.js'].filter(Boolean),
    })

    // Wait a moment for content script to initialize
    await new Promise(resolve => setTimeout(resolve, 100))

    // Send extraction request to content script
    const response = await browser.tabs.sendMessage<
      ExtractImagesRequest, { success: boolean; error?: string; images?: ExtractedImage[] }>(
        tabId, { action: MessageAction.EXTRACT_IMAGES },
      )

    if (!response.success) {
      throw new Error(response.error || 'Extraction failed')
    }

    const images = response.images || []

    if (images.length === 0) {
      logger.info('No images found on page')
      return
    }

    // Get tab info for results page
    const tab = await browser.tabs.get(tabId)
    const pageInfo = {
      title: tab.title || 'Unknown Page',
      url: tab.url || '',
      extractedAt: new Date().toISOString(),
    }

    // Create results tab
    await createResultsTab(images, pageInfo)

  } catch (error) {
    logger.error('Failed to extract images', error)
  }
}

// Store session data in memory (cleared on extension reload)
const pendingSessions = new Map<string, { images: ExtractedImage[], pageInfo: PageInfo }>()

async function createResultsTab(images: ExtractedImage[], pageInfo: PageInfo) {
  try {
    // Generate unique session ID for this results tab
    const sessionId = Math.random().toString(36).slice(-5)
    // Store data in memory for this session
    pendingSessions.set(sessionId, { images, pageInfo })

    // Create new tab with results page, passing only session ID
    const resultsUrl = browser.runtime.getURL(`results.html?session=${sessionId}`)
    await browser.tabs.create({ url: resultsUrl })

    logger.info(`Created results tab with ${images.length} images (session: ${sessionId})`)

    // Clean up old sessions (keep last 3)
    if (pendingSessions.size > 3) {
      const oldestKey = pendingSessions.keys().next().value
      if (oldestKey) {
        pendingSessions.delete(oldestKey)
      }
    }
  } catch (error) {
    logger.error('Failed to create results tab', error)
  }
}

browser.runtime.onMessage.addListener((request: unknown, sender: unknown, sendResponse: (response?: { success: boolean; error?: string; images?: ExtractedImage[]; pageInfo?: PageInfo }) => void): true => {
  const typedRequest = request as GetSessionDataRequest
  if (typedRequest.action === MessageAction.GET_SESSION_DATA) {
    const sessionData = pendingSessions.get(typedRequest.sessionId)

    if (sessionData) {
      sendResponse({
        success: true,
        images: sessionData.images,
        pageInfo: sessionData.pageInfo,
      })
    } else {
      sendResponse({
        success: false,
        error: 'Session not found or expired',
      })
    }
    return true
  }

  return true
})
