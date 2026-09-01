<#
.SYNOPSIS
    Syncs open Sales Orders from Acctivate into Supabase.

.DESCRIPTION
    Pulls all open SOs from dbo.Orders + dbo.OrderDetail where orders are open
    (Scheduled, Backordered, Booked, Open — not Completed, Cancelled, or Void).
    Dynamically discovers column names so the script adapts to Acctivate schema
    differences across versions.

    Phase 1 — Clears existing rows then upserts SO headers into:
               public.acctivate_open_sales_orders (on_conflict = guid_order)

    Phase 2 — Clears existing rows then upserts SO lines into:
               public.acctivate_open_sales_order_lines (on_conflict = guid_order_detail)

    Safety:
      • Aborts without touching Supabase if Acctivate returns 0 rows.
      • Preflight-tests one row before the bulk upload.
      • Clears stale rows (orders that closed since last sync) via DELETE before upload.
      • Non-zero exit on any failure.

    Config: C:\AcctivateKPI\kpi.config.json
    Schedule: 5:00 AM and 5:00 PM EST daily (see register-open-orders-tasks.ps1)

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File "C:\AcctivateKPI\sync-open-sales-orders.ps1"
#>

[CmdletBinding()]
param(
    [string]$ConfigPath = (Join-Path $PSScriptRoot 'kpi.config.json')
)

$ErrorActionPreference = 'Stop'
$script:ExitCode = 0

# ── Config ─────────────────────────────────────────────────────────────────────

if (-not (Test-Path $ConfigPath)) {
    Write-Error "Config not found: $ConfigPath"
    exit 1
}

$cfg = Get-Content $ConfigPath -Raw | ConvertFrom-Json

$SupabaseUrl    = $cfg.supabaseUrl.TrimEnd('/')
$ServiceKey     = $cfg.serviceRoleKey
$BatchSize      = if ($cfg.batchSize)                { [int]$cfg.batchSize }                else { 100 }
$MaxRetries     = if ($cfg.maxRetries)               { [int]$cfg.maxRetries }               else { 3 }
$RetryDelay     = if ($cfg.retryDelaySeconds)        { [int]$cfg.retryDelaySeconds }        else { 10 }
$RequestTimeout = if ($cfg.requestTimeoutSec)        { [int]$cfg.requestTimeoutSec }        else { 60 }
$SqlTimeout     = if ($cfg.sql.commandTimeoutSeconds){ [int]$cfg.sql.commandTimeoutSeconds } else { 600 }

if (-not $SupabaseUrl -or -not $ServiceKey) {
    Write-Error "supabaseUrl and serviceRoleKey are required in $ConfigPath"
    exit 1
}

$connStr = 'Server=' + $cfg.sql.server + ';Database=' + $cfg.sql.database + ';Connection Timeout=30;'
if ($cfg.sql.integratedSecurity) {
    $connStr += 'Integrated Security=SSPI;'
} else {
    $connStr += 'User Id=' + $cfg.sql.user + ';Password=' + $cfg.sql.password + ';'
}
$connStr += 'Encrypt=False;TrustServerCertificate=True;'

# ── Helpers ────────────────────────────────────────────────────────────────────

