# PicPicker - Firefox Extension Build Instructions

## System Requirements

- **Operating System**: Linux, macOS, or Windows
- **Node.js**: v20 or higher
- **npm**: v8 or higher (included with Node.js)

## Build Environment Setup

1. **Install Node.js and npm**
   ```bash
   # Verify installation
   node --version  # Should be v20+
   npm --version   # Should be v8+
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

## Build Process

### For Firefox Extension

To build the exact Firefox extension package:

```bash
# Build Firefox version
FIREFOX=1 npm run build

# The built extension will be in the 'dist/' directory
```

### Build Scripts Available

- `npm run build` - Build Chrome version (default)
- `FIREFOX=1 npm run build` - Build Firefox version
- `npm run dev` - Development build with watch mode
- `npm run lint` - Run TypeScript type checking

## Build Output

The build process will:

1. **Compile TypeScript** to JavaScript using tsup/esbuild
2. **Generate manifest.json** with Firefox-specific settings including:
   - `browser_specific_settings.gecko.id` from package.json
   - Content script matches for AI platforms
   - Firefox-compatible background script format
3. **Copy static assets** (HTML, CSS, icons) to dist/
4. **Inject build-time constants**:
   - `FIREFOX="1"` for Firefox builds
   - `NAME="PicPicker@{version}"` for extension identification

## Key Files

- `tsup.config.ts` - Main build configuration
- `src/domains.ts` - Generates content script domain matches
- `package.json` - Contains Firefox extension ID (`gecko_id`)

## Firefox-Specific Build Differences

The Firefox build differs from Chrome in:

1. **Manifest format**: Uses `background.scripts` instead of `service_worker`
2. **Extension ID**: Includes `browser_specific_settings.gecko.id`
3. **Runtime behavior**: Floating button disabled due to popup API limitations
4. **Target compatibility**: Built for Firefox 109+

## Verification

After building, verify the extension:

1. Check `dist/manifest.json` contains `browser_specific_settings`
2. Load extension in Firefox via `about:debugging`
3. Test functionality on supported AI platforms

## Source Code

- All source files are in TypeScript
- No pre-transpiled or pre-minified files included
- Build process is fully reproducible
- Dependencies are standard npm packages

The exact build command used for the submitted extension:
```bash
FIREFOX=1 npm run build
```
