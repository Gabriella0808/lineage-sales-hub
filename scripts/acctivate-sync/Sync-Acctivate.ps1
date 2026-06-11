<#
.SYNOPSIS
  Pushes data from the local Acctivate SQL Server database to the
  Lovable Cloud `sync-acctivate` edge function.

.DESCRIPTION
  Runs a set of SQL queries against Acctivate, shapes each result set
  into the schema expected by the `sync-acctivate` function, and POSTs
  them in batches. Designed to run on a desktop / on-prem machine that
  has line-of-sight to the Acctivate SQL Server.

.PARAMETER ConfigPath
  Path to sync.config.json. Defaults to ./sync.config.json next to this script.

.PARAMETER Tables
  Optional list of table keys to sync (managers, sales_reps, territories,
  dealers, products, inventory). Defaults to all enabled in config.

.PARAMETER Prune
  After syncing dealers, remove stale dealer rows that are no longer in
  Acctivate. Dealers with field check-in history are preserved by the backend.

.EXAMPLE
  pwsh ./Sync-Acctivate.ps1
  pwsh ./Sync-Acctivate.ps1 -Tables dealers,products
  pwsh ./Sync-Acctivate.ps1 -Tables dealers -Prune
#>

[CmdletBinding()]
param(
  [string]$ConfigPath = (Join-Path $PSScriptRoot 'sync.config.json'),
  [switch]$Prune,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Tables
)

$ErrorActionPreference = 'Stop'

# ---------- Load config ----------
if (-not (Test-Path $ConfigPath)) {
  throw "Config file not found at $ConfigPath. Copy sync.config.example.json -> sync.config.json and fill it in."
}
$config = Get-Content $ConfigPath -Raw | ConvertFrom-Json

$SupabaseUrl  = $config.supabaseUrl.TrimEnd('/')
$SyncToken    = $config.syncToken
$FunctionUrl  = "$SupabaseUrl/functions/v1/sync-acctivate"
$BatchSize    = if ($config.batchSize) { [int]$config.batchSize } else { 100 }
$RequestTimeoutSeconds = if ($config.requestTimeoutSeconds) { [int]$config.requestTimeoutSeconds } else { 120 }
$MaxRetries = if ($config.maxRetries) { [int]$config.maxRetries } else { 3 }
$RetryDelaySeconds = if ($config.retryDelaySeconds) { [int]$config.retryDelaySeconds } else { 5 }
$SqlCommandTimeoutSeconds = if ($config.sql.commandTimeoutSeconds) { [int]$config.sql.commandTimeoutSeconds } else { 300 }

if (-not $SupabaseUrl -or -not $SyncToken) {
  throw "supabaseUrl and syncToken are required in $ConfigPath"
}

# ---------- SQL connection ----------
$sqlConnStr = "Server=$($config.sql.server);Database=$($config.sql.database);"
if ($config.sql.integratedSecurity) {
  $sqlConnStr += "Integrated Security=SSPI;"
} else {
  $sqlConnStr += "User Id=$($config.sql.user);Password=$($config.sql.password);"
}
$sqlConnStr += "Encrypt=False;TrustServerCertificate=True;"

function Invoke-Sql {
  param([string]$Query)
  $conn = New-Object System.Data.SqlClient.SqlConnection $sqlConnStr
  $conn.ConnectionString += "Connection Timeout=30;"
  $conn.Open()
  try {
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = $Query
    $cmd.CommandTimeout = $SqlCommandTimeoutSeconds
    $reader = $cmd.ExecuteReader()
    $rows = New-Object System.Collections.Generic.List[hashtable]
    while ($reader.Read()) {
      $row = @{}
      for ($i = 0; $i -lt $reader.FieldCount; $i++) {
        $name = $reader.GetName($i)
        $val  = $reader.GetValue($i)
        if ($val -is [System.DBNull]) { $val = $null }
        $row[$name] = $val
      }
      $rows.Add($row) | Out-Null
    }
    return ,$rows
  } finally {
    $conn.Close()
  }
}

function Get-SqlColumns {
  param([string]$Schema = 'dbo', [string]$Table)
  $rows = Invoke-Sql -Query "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = '$Schema' AND TABLE_NAME = '$Table' ORDER BY ORDINAL_POSITION"
  return @($rows | ForEach-Object { [string]$_['COLUMN_NAME'] })
}

function Quote-SqlIdentifier {
  param([string]$Name)
  return '[' + $Name.Replace(']', ']]') + ']'
}

function Get-FirstColumn {
  param([string[]]$Columns, [string[]]$Candidates)
  foreach ($candidate in $Candidates) {
    $match = $Columns | Where-Object { $_ -ieq $candidate } | Select-Object -First 1
    if ($match) { return [string]$match }
  }
  return $null
}

