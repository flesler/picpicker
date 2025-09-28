import type { RequestMessage } from './types.js'
import { MessageAction, type ExtractedImage, type ImageSourceType } from './types.js'
import { logger, querySelectorAll, TIMEOUTS } from './utils.js'

// Extraction settings constants - no longer passed via messages
const EXTRACTION_SETTINGS = {
  minWidth: 33,
  minHeight: 33,
  maxFileSize: 50 * 1024 * 1024, // 50MB
  includeCanvas: <boolean>false,
  maxImagesPerPage: 1000,
  extractionTimeout: 10000,
} as const

logger.info('content script loaded')

let isInitialized = false

function init() {
  // Check if extension context is valid
  if (!browser.runtime.id) {
    logger.warn('Extension context not ready, will retry in 1 second...')
    setTimeout(init, TIMEOUTS.CONTEXT_RETRY)
    return
  }

  // Prevent double initialization
  if (isInitialized) {
    logger.info('Already initialized, skipping')
    return
  }

  try {
    // Set up message listener for image extraction
    browser.runtime.onMessage.addListener((request: unknown, sender: unknown, sendResponse: (response?: { success: boolean; images?: ExtractedImage[]; error?: string }) => void): true => {
      const typedRequest = request as RequestMessage
      if (typedRequest.action === MessageAction.EXTRACT_IMAGES) {
        logger.info('Image extraction triggered')
        extractAllImages()
          .then(images => {
            logger.info(`Extracted ${images.length} images`)
            if (images.length === 0) {
              alert('PicPicker: No images could be extracted from this page. The page might not contain any images or they might be loaded dynamically.')
              sendResponse({ success: false, error: 'No images found' })
            } else {
              sendResponse({ success: true, images })
            }
          })
          .catch((err: Error) => {
            logger.error('Extraction failed', err)
            sendResponse({ success: false, error: err.message })
          })

        return true // Keep sendResponse channel open for async response
      }
      return true
    })

    logger.info(`Universal image extraction ready on ${window.location.hostname}`)
    isInitialized = true
  } catch (err) {
    logger.error('Initialization failed', err)
    setTimeout(init, TIMEOUTS.INIT_RETRY)
  }
}

// Main image extraction function - scans entire DOM for images
async function extractAllImages(): Promise<ExtractedImage[]> {
  try {
    // Use timeout to prevent hanging on large pages
    const timeoutPromise = new Promise<ExtractedImage[]>((_, reject) => {
      setTimeout(() => { reject(new Error('Extraction timeout')) }, EXTRACTION_SETTINGS.extractionTimeout)
    })
    const extractionPromise = new Promise<ExtractedImage[]>((resolve) => {
      resolve(performExtraction())
    })
    return await Promise.race([extractionPromise, timeoutPromise])
  } catch (err) {
    logger.error('Extraction error', err)
    throw err
  }
}

