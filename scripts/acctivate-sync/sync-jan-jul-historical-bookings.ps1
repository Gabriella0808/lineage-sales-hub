<#
.SYNOPSIS
    Backfills Jan–Jul 2026 booking orders and order lines from Acctivate into
    portal_acctivate_orders and portal_acctivate_order_lines.

.DESCRIPTION
    Mirrors the structure of sync-aug-current-bookings.ps1 exactly, targeting
    the Jan–Jul 2026 date range (2026-01-01 through 2026-07-31).

    Two-phase upload:
      Phase 1 — portal_acctivate_orders (conflict key: guid_order)
      Phase 2 — portal_acctivate_order_lines (conflict key: natural_key)

    Before uploading, deletes existing Jan–Jul rows to handle any Skyvia or
    prior-import rows whose natural_keys might differ from this script's format.

    Source tag on order lines: 'jan_jul_direct_pull'
    Source tag on orders:      'jan_jul_direct_pull'

    Does NOT touch:
      - August rows  (order_date >= 2026-08-01)
      - Invoice lines or locked KPI table

    Config: C:\AcctivateKPI\kpi.config.json

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File sync-jan-jul-historical-bookings.ps1
#>

[CmdletBinding()]
param(
    [string]$ConfigPath = (Join-Path $PSScriptRoot 'kpi.config.json')
)

$ErrorActionPreference = 'Stop'

$RangeStart = '2026-01-01'
$RangeEnd   = '2026-08-01'   # exclusive upper bound
$SourceTag  = 'jan_jul_direct_pull'

# ─── Config ──────────────────────────────────────────────────────────────────

if (-not (Test-Path $ConfigPath)) { throw "Config not found: $ConfigPath" }
$cfg = Get-Content $ConfigPath -Raw | ConvertFrom-Json

$SupabaseUrl    = $cfg.supabaseUrl.TrimEnd('/')
$ServiceKey     = $cfg.serviceRoleKey
$BatchSize      = 50;  if ($cfg.batchSize)                 { $BatchSize      = [int]$cfg.batchSize }
$MaxRetries     = 3;   if ($cfg.maxRetries)                { $MaxRetries     = [int]$cfg.maxRetries }
$RetryDelay     = 10;  if ($cfg.retryDelaySeconds)         { $RetryDelay     = [int]$cfg.retryDelaySeconds }
$RequestTimeout = 60;  if ($cfg.requestTimeoutSec)         { $RequestTimeout = [int]$cfg.requestTimeoutSec }
$SqlTimeout     = 600; if ($cfg.sql.commandTimeoutSeconds)  { $SqlTimeout    = [int]$cfg.sql.commandTimeoutSeconds }

if (-not $SupabaseUrl -or -not $ServiceKey) {
    throw "supabaseUrl and serviceRoleKey are required in $ConfigPath"
}

# ─── SQL connection ───────────────────────────────────────────────────────────

$connStr = 'Server=' + $cfg.sql.server + ';Database=' + $cfg.sql.database + ';Connection Timeout=30;'
if ($cfg.sql.integratedSecurity) { $connStr += 'Integrated Security=SSPI;' }
else { $connStr += 'User Id=' + $cfg.sql.user + ';Password=' + $cfg.sql.password + ';' }
$connStr += 'Encrypt=False;TrustServerCertificate=True;'

# ─── SQL queries ─────────────────────────────────────────────────────────────