function New-SelectExpression {
  param([string[]]$Columns, [string[]]$Candidates, [string]$Alias, [string]$Cast = '', [string]$Default = 'NULL', [string]$TableAlias = 'inv')
  $column = Get-FirstColumn -Columns $Columns -Candidates $Candidates
  if (-not $column) { return "$Default AS $Alias" }
  $ref = "$TableAlias.$(Quote-SqlIdentifier $column)"
  if ($Cast) { return "CAST($ref AS $Cast) AS $Alias" }
  return "$ref AS $Alias"
}

function New-DateSelectExpression {
  param([string[]]$Columns, [string[]]$Candidates, [string]$Alias, [string]$TableAlias = 'inv')
  $column = Get-FirstColumn -Columns $Columns -Candidates $Candidates
  if (-not $column) { return "NULL AS $Alias" }
  return "CONVERT(VARCHAR(10), $TableAlias.$(Quote-SqlIdentifier $column), 23) AS $Alias"
}

function New-DealerInvoicesQuery {
  $columns = Get-SqlColumns -Table 'Invoice'
  if (-not $columns -or $columns.Count -eq 0) {
    throw "Could not read columns for dbo.Invoice. Confirm the invoice table name in Acctivate."
  }

  $invoiceIdCol = Get-FirstColumn -Columns $columns -Candidates @('InvoiceID', 'InvoiceId', 'InvoiceGUID', 'InvoiceGuid', 'ID', 'InvoiceNumber')
  $customerCol = Get-FirstColumn -Columns $columns -Candidates @('CustID', 'CustId', 'CustomerID', 'CustomerId', 'CustomerNumber', 'CustomerNo', 'CustNo', 'Customer', 'BillToCustID', 'BillToCustomerID')
  if (-not $invoiceIdCol -or -not $customerCol) {
    throw "Could not map dbo.Invoice invoice/customer columns. Found columns: $($columns -join ', ')"
  }

  $invoiceNumberExpr = New-SelectExpression -Columns $columns -Candidates @('InvoiceNumber', 'InvoiceNo', 'InvoiceNum', 'Number') -Alias 'invoice_number' -Cast 'NVARCHAR(64)' -Default "CAST(inv.$(Quote-SqlIdentifier $invoiceIdCol) AS NVARCHAR(64))"
  $invoiceDateExpr = New-DateSelectExpression -Columns $columns -Candidates @('InvoiceDate', 'Date', 'DocDate', 'PostDate') -Alias 'invoice_date'
  $dueDateExpr = New-DateSelectExpression -Columns $columns -Candidates @('DueDate', 'InvoiceDueDate') -Alias 'due_date'
  $subtotalExpr = New-SelectExpression -Columns $columns -Candidates @('SubTotal', 'Subtotal', 'MerchandiseTotal', 'ProductTotal') -Alias 'subtotal' -Default '0'
  $taxExpr = New-SelectExpression -Columns $columns -Candidates @('TaxAmount', 'SalesTax', 'Tax', 'TaxTotal') -Alias 'tax' -Default '0'
  $freightExpr = New-SelectExpression -Columns $columns -Candidates @('FreightAmount', 'Freight', 'FreightTotal', 'ShippingAmount', 'Shipping') -Alias 'freight' -Default '0'
  $totalExpr = New-SelectExpression -Columns $columns -Candidates @('InvoiceTotal', 'Total', 'TotalAmount', 'InvoiceAmount', 'GrandTotal') -Alias 'total' -Default '0'
  $balanceCol = Get-FirstColumn -Columns $columns -Candidates @('BalanceDue', 'Balance', 'AmountDue', 'OpenBalance')
  $balanceExpr = if ($balanceCol) { "inv.$(Quote-SqlIdentifier $balanceCol) AS balance" } else { "NULL AS balance" }
  $dueDateCol = Get-FirstColumn -Columns $columns -Candidates @('DueDate', 'InvoiceDueDate')
  $statusExpr = if ($balanceCol -and $dueDateCol) {
    "CASE WHEN inv.$(Quote-SqlIdentifier $balanceCol) <= 0 THEN 'paid' WHEN inv.$(Quote-SqlIdentifier $dueDateCol) < CAST(GETDATE() AS DATE) THEN 'overdue' ELSE 'open' END AS status"
  } elseif ($balanceCol) {
    "CASE WHEN inv.$(Quote-SqlIdentifier $balanceCol) <= 0 THEN 'paid' ELSE 'open' END AS status"
  } else {
    "'open' AS status"
  }
  $termsExpr = New-SelectExpression -Columns $columns -Candidates @('TermsCode', 'Terms', 'PaymentTerms') -Alias 'terms' -Cast 'NVARCHAR(128)'
  $salespersonExpr = New-SelectExpression -Columns $columns -Candidates @('SalespersonName', 'Salesperson', 'SalesPerson', 'SalesRep') -Alias 'salesperson' -Cast 'NVARCHAR(255)'
  $poExpr = New-SelectExpression -Columns $columns -Candidates @('PONumber', 'PONo', 'CustomerPONumber', 'CustomerPO', 'CustPONumber', 'CustPO', 'PO') -Alias 'po_number' -Cast 'NVARCHAR(128)'
  # Acctivate stores the branch link as GUIDBranch on dbo.Invoice and joins
  # to dbo.Branch (BranchID short code + Name). The plain BranchID column on
  # dbo.Invoice is almost always NULL, so resolve through the join and fall
  # back to the header column only when the lookup is unavailable.
  $hasGuidBranch = $columns -contains 'GUIDBranch'
  $fallbackBranchCol = Get-FirstColumn -Columns $columns -Candidates @('BranchID', 'BranchId', 'Branch', 'BranchCode', 'BranchName', 'WarehouseID', 'WarehouseId', 'Warehouse', 'LocationID', 'LocationId', 'Location')
  $branchJoin = ''
  $bref = $null
  $nameRef = $null
  if ($hasGuidBranch) {
    $branchJoin = 'LEFT JOIN dbo.Branch br ON br.GUIDBranch = inv.GUIDBranch'
    if ($fallbackBranchCol) {
      $bref = "COALESCE(br.BranchID, CAST(inv.$(Quote-SqlIdentifier $fallbackBranchCol) AS NVARCHAR(128)))"
      $nameRef = "COALESCE(br.Name, CAST(inv.$(Quote-SqlIdentifier $fallbackBranchCol) AS NVARCHAR(128)))"
    } else {
      $bref = 'br.BranchID'
      $nameRef = 'br.Name'
    }
  } elseif ($fallbackBranchCol) {
    $bref = "CAST(inv.$(Quote-SqlIdentifier $fallbackBranchCol) AS NVARCHAR(128))"
    $nameRef = $bref
  }

  if ($bref) {
    $branchExpr = @"
CASE UPPER(LTRIM(RTRIM($bref)))
  WHEN 'WHSALES'    THEN 'Warehouse'
  WHEN 'WH'         THEN 'Warehouse'
  WHEN 'WAREHOUSE'  THEN 'Warehouse'
  WHEN 'CONTAINER'  THEN 'Container'
  WHEN 'CONT'       THEN 'Container'
  WHEN 'DIRECT'     THEN 'Direct Shipping'
  WHEN 'DIRECTSHIP' THEN 'Direct Shipping'
  WHEN 'DS'         THEN 'Direct Shipping'
  ELSE LTRIM(RTRIM($nameRef))
END AS branch
"@
  } else {
    $branchExpr = 'NULL AS branch'
  }

  return @"
SELECT
  CAST(inv.$(Quote-SqlIdentifier $invoiceIdCol) AS NVARCHAR(64)) AS acctivate_id,
  CAST(inv.$(Quote-SqlIdentifier $customerCol) AS NVARCHAR(64)) AS dealer_acctivate_id,
  $invoiceNumberExpr,
  $invoiceDateExpr,
  $dueDateExpr,
  $subtotalExpr,
  $taxExpr,
  $freightExpr,
  $totalExpr,
  $balanceExpr,
  $statusExpr,
  $termsExpr,
  $salespersonExpr,
  $poExpr,
  $branchExpr
FROM dbo.Invoice inv
$branchJoin
WHERE inv.$(Quote-SqlIdentifier $customerCol) IS NOT NULL
"@
}

