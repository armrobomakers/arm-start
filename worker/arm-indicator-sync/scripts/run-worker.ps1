$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Node = Join-Path $Root 'runtime\node\node.exe'
if (-not (Test-Path -LiteralPath $Node)) { $Node = (Get-Command node.exe -ErrorAction Stop).Source }
& $Node (Join-Path $Root 'src\index.js') @args
exit $LASTEXITCODE
