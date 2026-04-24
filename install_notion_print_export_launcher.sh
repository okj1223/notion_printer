#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
LAUNCHER="$SCRIPT_DIR/notion_print_export_launcher.sh"
DESKTOP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
ICON_THEME_ROOT="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor"
ICON_DIR_256="$ICON_THEME_ROOT/256x256/apps"
ICON_DIR_512="$ICON_THEME_ROOT/512x512/apps"
DESKTOP_FILE_MAIN="$DESKTOP_DIR/notion-printer.desktop"
DESKTOP_FILE_ADVANCED="$DESKTOP_DIR/notion-printer-advanced.desktop"
DESKTOP_FILE_DEBUG="$DESKTOP_DIR/notion-printer-debug.desktop"
ICON_NAME="notion-printer"
ICON_SOURCE_256="$SCRIPT_DIR/assets/icons/notion-printer-256.png"
ICON_SOURCE_512="$SCRIPT_DIR/assets/icons/notion-printer-512.png"

mkdir -p "$DESKTOP_DIR"
mkdir -p "$ICON_DIR_256" "$ICON_DIR_512"
chmod +x "$LAUNCHER"
rm -f "$DESKTOP_FILE_ADVANCED" "$DESKTOP_FILE_DEBUG"

if [[ -f "$ICON_SOURCE_256" ]]; then
  cp "$ICON_SOURCE_256" "$ICON_DIR_256/$ICON_NAME.png"
fi
if [[ -f "$ICON_SOURCE_512" ]]; then
  cp "$ICON_SOURCE_512" "$ICON_DIR_512/$ICON_NAME.png"
fi

cat >"$DESKTOP_FILE_MAIN" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=Notion Printer
Comment=Generate integrated print-friendly HTML from one or more Notion exports
Exec=$LAUNCHER --advanced %F
Terminal=false
MimeType=text/html;application/zip;application/x-zip;application/x-zip-compressed;
Categories=Utility;
Icon=$ICON_NAME
StartupNotify=true
EOF

chmod +x "$DESKTOP_FILE_MAIN"

if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -f -t "$ICON_THEME_ROOT" >/dev/null 2>&1 || true
fi

echo "Installed desktop launcher:"
echo "$DESKTOP_FILE_MAIN"
