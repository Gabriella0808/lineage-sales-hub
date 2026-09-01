<#
.SYNOPSIS
    Syncs open Purchase Orders from Acctivate into Supabase.

.DESCRIPTION
    Dynamically discovers Acctivate's PO table names (PurchaseOrders, PurchaseOrder,
    POHeader, etc.) and column names at runtime, then pulls all open POs and their
    lines. Also attempts to join container/import tracking tables if they exist.

    Phase 1 — Clears then upserts PO headers into:
               public.acctivate_open_purchase_orders (on_conflict = guid_po)

    Phase 2 — Clears then upserts PO lines into:
               public.acctivate_open_purchase_order_lines (on_conflict = guid_po_detail)

    Safety:
      • Discovers table names before building SQL — fails clearly if no PO table found.
      • Aborts without touching Supabase if Acctivate returns 0 rows.
      • Preflight-tests one row before bulk upload.
      • Clears stale rows before uploading (POs that closed since last sync).
      • Detailed column discovery log so schema issues are diagnosable.

    Config: C:\AcctivateKPI\kpi.config.json
    Schedule: 5:00 AM and 5:00 PM EST daily

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File "C:\AcctivateKPI\sync-open-purchase-orders.ps1"
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
    try {
        $rows = Invoke-Sql -SqlQuery "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='$Schema' AND TABLE_NAME='$Table' ORDER BY ORDINAL_POSITION" -TimeoutSec 30
        return @($rows | ForEach-Object { [string]$_['COLUMN_NAME'] })
    } catch { return @() }
}

function Table-Exists {
    param([string]$Table, [string]$Schema = 'dbo')
    $rows = Invoke-Sql -SqlQuery "SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='$Schema' AND TABLE_NAME='$Table'" -TimeoutSec 15
    return ($rows.Count -gt 0)
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
        Write-Warning "  Could not clear $Table: $($_.Exception.Message)"
    }
}

# ── Start ──────────────────────────────────────────────────────────────────────

Write-Host ''
Write-Host ('=== Open Purchase Orders Sync  ' + (Get-Date -Format 'yyyy-MM-dd HH:mm')) + ' ===' -ForegroundColor Yellow
Write-Host ('Server  : ' + $cfg.sql.server + ' / ' + $cfg.sql.database)
Write-Host ''

# ── Discover PO table names ────────────────────────────────────────────────────

Write-Host 'Discovering Acctivate PO table names...' -ForegroundColor Cyan

# PO header table candidates (most common Acctivate names, in preference order)
$poHeaderCandidates = @(
    'PurchaseOrders','PurchaseOrder','POHeader','PurchaseOrderHeader',
    'VendorPurchaseOrder','PO'
)
# PO line table candidates
$poDetailCandidates = @(
    'PurchaseOrderDetail','PurchaseOrderLine','PurchaseOrderDetails',
    'PODetail','POLine','PurchaseOrderItems','PurchaseOrderItem'
)
# PO receipt/receiving table (for qty received)
$poReceiptCandidates = @(
    'PurchaseOrderReceipt','POReceipt','ReceivingDetail',
    'PurchaseOrderReceiving','POReceivingDetail'
)

$poHeaderTable  = $null
$poDetailTable  = $null
$poReceiptTable = $null

foreach ($t in $poHeaderCandidates) {
    if (Table-Exists -Table $t) { $poHeaderTable = $t; break }
}
foreach ($t in $poDetailCandidates) {
    if (Table-Exists -Table $t) { $poDetailTable = $t; break }
}
foreach ($t in $poReceiptCandidates) {
    if (Table-Exists -Table $t) { $poReceiptTable = $t; break }
}

Write-Host ('  PO Header table  : ' + $(if ($poHeaderTable) { "dbo.$poHeaderTable" } else { '(NOT FOUND)' })) -ForegroundColor $(if ($poHeaderTable) { 'Green' } else { 'Red' })
Write-Host ('  PO Detail table  : ' + $(if ($poDetailTable) { "dbo.$poDetailTable" } else { '(NOT FOUND)' })) -ForegroundColor $(if ($poDetailTable) { 'Green' } else { 'Yellow' })
Write-Host ('  PO Receipt table : ' + $(if ($poReceiptTable) { "dbo.$poReceiptTable" } else { '(not found — will use QtyReceived from detail if available)' })) -ForegroundColor DarkGray

