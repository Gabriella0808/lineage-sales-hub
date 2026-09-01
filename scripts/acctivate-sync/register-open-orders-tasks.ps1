<#
.SYNOPSIS
    Registers Windows Task Scheduler tasks for the Open SO and Open PO syncs.

.DESCRIPTION
    Creates two daily tasks that run at 5:00 AM and 5:00 PM Eastern time:
      - Daily Direct Acctivate Open SO Sync
      - Daily Direct Acctivate Open PO Sync

    Assumes scripts are deployed to C:\AcctivateKPI\ and the VM runs in Eastern time.
    If the VM is in a different timezone, adjust the trigger times below before running.

    Run this script ONCE as Administrator on the Windows VM to register both tasks.
    To update a task, delete it first in Task Scheduler then re-run this script.

.NOTES
    Run as: Administrator
    Requires: PowerShell 5.1+, Windows Task Scheduler service running
    VM timezone: Eastern (schedule times are local VM time)

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File "C:\AcctivateKPI\register-open-orders-tasks.ps1"
#>

[CmdletBinding()]
param(
    [string]$ScriptDir   = 'C:\AcctivateKPI',
    [string]$PoshExe     = 'powershell.exe',
    [string]$RunAs       = 'SYSTEM'
)

$ErrorActionPreference = 'Stop'

function Register-SyncTask {
    param(
        [string]$TaskName,
        [string]$ScriptFile,
        [string]$Hour1,
        [string]$Hour2,
        [string]$Description
    )

    $scriptPath = Join-Path $ScriptDir $ScriptFile
    if (-not (Test-Path $scriptPath)) {
        Write-Error "Script not found: $scriptPath. Deploy the scripts to $ScriptDir first."
        exit 1
    }

    $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""

    # Build the action
    $action = New-ScheduledTaskAction `
        -Execute $PoshExe `
        -Argument $arguments `
        -WorkingDirectory $ScriptDir

    # Two daily triggers: 5:00 AM and 5:00 PM
    $trigger1 = New-ScheduledTaskTrigger -Daily -At "$($Hour1):00"
    $trigger2 = New-ScheduledTaskTrigger -Daily -At "$($Hour2):00"

    # Settings
    $settings = New-ScheduledTaskSettingsSet `
        -StartWhenAvailable `
        -MultipleInstances IgnoreNew `
        -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
        -RunOnlyIfNetworkAvailable:$false `
        -DisallowStartIfOnBatteries:$false

    # Principal (run as SYSTEM)
    $principal = New-ScheduledTaskPrincipal `
        -UserId $RunAs `
        -LogonType ServiceAccount `
        -RunLevel Highest

    # Register (overwrite if exists)
    $existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($existingTask) {
        Write-Host "  Removing existing task '$TaskName'..." -ForegroundColor DarkGray
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    }

    Register-ScheduledTask `
        -TaskName    $TaskName `
        -Description $Description `
        -Action      $action `
        -Trigger     @($trigger1, $trigger2) `
        -Settings    $settings `
        -Principal   $principal `
        | Out-Null

    Write-Host ''
    Write-Host "  Task registered: '$TaskName'" -ForegroundColor Green
    Write-Host "    Script  : $scriptPath"
    Write-Host "    Triggers: $Hour1:00 AM and $Hour2:00 PM (local VM time)"
    Write-Host "    Run as  : $RunAs"
}

Write-Host ''
Write-Host '=== Registering Open Orders Sync Tasks ===' -ForegroundColor Yellow
Write-Host "Script directory: $ScriptDir"
Write-Host ''

Register-SyncTask `
    -TaskName   'Daily Direct Acctivate Open SO Sync' `
    -ScriptFile 'sync-open-sales-orders.ps1' `
    -Hour1      '05' `
    -Hour2      '17' `
    -Description 'Syncs open Sales Orders from Acctivate SQL Server into Supabase (acctivate_open_sales_orders + lines). Feeds Inventory Backlog calendar.'

Register-SyncTask `
    -TaskName   'Daily Direct Acctivate Open PO Sync' `
    -ScriptFile 'sync-open-purchase-orders.ps1' `
    -Hour1      '05' `
    -Hour2      '17' `
    -Description 'Syncs open Purchase Orders from Acctivate SQL Server into Supabase (acctivate_open_purchase_orders + lines). Feeds Inventory PO calendar.'

Write-Host ''
Write-Host '────────────────────────────────────────────────' -ForegroundColor Green
Write-Host ' TASKS REGISTERED SUCCESSFULLY' -ForegroundColor Green
Write-Host '────────────────────────────────────────────────' -ForegroundColor Green
Write-Host ''
Write-Host 'Verify in Task Scheduler (taskschd.msc) or run:' -ForegroundColor Cyan
Write-Host '  Get-ScheduledTask | Where-Object { $_.TaskName -like "*Acctivate Open*" } | Select-Object TaskName,State'
Write-Host ''
Write-Host 'To run immediately for first-time test:' -ForegroundColor Cyan
Write-Host "  Start-ScheduledTask -TaskName 'Daily Direct Acctivate Open SO Sync'"
Write-Host "  Start-ScheduledTask -TaskName 'Daily Direct Acctivate Open PO Sync'"
Write-Host ''
Write-Host 'To check last run status:' -ForegroundColor Cyan
Write-Host "  Get-ScheduledTaskInfo -TaskName 'Daily Direct Acctivate Open SO Sync'"
Write-Host "  Get-ScheduledTaskInfo -TaskName 'Daily Direct Acctivate Open PO Sync'"
Write-Host ''

# ─── Manual schtasks.exe equivalents (for reference) ──────────────────────────
# If PowerShell's New-ScheduledTask* cmdlets are unavailable, use these instead:
#
# schtasks /create /tn "Daily Direct Acctivate Open SO Sync" /ru SYSTEM /sc daily /st 05:00 /tr "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"C:\AcctivateKPI\sync-open-sales-orders.ps1\"" /f
# schtasks /create /tn "Daily Direct Acctivate Open SO Sync AM" /ru SYSTEM /sc daily /st 05:00 /tr "..." /f
# schtasks /create /tn "Daily Direct Acctivate Open SO Sync PM" /ru SYSTEM /sc daily /st 17:00 /tr "..." /f
# (schtasks doesn't support multiple triggers per task; create two tasks per script for AM+PM)
