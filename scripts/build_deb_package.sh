#!/usr/bin/env bash
set -euo pipefail
umask 022

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
PACKAGE_NAME="notion-printer"
APP_DIR_NAME="notion-printer"
APP_INSTALL_DIR="/opt/$APP_DIR_NAME"
DIST_DIR="$REPO_ROOT/dist"
BUILD_ROOT="$DIST_DIR/deb-build"
VERSION_FILE="$REPO_ROOT/VERSION"
PACKAGE_VERSION="${1:-${PACKAGE_VERSION:-}}"
DEB_ARCH="${DEB_ARCH:-all}"
MAINTAINER="${MAINTAINER:-Notion Printer Team <notion-printer@example.com>}"
DESCRIPTION="Integrated Notion HTML printer for Ubuntu teams"

if [[ -z "$PACKAGE_VERSION" ]]; then
  if [[ -f "$VERSION_FILE" ]]; then
    PACKAGE_VERSION="$(tr -d '[:space:]' < "$VERSION_FILE")"
  fi
fi

if [[ -z "$PACKAGE_VERSION" ]]; then
  echo "Package version is required. Pass it as the first argument or write it to VERSION." >&2
  exit 1
fi

if ! command -v dpkg-deb >/dev/null 2>&1; then
  echo "dpkg-deb is required to build the .deb package." >&2
  exit 1
fi

BUILD_DIR="$BUILD_ROOT/${PACKAGE_NAME}_${PACKAGE_VERSION}_${DEB_ARCH}"
APP_ROOT="$BUILD_DIR$APP_INSTALL_DIR"
DEBIAN_DIR="$BUILD_DIR/DEBIAN"
BIN_DIR="$BUILD_DIR/usr/bin"
APPLICATIONS_DIR="$BUILD_DIR/usr/share/applications"
ICON_256_DIR="$BUILD_DIR/usr/share/icons/hicolor/256x256/apps"
ICON_512_DIR="$BUILD_DIR/usr/share/icons/hicolor/512x512/apps"
DOC_DIR="$BUILD_DIR/usr/share/doc/$PACKAGE_NAME"
OUTPUT_DEB="$DIST_DIR/${PACKAGE_NAME}_${PACKAGE_VERSION}_${DEB_ARCH}.deb"

rm -rf "$BUILD_DIR"
mkdir -p "$APP_ROOT" "$DEBIAN_DIR" "$BIN_DIR" "$APPLICATIONS_DIR" "$ICON_256_DIR" "$ICON_512_DIR" "$DOC_DIR"
mkdir -p "$APP_ROOT/scripts" "$APP_ROOT/learning_data" "$APP_ROOT/notion_print_export" "$APP_ROOT/assets/icons"

install -m 755 "$REPO_ROOT/notion_print_export_launcher.sh" "$APP_ROOT/notion_print_export_launcher.sh"
install -m 644 "$REPO_ROOT/notion_print_export.py" "$APP_ROOT/notion_print_export.py"
install -m 644 "$REPO_ROOT/notion_print_preview.py" "$APP_ROOT/notion_print_preview.py"
install -m 644 "$REPO_ROOT/notion_printer_learning.py" "$APP_ROOT/notion_printer_learning.py"
install -m 644 "$REPO_ROOT/README.md" "$DOC_DIR/README.md"
install -m 644 "$REPO_ROOT/RELEASE_GUIDE_KO.md" "$DOC_DIR/RELEASE_GUIDE_KO.md"
install -m 644 "$REPO_ROOT/TEAM_USER_GUIDE.html" "$DOC_DIR/TEAM_USER_GUIDE.html"
install -m 644 "$REPO_ROOT/VERSION" "$APP_ROOT/VERSION"
install -m 644 "$REPO_ROOT/scripts/print_integrated_factory.py" "$APP_ROOT/scripts/print_integrated_factory.py"
install -m 644 "$REPO_ROOT/scripts/prepare_notion_inputs.py" "$APP_ROOT/scripts/prepare_notion_inputs.py"
install -m 644 "$REPO_ROOT/assets/icons/notion-printer-256.png" "$APP_ROOT/assets/icons/notion-printer-256.png"
install -m 644 "$REPO_ROOT/assets/icons/notion-printer-512.png" "$APP_ROOT/assets/icons/notion-printer-512.png"
install -m 644 "$REPO_ROOT/assets/icons/notion-printer-256.png" "$ICON_256_DIR/notion-printer.png"
install -m 644 "$REPO_ROOT/assets/icons/notion-printer-512.png" "$ICON_512_DIR/notion-printer.png"

cp -a "$REPO_ROOT/notion_print_export/." "$APP_ROOT/notion_print_export/"
mkdir -p "$APP_ROOT/learning_data/models"
cp -a "$REPO_ROOT/learning_data/models/." "$APP_ROOT/learning_data/models/"

find "$APP_ROOT" -type d -exec chmod 755 {} +
find "$APP_ROOT" -type f -exec chmod 644 {} +

cat >"$BIN_DIR/notion-printer" <<EOF
#!/usr/bin/env bash
set -euo pipefail
exec "$APP_INSTALL_DIR/notion_print_export_launcher.sh" --advanced "\$@"
EOF

chmod 755 "$BIN_DIR/notion-printer"
find "$BIN_DIR" -type d -exec chmod 755 {} +
find "$APPLICATIONS_DIR" -type d -exec chmod 755 {} +
find "$DOC_DIR" -type d -exec chmod 755 {} +

cat >"$APPLICATIONS_DIR/notion-printer.desktop" <<'EOF'
[Desktop Entry]
Type=Application
Version=1.0
Name=Notion Printer
Comment=Generate integrated print-friendly HTML from one or more Notion exports
Exec=/usr/bin/notion-printer %F
Terminal=false
MimeType=text/html;application/zip;application/x-zip;application/x-zip-compressed;
Categories=Office;Utility;
Icon=notion-printer
StartupNotify=true
EOF

find "$APPLICATIONS_DIR" -type f -exec chmod 644 {} +
find "$DOC_DIR" -type f -exec chmod 644 {} +

cat >"$DEBIAN_DIR/control" <<EOF
Package: $PACKAGE_NAME
Version: $PACKAGE_VERSION
Section: utils
Priority: optional
Architecture: $DEB_ARCH
Maintainer: $MAINTAINER
Depends: python3 (>= 3.10), python3-pil, zenity, xdg-utils
Description: $DESCRIPTION
 Notion Printer packages the integrated Notion HTML print workflow for Ubuntu.
 It installs one team-facing GUI launcher and the integrated print pipeline.
EOF

cat >"$DEBIAN_DIR/postinst" <<'EOF'
#!/usr/bin/env bash
set -e

echo
echo "Notion Printer 설치 또는 업데이트가 완료되었습니다."
echo "업데이트 후에는 컴퓨터를 다시 시작해주세요."
echo
EOF

chmod 755 "$DEBIAN_DIR/postinst"
chmod 755 "$APP_ROOT/notion_print_export_launcher.sh"

mkdir -p "$DIST_DIR"
rm -f "$OUTPUT_DEB"

if dpkg-deb --help 2>/dev/null | grep -q -- '--root-owner-group'; then
  dpkg-deb --build --root-owner-group "$BUILD_DIR" "$OUTPUT_DEB"
else
  dpkg-deb --build "$BUILD_DIR" "$OUTPUT_DEB"
fi

echo "Built package:"
echo "$OUTPUT_DEB"
echo
echo "Install on Ubuntu:"
echo "sudo apt install ./${OUTPUT_DEB#"$REPO_ROOT"/}"
