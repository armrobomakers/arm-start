param([switch]$ConfigureAcl)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
New-Item -ItemType Directory -Force -Path (Join-Path $Root 'app'), (Join-Path $Root 'config'), (Join-Path $Root 'data'), (Join-Path $Root 'logs'), (Join-Path $Root 'outbox'), (Join-Path $Root 'run') | Out-Null
if ($ConfigureAcl -and (Test-Path -LiteralPath (Join-Path $Root 'config\worker.env'))) {
    $envPath = Join-Path $Root 'config\worker.env'
    icacls $envPath /inheritance:r /grant:r "${env:USERNAME}:(R,W)" 'SYSTEM:(F)' 'Administrators:(F)' | Out-Null
}
Write-Output 'Files/directories prepared. Task Scheduler is intentionally not created.'