$OrdersQuery = @"
SELECT
    LOWER(REPLACE(REPLACE(CAST(o.GUIDOrder         AS NVARCHAR(64)),'{',''),'}',''))  AS guid_order,
    CAST(o.OrderNumber                              AS NVARCHAR(50))                  AS order_number,
    CAST(o.OrderDate                                AS date)                           AS order_date,
    CAST(o.EntryDate                                AS date)                           AS entry_date,
    CAST(ISNULL(o.OrderStatus,     '')              AS NVARCHAR(50))                  AS order_status,
    LOWER(REPLACE(REPLACE(CAST(o.GUIDCustomer      AS NVARCHAR(64)),'{',''),'}',''))  AS guid_customer,
    LOWER(REPLACE(REPLACE(CAST(ISNULL(o.GUIDSalesperson,'00000000-0000-0000-0000-000000000000') AS NVARCHAR(64)),'{',''),'}','')) AS guid_salesperson,
    CAST(ISNULL(o.SalespersonID,   '')              AS NVARCHAR(100))                 AS rep1,
    CAST(ISNULL(o.Salesperson2ID,  '')              AS NVARCHAR(100))                 AS rep2,
    CAST(COALESCE(o.OrderTotal, 0)                  AS decimal(18,2))                 AS subtotal,
    CAST(ISNULL(o.CustomerID,      '')              AS NVARCHAR(100))                 AS customer_id,
    CAST(ISNULL(o.SoldToName,      '')              AS NVARCHAR(255))                 AS sold_to_name,
    CAST(ISNULL(o.ShipToDescription,'')             AS NVARCHAR(255))                 AS ship_to_description,
    CAST(ISNULL(o.BranchID,        '')              AS NVARCHAR(50))                  AS branch_id,
    CAST('$SourceTag'                               AS NVARCHAR(50))                  AS source
FROM dbo.[Order] o
WHERE o.OrderDate >= '$RangeStart'
  AND o.OrderDate <  '$RangeEnd'
ORDER BY o.OrderDate, o.OrderNumber
"@

$LinesQuery = @"
WITH src AS (
    SELECT
        LOWER(REPLACE(REPLACE(CAST(od.GUIDOrderDetail  AS NVARCHAR(64)),'{',''),'}',''))  AS guid_order_detail,
        LOWER(REPLACE(REPLACE(CAST(od.GUIDOrder        AS NVARCHAR(64)),'{',''),'}',''))  AS guid_order,
        CAST(o.OrderNumber                             AS NVARCHAR(50))                   AS order_number,
        CAST(od.LineNumber                              AS NVARCHAR(20))                  AS line_number,
        CAST(ISNULL(od.SubLineNumber,   0)             AS NVARCHAR(20))                   AS sub_line_number,
        CAST(ISNULL(od.ComponentLevel,  0)             AS NVARCHAR(20))                   AS component_level,
        CAST(ISNULL(od.ProductID,       '')            AS NVARCHAR(255))                  AS product_id,
        CAST(ISNULL(od.Description,     '')            AS NVARCHAR(500))                  AS description,
        CAST(COALESCE(od.QtyOrdered,    0)             AS decimal(18,4))                  AS qty_ordered,
        CAST(COALESCE(od.LineCancelled, 0)             AS bit)                            AS line_cancelled,
        CAST(COALESCE(od.Freight,       0)             AS decimal(18,2))                  AS freight,
        CAST(COALESCE(od.Amount,        0)             AS decimal(18,2))                  AS amount,
        CAST(COALESCE(od.FreightAmount, 0)             AS decimal(18,2))                  AS freight_amount,
        CAST(COALESCE(od.TariffAmount,  0)             AS decimal(18,2))                  AS tariff_amount,
        CAST(ISNULL(prod.SalesCategory, '')            AS NVARCHAR(100))                  AS sales_category,
        CAST(ISNULL(NULLIF(CAST(od.OriginalPrice AS NVARCHAR(50)),''),'') AS NVARCHAR(50)) AS original_price,
        CAST(COALESCE(od.LineDiscountPct,0)            AS decimal(18,4))                  AS line_discount_pct,
        LOWER(REPLACE(REPLACE(CAST(od.GUIDOrderDetail  AS NVARCHAR(64)),'{',''),'}',''))  AS source_guid_order_detail,
        CAST(o.OrderDate                               AS date)                           AS order_date,
        CAST(COALESCE(NULLIF(RTRIM(pc.Description),''), NULLIF(RTRIM(prod.ProductClassID),''),'') AS NVARCHAR(128)) AS product_class,
        $discCodeExpr                                                                     AS discount_code,
        CAST('$SourceTag'                              AS NVARCHAR(50))                   AS source,
        ROW_NUMBER() OVER (
            PARTITION BY od.GUIDOrder, od.LineNumber, od.SubLineNumber,
                         od.ComponentLevel, od.ProductID, od.GUIDOrderDetail
            ORDER BY od.QtyOrdered, od.Amount, od.ProductID
        ) AS duplicate_row_ordinal
    FROM dbo.OrderDetail od
    INNER JOIN dbo.[Order] o
        ON od.GUIDOrder = o.GUIDOrder
    LEFT JOIN dbo.Product prod
        ON od.ProductID = prod.ProductID
    LEFT JOIN dbo.ProductClass pc
        ON pc.ProductClassID = prod.ProductClassID
    WHERE o.OrderDate >= '$RangeStart'
      AND o.OrderDate <  '$RangeEnd'
)
SELECT * FROM src
ORDER BY order_date, guid_order, line_number, sub_line_number, component_level
"@