function New-DealerInvoiceLinesQuery {
  # Auto-discover Acctivate's invoice-detail table (InvoiceDetail / InvoiceLine / InvoiceItem)
  $detailTable = $null
  foreach ($candidate in @('InvoiceDetail', 'InvoiceLine', 'InvoiceItem', 'InvoiceLineItem', 'InvoiceDetails')) {
    $found = Invoke-Sql -Query "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = '$candidate'"
    if ($found.Count -gt 0) { $detailTable = $candidate; break }
  }
  if (-not $detailTable) {
    throw "Could not find an invoice-detail table in dbo (tried InvoiceDetail, InvoiceLine, InvoiceItem, InvoiceLineItem, InvoiceDetails)."
  }

  $detailCols = Get-SqlColumns -Table $detailTable
  $hdrCols    = Get-SqlColumns -Table 'Invoice'
  if (-not $detailCols -or $detailCols.Count -eq 0) {
    throw "Could not read columns for dbo.$detailTable."
  }

  $detailIdCol = Get-FirstColumn -Columns $detailCols -Candidates @('GUIDInvoiceDetail', 'InvoiceDetailID', 'InvoiceDetailId', 'InvoiceLineID', 'InvoiceLineId', 'LineID', 'LineId', 'DetailID', 'DetailId', 'ID')
  $invIdCol    = Get-FirstColumn -Columns $detailCols -Candidates @('GUIDInvoice', 'InvoiceID', 'InvoiceId', 'InvoiceGUID', 'InvoiceGuid')
  $skuCol      = Get-FirstColumn -Columns $detailCols -Candidates @('ProductID', 'ProductCode', 'ItemCode', 'SKU', 'ItemNumber', 'PartNumber')
  $productIdCol = Get-FirstColumn -Columns $detailCols -Candidates @('GUIDProduct', 'ProductGUID', 'ItemID', 'ItemId')

  if (-not $detailIdCol -or -not $invIdCol) {
    throw "Could not map dbo.$detailTable line/invoice id columns. Found: $($detailCols -join ', ')"
  }

  $hdrInvIdCol     = Get-FirstColumn -Columns $hdrCols -Candidates @('GUIDInvoice', 'InvoiceID', 'InvoiceId', 'InvoiceGUID', 'InvoiceGuid', 'ID')
  $hdrCustomerCol  = Get-FirstColumn -Columns $hdrCols -Candidates @('CustID', 'CustId', 'CustomerID', 'CustomerId', 'CustomerNumber', 'CustNo', 'Customer', 'BillToCustID', 'BillToCustomerID')
  $hdrDateCol      = Get-FirstColumn -Columns $hdrCols -Candidates @('InvoiceDate', 'Date', 'DocDate', 'PostDate')
  if (-not $hdrInvIdCol -or -not $hdrCustomerCol) {
    throw "Could not map dbo.Invoice id/customer columns for invoice-line join."
  }

  $skuExpr        = if ($skuCol) { "CAST(d.$(Quote-SqlIdentifier $skuCol) AS NVARCHAR(128)) AS sku" } else { "NULL AS sku" }
  $nameExpr       = New-SelectExpression -Columns $detailCols -Candidates @('Description', 'ProductDescription', 'ItemDescription', 'Name') -Alias 'product_name' -Cast 'NVARCHAR(512)' -TableAlias 'd'
  $qtyExpr        = New-SelectExpression -Columns $detailCols -Candidates @('QtyInvoiced', 'QuantityInvoiced', 'QtyShipped', 'QuantityShipped', 'Quantity', 'Qty') -Alias 'qty' -Default '0' -TableAlias 'd'
  $unitPriceExpr  = New-SelectExpression -Columns $detailCols -Candidates @('Price', 'UnitPrice', 'SalesPrice', 'SellingPrice', 'DisplayPrice') -Alias 'unit_price' -Default '0' -TableAlias 'd'
  $extPriceExpr   = New-SelectExpression -Columns $detailCols -Candidates @('Amount', 'ExtendedPrice', 'ExtPrice', 'LineTotal', 'NetAmount', 'TotalPrice', 'DisplayAmount') -Alias 'extended_price' -Default '0' -TableAlias 'd'
  $dateExpr       = "CONVERT(VARCHAR(10), inv.$(Quote-SqlIdentifier $hdrDateCol), 23) AS invoice_date"

  return @"
SELECT
  CAST(d.$(Quote-SqlIdentifier $detailIdCol) AS NVARCHAR(64)) AS acctivate_id,
  CAST(d.$(Quote-SqlIdentifier $invIdCol) AS NVARCHAR(64)) AS invoice_acctivate_id,
  CAST(inv.$(Quote-SqlIdentifier $hdrCustomerCol) AS NVARCHAR(64)) AS dealer_acctivate_id,
  $skuExpr,
  $nameExpr,
  $qtyExpr,
  $unitPriceExpr,
  $extPriceExpr,
  $dateExpr
FROM dbo.$detailTable d
INNER JOIN dbo.Invoice inv ON inv.$(Quote-SqlIdentifier $hdrInvIdCol) = d.$(Quote-SqlIdentifier $invIdCol)
WHERE d.$(Quote-SqlIdentifier $invIdCol) IS NOT NULL
"@
}

