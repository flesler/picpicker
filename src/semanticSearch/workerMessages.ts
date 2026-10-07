export type SemanticModelDtype = 'q4' | 'q8' | 'fp32'

export type EmbeddingWorkerRequest =
  | {
    type: 'load'
    ortWasmEntryUrl: string
    ortWasmBinaryUrl: string
    /** JSEP wasm pair used when falling back from WebGPU to CPU */
    ortWasmFallbackEntryUrl: string
    ortWasmFallbackBinaryUrl: string
    transformersUrl: string
    device: 'webgpu' | 'wasm'
    dtype: SemanticModelDtype
  }
  | { type: 'index'; items: { id: string; text: string }[] }
  | { type: 'query'; text: string; ids: string[] }

export type EmbeddingWorkerResponse =
  | {
    type: 'progress'
    phase: 'download' | 'index'
    message: string
    current?: number
    total?: number
    indexedIds?: string[]
  }
  | {
    type: 'ready'
    device: 'webgpu' | 'wasm'
    bench?: { modelLoadMs: number }
    adapterProbe?: {
      hardware: boolean
      description: string
      vendor: string
      architecture: string
    }
  }
  | {
    type: 'indexed'
    embeddings: Record<string, number[]>
    bench?: {
      indexWallMs: number
      indexEmbedMs: number
      uniqueTexts: number
      imageItems: number
    }
  }
  | {
    type: 'scores'
    scores: Record<string, number>
    bench?: { queryEmbedMs: number; queryScoreMs: number; scoredIds: number }
  }
  | { type: 'error'; message: string }
