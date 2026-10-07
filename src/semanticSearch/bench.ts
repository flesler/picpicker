import env from '../env.js'
import type { WebGpuAdapterProbe } from './gpuAdapter.js'

export type PicPickerSemanticBench = {
  updatedAt: string
  device: 'webgpu' | 'wasm' | null
  /** `navigator.gpu` on results.html */
  adapterPage?: WebGpuAdapterProbe
  /** `navigator.gpu` inside embeddingWorker (inference realm) */
  adapterWorker?: WebGpuAdapterProbe
  /** @deprecated use adapterPage — kept for older scripts */
  adapter?: WebGpuAdapterProbe
  modelLoadMs?: number
  indexWallMs?: number
  indexEmbedMs?: number
  uniqueTexts?: number
  imageItems?: number
  /** Derived when indexing finishes — use for “is this feature useful?” checks */
  summary?: PicPickerSemanticBenchSummary
  queries: Array<{
    text: string
    embedMs: number
    scoreMs: number
    idCount: number
  }>
}

export type PicPickerSemanticBenchSummary = {
  modelLoadSec: number
  indexWallSec: number
  indexEmbedSec: number
  msPerUniqueText: number
  wallMsPerImageItem: number
  embedMsPerImageItem: number
}

const BENCH_LOG = '[PicPicker bench]'

export function logWebGpuAdapterProbe(
  host: 'results-page' | 'worker',
  probe: WebGpuAdapterProbe | null,
): void {
  if (env.NODE_ENV !== 'development') {
    return
  }
  if (!probe) {
    console.info(`${BENCH_LOG} ADAPTER host=${host} adapter=null`)
    return
  }
  console.info(
    `${BENCH_LOG} ADAPTER host=${host} hardware=${probe.hardware} `
    + `vendor=${probe.vendor} architecture=${probe.architecture} `
    + `description=${JSON.stringify(probe.description)}`,
  )
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export function withSemanticBenchSummary(bench: PicPickerSemanticBench): PicPickerSemanticBench {
  const unique = bench.uniqueTexts ?? 0
  const images = bench.imageItems ?? 0
  const indexWallMs = bench.indexWallMs
  const indexEmbedMs = bench.indexEmbedMs
  if (!indexWallMs || indexEmbedMs === undefined || unique <= 0 || images <= 0) {
    return bench
  }
  const summary: PicPickerSemanticBenchSummary = {
    modelLoadSec: round1((bench.modelLoadMs ?? 0) / 1000),
    indexWallSec: round1(indexWallMs / 1000),
    indexEmbedSec: round1(indexEmbedMs / 1000),
    msPerUniqueText: round1(indexEmbedMs / unique),
    wallMsPerImageItem: round1(indexWallMs / images),
    embedMsPerImageItem: round1(indexEmbedMs / images),
  }
  return { ...bench, summary }
}

/** Mutates logical bench state; always attaches `summary` when index fields are present. */
export function finalizeSemanticBench(bench: PicPickerSemanticBench): PicPickerSemanticBench {
  return withSemanticBenchSummary(bench)
}

export function publishSemanticBench(bench: PicPickerSemanticBench): void {
  const enriched = withSemanticBenchSummary(bench)
  if (env.NODE_ENV !== 'development') {
    return
  }
  const root = globalThis as typeof globalThis & { __picpickerSemanticBench?: PicPickerSemanticBench }
  root.__picpickerSemanticBench = enriched
  console.info(BENCH_LOG, enriched)
  const adapterForNote = enriched.adapterWorker ?? enriched.adapterPage ?? enriched.adapter
  if (enriched.summary) {
    const s = enriched.summary
    const device = enriched.device ?? 'unknown'
    const adapterNote = adapterForNote
      ? (adapterForNote.hardware ? 'adapter=hardware' : `adapter=software (${adapterForNote.description})`)
      : 'adapter=unknown'
    console.info(
      `${BENCH_LOG} INDEX `
      + `device=${device} ${adapterNote} `
      + `wall=${s.indexWallSec}s embed=${s.indexEmbedSec}s `
      + `unique=${enriched.uniqueTexts} images=${enriched.imageItems} `
      + `~${s.msPerUniqueText}ms/text `
      + `~${s.wallMsPerImageItem}ms/image (wall)`,
    )
  }
}