if (-not $poHeaderTable) {
    Write-Error @"

Could not find a PO header table in Acctivate. Checked:
  $($poHeaderCandidates -join ', ')

Run this in SQL Server Management Studio to see all PO-related tables:
  SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = 'dbo'
    AND (TABLE_NAME LIKE '%Purchase%' OR TABLE_NAME LIKE '%PO%' OR TABLE_NAME LIKE '%Vendor%')
  ORDER BY TABLE_NAME;

Then add the correct name to the top of sync-open-purchase-orders.ps1.
"@
    exit 1
}

# ── Column discovery ───────────────────────────────────────────────────────────

Write-Host ''
Write-Host 'Discovering PO column layout...' -ForegroundColor Cyan

$hCols = Get-Columns -Table $poHeaderTable
$dCols = if ($poDetailTable) { Get-Columns -Table $poDetailTable } else { @() }

Write-Host ('  ' + $poHeaderTable + ': ' + $hCols.Count + ' columns') -ForegroundColor DarkCyan
Write-Host ('  Columns: ' + ($hCols -join ', ')) -ForegroundColor DarkGray
if ($dCols.Count -gt 0) {
    Write-Host ('  ' + $poDetailTable + ': ' + $dCols.Count + ' columns') -ForegroundColor DarkCyan
    Write-Host ('  Columns: ' + ($dCols -join ', ')) -ForegroundColor DarkGray
}

# PO Header column mapping
$hGuidPO         = Pick-Col $hCols @('GUIDPurchaseOrder','GUIDPO','PurchaseOrderGUID','POGuid','UniqueID','GUIDPurchase')
$hPONumber       = Pick-Col $hCols @('PurchaseOrderNumber','PONumber','PO_Number','OrderNumber','PONo','Number')
$hVendorID       = Pick-Col $hCols @('VendorID','SupplierID','VendorCode','Vendor','SupplierCode')
$hVendorName     = Pick-Col $hCols @('VendorName','SupplierName','Vendor','VendorDescription','SupplierDescription')
$hWarehouse      = Pick-Col $hCols @('WarehouseID','Warehouse','WH','BranchID','LocationID')
$hStatus         = Pick-Col $hCols @('Status','POStatus','OrderStatus','PurchaseStatus','StatusCode')
$hPODate         = Pick-Col $hCols @('PODate','PurchaseOrderDate','DateOrdered','OrderDate','Date')
$hExpShipDate    = Pick-Col $hCols @('ExpectedShipDate','ShipDate','FactoryShipDate','VendorShipDate','DateShip','ExpShipDate')
$hExpReceiptDate = Pick-Col $hCols @('ExpectedReceiptDate','ReceiptDate','DateExpected','ExpReceiptDate','DateReceive','ETA','ETADate')
$hETADate        = Pick-Col $hCols @('ETADate','ETA','ContainerETA','ArrivalDate','DateArrival')
$hInvoiceDue     = Pick-Col $hCols @('InvoiceDueDate','InvoiceDate','DateInvoiced','PaymentDue','DueDate','InvDueDate')
$hContainerNum   = Pick-Col $hCols @('ContainerNumber','Container','ContainerNo','ContainerID','ContainerRef')
$hTotalAmount    = Pick-Col $hCols @('TotalAmount','Total','POTotal','Amount','OrderTotal','SubTotal')

# If no vendor name column on header, try dbo.Vendor join
$vendorCols    = Get-Columns -Table 'Vendor' -ErrorAction SilentlyContinue
$vendorJoin    = ''
$vendorNameExp = if ($hVendorName) { "CAST(ISNULL(h.$(Q $hVendorName),'') AS NVARCHAR(300)) AS vendor_name" } else { "NULL AS vendor_name" }

if ($vendorCols -and $vendorCols.Count -gt 0 -and $hVendorID) {
    $vNameCol = Pick-Col $vendorCols @('VendorName','Name','CompanyName','Description')
    $vIdCol   = Pick-Col $vendorCols @('VendorID','SupplierID','VendorCode','ID')
    if ($vNameCol -and $vIdCol) {
        $vendorJoin    = "LEFT JOIN dbo.Vendor v ON v.$(Q $vIdCol) = h.$(Q $hVendorID)"
        $vendorNameExp = "CAST(ISNULL(v.$(Q $vNameCol), $(if ($hVendorName) { "h.$(Q $hVendorName)" } else { "''" })) AS NVARCHAR(300)) AS vendor_name"
    }
}

