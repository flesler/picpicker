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

export enum MessageAction {
  EXTRACT_IMAGES = 'extractImages',
  GET_SESSION_DATA = 'getSessionData',
}

export interface ExtractImagesRequest {
  action: MessageAction.EXTRACT_IMAGES
}

export interface GetSessionDataRequest {
  action: MessageAction.GET_SESSION_DATA
  sessionId: string
}

export interface GetSessionDataResponse {
  success?: boolean
  error?: string
  images?: ExtractedImage[]
  pageInfo?: PageInfo
}