# ─── Column whitelists (match portal_acctivate_* schema exactly) ──────────────

$OrderAllowedCols = @{
    'guid_order'          = 1; 'order_number'       = 1; 'order_date'        = 1
    'entry_date'          = 1; 'order_status'       = 1; 'guid_customer'     = 1
    'guid_salesperson'    = 1; 'rep1'               = 1; 'rep2'              = 1
    'subtotal'            = 1; 'synced_at'          = 1; 'customer_id'       = 1
    'sold_to_name'        = 1; 'ship_to_description'= 1; 'source'            = 1
    'branch_id'           = 1
}

$LineAllowedCols = @{
    'guid_order_detail'        = 1; 'guid_order'            = 1
    'line_number'              = 1; 'product_id'            = 1
    'description'              = 1; 'qty_ordered'           = 1
    'line_cancelled'           = 1; 'freight'               = 1
    'amount'                   = 1; 'freight_amount'        = 1
    'tariff_amount'            = 1; 'sales_category'        = 1
    'original_price'           = 1; 'line_discount_pct'     = 1
    'source_guid_order_detail' = 1; 'sub_line_number'       = 1
    'component_level'          = 1; 'duplicate_row_ordinal' = 1
    'natural_key'              = 1; 'source'                = 1
    'order_date'               = 1; 'synced_at'             = 1
    'product_class'            = 1; 'discount_code'         = 1
}

# ─── Helpers ─────────────────────────────────────────────────────────────────

function Invoke-Sql {
    param([string]$SqlQuery)
    $conn = New-Object System.Data.SqlClient.SqlConnection($connStr)
    $conn.Open()
    try {
        $cmd = $conn.CreateCommand(); $cmd.CommandText = $SqlQuery; $cmd.CommandTimeout = $SqlTimeout
        $reader = $cmd.ExecuteReader()
        $rows = New-Object System.Collections.Generic.List[hashtable]
        while ($reader.Read()) {
            $row = @{}
            for ($i = 0; $i -lt $reader.FieldCount; $i++) {
                $v = $reader.GetValue($i); $row[$reader.GetName($i)] = if ($v -is [System.DBNull]) { $null } else { $v }
            }
            $rows.Add($row) | Out-Null
        }
        return ,$rows.ToArray()
    } finally { $conn.Close() }
}

function Clean-Value {
    param($Val)
    if ($null -eq $Val) { return $null }
    if ($Val -is [string]) {
        $s = $Val -replace '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', ''
        return [System.Text.RegularExpressions.Regex]::Replace($s, '[\uD800-\uDFFF]', '')
    }
    if ($Val -is [datetime]) { return $Val.ToString('yyyy-MM-dd') }
    if ($Val -is [System.Decimal] -or $Val -is [double] -or $Val -is [float]) {
        $d = [double]$Val; if ([double]::IsNaN($d) -or [double]::IsInfinity($d)) { return $null }; return $d
    }
    if ($Val -is [System.Int32] -or $Val -is [System.Int64] -or $Val -is [int] -or $Val -is [long]) { return [long]$Val }
    return $Val.ToString()
}

function Clean-Row {
    param([hashtable]$Row, [hashtable]$Allowed)
    $out = @{}
    foreach ($k in $Row.Keys) {
        if ($Allowed.ContainsKey($k)) { $out[$k] = Clean-Value $Row[$k] }
    }
    return $out
}