function Invoke-Sql {
    param([string]$SqlQuery, [int]$TimeoutSec = $SqlTimeout)
    $conn = New-Object System.Data.SqlClient.SqlConnection($connStr)
    $conn.Open()
    try {
        $cmd             = $conn.CreateCommand()
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

function Get-Columns {
    param([string]$Table, [string]$Schema = 'dbo')
    $rows = Invoke-Sql -SqlQuery "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='$Schema' AND TABLE_NAME='$Table' ORDER BY ORDINAL_POSITION" -TimeoutSec 30
    return @($rows | ForEach-Object { [string]$_['COLUMN_NAME'] })
}

function Pick-Col {
    param([string[]]$Cols, [string[]]$Candidates)
    foreach ($c in $Candidates) {
        $m = $Cols | Where-Object { $_ -ieq $c } | Select-Object -First 1
        if ($m) { return [string]$m }
    }
    return $null
}

function Q { param([string]$Name); return '[' + $Name.Replace(']',']]') + ']' }

function Clean-Value {
    param($Val)
    if ($null -eq $Val -or $Val -is [System.DBNull]) { return $null }
    if ($Val -is [bool])   { return [bool]$Val }
    if ($Val -is [string]) { return ($Val -replace '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '') }
    if ($Val -is [datetime] -or $Val -is [System.DateTimeOffset]) {
        return $Val.ToString('yyyy-MM-ddTHH:mm:ss')
    }
    if ($Val -is [System.Int32] -or $Val -is [System.Int64] -or $Val -is [int] -or $Val -is [long]) {
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

function Convert-RowsToJsonArray {
    param([array]$Rows)
    $items = @()
    foreach ($row in @($Rows)) { $items += ($row | ConvertTo-Json -Depth 10 -Compress) }
    return '[' + ($items -join ',') + ']'
}

function Invoke-Post {
    param([string]$Url, [array]$Rows)
    $json      = Convert-RowsToJsonArray -Rows @($Rows)
    $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $headers   = @{
        'apikey'        = $ServiceKey
        'Authorization' = 'Bearer ' + $ServiceKey
        'Prefer'        = 'resolution=merge-duplicates,return=minimal'
    }
    for ($attempt = 1; $attempt -le $MaxRetries; $attempt++) {
        try {
            Invoke-WebRequest -Uri $Url -Method Post -Headers $headers `
                -ContentType 'application/json; charset=utf-8' `
                -Body $bodyBytes -UseBasicParsing -TimeoutSec $RequestTimeout `
                -ErrorAction Stop | Out-Null
            return @{ ok = $true; statusCode = 200; body = '' }
        } catch {
            $code = 0; $body = $_.Exception.Message
            if ($null -ne $_.Exception.Response) {
                $code   = [int]$_.Exception.Response.StatusCode
                $stream = $_.Exception.Response.GetResponseStream()
                $reader = New-Object System.IO.StreamReader($stream)
                $body   = $reader.ReadToEnd(); $reader.Close()
            }
            if ($attempt -ge $MaxRetries) { return @{ ok = $false; statusCode = $code; body = $body } }
            Write-Warning ("  Attempt $attempt failed (HTTP $code): $body — retrying in ${RetryDelay}s")
            Start-Sleep -Seconds $RetryDelay
        }
    }
    return @{ ok = $false; statusCode = 0; body = 'Max retries exceeded' }
}

function Invoke-Delete {
    param([string]$Table)
    $url = $SupabaseUrl + '/rest/v1/' + $Table + '?source_synced_at=not.is.null'
    $headers = @{
        'apikey'        = $ServiceKey
        'Authorization' = 'Bearer ' + $ServiceKey
        'Prefer'        = 'return=minimal'
    }
    try {
        Invoke-RestMethod -Method Delete -Uri $url -Headers $headers -TimeoutSec 60 | Out-Null
        Write-Host "  Cleared existing rows from $Table" -ForegroundColor DarkGray
    } catch {
        Write-Warning "  Could not clear $Table (will upsert on top of existing): $($_.Exception.Message)"
    }
}

# ── Start ──────────────────────────────────────────────────────────────────────

Write-Host ''
Write-Host ('=== Open Sales Orders Sync  ' + (Get-Date -Format 'yyyy-MM-dd HH:mm')) + ' ===' -ForegroundColor Yellow
Write-Host ('Server  : ' + $cfg.sql.server + ' / ' + $cfg.sql.database)
Write-Host ''

# ── Column discovery ───────────────────────────────────────────────────────────

Write-Host 'Discovering Acctivate schema...' -ForegroundColor Cyan

$orderCols  = Get-Columns -Table 'Orders'
$detailCols = Get-Columns -Table 'OrderDetail'

if (-not $orderCols -or $orderCols.Count -eq 0) {
    Write-Error 'Could not read columns from dbo.Orders. Check SQL Server connection.'
    exit 1
}
if (-not $detailCols -or $detailCols.Count -eq 0) {
    Write-Error 'Could not read columns from dbo.OrderDetail.'
    exit 1
}

# dbo.Orders column mapping
$oGuidOrderCol       = Pick-Col $orderCols @('GUIDOrder','OrderGUID','Guid')
$oOrderNumCol        = Pick-Col $orderCols @('OrderNumber','OrderNo','Order_Number')
$oOrderTypeCol       = Pick-Col $orderCols @('OrderType','Type','OrderKind')
$oStatusCol          = Pick-Col $orderCols @('OrderStatus','Status','OrderState')
$oOrderDateCol       = Pick-Col $orderCols @('OrderDate','DateOrdered','Date')
$oEntryDateCol       = Pick-Col $orderCols @('EntryDate','DateEntered','CreateDate')
$oShipDateCol        = Pick-Col $orderCols @('RequestedShipDate','ShipDate','PromisedDate','RequestShipDate','DateShip')
$oSchedShipDateCol   = Pick-Col $orderCols @('ScheduledShipDate','SchedShipDate','ScheduledDate')
$oCustomerIdCol      = Pick-Col $orderCols @('CustomerID','CustomerCode','CustID')
$oGuidCustomerCol    = Pick-Col $orderCols @('GUIDCustomer','CustomerGUID')
$oGuidSalespersonCol = Pick-Col $orderCols @('GUIDSalesperson','SalespersonGUID','GUIDRep')
$oSalesRepIdCol      = Pick-Col $orderCols @('SalespersonID','SalesRepID','RepID','_Rep1','Rep1')
$oRepNameCol         = Pick-Col $orderCols @('SoldToName','SoldBy','RepName','_Rep1')
$oBranchCol          = Pick-Col $orderCols @('BranchID','Branch','LocationID')
$oWarehouseCol       = Pick-Col $orderCols @('WarehouseID','Warehouse','WH')
$oSubtotalCol        = Pick-Col $orderCols @('SubTotal','Total','OrderTotal','Amount')
$oFreightCol         = Pick-Col $orderCols @('FreightAmount','Freight','FreightTotal')
$oTariffCol          = Pick-Col $orderCols @('TariffAmount','Tariff','_TariffAmt')

# dbo.OrderDetail column mapping
$dGuidDetailCol  = Pick-Col $detailCols @('GUIDOrderDetail','DetailGUID','GUIDDetail')
$dGuidOrderCol   = Pick-Col $detailCols @('GUIDOrder','OrderGUID')
$dOrderNumCol    = Pick-Col $detailCols @('OrderNumber','OrderNo')
$dStatusCol      = Pick-Col $detailCols @('OrderStatus','LineStatus','Status')
$dOrderDateCol   = Pick-Col $detailCols @('OrderDate','DateOrdered','Date')
$dShipDateCol    = Pick-Col $detailCols @('RequestedShipDate','ShipDate','PromisedDate','RequestShipDate')
$dCustIdCol      = Pick-Col $detailCols @('CustomerID','CustomerCode','CustID')
$dWarehouseCol   = Pick-Col $detailCols @('WarehouseID','Warehouse','WH')
$dProductIdCol   = Pick-Col $detailCols @('ProductID','SKU','ItemID','ProductCode')
$dDescCol        = Pick-Col $detailCols @('Description','ItemDescription','ProductDesc')
$dClassCol       = Pick-Col $detailCols @('ProductClassID','ProductClass','ClassID')
$dCategoryCol    = Pick-Col $detailCols @('SalesCategory','Category','SalesCat')
$dQtyOrderedCol  = Pick-Col $detailCols @('QtyOrdered','QuantityOrdered','Qty','QtyOrder')
$dQtyShippedCol  = Pick-Col $detailCols @('QtyShipped','QuantityShipped','QtyShip')
$dQtyInvoicedCol = Pick-Col $detailCols @('QtyInvoiced','QuantityInvoiced','QtyInvoice')
$dPriceCol       = Pick-Col $detailCols @('_OriginalPrice','OriginalPrice','UnitPrice','Price')
$dDiscPctCol     = Pick-Col $detailCols @('LineDiscountPct','DiscountPct','Discount','LinePct')
$dAmountCol      = Pick-Col $detailCols @('Amount','ExtendedAmount','LineTotal','LineAmount')
$dTariffCol      = Pick-Col $detailCols @('_TariffAmt','TariffAmount','Tariff')
$dFreightCol     = Pick-Col $detailCols @('_FreightAmt','FreightAmount','Freight')

if (-not $oGuidOrderCol) { Write-Error 'Cannot map GUIDOrder column on dbo.Orders.'; exit 1 }
if (-not $dGuidDetailCol) { Write-Error 'Cannot map GUIDOrderDetail column on dbo.OrderDetail.'; exit 1 }
if (-not $dProductIdCol)  { Write-Error 'Cannot map ProductID column on dbo.OrderDetail.'; exit 1 }

Write-Host ('  dbo.Orders       : ' + $orderCols.Count + ' columns') -ForegroundColor DarkCyan
Write-Host ('  dbo.OrderDetail  : ' + $detailCols.Count + ' columns') -ForegroundColor DarkCyan
Write-Host ('  GUIDOrder col    : ' + $oGuidOrderCol) -ForegroundColor DarkCyan
Write-Host ('  GUIDDetail col   : ' + $dGuidDetailCol) -ForegroundColor DarkCyan
Write-Host ('  Status col       : ' + $(if ($oStatusCol) { $oStatusCol } else { '(not found)' })) -ForegroundColor DarkCyan
Write-Host ('  Ship date col    : ' + $(if ($oShipDateCol) { $oShipDateCol } else { '(not found)' })) -ForegroundColor DarkCyan

# ── Build WHERE clause for open orders ─────────────────────────────────────────
# Open = not Completed, not Cancelled, not Void. Also must have open qty on at least one line.

$openStatuses = "'Scheduled','Backordered','Booked','Open','Partial','In Progress'"

if ($oStatusCol) {
    $statusWhere = "(o.$(Q $oStatusCol) IN ($openStatuses) OR o.$(Q $oStatusCol) NOT IN ('Completed','Cancelled','Void','Closed','Complete'))"
} else {
    Write-Warning 'No status column found on dbo.Orders — including ALL orders. Review results.'
    $statusWhere = '1=1'
}

# ── Build SQL expressions ──────────────────────────────────────────────────────

function Expr-Clean { param([string]$Col, [string]$Alias, [string]$Type = 'NVARCHAR(256)', [string]$Default = "''")
    if ($Col) { return "CAST(ISNULL(o.$(Q $Col), $Default) AS $Type) AS $Alias" }
    else       { return "CAST($Default AS $Type) AS $Alias" }
}
function Expr-CleanD { param([string]$Col, [string]$Alias, [string]$Type = 'NVARCHAR(256)', [string]$Default = "''")
    if ($Col) { return "CAST(ISNULL(od.$(Q $Col), $Default) AS $Type) AS $Alias" }
    else       { return "CAST($Default AS $Type) AS $Alias" }
}
function Expr-Date { param([string]$Col, [string]$Src, [string]$Alias)
    if ($Col) { return "CONVERT(NVARCHAR(10), $Src.$(Q $Col), 23) AS $Alias" }
    else       { return "NULL AS $Alias" }
}
function Expr-Num { param([string]$Col, [string]$Src, [string]$Alias)
    if ($Col) { return "CAST(ISNULL($Src.$(Q $Col), 0) AS DECIMAL(18,4)) AS $Alias" }
    else       { return "CAST(0 AS DECIMAL(18,4)) AS $Alias" }
}

# ── Phase 1 SQL: Order headers ──────────────────────────────────────────────────

$guidExpr   = "LOWER(REPLACE(REPLACE(CAST(o.$(Q $oGuidOrderCol) AS NVARCHAR(64)), '{', ''), '}', '')) AS guid_order"
$orderNumExpr = if ($oOrderNumCol) { "CAST(o.$(Q $oOrderNumCol) AS NVARCHAR(64)) AS order_number" } else { "NULL AS order_number" }
$typeExpr     = if ($oOrderTypeCol) { "CAST(ISNULL(o.$(Q $oOrderTypeCol),'') AS NVARCHAR(50)) AS order_type" } else { "NULL AS order_type" }
$statusExpr   = if ($oStatusCol)    { "CAST(ISNULL(o.$(Q $oStatusCol),'') AS NVARCHAR(50)) AS order_status" } else { "NULL AS order_status" }

$orderDateExpr  = Expr-Date -Col $oOrderDateCol    -Src 'o' -Alias 'order_date'
$entryDateExpr  = Expr-Date -Col $oEntryDateCol    -Src 'o' -Alias 'entry_date'
$shipDateExpr   = Expr-Date -Col $oShipDateCol     -Src 'o' -Alias 'requested_ship_date'
$schedShipExpr  = Expr-Date -Col $oSchedShipDateCol -Src 'o' -Alias 'scheduled_ship_date'

$custIdExpr     = if ($oCustomerIdCol)      { "CAST(ISNULL(o.$(Q $oCustomerIdCol),'') AS NVARCHAR(100)) AS customer_id" } else { "NULL AS customer_id" }
$guidCustExpr   = if ($oGuidCustomerCol)    { "LOWER(REPLACE(REPLACE(CAST(o.$(Q $oGuidCustomerCol) AS NVARCHAR(64)), '{', ''), '}', '')) AS guid_customer" } else { "NULL AS guid_customer" }
$guidSpExpr     = if ($oGuidSalespersonCol) { "LOWER(REPLACE(REPLACE(CAST(o.$(Q $oGuidSalespersonCol) AS NVARCHAR(64)), '{', ''), '}', '')) AS guid_salesperson" } else { "NULL AS guid_salesperson" }
$salesRepIdExpr = if ($oSalesRepIdCol)      { "CAST(ISNULL(o.$(Q $oSalesRepIdCol),'') AS NVARCHAR(100)) AS sales_rep_id" } else { "NULL AS sales_rep_id" }
$repNameExpr    = if ($oRepNameCol)         { "CAST(ISNULL(o.$(Q $oRepNameCol),'') AS NVARCHAR(200)) AS rep_name" } else { "NULL AS rep_name" }
$branchExpr     = if ($oBranchCol)          { "CAST(ISNULL(o.$(Q $oBranchCol),'') AS NVARCHAR(50)) AS branch_id" } else { "NULL AS branch_id" }
$warehouseExpr  = if ($oWarehouseCol)       { "CAST(ISNULL(o.$(Q $oWarehouseCol),'') AS NVARCHAR(100)) AS warehouse" } else { "NULL AS warehouse" }
$subtotalExpr   = Expr-Num -Col $oSubtotalCol -Src 'o' -Alias 'subtotal'
$freightExpr    = Expr-Num -Col $oFreightCol  -Src 'o' -Alias 'freight_amount'
$tariffExpr     = Expr-Num -Col $oTariffCol   -Src 'o' -Alias 'tariff_amount'

# Need CustomerName: try dbo.Customer join
$custCols = Get-Columns -Table 'Customer'
$custNameCol = Pick-Col $custCols @('CustomerName','Name','CompanyName','SoldToName','ShipToName')
$custIdMatch = Pick-Col $custCols @('CustomerID','CustomerCode','CustID')

$dealerJoin = ''
$dealerExpr = "NULL AS dealer_name"
if ($custNameCol -and $custIdMatch -and $oCustomerIdCol) {
    $dealerJoin = "LEFT JOIN dbo.Customer cust ON cust.$(Q $custIdMatch) = o.$(Q $oCustomerIdCol)"
    $dealerExpr = "CAST(ISNULL(cust.$(Q $custNameCol), o.$(Q $oCustomerIdCol)) AS NVARCHAR(300)) AS dealer_name"
}

# Salesperson name: try joining dbo.Salesperson
$spCols    = Get-Columns -Table 'Salesperson' -ErrorAction SilentlyContinue
$spJoin    = ''
$spNameExp = if ($repNameExpr -notmatch 'NULL AS rep_name') { $repNameExpr } else { "NULL AS rep_name" }
if ($spCols -and $spCols.Count -gt 0 -and $oGuidSalespersonCol) {
    $spNameCol = Pick-Col $spCols @('SalespersonName','Name','FullName','RepName')
    $spGuidCol = Pick-Col $spCols @('GUIDSalesperson','SalespersonGUID')
    if ($spNameCol -and $spGuidCol) {
        $spJoin    = "LEFT JOIN dbo.Salesperson sp ON sp.$(Q $spGuidCol) = o.$(Q $oGuidSalespersonCol)"
        $spNameExp = "CAST(ISNULL(sp.$(Q $spNameCol), $(if ($oRepNameCol) { "o.$(Q $oRepNameCol)" } else { "''" })) AS NVARCHAR(200)) AS rep_name"
    }
}

$OrdersQuery = @"
SELECT DISTINCT
    $guidExpr,
    $orderNumExpr,
    $typeExpr,
    $statusExpr,
    $orderDateExpr,
    $entryDateExpr,
    $shipDateExpr,
    $schedShipExpr,
    $custIdExpr,
    $dealerExpr,
    $guidCustExpr,
    $guidSpExpr,
    $salesRepIdExpr,
    $spNameExp,
    $branchExpr,
    $warehouseExpr,
    $subtotalExpr,
    CAST(0 AS DECIMAL(18,4)) AS net_open_amount,
    $freightExpr,
    $tariffExpr,
    CAST('direct_sync' AS NVARCHAR(50)) AS source
FROM dbo.Orders o
$dealerJoin
$spJoin
WHERE $statusWhere
ORDER BY order_date, order_number
"@

# ── Phase 2 SQL: Order lines ───────────────────────────────────────────────────

# Discover ProductClass table for human-readable descriptions
$pcCols       = Get-Columns -Table 'ProductClass' -ErrorAction SilentlyContinue
$pcJoin       = ''
$pcDescExpr   = if ($dClassCol) { "CAST(ISNULL(od.$(Q $dClassCol),'') AS NVARCHAR(128))" } else { "CAST('' AS NVARCHAR(128))" }
if ($pcCols -and $pcCols.Count -gt 0) {
    $pcDescCol = Pick-Col $pcCols @('Description','ClassName','Name','ClassDesc')
    $pcIdCol   = Pick-Col $pcCols @('ProductClassID','ClassID','ProductClass')
    if ($pcDescCol -and $pcIdCol -and $dClassCol) {
        $pcJoin     = "LEFT JOIN dbo.ProductClass pc ON pc.$(Q $pcIdCol) = od.$(Q $dClassCol)"
        $pcDescExpr = "CAST(COALESCE(NULLIF(RTRIM(pc.$(Q $pcDescCol)),''), ISNULL(od.$(Q $dClassCol),'')) AS NVARCHAR(128))"
    }
}

$dGuidDetailExpr  = "LOWER(REPLACE(REPLACE(CAST(od.$(Q $dGuidDetailCol) AS NVARCHAR(64)), '{', ''), '}', '')) AS guid_order_detail"
$dGuidOrderExpr   = "LOWER(REPLACE(REPLACE(CAST(od.$(Q $dGuidOrderCol) AS NVARCHAR(64)), '{', ''), '}', '')) AS guid_order"
$dOrderNumExpr2   = if ($dOrderNumCol)    { "CAST(od.$(Q $dOrderNumCol) AS NVARCHAR(64)) AS order_number" } else { "NULL AS order_number" }
$dStatusExpr      = if ($dStatusCol)      { "CAST(ISNULL(od.$(Q $dStatusCol), o.$(Q $oStatusCol)) AS NVARCHAR(50)) AS order_status" } elseif ($oStatusCol) { "CAST(ISNULL(o.$(Q $oStatusCol),'') AS NVARCHAR(50)) AS order_status" } else { "NULL AS order_status" }
$dOrderDateExpr2  = Expr-Date -Col $dOrderDateCol   -Src 'o' -Alias 'order_date'
$dShipDateExpr2   = if ($dShipDateCol)    { "CONVERT(NVARCHAR(10), od.$(Q $dShipDateCol), 23) AS requested_ship_date" } elseif ($oShipDateCol) { "CONVERT(NVARCHAR(10), o.$(Q $oShipDateCol), 23) AS requested_ship_date" } else { "NULL AS requested_ship_date" }
$dCustIdExpr2     = if ($dCustIdCol)      { "CAST(ISNULL(od.$(Q $dCustIdCol),'') AS NVARCHAR(100)) AS customer_id" } elseif ($oCustomerIdCol) { "CAST(ISNULL(o.$(Q $oCustomerIdCol),'') AS NVARCHAR(100)) AS customer_id" } else { "NULL AS customer_id" }
$dDealerExpr2     = if ($custNameCol -and $custIdMatch -and ($dCustIdCol -or $oCustomerIdCol)) { "CAST(ISNULL(cust.$(Q $custNameCol), $(if ($dCustIdCol) { "od.$(Q $dCustIdCol)" } else { "o.$(Q $oCustomerIdCol)" })) AS NVARCHAR(300)) AS dealer_name" } else { "NULL AS dealer_name" }
$dWarehouseExpr2  = if ($dWarehouseCol)   { "CAST(ISNULL(od.$(Q $dWarehouseCol),'') AS NVARCHAR(100)) AS warehouse" } elseif ($oWarehouseCol) { "CAST(ISNULL(o.$(Q $oWarehouseCol),'') AS NVARCHAR(100)) AS warehouse" } else { "NULL AS warehouse" }
$dProductIdExpr   = "CAST(ISNULL(od.$(Q $dProductIdCol),'') AS NVARCHAR(200)) AS product_id"
$dDescExpr2       = if ($dDescCol)        { "CAST(ISNULL(od.$(Q $dDescCol),'') AS NVARCHAR(500)) AS description" } else { "NULL AS description" }
$dCategoryExpr    = if ($dCategoryCol)    { "CAST(ISNULL(od.$(Q $dCategoryCol),'') AS NVARCHAR(100)) AS sales_category" } else { "NULL AS sales_category" }

$dQtyOrdExpr   = Expr-Num -Col $dQtyOrderedCol  -Src 'od' -Alias 'qty_ordered'
$dQtyShipExpr  = Expr-Num -Col $dQtyShippedCol  -Src 'od' -Alias 'qty_shipped'
$dQtyInvExpr   = Expr-Num -Col $dQtyInvoicedCol -Src 'od' -Alias 'qty_invoiced'

# qty_open = qty_ordered - qty_shipped. Clamp to 0.
if ($dQtyOrderedCol -and $dQtyShippedCol) {
    $dQtyOpenExpr = "CAST(CASE WHEN ISNULL(od.$(Q $dQtyOrderedCol),0) - ISNULL(od.$(Q $dQtyShippedCol),0) < 0 THEN 0 ELSE ISNULL(od.$(Q $dQtyOrderedCol),0) - ISNULL(od.$(Q $dQtyShippedCol),0) END AS DECIMAL(18,4)) AS qty_open"
} elseif ($dQtyOrderedCol) {
    $dQtyOpenExpr = "CAST(ISNULL(od.$(Q $dQtyOrderedCol),0) AS DECIMAL(18,4)) AS qty_open"
} else {
    $dQtyOpenExpr = "CAST(0 AS DECIMAL(18,4)) AS qty_open"
}

$dPriceExpr    = Expr-Num -Col $dPriceCol   -Src 'od' -Alias 'original_price'
$dDiscPctExpr  = Expr-Num -Col $dDiscPctCol -Src 'od' -Alias 'line_discount_pct'
$dAmountExpr   = Expr-Num -Col $dAmountCol  -Src 'od' -Alias 'amount'
$dTariffExpr2  = Expr-Num -Col $dTariffCol  -Src 'od' -Alias 'tariff_amount'
$dFreightExpr2 = Expr-Num -Col $dFreightCol -Src 'od' -Alias 'freight_amount'

# Dealer join for lines (use same cust table)
$dCustJoin = ''
if ($custNameCol -and $custIdMatch) {
    $dCustSrcCol = if ($dCustIdCol) { "od.$(Q $dCustIdCol)" } elseif ($oCustomerIdCol) { "o.$(Q $oCustomerIdCol)" } else { $null }
    if ($dCustSrcCol) { $dCustJoin = "LEFT JOIN dbo.Customer cust ON cust.$(Q $custIdMatch) = $dCustSrcCol" }
}

# Rep name for lines
$dRepExpr = if ($spCols -and $spCols.Count -gt 0 -and $spNameCol -and $oGuidSalespersonCol) {
    "CAST(ISNULL(sp.$(Q $spNameCol), $(if ($oRepNameCol) { "o.$(Q $oRepNameCol)" } else { "''" })) AS NVARCHAR(200)) AS rep_name"
} elseif ($oRepNameCol) {
    "CAST(ISNULL(o.$(Q $oRepNameCol),'') AS NVARCHAR(200)) AS rep_name"
} else { "NULL AS rep_name" }

$dSpJoin = if ($spCols -and $spCols.Count -gt 0 -and $oGuidSalespersonCol -and $spGuidCol) {
    "LEFT JOIN dbo.Salesperson sp ON sp.$(Q $spGuidCol) = o.$(Q $oGuidSalespersonCol)"
} else { '' }

$LinesQuery = @"
SELECT
    $dGuidDetailExpr,
    $dGuidOrderExpr,
    $dOrderNumExpr2,
    $dStatusExpr,
    $dOrderDateExpr2,
    $dShipDateExpr2,
    $dCustIdExpr2,
    $dDealerExpr2,
    $dRepExpr,
    $dWarehouseExpr2,
    $dProductIdExpr,
    $dDescExpr2,
    $pcDescExpr AS product_class,
    $dCategoryExpr,
    $dQtyOrdExpr,
    $dQtyShipExpr,
    $dQtyInvExpr,
    $dQtyOpenExpr,
    $dPriceExpr,
    $dDiscPctExpr,
    $dAmountExpr,
    $dTariffExpr2,
    $dFreightExpr2,
    CAST(0 AS DECIMAL(18,4)) AS net_open_amount,
    CAST('direct_sync' AS NVARCHAR(50)) AS source
FROM dbo.OrderDetail od
INNER JOIN dbo.Orders o ON o.$(Q $oGuidOrderCol) = od.$(Q $dGuidOrderCol)
$dCustJoin
$dSpJoin
$pcJoin
WHERE $statusWhere
  AND ISNULL(od.$(Q $dQtyOrderedCol),0) - ISNULL($(if ($dQtyShippedCol) { "od.$(Q $dQtyShippedCol)" } else { "0" }),0) > 0
ORDER BY order_date, order_number, guid_order_detail
"@

# ── Pull from Acctivate ────────────────────────────────────────────────────────

Write-Host ''
Write-Host 'Querying dbo.Orders (open orders)...' -ForegroundColor Cyan

$orderRows    = Invoke-Sql -SqlQuery $OrdersQuery
$pulledOrders = $orderRows.Count
Write-Host ('  ' + $pulledOrders + ' order headers pulled') -ForegroundColor $(if ($pulledOrders -gt 0) { 'Green' } else { 'Yellow' })

if ($pulledOrders -eq 0) {
    Write-Warning 'No open orders returned from Acctivate. Aborting without touching Supabase.'
    exit 0
}

Write-Host ''
Write-Host 'Querying dbo.OrderDetail (open lines)...' -ForegroundColor Cyan

$lineRows    = Invoke-Sql -SqlQuery $LinesQuery
$pulledLines = $lineRows.Count
Write-Host ('  ' + $pulledLines + ' order lines pulled') -ForegroundColor $(if ($pulledLines -gt 0) { 'Green' } else { 'Yellow' })

if ($pulledLines -eq 0) {
    Write-Warning 'No open order lines returned. Aborting.'
    exit 0
}

# Reconciliation stats
$totalOpenAmount = ($lineRows | ForEach-Object { [double]$_['amount'] } | Measure-Object -Sum).Sum
$totalOpenQty    = ($lineRows | ForEach-Object { [double]$_['qty_open'] } | Measure-Object -Sum).Sum
Write-Host ''
Write-Host 'Pre-upload summary:' -ForegroundColor Cyan
Write-Host ('  Open orders : ' + $pulledOrders)
Write-Host ('  Open lines  : ' + $pulledLines)
Write-Host ('  Total open qty    : ' + $totalOpenQty.ToString('N0'))
Write-Host ('  Total open amount : $' + $totalOpenAmount.ToString('N2')) -ForegroundColor Green

$SyncedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')

# ── Upload Phase 1: Headers ────────────────────────────────────────────────────

Write-Host ''
Write-Host '--- Phase 1: Order Headers ---' -ForegroundColor Cyan

# Clear stale rows first (orders that have since closed)
Invoke-Delete -Table 'acctivate_open_sales_orders'

$orderPayloads = @($orderRows | ForEach-Object {
    $r = Clean-Row $_
    $r['source_synced_at'] = $SyncedAt
    $r
})

$HeadersUrl = $SupabaseUrl + '/rest/v1/acctivate_open_sales_orders?on_conflict=guid_order'

Write-Host 'Preflight: sending first order header...' -ForegroundColor DarkCyan
$pf = Invoke-Post -Url $HeadersUrl -Rows @($orderPayloads[0])
if (-not $pf.ok) {
    Write-Error ('Order header preflight FAILED (HTTP ' + $pf.statusCode + '): ' + $pf.body)
    exit 1
}
Write-Host '  Preflight OK' -ForegroundColor Green

Write-Host ('Uploading ' + $pulledOrders + ' headers in batches of ' + $BatchSize + '...') -ForegroundColor Cyan
$uploadedHeaders = 0
for ($i = 0; $i -lt $pulledOrders; $i += $BatchSize) {
    $last  = [Math]::Min($i + $BatchSize - 1, $pulledOrders - 1)
    $chunk = $orderPayloads[$i..$last]
    $res   = Invoke-Post -Url $HeadersUrl -Rows $chunk
    if ($res.ok) {
        $uploadedHeaders += $chunk.Count
        Write-Host ('  rows ' + ($i+1) + '-' + ($last+1) + '/' + $pulledOrders + '  ok') -ForegroundColor DarkCyan
    } else {
        Write-Error ('Header batch ' + ($i+1) + '-' + ($last+1) + ' FAILED (HTTP ' + $res.statusCode + '): ' + $res.body)
        exit 1
    }
}
Write-Host ('  ' + $uploadedHeaders + '/' + $pulledOrders + ' headers uploaded.') -ForegroundColor Green

# ── Upload Phase 2: Lines ──────────────────────────────────────────────────────

Write-Host ''
Write-Host '--- Phase 2: Order Lines ---' -ForegroundColor Cyan

Invoke-Delete -Table 'acctivate_open_sales_order_lines'

$linePayloads = @($lineRows | ForEach-Object {
    $r = Clean-Row $_
    $r['source_synced_at'] = $SyncedAt
    $r
})

$LinesUrl = $SupabaseUrl + '/rest/v1/acctivate_open_sales_order_lines?on_conflict=guid_order_detail'

Write-Host 'Preflight: sending first line...' -ForegroundColor DarkCyan
$pf2 = Invoke-Post -Url $LinesUrl -Rows @($linePayloads[0])
if (-not $pf2.ok) {
    Write-Error ('Line preflight FAILED (HTTP ' + $pf2.statusCode + '): ' + $pf2.body)
    exit 1
}
Write-Host '  Preflight OK' -ForegroundColor Green

$uploadedLines = 0; $failedLines = 0
for ($i = 0; $i -lt $pulledLines; $i += $BatchSize) {
    $last  = [Math]::Min($i + $BatchSize - 1, $pulledLines - 1)
    $chunk = $linePayloads[$i..$last]
    $res   = Invoke-Post -Url $LinesUrl -Rows $chunk
    if ($res.ok) {
        $uploadedLines += $chunk.Count
        Write-Host ('  rows ' + ($i+1) + '-' + ($last+1) + '/' + $pulledLines + '  ok') -ForegroundColor DarkCyan
    } else {
        Write-Warning ('  batch ' + ($i+1) + '-' + ($last+1) + ' failed (HTTP ' + $res.statusCode + '): ' + $res.body)
        Write-Warning '  retrying row by row...'
        foreach ($row in $chunk) {
            $rr = Invoke-Post -Url $LinesUrl -Rows @($row)
            if ($rr.ok) { $uploadedLines++ }
            else {
                $failedLines++
                $gd = if ($null -ne $row['guid_order_detail']) { $row['guid_order_detail'] } else { 'null' }
                Write-Warning ('    FAILED guid_order_detail=' + $gd + '  HTTP ' + $rr.statusCode + ': ' + $rr.body)
                $script:ExitCode = 1
            }
        }
    }
}

# ── Summary ────────────────────────────────────────────────────────────────────

Write-Host ''
Write-Host '────────────────────────────────────────────────' -ForegroundColor $(if ($script:ExitCode -eq 0) { 'Green' } else { 'Red' })
Write-Host ' OPEN SO SYNC COMPLETE' -ForegroundColor $(if ($script:ExitCode -eq 0) { 'Green' } else { 'Red' })
Write-Host '────────────────────────────────────────────────' -ForegroundColor $(if ($script:ExitCode -eq 0) { 'Green' } else { 'Red' })
Write-Host (' Orders  pulled / uploaded : ' + $pulledOrders  + ' / ' + $uploadedHeaders)
Write-Host (' Lines   pulled / uploaded : ' + $pulledLines   + ' / ' + $uploadedLines)
Write-Host (' Failed line rows          : ' + $failedLines)
Write-Host (' Total open qty            : ' + $totalOpenQty.ToString('N0'))
Write-Host (' Total open amount         : $' + $totalOpenAmount.ToString('N2'))
Write-Host (' Finished                  : ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
Write-Host ''
Write-Host ' Validation SQL (run in Supabase SQL editor):' -ForegroundColor Cyan
Write-Host @'

SELECT
  COUNT(DISTINCT guid_order) AS open_orders,
  COUNT(*)                   AS open_lines,
  SUM(qty_open)              AS total_qty,
  ROUND(SUM(amount),2)       AS total_amount,
  MIN(requested_ship_date)   AS earliest_ship,
  MAX(requested_ship_date)   AS latest_ship
FROM public.acctivate_open_sales_order_lines
WHERE qty_open > 0;

'@

exit $script:ExitCode