Write-Host ('  guid_po col       : ' + $(if ($hGuidPO) { $hGuidPO } else { '(not found — will generate from PO number)' })) -ForegroundColor $(if ($hGuidPO) { 'DarkCyan' } else { 'Yellow' })
Write-Host ('  PO number col     : ' + $(if ($hPONumber) { $hPONumber } else { '(not found)' })) -ForegroundColor DarkCyan
Write-Host ('  Status col        : ' + $(if ($hStatus) { $hStatus } else { '(not found)' })) -ForegroundColor DarkCyan
Write-Host ('  ETA / receipt col : ' + $(if ($hETADate) { $hETADate } elseif ($hExpReceiptDate) { $hExpReceiptDate } else { '(not found)' })) -ForegroundColor DarkCyan
Write-Host ('  Invoice due col   : ' + $(if ($hInvoiceDue) { $hInvoiceDue } else { '(not found)' })) -ForegroundColor DarkCyan

# PO Detail column mapping
$dGuidDetailPO   = if ($dCols.Count -gt 0) { Pick-Col $dCols @('GUIDPurchaseOrderDetail','GUIDPODetail','PODetailGUID','UniqueID','GUIDDetail') } else { $null }
$dGuidPOFK       = if ($dCols.Count -gt 0) { Pick-Col $dCols @('GUIDPurchaseOrder','GUIDPO','PurchaseOrderGUID','POGuid') } else { $null }
$dPONumber2      = if ($dCols.Count -gt 0) { Pick-Col $dCols @('PurchaseOrderNumber','PONumber','PO_Number','OrderNumber') } else { $null }
$dVendorName2    = if ($dCols.Count -gt 0) { Pick-Col $dCols @('VendorName','SupplierName','Vendor') } else { $null }
$dWarehouse2     = if ($dCols.Count -gt 0) { Pick-Col $dCols @('WarehouseID','Warehouse','WH','BranchID') } else { $null }
$dContainerNum2  = if ($dCols.Count -gt 0) { Pick-Col $dCols @('ContainerNumber','Container','ContainerNo','ContainerID') } else { $null }
$dExpReceiptDate2= if ($dCols.Count -gt 0) { Pick-Col $dCols @('ExpectedReceiptDate','ReceiptDate','DateExpected','ETA','ETADate','ExpReceiptDate') } else { $null }
$dETADate2       = if ($dCols.Count -gt 0) { Pick-Col $dCols @('ETADate','ETA','ContainerETA','ArrivalDate') } else { $null }
$dInvoiceDue2    = if ($dCols.Count -gt 0) { Pick-Col $dCols @('InvoiceDueDate','InvoiceDate','DateInvoiced','DueDate') } else { $null }
$dProductId      = if ($dCols.Count -gt 0) { Pick-Col $dCols @('ProductID','SKU','ItemID','ProductCode','PartNumber') } else { $null }
$dDescription    = if ($dCols.Count -gt 0) { Pick-Col $dCols @('Description','ProductDescription','ItemDescription') } else { $null }
$dProductClass   = if ($dCols.Count -gt 0) { Pick-Col $dCols @('ProductClassID','ProductClass','ClassID') } else { $null }
$dQtyOrdered     = if ($dCols.Count -gt 0) { Pick-Col $dCols @('QuantityOrdered','QtyOrdered','Qty','Quantity','QtyOrder') } else { $null }
$dQtyReceived    = if ($dCols.Count -gt 0) { Pick-Col $dCols @('QuantityReceived','QtyReceived','QtyRecv','Received') } else { $null }
$dUnitCost       = if ($dCols.Count -gt 0) { Pick-Col $dCols @('UnitCost','Cost','UnitPrice','PurchasePrice') } else { $null }
$dExtCost        = if ($dCols.Count -gt 0) { Pick-Col $dCols @('ExtendedCost','TotalCost','LineTotal','LineAmount','Amount') } else { $null }

# ── Determine open PO filter ───────────────────────────────────────────────────

