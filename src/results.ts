import type { GetSessionDataRequest, GetSessionDataResponse } from './types.js'
import { type ExtractedImage, type ImageDisplayData, type PageInfo, MessageAction } from './types.js'
import { addEvent, generateId, getRequiredElement, hideElement, logger, querySelector, querySelectorAll, showElement, TIMEOUTS, toggleElement } from './utils.js'

// Display settings constants - no longer customizable via UI
const DISPLAY_SETTINGS = {
  thumbnailSize: 'medium' as 'small' | 'medium' | 'large',
  imagesPerRow: 0, // auto
  sortBy: 'original' as 'original' | 'size' | 'format' | 'name',
  showMetadata: true,
  gridView: true,
  saveAsDialog: false,
}

let allImages: ImageDisplayData[] = []
let filteredImages: ImageDisplayData[] = []
const selectedImages = new Set<string>()
const downloadedImages = new Set<string>() // Track downloaded images to avoid duplicates
let rangeStartIndex = -1 // For shift-click range start tracking
let currentImageIndex = 0 // For keyboard navigation focus
let currentPageInfo: PageInfo | null = null
let displaySettings = DISPLAY_SETTINGS
let totalDownloadCount = 0 // Historical count of all downloads ever

logger.info('results page loaded')

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await initializePage()
    setupEventListeners()
  } catch (err) {
    logger.error('Failed to initialize results page', err)
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
      const response = await browser.runtime.sendMessage<GetSessionDataRequest, GetSessionDataResponse>({
        action: MessageAction.GET_SESSION_DATA,
        sessionId: sessionId,
      })

      if (response.success && response.images && response.pageInfo) {
        currentPageInfo = response.pageInfo
        allImages = response.images.map(convertToDisplayData)

        // Sort images once - prioritize visible images first, then by original order
        allImages.sort((a, b) => {
          // First sort by visibility - visible images come first
          if (a.v && !b.v) return -1
          if (!a.v && b.v) return 1
          // If both have same visibility, maintain original order
          return 0
        })
      } else {
        throw new Error(response.error || 'Failed to load session data')
      }
    } catch (err) {
      logger.error('Failed to load session data', err)
      throw new Error('Failed to load images from session')
    }
  } else {
    throw new Error('No session ID provided')
  }

  // Load display settings and download count
  try {
    const result = await browser.storage.sync.get(['displaySettings', 'totalDownloadCount'])
    if (result.displaySettings) {
      displaySettings = { ...DISPLAY_SETTINGS, ...result.displaySettings }
    }
    if (typeof result.totalDownloadCount === 'number') {
      totalDownloadCount = result.totalDownloadCount
    }
  } catch (err) {
    logger.warn('Failed to load settings', err)
  }

  updateDownloadCounter()
  updatePageInfo()
  applyFilters()
  renderImages()
  restoreGridSize()
  restoreSaveAsPreference()

  // Hide loading
  hideElement('loading')
}

function restoreGridSize() {
  // Use saved size or default to medium
  const savedSize = displaySettings.thumbnailSize || 'medium'
  setGridSize(savedSize)
}

function restoreSaveAsPreference() {
  const checkbox = getRequiredElement<HTMLInputElement>('saveAsCheckbox')
  const saveAsDialog = displaySettings.saveAsDialog ?? DISPLAY_SETTINGS.saveAsDialog
  checkbox.checked = saveAsDialog
}

function convertToDisplayData(image: ExtractedImage): ImageDisplayData {
  return {
    ...image,
    id: generateId(),
  }
}

function updatePageInfo() {
  if (!currentPageInfo) return

  const pageLink = getRequiredElement<HTMLAnchorElement>('pageLink')
  pageLink.href = pageLink.title = currentPageInfo.url
  pageLink.textContent = currentPageInfo.title
}

