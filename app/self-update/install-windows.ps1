# Передатчик обновления для Windows. Плеер копирует его в папку обновлений, запускает и
# закрывается. Передатчик ждёт закрытия всех процессов плеера, ставит апдейт штатным
# установщиком из архива (без окон), снова запускает SoundSync и записывает результат.
param([int]$ProcessId, [string]$Zip, [string]$Root, [string]$State, [string]$Version)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $State | Out-Null
$log = Join-Path $State 'install.log'
Set-Content -LiteralPath $log -Value '' -Encoding UTF8
function Write-Result([bool]$Ok) {
  $json = @{ version = $Version; ok = $Ok; log = $log; at = (Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json -Compress
  $tmp = Join-Path $State 'result.json.tmp'
  [IO.File]::WriteAllText($tmp, $json, (New-Object Text.UTF8Encoding $false))
  Move-Item -LiteralPath $tmp -Destination (Join-Path $State 'result.json') -Force
}
function Get-PlayerProcesses {
  @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
      $_.Path -and $_.Path.StartsWith($Root.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)
    })
}
# Ждём, пока плеер и все его процессы (в том числе Python синхронизации) закроются.
try { Wait-Process -Id $ProcessId -Timeout 60 -ErrorAction SilentlyContinue } catch {}
$deadline = (Get-Date).AddSeconds(60)
while ((Get-Date) -lt $deadline -and (Get-PlayerProcesses).Count) { Start-Sleep -Milliseconds 300 }
$work = Join-Path $State 'unpacked'
$ok = $false
try {
  if (Test-Path -LiteralPath $work) { Remove-Item -LiteralPath $work -Recurse -Force }
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [IO.Compression.ZipFile]::ExtractToDirectory($Zip, $work)
  $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $work 'Update-SoundSync.ps1') -Root $Root 2>&1
  $ok = ($LASTEXITCODE -eq 0)
  [IO.File]::AppendAllText($log, (($output | Out-String) -replace "`r?`n", "`r`n"), (New-Object Text.UTF8Encoding $false))
} catch {
  [IO.File]::AppendAllText($log, ($_ | Out-String), (New-Object Text.UTF8Encoding $false))
}
Write-Result $ok
try { if (Test-Path -LiteralPath $work) { Remove-Item -LiteralPath $work -Recurse -Force } } catch {}
if ($ok) { Remove-Item -LiteralPath $Zip -Force -ErrorAction SilentlyContinue }
# При ошибке установщик возвращает прежние файлы, поэтому плеер запускается в любом случае.
if ($env:SOUNDSYNC_NO_RELAUNCH -ne '1') {
  Start-Process -FilePath (Join-Path $Root 'SoundSync.exe') -WorkingDirectory $Root
}
