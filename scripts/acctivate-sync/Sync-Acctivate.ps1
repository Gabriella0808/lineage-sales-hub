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
  # Auto-discover Acctivate's sales-order header + detail tables
  $headerTable = $null
  foreach ($candidate in @('SalesOrder', 'OrderHeader', 'Order', 'SO')) {
    $found = Invoke-Sql -Query "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='$candidate'"
    if ($found.Count -gt 0) { $headerTable = $candidate; break }
  }
  if (-not $headerTable) { throw "Could not find a sales-order header table (tried SalesOrder, OrderHeader, Order, SO)." }

  $detailTable = $null
  foreach ($candidate in @('SalesOrderDetail', 'OrderDetail', 'OrderLine', 'SalesOrderLine', 'SODetail', 'OrderItem')) {
    $found = Invoke-Sql -Query "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='$candidate'"
    if ($found.Count -gt 0) { $detailTable = $candidate; break }
  }
  if (-not $detailTable) { throw "Could not find a sales-order detail table (tried SalesOrderDetail, OrderDetail, OrderLine, SalesOrderLine, SODetail, OrderItem)." }

  $hdrCols    = Get-SqlColumns -Table $headerTable
  $detailCols = Get-SqlColumns -Table $detailTable
  $prodCols   = Get-SqlColumns -Table 'Product'

  $hdrIdCol    = Get-FirstColumn -Columns $hdrCols -Candidates @('GUIDSalesOrder', 'SalesOrderID', 'SalesOrderId', 'OrderID', 'OrderId', 'GUIDOrder', 'ID')
  $hdrNumCol   = Get-FirstColumn -Columns $hdrCols -Candidates @('OrderNumber', 'SalesOrderNumber', 'OrderNo', 'SONumber', 'Number')
  $hdrCustCol  = Get-FirstColumn -Columns $hdrCols -Candidates @('CustID', 'CustId', 'CustomerID', 'CustomerId', 'CustomerNumber', 'CustNo', 'Customer', 'BillToCustID')
  $hdrDateCol  = Get-FirstColumn -Columns $hdrCols -Candidates @('OrderDate', 'Date', 'CreatedDate')
  $hdrPromCol  = Get-FirstColumn -Columns $hdrCols -Candidates @('PromisedDate', 'RequestedShipDate', 'ShipDate', 'ScheduledShipDate', 'RequiredDate')
  $hdrRepCol   = Get-FirstColumn -Columns $hdrCols -Candidates @('SalespersonName', 'Salesperson', 'SalesPerson', 'SalesRep')
  $hdrStatusCol = Get-FirstColumn -Columns $hdrCols -Candidates @('OrderStatus', 'Status', 'OrderStatusID')

  $detIdCol    = Get-FirstColumn -Columns $detailCols -Candidates @('GUIDSalesOrderDetail', 'SalesOrderDetailID', 'OrderDetailID', 'OrderLineID', 'LineID', 'GUIDOrderDetail', 'DetailID', 'ID')
  $detOrdIdCol = Get-FirstColumn -Columns $detailCols -Candidates @('GUIDSalesOrder', 'SalesOrderID', 'OrderID', 'GUIDOrder', 'OrderId', 'SalesOrderId')
  $detSkuCol   = Get-FirstColumn -Columns $detailCols -Candidates @('ProductID', 'ProductCode', 'ItemCode', 'SKU', 'ItemNumber')
  $detProdIdCol = Get-FirstColumn -Columns $detailCols -Candidates @('GUIDProduct', 'ProductGUID', 'ProductID', 'ItemID')
  $detOrdQtyCol = Get-FirstColumn -Columns $detailCols -Candidates @('OrderedQty', 'QtyOrdered', 'QuantityOrdered', 'OrderQty', 'Quantity', 'Qty')
  $detShipQtyCol = Get-FirstColumn -Columns $detailCols -Candidates @('ShippedQty', 'QtyShipped', 'QuantityShipped', 'ShipQty')

  if (-not $hdrIdCol -or -not $hdrCustCol -or -not $detIdCol -or -not $detOrdIdCol -or -not $detOrdQtyCol) {
    throw "Could not map required columns. Header has: $($hdrCols -join ', '); Detail has: $($detailCols -join ', ')"
  }

  # Open qty = Ordered - Shipped (or just Ordered if no shipped column)
  $openQtyExpr = if ($detShipQtyCol) {
    "(ISNULL(d.$(Quote-SqlIdentifier $detOrdQtyCol),0) - ISNULL(d.$(Quote-SqlIdentifier $detShipQtyCol),0))"
  } else {
    "ISNULL(d.$(Quote-SqlIdentifier $detOrdQtyCol),0)"
  }

  $unitPriceExpr = New-SelectExpression -Columns $detailCols -Candidates @('Price', 'UnitPrice', 'SalesPrice', 'SellingPrice') -Alias 'unit_price' -Default '0' -TableAlias 'd'
  $orderDateExpr = if ($hdrDateCol) { "CONVERT(VARCHAR(10), h.$(Quote-SqlIdentifier $hdrDateCol), 23) AS order_date" } else { "NULL AS order_date" }
  $promDateExpr  = if ($hdrPromCol) { "CONVERT(VARCHAR(10), h.$(Quote-SqlIdentifier $hdrPromCol), 23) AS promised_date" } else { "NULL AS promised_date" }
  $orderNumExpr  = if ($hdrNumCol) { "CAST(h.$(Quote-SqlIdentifier $hdrNumCol) AS NVARCHAR(64)) AS order_number" } else { "NULL AS order_number" }
  $repExpr       = if ($hdrRepCol) { "CAST(h.$(Quote-SqlIdentifier $hdrRepCol) AS NVARCHAR(255)) AS rep" } else { "NULL AS rep" }
  $skuExpr       = if ($detSkuCol) { "CAST(d.$(Quote-SqlIdentifier $detSkuCol) AS NVARCHAR(128)) AS sku" } else { "NULL AS sku" }

  Write-Host "  [diag] Product cols: $($prodCols -join ', ')" -ForegroundColor DarkCyan
  Write-Host "  [diag] detProdIdCol = $detProdIdCol" -ForegroundColor DarkCyan

  # Join Product → ProductClass lookup so stock_class becomes the human name.
  $prodJoin = ''
  $stockClassExpr = "NULL AS stock_class"
  if ($detProdIdCol) {
    $prodKeyOnProd = Get-FirstColumn -Columns $prodCols -Candidates @($detProdIdCol, 'GUIDProduct', 'ProductID', 'ProductCode')
    if ($prodKeyOnProd) {
      $prodJoin = "LEFT JOIN dbo.Product p ON p.$(Quote-SqlIdentifier $prodKeyOnProd) = d.$(Quote-SqlIdentifier $detProdIdCol)"

      $prodClassCol = Get-FirstColumn -Columns $prodCols -Candidates @('ProductClassID','ProductClassId','ProductClass','ClassID','ClassId','Class')

      $classTable = $null
      foreach ($candidate in @('ProductClass','ProductClasses','ItemClass','Class')) {
        $found = Invoke-Sql -Query "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='$candidate'"
        if ($found.Count -gt 0) { $classTable = $candidate; break }
      }

      if ($classTable -and $prodClassCol) {
        $classCols    = Get-SqlColumns -Table $classTable
        $classKeyCol  = Get-FirstColumn -Columns $classCols -Candidates @($prodClassCol,'ProductClassID','ProductClassId','ClassID','ClassId','ID')
        $classNameCol = Get-FirstColumn -Columns $classCols -Candidates @('ProductClass','ClassName','Name','Description','Class')
        if ($classKeyCol -and $classNameCol) {
          $prodJoin += " LEFT JOIN dbo.$classTable pc ON pc.$(Quote-SqlIdentifier $classKeyCol) = p.$(Quote-SqlIdentifier $prodClassCol)"
          $stockClassExpr = "CAST(pc.$(Quote-SqlIdentifier $classNameCol) AS NVARCHAR(128)) AS stock_class"
        } else {
          $stockClassExpr = "CAST(p.$(Quote-SqlIdentifier $prodClassCol) AS NVARCHAR(128)) AS stock_class"
        }
      } elseif ($prodClassCol) {
        $stockClassExpr = "CAST(p.$(Quote-SqlIdentifier $prodClassCol) AS NVARCHAR(128)) AS stock_class"
      }
    }
  }

  $statusFilter = if ($hdrStatusCol) {
    "AND (h.$(Quote-SqlIdentifier $hdrStatusCol) IS NULL OR h.$(Quote-SqlIdentifier $hdrStatusCol) NOT IN ('Closed','Cancelled','Canceled','Void','C','X'))"
  } else { "" }

  return @"
