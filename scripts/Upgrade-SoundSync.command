#!/bin/bash
# Накопительное обновление SoundSync для Mac Apple Silicon.
# В Терминале — понятные шаги с прогрессом, вокруг — нативные окна macOS.
# Без терминала (CI, автоматический запуск) окон и цветов нет, логика та же.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
VERSION="$(sed -n 's/.*"version": *"\([0-9][0-9.]*\)".*/\1/p' "$HERE/payload/resources/app/package.json" | head -1)"
VERSION="${VERSION:-новая версия}"
LOG="${TMPDIR:-/tmp}/SoundSync-update-$(date +%Y%m%d-%H%M%S).log"
: >"$LOG"

INTERACTIVE=false
if [ -t 1 ] && [ -z "${CI:-}" ] && [ -z "${SOUNDSYNC_NO_DIALOGS:-}" ]; then INTERACTIVE=true; fi
if [ -t 1 ]; then
  B=$'\033[1m' DIM=$'\033[2m' Y=$'\033[38;5;220m' G=$'\033[38;5;114m' R=$'\033[38;5;203m' N=$'\033[0m'
else
  B='' DIM='' Y='' G='' R='' N=''
fi
STEP=0
TOTAL=6
ICON=''
CANCELLED=false

say() { printf '%s\n' "$*"; }
step() {
  STEP=$((STEP + 1))
  printf '  %s%s/%s%s  %s' "$DIM" "$STEP" "$TOTAL" "$N" "$1"
  [ -t 1 ] || printf '\n'
}
done_step() { if [ -t 1 ]; then printf '  %s✓%s\n' "$G" "$N"; fi; }
note() { printf '       %s%s%s\n' "$DIM" "$1" "$N"; }

# Долгая команда: вывод уходит в журнал, в терминале крутится индикатор.
quietly() {
  if [ -t 1 ]; then
    "$@" >>"$LOG" 2>&1 &
    local pid=$! i=0
    local frames=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
    printf ' '
    while kill -0 "$pid" 2>/dev/null; do
      printf '%s%s%s\b' "$Y" "${frames[i % 10]}" "$N"
      i=$((i + 1))
      sleep 0.1
    done
    printf ' \b\b'
    wait "$pid"
  else
    "$@" >>"$LOG" 2>&1
  fi
}

dialog() {
  # dialog "текст" "кнопки через |" "кнопка по умолчанию" → печатает нажатую кнопку
  $INTERACTIVE || return 0
  local text="$1" buttons default="$3" list='' icon_clause='with icon note'
  IFS='|' read -r -a buttons <<<"$2"
  for b in "${buttons[@]}"; do list="$list\"$b\","; done
  [ -n "$ICON" ] && icon_clause="with icon (POSIX file \"$ICON\")"
  osascript -e "button returned of (display dialog \"$text\" with title \"SoundSync\" buttons {${list%,}} default button \"$default\" $icon_clause)" 2>/dev/null || echo 'Отмена'
}

header() {
  say ''
  say "  ${Y}${B}≈ SoundSync${N}  ${B}обновление до $VERSION${N}"
  say "  ${DIM}Mac Apple Silicon · музыка, медиатека и настройки сохраняются${N}"
  say ''
}

header
[ "$(uname -m)" = arm64 ] || {
  say "  ${R}✗${N} Этот апдейт предназначен для Mac Apple Silicon"
  exit 1
}
OLD="${1:-/Applications/SoundSync.app}"
BASE_ARCHIVE="${2:-}"
if [ ! -d "$OLD" ]; then OLD="$(osascript -e 'POSIX path of (choose file with prompt "Выбери установленный плеер, включая прежнее название" of type {"com.apple.application-bundle"})')"; fi
OLD="${OLD%/}"
[ -f "$OLD/Contents/Info.plist" ] || {
  say "  ${R}✗${N} Выбери приложение .app"
  exit 1
}
for candidate in "$OLD/Contents/Resources/electron.icns" "$OLD/Contents/Resources/SoundSync.icns"; do
  [ -f "$candidate" ] && ICON="$candidate" && break
