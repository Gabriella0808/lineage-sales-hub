<#
.SYNOPSIS
  Diagnostic-only export: pulls July 2026 booking lines straight from live
  Acctivate SQL Server using Andrew's exact query logic, computes both
  NetAmount variants, and writes row-level + summary CSVs for manual
  reconciliation against the $803,338 target.

.DESCRIPTION
  This script makes NO writes anywhere - not to Acctivate, not to Supabase,
  not to any portal table, view, or RPC. It only reads from Acctivate SQL
  Server and writes CSV files to the local filesystem. Nothing in the portal
  (bookings formula, Live KPI, Dealer Reporting, Rep Reporting, invoices) is
  touched by running this.

  Source logic (Andrew's July bookings query, applied exactly):
    FROM Orders o INNER JOIN OrderDetail od ON o.GUIDOrder = od.GUIDOrder
    WHERE o.OrderDate is in July 2026
      AND ISNULL(o.OrderStatusDescription,'') <> 'Cancelled'
      AND ISNULL(od.LineCancelled,0) = 0
      AND ISNULL(o.Type,'') <> 'Q'

  SalesCategory is NOT filtered at the SQL level - every row in the
  structural filter above is pulled and exported, so the by-SalesCategory
  summary shows the full picture (including what would be excluded). The
  "included" SalesCategory set (NULL, ALLOW, FINNLOU, LUX, SW) is applied
  only when building the other summaries (branch/status/type/reference/
  commission-override/dealer/orders-over-$10k) and the final console total,
  since those are meant to reflect what actually feeds the $803,338
  reconciliation target.

  Two NetAmount columns are computed for every row, per the explicit
  requirement that LineDiscountPct is NOT auto-coalesced for bookings
  (unlike the July invoice query, which does coalesce it):
    - net_amount_strict_powerquery: (_OriginalPrice * QtyOrdered) *
      (1 - (LineDiscountPct / 100)). If LineDiscountPct (or _OriginalPrice
      or QtyOrdered) is NULL, this is NULL - SQL's native null propagation,
      matching how Power Query would evaluate the same expression - and a
      NULL value does not contribute to any of the summed totals below.
    - net_amount_null_discount_as_zero: same formula, but LineDiscountPct
      is ISNULL(...,0) first. _OriginalPrice/QtyOrdered are NOT coalesced
      in this variant either - only the discount-null behavior differs
      between the two columns, exactly as requested.

  Column availability varies across Acctivate versions/customizations, so
  CustomerID, Reference, _CommissionOverride, ProductClass, a raw OrderStatus
  code, and GUIDOrderDetail are all detected via INFORMATION_SCHEMA before
  building the query - if any are missing, that column exports as NULL and
  is reported in the schema-check output up front, rather than the script
  failing outright.

  Deploy to C:\AcctivateKPI\ on the LineageVM, alongside the existing sync
  scripts and kpi.config.json (same config file/format as
  pull-2026-invoiced-lines-direct.ps1 and
  backfill-july-invoice-original-price.ps1).

.PARAMETER ConfigPath
  Path to kpi.config.json. Defaults to .\kpi.config.json next to this script.

.PARAMETER OutputDir
  Directory the CSV files are written into. Defaults to
  C:\AcctivateKPI\exports (created if it does not already exist).

.EXAMPLE
  pwsh C:\AcctivateKPI\export-july-bookings-reconciliation.ps1
  pwsh C:\AcctivateKPI\export-july-bookings-reconciliation.ps1 -ConfigPath C:\AcctivateKPI\kpi.config.json

.NOTES
  kpi.config.json structure (same file already used by the other sync
  scripts on this VM):
  {
    "supabaseUrl":     "https://tcqpseblcwqjopbocfmr.supabase.co",
    "serviceRoleKey":  "YOUR_SERVICE_ROLE_KEY_HERE",
    "sql": {
      "server":                 ".\\ACCTIVATE",
      "database":               "Acctivate",
      "integratedSecurity":     true,
      "user":                   "",
      "password":               "",
      "commandTimeoutSeconds":  600
    }
  }
  Only the "sql" block is used by this script - supabaseUrl/serviceRoleKey
  are read from the same file for consistency with the other scripts but
  are never called.
#>

[CmdletBinding()]
param(
  [string]$ConfigPath = (Join-Path $PSScriptRoot 'kpi.config.json'),
  [string]$OutputDir  = 'C:\AcctivateKPI\exports'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Write-Section {
  param([string]$Title)
  Write-Host ''
  Write-Host ('=== ' + $Title + ' ===') -ForegroundColor Cyan
}

# --- Load config -------------------------------------------------------------

if (-not (Test-Path $ConfigPath)) {
  throw "Config file not found: $ConfigPath`nCreate kpi.config.json next to this script (see .NOTES for format)."
}

$cfg = Get-Content $ConfigPath -Raw | ConvertFrom-Json
$SqlTimeout = if ($cfg.sql.commandTimeoutSeconds) { [int]$cfg.sql.commandTimeoutSeconds } else { 600 }

if (-not (Test-Path $OutputDir)) {
  New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

# --- SQL connection ------------------------------------------------------------

$connStr = "Server=$($cfg.sql.server);Database=$($cfg.sql.database);Connection Timeout=30;"
if ($cfg.sql.integratedSecurity) {
  $connStr += "Integrated Security=SSPI;"
} else {
  $connStr += "User Id=$($cfg.sql.user);Password=$($cfg.sql.password);"
}
$connStr += "Encrypt=False;TrustServerCertificate=True;"

function Invoke-Sql {
  param([string]$Query)
  $conn = New-Object System.Data.SqlClient.SqlConnection $connStr
  $conn.Open()
  try {
    $cmd = $conn.CreateCommand()
    $cmd.CommandText    = $Query
    $cmd.CommandTimeout = $SqlTimeout
    $reader = $cmd.ExecuteReader()
    $rows   = [System.Collections.Generic.List[hashtable]]::new()
    while ($reader.Read()) {
      $row = @{}
      for ($i = 0; $i -lt $reader.FieldCount; $i++) {
        $col = $reader.GetName($i)
        $val = $reader.GetValue($i)
        $row[$col] = if ($val -is [System.DBNull]) { $null } else { $val }
      }
      $rows.Add($row) | Out-Null
    }
    return , [hashtable[]]$rows
  } finally {
    $conn.Close()
  }
}

function Test-ColumnExists {
  param([string]$Table, [string]$Column)
  $r = Invoke-Sql "SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                   WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='$Table' AND COLUMN_NAME='$Column'"
  return ($r.Count -gt 0)
}

# --- Discover optional columns ------------------------------------------------

Write-Section 'SCHEMA CHECK'

$hasCustomerId  = Test-ColumnExists -Table 'Orders'      -Column 'CustomerID'
$hasReference   = Test-ColumnExists -Table 'Orders'      -Column 'Reference'
$hasOrderStatus = Test-ColumnExists -Table 'Orders'      -Column 'OrderStatus'
$hasCommOverride = Test-ColumnExists -Table 'OrderDetail' -Column '_CommissionOverride'
$hasProductClass = Test-ColumnExists -Table 'OrderDetail' -Column 'ProductClass'
$hasGuidOrderDetail = Test-ColumnExists -Table 'OrderDetail' -Column 'GUIDOrderDetail'

Write-Host "  Orders.CustomerID           : $hasCustomerId"
Write-Host "  Orders.Reference            : $hasReference"
Write-Host "  Orders.OrderStatus          : $hasOrderStatus"
Write-Host "  OrderDetail._CommissionOverride : $hasCommOverride"
Write-Host "  OrderDetail.ProductClass    : $hasProductClass"
Write-Host "  OrderDetail.GUIDOrderDetail : $hasGuidOrderDetail"
if (-not ($hasCustomerId -and $hasReference -and $hasOrderStatus -and $hasCommOverride -and $hasProductClass -and $hasGuidOrderDetail)) {
  Write-Warning "  One or more optional columns are missing on this Acctivate instance - those fields will export as NULL/blank."
}

$customerIdExpr = if ($hasCustomerId)     { "CAST(ISNULL(o.CustomerID,'') AS NVARCHAR(64))" }      else { "CAST(NULL AS NVARCHAR(64))" }
$referenceExpr  = if ($hasReference)      { "CAST(ISNULL(o.Reference,'') AS NVARCHAR(128))" }      else { "CAST(NULL AS NVARCHAR(128))" }
$orderStatusExpr = if ($hasOrderStatus)   { "CAST(ISNULL(o.OrderStatus,'') AS NVARCHAR(32))" }      else { "CAST(NULL AS NVARCHAR(32))" }
$commOverrideExpr = if ($hasCommOverride) { "CAST(od._CommissionOverride AS NVARCHAR(64))" }        else { "CAST(NULL AS NVARCHAR(64))" }
$productClassExpr = if ($hasProductClass) { "CAST(ISNULL(od.ProductClass,'') AS NVARCHAR(128))" }   else { "CAST(NULL AS NVARCHAR(128))" }
$guidOrderDetailExpr = if ($hasGuidOrderDetail) { "CAST(od.GUIDOrderDetail AS NVARCHAR(64))" }      else { "CAST(NULL AS NVARCHAR(64))" }

# --- Build query ---------------------------------------------------------------
# SalesCategory is deliberately NOT filtered here - every structurally-valid
# July line is pulled so the by-SalesCategory summary is complete. The
# "included" category set is applied in PowerShell below, not in SQL.

$sql = @"
SELECT
  CONVERT(VARCHAR(10), o.OrderDate, 23)                        AS OrderDate,
  CAST(ISNULL(o.CompanyName,'') AS NVARCHAR(256))               AS CompanyName,
  $customerIdExpr                                               AS CustomerID,
  CAST(ISNULL(o.SalespersonID,'') AS NVARCHAR(64))              AS SalespersonID,
  CAST(o.OrderNumber AS NVARCHAR(64))                           AS OrderNumber,
  $referenceExpr                                                AS Reference,
  CAST(ISNULL(o.BranchID,'') AS NVARCHAR(64))                   AS BranchID,
  CAST(ISNULL(o.OrderStatusDescription,'') AS NVARCHAR(64))     AS OrderStatusDescription,
  $orderStatusExpr                                              AS OrderStatus,
  CAST(ISNULL(o.Type,'') AS NVARCHAR(16))                       AS Type,
  $commOverrideExpr                                             AS CommissionOverride,
  CAST(od.ProductID AS NVARCHAR(128))                           AS ProductID,
  CAST(ISNULL(od.SalesCategory,'') AS NVARCHAR(64))             AS SalesCategory,
  $productClassExpr                                             AS ProductClass,
  CAST(od.QtyOrdered AS DECIMAL(18,4))                          AS QtyOrdered,
  CAST(od.LineDiscountPct AS DECIMAL(18,4))                     AS LineDiscountPct,
  CAST(od._OriginalPrice AS DECIMAL(18,4))                      AS OriginalPrice,
  CAST(ISNULL(od.LineCancelled,0) AS BIT)                       AS LineCancelled,
  CAST(o.GUIDOrder AS NVARCHAR(64))                             AS GUIDOrder,
  $guidOrderDetailExpr                                          AS GUIDOrderDetail,
  (CAST(od._OriginalPrice AS DECIMAL(18,4)) * CAST(od.QtyOrdered AS DECIMAL(18,4)))
    * (1 - (CAST(od.LineDiscountPct AS DECIMAL(18,4)) / 100.0))                      AS NetAmountStrict,
  (CAST(od._OriginalPrice AS DECIMAL(18,4)) * CAST(od.QtyOrdered AS DECIMAL(18,4)))
    * (1 - (ISNULL(CAST(od.LineDiscountPct AS DECIMAL(18,4)),0) / 100.0))            AS NetAmountZeroDiscount
FROM dbo.Orders o
INNER JOIN dbo.OrderDetail od ON o.GUIDOrder = od.GUIDOrder
WHERE o.OrderDate >= '2026-07-01' AND o.OrderDate < '2026-08-01'
  AND ISNULL(o.OrderStatusDescription,'') <> 'Cancelled'
  AND ISNULL(od.LineCancelled,0) = 0
  AND ISNULL(o.Type,'') <> 'Q'
"@

Write-Section 'PULL FROM LIVE ACCTIVATE SQL SERVER'
Write-Host "  server   : $($cfg.sql.server)"
Write-Host "  database : $($cfg.sql.database)"
Write-Host "  scope    : OrderDate in July 2026, OrderStatusDescription <> Cancelled, LineCancelled = 0, Type <> Q"
Write-Host "  note     : SalesCategory NOT filtered here - full row set pulled for the by-SalesCategory breakdown"

$rows = Invoke-Sql -Query $sql
Write-Host "  rows fetched: $($rows.Count)" -ForegroundColor Green

if ($rows.Count -eq 0) {
  Write-Warning "No rows returned. Check the SQL connection and date range."
  exit 0
}

# --- Row-level export ----------------------------------------------------------
# Column order and names match the requested row-level export spec exactly.

Write-Section 'ROW-LEVEL EXPORT'

$rowLevelPath = Join-Path $OutputDir 'july-bookings-row-level.csv'
$rowLevel = $rows | ForEach-Object {
  [pscustomobject]@{
    OrderDate                       = $_['OrderDate']
    CompanyName                     = $_['CompanyName']
    CustomerID                      = $_['CustomerID']
    SalespersonID                   = $_['SalespersonID']
    OrderNumber                     = $_['OrderNumber']
    Reference                       = $_['Reference']
    BranchID                        = $_['BranchID']
    OrderStatusDescription          = $_['OrderStatusDescription']
    OrderStatus                     = $_['OrderStatus']
    Type                            = $_['Type']
    _CommissionOverride             = $_['CommissionOverride']
    ProductID                       = $_['ProductID']
    SalesCategory                   = $_['SalesCategory']
    ProductClass                    = $_['ProductClass']
    QtyOrdered                      = $_['QtyOrdered']
    LineDiscountPct                 = $_['LineDiscountPct']
    _OriginalPrice                  = $_['OriginalPrice']
    LineCancelled                   = $_['LineCancelled']
    GUIDOrder                       = $_['GUIDOrder']
    GUIDOrderDetail                 = $_['GUIDOrderDetail']
    net_amount_strict_powerquery    = $_['NetAmountStrict']
    net_amount_null_discount_as_zero = $_['NetAmountZeroDiscount']
  }
}
$rowLevel | Export-Csv -Path $rowLevelPath -NoTypeInformation -Encoding UTF8
Write-Host "  wrote $($rowLevel.Count) rows -> $rowLevelPath" -ForegroundColor Green

# --- Included SalesCategory set (applied only from here down) ------------------
# NULL, ALLOW, FINNLOU, LUX, SW - blank string is treated as the NULL case,
# matching how this project has handled blank-vs-null category values
# throughout the rest of the July reconciliation work.

$includedCategories = @('', 'ALLOW', 'FINNLOU', 'LUX', 'SW')
$included = $rows | Where-Object { $includedCategories -contains [string]$_['SalesCategory'] }
Write-Host "  rows in included SalesCategory set (NULL/ALLOW/FINNLOU/LUX/SW): $($included.Count)" -ForegroundColor Green

# --- Summary helper --------------------------------------------------------------

# PowerShell hashtables expose their keys via dot-notation (e.g. $row.SalesCategory
# resolves the same as $row['SalesCategory']) through the built-in ETS adapter, in
# both Windows PowerShell 5.1 and PowerShell 7 - so plain string property names
# work directly with Group-Object/Measure-Object without any scriptblock wrapper.
# (Scriptblock -Property args and the ?? operator are PowerShell 7+ only and would
# fail to parse under the VM's Windows PowerShell 5.1 - avoided entirely below.)

function Get-NumberOrZero {
  param($Value)
  if ($null -eq $Value) { return 0.0 }
  return [double]$Value
}

function Export-Summary {
  param(
    [hashtable[]]$Rows,
    [string]$GroupKey,
    [string]$OutFile,
    [string]$Label
  )
  $groups = $Rows | Group-Object -Property $GroupKey
  $summary = $groups | ForEach-Object {
    $grpRows = $_.Group
    $strictSum = ($grpRows | Where-Object { $null -ne $_['NetAmountStrict'] } | Measure-Object -Property NetAmountStrict -Sum).Sum
    $zeroSum   = ($grpRows | Where-Object { $null -ne $_['NetAmountZeroDiscount'] } | Measure-Object -Property NetAmountZeroDiscount -Sum).Sum
    $result = [ordered]@{
      line_count                           = $_.Count
      net_amount_strict_powerquery_sum     = [math]::Round((Get-NumberOrZero $strictSum), 2)
      net_amount_null_discount_as_zero_sum = [math]::Round((Get-NumberOrZero $zeroSum), 2)
    }
    $result.Insert(0, $GroupKey, $_.Name)
    [pscustomobject]$result
  } | Sort-Object net_amount_null_discount_as_zero_sum -Descending
  $path = Join-Path $OutputDir $OutFile
  $summary | Export-Csv -Path $path -NoTypeInformation -Encoding UTF8
  Write-Host "  $Label -> $path ($($summary.Count) groups)" -ForegroundColor Green
}

Write-Section 'SUMMARY EXPORTS'

# By SalesCategory: full row set, every category visible (not just included).
Export-Summary -Rows $rows     -GroupKey 'SalesCategory'          -OutFile 'july-bookings-summary-by-salescategory.csv'      -Label 'by SalesCategory (all categories)'

# Everything else: included SalesCategory set only - this is what actually
# feeds the $803,338 reconciliation target.
Export-Summary -Rows $included -GroupKey 'BranchID'               -OutFile 'july-bookings-summary-by-branch.csv'             -Label 'by BranchID'
Export-Summary -Rows $included -GroupKey 'OrderStatusDescription' -OutFile 'july-bookings-summary-by-status.csv'             -Label 'by OrderStatusDescription'
Export-Summary -Rows $included -GroupKey 'Type'                   -OutFile 'july-bookings-summary-by-type.csv'               -Label 'by Type'
Export-Summary -Rows $included -GroupKey 'Reference'               -OutFile 'july-bookings-summary-by-reference.csv'          -Label 'by Reference'
Export-Summary -Rows $included -GroupKey 'CommissionOverride'      -OutFile 'july-bookings-summary-by-commissionoverride.csv' -Label 'by _CommissionOverride'
Export-Summary -Rows $included -GroupKey 'CompanyName'             -OutFile 'july-bookings-summary-by-dealer.csv'             -Label 'by dealer (CompanyName)'

# --- Orders over $10,000 --------------------------------------------------------

Write-Section 'LARGE ORDERS (> $10,000, included SalesCategory set)'

$orderGroups = $included | Group-Object -Property OrderNumber
$largeOrders = $orderGroups | ForEach-Object {
  $grpRows = $_.Group
  $strictSum = ($grpRows | Where-Object { $null -ne $_['NetAmountStrict'] } | Measure-Object -Property NetAmountStrict -Sum).Sum
  $zeroSum   = ($grpRows | Where-Object { $null -ne $_['NetAmountZeroDiscount'] } | Measure-Object -Property NetAmountZeroDiscount -Sum).Sum
  [pscustomobject]@{
    OrderNumber                          = $_.Name
    CompanyName                          = $grpRows[0]['CompanyName']
    OrderDate                            = $grpRows[0]['OrderDate']
    BranchID                             = $grpRows[0]['BranchID']
    Type                                 = $grpRows[0]['Type']
    line_count                           = $_.Count
    net_amount_strict_powerquery_sum     = [math]::Round((Get-NumberOrZero $strictSum), 2)
    net_amount_null_discount_as_zero_sum = [math]::Round((Get-NumberOrZero $zeroSum), 2)
  }
} | Where-Object { $_.net_amount_null_discount_as_zero_sum -gt 10000 } | Sort-Object net_amount_null_discount_as_zero_sum -Descending

$largeOrdersPath = Join-Path $OutputDir 'july-bookings-orders-over-10000.csv'
$largeOrders | Export-Csv -Path $largeOrdersPath -NoTypeInformation -Encoding UTF8
Write-Host "  orders over `$10,000 -> $largeOrdersPath ($($largeOrders.Count) orders)" -ForegroundColor Green

# --- Console summary -------------------------------------------------------------

Write-Section 'RECONCILIATION SUMMARY'

$target = 803338.0
$strictSumAll = ($included | Where-Object { $null -ne $_['NetAmountStrict'] } | Measure-Object -Property NetAmountStrict -Sum).Sum
$zeroSumAll   = ($included | Where-Object { $null -ne $_['NetAmountZeroDiscount'] } | Measure-Object -Property NetAmountZeroDiscount -Sum).Sum
$totalStrict = [math]::Round((Get-NumberOrZero $strictSumAll), 2)
$totalZero   = [math]::Round((Get-NumberOrZero $zeroSumAll), 2)
$gapStrict   = [math]::Round($totalStrict - $target, 2)
$gapZero     = [math]::Round($totalZero - $target, 2)

Write-Host ("  total rows fetched (all categories)                : {0}" -f $rows.Count)
Write-Host ("  total rows in included SalesCategory set            : {0}" -f $included.Count)
Write-Host ("  total net_amount_strict_powerquery (included set)   : {0:N2}" -f $totalStrict) -ForegroundColor Green
Write-Host ("  total net_amount_null_discount_as_zero (included set): {0:N2}" -f $totalZero) -ForegroundColor Green
Write-Host ("  target                                               : {0:N2}" -f $target)
Write-Host ("  gap (strict vs target)                               : {0:N2}" -f $gapStrict) -ForegroundColor Yellow
Write-Host ("  gap (zero-discount vs target)                        : {0:N2}" -f $gapZero) -ForegroundColor Yellow

Write-Host ''
Write-Host "Done at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Green
Write-Host "  Diagnostic export only - no writes made to Acctivate, Supabase, or the portal."
Write-Host "  Files written to: $OutputDir"
