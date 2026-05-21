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
  $conn.Open()
  try {
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = $Query
    $cmd.CommandTimeout = 300
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
  $poExpr
FROM dbo.Invoice inv
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

  $detailIdCol = Get-FirstColumn -Columns $detailCols -Candidates @('InvoiceDetailID', 'InvoiceDetailId', 'InvoiceLineID', 'InvoiceLineId', 'LineID', 'LineId', 'DetailID', 'DetailId', 'ID')
  $invIdCol    = Get-FirstColumn -Columns $detailCols -Candidates @('InvoiceID', 'InvoiceId', 'InvoiceGUID', 'InvoiceGuid')
  $skuCol      = Get-FirstColumn -Columns $detailCols -Candidates @('ProductCode', 'ItemCode', 'SKU', 'ItemNumber', 'PartNumber')
  $productIdCol = Get-FirstColumn -Columns $detailCols -Candidates @('ProductID', 'ProductId', 'ItemID', 'ItemId')

  if (-not $detailIdCol -or -not $invIdCol) {
    throw "Could not map dbo.$detailTable line/invoice id columns. Found: $($detailCols -join ', ')"
  }

  $hdrInvIdCol     = Get-FirstColumn -Columns $hdrCols -Candidates @('InvoiceID', 'InvoiceId', 'InvoiceGUID', 'InvoiceGuid', 'ID')
  $hdrCustomerCol  = Get-FirstColumn -Columns $hdrCols -Candidates @('CustID', 'CustId', 'CustomerID', 'CustomerId', 'CustomerNumber', 'CustNo', 'Customer', 'BillToCustID', 'BillToCustomerID')
  $hdrDateCol      = Get-FirstColumn -Columns $hdrCols -Candidates @('InvoiceDate', 'Date', 'DocDate', 'PostDate')
  if (-not $hdrInvIdCol -or -not $hdrCustomerCol) {
    throw "Could not map dbo.Invoice id/customer columns for invoice-line join."
  }

  $skuExpr        = if ($skuCol) { "CAST(d.$(Quote-SqlIdentifier $skuCol) AS NVARCHAR(128)) AS sku" } else { "NULL AS sku" }
  $nameExpr       = New-SelectExpression -Columns $detailCols -Candidates @('Description', 'ProductDescription', 'ItemDescription', 'Name') -Alias 'product_name' -Cast 'NVARCHAR(512)' -TableAlias 'd'
  $qtyExpr        = New-SelectExpression -Columns $detailCols -Candidates @('Quantity', 'Qty', 'QuantityShipped', 'QtyShipped', 'QuantityInvoiced') -Alias 'qty' -Default '0' -TableAlias 'd'
  $unitPriceExpr  = New-SelectExpression -Columns $detailCols -Candidates @('UnitPrice', 'Price', 'SalesPrice', 'SellingPrice') -Alias 'unit_price' -Default '0' -TableAlias 'd'
  $extPriceExpr   = New-SelectExpression -Columns $detailCols -Candidates @('ExtendedPrice', 'ExtPrice', 'LineTotal', 'Amount', 'NetAmount', 'TotalPrice') -Alias 'extended_price' -Default '0' -TableAlias 'd'
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

    $resp = Invoke-RestMethod `
      -Method Post `
      -Uri $FunctionUrl `
      -Headers @{ Authorization = "Bearer $SyncToken"; 'Content-Type' = 'application/json' } `
      -Body $payload

    if (-not $resp.success) {
      throw "Sync failed for $Table batch starting $i : $($resp.error)"
    }
    $sent += $chunk.Count
    Write-Host "  [$Table] $sent / $total" -ForegroundColor DarkCyan
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
SELECT
  CAST(i.ProductID AS NVARCHAR(64)) AS acctivate_id,
  p.ProductCode                     AS sku,
  SUM(i.QuantityOnHand)             AS on_hand,
  SUM(i.QuantityAvailable)          AS available
FROM dbo.Inventory i
JOIN dbo.Product p ON p.ProductID = i.ProductID
GROUP BY i.ProductID, p.ProductCode
"@
}

$queries['dealer_invoices']      = New-DealerInvoicesQuery
$queries['dealer_invoice_lines'] = New-DealerInvoiceLinesQuery

# ---------- Run ----------
$enabled = if ($Tables) {
  @($Tables) | ForEach-Object { $_ -split '[,\s]+' } | ForEach-Object { $_.Trim().Trim([char]39).Trim([char]34) } | Where-Object { $_ }
} else {
  $config.enabledTables
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
    Write-Warning "No query defined for '$table' — skipping."
    continue
  }
  Write-Host "==> $table" -ForegroundColor Yellow
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