function New-OpenSalesOrdersQuery {
  # Source = Acctivate's Sales → Open Only view (dbo.OrderManagementSummary).
  # Open Only = OrderStatus IN ('Scheduled','Backordered','Booked')
  # (excludes Completed and Cancelled). Joined to dbo.OrderDetail for line-level qty/sku.
  $detailTable = 'OrderDetail'
  $detailCols  = Get-SqlColumns -Table $detailTable
  $prodCols    = Get-SqlColumns -Table 'Product'

  $detIdCol      = Get-FirstColumn -Columns $detailCols -Candidates @('GUIDOrderDetail','GUIDSalesOrderDetail','OrderDetailID','LineID','ID')
  $detOrdIdCol   = Get-FirstColumn -Columns $detailCols -Candidates @('GUIDOrder','GUIDSalesOrder','OrderID','SalesOrderID')
  $detSkuCol     = Get-FirstColumn -Columns $detailCols -Candidates @('ProductID','ProductCode','ItemCode','SKU','ItemNumber')
  $detProdIdCol  = Get-FirstColumn -Columns $detailCols -Candidates @('GUIDProduct','ProductGUID','ProductID','ItemID')
  $detOrdQtyCol  = Get-FirstColumn -Columns $detailCols -Candidates @('OrderedQty','QtyOrdered','QuantityOrdered','OrderQty','Quantity','Qty')
  $detShipQtyCol = Get-FirstColumn -Columns $detailCols -Candidates @('ShippedQty','QtyShipped','QuantityShipped','ShipQty')

  if (-not $detIdCol -or -not $detOrdIdCol -or -not $detOrdQtyCol) {
    throw "OrderDetail column mapping failed. Detail cols: $($detailCols -join ', ')"
  }

  $openQtyExpr = if ($detShipQtyCol) {
    "(ISNULL(d.$(Quote-SqlIdentifier $detOrdQtyCol),0) - ISNULL(d.$(Quote-SqlIdentifier $detShipQtyCol),0))"
  } else {
    "ISNULL(d.$(Quote-SqlIdentifier $detOrdQtyCol),0)"
  }

  $priceCol      = Get-FirstColumn -Columns $detailCols -Candidates @('Price','UnitPrice','SalesPrice','SellingPrice')
  $unitPriceExpr = if ($priceCol) { "ISNULL(d.$(Quote-SqlIdentifier $priceCol),0) AS unit_price" } else { "0 AS unit_price" }
  $extendedExpr  = if ($priceCol) { "($openQtyExpr * ISNULL(d.$(Quote-SqlIdentifier $priceCol),0)) AS extended_value" } else { "0 AS extended_value" }
  $skuExpr       = if ($detSkuCol) { "CAST(d.$(Quote-SqlIdentifier $detSkuCol) AS NVARCHAR(128)) AS sku" } else { "NULL AS sku" }

  # stock_class is on OrderDetail directly as ProductClass
  $prodJoin = ''
  $detClassCol = Get-FirstColumn -Columns $detailCols -Candidates @('ProductClass','Class')
  $stockClassExpr = if ($detClassCol) {
    "CAST(d.$(Quote-SqlIdentifier $detClassCol) AS NVARCHAR(128)) AS stock_class"
  } else { "NULL AS stock_class" }

  Write-Host "  [diag] sales-orders source = dbo.OrderManagementSummary (Open Only: Scheduled/Backordered/Booked)" -ForegroundColor DarkCyan

  return @"
SELECT
  CAST(d.$(Quote-SqlIdentifier $detIdCol) AS NVARCHAR(64)) AS acctivate_id,
  CAST(h.OrderNumber AS NVARCHAR(64)) AS order_number,
  $skuExpr,
  CAST(h.CustomerID AS NVARCHAR(64)) AS dealer_acctivate_id,
  $openQtyExpr AS qty_open,
  $unitPriceExpr,
  $extendedExpr,
  CONVERT(VARCHAR(10), h.OrderDate, 23) AS order_date,
  CONVERT(VARCHAR(10), h.ShipmentPromisedDate, 23) AS promised_date,
  CAST(h.SalespersonName AS NVARCHAR(255)) AS rep,
  $stockClassExpr
FROM dbo.OrderDetail d
INNER JOIN dbo.OrderManagementSummary h ON h.GUIDOrder = d.$(Quote-SqlIdentifier $detOrdIdCol)
$prodJoin
WHERE h.OrderStatus IN ('Scheduled','Backordered','Booked')
  AND $openQtyExpr > 0
"@
}

