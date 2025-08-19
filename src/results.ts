import JSZip from 'jszip'
import browser from 'webextension-polyfill'
import { type DisplaySettings, type ExtractedImage, type GetSessionDataResponse, type ImageDisplayData, type PageInfo, DEFAULT_DISPLAY_SETTINGS, MessageAction } from './types.js'
import { generateId, logger, TIMEOUTS, truncate } from './utils.js'

let allImages: ImageDisplayData[] = []
let filteredImages: ImageDisplayData[] = []
let selectedImages = new Set<string>()
let rangeStartIndex = -1 // For shift-click range start tracking
let currentPageInfo: PageInfo | null = null
let displaySettings: DisplaySettings = DEFAULT_DISPLAY_SETTINGS

logger.info('results page loaded')

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await initializePage()
    setupEventListeners()
  } catch (error) {
    logger.error('Failed to initialize results page', error)
    showError('Failed to load images. Please try again.')
  }
})

async function initializePage() {
  // Get session ID from URL parameters
  const urlParams = new URLSearchParams(window.location.search)
  const sessionId = urlParams.get('session')

  if (sessionId) {
    try {
      // Request session data from background script
      const response = await browser.runtime.sendMessage({
        action: MessageAction.GET_SESSION_DATA,
        sessionId: sessionId,
      }) as GetSessionDataResponse

      if (response.success && response.images && response.pageInfo) {
        currentPageInfo = response.pageInfo
        allImages = response.images.map(convertToDisplayData)
      } else {
        throw new Error(response.error || 'Failed to load session data')
      }
    } catch (error) {
      logger.error('Failed to load session data', error)
      throw new Error('Failed to load images from session')
    }
  } else {
    throw new Error('No session ID provided')
  }

  // Load display settings
  try {
    const result = await browser.storage.sync.get(['displaySettings'])
    if (result.displaySettings) {
      displaySettings = { ...DEFAULT_DISPLAY_SETTINGS, ...result.displaySettings }
    }
  } catch (error) {
    logger.warn('Failed to load display settings', error)
  }

  // Update page info
  updatePageInfo()

  // Apply initial filters and render
  applyFilters()
  renderImages()

  // Hide loading
  const loading = document.getElementById('loading')
  if (loading) loading.style.display = 'none'
}

function convertToDisplayData(image: ExtractedImage): ImageDisplayData {
  return {
    ...image,
    id: generateId(),
    estimatedSize: estimateFileSize(image),
    isDuplicate: false,
    originalUrl: image.u,
  }
}

function estimateFileSize(image: ExtractedImage): number {
  // Rough estimate based on dimensions and format
  const width = image.w || 200
  const height = image.h || 200
  const pixels = width * height

  switch (image.f) {
  case 'jpg':
  case 'jpeg':
    return Math.round(pixels * 0.1) // ~10% compression
  case 'png':
    return Math.round(pixels * 0.4) // ~40% of raw
  case 'gif':
    return Math.round(pixels * 0.2) // ~20% of raw
  case 'webp':
    return Math.round(pixels * 0.08) // ~8% compression
  default:
    return Math.round(pixels * 0.2)
  }
}

function updatePageInfo() {
  if (!currentPageInfo) return

  const titleElement = document.getElementById('pageTitle')
  const countElement = document.getElementById('imageCount')
  const urlElement = document.getElementById('pageUrl')

  if (titleElement) {
    const fullTitle = `Images from ${currentPageInfo.title}`
    titleElement.textContent = fullTitle
    titleElement.title = fullTitle
  }

  if (countElement) {
    countElement.textContent = `${allImages.length} images found`
  }

  if (urlElement) {
    const truncatedUrl = truncate(currentPageInfo.url, 50)
    urlElement.innerHTML = `<a href="${currentPageInfo.url}" target="_blank" rel="noopener noreferrer" style="color: #3b82f6; text-decoration: underline;">${truncatedUrl}</a>`
    urlElement.title = currentPageInfo.url
  }
}