done
BUNDLE_ID="$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$OLD/Contents/Info.plist" 2>/dev/null || true)"
OLD_NAME="$(basename "$OLD")"
case "$OLD_NAME:$BUNDLE_ID" in SoundSync.app:* | 11-11.app:* | 11:11.app:* | *:app.soundsync.player | *:com.eleveneleven.player) ;; *)
  say "  ${R}✗${N} Выбрано другое приложение"
  exit 1
  ;;
esac

if $INTERACTIVE; then
  answer="$(dialog "Обновить SoundSync до версии $VERSION?\n\nМузыка, медиатека, любимое и настройки сохранятся. Перед заменой будет сделана резервная копия приложения." 'Отмена|Обновить' 'Обновить')"
  if [ "$answer" != 'Обновить' ]; then
    CANCELLED=true
    say "  Обновление отменено."
    exit 0
  fi
fi

# Запущен ли именно этот плеер: смотрим только процессы, чей исполняемый файл внутри него.
# Так копия приложения в другой папке не мешает обновлению, а передатчик обновления,
# у которого путь к плееру лишь в аргументах, не считается плеером.
app_running() { ps -axo comm= | grep -qF "$OLD/Contents/"; }
if app_running; then
  if $INTERACTIVE && [ "$(dialog 'SoundSync сейчас открыт. Закрыть его и продолжить обновление?' 'Отмена|Закрыть и продолжить' 'Закрыть и продолжить')" = 'Закрыть и продолжить' ]; then
    osascript -e "tell application \"$OLD\" to quit" >/dev/null 2>&1 || true
    for _ in $(seq 1 60); do app_running || break; sleep 0.5; done
  fi
  if app_running; then
    say "  ${R}✗${N} Полностью закрой плеер через меню приложения"
    exit 1
  fi
fi
TARGET="$(dirname "$OLD")/SoundSync.app"
if [ "$TARGET" != "$OLD" ] && [ -e "$TARGET" ]; then
  say "  ${R}✗${N} SoundSync.app уже существует рядом. Выбери его для обновления, чтобы не затронуть другую копию."
  exit 1
fi

WORK=''
BACKUP="${OLD%.app}-backup-$(date +%Y%m%d-%H%M%S).app"
REPLACED=false
INSTALLED=false
cleanup() {
  if [ "$REPLACED" = true ] && [ "$INSTALLED" = false ]; then
    if [ -e "$TARGET" ]; then mv "$TARGET" "$WORK/failed.app" || return; fi
    mv "$BACKUP" "$OLD" || return
  fi
  case "$WORK" in */.soundsync-upgrade.*) rm -rf "$WORK" ;; esac
}
finish() {
  local status=$?
  cleanup
  if [ "$status" -ne 0 ] && [ "$CANCELLED" = false ]; then
    [ -t 1 ] && printf '  %s✗%s\n' "$R" "$N"
    say ''
    say "  ${R}${B}Обновление не установлено.${N} Прежняя версия осталась на месте."
    say "  ${DIM}Подробности: $LOG${N}"
    dialog "Не удалось обновить SoundSync.\n\nПрежняя версия осталась на месте, ничего не потеряно.\n\nПодробности в журнале:\n$LOG" 'Готово' 'Готово' >/dev/null
  fi
}
trap finish EXIT

step 'Проверка файлов обновления'
(cd "$HERE" && quietly shasum -a 256 --quiet -c SHA256SUMS-payload.txt)
done_step

WORK="$(mktemp -d "$(dirname "$OLD")/.soundsync-upgrade.XXXXXX")"

step 'Подготовка основы'
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
  quietly ditto "$OLD" "$WORK/SoundSync.app"
  done_step