function Test-SqlTableExists {
  param([string]$Schema = 'dbo', [string]$Table)
  $rows = Invoke-Sql -Query "SELECT 1 AS found FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = '$Schema' AND TABLE_NAME = '$Table'"
  return ($rows.Count -gt 0)
}

function New-TerritoriesQuery {
  if (Test-SqlTableExists -Table 'Territory') {
    $columns = Get-SqlColumns -Table 'Territory'
    $idCol = Get-FirstColumn -Columns $columns -Candidates @('TerritoryCode', 'TerritoryID', 'TerritoryId', 'Code', 'ID', 'Name')
    $nameCol = Get-FirstColumn -Columns $columns -Candidates @('TerritoryName', 'Name', 'Description', 'TerritoryCode', 'TerritoryID')
    if ($idCol -and $nameCol) {
      return @"
SELECT DISTINCT
  CAST($(Quote-SqlIdentifier $idCol) AS NVARCHAR(64)) AS acctivate_id,
  CAST($(Quote-SqlIdentifier $nameCol) AS NVARCHAR(255)) AS name
FROM dbo.Territory
WHERE $(Quote-SqlIdentifier $idCol) IS NOT NULL
"@
    }
  }

  if (Test-SqlTableExists -Table 'tbCustomer') {
    $columns = Get-SqlColumns -Table 'tbCustomer'
    $territoryCol = Get-FirstColumn -Columns $columns -Candidates @('_Territory', 'Territory', 'TerritoryCode', 'TerritoryID', 'SalesTerritory')
    if ($territoryCol) {
      return @"
SELECT DISTINCT
  CAST($(Quote-SqlIdentifier $territoryCol) AS NVARCHAR(64)) AS acctivate_id,
  CAST($(Quote-SqlIdentifier $territoryCol) AS NVARCHAR(255)) AS name
FROM dbo.tbCustomer
WHERE $(Quote-SqlIdentifier $territoryCol) IS NOT NULL
  AND LTRIM(RTRIM(CAST($(Quote-SqlIdentifier $territoryCol) AS NVARCHAR(255)))) <> ''
"@
    }
  }

  Write-Warning "No dbo.Territory table or tbCustomer territory column found; territories will be skipped."
  return "SELECT CAST(NULL AS NVARCHAR(64)) AS acctivate_id, CAST(NULL AS NVARCHAR(255)) AS name WHERE 1 = 0"
}

