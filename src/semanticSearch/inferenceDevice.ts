import type { SemanticInferenceDevice } from './settingsTypes.js'

export function inferenceDeviceLabel(device: 'webgpu' | 'wasm'): string {
  if (device === 'webgpu') {
    return 'GPU (WebGPU)'
  }
  return 'CPU (WebAssembly)'
}

export async function webGpuAvailable(): Promise<boolean> {
  if (!navigator.gpu) {
    return false
  }
  try {
    const adapter = await navigator.gpu.requestAdapter()
    return Boolean(adapter)
  } catch {
    return false
  }
}

function isExtensionPage(): boolean {
  return typeof location !== 'undefined' && location.protocol === 'chrome-extension:'
}

/** ORT WebGPU is not reliable in MV3 extension pages/workers; use WASM CPU. */
export function extensionInferenceIsCpuOnly(): boolean {
  return isExtensionPage()
}

export async function resolveInferenceDevice(
  preference: SemanticInferenceDevice,
): Promise<'webgpu' | 'wasm'> {
  if (extensionInferenceIsCpuOnly()) {
    return 'wasm'
  }
  const gpuOk = await webGpuAvailable()
  if (preference === 'cpu') {
    return 'wasm'
  }
  if (preference === 'webgpu') {
    return gpuOk ? 'webgpu' : 'wasm'
  }
  return gpuOk ? 'webgpu' : 'wasm'
}
