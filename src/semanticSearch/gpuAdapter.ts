type GpuAdapterLike = {
  info?: {
    description?: string
    vendor?: string
    architecture?: string
  }
}

type GpuNavigator = Navigator & {
  gpu?: {
    requestAdapter(options?: {
      powerPreference?: 'low-power' | 'high-performance'
      featureLevel?: 'compatibility' | 'core'
    }): Promise<GpuAdapterLike | null>
  }
}

export type WebGpuAdapterProbe = {
  /** False when Chrome handed back SwiftShader / software rasterization */
  hardware: boolean
  description: string
  vendor: string
  architecture: string
}

function isSoftwareAdapterDescription(description: string): boolean {
  return /swiftshader|llvmpipe|software raster|lavapipe/i.test(description)
}

function probeFromAdapter(adapter: GpuAdapterLike | null): WebGpuAdapterProbe | null {
  if (!adapter) {
    return null
  }
  const info = adapter.info
  const description = info?.description ?? ''
  return {
    hardware: !isSoftwareAdapterDescription(description),
    description,
    vendor: info?.vendor ?? '',
    architecture: info?.architecture ?? '',
  }
}

export async function probeWebGpuAdapter(): Promise<WebGpuAdapterProbe | null> {
  const gpu = (navigator as GpuNavigator).gpu
  if (!gpu) {
    return null
  }
  let adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' })
  let probe = probeFromAdapter(adapter)
  if (probe) {
    return probe
  }
  adapter = await gpu.requestAdapter({ powerPreference: 'low-power' })
  probe = probeFromAdapter(adapter)
  if (probe) {
    return probe
  }
  adapter = await gpu.requestAdapter()
  return probeFromAdapter(adapter)
}

export async function webGpuAdapterAvailable(): Promise<boolean> {
  const probe = await probeWebGpuAdapter()
  return probe !== null
}
