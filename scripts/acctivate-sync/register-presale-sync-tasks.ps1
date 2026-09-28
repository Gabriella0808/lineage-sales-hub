<#
.SYNOPSIS
  Registers the two Windows Scheduled Tasks Pre-Sale's data depends on that
  are NOT already on any schedule: the New Product Intro flag, and the
  Pre-Sale purchase order sync.

.DESCRIPTION
  Pre-Sale (Holiday Promotions > Pre-Sale - New Product Intros) reads three
  things. Only two of them need a Task Scheduler entry from this repo:

    1. products.new_intro_unavail - synced by Sync-Acctivate.ps1, but only
       when its -Tables argument includes "products". This script adds a
       SEPARATE, dedicated task for that ("Lineage Pre-Sale Product Flag
       Sync") rather than editing whatever the existing "Lineage Acctivate
       Sync" task already runs - so this can be verified independently and
       can't change behavior nothing else asked for.
    2. presale_po_lines / presale_po_summary - synced by
       sync-presale-purchase-orders.ps1, which has never had a scheduled
       task at all until now ("Lineage Pre-Sale PO Sync").

  NOT covered here, and deliberately not touched: bookings. Those are fed by
  a separate pipeline (a staging table merged into portal_acctivate_orders /
  portal_acctivate_order_lines by pg_cron's run_daily_portal_bookings_sync(),
  confirmed live and current as of this being written) that has nothing to
  do with Windows Task Scheduler on this VM.

  Creates two daily tasks that run at 5:00 AM and 5:00 PM Eastern time, same
  cadence as every other Acctivate sync task already registered on this VM
  (Lineage Acctivate Sync, Daily Direct Acctivate Open SO/PO Sync).

  Assumes both scripts are deployed next to this one and share the same
  sync.config.json (same pattern Sync-Acctivate.ps1 and
  sync-presale-purchase-orders.ps1 already use). Run once, elevated
  (Run as Administrator), from a PowerShell 7 (pwsh) prompt.

.PARAMETER ScriptDir
  Folder both scripts are deployed to. Defaults to the folder this script is
  run from.

.PARAMETER ConfigPath
  Config file to pass to both scripts. Defaults to sync.config.json next to
  them - pass this explicitly if this machine's config file has a different
  name.

.PARAMETER User
  Account to run both tasks under. Default: current user (matches
  Register-SyncTask.ps1 - use this over SYSTEM when sync.config.json uses
  Windows-integrated SQL auth rather than a SQL login).

.PARAMETER HoursEastern
  Hour(s) of the day (24h, Eastern Time) to run both tasks. Defaults to 5
  and 17 (5:00 AM and 5:00 PM Eastern).

.EXAMPLE
  # From an elevated PowerShell 7 prompt, with both scripts already deployed
  # next to this one:
  pwsh .\register-presale-sync-tasks.ps1

.EXAMPLE
  pwsh .\register-presale-sync-tasks.ps1 -ScriptDir "C:\AcctivateKPI" -User "DOMAIN\svc_lineage"
#>

[CmdletBinding()]
param(
    [string]$ScriptDir     = $PSScriptRoot,
    [string]$ConfigPath    = '',
    [string]$User          = "$env:USERDOMAIN\$env:USERNAME",
    [int[]]$HoursEastern   = @(5, 17)
)

$ErrorActionPreference = 'Stop'

# Task Scheduler doesn't reliably inherit the same PATH an interactive
# session has, so a bare "pwsh.exe" action can fail to launch at all
# (LastTaskResult=1, no log ever written, since the process never starts).
# Resolve the real path once here, while we know it works, and bake that
# into the registered action instead.
$pwshPath = (Get-Command pwsh.exe -ErrorAction Stop).Source
Write-Host "Using pwsh: $pwshPath" -ForegroundColor DarkGray

function Register-PresaleTask {
    param(
        [string]$TaskName,
        [string]$ScriptFile,
        [string]$ExtraArgs,
        [string]$LogFileName,
        [string]$Description
    )

    $scriptPath = Join-Path $ScriptDir $ScriptFile
    if (-not (Test-Path $scriptPath)) {
        throw "Script not found: $scriptPath. Deploy $ScriptFile to $ScriptDir first."
    }
    $logPath = Join-Path $ScriptDir $LogFileName

    $argument = "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""
    if ($ConfigPath) { $argument += " -ConfigPath `"$ConfigPath`"" }
    if ($ExtraArgs)  { $argument += " $ExtraArgs" }
    $argument += " *> `"$logPath`""

    $action = New-ScheduledTaskAction `
        -Execute $pwshPath `
        -Argument $argument `
        -WorkingDirectory $ScriptDir

    # Same DST-safe Eastern-to-local trigger resolution as Register-SyncTask.ps1.
    $eastern = [System.TimeZoneInfo]::FindSystemTimeZoneById('Eastern Standard Time')
    $nowEast = [System.TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow, $eastern)
    $triggerStartLocals = @()
    $triggers = foreach ($hour in $HoursEastern) {
        # Get-Date returns Kind=Local here (confirmed on the VM), but
        # ConvertTime() requires Kind=Unspecified for a non-UTC, non-Local
        # source zone - force it, or this throws "did not have the Kind
        # property set correctly" on every run.
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

    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Write-Host "  Removing existing task '$TaskName'..." -ForegroundColor DarkGray
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    }

    Register-ScheduledTask `
        -TaskName    $TaskName `
        -Action      $action `
        -Trigger     $triggers `
        -Settings    $settings `
        -User        $User `
        -RunLevel    Highest `
        -Description $Description | Out-Null

    $hoursLabel = ($HoursEastern | ForEach-Object { "{0:00}:00" -f $_ }) -join ' and '
    Write-Host ''
    Write-Host "  Task registered: '$TaskName'" -ForegroundColor Green
    Write-Host "    Script  : $scriptPath$(if ($ExtraArgs) { " $ExtraArgs" })"
    Write-Host "    Runs at : $hoursLabel Eastern (next local: $($triggerStartLocals -join ', '))"
    Write-Host "    Run as  : $User"
    Write-Host "    Log     : $logPath"
}

Write-Host ''
Write-Host '=== Registering Pre-Sale Sync Tasks ===' -ForegroundColor Yellow
Write-Host "Script directory: $ScriptDir"
Write-Host ''

Register-PresaleTask `
    -TaskName    'Lineage Pre-Sale Product Flag Sync' `
    -ScriptFile  'Sync-Acctivate.ps1' `
    -ExtraArgs   '-Tables products' `
    -LogFileName 'last-run-presale-products.log' `
    -Description 'Syncs products.new_intro_unavail (Acctivate tbProduct._NewIntroUnavail) and product_type from Acctivate into Supabase. Feeds the Pre-Sale page''s SKU list. Scoped to -Tables products only, separate from any other scheduled Sync-Acctivate.ps1 task.'

Register-PresaleTask `
    -TaskName    'Lineage Pre-Sale PO Sync' `
    -ScriptFile  'sync-presale-purchase-orders.ps1' `
    -ExtraArgs   '' `
    -LogFileName 'last-run-presale-po.log' `
    -Description 'Syncs PODetail/POManagementSummary for currently-flagged New Product Intro SKUs into presale_po_lines / presale_po_summary. Feeds the Pre-Sale page''s On PO / Purchase Orders figures.'

Write-Host ''
Write-Host '────────────────────────────────────────────────' -ForegroundColor Green
Write-Host ' PRE-SALE SYNC TASKS REGISTERED' -ForegroundColor Green
Write-Host '────────────────────────────────────────────────' -ForegroundColor Green
Write-Host ''
Write-Host 'Verify in Task Scheduler (taskschd.msc) or run:' -ForegroundColor Cyan
Write-Host '  Get-ScheduledTask | Where-Object { $_.TaskName -like "Lineage Pre-Sale*" } | Select-Object TaskName,State'
Write-Host ''
Write-Host 'To run both immediately for a smoke test:' -ForegroundColor Yellow
Write-Host "  Start-ScheduledTask -TaskName 'Lineage Pre-Sale Product Flag Sync'"
Write-Host "  Start-ScheduledTask -TaskName 'Lineage Pre-Sale PO Sync'"
Write-Host '  # then check the two log files named above, or:'
Write-Host "  Get-ScheduledTaskInfo -TaskName 'Lineage Pre-Sale Product Flag Sync'"
Write-Host "  Get-ScheduledTaskInfo -TaskName 'Lineage Pre-Sale PO Sync'"
Write-Host ''
