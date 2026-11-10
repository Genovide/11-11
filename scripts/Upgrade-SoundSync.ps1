param([string]$Root='', [string]$BaseArchive='', [string]$RuntimeArchive='')
$ErrorActionPreference='Stop'
if(!$Root){Add-Type -AssemblyName System.Windows.Forms;$picker=New-Object System.Windows.Forms.FolderBrowserDialog;$picker.Description='Выбери папку установленного плеера (в том числе прежних версий)';if($picker.ShowDialog() -ne 'OK'){exit};$Root=$picker.SelectedPath}
$Root=[IO.Path]::GetFullPath($Root).TrimEnd('\')
if(!(Test-Path -LiteralPath (Join-Path $Root 'resources\app\main.cjs'))){throw 'Выбрана не папка плеера: resources\app\main.cjs не найден'}
$players=@(Get-ChildItem -LiteralPath $Root -File -Filter '*.exe' | Where-Object {$_.Name -in @('SoundSync.exe',('11'+'-11.exe')) -or $_.VersionInfo.FileDescription -match 'Music Player'})
if(!$players.Count){throw 'Файл запуска плеера не найден'}
$running=@(Get-Process -ErrorAction SilentlyContinue | Where-Object {$_.Path -and $_.Path.StartsWith(($Root+'\'),[StringComparison]::OrdinalIgnoreCase)})
if($running.Count){throw 'Полностью закрой плеер перед обновлением'}
$config=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'base.json') -Raw | ConvertFrom-Json
$manifest=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'manifest.json') -Raw | ConvertFrom-Json
function SafePath([string]$Parent,[string]$Relative){$p=[IO.Path]::GetFullPath((Join-Path $Parent $Relative));if(!$p.StartsWith(([IO.Path]::GetFullPath($Parent).TrimEnd('\')+'\'),[StringComparison]::OrdinalIgnoreCase)){throw 'Неверный путь в обновлении'};return $p}
foreach($entry in $manifest){$file=SafePath (Join-Path $PSScriptRoot 'payload') $entry.path;if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256){throw "Повреждён файл: $($entry.path)"}}
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$work=Join-Path $Root ('Data\update-staging\SoundSync-'+$stamp);New-Item -ItemType Directory -Path $work -Force | Out-Null
$stage=Join-Path $work 'program';New-Item -ItemType Directory -Path $stage | Out-Null
function FetchArchive($Spec,[string]$Cached,[string]$Name){$dest=Join-Path $work $Name;if($Cached){Copy-Item -LiteralPath $Cached -Destination $dest}else{[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12;Write-Host 'Загружаются необходимые компоненты. Это может занять несколько минут.';$prior=$ProgressPreference;try{$ProgressPreference='SilentlyContinue';Invoke-WebRequest -UseBasicParsing -Uri $Spec.url -OutFile $dest}finally{$ProgressPreference=$prior}};if((Get-FileHash -LiteralPath $dest -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Spec.sha256){throw 'Контрольная сумма загруженной основы не совпала'};return $dest}
$compatible=!$BaseArchive
if($compatible){
 Write-Host 'Проверяются движок, зависимости и модель установленного плеера…'
 $python=Join-Path $Root 'alignment\runtime\python.exe'
 $pythonEntry=$config.windows.compatibility | Where-Object {$_.path -eq 'alignment/runtime/python.exe'}
 if(!(Test-Path -LiteralPath $python) -or (Get-FileHash -LiteralPath $python -Algorithm SHA256).Hash.ToLowerInvariant() -ne $pythonEntry.sha256){$compatible=$false}
 else{
  $check=@'
import sys,pathlib,json,hashlib
root=pathlib.Path(sys.argv[1]);entries=json.loads(pathlib.Path(sys.argv[2]).read_text(encoding='utf-8-sig'))['windows']['compatibility']
for e in entries:
 p=root/e['path']
 if not p.is_file() or p.stat().st_size!=e['size']:sys.exit(1)
 with p.open('rb') as f:
  if hashlib.file_digest(f,'sha256').hexdigest()!=e['sha256']:sys.exit(1)
sys.exit(0)
'@
  try{& $python -I -S -c $check $Root (Join-Path $PSScriptRoot 'base.json');$compatible=$LASTEXITCODE -eq 0}catch{$compatible=$false}
 }
}
$exe=Join-Path $Root 'SoundSync.exe'
$branded=(Test-Path -LiteralPath $exe) -and ((Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant() -eq $config.windows.exeSha256)
$full=!$compatible
if($full){Write-Host 'У старой версии другая или неполная основа — она будет обновлена автоматически.';$archive=FetchArchive $config.windows.full $BaseArchive 'base.zip';Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $work 'base');$base=Join-Path $work 'base\SoundSync';foreach($item in Get-ChildItem -LiteralPath $base){Move-Item -LiteralPath $item.FullName -Destination $stage}}
else{New-Item -ItemType Directory -Force -Path (Join-Path $stage 'resources\app') | Out-Null;Copy-Item -LiteralPath (Join-Path $Root 'resources\app\node_modules') -Destination (Join-Path $stage 'resources\app\node_modules') -Recurse;if(!$branded){$archive=FetchArchive $config.windows.runtime $RuntimeArchive 'runtime.zip';Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $work 'runtime');Copy-Item -LiteralPath (Join-Path $work 'runtime\payload\SoundSync.exe') -Destination (Join-Path $stage 'SoundSync.exe')}}
foreach($entry in $manifest){$dest=SafePath $stage $entry.path;New-Item -ItemType Directory -Path (Split-Path $dest) -Force | Out-Null;Copy-Item -LiteralPath (SafePath (Join-Path $PSScriptRoot 'payload') $entry.path) -Destination $dest -Force}
if($full){$paths=@(Get-ChildItem -LiteralPath $stage | ForEach-Object {$_.Name})}else{$paths=@('resources\app');if(Test-Path -LiteralPath (Join-Path $stage 'SoundSync.exe')){$paths+='SoundSync.exe'};$paths+=@($manifest | Where-Object {$_.path -like 'alignment/*'} | ForEach-Object {$_.path})}
$legacy=@($players | Where-Object {$_.Name -ne 'SoundSync.exe'} | ForEach-Object {$_.Name});$paths=@($paths+$legacy | Select-Object -Unique)
$backup=Join-Path $Root ('Data\update-backups\1.2.2-'+$stamp);New-Item -ItemType Directory -Path $backup -Force | Out-Null
$moved=@();$installed=@()
try{foreach($relative in $paths){$dest=SafePath $Root $relative;if(Test-Path -LiteralPath $dest){$save=SafePath $backup $relative;New-Item -ItemType Directory -Force -Path (Split-Path $save) | Out-Null;Move-Item -LiteralPath $dest -Destination $save;$moved+=$relative};$src=SafePath $stage $relative;if(Test-Path -LiteralPath $src){New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null;Move-Item -LiteralPath $src -Destination $dest;$installed+=$relative}}}
catch{foreach($relative in $installed){$failed=SafePath (Join-Path $work 'failed') $relative;New-Item -ItemType Directory -Force -Path (Split-Path $failed) | Out-Null;Move-Item -LiteralPath (SafePath $Root $relative) -Destination $failed};foreach($relative in $moved){Move-Item -LiteralPath (SafePath $backup $relative) -Destination (SafePath $Root $relative)};throw}
try{$shell=New-Object -ComObject WScript.Shell;foreach($folder in @([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('Programs'))){if(!$folder){continue};foreach($item in @(Get-ChildItem -LiteralPath $folder -Filter '*.lnk' -File -Recurse -ErrorAction SilentlyContinue)){$link=$shell.CreateShortcut($item.FullName);if($players.FullName -contains $link.TargetPath){$link.TargetPath=Join-Path $Root 'SoundSync.exe';$link.IconLocation=$link.TargetPath+',0';$link.Description='SoundSync';$link.Save();$new=Join-Path $item.DirectoryName 'SoundSync.lnk';if($item.Name -ne 'SoundSync.lnk' -and !(Test-Path -LiteralPath $new)){Move-Item -LiteralPath $item.FullName -Destination $new}}}}}catch{Write-Warning 'Обновление установлено, но ярлык нужно заменить вручную на SoundSync.exe'}
$stagingRoot=[IO.Path]::GetFullPath((Join-Path $Root 'Data\update-staging')).TrimEnd('\')+'\'
if([IO.Path]::GetFullPath($work).StartsWith($stagingRoot,[StringComparison]::OrdinalIgnoreCase)){Remove-Item -LiteralPath $work -Recurse -Force}
Write-Host "SoundSync 1.2.2 установлен. Музыка и Data сохранены. Резервная копия: $backup"