function setupEventListeners() {
  addEvent('formatFilter', 'change', applyFilters)
  addEvent('sizeFilter', 'change', applyFilters)
  addEvent('sourceFilter', 'change', applyFilters)
  addEvent('visibilityFilter', 'change', applyFilters)

  querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = e.target as HTMLElement
      const size = target.dataset.size as 'small' | 'medium' | 'large'
      setGridSize(size)
    })
  })

  addEvent('saveAsCheckbox', 'change', (e) => {
    const target = e.target as HTMLInputElement
    setSaveAsPreference(target.checked)
  })

  addEvent('selectAll', 'click', selectAllImages)
  addEvent('selectNone', 'click', clearSelection)
  addEvent('downloadSelected', 'click', downloadSelectedImages)

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'a') {
      e.preventDefault()
      selectAllImages()
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      closeLightbox()
      return
    }

    // Arrow key navigation and spacebar toggle
    if (filteredImages.length > 0) {
      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault()
          navigateToImage((currentImageIndex + 1) % filteredImages.length)
          break
        case 'ArrowLeft':
          e.preventDefault()
          navigateToImage((currentImageIndex - 1 + filteredImages.length) % filteredImages.length)
          break
        case 'ArrowDown':
          e.preventDefault()
          navigateVertically(1)
          break
        case 'ArrowUp':
          e.preventDefault()
          navigateVertically(-1)
          break
        case ' ':
          e.preventDefault()
          toggleCurrentImage()
          break
        case 'Enter':
          e.preventDefault()
          handleEnterDownload()
          break
        case 'Home':
          e.preventDefault()
          navigateToImage(0)
          break
        case 'End':
          e.preventDefault()
          navigateToImage(filteredImages.length - 1)
          break
      }
    }
  })

  // Lightbox
  addEvent('lightbox', 'click', (e) => {
    const target = e.target as HTMLElement
    // Close lightbox unless clicking on the image itself
    if (target.tagName !== 'IMG') {
      closeLightbox()
    }
  })
  addEvent('lightboxClose', 'click', closeLightbox)
  addEvent('downloadCurrent', 'click', downloadCurrentImage)
  addEvent('copyUrl', 'click', copyCurrentImageUrl)

  // Populate all filter options with counts
  populateAllFilters()
}

function populateAllFilters() {
  populateFormatFilter()
  populateSizeFilter()
  populateSourceFilter()
  populateVisibilityFilter()
}

function populateFormatFilter() {
  const formatFilter = getRequiredElement<HTMLSelectElement>('formatFilter')

  // Count images by format
  const formatCounts = new Map<string, number>()
  allImages.forEach(img => {
    if (img.f) {
      formatCounts.set(img.f, (formatCounts.get(img.f) || 0) + 1)
    }
  })

  // Add options with counts
  Array.from(formatCounts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([format, count]) => {
      const option = document.createElement('option')
      option.value = format
      option.textContent = `${format.toUpperCase()} (${count})`
      formatFilter.appendChild(option)
    })
}

function populateSizeFilter() {
  const sizeFilter = getRequiredElement<HTMLSelectElement>('sizeFilter')

  // Count images by size category
  let smallCount = 0
  let mediumCount = 0
  let largeCount = 0

  allImages.forEach(img => {
    const maxDimension = Math.max(img.w || 0, img.h || 0)
    if (maxDimension < 100) {
      smallCount++
    } else if (maxDimension <= 500) {
      mediumCount++
    } else {
      largeCount++
    }
  })

  // Update existing options with counts
  const options = sizeFilter.querySelectorAll('option')
  options.forEach(option => {
    const value = option.value
    if (value === 'small') {
      option.textContent = `Small (<100px) (${smallCount})`
      option.disabled = smallCount === 0
    } else if (value === 'medium') {
      option.textContent = `Medium (100-500px) (${mediumCount})`
      option.disabled = mediumCount === 0
    } else if (value === 'large') {
      option.textContent = `Large (>500px) (${largeCount})`
      option.disabled = largeCount === 0
    }
  })
}

function populateSourceFilter() {
  const sourceFilter = getRequiredElement<HTMLSelectElement>('sourceFilter')

  // Count images by source type
  const sourceCounts = new Map<string, number>()
  allImages.forEach(img => {
    if (img.s) {
      sourceCounts.set(img.s, (sourceCounts.get(img.s) || 0) + 1)
    }
  })

  // Update existing options with counts (always show count, even if 0)
  const options = sourceFilter.querySelectorAll('option')
  options.forEach(option => {
    const value = option.value
    if (value) {
      const count = sourceCounts.get(value) || 0
      const labels = {
        'img': 'IMG tags',
        'bg': 'Backgrounds',
        'svg': 'SVG',
        'video': 'Video',
        'canvas': 'Canvas',
      }
      const label = labels[value as keyof typeof labels] || value
      option.textContent = `${label} (${count})`
      option.disabled = count === 0
    }
  })
}

