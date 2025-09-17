// Browser API abstraction - handles webextension-polyfill loaded globally
import type { Browser } from 'webextension-polyfill'

importScripts('browser-polyfill.js')

// Global browser object loaded via importScripts in service worker / script tags in HTML
declare const globalThis: {
  browser: Browser
}

export default globalThis.browser || (global as any).browser as Browser
