import { DEFAULT_EXTRACTION_SETTINGS, MessageAction, type ExtractedImage, type ExtractionSettings, type ImageSourceType } from './types.js'
import { logger, querySelectorAll, TIMEOUTS } from './utils.js'

logger.info('content script loaded')

let isInitialized = false

function init() {
  // Check if extension context is valid
  if (!browser?.runtime?.id) {
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
    browser.runtime.onMessage.addListener((request: any, sender: unknown, sendResponse: (response?: any) => void): true => {
      if (request.action === MessageAction.EXTRACT_IMAGES) {
        logger.info('Image extraction triggered')
        const settings = { ...DEFAULT_EXTRACTION_SETTINGS, ...request.settings } as ExtractionSettings

        extractAllImages(settings)
          .then(images => {
            logger.info(`Extracted ${images.length} images`)
            sendResponse({ success: true, images })
          })
          .catch(error => {
            logger.error('Extraction failed', error)
            sendResponse({ success: false, error: error.message })
          })

        return true // Keep sendResponse channel open for async response
      }
      return true
    })

    logger.info(`Universal image extraction ready on ${window.location.hostname}`)
    isInitialized = true
  } catch (error) {
    logger.error('Initialization failed', error)
    setTimeout(init, TIMEOUTS.INIT_RETRY)
  }
}

// Main image extraction function - scans entire DOM for images
async function extractAllImages(settings: ExtractionSettings): Promise<ExtractedImage[]> {
  try {
    // Use timeout to prevent hanging on large pages
    const timeoutPromise = new Promise<ExtractedImage[]>((_, reject) => {
      setTimeout(() => reject(new Error('Extraction timeout')), settings.extractionTimeout)
    })
    const extractionPromise = performExtraction(settings)
    return await Promise.race([extractionPromise, timeoutPromise])
  } catch (error) {
    logger.error('Extraction error', error)
    throw error
  }
}

async function performExtraction(settings: ExtractionSettings): Promise<ExtractedImage[]> {
  const images: ExtractedImage[] = []
  // Scan all elements in the DOM
  const allElements = querySelectorAll<Element>('*')
  logger.info(`Scanning ${allElements.length} elements`)
  // Helper to add image if valid and not already seen
  const addImageIfValid = async (url: string | null | undefined, element: Element, source: ImageSourceType = 'img') => {
    if (!url) return
    const extracted = await createImageObject(url, element, source, settings)
    if (extracted && !images.some(img => img.u === extracted.u)) {
      images.push(extracted)
    }
  }

  for (const element of allElements) {
    // Stop if we've hit the limit
    if (images.length >= settings.maxImagesPerPage) {
      logger.info(`Hit max images limit: ${settings.maxImagesPerPage}`)
      break
    }

    try {
      // Extract from IMG tags
      if (settings.includeImgTags && element.tagName === 'IMG') {
        const img = element as HTMLImageElement

        // Extract from src attribute
        await addImageIfValid(img.src, img)

        // Extract from srcset attribute (responsive images)
        const srcsetUrls = parseSrcset(img.srcset)
        for (const url of srcsetUrls) {
          await addImageIfValid(url, img)
        }

        // Extract from data attributes (lazy loading, etc.)
        const dataUrls = extractDataAttributes(img)
        for (const url of dataUrls) {
          await addImageIfValid(url, img)
        }
      }

      // Extract from SOURCE tags (picture elements)
      if (settings.includeImgTags && element.tagName === 'SOURCE') {
        const source = element as HTMLSourceElement
        // Extract from srcset attribute in source tags
        const srcsetUrls = parseSrcset(source.srcset)
        for (const url of srcsetUrls) {
          await addImageIfValid(url, source)
        }
      }

      // Extract from background images
      if (settings.includeBackgrounds) {
        const computed = window.getComputedStyle(element)
        const bgImage = computed.backgroundImage
        if (bgImage?.includes('url(')) {
          const url = extractUrlFromCss(bgImage)
          await addImageIfValid(url, element, 'bg')
        }

        // Also check data attributes for background images
        const dataUrls = extractDataAttributes(element)
        for (const url of dataUrls) {
          await addImageIfValid(url, element, 'bg')
        }
      }

      // Extract from VIDEO poster
      if (settings.includeVideoPoster && element.tagName === 'VIDEO') {
        const video = element as HTMLVideoElement
        await addImageIfValid(video.poster, video, 'video')
      }

      // Extract from SVG
      if (settings.includeSvg && element.tagName === 'SVG') {
        // Convert SVG to data URL
        const svgData = new XMLSerializer().serializeToString(element)
        const svgUrl = 'data:image/svg+xml;base64,' + btoa(svgData)
        await addImageIfValid(svgUrl, element, 'svg')
      }

      // Extract from Canvas (expensive, disabled by default)
      if (settings.includeCanvas && element.tagName === 'CANVAS') {
        try {
          const canvas = element as HTMLCanvasElement
          const dataUrl = canvas.toDataURL()
          await addImageIfValid(dataUrl, canvas, 'canvas')
        } catch (e) {
          // Canvas may be tainted by cross-origin content
          logger.warn('Could not extract canvas', e)
        }
      }
    } catch (error) {
      // Continue on individual element errors
      logger.warn('Error processing element', error)
    }
  }

  const visibleCount = images.filter(img => img.v).length
  logger.info(`Extraction complete: ${images.length} images from ${allElements.length} elements`)
  logger.info(`Visible in viewport: ${visibleCount}/${images.length} images`)
  logger.info(`Extraction stopped because: ${images.length >= settings.maxImagesPerPage ? 'hit maxImagesPerPage limit' : 'finished scanning all elements'}`)
  logger.info(`Settings: maxImagesPerPage=${settings.maxImagesPerPage}, timeout=${settings.extractionTimeout}ms`)
  return images
}