function setupEventListeners() {
  // Filter controls
  const formatFilter = document.getElementById('formatFilter') as HTMLSelectElement
  const sizeFilter = document.getElementById('sizeFilter') as HTMLSelectElement
  const sourceFilter = document.getElementById('sourceFilter') as HTMLSelectElement
  const visibilityFilter = document.getElementById('visibilityFilter') as HTMLSelectElement
  const textSearch = document.getElementById('textSearch') as HTMLInputElement

  formatFilter?.addEventListener('change', applyFilters)
  sizeFilter?.addEventListener('change', applyFilters)
  sourceFilter?.addEventListener('change', applyFilters)
  visibilityFilter?.addEventListener('change', applyFilters)
  textSearch?.addEventListener('input', applyFilters)

  // Show text search if any image has alt text
  const hasAltText = allImages.some(img => img.a)
  const textSearchGroup = document.getElementById('textSearchGroup')
  if (textSearchGroup) {
    textSearchGroup.style.display = hasAltText ? 'block' : 'none'
  }

  // View controls
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = e.target as HTMLElement
      const size = target.dataset.size as 'small' | 'medium' | 'large'
      setGridSize(size)
    })
  })

  // Bulk actions
  document.getElementById('selectAll')?.addEventListener('click', selectAllImages)
  document.getElementById('selectNone')?.addEventListener('click', clearSelection)
  document.getElementById('downloadSelected')?.addEventListener('click', downloadSelectedImages)

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'a') {
      e.preventDefault()
      selectAllImages()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      closeLightbox()
    }
  })

  // Lightbox
  document.getElementById('lightbox')?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    // Close lightbox unless clicking on the image itself
    if (target.tagName !== 'IMG') {
      closeLightbox()
    }
  })
  document.getElementById('lightboxClose')?.addEventListener('click', closeLightbox)
  document.getElementById('downloadCurrent')?.addEventListener('click', downloadCurrentImage)
  document.getElementById('copyUrl')?.addEventListener('click', copyCurrentImageUrl)

  // Populate format filter options
  populateFormatFilter()
}

function populateFormatFilter() {
  const formatFilter = document.getElementById('formatFilter') as HTMLSelectElement
  if (!formatFilter) return

  const formats = new Set(allImages.map(img => img.f).filter(Boolean))
  formats.forEach(format => {
    const option = document.createElement('option')
    option.value = format!
    option.textContent = format!.toUpperCase()
    formatFilter.appendChild(option)
  })
}

function applyFilters() {
  const formatFilter = document.getElementById('formatFilter') as HTMLSelectElement
  const sizeFilter = document.getElementById('sizeFilter') as HTMLSelectElement
  const sourceFilter = document.getElementById('sourceFilter') as HTMLSelectElement
  const visibilityFilter = document.getElementById('visibilityFilter') as HTMLSelectElement
  const textSearch = document.getElementById('textSearch') as HTMLInputElement

  filteredImages = allImages.filter(image => {
    // Format filter
    if (formatFilter.value && image.f !== formatFilter.value) {
      return false
    }

    // Size filter
    if (sizeFilter.value) {
      const maxDimension = Math.max(image.w || 0, image.h || 0)
      switch (sizeFilter.value) {
      case 'small':
        if (maxDimension >= 100) return false
        break
      case 'medium':
        if (maxDimension < 100 || maxDimension > 500) return false
        break
      case 'large':
        if (maxDimension <= 500) return false
        break
      }
    }

    // Source filter
    if (sourceFilter.value && image.s !== sourceFilter.value) {
      return false
    }

    // Visibility filter
    if (visibilityFilter.value) {
      switch (visibilityFilter.value) {
        case 'visible':
          if (!image.v) return false
          break
        case 'hidden':
          if (image.v) return false
          break
      }
    }

    // Text search filter (alt text)
    if (textSearch?.value?.trim()) {
      const searchTerm = textSearch.value.toLowerCase().trim()
      const altText = image.a?.toLowerCase() || ''
      if (!altText.includes(searchTerm)) return false
    }

    return true
  })

  updateImageCount()
  renderImages()
}