SELECT
  CAST(d.$(Quote-SqlIdentifier $detIdCol) AS NVARCHAR(64)) AS acctivate_id,
  $orderNumExpr,
  $skuExpr,
  CAST(h.$(Quote-SqlIdentifier $hdrCustCol) AS NVARCHAR(64)) AS dealer_acctivate_id,
  $openQtyExpr AS qty_open,
  $unitPriceExpr,
  ($openQtyExpr * ISNULL(d.$(Quote-SqlIdentifier (Get-FirstColumn -Columns $detailCols -Candidates @('Price','UnitPrice','SalesPrice','SellingPrice'))),0)) AS extended_value,
  $orderDateExpr,
  $promDateExpr,
  $repExpr,
  $stockClassExpr
FROM dbo.$detailTable d
INNER JOIN dbo.$headerTable h ON h.$(Quote-SqlIdentifier $hdrIdCol) = d.$(Quote-SqlIdentifier $detOrdIdCol)
$prodJoin
WHERE $openQtyExpr > 0
  $statusFilter
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
SELECT
  CAST(EmployeeID AS NVARCHAR(64)) AS acctivate_id,
  EmployeeName                     AS name,
  Email                            AS email
FROM dbo.Employee
WHERE IsSalesManager = 1
"@

  sales_reps = @"
SELECT
  CAST(SalespersonID AS NVARCHAR(64)) AS acctivate_id,
  SalespersonName                     AS name,
  Email                               AS email,
  Phone                               AS phone
FROM dbo.Salesperson
WHERE Inactive = 0
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
  p.ProductCode                     AS sku,
  p.Description                     AS name,
  p.ProductClass                    AS collection,
  p.ProductCategory                 AS category,
  p.SalesPrice                      AS price
FROM dbo.Product p
WHERE p.Inactive = 0
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
