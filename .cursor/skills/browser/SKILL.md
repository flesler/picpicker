---
name: browser
description: Read when iterating unpacked Chrome extensions via chrome-devtools MCP.
---

# Chrome extension dev loop (MCP)

Use **official** `chrome-devtools-mcp` (`--autoConnect`, `--categoryExtensions=true`, `--experimentalIncludeAllPages=true`) in `.cursor/mcp.json`. The server must be **enabled** in Cursor MCP settings — JSON alone is not enough.

Discover the MCP namespace each session:

```text
GetDynamicTools pattern: "chrome-devtools"
```

Typical id: `project-0-<workspace>-chrome-devtools`.

`.agents/` is a symlink to `.cursor/` — edit **only** under `.cursor/` (never write via `.agents/`).

## What you need from the user

- Same Chrome window MCP is attached to (the tabs `list_pages` shows).
- **Once per dev session:** user clicks the extension toolbar action on a normal page (grants `activeTab`). You cannot replace that with `trigger_extension_action` or keyboard simulation.
- Leave the **results / extension page** open; never close their tab. Reload it in place (below).

## Always ship the latest build (do not wait for the user)

After **any** change to extension source, `dist/`, or worker/vendor assets that affect runtime behavior:

1. Run `npm run build` from repo root (loads nvm per project rules) and **wait until it exits successfully**.
2. Only then call `reload_extension` with `id` = unpacked extension id (`list_extensions` or `./.cursor/skills/browser/scripts/extension-id.sh`).
3. Reload every open PicPicker **results** tab (step below).

**Sequential only:** Never invoke `npm run build` and `reload_extension` in the same assistant turn in parallel — the reload can win the race and load stale `dist/`. One turn: build → wait for completion → reload → (optional) reload results tabs. If build fails, do not reload.

Do this **every time** you finish a coding step in this repo — silently, without asking the user and **without** narrating “rebuild/reload done” or telling them to reload tabs. Use the service worker `tabs.query` + `tabs.reload` for open results pages when MCP allows.

## Iteration loop (you run this)

1. `npm run build` from repo root — **must finish before step 2**.
2. `reload_extension` with the unpacked extension id.
3. Reload the extension UI tab **in place** — service worker `evaluate_script`:

```javascript
async () => {
  const ext = chrome.runtime.getURL('results.html')
  const [tab] = await chrome.tabs.query({ url: `${ext}*` })
  if (!tab?.id) return { error: 'no results tab' }
  await chrome.tabs.reload(tab.id, { bypassCache: true })
  return { url: tab.url }
}
```

Use the latest PicPicker `serviceWorkerId` from `list_pages` (highest `sw-*` for your extension).

4. **Console:** `list_pages` often omits extension tabs until DevTools attaches. If no **Extension Pages** entry, `new_page` with the **same** `chrome-extension://…` URL from step 3 (`background: true` avoids stealing focus). Then `list_console_messages` on that `pageId` (`includeStackTraces: true`, filter `error` / `warn`).
5. Fix code → repeat from step 1. Do not ask the user to paste console output.

## PicPicker (this repo)

| Item | Value |
| --- | --- |
| Dev `dist/` load | Unpacked id via `list_extensions` or `scripts/extension-id.sh` |
| Results URL pattern | `chrome-extension://<id>/results.html?session=<id>` |
| Session across `reload_extension` | Dev builds persist last 3 sessions in `storage.local` when `picpickerPersistResultsSessions` is true (default in dev). See `BUILD_README.md`. |
| Semantic / worker | Do not rely on `chrome.runtime` inside module workers — pass `getURL()` values from the results page. |
| **Semantic text QA page** | [Wikipedia:Featured pictures/Plants/Fruits](https://en.wikipedia.org/wiki/Wikipedia:Featured_pictures/Plants/Fruits) — ~96 upload images, ~95 non-empty alts; try queries `apple`, `orange`, `mango`, `grape`, `lemon` (no banana tile on this page; use `kiwi` or `cherry` as extra checks). User must click PicPicker on that tab once per session (`activeTab`). |

## NEVER

- NEVER leave the extension on a stale build after you changed code — rebuild + `reload_extension` + reload results tabs (agent does this; do not push that work onto the user).
- NEVER run `npm run build` and `reload_extension` in parallel in one response — always build first, wait for success, then reload.
- NEVER tell the user to “reload the results tab”, “rebuild”, or “run PicPicker again” after routine code fixes — handle extension reload yourself; only mention user action when **required** (e.g. one `activeTab` toolbar click per browser session).

- NEVER ask the user to paste console logs if chrome-devtools MCP is connected.
- NEVER use `trigger_extension_action` as a substitute for the user clicking the extension icon (`activeTab` / host permission errors).
- NEVER `reload_extension` without a follow-up **tab reload** (stale JS in an open extension page).
- NEVER assume `list_pages` lists every tab — use `tabs.query` in the extension service worker when needed.

## Scripts

| Script | Role |
| --- | --- |
| `scripts/extension-id.sh` | Unpacked extension id for a path (default: this repo `dist/`) |

## References

- [chrome-devtools-mcp flags](./references/mcp-config.md)
