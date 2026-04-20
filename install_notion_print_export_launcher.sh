#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
LAUNCHER="$SCRIPT_DIR/notion_print_export_launcher.sh"
DESKTOP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
DESKTOP_FILE_QUICK="$DESKTOP_DIR/notion-printer.desktop"
DESKTOP_FILE_ADVANCED="$DESKTOP_DIR/notion-printer-advanced.desktop"
ICON_NAME="text-html"

mkdir -p "$DESKTOP_DIR"
chmod +x "$LAUNCHER"

cat >"$DESKTOP_FILE_QUICK" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=Notion Printer
Comment=Generate print-friendly HTML from a Notion export
Exec=$LAUNCHER %f
Terminal=false
MimeType=text/html;
Categories=Utility;
Icon=$ICON_NAME
StartupNotify=true
EOF

cat >"$DESKTOP_FILE_ADVANCED" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=Notion Printer Advanced
Comment=Open the advanced Notion Printer options
Exec=$LAUNCHER --advanced
Terminal=false
Categories=Utility;
Icon=$ICON_NAME
StartupNotify=true
EOF

chmod +x "$DESKTOP_FILE_QUICK" "$DESKTOP_FILE_ADVANCED"

echo "Installed desktop launchers:"
echo "$DESKTOP_FILE_QUICK"
echo "$DESKTOP_FILE_ADVANCED"
