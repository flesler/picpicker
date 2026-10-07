/** auto = WebGPU when available, else CPU WASM; webgpu = GPU only; cpu = CPU WASM only */
export type SemanticInferenceDevice = 'auto' | 'webgpu' | 'cpu'

export interface SemanticSearchSettings {
  enabled: boolean
  disclosureAcceptedAt?: string
  mode: 'text-only'
  vectorDim: 256
  inferenceDevice: SemanticInferenceDevice
}

export const DEFAULT_SEMANTIC_SEARCH_SETTINGS: SemanticSearchSettings = {
  enabled: false,
  mode: 'text-only',
  vectorDim: 256,
  inferenceDevice: 'auto',
}
