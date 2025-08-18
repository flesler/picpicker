# Privacy Policy for PicPicker Extension

**Last Updated:** August 2025

## Overview

PicPicker Extension ("the Extension") is designed to extract images from webpages for user convenience. This privacy policy explains our privacy-first approach to data handling.

## 🔒 Privacy-First Design

### Minimal Permissions Model
PicPicker uses Chrome's **"activeTab"** permission model, which means:
- ✅ **Only runs when you click the extension** - Never operates in the background
- ✅ **Cannot read websites automatically** - Requires explicit user activation  
- ✅ **No persistent website access** - Permissions granted only during extraction
- ✅ **Cannot monitor browsing** - No access to tabs you're not actively using

### Zero External Communication
- 🚫 **No servers** - We don't operate any backend infrastructure
- 🚫 **No analytics** - Zero tracking, usage data, or telemetry
- 🚫 **No external APIs** - All processing happens locally in your browser
- 🚫 **No network requests** - Extension never communicates with external services

## Data Collection and Storage

### What We Collect
- **Extension Settings**: Your preferences for image filtering and display options
- **Temporary Image Data**: URLs and metadata of images found during extraction (cleared immediately)

### What We DON'T Collect
- ❌ Personal identifying information
- ❌ Browsing history or website content
- ❌ Downloaded images (they go directly to your device)
- ❌ User behavior or analytics data
- ❌ Login credentials or account information
- ❌ Image content or pixel data

## How Image Extraction Works

### Local Processing Only
1. **User activates** extension by clicking icon or pressing `Ctrl+Shift+I`
2. **Permission granted** temporarily for the current tab only
3. **Content script injected** into the active webpage
4. **Images scanned** and metadata collected (URLs, dimensions, alt text)
5. **Results displayed** in a new tab with grid interface
6. **Data cleared** when results tab is closed

### No Persistent Storage
- Image URLs and metadata are stored **temporarily in memory**
- All extraction data is **deleted when you close the results tab**
- Only your extension settings are saved persistently

## Data Storage

### Local Storage Only
- **Chrome Storage Sync**: Only saves your extension preferences (filter settings, display options)
- **Session Storage**: Temporarily holds image data during extraction (auto-deleted)
- **No External Storage**: Zero cloud storage, databases, or external services

### Data Control
- **Settings Reset**: Clear all saved preferences through extension popup
- **Session Clearing**: Close results tab to immediately clear all image data
- **Complete Removal**: Uninstalling the extension removes all stored data

## Required Permissions

### Minimal Permission Set
- **`activeTab`**: To scan the current webpage only when you activate the extension
- **`scripting`**: To inject image extraction code into the current tab
- **`storage`**: To save your extension preferences locally
- **`downloads`**: To enable ZIP file downloads of selected images

### What We DON'T Request
- ❌ **No "all websites" permissions** - Cannot access websites automatically
- ❌ **No background permissions** - Cannot run when you're not using it
- ❌ **No network permissions** - Cannot make external requests
- ❌ **No history permissions** - Cannot access your browsing data

## Data Security

### Local-First Architecture
- All image processing happens on your device
- Image URLs never leave your browser except when you download them
- No transmission of data to external servers
- Chrome's built-in security protects extension data

### Open Source Transparency
- Complete source code available for inspection
- No obfuscated or hidden functionality
- Community-auditable codebase

## Data Sharing

**We share ZERO data.** There are no third parties, analytics services, or external integrations. Your image extraction activity is completely private to your device.

## Browser Compatibility

This privacy policy applies to:
- **Chrome Extension** (Manifest V3)
- **Firefox Add-on** (WebExtensions API)

Both versions use the same privacy-first approach with minimal permissions.

## Updates to This Policy

We may update this privacy policy to reflect extension improvements. Any changes will:
- Be announced in extension release notes
- Maintain the same privacy-first principles
- Never introduce tracking or data collection

## Contact & Transparency

For privacy questions or concerns:
- **GitHub Issues**: [https://github.com/flesler/picpicker/issues](https://github.com/flesler/picpicker/issues)
- **Source Code**: [https://github.com/flesler/picpicker](https://github.com/flesler/picpicker)
- **Email**: aflesler@gmail.com

## Privacy Commitment

PicPicker is built on the principle that **image extraction should be private by default**. We will never compromise this privacy-first approach for monetization, analytics, or convenience.
