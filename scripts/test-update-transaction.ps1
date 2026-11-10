$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Update-Transaction.ps1')
$testParent=Join-Path (Split-Path $PSScriptRoot) 'work'
New-Item -ItemType Directory -Path $testParent -Force | Out-Null
$fixture=Join-Path $testParent ('soundsync-transaction-test-'+[guid]::NewGuid())
$root=Join-Path $fixture 'player';$stage=Join-Path $fixture 'stage';$backup=Join-Path $fixture 'backup';$work=Join-Path $fixture 'work'
foreach($dir in @($root,$stage,$backup,$work)){New-Item -ItemType Directory -Path $dir | Out-Null}
New-Item -ItemType Directory -Path (Join-Path $root 'Data') | Out-Null
[IO.File]::WriteAllText((Join-Path $root 'Data/library.json'),'keep-user-data')
[IO.File]::WriteAllText((Join-Path $root 'app.txt'),'old-app')
[IO.File]::WriteAllText((Join-Path $stage 'app.txt'),'new-app')
[IO.File]::WriteAllText((Join-Path $stage 'repair.py'),'repair')
$rejected=$false
try{Install-UpdateTransaction $root $stage $backup $work @('app.txt','repair.py') {throw 'Simulated runtime import failure'}}catch{Write-Host $_; $rejected=$true}
if(!$rejected -or [IO.File]::ReadAllText((Join-Path $root 'app.txt')) -ne 'old-app' -or (Test-Path (Join-Path $root 'repair.py'))){throw 'Runtime failure did not roll back'}
if([IO.File]::ReadAllText((Join-Path $root 'Data/library.json')) -ne 'keep-user-data'){throw 'User data changed'}
# Retry from the staged files retained for diagnostics.
Move-Item -LiteralPath (Join-Path $work 'failed/app.txt') -Destination (Join-Path $stage 'app.txt')
Move-Item -LiteralPath (Join-Path $work 'failed/repair.py') -Destination (Join-Path $stage 'repair.py')
Install-UpdateTransaction $root $stage $backup $work @('app.txt','repair.py') {
 if([IO.File]::ReadAllText((Join-Path $root 'repair.py')) -ne 'repair'){throw 'Validation ran before repair was installed'}
}
if([IO.File]::ReadAllText((Join-Path $root 'app.txt')) -ne 'new-app' -or [IO.File]::ReadAllText((Join-Path $backup 'app.txt')) -ne 'old-app'){throw 'Commit or backup failed'}
$rejected=$false;try{Install-UpdateTransaction $root $stage $backup $work @('Data') {}}catch{$rejected=$true}
if(!$rejected){throw 'User Data replacement was allowed'}
$rejected=$false;try{Resolve-UpdatePath $root '../escape.txt'}catch{$rejected=$true}
if(!$rejected){throw 'Path escape was allowed'}
Write-Host 'Transaction commit, runtime rollback, repair ordering, backup and Data protection tests passed'
if((Split-Path $fixture -Leaf) -like 'soundsync-transaction-test-*'){Remove-Item -LiteralPath $fixture -Recurse -Force}