function New-AcctivateSalesRepsQuery {
  $spCols = Get-SqlColumns -Table 'SalespersonInfo'
  $idCol = Get-FirstColumn -Columns $spCols -Candidates @('SalespersonID', 'SalespersonId', 'ID')
  $nameCol = Get-FirstColumn -Columns $spCols -Candidates @('Name', 'SalespersonName')
  if (-not $idCol -or -not $nameCol) {
    throw "Could not map dbo.SalespersonInfo id/name columns. Found columns: $($spCols -join ', ')"
  }

  $managerCol = Get-FirstColumn -Columns $spCols -Candidates @('SalesManagerID', 'SalesManagerId', 'ManagerID', 'ManagerId')
  $territoryCol = Get-FirstColumn -Columns $spCols -Candidates @('TerritoryID', 'TerritoryId', 'TerritoryCode', 'Territory')
  $inactiveCol = Get-FirstColumn -Columns $spCols -Candidates @('Inactive', 'IsInactive', 'Active')
  $managerSelect = if ($managerCol) { "CAST(sp.$(Quote-SqlIdentifier $managerCol) AS NVARCHAR(64)) AS manager_acctivate_id" } else { "CAST(NULL AS NVARCHAR(64)) AS manager_acctivate_id" }
  $managerNameSelect = if ($managerCol) { "mgr.$(Quote-SqlIdentifier $nameCol) AS manager_name" } else { "CAST(NULL AS NVARCHAR(255)) AS manager_name" }
  $managerJoin = if ($managerCol) { "LEFT JOIN dbo.SalespersonInfo mgr ON mgr.$(Quote-SqlIdentifier $idCol) = sp.$(Quote-SqlIdentifier $managerCol)" } else { "" }
  $territorySelect = if ($territoryCol) { "CAST(sp.$(Quote-SqlIdentifier $territoryCol) AS NVARCHAR(64)) AS territory_acctivate_id" } else { "CAST(NULL AS NVARCHAR(64)) AS territory_acctivate_id" }
  $territoryNameSelect = if ($territoryCol) { "CAST(sp.$(Quote-SqlIdentifier $territoryCol) AS NVARCHAR(255)) AS territory_name" } else { "CAST(NULL AS NVARCHAR(255)) AS territory_name" }
  $activeSelect = if ($inactiveCol -and $inactiveCol -ieq 'Active') { "CASE WHEN ISNULL(sp.$(Quote-SqlIdentifier $inactiveCol),0) = 1 THEN 1 ELSE 0 END AS active" } elseif ($inactiveCol) { "CASE WHEN ISNULL(sp.$(Quote-SqlIdentifier $inactiveCol),0) = 0 THEN 1 ELSE 0 END AS active" } else { "1 AS active" }

  return @"
SELECT
  CAST(sp.$(Quote-SqlIdentifier $idCol) AS NVARCHAR(64)) AS acctivate_id,
  CAST(sp.$(Quote-SqlIdentifier $idCol) AS NVARCHAR(64)) AS rep_code,
  sp.$(Quote-SqlIdentifier $nameCol) AS name,
  CAST(NULL AS NVARCHAR(255)) AS email,
  CAST(NULL AS NVARCHAR(64)) AS phone,
  $managerSelect,
  $managerNameSelect,
  $territorySelect,
  $territoryNameSelect,
  $activeSelect
FROM dbo.SalespersonInfo sp
$managerJoin
WHERE sp.$(Quote-SqlIdentifier $nameCol) IS NOT NULL
"@
}