function updateImageCount() {
  const countElement = document.getElementById('imageCount')
  if (countElement) {
    const total = allImages.length
    const filtered = filteredImages.length
    countElement.textContent = filtered === total
      ? `${total} images found`
      : `${filtered} of ${total} images`
  }
}

function renderImages() {
  const grid = document.getElementById('imageGrid')
  const noImages = document.getElementById('noImages')

  if (!grid || !noImages) return

  if (filteredImages.length === 0) {
    grid.style.display = 'none'
    noImages.style.display = 'block'
    return
  }

  grid.style.display = 'grid'
  noImages.style.display = 'none'

  grid.innerHTML = ''

  // Sort images - prioritize visible images first, then by original order
  const sortedImages = [...filteredImages].sort((a, b) => {
    // First sort by visibility - visible images come first
    if (a.v && !b.v) return -1
    if (!a.v && b.v) return 1

    // If both have same visibility, maintain original order
    return 0
  })

  sortedImages.forEach(image => {
    const item = createImageItem(image)
    grid.appendChild(item)
  })
}

function createImageItem(image: ImageDisplayData): HTMLElement {
  const item = document.createElement('div')
  item.className = 'image-item'
  item.dataset.imageId = image.id

  const isSelected = selectedImages.has(image.id)
  if (isSelected) item.classList.add('selected')

  const altText = image.a || ''
  const tooltipAttr = altText ? `title="${altText.replace(/"/g, '&quot;')}"` : ''

  item.innerHTML = `
    <div class="image-container">
      <input type="checkbox" class="image-checkbox" ${isSelected ? 'checked' : ''}>
      <img src="${image.u}" alt="${altText}" ${tooltipAttr} loading="lazy">
    </div>
    <div class="image-info">
      <div class="size">${image.w || '?'} × ${image.h || '?'}</div>
      <span class="format">${(image.f || 'unknown').toUpperCase()}</span>
    </div>
  `

  // Single unified click handler for the entire item
  const checkbox = item.querySelector('.image-checkbox') as HTMLInputElement
  const img = item.querySelector('img')

  item.addEventListener('click', (e) => {
    const isCheckboxClick = e.target === checkbox
    const isCtrlClick = e.ctrlKey || e.metaKey
    const isShiftClick = e.shiftKey

    // Decide action: toggle selection OR open lightbox
    const shouldToggleSelection = isCheckboxClick || isCtrlClick

    if (shouldToggleSelection) {
      e.stopPropagation()
      // Toggle selection state
      const isNowSelected = !selectedImages.has(image.id)
      if (isNowSelected) {
        selectedImages.add(image.id)
      } else {
        selectedImages.delete(image.id)
      }

      // Update UI for this item only
      item.classList.toggle('selected', isNowSelected)
      if (checkbox) {
        checkbox.checked = isNowSelected
      }

      // Update selection count
      updateSelectionCount()

      // Update range start for future shift-clicks
      const currentIndex = filteredImages.findIndex(img => img.id === image.id)
      rangeStartIndex = currentIndex

    } else if (isShiftClick && rangeStartIndex >= 0) {
      // SHIFT+CLICK: Range selection
      e.stopPropagation()
      const currentIndex = filteredImages.findIndex(img => img.id === image.id)
      handleImageSelection(image.id, currentIndex, true, false)

    } else if (e.target === img || e.target === item) {
      // NORMAL CLICK: Open lightbox (only for image or item background)
      openLightbox(image)
    }
  })

  return item
}

