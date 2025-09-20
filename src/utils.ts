import env from './env.js'

// Constants for timeouts and limits
export const TIMEOUTS = {
  CONTEXT_RETRY: 1000,
  INIT_RETRY: 2000,
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
  selectElement.textContent = ''

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

