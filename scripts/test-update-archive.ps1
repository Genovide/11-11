$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Update-Archive.ps1')
$root=Join-Path ([IO.Path]::GetTempPath()) ('soundsync-archive-test-'+[guid]::NewGuid())
New-Item -ItemType Directory -Path $root | Out-Null
$zipPath=Join-Path $root 'fixture.zip'
$zip=[IO.Compression.ZipFile]::Open($zipPath,'Create')
try {
 foreach($name in @('payload/SoundSync.exe','payload/unused.txt','SoundSync/resources/app/main.cjs','SoundSync/alignment/model.bin')) {
  $entry=$zip.CreateEntry($name);$writer=New-Object IO.StreamWriter($entry.Open());try{$writer.Write($name)}finally{$writer.Dispose()}
 }
}finally{$zip.Dispose()}
$out=Join-Path $root 'full'
Expand-UpdateArchive $zipPath $out
if([IO.File]::ReadAllText((Join-Path $out 'SoundSync/alignment/model.bin')) -ne 'SoundSync/alignment/model.bin'){throw 'Full extraction failed'}
$exe=Join-Path $root 'SoundSync.exe'
Expand-UpdateExecutable $zipPath $exe
if([IO.File]::ReadAllText($exe) -ne 'payload/SoundSync.exe'){throw 'EXE extraction failed'}
if(Test-Path (Join-Path $root 'payload')){throw 'Unneeded payload was extracted'}
$missing=Join-Path $root 'missing.zip';$zip=[IO.Compression.ZipFile]::Open($missing,'Create');$zip.Dispose()
$rejected=$false;try{Expand-UpdateExecutable $missing (Join-Path $root 'missing.exe')}catch{$rejected=$true}
if(!$rejected){throw 'Missing EXE was accepted'}
# Ensure the ZIP handle was closed even on errors.
[IO.File]::Delete($missing)
# Native extraction must reject paths outside the destination.
$bad=Join-Path $root 'bad.zip';$zip=[IO.Compression.ZipFile]::Open($bad,'Create');$null=$zip.CreateEntry('../escaped.txt');$zip.Dispose()
$rejected=$false;try{Expand-UpdateArchive $bad (Join-Path $root 'safe')}catch{$rejected=$true}
if(!$rejected -or (Test-Path (Join-Path $root 'escaped.txt'))){throw 'Unsafe ZIP path accepted'}
Write-Host 'Full ZIP, selective EXE, missing entry, handle cleanup and path traversal tests passed'
# Delete only the uniquely named test directory created above.
if((Split-Path $root -Leaf) -like 'soundsync-archive-test-*'){Remove-Item -LiteralPath $root -Recurse -Force}
