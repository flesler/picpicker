import env from './env.js'
import type { MessageAction, Storage, StorageGet, StorageKeys } from './types.js'
import { DEFAULT_USER_SETTINGS } from './types.js'

// Constants for timeouts and limits
export const TIMEOUTS = {
  CONTEXT_RETRY: 1000,
  INIT_RETRY: 2000,
  STATUS_CLEAR_SHORT: 3000,
  STATUS_CLEAR_LONG: 5000,
  COPY_FEEDBACK: 2000,
} as const

// Logging utility to reduce repetition
const prefix = `${env.NAME}@${env.VERSION}`
export const logger = {
  info: (message: string, ...args: unknown[]) => {
    console.log(`${prefix}: ${message}`, ...args)
  },
  warn: (message: string, ...args: unknown[]) => {
    console.warn(`${prefix}: ${message}`, ...args)
  },
  error: (message: string, error?: unknown) => {
    console.error(`${prefix}: ${message}`, error)
  },
  debug: (message: string, ...args: unknown[]) => {
    if (env.NODE_ENV === 'development') {
      console.debug(`${prefix}: ${message}`, ...args)
    }
  },
} as const

// These HTML helpers make the code a bit shorter but a LOT shorter when minified
export function getElement<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null
}

export function getRequiredElement<T extends HTMLElement>(id: string): T {
  const element = getElement<T>(id)
  if (!element) throw new Error(`Required element not found: ${id}`)
  return element
}

export function addEvent<T extends HTMLElement>(id: string, event: string, callback: (event: Event) => void): T | null {
  const elem = getElement<T>(id)
  if (elem) {
    elem.addEventListener(event, callback)
  }
  return elem
}

export function querySelector<T extends Element>(selector: string) {
  return document.querySelector<T>(selector)
}

export function querySelectorAll<T extends Element>(selector: string) {
  return document.querySelectorAll<T>(selector)
}

export function truncate(text: string, maxLength: number = 30, suffix: string = '...'): string {
  return text.length > maxLength ? text.substring(0, maxLength) + suffix : text
}

export function sendMessage<T = unknown>(
  action: MessageAction,
  data: Record<string, unknown> = {},
): Promise<T> {
  return browser.runtime.sendMessage({ action, ...data })
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}

export function setInputValue(id: string, value: string | number | boolean) {
  const element = getElement<HTMLInputElement | HTMLSelectElement>(id)
  if (!element) return

  if (element.type === 'checkbox') {
    (element as HTMLInputElement).checked = Boolean(value)
  } else {
    element.value = String(value)
  }
}

export function getInputValue(id: string): string {
  const element = getElement<HTMLInputElement | HTMLSelectElement>(id)
  return element?.value || ''
}

export function getCheckboxValue(id: string): boolean {
  const element = getElement<HTMLInputElement>(id)
  return element?.checked || false
}

export function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// Simple auto-incrementing counter for unique IDs
let idCounter = 0

export function generateId(): string {
  return `img_${++idCounter}`
}

export function generateUniqueId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9)
}

export function getIso(): string {
  return new Date().toISOString()
}

export function getToday(): string {
  return getIso().split('T')[0]
}

export function populateSelectOptions(
  selectElement: HTMLSelectElement,
  options: Array<{ value: string; text: string }>,
  defaultOption?: { value: string; text: string },
) {
  selectElement.innerHTML = ''

  if (defaultOption) {
    const option = document.createElement('option')
    option.value = defaultOption.value
    option.textContent = defaultOption.text
    selectElement.appendChild(option)
  }

  options.forEach(({ value, text }) => {
    const option = document.createElement('option')
    option.value = value
    option.textContent = text
    selectElement.appendChild(option)
  })
}

export function showUINotification(message: string, type: 'success' | 'error' = 'success') {
  const statusElement = getElement('status')
  if (statusElement) {
    statusElement.textContent = message
    statusElement.className = `status ${type}`
    statusElement.style.display = 'block'

    setTimeout(() => {
      statusElement.style.display = 'none'
    }, 3000)
  }
}

export function confirmAction(message: string): boolean {
  return confirm(message)
}

export const execute = (fn: () => Promise<void>) => fn()

// Simple storage helpers - only user settings
const storageDefaults: Storage = {
  userSettings: DEFAULT_USER_SETTINGS,
}

export async function getStorage<K extends StorageKeys>(keys: K[]): Promise<StorageGet<K> & Partial<Storage>> {
  const result = await browser.storage.sync.get(keys)
  const typedResult = {} as StorageGet<K> & Partial<Storage>

  for (const key of keys) {
    if (key in storageDefaults) {
      ; (typedResult as any)[key] = result[key] ?? storageDefaults[key]
    }
  }

  return typedResult
}

export async function setStorage<K extends StorageKeys>(data: Partial<Pick<Storage, K>>): Promise<void> {
  return browser.storage.sync.set(data)
}
