# Native ZIP APIs avoid PowerShell's per-file provider and progress overhead.
Add-Type -AssemblyName System.IO.Compression.FileSystem
function Expand-UpdateArchive([string]$Archive,[string]$Destination) {
 Write-Host 'Распаковывается основа плеера. На медленном диске это может занять несколько минут…'
 [IO.Compression.ZipFile]::ExtractToDirectory($Archive,$Destination)
}
function Expand-UpdateExecutable([string]$Archive,[string]$Destination) {
 $zip=[IO.Compression.ZipFile]::OpenRead($Archive)
 try {
  $entry=$zip.GetEntry('payload/SoundSync.exe')
  if(!$entry){throw 'В обновлении отсутствует payload/SoundSync.exe'}
  [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$Destination,$false)
 } finally {$zip.Dispose()}
}
