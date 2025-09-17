import browser from './browser.js'
import type { CreateResultsTabRequest, ExtractImagesRequest, GetSessionDataRequest } from './types.js'
import { DEFAULT_USER_SETTINGS, MessageAction } from './types.js'
import { execute, getStorage, logger, setStorage } from './utils.js'

browser.runtime.onInstalled.addListener(async () => {
  logger.info('extension installed')
  await initializeExtension()
})

browser.runtime.onStartup.addListener(async () => {
  logger.info('extension started')
  await initializeExtension()
})

async function initializeExtension() {
  try {
    // Initialize default settings if not present
    const { userSettings } = await getStorage(['userSettings'])
    if (!userSettings) {
      await setStorage({ userSettings: DEFAULT_USER_SETTINGS })
    }
  } catch (error) {
    logger.error('Failed to initialize extension', error)
  }
}

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
    // Get user settings for extraction
    const { userSettings } = await getStorage(['userSettings'])
    const settings = userSettings || DEFAULT_USER_SETTINGS

    // Inject content script dynamically (only when needed)
    logger.info('Injecting content script into active tab')
    await browser.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
    })

    // Wait a moment for content script to initialize
    await new Promise(resolve => setTimeout(resolve, 100))

    // Send extraction request to content script
    const response = await browser.tabs.sendMessage(tabId, {
      action: MessageAction.EXTRACT_IMAGES,
      settings: settings.extraction,
    } as ExtractImagesRequest) as { success: boolean; error?: string; images?: any[] }

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
const pendingSessions = new Map<string, { images: any[], pageInfo: any }>()

async function createResultsTab(images: any[], pageInfo: any) {
  try {
    // Generate unique session ID for this results tab
    const sessionId = `picpicker_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Store data in memory for this session
    pendingSessions.set(sessionId, { images, pageInfo })

    // Create new tab with results page, passing only session ID
    const resultsUrl = browser.runtime.getURL(`results.html?session=${sessionId}`)
    await browser.tabs.create({ url: resultsUrl })

    logger.info(`Created results tab with ${images.length} images (session: ${sessionId})`)

    // Clean up old sessions (keep last 5)
    if (pendingSessions.size > 5) {
      const oldestKey = pendingSessions.keys().next().value
      if (oldestKey) {
        pendingSessions.delete(oldestKey)
      }
    }
  } catch (error) {
    logger.error('Failed to create results tab', error)
  }
}

browser.runtime.onMessage.addListener((request: any, sender: unknown, sendResponse: (response?: any) => void): true => {
  if (request.action === MessageAction.CREATE_RESULTS_TAB) {
    execute(async () => {
      const createRequest = request as CreateResultsTabRequest
      await createResultsTab(createRequest.images, createRequest.pageInfo)
      sendResponse({ success: true })
    })
    return true
  }

  if (request.action === MessageAction.GET_SESSION_DATA) {
    const getRequest = request as GetSessionDataRequest
    const sessionData = pendingSessions.get(getRequest.sessionId)

    if (sessionData) {
      // Clean up session data after use
      pendingSessions.delete(getRequest.sessionId)
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

  if (request.action === MessageAction.EXTRACT_IMAGES && request.tabId) {
    execute(async () => {
      const extractRequest = request as ExtractImagesRequest
      await extractImagesFromTab(extractRequest.tabId!)
      sendResponse({ success: true })
    })
    return true
  }

  if (request.action === MessageAction.OPEN_POPUP) {
    // Call openPopup immediately without any async operations to preserve user gesture
    if (browser.action?.openPopup) {
      browser.action.openPopup()
    } else {
      browser.tabs.create({ url: browser.runtime.getURL('popup.html') })
    }
    sendResponse({ success: true })
    return true
  }

  if (request.action === MessageAction.GET_EXTRACTION_SETTINGS) {
    execute(async () => {
      const { userSettings } = await getStorage(['userSettings'])
      const settings = userSettings || DEFAULT_USER_SETTINGS
      sendResponse({ extractionSettings: settings.extraction })
    })
    return true
  }

  if (request.action === MessageAction.SAVE_EXTRACTION_SETTINGS) {
    execute(async () => {
      const { userSettings } = await getStorage(['userSettings'])
      const currentSettings = userSettings || DEFAULT_USER_SETTINGS

      currentSettings.extraction = { ...currentSettings.extraction, ...request.settings }

      await setStorage({ userSettings: currentSettings })
      sendResponse({ success: true })
    })
    return true
  }

  return true
})
