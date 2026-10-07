# Semantic image search roadmap (EmbeddingGemma 2)

Plan for optional, on-device **text → image** search in PicPicker using Google’s **EmbeddingGemma 2**. All inference stays local; model weights are fetched only after explicit opt-in.

**Status:** Phase 1 shipped in v3.0.0 (text-only semantic search, opt-in). Vision indexing not yet implemented.  
**Primary references:** [Model card](https://ai.google.dev/gemma/docs/embeddinggemma/model_card_2) · [Developer guide](https://developers.googleblog.com/embeddinggemma-2-the-developer-guide/) · [ONNX for Transformers.js](https://huggingface.co/onnx-community/embeddinggemma-2-ONNX)

---

## 1. Goals and non-goals

### Goals

- Let users type a natural-language query on the **results** page and rank extracted images by visual/semantic similarity.
- Keep **queries and image pixels on-device** (no PicPicker backend, no analytics).
- Preserve the **activeTab / on-click** extraction model; semantic search runs only on data the user already chose to extract.
- Make the feature **opt-in**, with clear warnings about download size, CPU/GPU use, and the one-time network fetch for model files.

### Non-goals (initial releases)

- Cross-session “search my entire browsing history.”
- Audio/video embedding (EG2 supports them; PicPicker does not extract those today).
- Cloud sync of indexes or shared team search.
- Bundling hundreds of MB of weights inside the store `.zip` (prefer on-demand download + local cache).

---

## 2. Why EmbeddingGemma 2

| Requirement | EG2 fit |
|-------------|---------|
| Text query vs image content | Shared 768-d space; query uses text task prefix (`SearchQuery`); images encoded without text prefix |
| Runs on consumer hardware | ~440M params for text + vision (audio encoder omitted) |
| Storage per session | Matryoshka (MRL): **256d** recommended for indexes (~95% image retrieval quality vs 768d per Google guidance) |
| License | Apache 2.0; Gemma/Hugging Face acceptance required for weight distribution |
| Browser path | Official mention of **Transformers.js + WebGPU**; community ONNX repo exists |

**Modality choice for PicPicker:** load **text + vision only** (`audio_config` disabled). Do not ship the 740M full multimodal bundle.

---

## 3. Recommended libraries and tooling

### Runtime (in extension)

| Piece | Library / API | Role |
|-------|----------------|------|
| Inference | [`@huggingface/transformers`](https://huggingface.co/docs/transformers.js) (Transformers.js) | Load ONNX, tokenize text, run vision + text encoders in Web Worker |
| Acceleration | WebGPU (`device: 'webgpu'`), fallback WASM CPU (`dtype: 'q8` / `q4`) | WebGPU strongly preferred for vision encoding |
| Math | `matmul` + normalize from same package | Query vs corpus cosine similarity (dot product on unit vectors) |
| Worker | Dedicated `embedding.worker.ts` | Keep UI thread responsive; isolate long index runs |
| Host page | `results.html` / `results.ts` | Orchestration, progress UI, search box (not MV3 service worker) |

### Model artifacts

| Asset | Source | Notes |
|-------|--------|--------|
| ONNX weights | [`onnx-community/embeddinggemma-2-ONNX`](https://huggingface.co/onnx-community/embeddinggemma-2-ONNX) | Tagged for Transformers.js; verify vision submodels included for text+image |
| Precision | `q4` or `q8` for WASM; `fp32`/`q8` on WebGPU per device tests | EG activations: **no fp16** (same as EG1 ONNX README) |
| Cache | Transformers.js Hub cache (IndexedDB) + optional `chrome.storage` flag for “model installed” | Document cache size in settings |

### Build / dev

| Tool | Use |
|------|-----|
| Existing `tsup` pipeline | Bundle worker as separate entry; copy static assets if any |
| `npm run lint:full` | Gate merges |
| Manual perf matrix | Chrome + Firefox, WebGPU on/off, N = 50 / 200 / 500 images |

### Optional later

| Tool | Use |
|------|-----|
| [Google AI Edge / LiteRT](https://developers.googleblog.com/en/google-ai-edge-with-embeddinggemma-2/) | If Transformers.js multimodal gaps block shipping; higher integration cost |
| Offscreen Document API | Alternative host if worker + results page is insufficient on some browsers |

### Version pinning

- Pin `@huggingface/transformers` to a version verified against EG2 ONNX (re-test on upgrades).
- Track upstream: EG2 is new; image processor APIs may require pre-release builds—document the exact version in `package.json` and this file when implementation starts.

---

## 4. Architecture

```
User extracts page (unchanged)
  → content.ts: URLs + metadata (+ optional capture pass, see §7)
  → background.ts: session Map
  → results.ts: grid UI

User enables semantic search (opt-in, §5)
  → detect WebGPU (§6)
  → download model once → IndexedDB cache (HTTPS to Hugging Face CDN only)
  → embedding.worker: for each image (prioritized order)
        - vision embed if pixels available
        - else skip or weak text embed (alt/URL only, clearly labeled)
  → session index: Map<imageId, Float32Array[256]>
  → on input: embed query (text) → rank filteredImages → re-render order
```

**Do not run embedding in `background.ts` service worker** — MV3 workers are short-lived and unsuitable for batch vision inference.

**Session scope:** embeddings live in memory on the results page; discard when the tab closes (consistent with current session model). Optional phase 3: persist index per page URL hash in `indexedDB` (separate privacy review).

---

## 5. Opt-in, settings, and first-run UX

### Design principles

- **Default: off.** Core PicPicker works exactly as today with zero extra network or ML cost.
- **Single persistent setting** in `browser.storage.sync` (or `local` if size matters) drives all gates.
- **First interaction** always shows an explanatory prompt; never silent download.

### Proposed storage schema

```typescript
interface SemanticSearchSettings {
  /** Master switch; false = feature invisible or disabled */
  enabled: boolean
  /** User accepted first-run disclosure (legal/UX acknowledgment) */
  disclosureAcceptedAt?: string // ISO timestamp
  /** 'vision' | 'text-only' — see §6 */
  mode: 'vision' | 'text-only'
  /** MRL dimension for index */
  vectorDim: 256 | 512 | 768
  /** Prefer WebGPU when available */
  preferWebGpu: boolean
  /** Cached model revision / etag for support */
  modelCacheRevision?: string
}
```

Store under key `semanticSearch` alongside existing `displaySettings`.

### Entry points

1. **Results page:** “Semantic search” toggle or search field (disabled until opt-in). Clicking when `enabled === false` opens **first-run modal**.
2. **Future popup / options page:** same toggle + “Delete downloaded model” + cache size estimate.

### First-run modal (copy outline)

- **Title:** Enable semantic search?
- **Body:**
  - Finds images by meaning, not just alt text.
  - **One-time download** (~XXX MB, confirm from ONNX repo at implementation time).
  - Uses **GPU if available**; on CPU, indexing many images can take several minutes.
  - **No data sent to PicPicker**; model files come from Hugging Face; queries and images stay on your device.
  - You can turn this off and remove the cached model anytime.
- **Actions:** `Enable` · `Not now` (dismiss, leave setting off)
- On **Enable:** set `enabled: true`, `disclosureAcceptedAt`, start download with progress bar.

### Download on demand

- Trigger download only after **Enable** (not on extension install).
- Show determinate/indeterminate progress; allow **Cancel** (abort fetch, keep `enabled` false or set “download incomplete”).
- Retry path in settings if download failed.

### Re-prompt rules

- Do not show first-run modal again if `disclosureAcceptedAt` is set.
- If user disables feature, keep disclosure; re-enabling skips modal unless we bump `MODEL_VERSION` (then show “Updated model” short notice).

---

## 6. GPU policy and text-only fallback

### Problem

Most extracted images have **no alt text**; **text-only** embeddings (alt + URL + filename) help little for “find the red shoes” style queries. Vision encoding is the real value.

### Recommended policy

| Condition | Behavior |
|-----------|----------|
| WebGPU available | Offer **full semantic search** (text + vision). Default `mode: 'vision'`. |
| WebGPU unavailable | **Do not auto-enable vision.** Show modal: “Semantic search needs WebGPU for practical image search. You can enable **limited text search** (works best when images have alt text) or try another browser/device.” |
| User chooses text-only on CPU | Allow with persistent banner: “Text-only mode — many images may not match.” |
| User on CPU tries to enable vision | Allow only after explicit **“I understand this may be slow”** checkbox; show time estimate based on image count. |

### Capability detection (implementation sketch)

```typescript
async function hasWebGpu(): Promise<boolean> {
  if (!navigator.gpu) return false
  try {
    const adapter = await navigator.gpu.requestAdapter()
    return adapter != null
  } catch {
    return false
  }
}
```

Run once per results page load when user opens semantic search UI.

### Indexing strategy (vision mode)

1. Visible images first, then rest (matches current sort bias).
2. Cap optional **max images to index** (e.g. 200) with “Index all N” for power users.
3. Downscale to model input size in worker (e.g. max edge 512px) to save latency.
4. Yield to UI (`requestIdleCallback` / batch size 1–4).

---

## 7. Caveats and mitigations

### Cross-origin pixels (high impact)

- Many CDN images block canvas readback without CORS; Instagram/Facebook already problematic for previews (`BLOCKED_DOMAINS` in `results.ts`).
- **Mitigation:** During extract (while `activeTab` is valid), attempt `fetch(url)` from extension context or draw from loaded `<img>` where allowed; store **session-only** `blob:` or `ArrayBuffer` keyed by `image.id`.
- **Fallback:** Skip vision embed; if text-only mode, embed `alt` + pathname tokens; show badge “Not indexed (protected image).”

### Privacy messaging (must update when shipping)

Current public claims (e.g. `PRIVACY.md`, README) state **no network requests** and **no pixel data** collection. Semantic search changes that **only for users who opt in**:

| Claim today | Updated stance (opt-in semantic search) |
|-------------|----------------------------------------|
| No external communication | **Default:** unchanged. **With semantic search enabled:** browser may download model files from Hugging Face (or mirror we document); still no PicPicker servers. |
| No image content collected | **Default:** unchanged. **Opt-in:** pixels used **locally** for embedding; not transmitted to us; discarded with session unless we add optional persistence later. |
| No network permissions in manifest | Still true—we use `fetch` to Hugging Face without broad host permission; disclose in privacy policy and store listing. |

**Store listing:** Add bullet under optional feature: “Optional AI model download for on-device search.”

### Extension package size

- Do not bundle full ONNX in CRX; use on-demand download to avoid store limits and review friction.

### Firefox vs Chrome

- WebGPU maturity differs; test both. `addons-linter` may flag large cached data—document as user-local cache.

### Licensing

- Apache 2.0 + [Gemma terms](https://ai.google.dev/gemma/terms); accept on Hugging Face for redistribution pointers.
- Ship `NOTICE` / attribution in repo and options UI link to model card.

### Correct EG2 usage

- Text queries: use documented prefix / `prompt_name="SearchQuery"` (mirror EG1 ONNX examples until EG2 JS docs stabilize).
- Images: pass image tensors directly—no document prefix on images.
- Query and document vectors must use the **same MRL dimension** and normalization.

### Security

- Model URL allowlist: only `huggingface.co` (and specified revision paths).
- Subresource integrity where HF provides hashes; pin revision in code.

---

## 8. Implementation phases

### Phase 0 — Spike (1–2 weeks)

- [ ] Add `docs/` reference implementation notes from spike branch.
- [ ] Worker loads EG2 ONNX; embed 10 fixture images + 5 queries; manual quality check.
- [ ] Measure WebGPU vs WASM latency per image on target hardware.
- [ ] Confirm vision path in Transformers.js for `onnx-community/embeddinggemma-2-ONNX`.

**Exit criteria:** Demonstrated text query ranking images in dev build with acceptable latency on WebGPU.

### Phase 1 — Opt-in plumbing (1 week)

- [ ] `SemanticSearchSettings` in storage; first-run modal component on results page.
- [ ] Model download manager (progress, cancel, retry, delete cache).
- [ ] Feature flag: UI hidden unless `enabled` or user clicks “Try semantic search”.
- [ ] Update `PRIVACY.md` + README “Privacy” section with conditional bullets (§7).

### Phase 2 — Vision index + search UI (2–3 weeks)

- [ ] Pixel capture pass in `content.ts` (best-effort) + pass handles in session payload (design: optional `thumb?: string` base64 or blob URL via structured clone limits—prefer binary in session if size allows, or re-fetch on results with extension privileges where possible).
- [ ] Worker batch indexing with progress (“Indexed 42 / 180”).
- [ ] Search input debounced; re-rank `filteredImages` without breaking existing format/size filters.
- [ ] GPU gating + CPU warning path (§6).

### Phase 3 — Polish (1–2 weeks)

- [ ] Options: vector dim, delete model, mode display.
- [ ] Empty states: no GPU, download failed, zero indexable images.
- [ ] Localization hooks if extension i18n exists later.
- [ ] Performance caps and “Index visible only” quick action.

### Phase 4 — Optional persistence (defer)

- [ ] `indexedDB` index keyed by canonical page URL + content hash.
- [ ] Separate opt-in and privacy subsection; TTL and clear-all control.

---

## 9. UI copy snippets (draft)

**Settings label:** Semantic search (on-device AI)  
**Subtitle:** Download a model once to search images by description. Private; runs on your device.  
**WebGPU missing:** Image search needs WebGPU for good performance. Enable limited text search instead?  
**Indexing:** Indexing images for search… {n}/{total}  
**Privacy short:** PicPicker does not receive your searches or images. Optional model files are downloaded from Hugging Face to your browser.

---

## 10. Testing checklist

### Text-only semantic QA (good vs bad pages)

Phase 1 indexes **alt / nearby labels / URL filename**, not pixels. Use pages with real `alt` or `figcaption` text when judging search quality.

| Good for text semantic | Why |
|------------------------|-----|
| **[Wikipedia:Featured pictures/Plants/Fruits](https://en.wikipedia.org/wiki/Wikipedia:Featured_pictures/Plants/Fruits)** (best smoke test) | Verified ~96 images, ~95 descriptive alts; query `apple`, `orange`, `mango`, `grape`, `lemon` (use `kiwi` / `cherry` as extras — no banana entry on this gallery) |
| [Commons — List of culinary fruits](https://commons.wikimedia.org/wiki/List_of_culinary_fruits) | Text-heavy; few inline images — poor PicPicker yield |
| [NASA Image and Video Library](https://images.nasa.gov/) | Metadata + alts on result grids |
| News articles with `<figure>` / captions | `figcaption` is picked up by extraction |

**Suggested fruit QA:** PicPicker on [Featured pictures/Plants/Fruits](https://en.wikipedia.org/wiki/Wikipedia:Featured_pictures/Plants/Fruits) → enable semantic search → try `apple`, `orange`, `mango`, `grape`, `lemon`. Re-run extraction after changing `content.ts` metadata rules.

| Poor for text-only (use for vision phase later) | Why |
|-------------------------------------------------|-----|
| **Pinterest** search / home feed | Logged-out grids often use `alt="Pin"` only; titles may be absent from the tile DOM (no `/pin/` link, no caption). Pin **closeup** pages expose `og:title` / JSON-LD, but the results grid is still image URLs. |
| Instagram / similar | CORS + minimal alt |

Site-specific Pinterest adapters (pin wrapper → link `aria-label`, JSON-LD on `/pin/` URLs) can recover *some* titles where the DOM still exposes them; they will not fix the modern `gated-pin-rep` feed where scrapers report **no** per-tile title. **Vision indexing** is the real fix for Pinterest-like sites.

- [ ] Opt-in: no network until Enable; cancel leaves no partial cache or documents cleanup behavior.
- [ ] Disable feature: search UI off; optional cache purge.
- [ ] 500+ image page: UI stays responsive; caps behave as designed.
- [ ] CORS-blocked domains: graceful degradation, no worker crash.
- [ ] Extension reload mid-index: recover or clean restart.
- [ ] Firefox + Chrome WebGPU paths.
- [ ] Uninstall: cached model data removed with extension data (browser behavior note in privacy doc).

---

## 11. Useful links

| Topic | URL |
|-------|-----|
| EG2 model card | https://ai.google.dev/gemma/docs/embeddinggemma/model_card_2 |
| Sentence Transformers inference | https://ai.google.dev/gemma/docs/embeddinggemma/inference-embeddinggemma-with-sentence-transformers |
| Developer guide (MRL, modalities, prefixes) | https://developers.googleblog.com/embeddinggemma-2-the-developer-guide/ |
| Google AI Edge + EG2 | https://developers.googleblog.com/en/google-ai-edge-with-embeddinggemma-2/ |
| Announcement blog | https://blog.google/innovation-and-ai/technology/developers-tools/embeddinggemma-2/ |
| Hugging Face weights | https://huggingface.co/google/embeddinggemma-2 |
| ONNX for Transformers.js | https://huggingface.co/onnx-community/embeddinggemma-2-ONNX |
| EG1 browser demo (patterns) | https://github.com/glaforge/embedding-gemma-semantic-search |
| EG1 in-browser article | https://glaforge.dev/posts/2025/09/08/in-browser-semantic-search-with-embeddinggemma/ |
| **TinyWhale** (MV3 + Transformers.js extension) | https://github.com/tantara/transformers.js-chrome — Plasmo bundle, `wasm-unsafe-eval`, ORT WASM `numThreads: 1`, postbuild `import.meta.url` fixes |
| **SemanticFinder** (MV3 extension) | https://github.com/do-me/SemanticFinder/tree/main/extension — Webpack-bundled `@xenova/transformers` in popup |
| Transformers.js docs | https://huggingface.co/docs/transformers.js |
| Transformers.js WebGPU | https://huggingface.co/docs/transformers.js/guides/webgpu |
| Chrome Offscreen Documents | https://developer.chrome.com/docs/extensions/reference/api/offscreen |
| Matryoshka / truncate_dim | Developer guide § “Flexible vector storage” |

### MV3 bundling (PicPicker v3)

Do **not** copy `transformers.web.js` from npm as-is: it contains bare `onnxruntime-web/*` imports that fail on `chrome-extension://`. **esbuild-bundle** into `dist/vendor/` (alias WebGPU → WASM, **no** `onnxruntime-web-use-extern-wasm` — that path uses `blob:` scripts blocked by MV3 CSP). Set `env.useWasmCache = false` before `pipeline()`. Point `wasmPaths` at `chrome-extension://…/wasm/` (+ `ort.wasm.min.mjs` if using extern ORT). Module workers have no `chrome.runtime` — pass URLs from the results page in the worker `load` message.

---

## 12. Open decisions

| Decision | Recommendation | Alternatives |
|----------|----------------|--------------|
| Bundle vs download | On-demand download | Bundle q4 vision subset if store allows and size < ~50MB (unlikely) |
| Text-only without GPU | Offer but discourage | Hide feature entirely without WebGPU |
| Session pixel storage | Capture at extract time | Re-fetch URLs on results (fails without host permission) |
| Vector dim default | 256 | 512 for higher recall, slower search |
| Mirror model on own CDN | Avoid (privacy simplicity) | Self-host for China/offline enterprise |

---

## 13. Documentation touchpoints when shipping

| File | Change |
|------|--------|
| `PRIVACY.md` | Conditional network use; local pixel processing for opt-in feature; HF as third-party host for weights only |
| `README.md` | Feature bullet + privacy footnote; remove or qualify “works offline” → “works offline except optional model download” |
| `CHANGELOG.md` | User-visible opt-in and hardware requirements |
| Chrome Web Store / AMO description | Optional on-device AI, download size, WebGPU recommended |
| `src/public/manifest.json` | No new permissions required if using extension-origin fetch only; re-verify after implementation |

---

*Last updated: 2026-10-06. Revise download size (MB) and Transformers.js version after Phase 0 measurements.*