function Send-Batch {
  param([string]$Table, [array]$Rows, [string]$OnConflict = 'acctivate_id')
  if (-not $Rows -or $Rows.Count -eq 0) {
    Write-Host "  [$Table] no rows" -ForegroundColor DarkGray
    return
  }
  $total = $Rows.Count
  $sent  = 0
  for ($i = 0; $i -lt $total; $i += $BatchSize) {
    $chunk = $Rows[$i..([Math]::Min($i + $BatchSize - 1, $total - 1))]
    $payload = @{
      table        = $Table
      rows         = $chunk
      on_conflict  = $OnConflict
    } | ConvertTo-Json -Depth 8 -Compress

    $attempt = 0
    while ($true) {
      $attempt++
      try {
        $resp = Invoke-RestMethod `
          -Method Post `
          -Uri $FunctionUrl `
          -Headers @{ Authorization = "Bearer $SyncToken"; 'Content-Type' = 'application/json' } `
          -Body $payload `
          -TimeoutSec $RequestTimeoutSeconds
        break
      } catch {
        if ($attempt -ge $MaxRetries) {
          throw "Sync failed for $Table batch starting $i after $attempt attempts: $($_.Exception.Message)"
        }
        Write-Warning "[$Table] batch starting $i failed on attempt $attempt/$MaxRetries; retrying in $RetryDelaySeconds seconds: $($_.Exception.Message)"
        Start-Sleep -Seconds $RetryDelaySeconds
      }
    }

    if (-not $resp.success) {
      throw "Sync failed for $Table batch starting $i : $($resp.error)"
    }
    $sent += $chunk.Count
    Write-Host "  [$Table] $sent / $total at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor DarkCyan
  }
}

# ---------- Table queries ----------
# Customize these SELECTs to match YOUR Acctivate schema.
# Each query must return columns that map to the public.<table> shape,
# and MUST include an `acctivate_id` text column used for upsert conflict resolution.

$queries = @{
  managers = @"
-- Intentionally no CTE/WITH here; some Acctivate SQL Server versions reject
-- CTE batches unless the previous statement is explicitly terminated.
SELECT
  CAST(EmployeeId AS NVARCHAR(64))                                AS acctivate_id,
  LTRIM(RTRIM(ISNULL(FirstName,'') + ' ' + ISNULL(LastName,'')))  AS name,
  EMail                                                            AS email
FROM dbo.Employee
WHERE Active = 1
  AND JobTitle LIKE '%manager%'
"@

  sales_reps = @"
SELECT
  CAST(SalespersonID AS NVARCHAR(64)) AS acctivate_id,
  Name                                AS name,
  CAST(NULL AS NVARCHAR(255))         AS email,
  CAST(NULL AS NVARCHAR(64))          AS phone
FROM dbo.SalespersonInfo
WHERE Name IS NOT NULL
"@

  territories = @"
SELECT DISTINCT
  CAST(TerritoryCode AS NVARCHAR(64)) AS acctivate_id,
  TerritoryName                       AS name
FROM dbo.Territory
"@

  dealers = @"
SELECT
  CAST(cv.CustId AS NVARCHAR(64)) AS acctivate_id,
  COALESCE(NULLIF(LTRIM(RTRIM(cv.CompanyName)), ''), NULLIF(LTRIM(RTRIM(cv.Name)), ''), 'Customer ' + CAST(cv.CustId AS NVARCHAR(64))) AS name,
  cv.Email                        AS email,
  cv.Phone                        AS phone,
  cv.Address                      AS street_address,
  cv.City                         AS city,
  cv.State                        AS state,
  cv.SalespersonName              AS salesperson,
  CAST(cv.SalespersonID AS NVARCHAR(64)) AS rep_owner,
  tc._Territory                   AS territory,
  tc._SalesManager                AS sales_manager,
  CASE WHEN LOWER(CAST(cv.Status AS NVARCHAR(32))) IN ('1', 'inactive') THEN 'inactive' ELSE 'active' END AS status
FROM dbo.Customer cv
LEFT JOIN dbo.tbCustomer tc ON tc.CustID = cv.CustID
WHERE cv.CustID IS NOT NULL
  AND cv.CustID NOT LIKE '%(deleted)%'
"@


  products = @"
SELECT
  CAST(p.ProductID AS NVARCHAR(64)) AS acctivate_id,
  p.ProductID                       AS sku,
  p.Description                     AS name,
  p.ProductClassID                  AS collection,
  p.SalesCategory                   AS category,
  p.ListPrice                       AS price
FROM dbo.Product p
WHERE ISNULL(p.Discontinued, 0) = 0
"@

  inventory = @"
SET LOCK_TIMEOUT 30000;
SELECT
  CAST(i.ProductID AS NVARCHAR(64)) AS acctivate_id,
  p.ProductID                       AS sku,
  SUM(i.QtyOnHand)                  AS on_hand,
  SUM(i.Available)                  AS available
FROM dbo.ProductWarehouseSummary i
JOIN dbo.Product p ON p.ProductID = i.ProductID
GROUP BY i.ProductID, p.ProductID
"@

  acctivate_sales_reps = @"
SELECT
  CAST(sp.SalespersonID AS NVARCHAR(64))           AS acctivate_id,
  CAST(sp.SalespersonID AS NVARCHAR(64))           AS rep_code,
  sp.Name                                          AS name,
  CAST(NULL AS NVARCHAR(255))                      AS email,
  CAST(NULL AS NVARCHAR(64))                       AS phone,
  CAST(sp.SalesManagerID AS NVARCHAR(64))          AS manager_acctivate_id,
  mgr.Name                                         AS manager_name,
  CAST(sp.TerritoryID AS NVARCHAR(64))             AS territory_acctivate_id,
  terr.Name                                        AS territory_name,
  CASE WHEN ISNULL(sp.Inactive,0) = 0 THEN 1 ELSE 0 END AS active
FROM dbo.SalespersonInfo sp
LEFT JOIN dbo.SalespersonInfo mgr ON mgr.SalespersonID = sp.SalesManagerID
LEFT JOIN dbo.Territory terr ON terr.TerritoryID = sp.TerritoryID
WHERE sp.Name IS NOT NULL
"@

  acctivate_sales_managers = @"
SELECT DISTINCT
  CAST(sp.SalespersonID AS NVARCHAR(64))  AS acctivate_id,
  CAST(sp.SalespersonID AS NVARCHAR(64))  AS manager_code,
  sp.Name                                  AS name,
  CAST(NULL AS NVARCHAR(255))              AS email,
  CAST(NULL AS NVARCHAR(64))               AS phone,
  CAST('Sales Manager' AS NVARCHAR(128))   AS job_title,
  CASE WHEN ISNULL(sp.Inactive,0) = 0 THEN 1 ELSE 0 END AS active
FROM dbo.SalespersonInfo sp
WHERE sp.SalespersonID IN (SELECT DISTINCT SalesManagerID FROM dbo.SalespersonInfo WHERE SalesManagerID IS NOT NULL)
"@

  acctivate_territories = @"
SELECT
  CAST(t.TerritoryID AS NVARCHAR(64))      AS acctivate_id,
  CAST(t.TerritoryID AS NVARCHAR(64))      AS territory_code,
  t.Name                                    AS name,
  t.Description                             AS description,
  CAST(t.SalesManagerID AS NVARCHAR(64))   AS manager_acctivate_id,
  mgr.Name                                  AS manager_name,
  CASE WHEN ISNULL(t.Inactive,0) = 0 THEN 1 ELSE 0 END AS active
FROM dbo.Territory t
LEFT JOIN dbo.SalespersonInfo mgr ON mgr.SalespersonID = t.SalesManagerID
"@
}

$queries['dealer_invoices']      = New-DealerInvoicesQuery
$queries['dealer_invoice_lines'] = New-DealerInvoiceLinesQuery
$queries['open_sales_orders']    = New-OpenSalesOrdersQuery

$tableAliases = @{
  dealer_invoice_line  = 'dealer_invoice_lines'
  invoice_line         = 'dealer_invoice_lines'
  invoice_lines        = 'dealer_invoice_lines'
  invoice_detail       = 'dealer_invoice_lines'
  invoice_details      = 'dealer_invoice_lines'
  dealer_sales_line    = 'dealer_invoice_lines'
  dealer_sales_lines   = 'dealer_invoice_lines'
  open_orders          = 'open_sales_orders'
  open_sales           = 'open_sales_orders'
  sales_orders         = 'open_sales_orders'
  backlog              = 'open_sales_orders'
}

function Normalize-TableKey {
  param([string]$Table)
  $key = $Table.Trim().Trim([char]39).Trim([char]34).ToLowerInvariant()
  if ($tableAliases.ContainsKey($key)) { return $tableAliases[$key] }
  return $key
}

# ---------- Run ----------
$enabled = if ($Tables) {
  @($Tables) | ForEach-Object { $_ -split '[,\s]+' } | ForEach-Object { Normalize-TableKey $_ } | Where-Object { $_ }
} else {
  @($config.enabledTables) | ForEach-Object { Normalize-TableKey $_ } | Where-Object { $_ }
}
if (-not $enabled -or $enabled.Count -eq 0) {
  $enabled = $queries.Keys
}

Write-Host "Acctivate sync starting -> $FunctionUrl" -ForegroundColor Cyan
Write-Host "Tables: $($enabled -join ', ')" -ForegroundColor Cyan
if ($Prune) {
  Write-Host "Prune: enabled for dealers; field check-in history is protected" -ForegroundColor Cyan
}

foreach ($table in $enabled) {
  if (-not $queries.ContainsKey($table)) {
    Write-Warning "No query defined for '$table' — skipping. Available: $($queries.Keys -join ', ')"
    continue
  }
  Write-Host "==> $table at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Yellow
  $rows = Invoke-Sql -Query $queries[$table]
  Write-Host "  pulled $($rows.Count) rows from SQL"
  Send-Batch -Table $table -Rows $rows -OnConflict 'acctivate_id'

  # Optional prune for dealers (remove anything no longer in Acctivate).
  # The backend preserves dealers that have field check-in history.
  if ($Prune -and $table -eq 'dealers') {
    $keepIds = @($rows | ForEach-Object { [string]$_.acctivate_id } | Where-Object { $_ })
    $prunePayload = @{
      action             = 'prune'
      table              = 'dealers'
      keep_acctivate_ids = $keepIds
    } | ConvertTo-Json -Depth 4 -Compress
    $pruneResp = Invoke-RestMethod `
      -Method Post `
      -Uri $FunctionUrl `
      -Headers @{ Authorization = "Bearer $SyncToken"; 'Content-Type' = 'application/json' } `
      -Body $prunePayload
    $preserved = if ($null -ne $pruneResp.preserved_with_history) { [int]$pruneResp.preserved_with_history } else { 0 }
    Write-Host "  [dealers] pruned $($pruneResp.pruned) stale rows; preserved $preserved stale dealers with check-in history" -ForegroundColor DarkMagenta
  }
}

Write-Host "Done." -ForegroundColor Green
