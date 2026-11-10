@echo off
setlocal
set "SOUNDSYNC_PLAYER_DIR=%~dp0"
if not exist "%~dp0SoundSync.exe" (
  echo Put this BAT file in the same folder as SoundSync.exe, then run it again.
  pause
  exit /b 1
)
powershell.exe -NoLogo -NoProfile -NonInteractive -Command "try { $root=$env:SOUNDSYNC_PLAYER_DIR; $exe=Join-Path $root 'SoundSync.exe'; $desktop=[Environment]::GetFolderPath('Desktop'); $programs=[Environment]::GetFolderPath('Programs'); if (-not $desktop -or -not $programs) { throw 'Windows shortcut folders are unavailable.' }; $shell=New-Object -ComObject WScript.Shell; foreach ($folder in @($desktop,$programs)) { [void][IO.Directory]::CreateDirectory($folder); $link=$shell.CreateShortcut((Join-Path $folder 'SoundSync.lnk')); $link.TargetPath=$exe; $link.WorkingDirectory=$root; $link.IconLocation=$exe+',0'; $link.Description='SoundSync music player'; $link.Save() }; Write-Host 'Done: shortcuts created on the Desktop and in the Start menu.'; exit 0 } catch { Write-Host ('Error: '+$_.Exception.Message); exit 1 }"
if errorlevel 1 (
  echo Could not create shortcuts.
  pause
  exit /b 1
)
pause
exit /b 0
