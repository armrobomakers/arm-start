$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Python = Join-Path $Root 'venv\Scripts\python.exe'
$EnvPath = Join-Path $Root 'config\worker.env'
Push-Location (Join-Path $Root 'app')
try {
    & $Python -m arm_mt5_worker.main daily-sync --env $EnvPath
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
