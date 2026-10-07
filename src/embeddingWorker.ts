import { SEMANTIC_MODEL_ID } from './semanticSearch/constants.js'
import { probeWebGpuAdapter } from './semanticSearch/gpuAdapter.js'
import type { EmbeddingWorkerRequest, EmbeddingWorkerResponse, SemanticModelDtype } from './semanticSearch/workerMessages.js'

const INDEX_BATCH_SIZE = 4
const INDEX_YIELD_MS = 16

interface LoadedTransformers {
  env: {
    backends: { onnx: { wasm?: { wasmPaths?: string | { mjs?: string; wasm?: string }; numThreads?: number; proxy?: boolean } } }
    allowLocalModels: boolean
    allowRemoteModels: boolean
    useBrowserCache: boolean
    useWasmCache: boolean
  }
  pipeline: (
    task: 'feature-extraction',
    model: string,
    options?: Record<string, unknown>,
  ) => Promise<TextEmbedder>
}

interface TextEmbedder {
  (inputs: string[], options?: { pooling?: string; normalize?: boolean }): Promise<{ tolist: () => unknown }>
}

let downloadBytesLoaded = 0
let downloadBytesTotal = 0
let downloadCompleteUiPosted = false
let transformersImportUrl: string | null = null
let transformersModule: LoadedTransformers | null = null
let extractor: TextEmbedder | null = null
const embeddingById = new Map<string, number[]>()

async function loadTransformers(): Promise<LoadedTransformers> {
  if (!transformersModule) {
    if (!transformersImportUrl) {
      throw new Error('Transformers URL not configured')
    }
    // eslint-disable-next-line no-unsanitized/method -- URL from parent via getURL()
    transformersModule = await import(transformersImportUrl) as LoadedTransformers
  }
  return transformersModule
}

function post(message: EmbeddingWorkerResponse) {
  self.postMessage(message)
}

function configureWasmPaths(
  env: LoadedTransformers['env'],
  ortWasmEntryUrl: string,
  ortWasmBinaryUrl: string,
) {
  const onnx = env.backends.onnx as { wasm?: Record<string, unknown> }
  if (!onnx.wasm) {
    onnx.wasm = {}
  }
  // Mutate in place — ORT reads ONNX_ENV.wasm; replacing env.backends.onnx breaks that link.
  onnx.wasm.wasmPaths = {
    mjs: ortWasmEntryUrl,
    wasm: ortWasmBinaryUrl,
  }
  onnx.wasm.numThreads = 1
  onnx.wasm.proxy = false
}

function postDownloadProgress() {
  if (downloadBytesTotal <= 0) {
    return
  }
  if (downloadBytesLoaded >= downloadBytesTotal) {
    if (!downloadCompleteUiPosted) {
      downloadCompleteUiPosted = true
      post({
        type: 'progress',
        phase: 'download',
        message: 'Download complete — initializing model (can take 1–2 min)…',
      })
    }
    return
  }
  post({
    type: 'progress',
    phase: 'download',
    message: 'Downloading model…',
    current: downloadBytesLoaded,
    total: downloadBytesTotal,
  })
}

function vectorsFromModelOutput(output: { tolist: () => unknown }): number[][] {
  const data = output.tolist()
  if (!Array.isArray(data) || !data.length) {
    return []
  }
  if (typeof (data as number[][])[0]?.[0] === 'number') {
    return data as number[][]
  }
  return (data as number[][][]).map((row) => row[0])
}

async function loadModel(
  ortWasmEntryUrl: string,
  ortWasmBinaryUrl: string,
  device: 'webgpu' | 'wasm',
  dtype: SemanticModelDtype,
) {
  const { env, pipeline } = await loadTransformers()
  // MV3 CSP blocks blob: script URLs; useWasmCache would blob-wrap ort.wasm.min.mjs.
  env.useWasmCache = false
  configureWasmPaths(env, ortWasmEntryUrl, ortWasmBinaryUrl)
  env.allowLocalModels = false
  env.allowRemoteModels = true
  env.useBrowserCache = true
  downloadBytesLoaded = 0
  downloadBytesTotal = 0
  downloadCompleteUiPosted = false
  post({ type: 'progress', phase: 'download', message: 'Downloading embedding model (one-time)…' })
  extractor = (await pipeline('feature-extraction', SEMANTIC_MODEL_ID, {
    device,
    dtype,
    progress_callback: (progress: { status: string; loaded?: number; total?: number }) => {
      if (progress.status !== 'progress_total' || !progress.total || progress.loaded === undefined) {
        return
      }
      downloadBytesLoaded = Math.max(downloadBytesLoaded, progress.loaded)
      downloadBytesTotal = Math.max(downloadBytesTotal, progress.total)
      postDownloadProgress()
    },
  }))
}

async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!extractor) {
    throw new Error('Model not loaded')
  }
  const output = await extractor(texts, { pooling: 'mean', normalize: true })
  return vectorsFromModelOutput(output)
}

interface IndexJob {
  items: { id: string; text: string }[]
  uniqueTexts: string[]
  vectorsByText: Map<string, number[]>
  uniqueOffset: number
}

let indexJob: IndexJob | null = null
let indexWallStartMs = 0
let indexEmbedMs = 0

