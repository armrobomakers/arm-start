param([switch]$Confirm)
$ErrorActionPreference = 'Stop'
$TaskName = 'ARM-Indicator-MT5-Daily-Sync'
if (-not $Confirm) { throw 'Pass -Confirm to remove the ARM daily sync task.' }
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}
