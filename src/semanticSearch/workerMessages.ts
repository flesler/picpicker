export type SemanticModelDtype = 'q4' | 'q8' | 'fp32'

export type EmbeddingWorkerRequest =
  | {
    type: 'load'
    ortWasmEntryUrl: string
    ortWasmBinaryUrl: string
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
  | { type: 'ready'; device: 'webgpu' | 'wasm' }
  | { type: 'indexed'; embeddings: Record<string, number[]> }
  | { type: 'scores'; scores: Record<string, number> }
  | { type: 'error'; message: string }