function Get-NetBookingAmount {
    param([hashtable]$Row)
    $op = if ($null -ne $Row['original_price']) { $Row['original_price'].ToString().Trim() } else { '' }
    if ($op -ne '' -and [double]::TryParse($op, [ref]$null)) {
        $opNum = [double]$op
        if ($opNum -ne 0.0) {
            $qty  = if ($null -ne $Row['qty_ordered']) { [double]$Row['qty_ordered'] } else { 0.0 }
            $disc = if ($null -ne $Row['line_discount_pct']) { [double]$Row['line_discount_pct'] } else { 0.0 }
            return $qty * $opNum * (1.0 - $disc / 100.0)
        }
    }
    $amt    = if ($null -ne $Row['amount'])         { [double]$Row['amount']         } else { 0.0 }
    $freight= if ($null -ne $Row['freight_amount']) { [double]$Row['freight_amount'] } else { 0.0 }
    $tariff = if ($null -ne $Row['tariff_amount'])  { [double]$Row['tariff_amount']  } else { 0.0 }
    return $amt - $freight - $tariff
}

function Write-Section { param([string]$T)
    Write-Host ''; Write-Host ('─── '+$T+' '+('─'*[Math]::Max(0,56-$T.Length))) -ForegroundColor Cyan
}

$DelHeaders = @{ 'apikey'=$ServiceKey; 'Authorization'='Bearer '+$ServiceKey; 'Content-Type'='application/json'; 'Prefer'='return=minimal' }

function Invoke-Delete {
    param([string]$Url, [string]$Label)
    Write-Host ('  Deleting '+$Label+'...') -ForegroundColor Yellow
    for ($a = 1; $a -le $MaxRetries; $a++) {
        try {
            $r = Invoke-WebRequest -Method Delete -Uri $Url -Headers $DelHeaders -TimeoutSec $RequestTimeout -UseBasicParsing
            Write-Host ('    -> HTTP '+[int]$r.StatusCode+'  ok') -ForegroundColor Green; return
        } catch {
            if ($a -ge $MaxRetries) { throw ('DELETE ['+$Label+'] failed: '+$_.Exception.Message) }
            Write-Warning ('    Attempt '+$a+'/'+$MaxRetries+' failed — retrying in '+$RetryDelay+'s'); Start-Sleep -Seconds $RetryDelay
        }
    }
}

function Post-Json {
    param([string]$Url, [string]$Body)
    $headers = @{
        'apikey'='Bearer '+$ServiceKey; 'Authorization'='Bearer '+$ServiceKey
        'Content-Type'='application/json'; 'Prefer'='resolution=merge-duplicates,return=minimal'
    }
    $headers['apikey'] = $ServiceKey
    for ($attempt = 1; $attempt -le $MaxRetries; $attempt++) {
        try {
            Invoke-RestMethod -Method Post -Uri $Url -Headers $headers -Body $Body -TimeoutSec $RequestTimeout | Out-Null
            return $true
        } catch {
            if ($attempt -lt $MaxRetries) { Start-Sleep -Seconds $RetryDelay }
        }
    }
    return $false
}

$ExcludedCats = @('FREIGHTO','MISC','SALESTAX','TARIFF')
$MonthNames   = @{ 1='Jan';2='Feb';3='Mar';4='Apr';5='May';6='Jun';7='Jul' }

# ── Discount code field ───────────────────────────────────────────────────────
# Confirmed in SSMS: dbo.OrderDetail._DiscType holds the Acctivate Disc Code.
# Labor Day promo lines have _DiscType = 'LD26'. PriceCode ('NS'/'SD') is unrelated.
$discCodeExpr = "CAST(NULLIF(RTRIM(ISNULL(od._DiscType, '')), '') AS NVARCHAR(50))"

# ─── Main ─────────────────────────────────────────────────────────────────────

