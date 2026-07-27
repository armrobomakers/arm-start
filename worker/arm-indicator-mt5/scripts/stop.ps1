$ErrorActionPreference = 'Stop'
Get-Process python -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*arm-indicator-mt5-worker*' } | Stop-Process
