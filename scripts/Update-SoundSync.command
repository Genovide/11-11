#!/bin/bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
TARGET="${1:-/Applications/SoundSync.app}"
if [ ! -d "$TARGET" ] && [ -d "$HOME/Applications/SoundSync.app" ]; then TARGET="$HOME/Applications/SoundSync.app"; fi
if [ ! -d "$TARGET" ]; then
  TARGET="$(osascript -e 'POSIX path of (choose file with prompt "Выбери установленный SoundSync.app" of type {"com.apple.application-bundle"})')"
fi
TARGET="${TARGET%/}"
if [ "${TARGET##*/}" != "SoundSync.app" ]; then echo 'Выбери SoundSync.app. Для перехода с прежнего названия установи полную версию.'; exit 1; fi
if pgrep -x SoundSync >/dev/null; then echo 'Сначала закрой SoundSync через меню SoundSync → Завершить.'; exit 1; fi
MODEL="$TARGET/Contents/Resources/alignment/models/whisper/small.pt"
EXPECTED='9ecf779972d90ba49c06d968637d720dd632c55bbf19d441fb42bf17a411e794'
if [ ! -f "$MODEL" ] || [ "$(shasum -a 256 "$MODEL" | cut -d ' ' -f 1)" != "$EXPECTED" ]; then echo 'Нужна полная версия: встроенная модель отсутствует или повреждена.'; exit 1; fi
TEMP_APP="$(mktemp -d "${TMPDIR:-/tmp}/soundsync-update.XXXXXX")"
BACKUP="${TARGET%.app}-backup-$(date +%Y%m%d-%H%M%S).app"
cleanup() { if [ ! -d "$TARGET" ] && [ -d "$BACKUP" ]; then mv "$BACKUP" "$TARGET"; fi; case "$TEMP_APP" in */soundsync-update.*) rm -rf "$TEMP_APP" ;; esac; }
trap cleanup EXIT
ditto "$HERE/SoundSync.app" "$TEMP_APP/SoundSync.app"
mkdir -p "$TEMP_APP/SoundSync.app/Contents/Resources/alignment/models/whisper"
cp "$MODEL" "$TEMP_APP/SoundSync.app/Contents/Resources/alignment/models/whisper/small.pt"
codesign --verify --deep --strict "$TEMP_APP/SoundSync.app"
mv "$TARGET" "$BACKUP"
mv "$TEMP_APP/SoundSync.app" "$TARGET"
echo "SoundSync обновлён. Резервная копия: $BACKUP"
echo 'Медиатека и настройки остались в Application Support/SoundSync.'
open "$TARGET"
