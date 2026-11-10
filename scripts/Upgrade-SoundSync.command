#!/bin/bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
[ "$(uname -m)" = arm64 ] || { echo 'Этот апдейт предназначен для Mac Apple Silicon'; exit 1; }
OLD="${1:-/Applications/SoundSync.app}"
BASE_ARCHIVE="${2:-}"
if [ ! -d "$OLD" ]; then OLD="$(osascript -e 'POSIX path of (choose file with prompt "Выбери установленный плеер, включая прежнее название" of type {"com.apple.application-bundle"})')"; fi
OLD="${OLD%/}"
[ -f "$OLD/Contents/Info.plist" ] || { echo 'Выбери приложение .app'; exit 1; }
BUNDLE_ID="$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$OLD/Contents/Info.plist" 2>/dev/null || true)"
OLD_NAME="$(basename "$OLD")"
case "$OLD_NAME:$BUNDLE_ID" in SoundSync.app:*|11-11.app:*|11:11.app:*|*:app.soundsync.player|*:com.eleveneleven.player) ;; *) echo 'Выбрано другое приложение'; exit 1;; esac
if pgrep -x SoundSync >/dev/null || pgrep -x '11-11' >/dev/null; then echo 'Полностью закрой плеер через меню приложения'; exit 1; fi
TARGET="$(dirname "$OLD")/SoundSync.app"
if [ "$TARGET" != "$OLD" ] && [ -e "$TARGET" ]; then echo 'SoundSync.app уже существует рядом. Выбери его для обновления, чтобы не затронуть другую копию.'; exit 1; fi
(cd "$HERE" && shasum -a 256 -c SHA256SUMS-payload.txt)
WORK="$(mktemp -d "${TMPDIR:-/tmp}/soundsync-upgrade.XXXXXX")"
BACKUP="${OLD%.app}-backup-$(date +%Y%m%d-%H%M%S).app"
cleanup() { if [ ! -d "$TARGET" ] && [ ! -d "$OLD" ] && [ -d "$BACKUP" ]; then mv "$BACKUP" "$OLD"; fi; case "$WORK" in */soundsync-upgrade.*) rm -rf "$WORK" ;; esac; }
trap cleanup EXIT
COMPATIBLE=true
FRAMEWORK="$OLD/Contents/Frameworks/Electron Framework.framework/Versions/A/Resources/Info.plist"
FRAMEWORK_VERSION="$(/usr/libexec/PlistBuddy -c 'Print CFBundleVersion' "$FRAMEWORK" 2>/dev/null || true)"
[ "$FRAMEWORK_VERSION" = '42.11.18' ] || COMPATIBLE=false
[ -x "$OLD/Contents/Resources/alignment/runtime/bin/python3.12" ] || COMPATIBLE=false
[ -f "$OLD/Contents/Resources/app/node_modules/music-metadata/package.json" ] || COMPATIBLE=false
MODEL="$OLD/Contents/Resources/alignment/models/whisper/small.pt"
if [ ! -f "$MODEL" ] || [ "$(shasum -a 256 "$MODEL" | cut -d ' ' -f 1)" != '9ecf779972d90ba49c06d968637d720dd632c55bbf19d441fb42bf17a411e794' ]; then COMPATIBLE=false; fi
if ! codesign --verify --deep --strict "$OLD" >/dev/null 2>&1; then COMPATIBLE=false; fi
if [ -n "$BASE_ARCHIVE" ]; then COMPATIBLE=false; fi
if [ "$COMPATIBLE" = true ]; then
  ditto "$OLD" "$WORK/SoundSync.app"
else
  echo 'Основа прежней версии будет обновлена автоматически. Загружаются необходимые компоненты.'
  if [ -n "$BASE_ARCHIVE" ]; then cp "$BASE_ARCHIVE" "$WORK/base.zip"; else curl --fail --location --retry 3 -o "$WORK/base.zip" 'https://github.com/Genovide/SoundSync/releases/download/v1.2.0/SoundSync-1.2.0-macOS-arm64.zip'; fi
  echo 'e9af35535b3fef181ae8af9ba3419cdd37eda49b1d8b7877eddb55c308468867  base.zip' | (cd "$WORK" && shasum -a 256 -c -)
  ditto -x -k "$WORK/base.zip" "$WORK"
fi
# Replace the entire app source, preserving only the verified native dependencies.
mv "$WORK/SoundSync.app/Contents/Resources/app/node_modules" "$WORK/node_modules"
rm -rf "$WORK/SoundSync.app/Contents/Resources/app"
ditto "$HERE/payload/resources/app" "$WORK/SoundSync.app/Contents/Resources/app"
mv "$WORK/node_modules" "$WORK/SoundSync.app/Contents/Resources/app/node_modules"
ditto "$HERE/payload/alignment" "$WORK/SoundSync.app/Contents/Resources/alignment"
/usr/libexec/PlistBuddy -c 'Set CFBundleShortVersionString 1.2.2' "$WORK/SoundSync.app/Contents/Info.plist"
/usr/libexec/PlistBuddy -c 'Set CFBundleVersion 1.2.2' "$WORK/SoundSync.app/Contents/Info.plist"
codesign --force --deep --sign - "$WORK/SoundSync.app"
codesign --verify --deep --strict "$WORK/SoundSync.app"
PROFILE="$HOME/Library/Application Support/SoundSync"
if [ ! -e "$PROFILE" ]; then
  for prior in "$OLD/Contents/MacOS/Data" "$OLD/Contents/Resources/Data" "$(dirname "$OLD")/Data" "$HOME/Library/Application Support/11-11" "$HOME/Library/Application Support/11:11"; do
    if [ -f "$prior/library.json" ] || [ -d "$prior/Local Storage" ]; then
      ditto "$prior" "$WORK/profile"
      # Portable libraries can contain absolute paths into their old Data folder.
      "$WORK/SoundSync.app/Contents/Resources/alignment/runtime/bin/python3.12" -I -S -B -c '
import json,pathlib,sys
root=pathlib.Path(sys.argv[1]);old=sys.argv[2].rstrip("/");new=sys.argv[3].rstrip("/")
def migrate(value):
 if isinstance(value,str):return new+value[len(old):] if value==old or value.startswith(old+"/") else value
 if isinstance(value,list):return [migrate(x) for x in value]
 if isinstance(value,dict):return {k:migrate(v) for k,v in value.items()}
 return value
for file in root.rglob("*.json"):
 try:
  original=json.loads(file.read_text(encoding="utf-8-sig"));updated=migrate(original)
  if updated!=original:file.write_text(json.dumps(updated,ensure_ascii=False),encoding="utf-8")
 except (ValueError,OSError,UnicodeError):pass
' "$WORK/profile" "$prior" "$PROFILE"
      mkdir -p "$(dirname "$PROFILE")"
      [ ! -e "$PROFILE" ] || { echo 'Папка данных уже появилась. Повтори обновление.'; exit 1; }
      mv "$WORK/profile" "$PROFILE"
      echo "Данные перенесены в $PROFILE. Исходная копия сохранена."
      break
    fi
  done
fi
codesign --verify --deep --strict "$WORK/SoundSync.app"
[ ! -e "$BACKUP" ] || { echo 'Резервная копия уже существует, повтори через секунду'; exit 1; }
mv "$OLD" "$BACKUP"
mv "$WORK/SoundSync.app" "$TARGET"
echo "SoundSync 1.2.2 установлен: $TARGET"
echo "Резервная копия: $BACKUP"
echo 'Музыка, медиатека, история и настройки сохранены. Заверения Apple по-прежнему нет.'
