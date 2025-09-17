import env from './env.js'
import type { UserSettings } from './types.js'
import { DEFAULT_USER_SETTINGS, MessageAction } from './types.js'
import { logger, TIMEOUTS } from './utils.js'

let currentSettings: UserSettings = DEFAULT_USER_SETTINGS

document.addEventListener('DOMContentLoaded', async () => {
  const titleElement = document.querySelector('h1')
  if (titleElement) {
    titleElement.textContent = `${env.NAME} v${env.VERSION}`
  }
  await loadSettings()
  setupEventListeners()
})

async function loadSettings() {
  try {
    const result = await browser.storage.sync.get(['userSettings'])
    if (result.userSettings) {
      currentSettings = { ...DEFAULT_USER_SETTINGS, ...result.userSettings }
    }
    updateSettingsUI()
  } catch (error) {
    logger.error('Failed to load settings', error)
  }
}

function updateSettingsUI() {
  // Update min size setting
  const minSizeSelect = document.getElementById('minSize') as HTMLSelectElement
  if (minSizeSelect) {
    minSizeSelect.value = currentSettings.extraction.minWidth.toString()
  }

  // Update checkbox settings
  const includeBackgrounds = document.getElementById('includeBackgrounds') as HTMLInputElement
  if (includeBackgrounds) {
    includeBackgrounds.checked = currentSettings.extraction.includeBackgrounds
  }

  const includeSvg = document.getElementById('includeSvg') as HTMLInputElement
  if (includeSvg) {
    includeSvg.checked = currentSettings.extraction.includeSvg
  }

  const includeAltText = document.getElementById('includeAltText') as HTMLInputElement
  if (includeAltText) {
    includeAltText.checked = currentSettings.extraction.includeAltText
  }
}

function setupEventListeners() {
  // Extract button
  const extractButton = document.getElementById('extractImages')
  extractButton?.addEventListener('click', handleExtractImages)

  // Settings event listeners
  const minSizeSelect = document.getElementById('minSize')
  minSizeSelect?.addEventListener('change', handleSettingsChange)

  const includeBackgrounds = document.getElementById('includeBackgrounds')
  includeBackgrounds?.addEventListener('change', handleSettingsChange)

  const includeSvg = document.getElementById('includeSvg')
  includeSvg?.addEventListener('change', handleSettingsChange)

  const includeAltText = document.getElementById('includeAltText')
  includeAltText?.addEventListener('change', handleSettingsChange)
}

async function handleSettingsChange() {
  // Get current values from UI
  const minSizeSelect = document.getElementById('minSize') as HTMLSelectElement
  const includeBackgrounds = document.getElementById('includeBackgrounds') as HTMLInputElement
  const includeSvg = document.getElementById('includeSvg') as HTMLInputElement
  const includeAltText = document.getElementById('includeAltText') as HTMLInputElement

  // Update settings object
  currentSettings.extraction.minWidth = parseInt(minSizeSelect?.value || '50')
  currentSettings.extraction.minHeight = currentSettings.extraction.minWidth // Keep square
  currentSettings.extraction.includeBackgrounds = includeBackgrounds?.checked ?? true
  currentSettings.extraction.includeSvg = includeSvg?.checked ?? true
  currentSettings.extraction.includeAltText = includeAltText?.checked ?? false

  // Save to storage
  try {
    await browser.storage.sync.set({ userSettings: currentSettings })
  } catch (error) {
    logger.error('Failed to save settings', error)
  }
}

async function handleExtractImages() {
  try {
    setExtractionStatus('extracting', 'Extracting images...')

    // Get current tab
    const tabs = await browser.tabs.query({ active: true, currentWindow: true })
    if (!tabs[0]?.id) {
      throw new Error('No active tab found')
    }

    // Send extraction request to background script (it will inject content script and handle everything)
    const response = await browser.runtime.sendMessage({
      action: MessageAction.EXTRACT_IMAGES,
      tabId: tabs[0].id,
      settings: currentSettings.extraction,
    }) as { success: boolean; error?: string }

    if (!response.success) {
      throw new Error(response.error || 'Extraction failed')
    }

    // Clear status and close popup
    clearExtractionStatus()
    window.close()

  } catch (error) {
    logger.error('Extraction failed', error)
    setExtractionStatus('error', `Error: ${error.message}`)
    setTimeout(() => clearExtractionStatus(), TIMEOUTS.STATUS_CLEAR_LONG)
  }
}

function setExtractionStatus(type: 'extracting' | 'error', message: string) {
  const statusIndicator = document.getElementById('statusIndicator')
  const statusText = document.getElementById('statusText')
  const extractButton = document.getElementById('extractImages') as HTMLButtonElement

  if (statusIndicator) {
    statusIndicator.className = `status-indicator ${type}`
  }

  if (statusText) {
    statusText.textContent = message
  }

  if (extractButton) {
    extractButton.disabled = type === 'extracting'
  }
}

function clearExtractionStatus() {
  const statusIndicator = document.getElementById('statusIndicator')
  const extractButton = document.getElementById('extractImages') as HTMLButtonElement

  if (statusIndicator) {
    statusIndicator.className = 'status-indicator'
  }

  if (extractButton) {
    extractButton.disabled = false
  }
}

