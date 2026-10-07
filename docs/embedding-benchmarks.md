# EmbeddingGemma semantic search — benchmark log

Living record of on-device indexing measurements (branch `embeddinggemma`, dev builds).  
**Dev builds:** when indexing finishes, the **semantic search status line** on the results page shows index wall time, ms/text, adapter description, and last query embed ms. Console lines (grep-friendly for automation):

- `[PicPicker bench] ADAPTER host=results-page|worker hardware=… description="…"`
- `[PicPicker bench] INDEX …`

Full JSON: `window.__picpickerSemanticBench` (`adapterPage`, `adapterWorker`, `summary`, `queries`).

**Related:** [embedding-experiment-closeout.md](./embedding-experiment-closeout.md) · architecture/UX plan on branch `embeddinggemma` → `docs/embedding-roadmap.md`

---

## Environment (PicPicker dev machine, 2026-10-07)

| Item | Value |
|------|--------|
| Extension | PicPicker 3.0.0 unpacked `ljgcopcinmncljioijbfnkgmlheianjk` |
| Model | `onnx-community/embeddinggemma-2-ONNX`, dtype `q4` |
| Inference host | `results.html` → module worker `embeddingWorker.js` |
| ORT device reported | `webgpu` (WebGPU EP loaded) |
| **Chrome WebGPU adapter** | **SwiftShader** (`google` / `swiftshader`) — **software**, not discrete NVIDIA |
| Adapter probes | `default`, `high-performance`, `low-power`, `compatibility` → **all SwiftShader** |

### Why this is not “real GPU” yet

Host has **NVIDIA GeForce RTX 4070 Laptop GPU**; `vulkaninfo` reports the discrete device. Extension `requestAdapter()` probes (Run A era) returned only **SwiftShader** — ORT `device: webgpu` on software Dawn (~1.84 s/text).

**`chrome://gpu` export (2026-10-07, `/tmp/about-gpu-*.txt`) — relevant chunks:**

| Signal | Value |
|--------|--------|
| Chrome | 154.0.8037.57, Linux 6.8, **X11** (`--ozone-platform=x11`) |
| Flags (already on) | `enable-unsafe-webgpu`, `enable-webgpu-developer-features`, `ForceEnableWebGpuInterop` |
| Top-level | **WebGPU: Hardware accelerated** · **Vulkan: Disabled** (compositor) · **WebGL: HW** on **Intel** |
| GPUs detected | **GPU0** NVIDIA `0x10de/0x2860` · **GPU1** Intel ADL **\*ACTIVE\*** · **Optimus: true** |
| GL renderer | ANGLE → **Intel Mesa**, not NVIDIA |
| **Dawn adapters** | (1) Intel OpenGLES compatibility — **Available** · (2) SwiftShader — **Blocklisted** · (3) **RTX 4070 Vulkan — Available** · (4) llvmpipe — Blocklisted |
| GPU log | `Should skip nVidia device named: nvidia-drm` (VA-API path; separate from Dawn) |

So the **4070 WebGPU adapter exists in Chrome**, but the browser session is **Optimus + Intel-active GL**; the extension still observed **SwiftShader** at the JS API — likely default adapter selection / laptop mux, not “no GPU in Chrome.”

**Things to try before Run B** (Linux Optimus — **ignore** `chrome://flags/#force-high-performance-gpu`; Chrome labels that flag **Windows-only**):

1. Launch Chrome on the **4070** (Ubuntu `nvidia-prime` often has **no** `prime-run` binary; use env vars):  
   ```bash
   __NV_PRIME_RENDER_OFFLOAD=1 __GLX_VENDOR_LIBRARY_NAME=nvidia google-chrome-stable
   ```  
   `prime-select query` should be `on-demand` (yours is). Quit all Chrome windows first, then run that from a terminal.