$openPoStatuses = "'Open','Ordered','Partial','In Transit','Approved','Confirmed','Active'"
if ($hStatus) {
    $poStatusWhere = "(h.$(Q $hStatus) IN ($openPoStatuses) OR h.$(Q $hStatus) NOT IN ('Closed','Cancelled','Received','Complete','Completed','Void','Canceled'))"
} else {
    Write-Warning 'No status column found on PO header table — including ALL POs. Review results.'
    $poStatusWhere = '1=1'
}

# ── Build PO Header SQL ────────────────────────────────────────────────────────

# guid_po: use GUID column if available; otherwise derive from PO number
if ($hGuidPO) {
    $guidPoExpr = "LOWER(REPLACE(REPLACE(CAST(h.$(Q $hGuidPO) AS NVARCHAR(64)), '{', ''), '}', '')) AS guid_po"
} elseif ($hPONumber) {
    $guidPoExpr = "CAST('po-' + LOWER(CAST(h.$(Q $hPONumber) AS NVARCHAR(64))) AS NVARCHAR(64)) AS guid_po"
} else {
    Write-Error 'Cannot derive guid_po: no GUID or PO number column found on PO header table.'
    exit 1
}

$poNumExpr     = if ($hPONumber)       { "CAST(h.$(Q $hPONumber) AS NVARCHAR(64)) AS po_number" } else { "NULL AS po_number" }
$vendorIdExpr  = if ($hVendorID)       { "CAST(ISNULL(h.$(Q $hVendorID),'') AS NVARCHAR(100)) AS vendor_id" } else { "NULL AS vendor_id" }
$warehExpr     = if ($hWarehouse)      { "CAST(ISNULL(h.$(Q $hWarehouse),'') AS NVARCHAR(100)) AS warehouse" } else { "NULL AS warehouse" }
$containerExpr = if ($hContainerNum)   { "CAST(ISNULL(h.$(Q $hContainerNum),'') AS NVARCHAR(100)) AS container_number" } else { "NULL AS container_number" }
$statusExpr    = if ($hStatus)         { "CAST(ISNULL(h.$(Q $hStatus),'') AS NVARCHAR(50)) AS po_status" } else { "NULL AS po_status" }
$poDateExpr    = if ($hPODate)         { "CONVERT(NVARCHAR(10), h.$(Q $hPODate), 23) AS po_date" } else { "NULL AS po_date" }
$expShipExpr   = if ($hExpShipDate)    { "CONVERT(NVARCHAR(10), h.$(Q $hExpShipDate), 23) AS expected_ship_date" } else { "NULL AS expected_ship_date" }
$expRcptExpr   = if ($hExpReceiptDate) { "CONVERT(NVARCHAR(10), h.$(Q $hExpReceiptDate), 23) AS expected_receipt_date" } else { "NULL AS expected_receipt_date" }
$etaExpr       = if ($hETADate)        { "CONVERT(NVARCHAR(10), h.$(Q $hETADate), 23) AS eta_date" } elseif ($hExpReceiptDate) { "CONVERT(NVARCHAR(10), h.$(Q $hExpReceiptDate), 23) AS eta_date" } else { "NULL AS eta_date" }
$invDueExpr    = if ($hInvoiceDue)     { "CONVERT(NVARCHAR(10), h.$(Q $hInvoiceDue), 23) AS invoice_due_date" } else { "NULL AS invoice_due_date" }
$totalAmtExpr  = if ($hTotalAmount)    { "CAST(ISNULL(h.$(Q $hTotalAmount),0) AS DECIMAL(18,4)) AS total_amount" } else { "CAST(0 AS DECIMAL(18,4)) AS total_amount" }

$HeadersQuery = @"
SELECT DISTINCT
    $guidPoExpr,
    $poNumExpr,
    $vendorNameExp,
    $vendorIdExpr,
    $warehExpr,
    $containerExpr,
    $statusExpr,
    $poDateExpr,
    $expShipExpr,
    $expRcptExpr,
    $etaExpr,
    $invDueExpr,
    $totalAmtExpr,
    CAST(0 AS DECIMAL(18,4)) AS open_amount,
    CAST('direct_sync' AS NVARCHAR(50)) AS source