function beginIndex(items: { id: string; text: string }[]) {
  indexWallStartMs = performance.now()
  indexEmbedMs = 0
  embeddingById.clear()
  const uniqueTexts: string[] = []
  const seenText = new Set<string>()
  for (const item of items) {
    if (!seenText.has(item.text)) {
      seenText.add(item.text)
      uniqueTexts.push(item.text)
    }
  }
  indexJob = {
    items,
    uniqueTexts,
    vectorsByText: new Map(),
    uniqueOffset: 0,
  }
  scheduleIndexBatch()
}

function scheduleIndexBatch() {
  setTimeout(() => {
    void runIndexBatch().catch((err: unknown) => {
      const text = err instanceof Error ? err.message : String(err)
      post({ type: 'error', message: text })
    })
  }, INDEX_YIELD_MS)
}

async function runIndexBatch() {
  const job = indexJob
  if (!job) {
    return
  }
  const { items, uniqueTexts } = job
  if (job.uniqueOffset >= uniqueTexts.length) {
    const embeddings: Record<string, number[]> = {}
    embeddingById.forEach((vector, id) => {
      embeddings[id] = vector
    })
    indexJob = null
    const indexWallMs = performance.now() - indexWallStartMs
    post({
      type: 'indexed',
      embeddings,
      bench: {
        indexWallMs,
        indexEmbedMs,
        uniqueTexts: uniqueTexts.length,
        imageItems: items.length,
      },
    })
    return
  }

  const batchStart = job.uniqueOffset
  const batchTexts = uniqueTexts.slice(batchStart, batchStart + INDEX_BATCH_SIZE)
  job.uniqueOffset += batchTexts.length

  if (batchStart === 0) {
    post({
      type: 'progress',
      phase: 'index',
      message: 'Warming up model (first embedding can take a moment)…',
      current: 0,
      total: items.length,
    })
  }

  const embedStart = performance.now()
  const batchVectors = await embedTexts(batchTexts)
  indexEmbedMs += performance.now() - embedStart
  batchTexts.forEach((text, j) => {
    job.vectorsByText.set(text, batchVectors[j])
  })

  const newlyIndexedIds: string[] = []
  let done = 0
  for (const item of items) {
    const vector = job.vectorsByText.get(item.text)
    if (!vector) {
      continue
    }
    done += 1
    if (!embeddingById.has(item.id)) {
      embeddingById.set(item.id, vector)
      newlyIndexedIds.push(item.id)
    }
  }
  post({
    type: 'progress',
    phase: 'index',
    message: 'Indexing images for search…',
    current: done,
    total: items.length,
    indexedIds: newlyIndexedIds,
  })
  scheduleIndexBatch()
}

async function scoreQuery(query: string, ids: string[]) {
  if (!extractor) {
    throw new Error('Model not loaded')
  }
  const embedStart = performance.now()
  const queryVector = (await embedTexts([query]))[0]
  const queryEmbedMs = performance.now() - embedStart
  const scoreStart = performance.now()
  const scores: Record<string, number> = {}
  for (const id of ids) {
    const docVector = embeddingById.get(id)
    if (!docVector) {
      continue
    }
    let dot = 0
    for (let i = 0; i < queryVector.length; i++) {
      dot += queryVector[i] * docVector[i]
    }
    scores[id] = dot
  }
  const queryScoreMs = performance.now() - scoreStart
  post({
    type: 'scores',
    scores,
    bench: { queryEmbedMs, queryScoreMs, scoredIds: ids.length },
  })
}

self.onmessage = async (event: MessageEvent<EmbeddingWorkerRequest>) => {
  try {
    const message = event.data
    switch (message.type) {
    case 'load': {
        const modelLoadStart = performance.now()
        const adapterProbe = await probeWebGpuAdapter()
      transformersImportUrl = message.transformersUrl
      let activeDevice = message.device
        if (activeDevice === 'webgpu' && !adapterProbe) {
        activeDevice = 'wasm'
      }
        let ortEntryUrl = message.ortWasmEntryUrl
        let ortBinaryUrl = message.ortWasmBinaryUrl
        if (activeDevice === 'wasm') {
          ortEntryUrl = message.ortWasmFallbackEntryUrl
          ortBinaryUrl = message.ortWasmFallbackBinaryUrl
        }
      try {
        await loadModel(ortEntryUrl, ortBinaryUrl, activeDevice, message.dtype)
      } catch (loadErr) {
        if (activeDevice !== 'webgpu') {
          throw loadErr
        }
        extractor = null
        post({
          type: 'progress',
          phase: 'download',
          message: 'WebGPU failed — loading on CPU (WebAssembly) instead…',
        })
        activeDevice = 'wasm'
        await loadModel(
          message.ortWasmFallbackEntryUrl,
          message.ortWasmFallbackBinaryUrl,
          'wasm',
          message.dtype,
        )
      }
        const modelLoadMs = performance.now() - modelLoadStart
        post({
          type: 'ready',
          device: activeDevice,
          bench: { modelLoadMs },
          adapterProbe: adapterProbe ?? undefined,
        })
      break
    }
    case 'index':
      beginIndex(message.items)
      break
    case 'query':
      await scoreQuery(message.text, message.ids)
      break
    default:
      post({ type: 'error', message: 'Unknown worker message' })
    }
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err)
    post({ type: 'error', message: text })
  }
}
