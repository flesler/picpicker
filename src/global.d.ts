import type { Browser } from 'webextension-polyfill'

// Loaded like this (as a .d.ts) doesn't get bundled with tsup
declare global {
  const browser: Browser
}
