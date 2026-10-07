import * as esbuild from 'esbuild'
import { copy } from 'esbuild-plugin-copy'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { defineConfig } from 'tsup'

const isFirefox = process.env.FIREFOX === '1'
const prod = process.env.NODE_ENV === 'production'
const polyfill = isFirefox ? '' : 'browser-polyfill.js'

function sharedPlugins() {
  return [
    copy({
      assets: [
        { from: ['src/public/**'], to: ['./'] },
        { from: ['node_modules/onnxruntime-web/dist/*.wasm'], to: ['./wasm'] },
        { from: ['node_modules/onnxruntime-web/dist/ort.wasm.min.mjs'], to: ['./wasm'] },
        { from: ['node_modules/onnxruntime-web/dist/ort-wasm*.mjs'], to: ['./wasm'] },
        ...(polyfill ? [{ from: ['node_modules/webextension-polyfill/dist/browser-polyfill.min.js'], to: [polyfill] }] : []),
      ],
    }),
  ]
}

function writeManifest() {
  const manifest = generateManifest(isFirefox)
  writeFileSync('dist/manifest.json', JSON.stringify(manifest, null, 2))
}

function buildTransformersVendor() {
  mkdirSync('dist/vendor', { recursive: true })
  esbuild.buildSync({
    entryPoints: ['node_modules/@huggingface/transformers/dist/transformers.web.js'],
    outfile: 'dist/vendor/transformers.web.js',
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: prod,
    alias: {
      'onnxruntime-web/webgpu': 'onnxruntime-web/wasm',
    },
    // Bundled ORT WASM (no extern .mjs + blob: dynamic import — blocked by MV3 CSP).
    conditions: ['import', 'default'],
    legalComments: 'none',
  })
}

export default defineConfig([
  {
    entry: {
      background: 'src/background.ts',
      content: 'src/content.ts',
      results: 'src/results.ts',
    },
    format: ['iife'],
    globalName: 'Extension',
    platform: 'browser',
    target: isFirefox ? 'firefox109' : 'chrome91',
    outDir: 'dist',
    dts: false,
    clean: prod,
    minify: prod,
    treeshake: prod,
    silent: !prod,
    define: buildDefines(isFirefox),
    esbuildPlugins: sharedPlugins(),
    esbuildOptions(options) {
      options.legalComments = 'none'
      options.drop = ['debugger']
      options.entryNames = '[name]'
    },
    outExtension() {
      return { js: '.js' }
    },
    onSuccess() {
      buildTransformersVendor()
      writeManifest()
      if (!prod) {
        console.log(`${isFirefox ? 'Firefox' : 'Chrome'} extension build success`)
      }
      return Promise.resolve()
    },
  },
  {
    entry: {
      embeddingWorker: 'src/embeddingWorker.ts',
    },
    format: ['esm'],
    platform: 'browser',
    target: 'es2022',
    outDir: 'dist',
    dts: false,
    clean: false,
    minify: prod,
    treeshake: prod,
    silent: !prod,
    define: buildDefines(isFirefox),
    esbuildOptions(options) {
      options.legalComments = 'none'
      options.drop = ['debugger']
      options.entryNames = '[name]'
    },
    outExtension() {
      return { js: '.js' }
    },
  },
])

function buildDefines(firefox: boolean) {
  const manifest = generateManifest(firefox)
  return {
    NAME: JSON.stringify(manifest.name),
    VERSION: JSON.stringify(manifest.version),
    POLYFILL: JSON.stringify(polyfill),
    NODE_ENV: JSON.stringify(process.env.NODE_ENV || 'development'),
    DEV_PERSIST_RESULTS_SESSIONS_DEFAULT: JSON.stringify(
      (process.env.NODE_ENV || 'development') !== 'production',
    ),
  }
}

function generateManifest(isFirefox = false) {
  const pkg = JSON.parse(readFileSync('package.json', 'utf-8'))
  const manifest = JSON.parse(readFileSync('src/public/manifest.json', 'utf-8'))

  manifest.name = manifest.action.default_title = pkg.displayName
  manifest.version = pkg.version
  manifest.description = pkg.description

  if (isFirefox) {
    manifest.background = {
      scripts: ['background.js'],
    }
    manifest.browser_specific_settings = {
      gecko: {
        id: pkg.gecko_id,
        strict_min_version: '109.0',
        data_collection_permissions: { required: ['none'] },
      },
    }
  } else {
    manifest.background = {
      service_worker: 'background.js',
    }
    delete manifest.browser_specific_settings
  }
  return manifest
}
