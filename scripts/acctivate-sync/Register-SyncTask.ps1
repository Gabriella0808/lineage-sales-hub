<#
.SYNOPSIS
  Registers a Windows Scheduled Task that runs Sync-Acctivate.ps1 twice a day
  at 5:00 AM and 5:00 PM America/New_York (Eastern Time, automatically
  follows DST).

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

.PARAMETER ConfigPath
  Config file to pass to Sync-Acctivate.ps1. Defaults to sync.config.json
  next to the script - pass this explicitly if the machine's config file
  has a different name (e.g. a shared kpi.config.json).

.PARAMETER Tables
  Which tables to sync on this schedule, passed straight through to
  Sync-Acctivate.ps1's -Tables argument. Defaults to just "dealers" so
  this task does not overlap with any separately-scheduled product/
  inventory/invoice/bookings sync tasks already running on the machine.
  Pass an empty string to fall back to Sync-Acctivate.ps1's own default
  (its config's enabledTables, or dealers+products+inventory).

.PARAMETER HoursEastern
  Hour(s) of the day (24h, Eastern Time) to run the sync. Defaults to
  5 and 17 (5:00 AM and 5:00 PM Eastern), automatically follows DST.

.EXAMPLE
  # From an elevated PowerShell 7 prompt:
  pwsh .\Register-SyncTask.ps1

.EXAMPLE
  pwsh .\Register-SyncTask.ps1 -User "DOMAIN\svc_lineage"

.EXAMPLE
  pwsh .\Register-SyncTask.ps1 -ScriptPath "C:\AcctivateKPI\Sync-Acctivate.ps1" -ConfigPath "C:\AcctivateKPI\kpi.config.json" -Tables dealers
#>

[CmdletBinding()]
param(
    [string]$ScriptPath   = (Join-Path $PSScriptRoot 'Sync-Acctivate.ps1'),
    [string]$TaskName     = 'Lineage Acctivate Sync',
    [string]$User         = "$env:USERDOMAIN\$env:USERNAME",
    [string]$ConfigPath   = '',
    [string]$Tables       = 'dealers',
    [int[]]$HoursEastern  = @(5, 17)
)

if (-not (Test-Path $ScriptPath)) {
    throw "Sync script not found at $ScriptPath"
}

# Task Scheduler doesn't reliably inherit the same PATH an interactive
# session has, so a bare "pwsh.exe" action can fail to launch at all
# (LastTaskResult=1, no log ever written, since the process never starts).
# Resolve the real path once here, while we know it works, and bake that
# into the registered action instead.
$pwshPath = (Get-Command pwsh.exe -ErrorAction Stop).Source
Write-Host "Using pwsh: $pwshPath" -ForegroundColor DarkGray

$workingDir = Split-Path -Parent $ScriptPath
$logPath    = Join-Path $workingDir 'last-run.log'

# "*> logpath" is PowerShell redirection syntax - it only works when an
# interactive shell parses the whole command line. Task Scheduler launches
# pwsh.exe directly (no shell), so pwsh's own -File argument parser was
# receiving "*>" and the log path as two literal extra SCRIPT arguments,
# which the script rejected immediately ("A positional parameter cannot be
# found that accepts argument '*>'") - exiting before it could do anything,
# which is also why no log file was ever created. Fix: put the whole
# invocation, redirection included, inside -Command so pwsh's own parser
# (which understands "*>") is the one reading it, not its CLI flag parser.
# Single-quoted inside so the outer double-quoted -Command value (itself one
# argv token on the Windows command line) doesn't get cut short by a
# literal " inside a path.
$inner = "& '$ScriptPath'"
if ($ConfigPath) { $inner += " -ConfigPath '$ConfigPath'" }
if ($Tables)     { $inner += " -Tables $Tables" }
$inner += " *> '$logPath'"
$argument = "-NoProfile -ExecutionPolicy Bypass -Command `"$inner`""

$action = New-ScheduledTaskAction `
    -Execute $pwshPath `
    -Argument $argument `
    -WorkingDirectory $workingDir

# One trigger per hour in $HoursEastern, every day. We resolve "now" in
# Eastern, build each target Eastern DateTime, convert to local, and let
# Task Scheduler handle DST going forward by re-resolving the trigger daily.
$eastern  = [System.TimeZoneInfo]::FindSystemTimeZoneById('Eastern Standard Time')
$nowEast  = [System.TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow, $eastern)

$triggerStartLocals = @()
$triggers = foreach ($hour in $HoursEastern) {
    # Get-Date returns Kind=Local here (confirmed on the VM), but ConvertTime()
    # requires Kind=Unspecified for a non-UTC, non-Local source zone - force
    # it, or this throws "did not have the Kind property set correctly".
    $todayEastAtHour = [DateTime]::SpecifyKind(
        (Get-Date -Year $nowEast.Year -Month $nowEast.Month -Day $nowEast.Day -Hour $hour -Minute 0 -Second 0),
        [DateTimeKind]::Unspecified)
    $localTime = [System.TimeZoneInfo]::ConvertTime($todayEastAtHour, $eastern, [System.TimeZoneInfo]::Local)
    $triggerStartLocals += $localTime
    New-ScheduledTaskTrigger -Daily -At $localTime
}

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

$hoursLabel = ($HoursEastern | ForEach-Object { "{0:00}:00" -f $_ }) -join ' and '

Register-ScheduledTask `
    -TaskName    $TaskName `
    -Action      $action `
    -Trigger     $triggers `
    -Settings    $settings `
    -User        $User `
    -RunLevel    Highest `
    -Description "Sync of Acctivate data into the Lineage backend, daily at $hoursLabel Eastern." | Out-Null

Write-Host ""
Write-Host "Registered scheduled task '$TaskName'." -ForegroundColor Green
Write-Host "  Runs daily at:   $hoursLabel Eastern (next run local time(s): $($triggerStartLocals -join ', '))"
Write-Host "  Script:          $ScriptPath"
Write-Host "  Config:          $(if ($ConfigPath) { $ConfigPath } else { '(script default, sync.config.json next to it)' })"
Write-Host "  Tables:          $(if ($Tables) { $Tables } else { '(script default)' })"
Write-Host "  Log file:        $logPath"
Write-Host "  Run as user:     $User"
Write-Host ""
Write-Host "To run it immediately for a smoke test:" -ForegroundColor Yellow
Write-Host "  Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "  Get-Content '$logPath' -Wait"
