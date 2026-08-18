<#
.SYNOPSIS
    Syncs Acctivate bookings (orders + order lines) into Supabase for Aug 1, 2026+.

.DESCRIPTION
    Columns uploaded are pinned to the EXACT schema of each table (confirmed 2026-08-18).
    Unknown fields are stripped before upload. Type conversions:
      - BIT columns  → JSON true/false
      - Timestamp columns → ISO-8601 strings ("yyyy-MM-ddTHH:mm:ss")
      - Date columns → "yyyy-MM-dd" strings
      - Numeric-as-text columns (subtotal, amount, etc.) → string in SQL via NVARCHAR cast

    Phase 1 – Orders upserted on guid_order. Stops on first error and prints full body.
    Phase 2 – Lines upserted on natural_key (only after Phase 1 succeeds).
              natural_key = order_number-line_number-sub_line_number-component_level
                            -product_id-source_guid_order_detail-duplicate_row_ordinal
              Aborts if natural_key count != rows pulled.

    HTTP: System.Net.HttpWebRequest (not Invoke-RestMethod) guarantees response body
    capture on 4xx in PowerShell 5.1.

    Config: place kpi.config.json next to this script, or pass -ConfigPath.
    {
        "supabaseUrl":    "https://tcqpseblcwqjopbocfmr.supabase.co",
        "serviceRoleKey": "...",
        "sql": { "server": ".\\ACCTIVATE", "database": "Acctivate",
                 "integratedSecurity": true, "commandTimeoutSeconds": 600 },
        "batchSize": 50, "maxRetries": 3, "retryDelaySeconds": 10, "requestTimeoutSec": 60
    }
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
$BatchSize      = if ($cfg.batchSize)                { [int]$cfg.batchSize }                else { 50 }
$MaxRetries     = if ($cfg.maxRetries)               { [int]$cfg.maxRetries }               else { 3 }
$RetryDelay     = if ($cfg.retryDelaySeconds)        { [int]$cfg.retryDelaySeconds }        else { 10 }
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
# SQL: Orders
#
# Column names match public.portal_acctivate_orders exactly.
# Timestamps → CONVERT(126) = "yyyy-MM-ddThh:mi:ss.mmm"  (PostgREST accepts)
# Numeric-as-text → CAST(decimal) AS NVARCHAR so they arrive as strings.
# Fields not in dbo.Orders (ship_via, fob, po, sold_to_name, discount_amount,
# sales_tax, total_amount, sched_subtotal, sched_total_amount, updated_date,
# completed) are omitted; Supabase will store NULL for new rows.
# ---------------------------------------------------------------------------

$OrdersQuery = @"
SELECT
    LOWER(REPLACE(REPLACE(CAST(o.GUIDOrder AS NVARCHAR(64)), '{', ''), '}', ''))       AS guid_order,
    CAST(o.OrderNumber AS NVARCHAR(64))                                                 AS order_number,
    CONVERT(nvarchar(30), o.OrderDate, 126)                                             AS order_date,
    CONVERT(nvarchar(30), ISNULL(o.EntryDate, o.OrderDate), 126)                        AS entry_date,
    CAST(ISNULL(o.OrderStatus, '')    AS NVARCHAR(100))                                 AS order_status,
    LOWER(CAST(o.GUIDCustomer         AS NVARCHAR(64)))                                 AS guid_customer,
    LOWER(REPLACE(REPLACE(CAST(o.GUIDSalesperson AS NVARCHAR(64)), '{', ''), '}', '')) AS guid_salesperson,
    CAST(ISNULL(o._Rep1, '')          AS NVARCHAR(100))                                 AS rep1,
    CAST(ISNULL(o._Rep2, '')          AS NVARCHAR(100))                                 AS rep2,
    CAST(CAST(COALESCE(o.SubTotal, 0) AS decimal(18,2)) AS NVARCHAR(30))               AS subtotal
FROM dbo.Orders o
WHERE o.OrderDate >= '2026-08-01'
  AND o.OrderDate <  DATEADD(day, 1, CAST(GETDATE() AS date))
ORDER BY o.OrderDate, o.OrderNumber
"@

