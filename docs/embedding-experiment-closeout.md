# EmbeddingGemma semantic search — experiment close-out (2026-10-07)

PicPicker explored **optional on-device text semantic search** (EmbeddingGemma 2 + Transformers.js) on branch **`embeddinggemma`**. It was **not merged to `main`**. This document records outcomes for anyone revisiting the idea.

**Measurements:** [embedding-benchmarks.md](./embedding-benchmarks.md)  
**Full plan (branch only):** `embedding-roadmap.md` on `origin/embeddinggemma`.

---

## Verdict

**Not shippable in current form** for the stated bar: indexing must feel fast enough on typical pages, and vision later must be feasible on GPU.

| Area | Outcome |
|------|---------|
| MV3 + module worker + ORT WebGPU bundle | **Technically plausible** once `onnxruntime-web/webgpu` is bundled (no alias to `/wasm`). |
| Linux dev machine (RTX 4070, Optimus) | **Unreliable GPU path**: often SwiftShader or **GPU process EGL failure** → **WASM CPU** (~5 min for 160 text embeds). |
| Product UX (text-only phase) | **Too slow** on observed paths; vision would be worse per image. |

Recommendation: **pause** until a **hardware WebGPU** run on Chrome desktop shows **&lt; ~30 s** wall time for ~50–80 unique strings on a representative page, or choose a different approach (smaller model, caps, non-extension runtime).

---

## What landed on `embeddinggemma` (not on `main`)

- Opt-in semantic search on results page; lexical search immediate; embeddings in `embeddingWorker`.
- WebGPU attempt: real ORT WebGPU vendor bundle, JSEP/asyncify wasm paths, worker `requestAdapter()` probe.
- Dev instrumentation: `[PicPicker bench]`, `window.__picpickerSemanticBench`, adapter logging (`adapterPage` / `adapterWorker`).

---

## What we ruled out or deprioritized

- Forcing **CPU-only** on all `chrome-extension://` origins (incorrect; removed on branch).
- **`prime-run`** on Ubuntu 22.04 (not installed); `__NV_PRIME_RENDER_OFFLOAD=…` led to **GPU process init failure** (`Invalid visual ID` / EGL) in at least one session.
- Windows-only Chrome flag **`#force-high-performance-gpu`** (not applicable on Linux).

---

## If resuming later

1. Check out `embeddinggemma`, build unpacked extension, confirm `chrome://gpu` and console:  
   `[PicPicker bench] ADAPTER host=worker hardware=true` with a real GPU description (not SwiftShader / `adapter=null`).
2. Re-run [Wikipedia Fruits QA](https://en.wikipedia.org/wiki/Wikipedia:Featured_pictures/Plants/Fruits); fill **Run B** in [embedding-benchmarks.md](./embedding-benchmarks.md).
3. Read UX targets on branch in `docs/embedding-roadmap.md` before vision work.

---

*`main` has no embedding code or model download. Branch `embeddinggemma` is the code archive.*
