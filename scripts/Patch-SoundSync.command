#!/bin/bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
TARGET="${1:-/Applications/SoundSync.app}"
if [ ! -d "$TARGET" ] && [ -d "$HOME/Applications/SoundSync.app" ]; then TARGET="$HOME/Applications/SoundSync.app"; fi
if [ ! -d "$TARGET" ]; then TARGET="$(osascript -e 'POSIX path of (choose file with prompt "Выбери SoundSync.app 1.2.0" of type {"com.apple.application-bundle"})')"; fi
TARGET="${TARGET%/}"
if [ "${TARGET##*/}" != 'SoundSync.app' ]; then echo 'Выбери установленную SoundSync.app'; exit 1; fi
if pgrep -x SoundSync >/dev/null; then echo 'Полностью закрой SoundSync через меню приложения'; exit 1; fi
VERSION="$(/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' "$TARGET/Contents/Info.plist")"
case "$VERSION" in 1.2.0|1.2.1) ;; *) echo 'Нужна полная версия SoundSync 1.2.0'; exit 1;; esac
(cd "$HERE" && shasum -a 256 -c SHA256SUMS-payload.txt)
TEMP_APP="$(mktemp -d "${TMPDIR:-/tmp}/soundsync-patch.XXXXXX")"
BACKUP="${TARGET%.app}-backup-$(date +%Y%m%d-%H%M%S).app"
cleanup() { if [ ! -d "$TARGET" ] && [ -d "$BACKUP" ]; then mv "$BACKUP" "$TARGET"; fi; case "$TEMP_APP" in */soundsync-patch.*) rm -rf "$TEMP_APP" ;; esac; }
trap cleanup EXIT
ditto "$TARGET" "$TEMP_APP/SoundSync.app"
ditto "$HERE/payload" "$TEMP_APP/SoundSync.app/Contents/Resources/app"
/usr/libexec/PlistBuddy -c 'Set CFBundleShortVersionString 1.2.1' "$TEMP_APP/SoundSync.app/Contents/Info.plist"
/usr/libexec/PlistBuddy -c 'Set CFBundleVersion 1.2.1' "$TEMP_APP/SoundSync.app/Contents/Info.plist"
codesign --force --deep --sign - "$TEMP_APP/SoundSync.app"
codesign --verify --deep --strict "$TEMP_APP/SoundSync.app"
if [ -e "$BACKUP" ]; then echo 'Резервная копия уже существует. Повтори через секунду.'; exit 1; fi
mv "$TARGET" "$BACKUP"
mv "$TEMP_APP/SoundSync.app" "$TARGET"
echo "SoundSync 1.2.1 установлен. Резервная копия: $BACKUP"
echo 'Музыка, история и настройки сохранены.'
