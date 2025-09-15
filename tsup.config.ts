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
    env: { NODE_ENV: process.env.NODE_ENV || 'development' },
    esbuildPlugins: [
      copy({
        assets: [{ from: ['src/public/**'], to: ['./'] }],
      }),
    ],
    esbuildOptions(options) {
      options.legalComments = 'none'
      options.drop = ['debugger']
      options.entryNames = '[name]'
      // Inject Firefox flag into the bundle
      options.define = {
        FIREFOX: JSON.stringify(process.env.FIREFOX || '0'),
        NAME: JSON.stringify(`${manifest.name}@${manifest.version}`),
      }
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

  const name = (pkg.name as string).split(/[_-]/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

  manifest.name = manifest.action.default_title = name
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

  console.log(`Generated ${isFirefox ? 'Firefox' : 'Chrome'} manifest with activeTab permissions`)
  return manifest
}
