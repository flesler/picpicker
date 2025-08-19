// Core extracted image object (minimal for message passing)
// Using short keys to minimize JSON payload size when sending 500+ images

// Strongly typed image source types
export type ImageSourceType = 'img' | 'bg' | 'svg' | 'canvas' | 'video'

export interface ExtractedImage {
  u: string              // url
  w?: number             // width
  h?: number             // height
  a?: string             // alt
  f?: string             // format (jpg, png, etc.)
  s?: ImageSourceType    // source type
  v: boolean             // visibleInViewport
}

// Extended image data for results page display
export interface ImageDisplayData extends ExtractedImage {
  id: string
}

// Page information for results display
export interface PageInfo {
  title: string
  url: string
  extractedAt: string
}

// User configurable extraction settings
export interface ExtractionSettings {
  // Size filters
  minWidth: number              // Default: 50px
  minHeight: number             // Default: 50px
  maxFileSize: number           // Default: 50MB (in bytes)

  // Source filters
  includeImgTags: boolean       // Default: true
  includeBackgrounds: boolean   // Default: true
  includeSvg: boolean           // Default: true
  includeCanvas: boolean        // Default: false (performance)
  includeVideoPoster: boolean   // Default: true
  includeAltText: boolean       // Default: false (reduces payload size)

  // Quality filters
  allowedFormats: string[]      // Default: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg']
  skipDataUrls: boolean         // Default: true (usually small icons)

  // Performance
  maxImagesPerPage: number      // Default: 500
  extractionTimeout: number     // Default: 10000ms
}

// Display settings for results page
export interface DisplaySettings {
  thumbnailSize: 'small' | 'medium' | 'large'    // Default: 'medium'
  imagesPerRow: number                            // Default: auto
  sortBy: 'original' | 'size' | 'format' | 'name' // Default: 'original'
  showMetadata: boolean                           // Default: true
  gridView: boolean                               // Default: true (vs list)
}

// Combined user preferences
export interface UserSettings {
  extraction: ExtractionSettings
  display: DisplaySettings
  enableKeyboardShortcut: boolean                 // Default: true (Ctrl+Shift+I)
}

export enum MessageAction {
  EXTRACT_IMAGES = 'extractImages',
  GET_EXTRACTION_SETTINGS = 'getExtractionSettings',
  SAVE_EXTRACTION_SETTINGS = 'saveExtractionSettings',
  CREATE_RESULTS_TAB = 'createResultsTab',
  GET_SESSION_DATA = 'getSessionData',
  OPEN_POPUP = 'openPopup',
}

export const DEFAULT_EXTRACTION_SETTINGS: ExtractionSettings = {
  minWidth: 50,
  minHeight: 50,
  maxFileSize: 50 * 1024 * 1024, // 50MB
  includeImgTags: true,
  includeBackgrounds: true,
  includeSvg: true,
  includeAltText: true,
  includeVideoPoster: true,
  includeCanvas: false,
  allowedFormats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'],
  skipDataUrls: true,
  maxImagesPerPage: 1000,
  extractionTimeout: 10000,
}

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  thumbnailSize: 'medium',
  imagesPerRow: 0, // auto
  sortBy: 'original',
  showMetadata: true,
  gridView: true,
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  extraction: DEFAULT_EXTRACTION_SETTINGS,
  display: DEFAULT_DISPLAY_SETTINGS,
  enableKeyboardShortcut: true,
}

export interface StorageResult {
  [key: string]: unknown
  userSettings?: Partial<UserSettings>
}

// Ultra-simple storage - only user settings
export interface Storage {
  userSettings: UserSettings
}

// Helper type for partial storage keys
export type StorageKeys = keyof Storage
export type StorageGet<K extends StorageKeys> = Pick<Storage, K>

export interface MessageRequest {
  action: MessageAction
  [key: string]: unknown
}

export interface ExtractImagesRequest extends MessageRequest {
  action: MessageAction.EXTRACT_IMAGES
  settings?: Partial<ExtractionSettings>  // For content script calls
  tabId?: number                          // For background script calls from popup
}

export interface CreateResultsTabRequest extends MessageRequest {
  action: MessageAction.CREATE_RESULTS_TAB
  images: ExtractedImage[]
  pageInfo: PageInfo
}

export interface GetSessionDataRequest extends MessageRequest {
  action: MessageAction.GET_SESSION_DATA
  sessionId: string
}

export interface GetSessionDataResponse extends MessageResponse {
  images?: ExtractedImage[]
  pageInfo?: PageInfo
}

export interface MessageResponse {
  success?: boolean
  error?: string
}

export interface ExtractImagesResponse extends MessageResponse {
  images: ExtractedImage[]
}