function performExtraction(): ExtractedImage[] {
  const images: ExtractedImage[] = []
  // Scan all elements in the DOM
  const allElements = querySelectorAll<Element>('*')
  logger.info(`Scanning ${allElements.length} elements`)
  // Helper to add image if valid and not already seen
  const addImageIfValid = (url: string | null | undefined, element: Element, source: ImageSourceType = 'img') => {
    if (!url || !isValidImageUrl(url)) {
      return
    }
    const extracted = createImageObject(url, element, source)
    if (extracted && !images.some(img => img.u === extracted.u)) {
      images.push(extracted)
    }
  }

  for (const element of allElements) {
    // Stop if we've hit the limit
    if (images.length >= EXTRACTION_SETTINGS.maxImagesPerPage) {
      logger.info(`Hit max images limit: ${EXTRACTION_SETTINGS.maxImagesPerPage}`)
      break
    }

    try {
      // Extract from INPUT image buttons
      if (element.tagName === 'INPUT' && (element as HTMLInputElement).type === 'image') {
        const input = element as HTMLInputElement
        addImageIfValid(input.src, input)
      }

      // Extract from IMG tags
      if (element.tagName === 'IMG') {
        const img = element as HTMLImageElement

        // Extract from src attribute
        addImageIfValid(img.src, img)

        // Extract from srcset attribute (responsive images)
        const srcsetUrls = parseSrcset(img.srcset)
        for (const url of srcsetUrls) {
          addImageIfValid(url, img)
        }

        // Extract from data attributes (lazy loading, etc.)
        const dataUrls = extractDataAttributes(img)
        for (const url of dataUrls) {
          addImageIfValid(url, img)
        }
      }

      // Extract from SOURCE tags (picture elements)
      if (element.tagName === 'SOURCE') {
        const source = element as HTMLSourceElement
        // Extract from srcset attribute in source tags
        const srcsetUrls = parseSrcset(source.srcset)
        for (const url of srcsetUrls) {
          addImageIfValid(url, source)
        }
      }

      // Extract from CSS background-image (inline styles and computed styles)
      const htmlElement = element as HTMLElement
      // Try inline style first (higher priority), then computed style as fallback
      let url = extractUrlFromCss(htmlElement.style.backgroundImage)
      if (!url) {
        const computed = window.getComputedStyle(element)
        url = extractUrlFromCss(computed.backgroundImage)
      }
      addImageIfValid(url, element, 'bg')

      // CSS content images (::before, ::after)
      const beforeStyle = window.getComputedStyle(element, '::before')
      const afterStyle = window.getComputedStyle(element, '::after')

      if (beforeStyle.content.includes('url(')) {
        const url = extractUrlFromCss(beforeStyle.content)
        addImageIfValid(url, element, 'bg')
      }

      if (afterStyle.content.includes('url(')) {
        const url = extractUrlFromCss(afterStyle.content)
        addImageIfValid(url, element, 'bg')
      }

      // Also check data attributes for background images
      const dataUrls = extractDataAttributes(element)
      for (const url of dataUrls) {
        addImageIfValid(url, element, 'bg')
      }

      // Extract from VIDEO poster
      if (element.tagName === 'VIDEO') {
        const video = element as HTMLVideoElement
        addImageIfValid(video.poster, video, 'video')
      }

      // Extract from SVG
      if (element.tagName === 'SVG') {
        // Convert SVG to data URL
        const svgData = new XMLSerializer().serializeToString(element)
        const svgUrl = 'data:image/svg+xml;base64,' + btoa(svgData)
        addImageIfValid(svgUrl, element, 'svg')
      }

      // Extract from Canvas (expensive, disabled by default)
      if (EXTRACTION_SETTINGS.includeCanvas && element.tagName === 'CANVAS') {
        try {
          const canvas = element as HTMLCanvasElement
          const dataUrl = canvas.toDataURL()
          addImageIfValid(dataUrl, canvas, 'canvas')
        } catch (err) {
          // Canvas may be tainted by cross-origin content
          logger.warn('Could not extract canvas', err)
        }
      }
    } catch (err) {
      // Continue on individual element errors
      logger.warn('Error processing element', err)
    }
  }

  const visibleCount = images.filter(img => img.v).length
  logger.info(`Extraction complete: ${images.length} images from ${allElements.length} elements`)
  logger.info(`Visible in viewport: ${visibleCount}/${images.length} images`)
  logger.info(`Extraction stopped because: ${images.length >= EXTRACTION_SETTINGS.maxImagesPerPage ? 'hit maxImagesPerPage limit' : 'finished scanning all elements'}`)
  logger.info(`Settings: maxImagesPerPage=${EXTRACTION_SETTINGS.maxImagesPerPage}, timeout=${EXTRACTION_SETTINGS.extractionTimeout}ms`)
  return images
}

