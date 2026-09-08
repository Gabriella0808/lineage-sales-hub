<#
.SYNOPSIS
    Syncs the full, currently-open Sales Order population (any order date)
    into Supabase — the source for Inventory > Backlog / Open SOs.

.DESCRIPTION
    Open SO is a current-state backlog metric, not a booking-date-range
    metric. sync-aug-current-bookings.ps1 (and sync-jan-jul-historical-
    bookings.ps1) only cover orders whose ORDER DATE falls in their fixed
    range — an order placed before Aug 1 that is still open would never be
    captured by either. This script has no date filter at all: it pulls
    EVERY order currently matching Andrew's validated Open SO definition,
    regardless of when it was placed.

    Open-order definition (matches Andrew's SSMS-validated query exactly):
      Header:  WorkflowStatus IN ('Not Ready to Pick','Ready to Pick',
                                    'Pick In Progress','Partially Invoiced')
      Line:    LineCancelled = 0 OR NULL, ProductID IS NOT NULL, trim <> '',
               QtyOutstanding > 0 (enforced again in the view — belt and
               suspenders, since this script pulls all lines on open orders)

    Writes into public.portal_acctivate_orders / public.portal_acctivate_order_lines
    — the SAME tables sync-aug-current-bookings.ps1 writes into, and the
    tables v_portal_open_sales_order_line_facts reads from. This is
    deliberate: no new tables, no view changes needed here.

    SAFETY — this script only UPSERTs, it NEVER deletes or clears the
    tables. Both tables are shared with booking-actuals reporting
    (v_portal_bookings_line_facts / mv_portal_monthly_net_bookings_actuals);
    a blanket DELETE (the previous version of this script's pattern) would
    destroy booking history. Every upsert here sends only the columns this
    script is authoritative for (workflow_status, qty_outstanding, price,
    requested_ship_date, branch_id, rep1, customer/product fields) — Prefer:
    resolution=merge-duplicates means unlisted columns on an existing row
    (subtotal, amount, etc.) are left untouched.

    STALENESS — an order that closes (WorkflowStatus leaves the open list)
    stops appearing in this run's pull, so its workflow_status in Supabase
    would otherwise stay stuck at its last-seen open value forever. Phase 3
    finds exactly those rows (marked open in Supabase, absent from this
    run's fresh pull) and re-queries Acctivate for their current
    WorkFlowStatus, patching just that one column.

    Config: place kpi.config.json next to this script, or pass -ConfigPath.
    Schedule: 5:00 AM and 5:00 PM EST daily (see register-open-orders-tasks.ps1) —
    unchanged, this script's filename/behavior contract (SO sync) is preserved.

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File "C:\AcctivateKPI\sync-open-sales-orders.ps1"
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

$OpenStatusList = "'Not Ready to Pick','Ready to Pick','Pick In Progress','Partially Invoiced'"

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

function Test-ColumnExists {
    param([string]$Table, [string]$Column)
    $r = Invoke-Sql -SqlQuery "SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                                WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='$Table' AND COLUMN_NAME='$Column'"
    return ($r.Count -gt 0)
}

Write-Host 'Checking dbo.Orders schema for optional columns...' -ForegroundColor Cyan
$hasSoldToName = Test-ColumnExists -Table 'Orders' -Column 'SoldToName'
$hasShipToDesc = Test-ColumnExists -Table 'Orders' -Column 'ShipToDescription'

$soldToNameExpr = if ($hasSoldToName) { "CAST(ISNULL(o.SoldToName,       '') AS NVARCHAR(500))" } else { "CAST('' AS NVARCHAR(500))" }
$shipToDescExpr = if ($hasShipToDesc) { "CAST(ISNULL(o.ShipToDescription,'') AS NVARCHAR(500))" } else { "CAST('' AS NVARCHAR(500))" }
$discCodeExpr   = "CAST(NULLIF(RTRIM(ISNULL(od._DiscType, '')), '') AS NVARCHAR(50))"

# ---------------------------------------------------------------------------
# SQL: Orders — every order currently in an open WorkflowStatus, no date bound
# ---------------------------------------------------------------------------

$OrdersQuery = @"
SELECT
    LOWER(REPLACE(REPLACE(CAST(o.GUIDOrder AS NVARCHAR(64)), '{', ''), '}', ''))       AS guid_order,
    CAST(o.OrderNumber AS NVARCHAR(64))                                                 AS order_number,
    CONVERT(nvarchar(30), o.OrderDate, 126)                                             AS order_date,
    CONVERT(nvarchar(30), ISNULL(o.EntryDate, o.OrderDate), 126)                        AS entry_date,
    CAST(ISNULL(o.OrderStatus, '')    AS NVARCHAR(100))                                 AS order_status,
    CAST(ISNULL(o.WorkFlowStatus, '') AS NVARCHAR(100))                                 AS workflow_status,
    CONVERT(nvarchar(30), o.RequestedShipDate, 126)                                     AS requested_ship_date,
    LOWER(CAST(o.GUIDCustomer         AS NVARCHAR(64)))                                 AS guid_customer,
    LOWER(REPLACE(REPLACE(CAST(o.GUIDSalesperson AS NVARCHAR(64)), '{', ''), '}', '')) AS guid_salesperson,
    CAST(ISNULL(o.SalespersonID, '')  AS NVARCHAR(100))                                 AS rep1,
    CAST(ISNULL(o._Rep2, '')          AS NVARCHAR(100))                                 AS rep2,
    CAST(CAST(COALESCE(o.SubTotal, 0) AS decimal(18,2)) AS NVARCHAR(30))               AS subtotal,
    CAST(ISNULL(o.CustomerID, '')     AS NVARCHAR(100))                                 AS customer_id,
    $soldToNameExpr                                                                     AS sold_to_name,
    $shipToDescExpr                                                                     AS ship_to_description,
    CAST(ISNULL(o.BranchID, '')      AS NVARCHAR(50))                                  AS branch_id
FROM dbo.Orders o
WHERE o.WorkFlowStatus IN ($OpenStatusList)
ORDER BY o.OrderDate, o.OrderNumber
"@

# ---------------------------------------------------------------------------
# SQL: Order Lines — all lines on those open orders (line-level open/valid
# filters are enforced again in the view; QtyOutstanding > 0 also applied
# here to keep the pull itself close to the view's definition).
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
        CAST(od.QtyOutstanding AS decimal(18,4))                                           AS qty_outstanding,
        CAST(od.Price          AS decimal(18,4))                                           AS price,
        CAST(CAST(COALESCE(od.Amount,          0) AS decimal(18,2)) AS NVARCHAR(30))       AS amount,
        CAST(CAST(COALESCE(od._TariffAmt,      0) AS decimal(18,2)) AS NVARCHAR(30))       AS tariff_amount,
        CAST(CAST(COALESCE(od._FreightAmt,     0) AS decimal(18,2)) AS NVARCHAR(30))       AS freight_amount,
        CAST(ISNULL(prod.SalesCategory, '') AS NVARCHAR(100))                               AS sales_category,
        CAST(COALESCE(NULLIF(RTRIM(pc.Description), ''), NULLIF(RTRIM(prod.ProductClassID), ''), '') AS NVARCHAR(128)) AS product_class,
        CAST(CASE WHEN od.LineCancelled = 1 THEN 1 ELSE 0 END AS bit)                      AS line_cancelled,
        CAST(CASE WHEN od.Freight       = 1 THEN 1 ELSE 0 END AS bit)                      AS freight,
        $discCodeExpr                                                                       AS discount_code,
        CAST('open_so_sync' AS NVARCHAR(50))                                                AS source,
        ROW_NUMBER() OVER (
            PARTITION BY
                od.GUIDOrderDetail, od.GUIDOrder, od.OrderNumber,
                od.LineNumber, od.SubLineNumber, od.ComponentLevel, od.ProductID
            ORDER BY
                od.ProductID, od.Description, od.QtyOrdered, od._OriginalPrice, od.Amount
        ) AS duplicate_row_ordinal
    FROM dbo.OrderDetail od
    INNER JOIN dbo.Orders o     ON od.GUIDOrder  = o.GUIDOrder
    LEFT  JOIN dbo.Product prod ON od.ProductID  = prod.ProductID
    LEFT  JOIN dbo.ProductClass pc ON pc.ProductClassID = prod.ProductClassID
    WHERE o.WorkFlowStatus IN ($OpenStatusList)
      AND (od.LineCancelled IS NULL OR od.LineCancelled = 0)
      AND od.ProductID IS NOT NULL
      AND RTRIM(LTRIM(od.ProductID)) <> ''
      AND od.QtyOutstanding > 0
)
SELECT * FROM src
ORDER BY order_date, order_number, line_number, sub_line_number, component_level
"@

# ---------------------------------------------------------------------------
# Value cleaning (identical to sync-aug-current-bookings.ps1)
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
# Column whitelists — must stay a subset of portal_acctivate_orders /
# portal_acctivate_order_lines' real columns (merge-duplicates upsert only
# overwrites columns actually present in the payload).
# ---------------------------------------------------------------------------

$OrderAllowedCols = @{
    'guid_order'          = 1; 'order_number'        = 1; 'order_date'          = 1
    'entry_date'          = 1; 'order_status'        = 1; 'workflow_status'     = 1
    'requested_ship_date' = 1; 'guid_customer'       = 1
    'guid_salesperson'    = 1; 'rep1'                = 1; 'rep2'                = 1
    'subtotal'            = 1; 'synced_at'           = 1
    'customer_id'         = 1; 'sold_to_name'        = 1; 'ship_to_description' = 1
    'branch_id'           = 1
}

$LineAllowedCols = @{
    'guid_order_detail'        = 1; 'guid_order'           = 1
    'line_number'              = 1; 'product_id'           = 1
    'description'              = 1; 'qty_ordered'          = 1
    'line_cancelled'           = 1; 'freight'              = 1
    'amount'                   = 1; 'freight_amount'       = 1
    'tariff_amount'            = 1; 'sales_category'       = 1
    'original_price'           = 1; 'line_discount_pct'    = 1
    'qty_outstanding'          = 1; 'price'                = 1
    'source_guid_order_detail' = 1; 'sub_line_number'      = 1
    'component_level'          = 1; 'duplicate_row_ordinal'= 1
    'natural_key'              = 1; 'source'               = 1
    'order_date'               = 1; 'synced_at'            = 1
    'product_class'            = 1; 'discount_code'        = 1
}

function Strip-Row {
    param([hashtable]$Row, [hashtable]$Allowed)
    $out = @{}
    foreach ($key in $Row.Keys) {
        if ($Allowed.ContainsKey($key)) { $out[$key] = $Row[$key] }
    }
    return $out
}

function Convert-RowsToJsonArray {
    param([array]$Rows)
    $items = @()
    foreach ($row in @($Rows)) {
        $items += ($row | ConvertTo-Json -Depth 20 -Compress)
    }
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
        Invoke-WebRequest `
            -Uri $Url -Method Post -Headers $headers `
            -ContentType 'application/json; charset=utf-8' `
            -Body $bodyBytes -UseBasicParsing -TimeoutSec $RequestTimeout `
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

function Invoke-Get {
    param([string]$Url)
    $headers = @{
        'apikey'        = $ServiceKey
        'Authorization' = 'Bearer ' + $ServiceKey
    }
    $resp = Invoke-RestMethod -Method Get -Uri $Url -Headers $headers -TimeoutSec $RequestTimeout
    return $resp
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

$SyncedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')

Write-Host ''
Write-Host ('=== Open Sales Order Sync (full, no date bound)  ' + (Get-Date -Format 'yyyy-MM-dd HH:mm') + ' ===') -ForegroundColor Yellow
Write-Host ('Server   : ' + $cfg.sql.server + ' / ' + $cfg.sql.database)
Write-Host ('Filter   : WorkFlowStatus IN (' + $OpenStatusList + ')')
Write-Host ('synced_at: ' + $SyncedAt)

# ===========================================================================
# PHASE 1 — Orders
# ===========================================================================

Write-Host ''
Write-Host '--- Phase 1: Open Orders ---' -ForegroundColor Cyan
$orderRows    = Invoke-Sql -SqlQuery $OrdersQuery
$pulledOrders = $orderRows.Count
Write-Host ('  ' + $pulledOrders + ' currently-open orders pulled from Acctivate') -ForegroundColor Green

if ($pulledOrders -eq 0) {
    Write-Warning 'No open orders returned. Check SQL Server connection / WorkFlowStatus values. Aborting without touching Supabase.'
    exit 0
}

$orderPayloads = @($orderRows | ForEach-Object {
    $row = Strip-Row -Row (Clean-Row $_) -Allowed $OrderAllowedCols
    $row['synced_at'] = $SyncedAt
    $row
})

$OrdersUpsertUrl = $SupabaseUrl + '/rest/v1/portal_acctivate_orders?on_conflict=guid_order'

Write-Host 'Preflight: sending first order row...' -ForegroundColor Cyan
$pf = Invoke-Post -Url $OrdersUpsertUrl -Rows @($orderPayloads[0])
if (-not $pf.ok) {
    Write-Host ''
    Write-Host 'ORDER PREFLIGHT FAILED' -ForegroundColor Red
    Write-Host ('  HTTP status : ' + $pf.statusCode) -ForegroundColor Yellow
    Write-Host ('  ' + $pf.body) -ForegroundColor Red
    Write-Host $pf.json
    exit 1
}
Write-Host ('  Preflight OK  guid_order=' + $orderPayloads[0]['guid_order']) -ForegroundColor Green

$uploadedOrders = 0
for ($i = 0; $i -lt $pulledOrders; $i += $BatchSize) {
    $last  = [Math]::Min($i + $BatchSize - 1, $pulledOrders - 1)
    $chunk = $orderPayloads[$i..$last]
    $res   = Invoke-Post -Url $OrdersUpsertUrl -Rows $chunk
    if ($res.ok) {
        $uploadedOrders += $chunk.Count
        Write-Host ('  rows ' + ($i + 1) + '-' + ($last + 1) + '/' + $pulledOrders + '  ok') -ForegroundColor DarkCyan
    } else {
        Write-Host ('ORDER BATCH UPLOAD FAILED  HTTP ' + $res.statusCode + ': ' + $res.body) -ForegroundColor Red
        throw ('Order batch upload failed at rows ' + ($i+1) + '-' + ($last+1) + '.')
    }
}
Write-Host ('  ' + $uploadedOrders + '/' + $pulledOrders + ' open orders uploaded.') -ForegroundColor Green

# ===========================================================================
# PHASE 2 — Order Lines
# ===========================================================================

Write-Host ''
Write-Host '--- Phase 2: Open Order Lines ---' -ForegroundColor Cyan
$lineRows    = Invoke-Sql -SqlQuery $LinesQuery
$pulledLines = $lineRows.Count
Write-Host ('  ' + $pulledLines + ' open line rows pulled from Acctivate') -ForegroundColor Green

if ($pulledLines -eq 0) {
    Write-Warning 'No open order lines returned.'
    exit 0
}

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

$linePayloads = @($lineRows | ForEach-Object {
    $row = Strip-Row -Row (Clean-Row $_) -Allowed $LineAllowedCols
    $row['synced_at'] = $SyncedAt
    $row
})

$LinesUpsertUrl = $SupabaseUrl + '/rest/v1/portal_acctivate_order_lines?on_conflict=guid_order_detail'

Write-Host 'Preflight: sending first line row...' -ForegroundColor Cyan
$pf2 = Invoke-Post -Url $LinesUpsertUrl -Rows @($linePayloads[0])
if (-not $pf2.ok) {
    Write-Host 'LINE PREFLIGHT FAILED' -ForegroundColor Red
    Write-Host ('  HTTP status : ' + $pf2.statusCode) -ForegroundColor Yellow
    Write-Host ('  ' + $pf2.body) -ForegroundColor Red
    exit 1
}
Write-Host '  Preflight OK' -ForegroundColor Green

$uploadedLines  = 0
$failedLines    = 0
for ($i = 0; $i -lt $pulledLines; $i += $BatchSize) {
    $last  = [Math]::Min($i + $BatchSize - 1, $pulledLines - 1)
    $chunk = $linePayloads[$i..$last]
    $res   = Invoke-Post -Url $LinesUpsertUrl -Rows $chunk
    if ($res.ok) {
        $uploadedLines += $chunk.Count
        Write-Host ('  rows ' + ($i + 1) + '-' + ($last + 1) + '/' + $pulledLines + '  ok') -ForegroundColor DarkCyan
    } else {
        Write-Warning ('  batch ' + ($i+1) + '-' + ($last+1) + ' failed  HTTP ' + $res.statusCode + ': ' + $res.body)
        Write-Warning '  retrying row by row...'
        for ($j = 0; $j -lt $chunk.Count; $j++) {
            $rr = Invoke-Post -Url $LinesUpsertUrl -Rows @($chunk[$j])
            if ($rr.ok) { $uploadedLines++ }
            else {
                $failedLines++
                Write-Warning ('    FAILED  guid=' + $chunk[$j]['guid_order_detail'] + '  HTTP ' + $rr.statusCode + ': ' + $rr.body)
            }
        }
    }
}
Write-Host ('  ' + $uploadedLines + '/' + $pulledLines + ' open lines uploaded.') -ForegroundColor Green
if ($failedLines -gt 0) { Write-Warning ($failedLines.ToString() + ' line rows failed to upload.') }

# ===========================================================================
# PHASE 3 — Staleness: clear workflow_status for orders that have closed
# since they were last marked open in Supabase.
# ===========================================================================

Write-Host ''
Write-Host '--- Phase 3: Clearing closed orders no longer in the open set ---' -ForegroundColor Cyan

$freshGuids = @{}
foreach ($row in $orderRows) { $freshGuids[$row['guid_order'].ToString()] = 1 }

$SelectUrl = $SupabaseUrl + '/rest/v1/portal_acctivate_orders?select=guid_order&workflow_status=in.(' +
             ($OpenStatusList -replace "'", '"') + ')'
$markedOpenInSupabase = @()
try {
    $markedOpenInSupabase = Invoke-Get -Url $SelectUrl
} catch {
    Write-Warning ('  Could not read currently-marked-open rows from Supabase: ' + $_.Exception.Message)
    Write-Warning '  Skipping staleness reconciliation this run — will retry next scheduled sync.'
}

$staleGuids = @($markedOpenInSupabase | ForEach-Object { $_.guid_order } | Where-Object { -not $freshGuids.ContainsKey($_) })

if ($staleGuids.Count -eq 0) {
    Write-Host '  No stale open-flagged orders found. Nothing to clear.' -ForegroundColor Green
} else {
    Write-Host ('  ' + $staleGuids.Count + ' order(s) marked open in Supabase are no longer open in Acctivate — re-checking...') -ForegroundColor Yellow

    $guidListSql = ($staleGuids | ForEach-Object { "'" + $_.Replace("'", "''") + "'" }) -join ','
    $StaleQuery = @"
SELECT
    LOWER(REPLACE(REPLACE(CAST(o.GUIDOrder AS NVARCHAR(64)), '{', ''), '}', '')) AS guid_order,
    CAST(ISNULL(o.WorkFlowStatus, '') AS NVARCHAR(100))                          AS workflow_status
FROM dbo.Orders o
WHERE LOWER(REPLACE(REPLACE(CAST(o.GUIDOrder AS NVARCHAR(64)), '{', ''), '}', '')) IN ($guidListSql)
"@
    $staleRows = Invoke-Sql -SqlQuery $StaleQuery

    if ($staleRows.Count -gt 0) {
        $stalePayloads = @($staleRows | ForEach-Object {
            @{ guid_order = $_['guid_order']; workflow_status = $_['workflow_status']; synced_at = $SyncedAt }
        })
        $clearedCount = 0
        foreach ($row in $stalePayloads) {
            $r = Invoke-Post -Url $OrdersUpsertUrl -Rows @($row)
            if ($r.ok) { $clearedCount++ }
            else { Write-Warning ('    Failed to clear guid_order=' + $row['guid_order'] + '  HTTP ' + $r.statusCode + ': ' + $r.body) }
        }
        Write-Host ('  ' + $clearedCount + '/' + $stalePayloads.Count + ' closed order(s) updated to their current WorkFlowStatus.') -ForegroundColor Green
    }
}

# ===========================================================================
# Summary
# ===========================================================================

Write-Host ''
Write-Host '----------------------------------------------' -ForegroundColor Green
Write-Host ' OPEN SO SYNC COMPLETE' -ForegroundColor Green
Write-Host '----------------------------------------------' -ForegroundColor Green
Write-Host (' Open orders  pulled / uploaded : ' + $pulledOrders + ' / ' + $uploadedOrders)
Write-Host (' Open lines   pulled / uploaded : ' + $pulledLines  + ' / ' + $uploadedLines)
Write-Host (' Failed line rows               : ' + $failedLines)
Write-Host (' Stale (now-closed) orders cleared: ' + $(if ($staleGuids) { $staleGuids.Count } else { 0 }))
Write-Host (' Finished                       : ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
Write-Host ''
Write-Host ' Validation SQL (run in Supabase SQL editor):' -ForegroundColor Cyan
Write-Host @'

select
  count(distinct order_number) as open_sales_orders,
  count(*) as open_lines,
  round(sum(qty_open), 2) as open_units,
  round(sum(open_so_amount), 2) as open_so_value
from public.v_portal_open_sales_order_line_facts;

'@