FROM dbo.$(Q $poHeaderTable) h
$vendorJoin
WHERE $poStatusWhere
ORDER BY po_date, po_number
"@

# ── Build PO Lines SQL ─────────────────────────────────────────────────────────

if (-not $poDetailTable) {
    Write-Warning 'No PO detail/line table found. Uploading headers only (no line detail).'
    $LinesQuery = $null
} else {
    # guid_po_detail
    if ($dGuidDetailPO) {
        $guidPoDetailExpr = "LOWER(REPLACE(REPLACE(CAST(d.$(Q $dGuidDetailPO) AS NVARCHAR(64)), '{', ''), '}', '')) AS guid_po_detail"
    } else {
        # Generate from PO number + line number (ROW_NUMBER fallback)
        $guidPoDetailExpr = "CAST('pod-' + CAST(h.$(Q $hPONumber) AS NVARCHAR(64)) + '-' + CAST(ROW_NUMBER() OVER (ORDER BY h.$(Q $hPONumber)) AS NVARCHAR(20)) AS NVARCHAR(100)) AS guid_po_detail"
    }

    # guid_po FK for line
    if ($dGuidPOFK) {
        $dGuidPoFKExpr = "LOWER(REPLACE(REPLACE(CAST(d.$(Q $dGuidPOFK) AS NVARCHAR(64)), '{', ''), '}', '')) AS guid_po"
    } elseif ($hGuidPO) {
        $dGuidPoFKExpr = "LOWER(REPLACE(REPLACE(CAST(h.$(Q $hGuidPO) AS NVARCHAR(64)), '{', ''), '}', '')) AS guid_po"
    } else {
        $dGuidPoFKExpr = "CAST('po-' + LOWER(CAST(h.$(Q $hPONumber) AS NVARCHAR(64))) AS NVARCHAR(64)) AS guid_po"
    }

    $dPoNumExpr2     = if ($dPONumber2)       { "CAST(d.$(Q $dPONumber2) AS NVARCHAR(64))" }      elseif ($hPONumber) { "CAST(h.$(Q $hPONumber) AS NVARCHAR(64))" }     else { "NULL" }
    $dVendorExpr2    = if ($dVendorName2)     { "CAST(ISNULL(d.$(Q $dVendorName2),'') AS NVARCHAR(300))" } else { "CAST(ISNULL(v.$(if ($vNameCol) { $vNameCol } else { '' }),'') AS NVARCHAR(300))" }
    $dWarehExpr2     = if ($dWarehouse2)      { "CAST(ISNULL(d.$(Q $dWarehouse2),'') AS NVARCHAR(100))" }    elseif ($hWarehouse) { "CAST(ISNULL(h.$(Q $hWarehouse),'') AS NVARCHAR(100))" } else { "NULL" }
    $dContExpr2      = if ($dContainerNum2)   { "CAST(ISNULL(d.$(Q $dContainerNum2),'') AS NVARCHAR(100))" } elseif ($hContainerNum) { "CAST(ISNULL(h.$(Q $hContainerNum),'') AS NVARCHAR(100))" } else { "NULL" }
    $dEtaExpr2       = if ($dETADate2)        { "CONVERT(NVARCHAR(10), d.$(Q $dETADate2), 23)" }           elseif ($dExpReceiptDate2) { "CONVERT(NVARCHAR(10), d.$(Q $dExpReceiptDate2), 23)" } elseif ($hETADate) { "CONVERT(NVARCHAR(10), h.$(Q $hETADate), 23)" } elseif ($hExpReceiptDate) { "CONVERT(NVARCHAR(10), h.$(Q $hExpReceiptDate), 23)" } else { "NULL" }
    $dRcptExpr2      = if ($dExpReceiptDate2) { "CONVERT(NVARCHAR(10), d.$(Q $dExpReceiptDate2), 23)" }    elseif ($hExpReceiptDate) { "CONVERT(NVARCHAR(10), h.$(Q $hExpReceiptDate), 23)" } else { "NULL" }
    $dInvDueExpr2    = if ($dInvoiceDue2)     { "CONVERT(NVARCHAR(10), d.$(Q $dInvoiceDue2), 23)" }        elseif ($hInvoiceDue) { "CONVERT(NVARCHAR(10), h.$(Q $hInvoiceDue), 23)" } else { "NULL" }
    $dProductIdExpr  = if ($dProductId)       { "CAST(ISNULL(d.$(Q $dProductId),'') AS NVARCHAR(200))" }   else { "NULL" }
    $dDescExpr       = if ($dDescription)     { "CAST(ISNULL(d.$(Q $dDescription),'') AS NVARCHAR(500))" } else { "NULL" }
    $dClassExpr      = if ($dProductClass)    { "CAST(ISNULL(d.$(Q $dProductClass),'') AS NVARCHAR(128))" } else { "NULL" }
    $dQtyOrdExpr2    = if ($dQtyOrdered)      { "CAST(ISNULL(d.$(Q $dQtyOrdered),0) AS DECIMAL(18,4))" }   else { "CAST(0 AS DECIMAL(18,4))" }
    $dQtyRecvExpr    = if ($dQtyReceived)     { "CAST(ISNULL(d.$(Q $dQtyReceived),0) AS DECIMAL(18,4))" }  else { "CAST(0 AS DECIMAL(18,4))" }
    $dUnitCostExpr   = if ($dUnitCost)        { "CAST(ISNULL(d.$(Q $dUnitCost),0) AS DECIMAL(18,4))" }     else { "NULL" }
    $dExtCostExpr    = if ($dExtCost)         { "CAST(ISNULL(d.$(Q $dExtCost),0) AS DECIMAL(18,4))" }      else { "NULL" }

    # qty_open = ordered - received, clamped to 0
    if ($dQtyOrdered -and $dQtyReceived) {
        $dQtyOpenExpr = "CAST(CASE WHEN ISNULL(d.$(Q $dQtyOrdered),0) - ISNULL(d.$(Q $dQtyReceived),0) < 0 THEN 0 ELSE ISNULL(d.$(Q $dQtyOrdered),0) - ISNULL(d.$(Q $dQtyReceived),0) END AS DECIMAL(18,4))"
    } elseif ($dQtyOrdered) {
        $dQtyOpenExpr = "CAST(ISNULL(d.$(Q $dQtyOrdered),0) AS DECIMAL(18,4))"
    } else {
        $dQtyOpenExpr = "CAST(0 AS DECIMAL(18,4))"
    }

    # JOIN condition between detail and header
    $detailJoinCond = if ($dGuidPOFK -and $hGuidPO) {
        "d.$(Q $dGuidPOFK) = h.$(Q $hGuidPO)"
    } elseif ($dPONumber2 -and $hPONumber) {
        "d.$(Q $dPONumber2) = h.$(Q $hPONumber)"
    } else {
        Write-Warning 'Cannot determine JOIN condition between PO header and detail tables.'
        "1=0"
    }

    $LinesQuery = @"
SELECT
    $guidPoDetailExpr,
    $dGuidPoFKExpr,
    $dPoNumExpr2 AS po_number,
    $dVendorExpr2 AS vendor_name,
    $dWarehExpr2 AS warehouse,
    $dContExpr2 AS container_number,
    $dRcptExpr2 AS expected_receipt_date,
    $dEtaExpr2 AS eta_date,
    $dInvDueExpr2 AS invoice_due_date,
    $dProductIdExpr AS product_id,
    $dDescExpr AS description,
    $dClassExpr AS product_class,
    $dQtyOrdExpr2 AS qty_ordered,
    $dQtyRecvExpr AS qty_received,
    $dQtyOpenExpr AS qty_open,
    $dUnitCostExpr AS unit_cost,
    $dExtCostExpr AS total_amount,
    CASE
        WHEN $dQtyOpenExpr > 0 AND $dUnitCostExpr IS NOT NULL
        THEN $dQtyOpenExpr * $dUnitCostExpr
        WHEN $dQtyOpenExpr > 0 AND $dExtCostExpr IS NOT NULL AND $dQtyOrdExpr2 > 0
        THEN ($dExtCostExpr / $dQtyOrdExpr2) * $dQtyOpenExpr
        ELSE $dExtCostExpr
    END AS open_amount,
    CAST('direct_sync' AS NVARCHAR(50)) AS source
FROM dbo.$(Q $poDetailTable) d
INNER JOIN dbo.$(Q $poHeaderTable) h ON $detailJoinCond
$vendorJoin
WHERE $poStatusWhere
  AND $dQtyOpenExpr > 0
ORDER BY po_date, po_number, guid_po_detail
"@
}

