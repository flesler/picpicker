# chrome-devtools-mcp (PicPicker)

Example `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "-y",
        "chrome-devtools-mcp@latest",
        "--autoConnect",
        "--categoryExtensions=true",
        "--experimentalIncludeAllPages=true"
      ]
    }
  }
}
```

Tools used most: `list_pages`, `list_extensions`, `reload_extension`, `evaluate_script` (service worker), `new_page`, `navigate_page` (reload), `list_console_messages`.

`reload_extension` can hang when Chrome/MCP reconnects; retry once. If it keeps hanging, user can reload on `chrome://extensions` — you still reload the extension page tab.
