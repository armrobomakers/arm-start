$ErrorActionPreference = 'Stop'
Unregister-ScheduledTask -TaskName 'ARM-Indicator-MT5-Worker' -Confirm:$false -ErrorAction SilentlyContinue