function populateVisibilityFilter() {
  const visibilityFilter = getRequiredElement<HTMLSelectElement>('visibilityFilter')

  // Count images by visibility
  let visibleCount = 0
  let hiddenCount = 0

  allImages.forEach(img => {
    if (img.v) {
      visibleCount++
    } else {
      hiddenCount++
    }
  })

  // Update existing options with counts
  const options = visibilityFilter.querySelectorAll('option')
  options.forEach(option => {
    const value = option.value
    if (value === 'visible') {
      option.textContent = `Visible in viewport (${visibleCount})`
      option.disabled = visibleCount === 0
    } else if (value === 'hidden') {
      option.textContent = `Not visible (${hiddenCount})`
      option.disabled = hiddenCount === 0
    }
  })
}

function applyFilters() {
  const formatFilter = getRequiredElement<HTMLSelectElement>('formatFilter')
  const sizeFilter = getRequiredElement<HTMLSelectElement>('sizeFilter')
  const sourceFilter = getRequiredElement<HTMLSelectElement>('sourceFilter')
  const visibilityFilter = getRequiredElement<HTMLSelectElement>('visibilityFilter')

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

    return true
  })
  // Reset current image index when filters change
  currentImageIndex = 0

  renderImages()
}

function renderImages() {
  const grid = getRequiredElement('imageGrid')
  const noImages = getRequiredElement('noImages')

  if (filteredImages.length === 0) {
    hideElement(grid)
    showElement(noImages)
    return
  }

  grid.style.display = 'grid' // Must be 'grid' for CSS Grid layout
  hideElement(noImages)

  grid.textContent = ''

  filteredImages.forEach(image => {
    const item = createImageItem(image)
    grid.appendChild(item)
  })

  // Update focus after rendering
  updateImageFocus()
}