function handleImageSelection(imageId: string, currentIndex: number, isShiftClick: boolean, isCtrlClick: boolean) {
  if (isShiftClick && rangeStartIndex >= 0) {
    // Range selection from the original range start to current
    const startIndex = Math.min(rangeStartIndex, currentIndex)
    const endIndex = Math.max(rangeStartIndex, currentIndex)

    // Clear existing selection for clean range
    selectedImages.clear()

    for (let i = startIndex; i <= endIndex; i++) {
      if (i < filteredImages.length) {
        selectedImages.add(filteredImages[i].id)
      }
    }
  } else if (isCtrlClick) {
    // Toggle selection
    if (selectedImages.has(imageId)) {
      selectedImages.delete(imageId)
    } else {
      selectedImages.add(imageId)
    }
    // Don't change range start for ctrl+click
  } else {
    // Normal click - toggle current image and set new range start
    if (selectedImages.has(imageId)) {
      selectedImages.delete(imageId)
    } else {
      selectedImages.add(imageId)
    }
    // Set this as the new range start for future shift-clicks
    rangeStartIndex = currentIndex
  }

  updateSelectionUI()
  renderImages() // Re-render to update selection states
}

// Update only selection count and bulk actions (no checkbox changes)
function updateSelectionCount() {
  const selectedCount = selectedImages.size
  const bulkActions = document.getElementById('bulkActions')
  const selectedCountElement = document.getElementById('selectedCount')
  const downloadButton = document.getElementById('downloadSelected') as HTMLButtonElement

  if (bulkActions) {
    bulkActions.classList.toggle('active', selectedCount > 0)
  }

  if (selectedCountElement) {
    selectedCountElement.textContent = selectedCount.toString()
  }

  if (downloadButton) {
    downloadButton.disabled = selectedCount === 0
  }
}

function updateSelectionUI() {
  // Update count and bulk actions
  updateSelectionCount()

  // Update visual selection state for ALL items
  document.querySelectorAll('.image-item').forEach(item => {
    const imageId = item.getAttribute('data-image-id')
    const checkbox = item.querySelector('.image-checkbox') as HTMLInputElement
    if (imageId) {
      const isSelected = selectedImages.has(imageId)
      item.classList.toggle('selected', isSelected)
      if (checkbox) checkbox.checked = isSelected
    }
  })
}

function selectAllImages() {
  filteredImages.forEach(image => selectedImages.add(image.id))
  rangeStartIndex = 0 // Range start from first image
  updateSelectionUI()
}

function clearSelection() {
  selectedImages.clear()
  rangeStartIndex = -1 // Reset range start
  updateSelectionUI()
}

function setGridSize(size: 'small' | 'medium' | 'large') {
  const grid = document.getElementById('imageGrid')
  if (!grid) return

  // Update button states
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-size') === size)
  })

  // Update grid classes
  grid.className = `image-grid size-${size}`

  // Save preference
  displaySettings.thumbnailSize = size
  browser.storage.sync.set({ displaySettings })
}

function openLightbox(image: ImageDisplayData) {
  const lightbox = document.getElementById('lightbox')
  const lightboxImage = document.getElementById('lightboxImage') as HTMLImageElement
  const metadata = document.getElementById('lightboxMetadata')

  if (!lightbox || !lightboxImage || !metadata) return

  lightboxImage.src = image.u
  lightboxImage.alt = image.a || ''

  metadata.innerHTML = `
    <div><strong>URL:</strong> <a href="${image.u}" target="_blank" rel="noopener noreferrer" style="word-break: break-all; color: #3b82f6; text-decoration: underline;">${image.u}</a></div>
    <div><strong>Dimensions:</strong> ${image.w || '?'} × ${image.h || '?'}</div>
    <div><strong>Format:</strong> ${(image.f || 'unknown').toUpperCase()}</div>
    <div><strong>Source:</strong> ${getSourceLabel(image.s)}</div>
    ${image.a ? `<div><strong>Alt text:</strong> ${image.a}</div>` : ''}
  `

  lightbox.classList.add('active')

  // Store current image for download
  lightbox.setAttribute('data-current-image', JSON.stringify(image))
}

function closeLightbox() {
  const lightbox = document.getElementById('lightbox')
  if (lightbox) {
    lightbox.classList.remove('active')
  }
}

