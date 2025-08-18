import { copyFileSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import { defineConfig } from 'tsup'

export default defineConfig((options) => {
  const dts = options.dts !== false
  const isFirefox = process.env.FIREFOX === '1'
  const manifest = generateManifest(isFirefox)
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
    clean: true,
    minify: !options.watch,
    dts: false,
    treeshake: true,
    silent: !dts,
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
      copyDirectory('src/public', 'dist')
      writeFileSync('dist/manifest.json', JSON.stringify(manifest, null, 2))
      if (!dts) {
        console.log(`${isFirefox ? 'Firefox' : 'Chrome'} extension build success`)
      }
    },
  }
})

function copyDirectory(src: string, dest: string) {
  mkdirSync(dest, { recursive: true })
  const items = readdirSync(src)
  for (const item of items) {
    const srcPath = join(src, item)
    const destPath = join(dest, item)

    if (statSync(srcPath).isDirectory()) {
      copyDirectory(srcPath, destPath)
    } else {
      copyFileSync(srcPath, destPath)
    }
  }
}

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