function createImageItem(image: ImageDisplayData): HTMLElement {
  const item = document.createElement('div')
  item.className = 'image-item'
  item.dataset.imageId = image.id

  const isSelected = selectedImages.has(image.id)
  const isDownloaded = downloadedImages.has(image.u)

  if (isSelected) item.classList.add('selected')

  const altText = image.a || ''
  const checkboxClass = isDownloaded ? 'image-checkbox downloaded' : 'image-checkbox'

  // Create image container
  const imageContainer = document.createElement('div')
  imageContainer.className = 'image-container'

  const checkbox = document.createElement('input')
  checkbox.type = 'checkbox'
  checkbox.className = checkboxClass
  if (isDownloaded) {
    checkbox.checked = true
    checkbox.disabled = true
  } else if (isSelected) {
    checkbox.checked = true
  }

  const img = document.createElement('img')
  img.src = image.u
  img.alt = altText
  img.loading = 'lazy'
  if (altText) {
    img.title = altText
  }

  imageContainer.appendChild(checkbox)
  imageContainer.appendChild(img)

  // Create image info
  const imageInfo = document.createElement('div')
  imageInfo.className = 'image-info'

  const sizeDiv = document.createElement('div')
  sizeDiv.className = 'size'
  sizeDiv.textContent = `${image.w || '?'} × ${image.h || '?'}`

  const formatSpan = document.createElement('span')
  formatSpan.className = 'format'
  formatSpan.textContent = (image.f || 'unknown').toUpperCase()

  imageInfo.appendChild(sizeDiv)
  imageInfo.appendChild(formatSpan)

  item.appendChild(imageContainer)
  item.appendChild(imageInfo)

  // Unified click handling with double-click detection
  const checkboxEl = item.querySelector('.image-checkbox') as HTMLInputElement
  let clickTimeout: ReturnType<typeof setTimeout> | null = null

  item.addEventListener('click', (e) => {
    const isCheckboxClick = e.target === checkboxEl
    const isCtrlClick = e.ctrlKey || e.metaKey
    const isShiftClick = e.shiftKey

    // Decide action: toggle selection OR open lightbox
    const shouldToggleSelection = isCheckboxClick || isCtrlClick

    if (shouldToggleSelection) {
      e.stopPropagation()

      const clickedIndex = filteredImages.findIndex(img => img.id === image.id)
      toggleImageSelection(image, clickedIndex)

      // Update keyboard focus to the clicked image
      currentImageIndex = clickedIndex
      updateImageFocus()

    } else if (isShiftClick && rangeStartIndex >= 0) {
      // SHIFT+CLICK: Range selection
      e.stopPropagation()
      const clickedIndex = filteredImages.findIndex(img => img.id === image.id)
      handleImageSelection(image.id, clickedIndex, true, false)

      // Update keyboard focus to the clicked image
      currentImageIndex = clickedIndex
      updateImageFocus()

    } else {
      // NORMAL CLICK: Delay opening lightbox to allow double-click detection
      if (clickTimeout) {
        clearTimeout(clickTimeout)
      }
      clickTimeout = setTimeout(() => {
        openLightbox(image)
        clickTimeout = null
      }, 300) // 300ms delay for double-click detection
    }
  })

  // Double-click handler for auto-download
  item.addEventListener('dblclick', (e) => {
    e.preventDefault()
    e.stopPropagation()

    // Cancel pending lightbox opening
    if (clickTimeout) {
      clearTimeout(clickTimeout)
      clickTimeout = null
    }

    const clickedIndex = filteredImages.findIndex(img => img.id === image.id)
    currentImageIndex = clickedIndex
    updateImageFocus()

    // Use the same logic as Enter key
    handleEnterDownload()
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
  const shortcutsContent = getRequiredElement('shortcutsContent')
  const bulkActionsContent = getRequiredElement('bulkActionsContent')
  const selectedCountElement = getRequiredElement('selectedCount')
  const downloadButton = getRequiredElement<HTMLButtonElement>('downloadSelected')

  const hasSelection = selectedCount > 0

  // Toggle content within the same container
  toggleElement(shortcutsContent, !hasSelection)
  toggleElement(bulkActionsContent, hasSelection)

  selectedCountElement.textContent = selectedCount.toString()
  downloadButton.disabled = selectedCount === 0
}

function updateSelectionUI() {
  // Update count and bulk actions
  updateSelectionCount()

  // Update visual selection state for ALL items
  querySelectorAll('.image-item').forEach(item => {
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
  filteredImages.forEach(image => {
    if (canSelectImage(image)) {
      selectedImages.add(image.id)
    }
  })
  rangeStartIndex = 0 // Range start from first image
  updateSelectionUI()
}

function clearSelection() {
  selectedImages.clear()
  rangeStartIndex = -1 // Reset range start
  updateSelectionUI()
}

function setGridSize(size: 'small' | 'medium' | 'large') {
  const grid = getRequiredElement('imageGrid')

  // Update button states
  querySelectorAll('.view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-size') === size)
  })

  // Update grid classes
  grid.className = `image-grid size-${size}`

  // Save preference
  displaySettings.thumbnailSize = size
  void browser.storage.sync.set({ displaySettings })
}

function setSaveAsPreference(saveAsDialog: boolean) {
  // Update setting and save
  displaySettings.saveAsDialog = saveAsDialog
  void browser.storage.sync.set({ displaySettings })
}

function openLightbox(image: ImageDisplayData) {
  const lightbox = getRequiredElement('lightbox')
  const lightboxImage = getRequiredElement<HTMLImageElement>('lightboxImage')

  lightboxImage.src = image.u
  lightboxImage.alt = image.a || ''

  // Update metadata using existing HTML structure
  const urlLink = getRequiredElement<HTMLAnchorElement>('metadataUrl')
  urlLink.href = urlLink.textContent = image.u
  getRequiredElement('metadataDimensions').textContent = `${image.w || '?'} × ${image.h || '?'}`
  getRequiredElement('metadataFormat').textContent = (image.f || 'unknown').toUpperCase()
  getRequiredElement('metadataSource').textContent = getSourceLabel(image.s)

  if (image.a) {
    getRequiredElement('metadataAltText').textContent = image.a
  }
  toggleElement('metadataAltRow', !!image.a)
  lightbox.classList.add('active')

  // Store current image for download
  lightbox.setAttribute('data-current-image', JSON.stringify(image))
}

function closeLightbox() {
  getRequiredElement('lightbox').classList.remove('active')
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
  const toDownload = selected.filter(img => !downloadedImages.has(img.u))
  if (toDownload.length === 0) {
    return
  }
  const skipped = selected.length - toDownload.length
  let success = 0
  let failed = 0
  for (const image of toDownload) {
    try {
      await downloadImage(image)
      success++
    } catch (err) {
      logger.warn('Failed to download image:', image.u, err)
      failed++
    }
  }
  logger.info(`Download results: ${success} success, ${failed} failed, ${skipped} skipped`)
}

async function downloadCurrentImage() {
  const image = getLightboxImage()
  if (image) {
    await downloadImage(image)
  }
}

async function downloadImage(image: ImageDisplayData) {
  try {
    // Use browser downloads API - only reliable method for CORS-restricted sites
    await browser.downloads.download({
      url: image.u,
      filename: generateFilename(image),
      saveAs: displaySettings.saveAsDialog,
    })
    downloadedImages.add(image.u) // Track as downloaded
    logger.info('Image downloaded', image.u)

    // Increment total download count
    await incrementDownloadCount()

    // Update UI to show downloaded state
    updateDownloadedUI()
  } catch (err) {
    logger.error('Failed to download image:', err)
  }
}

function generateFilename(image: ImageDisplayData): string {
  try {
    // Try to extract filename from URL
    const url = new URL(image.u)
    const pathname = url.pathname
    const filename = pathname.split('/').pop() || ''

    // Check if filename has a valid extension
    const hasExtension = /\.[a-zA-Z]{2,4}$/.test(filename)
    if (hasExtension && filename.length > 0) {
      return filename
    }
  } catch {
    // Invalid URL, fallback to generated name
  }

  // Fallback to generated filename
  const format = image.f || 'jpg'
  const timestamp = new Date().getTime()
  const domain = currentPageInfo?.url ? new URL(currentPageInfo.url).hostname : 'webpage'
  return `${domain}-${timestamp}.${format}`
}

function getLightboxImage(): ImageDisplayData | null {
  const lightbox = getRequiredElement('lightbox')
  const imageData = lightbox.getAttribute('data-current-image')
  if (imageData) {
    return JSON.parse(imageData) as ImageDisplayData
  }
  return null
}

async function copyCurrentImageUrl() {
  const image = getLightboxImage()
  if (image) {
    try {
      await navigator.clipboard.writeText(image.u)
      // Show brief feedback
      const button = getRequiredElement('copyUrl')
      const originalText = button.textContent
      button.textContent = 'Copied!'
      setTimeout(() => {
        button.textContent = originalText
      }, TIMEOUTS.COPY_FEEDBACK)
    } catch (err) {
      logger.error('Failed to copy URL', err)
    }
  }
}

function navigateToImage(newIndex: number) {
  // Update current index
  currentImageIndex = Math.max(0, Math.min(newIndex, filteredImages.length - 1))

  // Update visual focus
  updateImageFocus()

  // Scroll current image into view
  scrollCurrentImageIntoView()
}

function navigateVertically(direction: 1 | -1) {
  const columnsCount = calculateGridColumns()
  if (columnsCount <= 1) {
    // Fallback to sequential navigation if grid calculation fails
    navigateToImage((currentImageIndex + direction + filteredImages.length) % filteredImages.length)
    return
  }

  const currentRow = Math.floor(currentImageIndex / columnsCount)
  const currentCol = currentImageIndex % columnsCount

  const targetRow = currentRow + direction
  let targetIndex: number

  if (direction === 1) {
    // Moving down
    if (targetRow * columnsCount + currentCol >= filteredImages.length) {
      // Wrap to first row, same column
      targetIndex = currentCol
    } else {
      targetIndex = targetRow * columnsCount + currentCol
    }
  } else {
    // Moving up
    if (targetRow < 0) {
      // Wrap to last row, same column
      const lastRow = Math.floor((filteredImages.length - 1) / columnsCount)
      targetIndex = lastRow * columnsCount + currentCol
      // Make sure we don't go beyond array bounds
      if (targetIndex >= filteredImages.length) {
        targetIndex = filteredImages.length - 1
      }
    } else {
      targetIndex = targetRow * columnsCount + currentCol
    }
  }

  navigateToImage(targetIndex)
}

function calculateGridColumns(): number {
  const grid = getRequiredElement('imageGrid')

  // Get the first two image items to calculate column width
  const items = grid.querySelectorAll('.image-item')
  if (items.length < 2) return 1

  const firstItem = items[0] as HTMLElement
  const secondItem = items[1] as HTMLElement

  const firstRect = firstItem.getBoundingClientRect()
  const secondRect = secondItem.getBoundingClientRect()

  // If second item is on the same row (similar top position), count items in first row
  if (Math.abs(firstRect.top - secondRect.top) < 10) {
    // Count items in the first row
    let columnsCount = 1
    for (let i = 1; i < items.length; i++) {
      const itemRect = (items[i] as HTMLElement).getBoundingClientRect()
      if (Math.abs(itemRect.top - firstRect.top) < 10) {
        columnsCount++
      } else {
        break
      }
    }
    return columnsCount
  }

  // If only one item in first row, return 1
  return 1
}

function toggleCurrentImage() {
  if (filteredImages.length === 0) return

  const currentImage = filteredImages[currentImageIndex]
  if (!currentImage) return

  toggleImageSelection(currentImage, currentImageIndex)
}

function canSelectImage(image: ImageDisplayData): boolean {
  return !downloadedImages.has(image.u)
}

function toggleImageSelection(image: ImageDisplayData, currentIndex: number) {
  if (!canSelectImage(image)) {
    return // Don't allow selecting downloaded images
  }

  const isNowSelected = !selectedImages.has(image.id)
  if (isNowSelected) {
    selectedImages.add(image.id)
  } else {
    selectedImages.delete(image.id)
  }

  // Update range start for future shift-clicks
  rangeStartIndex = currentIndex

  // Update UI
  updateSelectionUI()
}

function updateImageFocus() {
  // Remove focus class from all items
  querySelectorAll('.image-item').forEach(item => {
    item.classList.remove('focused')
  })

  // Add focus class to current item
  if (filteredImages[currentImageIndex]) {
    const currentImageId = filteredImages[currentImageIndex].id
    const currentElement = querySelector(`[data-image-id="${currentImageId}"]`)
    if (currentElement) {
      currentElement.classList.add('focused')
    }
  }
}

function updateDownloadedUI() {
  // Update all image items to show downloaded state and deselect them
  querySelectorAll('.image-item').forEach(item => {
    const imageId = item.getAttribute('data-image-id')
    if (imageId) {
      const image = filteredImages.find(img => img.id === imageId)
      if (image && downloadedImages.has(image.u)) {
        // Remove from selection when downloaded
        selectedImages.delete(image.id)

        // Update visual state
        item.classList.remove('selected')
        const checkbox = item.querySelector('.image-checkbox') as HTMLInputElement
        if (checkbox && !checkbox.classList.contains('downloaded')) {
          checkbox.classList.add('downloaded')
          checkbox.checked = true
          checkbox.disabled = true
        }
      }
    }
  })

  // Update selection count after removing downloaded images
  updateSelectionCount()
}

async function incrementDownloadCount() {
  totalDownloadCount++
  try {
    await browser.storage.sync.set({ totalDownloadCount })
    updateDownloadCounter()
  } catch (err) {
    logger.error('Failed to save download count', err)
  }
}

function updateDownloadCounter() {
  getRequiredElement('totalDownloads').textContent = totalDownloadCount.toString()
}

function scrollCurrentImageIntoView() {
  if (filteredImages[currentImageIndex]) {
    const currentImageId = filteredImages[currentImageIndex].id
    const currentElement = querySelector(`[data-image-id="${currentImageId}"]`)
    if (currentElement) {
      currentElement.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      })
    }
  }
}

function handleEnterDownload() {
  if (filteredImages.length === 0) return

  const currentImage = filteredImages[currentImageIndex]
  if (!currentImage) return

  const isCurrentSelected = selectedImages.has(currentImage.id)

  if (isCurrentSelected) {
    // Current image is selected → download all selected
    void downloadSelectedImages()
  } else {
    // Current image is NOT selected → download just current
    downloadSingleImage(currentImage)
  }
}

function downloadSingleImage(image: ImageDisplayData) {
  // Check if already downloaded
  if (downloadedImages.has(image.u)) {
    logger.info('Image already downloaded, skipping:', image.u)
    return
  }

  void downloadImage(image)
}

function showError(message: string) {
  getRequiredElement('errorMessage').textContent = message
  toggleElement('errorDisplay', !!message)
}
