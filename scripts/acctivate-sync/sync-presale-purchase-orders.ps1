<#
.SYNOPSIS
    Syncs Purchase Order detail for New Product Intro SKUs only, into
    Supabase tables presale_po_lines and presale_po_summary.

.DESCRIPTION
    Mirrors Andrew's validated Power Query source tables/logic exactly
    (PODetail + POManagementSummary, joined through Product filtered to
    _NewIntroUnavail = 1), rather than reusing any existing PO sync — none
    of the PO data already in Supabase is produced by a script in this repo,
    so it can't be verified against his reference queries.

    Phase 1 - PO lines (one row per PODetail line for a Pre-Sale SKU):
              product_id, display_amount, quantity_outstanding.
              Upserted on guid_po_detail.
    Phase 2 - PO headers, for every PO that has at least one Pre-Sale line:
              po_status, requested_delivery_date (used to compute each
              collection's first PO date in the portal).
              Upserted on guid_po.

    Posts through the sync-acctivate edge function using the shared sync
    token, the same pattern (and the same sync.config.json) as
    Sync-Acctivate.ps1 already uses on this machine.

    Config: uses sync.config.json next to this script by default, or pass
    -ConfigPath to point at a different file.

.EXAMPLE
    pwsh .\sync-presale-purchase-orders.ps1
#>

[CmdletBinding()]
param(
    [string]$ConfigPath = (Join-Path $PSScriptRoot 'sync.config.json')
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Config - same sync.config.json / syncToken pattern as Sync-Acctivate.ps1
# (posts through the sync-acctivate edge function, not a raw database key).
# ---------------------------------------------------------------------------

if (-not (Test-Path $ConfigPath)) { throw "Config not found: $ConfigPath" }
$cfg = Get-Content $ConfigPath -Raw | ConvertFrom-Json

$SupabaseUrl    = $cfg.supabaseUrl.TrimEnd('/')
$SyncToken      = $cfg.syncToken
$FunctionUrl    = "$SupabaseUrl/functions/v1/sync-acctivate"
$BatchSize      = if ($cfg.batchSize)                { [int]$cfg.batchSize }                else { 200 }
$RequestTimeout = if ($cfg.requestTimeoutSeconds)    { [int]$cfg.requestTimeoutSeconds }    else { 60 }
$MaxRetries     = if ($cfg.maxRetries)               { [int]$cfg.maxRetries }               else { 3 }
$RetryDelaySeconds = if ($cfg.retryDelaySeconds)     { [int]$cfg.retryDelaySeconds }        else { 5 }
$SqlTimeout     = if ($cfg.sql.commandTimeoutSeconds){ [int]$cfg.sql.commandTimeoutSeconds } else { 600 }

if (-not $SupabaseUrl -or -not $SyncToken) {
    throw "supabaseUrl and syncToken are required in $ConfigPath"
}

$connStr = 'Server=' + $cfg.sql.server + ';Database=' + $cfg.sql.database + ';Connection Timeout=30;'
if ($cfg.sql.integratedSecurity) {
    $connStr += 'Integrated Security=SSPI;'
} else {
    $connStr += 'User Id=' + $cfg.sql.user + ';Password=' + $cfg.sql.password + ';'
}
$connStr += 'Encrypt=False;TrustServerCertificate=True;'

# ---------------------------------------------------------------------------
# SQL helpers
# ---------------------------------------------------------------------------

function Invoke-Sql {
    param([string]$Query, [int]$TimeoutSec = $SqlTimeout)
    $conn = New-Object System.Data.SqlClient.SqlConnection($connStr)
    $conn.Open()
    try {
        $cmd = $conn.CreateCommand()
        $cmd.CommandText = $Query
        $cmd.CommandTimeout = $TimeoutSec
        $reader = $cmd.ExecuteReader()
        $rows = New-Object System.Collections.Generic.List[hashtable]
        while ($reader.Read()) {
            $row = @{}
            for ($i = 0; $i -lt $reader.FieldCount; $i++) {
                $name = $reader.GetName($i)
                $val  = $reader.GetValue($i)
                $row[$name] = if ($val -is [System.DBNull]) { $null } else { $val }
            }
            $rows.Add($row) | Out-Null
        }
        return ,$rows.ToArray()
    } finally { $conn.Close() }
}

function Get-SqlColumns {
    param([string]$Schema = 'dbo', [string]$Table)
    $rows = Invoke-Sql -Query "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = '$Schema' AND TABLE_NAME = '$Table' ORDER BY ORDINAL_POSITION"
    return @($rows | ForEach-Object { [string]$_['COLUMN_NAME'] })
}

function Get-FirstColumn {
    param([string[]]$Columns, [string[]]$Candidates)
    foreach ($candidate in $Candidates) {
        $match = $Columns | Where-Object { $_ -ieq $candidate } | Select-Object -First 1
        if ($match) { return [string]$match }
    }
    return $null
}

function Quote-SqlIdentifier {
    param([string]$Name)
    return '[' + $Name.Replace(']', ']]') + ']'
}

# PO number's real column name varies by Acctivate install - discover it
# rather than guessing, same pattern used elsewhere in this repo.
$pmsColumns  = Get-SqlColumns -Table 'POManagementSummary'
$poNumberCol = Get-FirstColumn -Columns $pmsColumns -Candidates @('PONumber', 'PurchaseOrderNumber', 'PONum', 'OrderNumber')
if (-not $poNumberCol) {
    throw "Could not find a PO number column on dbo.POManagementSummary. Columns found: $($pmsColumns -join ', ')"
}
Write-Host "PO number column: $poNumberCol" -ForegroundColor DarkGray

# ---------------------------------------------------------------------------
# Value cleaning / JSON (same pattern as sync-aug-current-bookings.ps1)
# ---------------------------------------------------------------------------

function Clean-Value {
    param($Val)
    if ($null -eq $Val -or $Val -is [System.DBNull]) { return $null }
    if ($Val -is [bool])    { return [bool]$Val }
    if ($Val -is [string])  { return ($Val -replace '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '') }
    if ($Val -is [datetime] -or $Val -is [System.DateTimeOffset]) { return $Val.ToString('yyyy-MM-dd') }
    if ($Val -is [System.Int32] -or $Val -is [System.Int64] -or $Val -is [int] -or $Val -is [long]) { return [long]$Val }
    if ($Val -is [System.Decimal] -or $Val -is [double] -or $Val -is [float]) {
        $d = [double]$Val
        if ([double]::IsNaN($d) -or [double]::IsInfinity($d)) { return $null }
        return $d
    }
    return $Val.ToString()
}

function Clean-Row {
    param([hashtable]$Row)
    $out = @{}
    foreach ($key in $Row.Keys) { $out[$key] = Clean-Value $Row[$key] }
    return $out
}

function Send-Batch {
    param([string]$Table, [array]$Rows, [string]$OnConflict)
    $cleaned = @($Rows | ForEach-Object { Clean-Row $_ })
    if ($cleaned.Count -eq 0) { Write-Host "  [$Table] no rows" -ForegroundColor DarkGray; return }
    $total = $cleaned.Count
    $sent  = 0
    for ($i = 0; $i -lt $total; $i += $BatchSize) {
        $chunk = $cleaned[$i..([Math]::Min($i + $BatchSize - 1, $total - 1))]
        $payload = @{ table = $Table; rows = $chunk; on_conflict = $OnConflict } | ConvertTo-Json -Depth 8 -Compress

        $attempt = 0
        while ($true) {
            $attempt++
            try {
                $resp = Invoke-RestMethod -Method Post -Uri $FunctionUrl `
                    -Headers @{ Authorization = "Bearer $SyncToken"; 'Content-Type' = 'application/json' } `
                    -Body $payload -TimeoutSec $RequestTimeout
                break
            } catch {
                if ($attempt -ge $MaxRetries) {
                    throw "Sync failed for $Table batch starting $i after $attempt attempts: $($_.Exception.Message)"
                }
                Write-Warning "[$Table] batch starting $i failed on attempt $attempt/$MaxRetries; retrying in $RetryDelaySeconds seconds: $($_.Exception.Message)"
                Start-Sleep -Seconds $RetryDelaySeconds
            }
        }
        if (-not $resp.success) { throw "Sync failed for $Table batch starting $i : $($resp.error)" }
        $sent += $chunk.Count
        Write-Host "  [$Table] $sent / $total"
    }
}

# ---------------------------------------------------------------------------
# Queries - mirror Andrew's validated NewIntroSummary_ByClass Power Query
# ---------------------------------------------------------------------------

$PoLinesQuery = @"
SELECT
    LOWER(REPLACE(REPLACE(CAST(pd.GUIDPODetail AS NVARCHAR(64)), '{', ''), '}', '')) AS guid_po_detail,
    LOWER(REPLACE(REPLACE(CAST(pd.GUIDPO       AS NVARCHAR(64)), '{', ''), '}', '')) AS guid_po,
    CAST(pms.$poNumberCol AS NVARCHAR(64))                                            AS po_number,
    CAST(pd.ProductID AS NVARCHAR(255))                                               AS product_id,
    CAST(CAST(COALESCE(pd.DisplayAmount, 0)        AS decimal(18,2)) AS NVARCHAR(30)) AS display_amount,
    CAST(CAST(COALESCE(pd.QuantityOutstanding, 0)   AS decimal(18,4)) AS NVARCHAR(30)) AS quantity_outstanding
FROM dbo.PODetail pd
JOIN dbo.POManagementSummary pms ON pms.GUIDPO = pd.GUIDPO
JOIN (SELECT DISTINCT ProductID FROM dbo.Product WHERE _NewIntroUnavail = 1) p ON p.ProductID = pd.ProductID
WHERE pms.POStatus <> 'Cancelled'
"@

$PoSummaryQuery = @"
SELECT
    LOWER(REPLACE(REPLACE(CAST(pms.GUIDPO AS NVARCHAR(64)), '{', ''), '}', '')) AS guid_po,
    CAST(pms.$poNumberCol AS NVARCHAR(64))                                      AS po_number,
    CAST(ISNULL(pms.POStatus, '') AS NVARCHAR(100))                             AS po_status,
    CONVERT(nvarchar(10), pms.RequestedDeliveryDate, 23)                        AS requested_delivery_date
FROM dbo.POManagementSummary pms
WHERE pms.GUIDPO IN (
    SELECT DISTINCT pd.GUIDPO
    FROM dbo.PODetail pd
    JOIN (SELECT DISTINCT ProductID FROM dbo.Product WHERE _NewIntroUnavail = 1) p ON p.ProductID = pd.ProductID
)
"@

# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

Write-Host "Pre-Sale PO sync starting -> $FunctionUrl" -ForegroundColor Yellow

Write-Host "==> presale_po_lines"
$lines = Invoke-Sql -Query $PoLinesQuery
Write-Host "  pulled $($lines.Count) rows from SQL"
if ($lines.Count -gt 0) {
    $lines = $lines | ForEach-Object { $_['synced_at'] = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss'); $_ }
    Send-Batch -Table 'presale_po_lines' -Rows $lines -OnConflict 'guid_po_detail'
}

Write-Host "==> presale_po_summary"
$summary = Invoke-Sql -Query $PoSummaryQuery
Write-Host "  pulled $($summary.Count) rows from SQL"
if ($summary.Count -gt 0) {
    $summary = $summary | ForEach-Object { $_['synced_at'] = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss'); $_ }
    Send-Batch -Table 'presale_po_summary' -Rows $summary -OnConflict 'guid_po'
}

Write-Host "Done." -ForegroundColor Green