2. Optional extra flags (only if step 1 still shows Intel/SwiftShader in `adapter.info`): `--use-angle=vulkan`, `--enable-features=Vulkan` — see [Chrome WebGPU troubleshooting](https://developer.chrome.com/docs/web-platform/webgpu/troubleshooting-tips).
3. Sanity check on **results page** DevTools:  
   `(await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }))?.info.description` → should mention **4070**, not SwiftShader.
4. Re-run Fruit session; status line should show **`hardware GPU`** and **Run B** numbers below.

**Fallback:** Dawn also exposes **Intel OpenGLES** as *Available* on this machine — faster than SwiftShader if NVIDIA offload is painful, but still not the 4070.

Chrome is not exposing a hardware Dawn adapter to the extension JS API yet on this machine (see [roadmap §6](./embedding-roadmap.md#webgpu-in-manifest-v3-picpicker)).

**Retest checklist (hardware WebGPU):**

1. `chrome://gpu` — WebGPU hardware accelerated; adapter list shows NVIDIA (not only SwiftShader).
2. Linux: Chrome 144+ / 147+ defaults vary by GPU; may need `chrome://flags/#enable-unsafe-webgpu`, Vulkan, correct ICD (see [Chrome WebGPU troubleshooting](https://developer.chrome.com/docs/web-platform/webgpu/troubleshooting-tips)).
3. Re-run same session QA page; append a new run row below with `adapter.hardware: true`.

---

## QA fixture

| Field | Value |
|-------|--------|
| Page | [Wikipedia:Featured pictures/Plants/Fruits](https://en.wikipedia.org/wiki/Wikipedia:Featured_pictures/Plants/Fruits) (via Commons Fruit extract) |
| Session | `results.html?session=56rbl` |
| Grid rows | **160** |
| Unique index strings | **160** (each tile has distinct alt — no URL dedupe savings on this page) |
| Phase | Text-only (alt / filename / title), not vision |

---

## Runs

### Run A — 2026-10-07 (SwiftShader WebGPU, cached model)

**Conditions:** Clean page reload after extension rebuild; semantic search already enabled in settings; no competing benchmark agent.

| Metric | Value |
|--------|--------|
| `modelLoadMs` | 1,812 (~1.8 s, weights cached) |
| `indexWallMs` | 294,867 (**294.9 s**, ~4 min 55 s) |
| `indexEmbedMs` | 294,203 (**294.2 s**) |
| `uniqueTexts` / `imageItems` | 160 / 160 |
| `msPerUniqueText` | **1,838.8** |
| `wallMsPerImageItem` | **1,842.9** |
| Query `apple` `embedMs` | 1,354.8 (~1.35 s) |
| Query `apple` `scoreMs` | 2.2 |
| Query `idCount` | 160 |

**Console summary line:**

```text
[PicPicker bench] INDEX device=webgpu wall=294.9s embed=294.2s unique=160 images=160 ~1838.8ms/text ~1842.9ms/image (wall)
```

**UX assessment (this run):** **Fail** for product bar (~30 s wall on a typical page). Dominated by ~1.84 s per text embed × 160. Search-after-index is acceptable (~1.3 s/query).

**Extrapolation (same ~1.84 s/text, SwiftShader):**

| ~Unique texts | Approx. index wall |
|---------------|-------------------|
| 50 | ~92 s |
| 80 | ~147 s (~2.5 min) |
| 100 | ~184 s (~3 min) |
| 160 | ~295 s (measured) |

**Vision implication:** Text is the cheap path. If vision were ~similar cost per image at full N, **160 images ≈ 5+ minutes** on this stack — not shippable without hardware GPU, far lower ms/image, and indexing caps.

---

### Run B — hardware WebGPU (NVIDIA / real adapter)

*Pending — Chrome currently exposes only SwiftShader on dev machine. Record here after `probeWebGpuAdapter().hardware === true`.*

| Metric | Value |
|--------|--------|
| Adapter | *TBD* |
| `indexWallSec` | *TBD* |
| `msPerUniqueText` | *TBD* |
| Notes | Compare to Run A; target &lt;30 s wall for ~50–80 uniques on “average” page |

---

## How to add a run

1. Dev build: `npm run build`, reload extension, open results session.
2. Enable semantic search (or rely on saved settings).
3. Wait for status **Semantic search ready…** and console `INDEX` line.
4. Optional: run a query; `queries[]` in `__picpickerSemanticBench`.
5. Paste `summary` + adapter probe into a new subsection above.

---

*Last updated: 2026-10-07.*
