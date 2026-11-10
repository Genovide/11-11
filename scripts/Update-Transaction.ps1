function Resolve-UpdatePath([string]$Parent,[string]$Relative) {
 $parentPath=[IO.Path]::GetFullPath($Parent).TrimEnd('\')+'\'
 $target=[IO.Path]::GetFullPath((Join-Path $Parent $Relative))
 if(!$target.StartsWith($parentPath,[StringComparison]::OrdinalIgnoreCase)){throw 'Invalid update path'}
 return $target
}

function Test-UpdateRuntime([string]$Python) {
 $info=New-Object System.Diagnostics.ProcessStartInfo
 $info.FileName=$Python
 $info.Arguments='-I -B -c "import torch,torchaudio,stable_whisper,imageio_ffmpeg; from torch.utils.data import DataLoader; from demucs.pretrained import get_model; assert torch.ones(1).sum().item()==1; print(''Python/PyTorch OK'')"'
 $info.UseShellExecute=$false;$info.CreateNoWindow=$true
 $info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
 $process=New-Object System.Diagnostics.Process
 $process.StartInfo=$info
 try {
  $null=$process.Start()
  $stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
  if(!$process.WaitForExit(120000)){$process.Kill();throw 'Python runtime check timed out'}
  $output=$stdout.GetAwaiter().GetResult();$details=$stderr.GetAwaiter().GetResult()
  if($process.ExitCode -ne 0){throw ('Python runtime check failed: '+$details)}
  if($output){Write-Host $output.Trim()}
 } finally {$process.Dispose()}
}

function Install-UpdateTransaction([string]$Root,[string]$Stage,[string]$Backup,[string]$Work,[string[]]$Paths,[scriptblock]$Validate) {
 $moved=@();$installed=@()
 try {
  foreach($relative in $Paths) {
   if(($relative -split '[\\/]')[0] -ieq 'Data'){throw 'The update cannot replace user Data'}
   $dest=Resolve-UpdatePath $Root $relative
   if(Test-Path -LiteralPath $dest) {
    $save=Resolve-UpdatePath $Backup $relative
    New-Item -ItemType Directory -Force -Path (Split-Path $save) | Out-Null
    Move-Item -LiteralPath $dest -Destination $save
    $moved+=$relative
   }
   $src=Resolve-UpdatePath $Stage $relative
   if(Test-Path -LiteralPath $src) {
    New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
    Move-Item -LiteralPath $src -Destination $dest
    $installed+=$relative
   }
  }
  & $Validate
 } catch {
  $failure=$_
  [array]::Reverse($installed)
  foreach($relative in $installed) {
   $failed=Resolve-UpdatePath (Join-Path $Work 'failed') $relative
   New-Item -ItemType Directory -Force -Path (Split-Path $failed) | Out-Null
   Move-Item -LiteralPath (Resolve-UpdatePath $Root $relative) -Destination $failed
  }
  [array]::Reverse($moved)
  foreach($relative in $moved) {
   Move-Item -LiteralPath (Resolve-UpdatePath $Backup $relative) -Destination (Resolve-UpdatePath $Root $relative)
  }
  throw $failure
 }
}
