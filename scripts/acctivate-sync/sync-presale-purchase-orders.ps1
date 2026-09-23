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

    Posts directly to PostgREST (same pattern as sync-aug-current-bookings.ps1)
    using the service role key, not through the sync-acctivate edge function.

    Config: place kpi.config.json next to this script, or pass -ConfigPath.

.EXAMPLE
    pwsh .\sync-presale-purchase-orders.ps1
#>

[CmdletBinding()]
param(
    [string]$ConfigPath = (Join-Path $PSScriptRoot 'kpi.config.json')
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

if (-not (Test-Path $ConfigPath)) { throw "Config not found: $ConfigPath" }
$cfg = Get-Content $ConfigPath -Raw | ConvertFrom-Json

$SupabaseUrl    = $cfg.supabaseUrl.TrimEnd('/')
$ServiceKey     = $cfg.serviceRoleKey
$BatchSize      = if ($cfg.batchSize)                { [int]$cfg.batchSize }                else { 200 }
$RequestTimeout = if ($cfg.requestTimeoutSec)        { [int]$cfg.requestTimeoutSec }        else { 60 }
$SqlTimeout     = if ($cfg.sql.commandTimeoutSeconds){ [int]$cfg.sql.commandTimeoutSeconds } else { 600 }

if (-not $SupabaseUrl -or -not $ServiceKey) {
    throw "supabaseUrl and serviceRoleKey are required in $ConfigPath"
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
    param([string]$SqlQuery, [int]$TimeoutSec = $SqlTimeout)
    $conn = New-Object System.Data.SqlClient.SqlConnection($connStr)
    $conn.Open()
    try {
        $cmd = $conn.CreateCommand()
        $cmd.CommandText = $SqlQuery
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

function Convert-RowsToJsonArray {
    param([array]$Rows)
    $items = @()
    foreach ($row in @($Rows)) { $items += ($row | ConvertTo-Json -Depth 20 -Compress) }
    return '[' + ($items -join ',') + ']'
}

function Invoke-Post {
    param([string]$Url, [array]$Rows)
    $json      = Convert-RowsToJsonArray -Rows @($Rows)
    $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $headers = @{
        'apikey'        = $ServiceKey
        'Authorization' = 'Bearer ' + $ServiceKey
        'Prefer'        = 'resolution=merge-duplicates,return=minimal'
    }
    try {
        Invoke-WebRequest -Uri $Url -Method Post -Headers $headers `
            -ContentType 'application/json; charset=utf-8' -Body $bodyBytes `
            -UseBasicParsing -TimeoutSec $RequestTimeout -ErrorAction Stop | Out-Null
        return @{ ok = $true; statusCode = 200; body = '' }
    } catch {
        $code = 0
        $body = $_.Exception.Message
        if ($null -ne $_.Exception.Response) {
            $code   = [int]$_.Exception.Response.StatusCode
            $stream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            $body   = $reader.ReadToEnd()
            $reader.Close()
        }
        return @{ ok = $false; statusCode = $code; body = $body }
    }
}

function Send-InBatches {
    param([string]$Url, [array]$Rows, [string]$Label)
    $cleaned = @($Rows | ForEach-Object { Clean-Row $_ })
    for ($i = 0; $i -lt $cleaned.Count; $i += $BatchSize) {
        $chunk = $cleaned[$i..[Math]::Min($i + $BatchSize - 1, $cleaned.Count - 1)]
        $res = Invoke-Post -Url $Url -Rows $chunk
        if (-not $res.ok) {
            throw "$Label upload failed at row $i (HTTP $($res.statusCode)): $($res.body)"
        }
        Write-Host "  [$Label] $([Math]::Min($i + $BatchSize, $cleaned.Count)) / $($cleaned.Count)"
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

Write-Host "Pre-Sale PO sync starting -> $SupabaseUrl" -ForegroundColor Yellow

Write-Host "==> presale_po_lines"
$lines = Invoke-Sql -Query $PoLinesQuery
Write-Host "  pulled $($lines.Count) rows from SQL"
if ($lines.Count -gt 0) {
    $lines = $lines | ForEach-Object { $_['synced_at'] = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss'); $_ }
    Send-InBatches -Url ($SupabaseUrl + '/rest/v1/presale_po_lines?on_conflict=guid_po_detail') -Rows $lines -Label 'presale_po_lines'
}

Write-Host "==> presale_po_summary"
$summary = Invoke-Sql -Query $PoSummaryQuery
Write-Host "  pulled $($summary.Count) rows from SQL"
if ($summary.Count -gt 0) {
    $summary = $summary | ForEach-Object { $_['synced_at'] = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss'); $_ }
    Send-InBatches -Url ($SupabaseUrl + '/rest/v1/presale_po_summary?on_conflict=guid_po') -Rows $summary -Label 'presale_po_summary'
}

Write-Host "Done." -ForegroundColor Green
