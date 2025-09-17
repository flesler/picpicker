import { copy } from 'esbuild-plugin-copy'
import { readFileSync, writeFileSync } from 'fs'
import { defineConfig } from 'tsup'

export default defineConfig(() => {
  const isFirefox = process.env.FIREFOX === '1'
  const manifest = generateManifest(isFirefox)
  const prod = process.env.NODE_ENV === 'production'
  const now = Date.now()
  return {
    entry: {
      background: 'src/background.ts',
      content: 'src/content.ts',
      popup: 'src/popup.ts',
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
    define: {
      NAME: JSON.stringify(manifest.name),
      VERSION: JSON.stringify(manifest.version),
      NODE_ENV: JSON.stringify(process.env.NODE_ENV || 'development'),
    },
    esbuildPlugins: [
      copy({
        assets: [
          { from: ['src/public/**'], to: ['./'] },
          { from: ['node_modules/webextension-polyfill/dist/browser-polyfill.min.js'], to: ['browser-polyfill.js'] },
        ],
      }),
    ],
    esbuildOptions(options) {
      options.legalComments = 'none'
      options.drop = ['debugger']
      options.entryNames = '[name]'
    },
    outExtension() {
      return { js: '.js' }
    },
    async onSuccess() {
      writeFileSync('dist/manifest.json', JSON.stringify(manifest, null, 2))
      if (!prod) {
        console.log(`${isFirefox ? 'Firefox' : 'Chrome'} extension build success in ${Date.now() - now}ms`)
      }
    },
  }
})

function generateManifest(isFirefox = false) {
  const pkg = JSON.parse(readFileSync('package.json', 'utf-8'))
  const manifest = JSON.parse(readFileSync('src/public/manifest.json', 'utf-8'))

  manifest.name = manifest.action.default_title = pkg.displayName
  manifest.version = pkg.version
  manifest.description = pkg.description

  if (isFirefox) {
    // Firefox-specific manifest modifications
    manifest.background = {
      scripts: ['background.js'],
    }
    manifest.browser_specific_settings = {
      gecko: {
        id: pkg.gecko_id,
        strict_min_version: '109.0',
        // Ready for their spec
        data_collection_permissions: { required: ['none'] },
      },
    }
  } else {
    // Chrome-specific manifest (ensure it stays as service_worker)
    manifest.background = {
      service_worker: 'background.js',
    }
    // Remove any Firefox-specific properties
    delete manifest.browser_specific_settings
  }
  return manifest
}
