#!/bin/bash
# Передатчик обновления для Mac. Плеер копирует его в папку обновлений, запускает и
# закрывается. Передатчик ждёт закрытия плеера, ставит апдейт штатным установщиком из
# архива (без окон), снова открывает SoundSync и записывает результат для плеера.
# Аргументы: PID ZIP APP STATE VERSION
set -u
PID="$1" ZIP="$2" APP="$3" STATE="$4" VERSION="$5"
LOG="$STATE/install.log"
RESULT="$STATE/result.json"
mkdir -p "$STATE"
: >"$LOG"
write_result() {
  printf '{"version":"%s","ok":%s,"log":"%s","at":"%s"}\n' "$VERSION" "$1" "$LOG" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$RESULT.tmp" &&
    mv "$RESULT.tmp" "$RESULT"
}
app_running() { ps -axo comm= | grep -qF "$APP/Contents/"; }
# Ждём, пока плеер и все его процессы закроются (до 60 секунд).
for _ in $(seq 1 240); do kill -0 "$PID" 2>/dev/null || break; sleep 0.25; done
for _ in $(seq 1 240); do app_running || break; sleep 0.25; done
WORK="$STATE/unpacked"
rm -rf "$WORK"
mkdir -p "$WORK"
ok=false
if ditto -x -k "$ZIP" "$WORK" >>"$LOG" 2>&1 &&
  SOUNDSYNC_NO_DIALOGS=1 /bin/bash "$WORK/Update-SoundSync.command" "$APP" </dev/null >>"$LOG" 2>&1; then
  ok=true
fi
write_result "$ok"
rm -rf "$WORK"
[ "$ok" = true ] && rm -f "$ZIP"
# При ошибке установщик возвращает прежнюю версию, поэтому плеер откроется в любом случае.
[ "${SOUNDSYNC_NO_RELAUNCH:-}" = 1 ] || open "$APP"
