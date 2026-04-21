#!/usr/bin/env bash
set -euo pipefail

STATE_FILE="${NOTION_PRINTER_PREVIEW_STATE_FILE:-/tmp/notion_printer_preview_server.json}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
DEBUG_PATH="/_notion_printer_debug.html"

if ! command -v xdg-open >/dev/null 2>&1; then
  echo "xdg-open is required to open the debug preview." >&2
  exit 1
fi

resolve_port() {
  "$PYTHON_BIN" - "$STATE_FILE" <<'PY'
import json
import sys
from pathlib import Path

state_path = Path(sys.argv[1])

try:
    if state_path.exists():
        payload = json.loads(state_path.read_text(encoding="utf-8"))
        port = int(payload.get("port") or 0)
        if port > 0:
            print(port)
            raise SystemExit(0)
except Exception:
    pass

raise SystemExit(1)
PY
}

if ! PORT="$(resolve_port)"; then
  echo "Notion Printer preview server is not running." >&2
  echo "Run the printer once first, then open the debug preview again." >&2
  exit 1
fi
URL="http://127.0.0.1:${PORT}${DEBUG_PATH}"
echo "Opening Notion Printer debug preview: $URL"
xdg-open "$URL" >/dev/null 2>&1 || true
