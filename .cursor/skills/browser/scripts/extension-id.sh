#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
DIST="${1:-$ROOT/dist}"
DIST="$(readlink -f "$DIST")"
PREF="${CHROME_PREFERENCES:-$HOME/.config/google-chrome/Default/Preferences}"
python3 - "$DIST" "$PREF" <<'PY'
import json, sys
dist, pref = sys.argv[1], sys.argv[2]
with open(pref) as f:
    settings = json.load(f).get("extensions", {}).get("settings", {})
for ext_id, data in settings.items():
    path = data.get("path", "")
    if dist in path:
        print(ext_id)
        break
else:
    sys.exit(1)
PY
