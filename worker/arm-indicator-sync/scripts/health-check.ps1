$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Get-ScheduledTask -TaskName 'ARM-Indicator-Myfxbook-Sync' -ErrorAction SilentlyContinue | Select-Object TaskName, State
Get-Content -LiteralPath (Join-Path $Root 'state\last-success.json') -ErrorAction SilentlyContinue