# ---------------------------------------------------------------------------
# SQL: Order Lines (CTE with ROW_NUMBER for deduplication)
#
# Column names match public.portal_acctivate_order_lines exactly.
# guid_order_detail (NOT NULL in schema) = cleaned GUIDOrderDetail.
# source_guid_order_detail = same value (added by migration 20260819000100).
# line_number → INT (schema: integer).
# sub_line_number, component_level → NVARCHAR (schema: text).
# All amount/qty/price fields → NVARCHAR (schema: text).
# line_cancelled, freight → BIT (schema: boolean).
# order_date → CONVERT(23) = "yyyy-MM-dd" (schema: date).
# order_number is pulled for natural_key computation and stripped by whitelist.
# misc_charge_type and product_class are NOT in the schema and will be stripped.
# ---------------------------------------------------------------------------

$LinesQuery = @"
WITH src AS (
    SELECT
        LOWER(REPLACE(REPLACE(CAST(od.GUIDOrderDetail AS NVARCHAR(64)), '{', ''), '}', '')) AS guid_order_detail,
        LOWER(REPLACE(REPLACE(CAST(od.GUIDOrderDetail AS NVARCHAR(64)), '{', ''), '}', '')) AS source_guid_order_detail,
        LOWER(REPLACE(REPLACE(CAST(od.GUIDOrder       AS NVARCHAR(64)), '{', ''), '}', '')) AS guid_order,
        CONVERT(nvarchar(10), o.OrderDate, 23)                                               AS order_date,
        CAST(od.OrderNumber AS NVARCHAR(64))                                                 AS order_number,
        CAST(od.LineNumber AS int)                                                           AS line_number,
        CAST(ISNULL(od.SubLineNumber,  0) AS NVARCHAR(20))                                  AS sub_line_number,
        CAST(ISNULL(od.ComponentLevel, 0) AS NVARCHAR(20))                                  AS component_level,
        CAST(ISNULL(od.ProductID,      '') AS NVARCHAR(255))                                AS product_id,
        CAST(ISNULL(od.Description,    '') AS NVARCHAR(500))                                AS description,
        CAST(CAST(COALESCE(od.QtyOrdered,      0) AS decimal(18,4)) AS NVARCHAR(30))       AS qty_ordered,
        CAST(CAST(COALESCE(od._OriginalPrice,  0) AS decimal(18,4)) AS NVARCHAR(30))       AS original_price,
        CAST(CAST(COALESCE(od.LineDiscountPct, 0) AS decimal(18,4)) AS NVARCHAR(30))       AS line_discount_pct,
        CAST(CAST(COALESCE(od.Amount,          0) AS decimal(18,2)) AS NVARCHAR(30))       AS amount,
        CAST(CAST(COALESCE(od._TariffAmt,      0) AS decimal(18,2)) AS NVARCHAR(30))       AS tariff_amount,
        CAST(CAST(COALESCE(od._FreightAmt,     0) AS decimal(18,2)) AS NVARCHAR(30))       AS freight_amount,
        CAST(ISNULL(prod.SalesCategory, '') AS NVARCHAR(100))                               AS sales_category,
        CAST(CASE WHEN od.LineCancelled = 1 THEN 1 ELSE 0 END AS bit)                      AS line_cancelled,
        CAST(CASE WHEN od.Freight       = 1 THEN 1 ELSE 0 END AS bit)                      AS freight,
        CAST('aug_direct_pull' AS NVARCHAR(50))                                             AS source,
        ROW_NUMBER() OVER (
            PARTITION BY
                od.GUIDOrderDetail, od.GUIDOrder, od.OrderNumber,
                od.LineNumber, od.SubLineNumber, od.ComponentLevel, od.ProductID
            ORDER BY
                od.ProductID, od.Description, od.QtyOrdered, od._OriginalPrice, od.Amount
        ) AS duplicate_row_ordinal
    FROM dbo.OrderDetail od
    INNER JOIN dbo.Orders o   ON od.GUIDOrder  = o.GUIDOrder
    LEFT  JOIN dbo.Product prod ON od.ProductID = prod.ProductID
    WHERE o.OrderDate >= '2026-08-01'
      AND o.OrderDate <  DATEADD(day, 1, CAST(GETDATE() AS date))
)
SELECT * FROM src
ORDER BY order_date, order_number, line_number, sub_line_number, component_level
"@

# ---------------------------------------------------------------------------
# SQL execution helper
# ---------------------------------------------------------------------------