Write-Host ''
Write-Host ('=== Jan–Jul Booking Backfill  '+(Get-Date -Format 'yyyy-MM-dd HH:mm')+' ===') -ForegroundColor Yellow
Write-Host ('Server : '+$cfg.sql.server+' / '+$cfg.sql.database)
Write-Host ('Range  : '+$RangeStart+' through 2026-07-31')
Write-Host ('Source : '+$SourceTag)

# ─── Pull orders from Acctivate ───────────────────────────────────────────────

Write-Host ''; Write-Host 'Querying Acctivate — orders...' -ForegroundColor Cyan
$allOrders = Invoke-Sql -SqlQuery $OrdersQuery
$pulledOrders = $allOrders.Count
Write-Host ('  '+$pulledOrders+' orders returned') -ForegroundColor Green

# ─── Pull order lines from Acctivate ─────────────────────────────────────────

Write-Host 'Querying Acctivate — order lines...' -ForegroundColor Cyan
$allLines = Invoke-Sql -SqlQuery $LinesQuery
$pulledLines = $allLines.Count
Write-Host ('  '+$pulledLines+' order lines returned') -ForegroundColor Green

if ($pulledOrders -eq 0 -and $pulledLines -eq 0) { Write-Warning 'No rows returned from Acctivate.'; exit 0 }

# ─── Build natural_keys for lines ─────────────────────────────────────────────
# natural_key = order_number-line_number-sub_line_number-component_level-product_id-source_guid_order_detail-duplicate_row_ordinal

foreach ($row in $allLines) {
    $p1 = if ($null -ne $row['order_number'])            { $row['order_number'].ToString()            } else { '' }
    $p2 = if ($null -ne $row['line_number'])              { $row['line_number'].ToString()              } else { '' }
    $p3 = if ($null -ne $row['sub_line_number'])          { $row['sub_line_number'].ToString()          } else { '' }
    $p4 = if ($null -ne $row['component_level'])          { $row['component_level'].ToString()          } else { '' }
    $p5 = if ($null -ne $row['product_id'])               { $row['product_id'].ToString()               } else { '' }
    $p6 = if ($null -ne $row['source_guid_order_detail']) { $row['source_guid_order_detail'].ToString() } else { '' }
    $p7 = if ($null -ne $row['duplicate_row_ordinal'])    { $row['duplicate_row_ordinal'].ToString()    } else { '1' }
    $row['natural_key'] = $p1+'-'+$p2+'-'+$p3+'-'+$p4+'-'+$p5+'-'+$p6+'-'+$p7
}

# Natural key uniqueness check for lines
$keyCounts = @{}
foreach ($r in $allLines) { $k=$r['natural_key']; if ($keyCounts.ContainsKey($k)) { $keyCounts[$k]++ } else { $keyCounts[$k]=1 } }
$distinctNK = $keyCounts.Count; $dupNKCount = $pulledLines - $distinctNK
Write-Host ('  Distinct natural_keys: '+$distinctNK+'   Duplicates: '+$dupNKCount)
if ($dupNKCount -gt 0) {
    Write-Host 'DUPLICATE natural_keys (first 10):' -ForegroundColor Red
    $shown=0; foreach ($e in $keyCounts.GetEnumerator()) { if ($e.Value -gt 1) { Write-Host ('  '+$e.Key+'  ('+$e.Value+')') -ForegroundColor Red; $shown++; if ($shown -ge 10) { break } } }
    throw ('ABORT: '+$dupNKCount+' duplicate natural_keys. Fix before uploading.')
}
Write-Host '  All natural_keys are distinct.' -ForegroundColor Green

# ─── Diagnostics ─────────────────────────────────────────────────────────────

