param([switch]$Enable)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $Root 'scripts\run-worker.ps1')`""
$Trigger = New-ScheduledTaskTrigger -Daily -At 06:30
Register-ScheduledTask -TaskName 'ARM-Indicator-Myfxbook-Sync' -Action $Action -Trigger $Trigger -Description 'Outbound ARM indicator sync worker' -Force | Out-Null
if ($Enable) { Enable-ScheduledTask -TaskName 'ARM-Indicator-Myfxbook-Sync' | Out-Null } else { Disable-ScheduledTask -TaskName 'ARM-Indicator-Myfxbook-Sync' | Out-Null }
