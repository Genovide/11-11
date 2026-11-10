param([Parameter(Mandatory=$true)][string]$Root,[Parameter(Mandatory=$true)][string]$Patch,[string]$BaseArchive='')
$ErrorActionPreference='Stop'
$Root=[IO.Path]::GetFullPath($Root);$Patch=[IO.Path]::GetFullPath($Patch)
$data=Join-Path $Root 'Data'
New-Item -ItemType Directory -Path $data -Force | Out-Null
$sentinel=Join-Path $data 'upgrade-test-library.json'
[IO.File]::WriteAllText($sentinel,'{"marker":"keep-library-downloads-and-settings"}')
$before=(Get-FileHash -LiteralPath $sentinel).Hash
$argsList=@('-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $Patch 'Update-SoundSync.ps1'),'-Root',$Root)
if($BaseArchive){$argsList+=@('-BaseArchive',[IO.Path]::GetFullPath($BaseArchive))}
$prior=$ErrorActionPreference
try{$ErrorActionPreference='Continue';$log=& powershell.exe @argsList 2>&1;$exitCode=$LASTEXITCODE}finally{$ErrorActionPreference=$prior}
$log | Write-Host
if($exitCode -ne 0){throw 'Windows cumulative update failed'}
if(!$BaseArchive -and ($log -join "`n") -match 'основа .+обновлена автоматически|Загружаются необходимые компоненты'){throw 'Compatible update fetched a full base'}
if((Get-FileHash -LiteralPath $sentinel).Hash -ne $before){throw 'User data changed'}
if(!(Test-Path -LiteralPath (Join-Path $Root 'SoundSync.exe'))){throw 'Branded executable missing'}
$manifest=Get-Content -LiteralPath (Join-Path $Patch 'manifest.json') -Raw | ConvertFrom-Json
foreach($e in $manifest) {
 if((Get-FileHash -LiteralPath (Join-Path $Root $e.path)).Hash.ToLowerInvariant() -ne $e.sha256){throw "Installed payload mismatch: $($e.path)"}
}
. (Join-Path $Patch 'Update-Transaction.ps1')
Test-UpdateRuntime (Join-Path $Root 'alignment/runtime/python.exe')
if(!(Get-ChildItem -LiteralPath (Join-Path $data 'update-backups') -Directory)){throw 'Backup was not created'}
Write-Host 'Windows update payload, runtime repair, user Data and backup passed'