else
  [ -t 1 ] && printf '\n'
  note 'Основа прежней версии будет обновлена автоматически. Загружаются необходимые компоненты.'
  ARCHIVE="$BASE_ARCHIVE"
  if [ -z "$ARCHIVE" ]; then
    ARCHIVE="$WORK/base.zip"
    curl --fail --location --retry 3 --progress-bar -o "$WORK/base.zip" 'https://github.com/Genovide/SoundSync/releases/download/v1.2.0/SoundSync-1.2.0-macOS-arm64.zip'
  fi
  [ "$(shasum -a 256 "$ARCHIVE" | cut -d ' ' -f 1)" = 'e9af35535b3fef181ae8af9ba3419cdd37eda49b1d8b7877eddb55c308468867' ] || {
    say "  ${R}✗${N} Контрольная сумма основы не совпала"
    exit 1
  }
  printf '       '
  quietly ditto -x -k "$ARCHIVE" "$WORK"
  done_step
fi

step "Установка SoundSync $VERSION"
# Replace the entire app source, preserving only the verified native dependencies.
mv "$WORK/SoundSync.app/Contents/Resources/app/node_modules" "$WORK/node_modules"
rm -rf "$WORK/SoundSync.app/Contents/Resources/app"
quietly ditto "$HERE/payload/resources/app" "$WORK/SoundSync.app/Contents/Resources/app"
mv "$WORK/node_modules" "$WORK/SoundSync.app/Contents/Resources/app/node_modules"
quietly ditto "$HERE/payload/alignment" "$WORK/SoundSync.app/Contents/Resources/alignment"
/usr/libexec/PlistBuddy -c "Set CFBundleShortVersionString $VERSION" "$WORK/SoundSync.app/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set CFBundleVersion $VERSION" "$WORK/SoundSync.app/Contents/Info.plist"
done_step

# Check the relocated native engine before signing and before replacing the app.
step 'Проверка движка синхронизации текстов'
quietly "$WORK/SoundSync.app/Contents/Resources/alignment/runtime/bin/python3.12" -I -B -W ignore -c 'import torch,torchaudio,stable_whisper,imageio_ffmpeg; from torch.utils.data import DataLoader; from demucs.pretrained import get_model; assert torch.ones(1).sum().item()==1; print("Python/PyTorch OK")'
done_step

step 'Подпись приложения'
quietly codesign --force --deep --sign - "$WORK/SoundSync.app"
quietly codesign --verify --deep --strict "$WORK/SoundSync.app"
done_step

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
      [ ! -e "$PROFILE" ] || {
        say "  ${R}✗${N} Папка данных уже появилась. Повтори обновление."
        exit 1
      }
      mv "$WORK/profile" "$PROFILE"
      note "Данные перенесены в $PROFILE. Исходная копия сохранена."
      break
    fi
  done
fi

step 'Замена приложения'
quietly codesign --verify --deep --strict "$WORK/SoundSync.app"
[ ! -e "$BACKUP" ] || {
  say "  ${R}✗${N} Резервная копия уже существует, повтори через секунду"
  exit 1
}
mv "$OLD" "$BACKUP"
REPLACED=true
mv "$WORK/SoundSync.app" "$TARGET"
INSTALLED=true
done_step

say ''
say "  ${G}${B}SoundSync $VERSION установлен:${N} $TARGET"
say "  ${DIM}Резервная копия: $BACKUP${N}"
say "  ${DIM}Музыка, медиатека, история и настройки сохранены. Заверения Apple по-прежнему нет.${N}"
say ''
if $INTERACTIVE; then
  if [ "$(dialog "SoundSync $VERSION установлен.\n\nМузыка, медиатека и настройки на месте. Прежняя версия сохранена как резервная копия рядом с приложением." 'Готово|Открыть SoundSync' 'Открыть SoundSync')" = 'Открыть SoundSync' ]; then
    open "$TARGET"
  fi
fi
