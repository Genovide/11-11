param([string]$Root='')
$ErrorActionPreference='Stop'
$payload=Join-Path $PSScriptRoot 'payload'
if(!$Root){Add-Type -AssemblyName System.Windows.Forms;$picker=New-Object System.Windows.Forms.FolderBrowserDialog;$picker.Description='Выбери папку установленного SoundSync';if($picker.ShowDialog() -ne 'OK'){exit};$Root=$picker.SelectedPath}
$Root=[IO.Path]::GetFullPath($Root).TrimEnd('\')
if(!(Test-Path -LiteralPath (Join-Path $Root 'resources\app\main.cjs'))){throw 'Это не папка установленного плеера'}
$prefix=$Root+'\'
$running=@(Get-Process -ErrorAction SilentlyContinue | Where-Object {$_.Path -and $_.Path.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)})
if($running.Count){throw 'Сначала полностью закрой плеер и запусти обновление ещё раз'}
$manifest=Get-Content -LiteralPath (Join-Path $payload 'manifest.json') -Raw | ConvertFrom-Json
foreach($entry in $manifest){$file=[IO.Path]::GetFullPath((Join-Path $payload $entry.path));if(!$file.StartsWith(([IO.Path]::GetFullPath($payload)+'\'),[StringComparison]::OrdinalIgnoreCase)){throw 'Некорректный путь в обновлении'};if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256){throw "Повреждён файл обновления: $($entry.path)"}}
$backup=Join-Path $Root ('Data\update-backups\'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Force -Path $backup | Out-Null
Copy-Item -LiteralPath (Join-Path $Root 'resources\app') -Destination (Join-Path $backup 'app') -Recurse
$players=@(Get-ChildItem -LiteralPath $Root -Filter '*.exe' -File | Where-Object {$_.VersionInfo.FileDescription -match 'Music Player'})
foreach($player in $players){Copy-Item -LiteralPath $player.FullName -Destination (Join-Path $backup $player.Name)}
try{
 Copy-Item -LiteralPath (Join-Path $payload 'SoundSync.exe') -Destination (Join-Path $Root 'SoundSync.exe') -Force
 Copy-Item -Path (Join-Path $payload 'resources\app\*') -Destination (Join-Path $Root 'resources\app') -Recurse -Force
 foreach($player in $players){if($player.Name -ne 'SoundSync.exe'){Remove-Item -LiteralPath $player.FullName}}
 $shell=New-Object -ComObject WScript.Shell
 foreach($folder in @([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('Programs'))){if(!$folder){continue};foreach($item in @(Get-ChildItem -LiteralPath $folder -Filter '*.lnk' -File -Recurse -ErrorAction SilentlyContinue)){$link=$shell.CreateShortcut($item.FullName);if($players.FullName -contains $link.TargetPath){$link.TargetPath=Join-Path $Root 'SoundSync.exe';$link.IconLocation=$link.TargetPath+',0';$link.Description='SoundSync music player';$link.Save();$new=Join-Path $item.DirectoryName 'SoundSync.lnk';if($item.Name -ne 'SoundSync.lnk' -and !(Test-Path -LiteralPath $new)){Move-Item -LiteralPath $item.FullName -Destination $new}}}}
 Write-Host "SoundSync 1.2.0 установлен. Резервная копия: $backup"
}catch{Copy-Item -Path (Join-Path $backup 'app\*') -Destination (Join-Path $Root 'resources\app') -Recurse -Force;foreach($player in $players){Copy-Item -LiteralPath (Join-Path $backup $player.Name) -Destination (Join-Path $Root $player.Name) -Force};throw}
