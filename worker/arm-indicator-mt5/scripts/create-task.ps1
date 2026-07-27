param([switch]$Enable)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Python = Join-Path $Root 'venv\Scripts\python.exe'
$Action = New-ScheduledTaskAction -Execute $Python -Argument '-m arm_mt5_worker.main daemon' -WorkingDirectory (Join-Path $Root 'app')
$Trigger = New-ScheduledTaskTrigger -AtStartup
$Settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName 'ARM-Indicator-MT5-Worker' -Action $Action -Trigger $Trigger -Settings $Settings -Description 'ARM Indicator read-only MT5 worker' -Force | Out-Null
if ($Enable) { Enable-ScheduledTask -TaskName 'ARM-Indicator-MT5-Worker' | Out-Null } else { Disable-ScheduledTask -TaskName 'ARM-Indicator-MT5-Worker' | Out-Null }
