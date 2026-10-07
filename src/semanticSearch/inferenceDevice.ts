import type { SemanticInferenceDevice } from './settingsTypes.js'
import { probeWebGpuAdapter, type WebGpuAdapterProbe } from './gpuAdapter.js'

export function inferenceDeviceLabel(
  device: 'webgpu' | 'wasm',
  adapter?: WebGpuAdapterProbe | null,
): string {
  if (device === 'webgpu') {
    if (adapter && !adapter.hardware) {
      return 'GPU (WebGPU, software — not your graphics card)'
    }
    return 'GPU (WebGPU)'
  }
  return 'CPU (WebAssembly)'
}

export async function webGpuAvailable(): Promise<boolean> {
  const probe = await probeWebGpuAdapter()
  return probe !== null
}

export { probeWebGpuAdapter, type WebGpuAdapterProbe }

export async function resolveInferenceDevice(
  preference: SemanticInferenceDevice,
): Promise<'webgpu' | 'wasm'> {
  const gpuOk = await webGpuAvailable()
  if (preference === 'cpu') {
    return 'wasm'
  }
  if (preference === 'webgpu') {
    return gpuOk ? 'webgpu' : 'wasm'
  }
  return gpuOk ? 'webgpu' : 'wasm'
}
