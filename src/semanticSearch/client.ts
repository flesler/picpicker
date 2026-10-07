import type { ImageDisplayData } from '../types.js'
import { SEMANTIC_MODEL_DTYPE } from './constants.js'
import { queryText } from './documentText.js'
import { prepareSemanticIndexItems } from './indexItems.js'
import {
    extensionInferenceIsCpuOnly,
    inferenceDeviceLabel,
    resolveInferenceDevice,
} from './inferenceDevice.js'
import type { SemanticInferenceDevice } from './settingsTypes.js'
import type { EmbeddingWorkerRequest, EmbeddingWorkerResponse } from './workerMessages.js'

export type SemanticSearchPhase = 'idle' | 'loading-model' | 'indexing' | 'ready' | 'error'

export type SemanticSearchProgress = {
  phase: SemanticSearchPhase
  message: string
  current?: number
  total?: number
  indexedImageIds?: string[]
  inferenceDevice?: 'webgpu' | 'wasm'
}

type ProgressListener = (progress: SemanticSearchProgress) => void

export class SemanticSearchClient {
  private worker: Worker | null = null
  private modelReady = false
  private indexReady = false
  private onProgress: ProgressListener | null = null
  private loadResolve: (() => void) | null = null
  private loadReject: ((err: Error) => void) | null = null
  private indexResolve: (() => void) | null = null
  private indexReject: ((err: Error) => void) | null = null
  private pendingScores: {
    resolve: (scores: Record<string, number>) => void
    reject: (err: Error) => void
  } | null = null
  private activeInferenceDevice: 'webgpu' | 'wasm' | null = null
  private loadInProgress = false

  setProgressListener(listener: ProgressListener | null) {
    this.onProgress = listener
  }

  private emit(progress: SemanticSearchProgress) {
    this.onProgress?.(progress)
  }

  private getWorker(): Worker {
    if (!this.worker) {
      const url = browser.runtime.getURL('embeddingWorker.js')
      this.worker = new Worker(url, { type: 'module' })
      this.worker.onmessage = (event: MessageEvent<EmbeddingWorkerResponse>) => {
        this.handleWorkerMessage(event.data)
      }
      this.worker.onerror = () => {
        this.fail(new Error('Semantic search worker failed'))
      }
    }
    return this.worker
  }

  private fail(err: Error) {
    this.loadInProgress = false
    this.emit({ phase: 'error', message: err.message })
    this.loadReject?.(err)
    this.indexReject?.(err)
    this.pendingScores?.reject(err)
    this.loadResolve = null
    this.loadReject = null
    this.indexResolve = null
    this.indexReject = null
    this.pendingScores = null
  }

  private post(message: EmbeddingWorkerRequest) {
    this.getWorker().postMessage(message)
  }

  private handleWorkerMessage(message: EmbeddingWorkerResponse) {
    switch (message.type) {
    case 'progress':
      this.emit({
        phase: message.phase === 'download' ? 'loading-model' : 'indexing',
        message: message.message,
        current: message.current,
        total: message.total,
        indexedImageIds: message.indexedIds,
      })
      break
    case 'ready':
      this.modelReady = true
      this.activeInferenceDevice = message.device
      this.emit({
        phase: 'loading-model',
        message: `Model loaded on ${inferenceDeviceLabel(message.device)} — preparing index…`,
        inferenceDevice: message.device,
      })
      this.loadResolve?.()
      this.loadResolve = null
      this.loadReject = null
      break
    case 'indexed':
      this.indexReady = true
      this.indexResolve?.()
      this.indexResolve = null
      this.indexReject = null
      this.emit({ phase: 'ready', message: 'Semantic search ready' })
      break
    case 'scores':
      this.pendingScores?.resolve(message.scores)
      this.pendingScores = null
      break
    case 'error': {
      if (
        this.loadInProgress
        && !this.modelReady
        && /webgpu|backend not found/i.test(message.message)
      ) {
        this.emit({
          phase: 'loading-model',
          message: 'WebGPU failed — loading on CPU instead…',
        })
        break
      }
      const err = new Error(message.message)
      this.fail(err)
      break
    }
    default:
      break
    }
  }

  getInferenceDevice(): 'webgpu' | 'wasm' | null {
    return this.activeInferenceDevice
  }

  async start(
    images: ImageDisplayData[],
    pageTitle?: string,
    inferencePreference: SemanticInferenceDevice = 'auto',
  ): Promise<void> {
    this.modelReady = false
    this.indexReady = false
    const ortWasmEntryUrl = browser.runtime.getURL('wasm/ort-wasm-simd-threaded.jsep.mjs')
    const ortWasmBinaryUrl = browser.runtime.getURL('wasm/ort-wasm-simd-threaded.jsep.wasm')
    const transformersUrl = browser.runtime.getURL('vendor/transformers.web.js')
    const device = await resolveInferenceDevice(inferencePreference)
    const cpuOnlyExtension = extensionInferenceIsCpuOnly()
    let loadMessage = `Loading model on ${inferenceDeviceLabel(device)}…`
    if (cpuOnlyExtension && inferencePreference === 'webgpu') {
      loadMessage = 'GPU not available in extensions — loading on CPU (WebAssembly)…'
    }
    this.emit({
      phase: 'loading-model',
      message: loadMessage,
      inferenceDevice: device,
    })
    const loadPromise = new Promise<void>((resolve, reject) => {
      this.loadResolve = resolve
      this.loadReject = reject
    })
    this.loadInProgress = true
    this.post({
      type: 'load',
      ortWasmEntryUrl,
      ortWasmBinaryUrl,
      transformersUrl,
      device,
      dtype: SEMANTIC_MODEL_DTYPE,
    })
    await loadPromise
    this.loadInProgress = false
    const indexPromise = new Promise<void>((resolve, reject) => {
      this.indexResolve = resolve
      this.indexReject = reject
    })
    const items = prepareSemanticIndexItems(images, pageTitle)
    if (items.length > 0) {
      this.emit({
        phase: 'indexing',
        message: 'Indexing images for search…',
        current: 0,
        total: items.length,
      })
    }
    if (items.length === 0) {
      this.indexReady = true
      this.indexResolve?.()
      this.indexResolve = null
      this.indexReject = null
      this.emit({
        phase: 'ready',
        message: 'No indexable text on these images (need alt/labels or descriptive filenames)',
      })
      return
    }
    this.post({ type: 'index', items })
    await indexPromise
  }

  isModelReady(): boolean {
    return this.modelReady
  }

  async scoreQuery(userQuery: string, imageIds: string[]): Promise<Record<string, number>> {
    if (!this.modelReady || !userQuery.trim()) {
      return {}
    }
    const prefixed = queryText(userQuery)
    return new Promise((resolve, reject) => {
      this.pendingScores = { resolve, reject }
      this.post({ type: 'query', text: prefixed, ids: imageIds })
    })
  }

  dispose() {
    this.worker?.terminate()
    this.worker = null
    this.modelReady = false
    this.indexReady = false
    this.activeInferenceDevice = null
  }
}