Write-Section 'BOOKING AMOUNTS — Andrew formula (non-cancelled lines)'
$byCat=@{}; $byMonth=@{}; for ($m=1;$m-le7;$m++) { $byMonth[$m]=@{amt=0.0;cnt=0} }
$netTotal=0.0; $netCount=0; $cancelledCount=0
foreach ($r in $allLines) {
    $cancelled = $r['line_cancelled']
    if ($cancelled -eq $true -or $cancelled -eq 1 -or $cancelled -eq '1' -or $cancelled -eq 'True') { $cancelledCount++; continue }
    $cat = if ($null -ne $r['sales_category']) { $r['sales_category'].ToString().Trim() } else { '' }
    $amt = Get-NetBookingAmount -Row $r
    if (-not $byCat.ContainsKey($cat)) { $byCat[$cat]=@{amt=0.0;cnt=0} }
    $byCat[$cat].amt+=$amt; $byCat[$cat].cnt++
    if ($null -ne $r['order_date']) {
        $mn=[int]([datetime]::Parse($r['order_date'].ToString())).Month
        if ($mn -ge 1 -and $mn -le 7) { $byMonth[$mn].amt+=$amt; $byMonth[$mn].cnt++ }
    }
    $netTotal+=$amt; $netCount++
}
Write-Host ('  Non-cancelled lines : '+$netCount+'   Cancelled: '+$cancelledCount)
Write-Host ('  Net booking amount  : '+$netTotal.ToString('N2')) -ForegroundColor Green

Write-Section 'BY MONTH — net_booking_amount (non-cancelled)'
$ytdTotal=0.0
for ($m=1;$m-le7;$m++) {
    $ytdTotal+=$byMonth[$m].amt
    Write-Host ('  2026-'+$MonthNames[$m]+'    '+$byMonth[$m].amt.ToString('N2').PadLeft(14)+'  '+$byMonth[$m].cnt.ToString().PadLeft(7)+' lines')
}
Write-Host ('  YTD Jan–Jul        '+$ytdTotal.ToString('N2').PadLeft(14)+'  '+$netCount.ToString().PadLeft(7)+' lines') -ForegroundColor Green

Write-Section 'BY SalesCategory — net_booking_amount (non-cancelled)'
foreach ($e in ($byCat.GetEnumerator() | Sort-Object { [Math]::Abs($_.Value.amt) } -Descending)) {
    $lbl = if ($e.Key -eq '') { '(blank)' } else { $e.Key }
    $isExcl = $ExcludedCats -contains $e.Key
    $color = if ($isExcl) { 'DarkGray' } else { 'White' }
    Write-Host ('  '+$lbl.PadRight(16)+$e.Value.amt.ToString('N2').PadLeft(14)+'  '+$e.Value.cnt.ToString().PadLeft(6)+' lines'+(if ($isExcl) { ' [view-excluded]' } else { '' })) -ForegroundColor $color
}

# ─── Pre-flight: check existing Jan–Jul booking rows ─────────────────────────

Write-Section 'PRE-FLIGHT'

$chkHdrs = @{ 'apikey'=$ServiceKey; 'Authorization'='Bearer '+$ServiceKey; 'Accept'='application/json'; 'Prefer'='count=exact' }

# Count Jan–Jul order lines by source
$linesChkUrl = $SupabaseUrl+'/rest/v1/portal_acctivate_order_lines?select=source&order_date=gte.'+$RangeStart+'&order_date=lt.'+$RangeEnd+'&limit=1'
$existingLineCount = -1
try {
    $r = Invoke-WebRequest -Method Get -Uri $linesChkUrl -Headers $chkHdrs -TimeoutSec $RequestTimeout -UseBasicParsing
    $cr = $r.Headers['Content-Range']; if ($cr -and $cr -match '/(\d+)') { $existingLineCount=[int]$Matches[1] }
} catch { Write-Warning ('Could not count existing order lines: '+$_.Exception.Message) }

# Count Jan–Jul orders
$ordersChkUrl = $SupabaseUrl+'/rest/v1/portal_acctivate_orders?select=order_date&order_date=gte.'+$RangeStart+'&order_date=lt.'+$RangeEnd+'&limit=1'
$existingOrderCount = -1
try {
    $r = Invoke-WebRequest -Method Get -Uri $ordersChkUrl -Headers $chkHdrs -TimeoutSec $RequestTimeout -UseBasicParsing
    $cr = $r.Headers['Content-Range']; if ($cr -and $cr -match '/(\d+)') { $existingOrderCount=[int]$Matches[1] }
} catch { Write-Warning ('Could not count existing orders: '+$_.Exception.Message) }