# ── Pull from Acctivate ────────────────────────────────────────────────────────

Write-Host ''
Write-Host ('Querying dbo.' + $poHeaderTable + ' (open POs)...') -ForegroundColor Cyan

$headerRows    = Invoke-Sql -SqlQuery $HeadersQuery
$pulledHeaders = $headerRows.Count
Write-Host ('  ' + $pulledHeaders + ' PO headers pulled') -ForegroundColor $(if ($pulledHeaders -gt 0) { 'Green' } else { 'Yellow' })

if ($pulledHeaders -eq 0) {
    Write-Warning 'No open POs returned from Acctivate. Aborting without touching Supabase.'
    exit 0
}

$lineRows    = @()
$pulledLines = 0
if ($LinesQuery) {
    Write-Host ('Querying dbo.' + $poDetailTable + ' (open PO lines)...') -ForegroundColor Cyan
    $lineRows    = Invoke-Sql -SqlQuery $LinesQuery
    $pulledLines = $lineRows.Count
    Write-Host ('  ' + $pulledLines + ' PO lines pulled') -ForegroundColor $(if ($pulledLines -gt 0) { 'Green' } else { 'Yellow' })
}

# Reconciliation
$totalOpenAmt = ($lineRows | ForEach-Object { if ($null -ne $_['open_amount']) { [double]$_['open_amount'] } else { 0.0 } } | Measure-Object -Sum).Sum
$totalOpenQty = ($lineRows | ForEach-Object { if ($null -ne $_['qty_open']) { [double]$_['qty_open'] } else { 0.0 } } | Measure-Object -Sum).Sum

