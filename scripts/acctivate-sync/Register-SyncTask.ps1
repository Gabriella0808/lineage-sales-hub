<#
.SYNOPSIS
  Registers a Windows Scheduled Task that runs Sync-Acctivate.ps1 once a day
  at 3:00 PM America/New_York (Eastern Time, automatically follows DST).

.DESCRIPTION
  Creates (or replaces) a scheduled task named "Lineage Acctivate Sync".
  The task runs whether the user is logged in or not, with highest privileges,
  and writes a rolling log to last-run.log next to the sync script.

  Run this script ONCE on the Acctivate machine, from an elevated PowerShell
  session (Run as Administrator).

.PARAMETER ScriptPath
  Full path to Sync-Acctivate.ps1. Defaults to the copy next to this file.

.PARAMETER TaskName
  Name of the scheduled task. Default: "Lineage Acctivate Sync".

.PARAMETER User
  Account to run the task under. Default: current user. Use "SYSTEM" if
  the sync uses SQL auth (not Windows integrated auth).

.EXAMPLE
  # From an elevated PowerShell 7 prompt:
  pwsh .\Register-SyncTask.ps1

.EXAMPLE
  pwsh .\Register-SyncTask.ps1 -User "DOMAIN\svc_lineage"
#>

[CmdletBinding()]
param(
    [string]$ScriptPath = (Join-Path $PSScriptRoot 'Sync-Acctivate.ps1'),
    [string]$TaskName   = 'Lineage Acctivate Sync',
    [string]$User       = "$env:USERDOMAIN\$env:USERNAME"
)

if (-not (Test-Path $ScriptPath)) {
    throw "Sync script not found at $ScriptPath"
}

$workingDir = Split-Path -Parent $ScriptPath
$logPath    = Join-Path $workingDir 'last-run.log'

# Wrap pwsh invocation so stdout/stderr are captured to last-run.log
$argument = "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`" *> `"$logPath`""

$action = New-ScheduledTaskAction `
    -Execute 'pwsh.exe' `
    -Argument $argument `
    -WorkingDirectory $workingDir

# 3:00 PM Eastern Time, every day. We resolve "now" in Eastern, build a 3pm
# Eastern DateTime, convert to local, and let Task Scheduler handle DST going
# forward by re-resolving the trigger daily.
$eastern  = [System.TimeZoneInfo]::FindSystemTimeZoneById('Eastern Standard Time')
$nowEast  = [System.TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow, $eastern)
$todayEast3pm = Get-Date -Year $nowEast.Year -Month $nowEast.Month -Day $nowEast.Day -Hour 15 -Minute 0 -Second 0
$triggerStartLocal = [System.TimeZoneInfo]::ConvertTime($todayEast3pm, $eastern, [System.TimeZoneInfo]::Local)

$trigger = New-ScheduledTaskTrigger -Daily -At $triggerStartLocal

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2)

# Replace any existing task with the same name
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

Register-ScheduledTask `
    -TaskName    $TaskName `
    -Action      $action `
    -Trigger     $trigger `
    -Settings    $settings `
    -User        $User `
    -RunLevel    Highest `
    -Description 'Daily full sync of Acctivate data into Lovable Cloud at 3:00 PM Eastern.' | Out-Null

Write-Host ""
Write-Host "Registered scheduled task '$TaskName'." -ForegroundColor Green
Write-Host "  Runs daily at:   3:00 PM Eastern (next run local time: $triggerStartLocal)"
Write-Host "  Script:          $ScriptPath"
Write-Host "  Log file:        $logPath"
Write-Host "  Run as user:     $User"
Write-Host ""
Write-Host "To run it immediately for a smoke test:" -ForegroundColor Yellow
Write-Host "  Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "  Get-Content '$logPath' -Wait"