if ($existingOrderCount -gt 0) {
    Write-Host ('  Found '+$existingOrderCount+' existing Jan–Jul orders in portal_acctivate_orders') -ForegroundColor Yellow
} else { Write-Host '  No existing Jan–Jul orders found.' -ForegroundColor Green }
if ($existingLineCount -gt 0) {
    Write-Host ('  Found '+$existingLineCount+' existing Jan–Jul order lines in portal_acctivate_order_lines') -ForegroundColor Yellow
    Write-Host '  These will be deleted and replaced with the fresh Jan–Jul pull.'
} else { Write-Host '  No existing Jan–Jul order lines found.' -ForegroundColor Green }

Write-Host '  August rows (order_date >= 2026-08-01) are NOT touched.' -ForegroundColor Green
Write-Host ''
$ans = Read-Host ('DELETE existing Jan–Jul rows and upload '+$pulledOrders+' orders + '+$pulledLines+' order lines? (yes/no)')
if ($ans -notmatch '^y(es)?$') { Write-Host 'Aborted. Nothing changed.' -ForegroundColor Red; exit 1 }

# ─── Delete (order lines first, then orders) ──────────────────────────────────

Write-Host ''; Write-Host 'Clearing Jan–Jul booking rows before upload...' -ForegroundColor Cyan

# Delete order lines first (foreign-key safe)
Invoke-Delete -Url ($SupabaseUrl+'/rest/v1/portal_acctivate_order_lines?order_date=gte.'+$RangeStart+'&order_date=lt.'+$RangeEnd) `
              -Label 'Jan–Jul order lines'

# Delete orders
Invoke-Delete -Url ($SupabaseUrl+'/rest/v1/portal_acctivate_orders?order_date=gte.'+$RangeStart+'&order_date=lt.'+$RangeEnd) `
              -Label 'Jan–Jul orders'

# ─── Phase 1: Upload orders ───────────────────────────────────────────────────

$OrdersUrl = $SupabaseUrl+'/rest/v1/portal_acctivate_orders?on_conflict=guid_order'

$now = (Get-Date).ToString('yyyy-MM-ddTHH:mm:ssZ')
foreach ($row in $allOrders) { $row['synced_at'] = $now }

Write-Host ''; Write-Host ('Phase 1 — uploading '+$pulledOrders+' orders...') -ForegroundColor Cyan
$uploadedOrders=0; $orderFails=0

for ($i=0; $i -lt $pulledOrders; $i+=$BatchSize) {
    $last=[Math]::Min($i+$BatchSize-1,$pulledOrders-1); $chunk=$allOrders[$i..$last]
    $body=@($chunk | ForEach-Object { Clean-Row -Row $_ -Allowed $OrderAllowedCols }) | ConvertTo-Json -Depth 5 -Compress
    if (Post-Json -Url $OrdersUrl -Body $body) {
        $uploadedOrders+=$chunk.Count
        if (($i/$BatchSize)%20 -eq 0 -or ($last+1) -eq $pulledOrders) { Write-Host ('  orders '+($i+1)+'-'+($last+1)+'/'+$pulledOrders+'  ok') -ForegroundColor DarkCyan }
    } else {
        $orderFails++; Write-Warning ('  orders batch '+($i+1)+'-'+($last+1)+' failed; retrying row by row...')
        foreach ($row in $chunk) {
            $rb=@(Clean-Row -Row $row -Allowed $OrderAllowedCols) | ConvertTo-Json -Depth 5 -Compress
            if (Post-Json -Url $OrdersUrl -Body $rb) { $uploadedOrders++ }
            else { Write-Warning ('    FAILED guid_order='+$row['guid_order']) }
        }
    }
}
Write-Host ('  '+$uploadedOrders+' of '+$pulledOrders+' orders uploaded') -ForegroundColor Green

# ─── Phase 2: Upload order lines ─────────────────────────────────────────────

$LinesUrl = $SupabaseUrl+'/rest/v1/portal_acctivate_order_lines?on_conflict=guid_order_detail'