function Invoke-Sql {
    param([string]$SqlQuery)
    $conn = New-Object System.Data.SqlClient.SqlConnection($connStr)
    $conn.Open()
    try {
        $cmd             = $conn.CreateCommand()
        $cmd.CommandText = $SqlQuery
        $cmd.CommandTimeout = $SqlTimeout
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
    } finally {
        $conn.Close()
    }
}

# ---------------------------------------------------------------------------
# Value cleaning
#
# Types arriving from SQL after the typed casts above:
#   BIT          → System.Boolean  → stays bool  (serializes true/false)
#   INT/BIGINT   → System.Int32/64 → stays long  (serializes number)
#   NVARCHAR     → System.String   → strip control chars
#   DATETIME/etc → System.DateTime → format ISO  (shouldn't happen; we CONVERT in SQL)
#   NULL         → $null
# ---------------------------------------------------------------------------

function Clean-Value {
    param($Val)
    if ($null -eq $Val -or $Val -is [System.DBNull]) { return $null }
    if ($Val -is [bool])    { return [bool]$Val }
    if ($Val -is [string])  { return ($Val -replace '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '') }
    if ($Val -is [datetime] -or $Val -is [System.DateTimeOffset]) {
        return $Val.ToString('yyyy-MM-ddTHH:mm:ss')
    }
    if ($Val -is [System.Int32] -or $Val -is [System.Int64] -or
        $Val -is [int]           -or $Val -is [long]) {
        return [long]$Val
    }
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

# ---------------------------------------------------------------------------
# Net booking amount (for category reconciliation summary — not written to DB)
# Mirrors v_portal_bookings_line_facts:
#   COALESCE(qty * price * (1 - disc/100), amount - tariff - freight)
# Fields are strings at this point (from NVARCHAR SQL casts).
# ---------------------------------------------------------------------------

function Get-NetBookingAmount {
    param([hashtable]$Row)
    $qty    = if ($null -ne $Row['qty_ordered'])       { [double]$Row['qty_ordered']       } else { 0 }
    $price  = if ($null -ne $Row['original_price'])    { [double]$Row['original_price']    } else { 0 }
    $disc   = if ($null -ne $Row['line_discount_pct']) { [double]$Row['line_discount_pct'] } else { 0 }
    $amt    = if ($null -ne $Row['amount'])            { [double]$Row['amount']            } else { 0 }
    $tariff = if ($null -ne $Row['tariff_amount'])     { [double]$Row['tariff_amount']     } else { 0 }
    $frt    = if ($null -ne $Row['freight_amount'])    { [double]$Row['freight_amount']    } else { 0 }
    if ($qty -ne 0 -or $price -ne 0) {
        return [Math]::Round($qty * $price * (1.0 - $disc / 100.0), 2)
    } else {
        return [Math]::Round($amt - $tariff - $frt, 2)
    }
}

# ---------------------------------------------------------------------------
# Column whitelists — EXACT match to confirmed Supabase schemas (2026-08-18)
#
# portal_acctivate_orders columns NOT sent (nullable, not in dbo.Orders or uncertain):
#   order_type, completed, ship_via, fob, requested_ship_date, sold_to_name,
#   ship_to_description, po, discount_amount, sales_tax, total_amount,
#   sched_subtotal, sched_total_amount, updated_date
#   (synced_at is added by PowerShell below)
#
# portal_acctivate_order_lines columns NOT sent:
#   line_type, qty_shipped, qty_invoiced, qty_backordered, completed,
#   invoice_discount_amount, sched_amount
#   (synced_at added by PowerShell; order_number stripped after natural_key build)
# ---------------------------------------------------------------------------

$OrderAllowedCols = @{
    'guid_order'       = 1; 'order_number'     = 1; 'order_date'      = 1
    'entry_date'       = 1; 'order_status'     = 1; 'guid_customer'   = 1
    'guid_salesperson' = 1; 'rep1'             = 1; 'rep2'            = 1
    'subtotal'         = 1; 'synced_at'        = 1
}

$LineAllowedCols = @{
    'guid_order_detail'        = 1; 'guid_order'           = 1
    'line_number'              = 1; 'product_id'           = 1
    'description'              = 1; 'qty_ordered'          = 1
    'line_cancelled'           = 1; 'freight'              = 1
    'amount'                   = 1; 'freight_amount'       = 1
    'tariff_amount'            = 1; 'sales_category'       = 1
    'original_price'           = 1; 'line_discount_pct'    = 1
    'source_guid_order_detail' = 1; 'sub_line_number'      = 1
    'component_level'          = 1; 'duplicate_row_ordinal'= 1
    'natural_key'              = 1; 'source'               = 1
    'order_date'               = 1; 'synced_at'            = 1
}

function Strip-Row {
    param([hashtable]$Row, [hashtable]$Allowed)
    $out = @{}
    foreach ($key in $Row.Keys) {
        if ($Allowed.ContainsKey($key)) { $out[$key] = $Row[$key] }
    }
    return $out
}

# ---------------------------------------------------------------------------
# Convert-RowsToJsonArray
# Builds a JSON array string by serializing each row individually and joining
# them. This sidesteps all PS 5.1 ConvertTo-Json pipeline/unwrapping quirks
# where a single-element array can silently become a bare object {...}.
# The result is always "[{...},{...}]" regardless of row count.
# ---------------------------------------------------------------------------

function Convert-RowsToJsonArray {
    param([array]$Rows)
    $items = @()
    foreach ($row in @($Rows)) {
        $items += ($row | ConvertTo-Json -Depth 20 -Compress)
    }
    return '[' + ($items -join ',') + ']'
}

# ---------------------------------------------------------------------------
# HTTP: Invoke-Post
# Uses Convert-RowsToJsonArray (never bare ConvertTo-Json) so the body is
# always a JSON array. Sends as UTF-8 bytes with explicit charset to avoid
# PS 5.1 string re-encoding. Prints JSON starts-with and preview on every
# call so the array shape is confirmed before the request goes out.
# Returns @{ ok = bool; statusCode = int; body = string; json = string }
# ---------------------------------------------------------------------------

function Invoke-Post {
    param([string]$Url, [array]$Rows)

    $json      = Convert-RowsToJsonArray -Rows @($Rows)
    $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($json)

    Write-Host ('  Content-Type    : application/json; charset=utf-8') -ForegroundColor DarkGray
    Write-Host ('  JSON starts with: ' + $json.Substring(0, 1)) -ForegroundColor DarkGray
    Write-Host ('  JSON length     : ' + $json.Length + ' chars / ' + $bodyBytes.Length + ' bytes') -ForegroundColor DarkGray
    Write-Host ('  JSON preview    : ' + $json.Substring(0, [Math]::Min(500, $json.Length))) -ForegroundColor DarkGray

    $headers = @{
        'apikey'        = $ServiceKey
        'Authorization' = 'Bearer ' + $ServiceKey
        'Prefer'        = 'resolution=merge-duplicates,return=minimal'
    }

    try {
        Invoke-WebRequest `
            -Uri $Url `
            -Method Post `
            -Headers $headers `
            -ContentType 'application/json; charset=utf-8' `
            -Body $bodyBytes `
            -UseBasicParsing `
            -TimeoutSec $RequestTimeout `
            -ErrorAction Stop | Out-Null
        return @{ ok = $true; statusCode = 200; body = ''; json = $json }
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
        return @{ ok = $false; statusCode = $code; body = $body; json = $json }
    }
}

# ---------------------------------------------------------------------------
# Failed-row CSV logger (lines phase only)
# ---------------------------------------------------------------------------

$FailedCsvPath  = Join-Path $PSScriptRoot ('failed-booking-lines_' + (Get-Date -Format 'yyyyMMdd_HHmmss') + '.csv')
$script:FailedCount = 0
$script:CsvReady    = $false

$CsvColumns = @(
    '_fail_reason', 'natural_key', 'guid_order_detail', 'source_guid_order_detail',
    'guid_order', 'order_date', 'line_number', 'sub_line_number', 'component_level',
    'product_id', 'description', 'qty_ordered', 'original_price', 'line_discount_pct',
    'amount', 'tariff_amount', 'freight_amount', 'sales_category',
    'line_cancelled', 'freight', 'source', 'duplicate_row_ordinal'
)

function Log-FailedRow {
    param([hashtable]$Row, [string]$Reason)
    if (-not $script:CsvReady) {
        $CsvColumns -join ',' | Out-File -FilePath $FailedCsvPath -Encoding utf8 -Append
        $script:CsvReady = $true
    }
    $vals = $CsvColumns | ForEach-Object {
        $v = if ($_ -eq '_fail_reason') { $Reason } else { if ($null -ne $Row[$_]) { $Row[$_].ToString() } else { '' } }
        $v = $v.Replace('"', '""')
        if ($v -match '[,"\r\n]') { '"' + $v + '"' } else { $v }
    }
    $vals -join ',' | Out-File -FilePath $FailedCsvPath -Encoding utf8 -Append
    $script:FailedCount++
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

$ReconCategories = @('SW', 'FINNLOU', 'LUX', 'ALLOW', 'HOSP')
$SyncedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')

Write-Host ''
Write-Host ('=== Booking Sync  ' + (Get-Date -Format 'yyyy-MM-dd HH:mm') + ' ===') -ForegroundColor Yellow
Write-Host ('Server   : ' + $cfg.sql.server + ' / ' + $cfg.sql.database)
Write-Host 'Range    : 2026-08-01 through end of today'
Write-Host ('synced_at: ' + $SyncedAt)

# ===========================================================================
# PHASE 1 — Orders
# ===========================================================================

Write-Host ''
Write-Host '--- Phase 1: Orders ---' -ForegroundColor Cyan
Write-Host 'Querying dbo.Orders...' -ForegroundColor Cyan

$orderRows    = Invoke-Sql -SqlQuery $OrdersQuery
$pulledOrders = $orderRows.Count
Write-Host ('  ' + $pulledOrders + ' orders pulled from Acctivate') -ForegroundColor Green

if ($pulledOrders -eq 0) {
    Write-Warning 'No orders returned. Check date range and SQL Server connection.'
    exit 0
}

# Clean → strip unknown columns → add synced_at
$orderPayloads = @($orderRows | ForEach-Object {
    $row = Strip-Row -Row (Clean-Row $_) -Allowed $OrderAllowedCols
    $row['synced_at'] = $SyncedAt
    $row
})

# Report what was stripped
$rawKeys     = @($orderRows[0].Keys)
$payloadKeys = @($orderPayloads[0].Keys)
$stripped    = @($rawKeys | Where-Object { $payloadKeys -notcontains $_ })
if ($stripped.Count -gt 0) {
    Write-Host ('  Stripped (not in schema): ' + ($stripped | Sort-Object | ForEach-Object { $_ }) -join ', ') -ForegroundColor Yellow
}
Write-Host ('  Payload fields: ' + (($payloadKeys | Sort-Object) -join ', ')) -ForegroundColor DarkCyan

$OrdersUpsertUrl = $SupabaseUrl + '/rest/v1/portal_acctivate_orders?on_conflict=guid_order'

# Preflight: send one row, exit with full diagnostics on failure
Write-Host ''
Write-Host 'Preflight: sending first order row...' -ForegroundColor Cyan
$pf = Invoke-Post -Url $OrdersUpsertUrl -Rows @($orderPayloads[0])

if (-not $pf.ok) {
    Write-Host ''
    Write-Host '##################################################' -ForegroundColor Red
    Write-Host '  ORDER PREFLIGHT FAILED' -ForegroundColor Red
    Write-Host '##################################################' -ForegroundColor Red
    Write-Host ('  URL         : ' + $OrdersUpsertUrl) -ForegroundColor Yellow
    Write-Host ('  on_conflict : guid_order') -ForegroundColor Yellow
    Write-Host ('  HTTP status : ' + $pf.statusCode) -ForegroundColor Yellow
    Write-Host '  Supabase response body:' -ForegroundColor Red
    Write-Host ('  ' + $pf.body) -ForegroundColor Red
    Write-Host ''
    Write-Host '  Full JSON sent:' -ForegroundColor Cyan
    Write-Host $pf.json
    Write-Host ''
    Write-Host '  Fields in payload:' -ForegroundColor Cyan
    $orderPayloads[0].Keys | Sort-Object | ForEach-Object {
        $v = $orderPayloads[0][$_]
        Write-Host ('    ' + $_.PadRight(20) + ' = ' + $(if ($null -eq $v) { 'NULL' } else { $v }))
    }
    Write-Host ''
    Write-Host '  Actual table columns (run in Supabase SQL Editor):' -ForegroundColor DarkCyan
    Write-Host "    SELECT column_name, data_type, is_nullable FROM information_schema.columns" -ForegroundColor DarkCyan
    Write-Host "    WHERE table_name = 'portal_acctivate_orders' ORDER BY ordinal_position;" -ForegroundColor DarkCyan
    Write-Host ''
    Write-Host 'ABORT. Fix the error above then re-run.' -ForegroundColor Red
    exit 1
}
Write-Host ('  Preflight OK  guid_order=' + $orderPayloads[0]['guid_order']) -ForegroundColor Green

# Batch upload — stop immediately on first failed batch (no per-row retry for orders)
Write-Host ('Uploading ' + $pulledOrders + ' orders in batches of ' + $BatchSize + '...') -ForegroundColor Cyan
$uploadedOrders = 0

for ($i = 0; $i -lt $pulledOrders; $i += $BatchSize) {
    $last  = [Math]::Min($i + $BatchSize - 1, $pulledOrders - 1)
    $chunk = $orderPayloads[$i..$last]
    $res   = Invoke-Post -Url $OrdersUpsertUrl -Rows $chunk

    if ($res.ok) {
        $uploadedOrders += $chunk.Count
        Write-Host ('  rows ' + ($i + 1) + '-' + ($last + 1) + '/' + $pulledOrders + '  ok') -ForegroundColor DarkCyan
    } else {
        Write-Host ''
        Write-Host '##################################################' -ForegroundColor Red
        Write-Host '  ORDER BATCH UPLOAD FAILED' -ForegroundColor Red
        Write-Host '##################################################' -ForegroundColor Red
        Write-Host ('  Rows        : ' + ($i + 1) + ' - ' + ($last + 1)) -ForegroundColor Yellow
        Write-Host ('  HTTP status : ' + $res.statusCode) -ForegroundColor Yellow
        Write-Host '  Supabase response body:' -ForegroundColor Red
        Write-Host ('  ' + $res.body) -ForegroundColor Red
        Write-Host '  Full JSON sent:' -ForegroundColor Cyan
        Write-Host $res.json
        throw ('Order batch upload failed at rows ' + ($i+1) + '-' + ($last+1) + '. See error above.')
    }
}

Write-Host ('  ' + $uploadedOrders + '/' + $pulledOrders + ' orders uploaded.') -ForegroundColor Green

# ===========================================================================
# PHASE 2 — Order Lines
# ===========================================================================

Write-Host ''
Write-Host '--- Phase 2: Order Lines ---' -ForegroundColor Cyan
Write-Host 'Querying dbo.OrderDetail...' -ForegroundColor Cyan

$lineRows    = Invoke-Sql -SqlQuery $LinesQuery
$pulledLines = $lineRows.Count
Write-Host ('  ' + $pulledLines + ' line rows pulled from Acctivate') -ForegroundColor Green

if ($pulledLines -eq 0) {
    Write-Warning 'No order lines returned.'
    exit 0
}

# Build 7-part natural_key for every row (uses order_number which is in SQL
# for key-building only — it will be stripped by LineAllowedCols below)
foreach ($row in $lineRows) {
    $p1 = if ($null -ne $row['order_number'])             { $row['order_number'].ToString()             } else { '' }
    $p2 = if ($null -ne $row['line_number'])              { $row['line_number'].ToString()              } else { '' }
    $p3 = if ($null -ne $row['sub_line_number'])          { $row['sub_line_number'].ToString()          } else { '' }
    $p4 = if ($null -ne $row['component_level'])          { $row['component_level'].ToString()          } else { '' }
    $p5 = if ($null -ne $row['product_id'])               { $row['product_id'].ToString()               } else { '' }
    $p6 = if ($null -ne $row['source_guid_order_detail']) { $row['source_guid_order_detail'].ToString() } else { '' }
    $p7 = if ($null -ne $row['duplicate_row_ordinal'])    { $row['duplicate_row_ordinal'].ToString()    } else { '1' }
    $row['natural_key'] = $p1 + '-' + $p2 + '-' + $p3 + '-' + $p4 + '-' + $p5 + '-' + $p6 + '-' + $p7
}

# Natural key uniqueness check — abort if any duplicates
$keyCounts    = @{}
$blankGuids   = 0
$guidCounts   = @{}
foreach ($row in $lineRows) {
    $k = $row['natural_key']
    $keyCounts[$k] = if ($keyCounts.ContainsKey($k)) { $keyCounts[$k] + 1 } else { 1 }
    $g = $row['source_guid_order_detail']
    if ($null -eq $g -or $g.ToString().Trim() -eq '') {
        $blankGuids++
    } else {
        $gk = $g.ToString()
        $guidCounts[$gk] = if ($guidCounts.ContainsKey($gk)) { $guidCounts[$gk] + 1 } else { 1 }
    }
}
$distinctNK = $keyCounts.Count
$dupNKCount = $pulledLines - $distinctNK
$dupGuidCount = ($guidCounts.Values | Where-Object { $_ -gt 1 } | Measure-Object -Sum).Sum

Write-Host ''
Write-Host 'Pre-upload diagnostics:' -ForegroundColor Cyan
Write-Host ('  Rows pulled                 : ' + $pulledLines)
Write-Host ('  Distinct natural_keys       : ' + $distinctNK)
Write-Host ('  Duplicate natural_keys      : ' + $dupNKCount)
Write-Host ('  Distinct source_guid_od     : ' + $guidCounts.Count)
Write-Host ('  Duplicate GUIDs (extra rows): ' + $dupGuidCount)
Write-Host ('  Blank/null GUIDs            : ' + $blankGuids)

if ($dupNKCount -gt 0) {
    Write-Host ''
    Write-Host 'DUPLICATE natural_keys (first 10):' -ForegroundColor Red
    $shown = 0
    foreach ($entry in $keyCounts.GetEnumerator()) {
        if ($entry.Value -gt 1) {
            Write-Host ('  ' + $entry.Key + '  (' + $entry.Value + ' rows)') -ForegroundColor Red
            $shown++
            if ($shown -ge 10) { break }
        }
    }
    throw ('ABORT: natural_key is not unique (' + $dupNKCount + ' duplicates). Fix key before uploading.')
}
Write-Host '  All natural_keys are distinct.' -ForegroundColor Green

# Category reconciliation summary
$reconSums   = @{}; $reconCounts = @{}
foreach ($cat in $ReconCategories) { $reconSums[$cat] = 0.0; $reconCounts[$cat] = 0 }
foreach ($row in $lineRows) {
    $cat = $row['sales_category']
    if ($null -ne $cat -and $reconSums.ContainsKey($cat)) {
        $reconSums[$cat]   += Get-NetBookingAmount $row
        $reconCounts[$cat] ++
    }
}
$reconTotal = 0.0; $reconLines = 0
foreach ($cat in $ReconCategories) { $reconTotal += $reconSums[$cat]; $reconLines += $reconCounts[$cat] }

Write-Host ''
Write-Host 'Net booking amount by SalesCategory (Acctivate):' -ForegroundColor Cyan
foreach ($cat in $ReconCategories) {
    Write-Host ('  ' + $cat.PadRight(10) + $reconSums[$cat].ToString('N2').PadLeft(14) + '  (' + $reconCounts[$cat] + ' lines)')
}
Write-Host ('  ' + 'TOTAL'.PadRight(10) + $reconTotal.ToString('N2').PadLeft(14) + '  (' + $reconLines + ' lines)') -ForegroundColor Green

# Build upload payloads (strip non-schema columns; add synced_at)
$linePayloads = @($lineRows | ForEach-Object {
    $row = Strip-Row -Row (Clean-Row $_) -Allowed $LineAllowedCols
    $row['synced_at'] = $SyncedAt
    $row
})

$LinesUpsertUrl = $SupabaseUrl + '/rest/v1/portal_acctivate_order_lines?on_conflict=natural_key'

Write-Host ''
Write-Host ('Uploading ' + $pulledLines + ' lines in batches of ' + $BatchSize + '...') -ForegroundColor Cyan

$uploadedLines  = 0
$lineBatchFails = 0

for ($i = 0; $i -lt $pulledLines; $i += $BatchSize) {
    $last  = [Math]::Min($i + $BatchSize - 1, $pulledLines - 1)
    $chunk = $linePayloads[$i..$last]
    $res   = Invoke-Post -Url $LinesUpsertUrl -Rows $chunk

    if ($res.ok) {
        $uploadedLines += $chunk.Count
        Write-Host ('  rows ' + ($i + 1) + '-' + ($last + 1) + '/' + $pulledLines + '  ok') -ForegroundColor DarkCyan
    } else {
        $lineBatchFails++
        Write-Warning ('  batch ' + ($i+1) + '-' + ($last+1) + ' failed  HTTP ' + $res.statusCode + ': ' + $res.body)
        Write-Warning '  retrying row by row...'
        for ($j = 0; $j -lt $chunk.Count; $j++) {
            $rr = Invoke-Post -Url $LinesUpsertUrl -Rows @($chunk[$j])
            if ($rr.ok) {
                $uploadedLines++
            } else {
                $nk   = if ($null -ne $chunk[$j]['natural_key'])              { $chunk[$j]['natural_key']              } else { 'NULL' }
                $guid = if ($null -ne $chunk[$j]['source_guid_order_detail']) { $chunk[$j]['source_guid_order_detail'] } else { 'NULL' }
                Write-Warning ('    FAILED  nk=' + $nk + '  guid=' + $guid)
                Write-Warning ('    HTTP ' + $rr.statusCode + ': ' + $rr.body)
                Log-FailedRow -Row $lineRows[$i + $j] -Reason $rr.body
            }
        }
    }
}

Write-Host ('  ' + $uploadedLines + '/' + $pulledLines + ' lines uploaded.') -ForegroundColor Green
if ($script:FailedCount -gt 0) {
    Write-Warning ($script:FailedCount.ToString() + ' rows failed -- see ' + $FailedCsvPath)
}

# ===========================================================================
# POST-UPLOAD: Refresh materialized view
# ===========================================================================

Write-Host ''
Write-Host 'Refreshing mv_portal_monthly_net_bookings_actuals...' -ForegroundColor Cyan

$RpcUrl     = $SupabaseUrl + '/rest/v1/rpc/refresh_mv_portal_bookings'
$RpcHeaders = @{
    'apikey'        = $ServiceKey
    'Authorization' = 'Bearer ' + $ServiceKey
    'Content-Type'  = 'application/json'
}
$rpcOk = $false
for ($attempt = 1; $attempt -le $MaxRetries; $attempt++) {
    try {
        Invoke-RestMethod -Method Post -Uri $RpcUrl -Headers $RpcHeaders `
            -Body '{}' -TimeoutSec 120 | Out-Null
        Write-Host '  Materialized view refreshed.' -ForegroundColor Green
        $rpcOk = $true
        break
    } catch {
        if ($attempt -ge $MaxRetries) {
            Write-Warning ('Mat view refresh failed: ' + $_.Exception.Message)
            Write-Warning 'Run manually in Supabase: SELECT public.refresh_mv_portal_bookings();'
        } else {
            Start-Sleep -Seconds $RetryDelay
        }
    }
}

# ===========================================================================
# Summary
# ===========================================================================

Write-Host ''
Write-Host '----------------------------------------------' -ForegroundColor Green
Write-Host ' SYNC COMPLETE' -ForegroundColor Green
Write-Host '----------------------------------------------' -ForegroundColor Green
Write-Host (' Orders  pulled / uploaded : ' + $pulledOrders  + ' / ' + $uploadedOrders)
Write-Host (' Lines   pulled / uploaded : ' + $pulledLines   + ' / ' + $uploadedLines)
Write-Host (' Failed line rows          : ' + $script:FailedCount)
Write-Host (' Line batch fallbacks      : ' + $lineBatchFails)
Write-Host (' Mat view refreshed        : ' + $rpcOk)
if ($script:FailedCount -gt 0) {
    Write-Host (' Failed CSV                : ' + $FailedCsvPath) -ForegroundColor Yellow
}
Write-Host ''
Write-Host ' Booking totals by SalesCategory (Acctivate):' -ForegroundColor Cyan
foreach ($cat in $ReconCategories) {
    Write-Host ('  ' + $cat.PadRight(10) + $reconSums[$cat].ToString('N2').PadLeft(14) + '  (' + $reconCounts[$cat] + ' lines)')
}
Write-Host ('  ' + 'TOTAL'.PadRight(10) + $reconTotal.ToString('N2').PadLeft(14) + '  (' + $reconLines + ' lines)') -ForegroundColor Green
Write-Host ''
if ($uploadedOrders -eq $pulledOrders -and $uploadedLines -eq $pulledLines -and $script:FailedCount -eq 0) {
    Write-Host ' ALL UPLOADS SUCCEEDED' -ForegroundColor Green
} else {
    Write-Host ' SOME ROWS DID NOT UPLOAD -- review output above' -ForegroundColor Red
}
Write-Host '----------------------------------------------' -ForegroundColor Green
Write-Host (' Finished ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')) -ForegroundColor Green