function normalizeUrl(url: string): string {
  // Handle protocol-relative URLs (//example.com/image.jpg)
  if (url.startsWith('//')) {
    return window.location.protocol + url
  }
  return url
}

function createImageObject(url: string, element: Element, source: ImageSourceType = 'img'): ExtractedImage | null {
  try {
    // Normalize URL to add protocol if missing
    url = normalizeUrl(url)
    // All our extraction sources are already image-contextual, so trust them
    const format = getImageFormat(url)

    // Get dimensions based on element type and available properties
    const rect = element.getBoundingClientRect()
    let width: number | undefined
    let height: number | undefined

    const w = element.getAttribute('width')
    const h = element.getAttribute('height')
    if (source === 'img') {
      // Get width/height attributes from any element (img, source, etc.)
      const attrWidth = w ? parseInt(w, 10) : undefined
      const attrHeight = h ? parseInt(h, 10) : undefined
      // Get computed styles for CSS-defined dimensions
      const computed = window.getComputedStyle(element)
      const computedWidth = computed.width && computed.width !== 'auto' && computed.width !== '0px'
        ? parseFloat(computed.width)
        : undefined
      const computedHeight = computed.height && computed.height !== 'auto' && computed.height !== '0px'
        ? parseFloat(computed.height)
        : undefined

      // For actual img elements, prioritize attributes over natural dimensions
      // (browser might load wrong image from picture/source elements)
      if (element.tagName === 'IMG') {
        const img = element as HTMLImageElement
        width = attrWidth ||
          (img.naturalWidth > 0 ? img.naturalWidth : undefined) ||
          computedWidth ||
          (rect.width > 0 ? rect.width : undefined)
        height = attrHeight ||
          (img.naturalHeight > 0 ? img.naturalHeight : undefined) ||
          computedHeight ||
          (rect.height > 0 ? rect.height : undefined)
      } else {
        // For source elements, prioritize attributes
        width = attrWidth ||
          computedWidth ||
          (rect.width > 0 ? rect.width : undefined)
        height = attrHeight ||
          computedHeight ||
          (rect.height > 0 ? rect.height : undefined)
      }
    } else if (source === 'video') {
      const video = element as HTMLVideoElement
      // For video posters, use element dimensions (video size)
      width = video.videoWidth ||
        (w ? parseInt(w, 10) : undefined) ||
        (rect.width > 0 ? rect.width : undefined)
      height = video.videoHeight ||
        (h ? parseInt(h, 10) : undefined) ||
        (rect.height > 0 ? rect.height : undefined)
    } else {
      // For other sources (svg, canvas, bg), use computed styles + element dimensions
      const computed = window.getComputedStyle(element)

      // Try computed styles first (handles CSS-defined dimensions)
      const computedWidth = computed.width
      const computedHeight = computed.height

      // Parse CSS values (e.g., "44px" -> 44)
      const parsedWidth = computedWidth && computedWidth !== 'auto' && computedWidth !== '0px'
        ? parseFloat(computedWidth)
        : undefined
      const parsedHeight = computedHeight && computedHeight !== 'auto' && computedHeight !== '0px'
        ? parseFloat(computedHeight)
        : undefined

      // Use computed styles if available, fallback to bounding rect
      width = parsedWidth || (rect.width > 0 ? rect.width : undefined)
      height = parsedHeight || (rect.height > 0 ? rect.height : undefined)
    }

    if (width && width < EXTRACTION_SETTINGS.minWidth) return null
    if (height && height < EXTRACTION_SETTINGS.minHeight) return null

    const alt = (element as HTMLImageElement).alt || (element as HTMLElement).title || undefined
    const visibleInViewport = isElementVisibleInViewport(element)
    return {
      u: url,
      w: width ? Math.round(width) : undefined,
      h: height ? Math.round(height) : undefined,
      a: alt,
      f: format,
      s: source,
      v: visibleInViewport,
    }
  } catch (err) {
    logger.warn('Error creating image object', err)
    return null
  }
}