Write-Host ''
Write-Host 'Pre-upload summary:' -ForegroundColor Cyan
Write-Host ('  Open POs    : ' + $pulledHeaders)
Write-Host ('  Open lines  : ' + $pulledLines)
Write-Host ('  Total open qty    : ' + $totalOpenQty.ToString('N0'))
Write-Host ('  Total open amount : $' + $totalOpenAmt.ToString('N2')) -ForegroundColor Green

$SyncedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')

# ── Upload Phase 1: Headers ────────────────────────────────────────────────────

Write-Host ''
Write-Host '--- Phase 1: PO Headers ---' -ForegroundColor Cyan

Invoke-Delete -Table 'acctivate_open_purchase_orders'

$headerPayloads = @($headerRows | ForEach-Object {
    $r = Clean-Row $_
    $r['source_synced_at'] = $SyncedAt
    $r
})

$HeadersUrl = $SupabaseUrl + '/rest/v1/acctivate_open_purchase_orders?on_conflict=guid_po'

Write-Host 'Preflight: sending first PO header...' -ForegroundColor DarkCyan
$pf = Invoke-Post -Url $HeadersUrl -Rows @($headerPayloads[0])
if (-not $pf.ok) {
    Write-Error ('PO header preflight FAILED (HTTP ' + $pf.statusCode + '): ' + $pf.body)
    exit 1
}
Write-Host '  Preflight OK' -ForegroundColor Green

$uploadedHeaders = 0
for ($i = 0; $i -lt $pulledHeaders; $i += $BatchSize) {
    $last  = [Math]::Min($i + $BatchSize - 1, $pulledHeaders - 1)
    $chunk = $headerPayloads[$i..$last]
    $res   = Invoke-Post -Url $HeadersUrl -Rows $chunk
    if ($res.ok) {
        $uploadedHeaders += $chunk.Count
        Write-Host ('  rows ' + ($i+1) + '-' + ($last+1) + '/' + $pulledHeaders + '  ok') -ForegroundColor DarkCyan
    } else {
        Write-Error ('PO header batch failed (HTTP ' + $res.statusCode + '): ' + $res.body)
        exit 1
    }
}
Write-Host ('  ' + $uploadedHeaders + '/' + $pulledHeaders + ' PO headers uploaded.') -ForegroundColor Green

# ── Upload Phase 2: Lines ──────────────────────────────────────────────────────

$uploadedLines = 0; $failedLines = 0