foreach ($row in $allLines) { $row['synced_at'] = $now }

Write-Host ''; Write-Host ('Phase 2 — uploading '+$pulledLines+' order lines...') -ForegroundColor Cyan
$uploadedLines=0; $lineFails=0

for ($i=0; $i -lt $pulledLines; $i+=$BatchSize) {
    $last=[Math]::Min($i+$BatchSize-1,$pulledLines-1); $chunk=$allLines[$i..$last]
    $body=@($chunk | ForEach-Object { Clean-Row -Row $_ -Allowed $LineAllowedCols }) | ConvertTo-Json -Depth 5 -Compress
    if (Post-Json -Url $LinesUrl -Body $body) {
        $uploadedLines+=$chunk.Count
        if (($i/$BatchSize)%20 -eq 0 -or ($last+1) -eq $pulledLines) { Write-Host ('  lines '+($i+1)+'-'+($last+1)+'/'+$pulledLines+'  ok') -ForegroundColor DarkCyan }
    } else {
        $lineFails++; Write-Warning ('  lines batch '+($i+1)+'-'+($last+1)+' failed; retrying row by row...')
        foreach ($row in $chunk) {
            $rb=@(Clean-Row -Row $row -Allowed $LineAllowedCols) | ConvertTo-Json -Depth 5 -Compress
            if (Post-Json -Url $LinesUrl -Body $rb) { $uploadedLines++ }
            else { Write-Warning ('    FAILED natural_key='+$row['natural_key']) }
        }
    }
}
Write-Host ('  '+$uploadedLines+' of '+$pulledLines+' order lines uploaded') -ForegroundColor Green

# ─── Final summary ────────────────────────────────────────────────────────────

Write-Host ''
Write-Host '============================================================' -ForegroundColor Green
Write-Host ' JAN–JUL BOOKING BACKFILL COMPLETE' -ForegroundColor Green
Write-Host '============================================================' -ForegroundColor Green
Write-Host (' Orders  pulled / uploaded   : '+$pulledOrders+' / '+$uploadedOrders)
Write-Host (' Lines   pulled / uploaded   : '+$pulledLines+' / '+$uploadedLines)
Write-Host (' Order   batch fails         : '+$orderFails)
Write-Host (' Line    batch fails         : '+$lineFails)
Write-Host ''
Write-Host (' Jan–Jul net booking YTD     : '+$ytdTotal.ToString('N2')) -ForegroundColor Green
Write-Host ' (Dealer/Rep Reporting will show this total for Jan–Jul bookings)' -ForegroundColor DarkCyan
Write-Host ''
Write-Host ' VALIDATION — run in Supabase SQL Editor:' -ForegroundColor Yellow
Write-Host "   -- Booking lines in view"
Write-Host '   SELECT metric_type, ROUND(SUM(amount),2) AS total, COUNT(*) AS lines'
Write-Host '   FROM public.v_portal_dealer_rep_reporting_lines'
Write-Host "   WHERE metric_type='booked' AND transaction_date BETWEEN '2026-01-01' AND '2026-07-31'"
Write-Host '   GROUP BY metric_type;'
Write-Host ''
Write-Host '   -- Raw order lines check'
Write-Host "   SELECT COUNT(*) AS lines, ROUND(SUM("
Write-Host "     CASE WHEN original_price IS NOT NULL AND original_price::numeric != 0"
Write-Host "       THEN qty_ordered::numeric * original_price::numeric * (1 - COALESCE(line_discount_pct::numeric,0)/100)"
Write-Host "       ELSE amount::numeric - COALESCE(tariff_amount::numeric,0) - COALESCE(freight_amount::numeric,0)"
Write-Host "     END),2) AS net_amount"
Write-Host '   FROM public.portal_acctivate_order_lines'
Write-Host "   WHERE order_date >= ''2026-01-01'' AND order_date < ''2026-08-01''"
Write-Host "     AND NOT COALESCE(line_cancelled, false);"
Write-Host ''
Write-Host ('============================================================') -ForegroundColor Green
Write-Host (' Finished '+(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')) -ForegroundColor Green
