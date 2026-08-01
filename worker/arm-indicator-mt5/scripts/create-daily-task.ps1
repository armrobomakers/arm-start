param([switch]$Enable)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Python = Join-Path $Root 'venv\Scripts\python.exe'
$EnvPath = Join-Path $Root 'config\worker.env'
$TaskName = 'ARM-Indicator-MT5-Daily-Sync'

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    throw "Task already exists: $TaskName"
}

$windowsZone = (tzutil /g).Trim()
$moscowZone = [TimeZoneInfo]::FindSystemTimeZoneById('Russian Standard Time')
$moscowDateTime = [DateTime]::SpecifyKind(([DateTime]::Today.AddHours(3).AddMinutes(15)), [DateTimeKind]::Unspecified)
$utcDateTime = [TimeZoneInfo]::ConvertTimeToUtc($moscowDateTime, $moscowZone)
$localTime = [TimeZoneInfo]::ConvertTimeFromUtc($utcDateTime, [TimeZoneInfo]::Local).TimeOfDay

$action = New-ScheduledTaskAction -Execute $Python -Argument "-m arm_mt5_worker.main daily-sync --env `"$EnvPath`"" -WorkingDirectory (Join-Path $Root 'app')
$trigger = New-ScheduledTaskTrigger -Daily -At ([DateTime]::Today.Add($localTime))
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -RestartCount 0
$principal = New-ScheduledTaskPrincipal -UserId 'trader' -LogonType InteractiveToken -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "ARM Indicator MT5 daily read-only sync ($windowsZone; 03:15 Europe/Moscow)" | Out-Null
Disable-ScheduledTask -TaskName $TaskName | Out-Null
if ($Enable) { Enable-ScheduledTask -TaskName $TaskName | Out-Null }
Get-ScheduledTask -TaskName $TaskName | Select-Object TaskName, State