function getSourceLabel(source?: string): string {
  switch (source) {
  case 'img': return 'IMG Tag'
  case 'bg': return 'Background Image'
  case 'svg': return 'SVG Element'
  case 'video': return 'Video Poster'
  case 'canvas': return 'Canvas Element'
  default: return 'Unknown'
  }
}

async function downloadSelectedImages() {
  const selected = filteredImages.filter(img => selectedImages.has(img.id))
  if (selected.length === 0) return

  try {
    const zip = new JSZip()
    const downloadPromises: Promise<void>[] = []

    // Add each image to the ZIP
    for (let i = 0; i < selected.length; i++) {
      const image = selected[i]
      const promise = addImageToZip(zip, image, i + 1)
      downloadPromises.push(promise)
    }

    // Wait for all images to be added to ZIP
    await Promise.all(downloadPromises)

    // Generate ZIP file
    const zipBlob = await zip.generateAsync({ type: 'blob' })

    // Create download link
    const url = URL.createObjectURL(zipBlob)
    const now = new Date()
    const timestamp = now.toISOString().slice(0, 19).replace(/[T:]/g, '-')
    const siteName = currentPageInfo?.title.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30) || 'images'
    const filename = `${siteName}_${timestamp}.zip`

    // Download the ZIP
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    logger.info(`Downloaded ${selected.length} images as ${filename}`)
  } catch (error) {
    logger.error('Failed to create ZIP', error)
    alert(`Failed to create ZIP file: ${error}`)
  }
}

async function addImageToZip(zip: JSZip, image: ImageDisplayData, index: number): Promise<void> {
  try {
    const response = await fetch(image.u)
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`)

    const blob = await response.blob()
    const extension = getFileExtension(image.u, image.f || 'jpg')
    const filename = `image_${index.toString().padStart(3, '0')}.${extension}`

    zip.file(filename, blob)
  } catch (error) {
    logger.warn(`Failed to add image ${index} to ZIP`, error)
    // Continue with other images even if one fails
  }
}

function getFileExtension(url: string, format: string): string {
  // Try to get extension from URL first
  const urlMatch = url.match(/\.([a-zA-Z]{2,4})(?:\?|$)/)
  if (urlMatch) {
    return urlMatch[1].toLowerCase()
  }

  // Fall back to format
  return format.toLowerCase()
}

async function downloadCurrentImage() {
  const lightbox = document.getElementById('lightbox')
  const imageData = lightbox?.getAttribute('data-current-image')

  if (imageData) {
    const image = JSON.parse(imageData) as ImageDisplayData
    await downloadImage(image)
  }
}

async function downloadImage(image: ImageDisplayData) {
  try {
    const response = await fetch(image.u)
    const blob = await response.blob()

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = generateFilename(image)
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch (error) {
    logger.error('Failed to download image', error)
    alert('Failed to download image. It may be blocked by CORS policy.')
  }
}

function generateFilename(image: ImageDisplayData): string {
  const format = image.f || 'jpg'
  const timestamp = new Date().getTime()
  const domain = currentPageInfo?.url ? new URL(currentPageInfo.url).hostname : 'webpage'

  return `picpicker-${domain}-${timestamp}.${format}`
}

async function copyCurrentImageUrl() {
  const lightbox = document.getElementById('lightbox')
  const imageData = lightbox?.getAttribute('data-current-image')

  if (imageData) {
    const image = JSON.parse(imageData) as ImageDisplayData
    try {
      await navigator.clipboard.writeText(image.u)
      // Show brief feedback
      const button = document.getElementById('copyUrl')
      if (button) {
        const originalText = button.textContent
        button.textContent = 'Copied!'
        setTimeout(() => {
          button.textContent = originalText
        }, TIMEOUTS.COPY_FEEDBACK)
      }
    } catch (error) {
      logger.error('Failed to copy URL', error)
    }
  }
}

function showError(message: string) {
  const loading = document.getElementById('loading')
  if (loading) {
    loading.innerHTML = `
      <div style="color: #ef4444;">
        <h3>Error</h3>
        <p>${message}</p>
      </div>
    `
  }
}