// Parse srcset attribute to extract all image URLs
function parseSrcset(srcset: string): string[] {
  const urls: string[] = []

  // Split by comma and parse each descriptor
  const candidates = srcset.split(',').map(s => s.trim())

  for (const candidate of candidates) {
    // Format: "url 1x" or "url 480w" or just "url"
    const parts = candidate.split(/\s+/)
    if (parts.length > 0 && parts[0]) {
      const url = parts[0].trim()
      if (url && (!url.startsWith('data:') || url.length > 50)) {
        // Skip tiny data URLs but include larger ones
        urls.push(url)
      }
    }
  }
  // Return the bigger images first
  return urls.reverse()
}

// Extract image URLs from data-* attributes commonly used for lazy loading
function extractDataAttributes(element: Element): string[] {
  const urls: string[] = []
  // Check all data-* attributes for image URLs
  if (element instanceof HTMLElement) {
    for (const value of Object.values(element.dataset)) {
      if (value && isValidImageUrl(value)) {
        urls.push(value)
      }
    }
  }

  return urls
}

// Simple URL validation for data-* attributes - we're already in image contexts
function isValidImageUrl(url: string): boolean {
  if (!url || url.length < 4) return false

  // Only allow:
  // - Full URLs with protocol (http://... or https://...)
  // - Absolute paths from domain root (/path/image.jpg - but not protocol-relative //)
  // - Data URLs (data:...)
  return /^(https?:\/\/|\/[^\/]|data:)/.test(normalizeUrl(url))
}

function extractUrlFromCss(cssValue: string): string | null {
  // Handle both url() and quoted content values
  const urlMatch = cssValue.match(/url\(['"]?([^'")]*)['"]?\)/)
  if (urlMatch) return urlMatch[1]

  // Handle CSS content property which might just be a quoted URL
  const contentMatch = cssValue.match(/^["']?([^"']+)["']?$/)
  if (contentMatch && isValidImageUrl(contentMatch[1])) {
    return contentMatch[1]
  }

  return null
}

function getImageFormat(url: string): string {
  if (url.startsWith('data:image/')) {
    const match = url.match(/data:image\/([^;]+)/)
    return match ? match[1] : 'unknown'
  }

  const urlPath = url.split('?')[0].split('#')[0] // Remove query params and hash fragments
  const match = urlPath.match(/\.([a-zA-Z]+)$/)
  return match ? match[1].toLowerCase() : 'unknown'
}

function isElementVisibleInViewport(element: Element): boolean {
  try {
    const rect = element.getBoundingClientRect()
    const windowHeight = window.innerHeight || document.documentElement.clientHeight
    const windowWidth = window.innerWidth || document.documentElement.clientWidth

    // Element must have dimensions
    if (rect.width <= 0 || rect.height <= 0) {
      return false
    }

    // Check if element is at least partially visible in current viewport
    const isCurrentlyVisible = (
      rect.top < windowHeight &&
      rect.bottom > 0 &&
      rect.left < windowWidth &&
      rect.right > 0
    )

    // Alternative check: is element in the "initial viewport" (above the fold)?
    // This helps catch lazy-loaded images that would be visible on initial page load
    const scrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop
    const elementTopFromPage = rect.top + scrollY
    const isAboveTheFold = elementTopFromPage < windowHeight * 1.5 // 1.5x viewport height

    const isVisible = isCurrentlyVisible || isAboveTheFold

    // Only log visible elements to reduce noise
    if (isVisible) {
      logger.info(`Element visible: ${element.tagName} (${Math.round(rect.width)}x${Math.round(rect.height)}) - current: ${isCurrentlyVisible}, above fold: ${isAboveTheFold}`)
    }

    return isVisible
  } catch (err) {
    logger.warn('Error checking viewport visibility', err)
    return false
  }
}

// Always try to initialize - init() will handle retries if Chrome context isn't ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