if ($pulledLines -gt 0) {
    Write-Host ''
    Write-Host '--- Phase 2: PO Lines ---' -ForegroundColor Cyan

    Invoke-Delete -Table 'acctivate_open_purchase_order_lines'

    $linePayloads = @($lineRows | ForEach-Object {
        $r = Clean-Row $_
        $r['source_synced_at'] = $SyncedAt
        $r
    })

    $LinesUrl = $SupabaseUrl + '/rest/v1/acctivate_open_purchase_order_lines?on_conflict=guid_po_detail'

    Write-Host 'Preflight: sending first PO line...' -ForegroundColor DarkCyan
    $pf2 = Invoke-Post -Url $LinesUrl -Rows @($linePayloads[0])
    if (-not $pf2.ok) {
        Write-Error ('PO line preflight FAILED (HTTP ' + $pf2.statusCode + '): ' + $pf2.body)
        exit 1
    }
    Write-Host '  Preflight OK' -ForegroundColor Green

    for ($i = 0; $i -lt $pulledLines; $i += $BatchSize) {
        $last  = [Math]::Min($i + $BatchSize - 1, $pulledLines - 1)
        $chunk = $linePayloads[$i..$last]
        $res   = Invoke-Post -Url $LinesUrl -Rows $chunk
        if ($res.ok) {
            $uploadedLines += $chunk.Count
            Write-Host ('  rows ' + ($i+1) + '-' + ($last+1) + '/' + $pulledLines + '  ok') -ForegroundColor DarkCyan
        } else {
            Write-Warning ('  batch ' + ($i+1) + '-' + ($last+1) + ' failed — retrying row by row...')
            foreach ($row in $chunk) {
                $rr = Invoke-Post -Url $LinesUrl -Rows @($row)
                if ($rr.ok) { $uploadedLines++ }
                else {
                    $failedLines++
                    $gd = if ($null -ne $row['guid_po_detail']) { $row['guid_po_detail'] } else { 'null' }
                    Write-Warning ('    FAILED guid_po_detail=' + $gd + '  HTTP ' + $rr.statusCode + ': ' + $rr.body)
                    $script:ExitCode = 1
                }
            }
        }
    }
    Write-Host ('  ' + $uploadedLines + '/' + $pulledLines + ' PO lines uploaded.') -ForegroundColor Green
} else {
    Write-Warning 'No PO lines to upload (either no detail table found or 0 open lines).'
}

# ── Summary ────────────────────────────────────────────────────────────────────

Write-Host ''
Write-Host '────────────────────────────────────────────────' -ForegroundColor $(if ($script:ExitCode -eq 0) { 'Green' } else { 'Red' })
Write-Host ' OPEN PO SYNC COMPLETE' -ForegroundColor $(if ($script:ExitCode -eq 0) { 'Green' } else { 'Red' })
Write-Host '────────────────────────────────────────────────' -ForegroundColor $(if ($script:ExitCode -eq 0) { 'Green' } else { 'Red' })
Write-Host (' PO table            : dbo.' + $poHeaderTable)
Write-Host (' Detail table        : ' + $(if ($poDetailTable) { 'dbo.' + $poDetailTable } else { '(none)' }))
Write-Host (' Headers uploaded    : ' + $uploadedHeaders + ' / ' + $pulledHeaders)
Write-Host (' Lines   uploaded    : ' + $uploadedLines + ' / ' + $pulledLines)
Write-Host (' Failed lines        : ' + $failedLines)
Write-Host (' Total open qty      : ' + $totalOpenQty.ToString('N0'))
Write-Host (' Total open amount   : $' + $totalOpenAmt.ToString('N2'))
Write-Host (' Finished            : ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
Write-Host ''
Write-Host ' Validation SQL (run in Supabase SQL editor):' -ForegroundColor Cyan
Write-Host @'

SELECT
  COUNT(DISTINCT guid_po)   AS open_pos,
  COUNT(*)                  AS open_lines,
  SUM(qty_open)             AS total_qty,
  ROUND(SUM(open_amount),2) AS total_open_amount,
  MIN(eta_date)             AS earliest_eta,
  MAX(eta_date)             AS latest_eta,
  MIN(invoice_due_date)     AS earliest_invoice_due,
  MAX(invoice_due_date)     AS latest_invoice_due
FROM public.acctivate_open_purchase_order_lines
WHERE qty_open > 0;

'@

exit $script:ExitCode
