param([string]$Root='')
$ErrorActionPreference='Stop'
if(!$Root){Add-Type -AssemblyName System.Windows.Forms;$picker=New-Object System.Windows.Forms.FolderBrowserDialog;$picker.Description='Выбери папку SoundSync 1.2.0';if($picker.ShowDialog() -ne 'OK'){exit};$Root=$picker.SelectedPath}
$Root=[IO.Path]::GetFullPath($Root).TrimEnd('\')
$app=Join-Path $Root 'resources\app'
$version=(Get-Content -LiteralPath (Join-Path $app 'package.json') -Raw | ConvertFrom-Json).version
if($version -notin @('1.2.0','1.2.1')){throw 'Обновление предназначено для SoundSync 1.2.0. Сначала установи полную версию.'}
$running=@(Get-Process -ErrorAction SilentlyContinue | Where-Object {$_.Path -and $_.Path.StartsWith(($Root+'\'),[StringComparison]::OrdinalIgnoreCase)})
if($running.Count){throw 'Полностью закрой SoundSync перед обновлением'}
$manifest=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'manifest.json') -Raw | ConvertFrom-Json
foreach($entry in $manifest){$dest=[IO.Path]::GetFullPath((Join-Path $app $entry.path));if(!$dest.StartsWith(($app+'\'),[StringComparison]::OrdinalIgnoreCase)){throw 'Неверный путь в пакете'};$source=Join-Path (Join-Path $PSScriptRoot 'payload') $entry.path;if((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256){throw "Повреждён файл: $($entry.path)"}}
$backup=Join-Path $Root ('Data\update-backups\1.2.1-'+(Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
New-Item -ItemType Directory -Path $backup -Force | Out-Null
$old=@{};foreach($entry in $manifest){$dest=Join-Path $app $entry.path;$old[$entry.path]=Test-Path -LiteralPath $dest;if($old[$entry.path]){$copy=Join-Path $backup $entry.path;New-Item -ItemType Directory -Force -Path (Split-Path $copy) | Out-Null;Copy-Item -LiteralPath $dest -Destination $copy}}
try{foreach($entry in $manifest){$dest=Join-Path $app $entry.path;New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null;Copy-Item -LiteralPath (Join-Path (Join-Path $PSScriptRoot 'payload') $entry.path) -Destination $dest -Force}}
catch{foreach($entry in $manifest){$dest=Join-Path $app $entry.path;if($old[$entry.path]){Copy-Item -LiteralPath (Join-Path $backup $entry.path) -Destination $dest -Force}elseif(Test-Path -LiteralPath $dest){Remove-Item -LiteralPath $dest}};throw}
Write-Host "SoundSync 1.2.1 установлен. Резервная копия: $backup"