async function createImageObject(url: string, element: Element, source: ImageSourceType, settings: ExtractionSettings): Promise<ExtractedImage | null> {
  try {
    // Skip data URLs if configured
    if (settings.skipDataUrls && url.startsWith('data:')) {
      return null
    }

    // Get format from URL
    const format = getImageFormat(url)
    if (!settings.allowedFormats.includes(format)) {
      return null
    }

    // Get dimensions based on element type and available properties
    const rect = element.getBoundingClientRect()
    let width: number | undefined
    let height: number | undefined

    if (source === 'img') {
      // Get width/height attributes from any element (img, source, etc.)
      const attrWidth = element.getAttribute('width') ? parseInt(element.getAttribute('width')!, 10) : undefined
      const attrHeight = element.getAttribute('height') ? parseInt(element.getAttribute('height')!, 10) : undefined

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
        (video.getAttribute('width') ? parseInt(video.getAttribute('width')!, 10) : undefined) ||
        (rect.width > 0 ? rect.width : undefined)
      height = video.videoHeight ||
        (video.getAttribute('height') ? parseInt(video.getAttribute('height')!, 10) : undefined) ||
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

    // Check size filters
    if (width && width < settings.minWidth) return null
    if (height && height < settings.minHeight) return null

    // Get alt text only if enabled (reduces payload size)
    const alt = settings.includeAltText
      ? ((element as HTMLImageElement).alt || (element as HTMLElement).title || undefined)
      : undefined

    // Check if element is visible in viewport
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
  } catch (error) {
    logger.warn('Error creating image object', error)
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

// Basic validation for image URLs
function isValidImageUrl(url: string): boolean {
  if (!url || url.length < 4) return false

  // Allow data URLs, relative paths, and absolute URLs
  if (url.startsWith('data:image/')) return true
  if (url.startsWith('http://') || url.startsWith('https://')) return true
  if (url.startsWith('/') || url.startsWith('./')) return true

  // Check for common image extensions
  const imageExtensions = /\.(jpg|jpeg|png|gif|webp|bmp|svg|ico|tiff?)(\?|#|$)/i
  return imageExtensions.test(url)
}

function extractUrlFromCss(cssValue: string): string | null {
  const match = cssValue.match(/url\(['"]?([^'")]*)['"]?\)/)
  return match ? match[1] : null
}

function getImageFormat(url: string): string {
  if (url.startsWith('data:image/')) {
    const match = url.match(/data:image\/([^;]+)/)
    return match ? match[1] : 'unknown'
  }

  const urlPath = url.split('?')[0] // Remove query params
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
  } catch (error) {
    logger.warn('Error checking viewport visibility', error)
    return false
  }
}

// Always try to initialize - init() will handle retries if Chrome context isn't ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
