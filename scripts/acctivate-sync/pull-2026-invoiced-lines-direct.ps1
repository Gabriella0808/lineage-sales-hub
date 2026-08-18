<#
.SYNOPSIS
  Pulls all 2026 Acctivate invoice lines directly from SQL Server and upserts
  them into Supabase public.acctivate_invoice_lines_2026_direct.

.DESCRIPTION
  Connects to the Acctivate SQL Server database, queries dbo.InvoiceDetail
  joined to dbo.Invoice / dbo.Branch / dbo.Product for the date range
  2026-01-01 through today (inclusive), then POSTs rows in small batches
  directly to the Supabase REST API (on_conflict=guid_invoice_detail).

  After upload, calls the refresh_mv_portal_invoiced() RPC to rebuild the
  materialized view so the portal reflects the new data immediately.

  Deploy this script to C:\AcctivateKPI\ on the LineageVM.
  Config file:  C:\AcctivateKPI\kpi.config.json  (see example below).

.PARAMETER ConfigPath
  Path to kpi.config.json. Defaults to .\kpi.config.json next to this script.

.EXAMPLE
  pwsh C:\AcctivateKPI\pull-2026-invoiced-lines-direct.ps1
  pwsh C:\AcctivateKPI\pull-2026-invoiced-lines-direct.ps1 -ConfigPath C:\AcctivateKPI\kpi.config.json

.NOTES
  kpi.config.json structure:
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
    },
    "batchSize":           100,
    "maxRetries":          3,
    "retryDelaySeconds":   10,
    "requestTimeoutSec":   60
  }
#>

[CmdletBinding()]
param(
  [string]$ConfigPath = (Join-Path $PSScriptRoot 'kpi.config.json')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# ─── Load config ─────────────────────────────────────────────────────────────

if (-not (Test-Path $ConfigPath)) {
  throw "Config file not found: $ConfigPath`nCreate kpi.config.json next to this script (see .NOTES for format)."
}

$cfg = Get-Content $ConfigPath -Raw | ConvertFrom-Json

$SupabaseUrl    = $cfg.supabaseUrl.TrimEnd('/')
$ServiceKey     = $cfg.serviceRoleKey
$BatchSize      = if ($cfg.batchSize)          { [int]$cfg.batchSize }          else { 100 }
$MaxRetries     = if ($cfg.maxRetries)         { [int]$cfg.maxRetries }         else { 3   }
$RetryDelaySec  = if ($cfg.retryDelaySeconds)  { [int]$cfg.retryDelaySeconds }  else { 10  }
$RequestTimeout = if ($cfg.requestTimeoutSec)  { [int]$cfg.requestTimeoutSec }  else { 60  }
$SqlTimeout     = if ($cfg.sql.commandTimeoutSeconds) { [int]$cfg.sql.commandTimeoutSeconds } else { 600 }

if (-not $SupabaseUrl -or -not $ServiceKey) {
  throw "supabaseUrl and serviceRoleKey are required in $ConfigPath"
}

# ─── SQL connection ───────────────────────────────────────────────────────────

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

# ─── Discover optional columns ────────────────────────────────────────────────

Write-Host "Checking InvoiceDetail schema..." -ForegroundColor Cyan

# Amount column: Acctivate uses different names across versions
$amountCol = $null
foreach ($candidate in @('Amount','InvoiceDetailAmount','ExtendedPrice','DisplayAmount','LineAmount','TotalPrice')) {
  if (Test-ColumnExists -Table 'InvoiceDetail' -Column $candidate) {
    $amountCol = $candidate; break
  }
}
if (-not $amountCol) {
  Write-Warning "No amount column found on dbo.InvoiceDetail – invoice_detail_amount will be NULL."
}

$hasSalesAccountId  = Test-ColumnExists -Table 'InvoiceDetail' -Column 'SalesAccountID'
$hasTransactionDate = Test-ColumnExists -Table 'Invoice'        -Column 'TransactionDate'
$hasOrderNumber     = Test-ColumnExists -Table 'Invoice'        -Column 'OrderNumber'
$hasBranch          = Test-ColumnExists -Table 'Invoice'        -Column 'GUIDBranch'

Write-Host "  amount column : $($amountCol ?? 'NULL')"
Write-Host "  SalesAccountID: $hasSalesAccountId"
Write-Host "  TransactionDate: $hasTransactionDate"
Write-Host "  OrderNumber: $hasOrderNumber"
Write-Host "  GUIDBranch: $hasBranch"

# ─── Build SQL query ──────────────────────────────────────────────────────────

$amountExpr = if ($amountCol) { "ISNULL(id.$amountCol, 0)" } else { "NULL" }
$saIdExpr   = if ($hasSalesAccountId)  { "CAST(id.SalesAccountID AS NVARCHAR(64))" } else { "NULL" }
$txDateExpr = if ($hasTransactionDate) {
  "CONVERT(VARCHAR(10), inv.TransactionDate, 23)"
} else {
  "CONVERT(VARCHAR(10), inv.InvoiceDate, 23)"   # fallback to InvoiceDate
}
$orderExpr  = if ($hasOrderNumber) { "CAST(inv.OrderNumber AS NVARCHAR(64))" } else { "NULL" }
$branchJoin = if ($hasBranch) { "LEFT JOIN dbo.Branch br ON br.GUIDBranch = inv.GUIDBranch" } else { "" }
$branchExpr = if ($hasBranch) { "CAST(br.BranchID AS NVARCHAR(64))" } else { "NULL" }

$todayClause = "DATEADD(day, 1, CAST(GETDATE() AS date))"

$sql = @"
SELECT
  CAST(id.GUIDInvoiceDetail AS NVARCHAR(64))                           AS guid_invoice_detail,
  CAST(id.GUIDInvoice       AS NVARCHAR(64))                           AS guid_invoice,
  CAST(inv.InvoiceNumber    AS NVARCHAR(64))                           AS invoice_number,
  CONVERT(VARCHAR(10), inv.InvoiceDate, 23)                            AS invoice_date,
  $txDateExpr                                                          AS transaction_date,
  YEAR(inv.InvoiceDate)                                                AS year,
  MONTH(inv.InvoiceDate)                                               AS month_number,
  CAST(inv.CustomerID       AS NVARCHAR(64))                           AS customer_id,
  CAST(ISNULL(inv.SalespersonID, '')  AS NVARCHAR(64))                 AS sales_rep_id,
  $branchExpr                                                          AS branch_id,
  $orderExpr                                                           AS order_number,
  CAST(id.ProductID         AS NVARCHAR(128))                          AS product_id,
  CAST(ISNULL(id.Description,'')  AS NVARCHAR(512))                   AS description,
  ISNULL(id.QtyInvoiced,     0)                                        AS qty_invoiced,
  ISNULL(id.LineDiscountPct, 0)                                        AS line_discount_pct,
  $saIdExpr                                                            AS sales_account_id,
  ISNULL(id.Price, 0)                                                  AS price,
  $amountExpr                                                          AS invoice_detail_amount,
  ROUND(
    ISNULL(id.Price, 0)
    * ISNULL(id.QtyInvoiced, 0)
    * (1.0 - ISNULL(id.LineDiscountPct, 0) / 100.0),
    2
  )                                                                    AS formula_net_amount,
  CAST(ISNULL(p.SalesCategory,  '') AS NVARCHAR(64))                   AS product_sales_category,
  CAST(ISNULL(p.ProductClassID, '') AS NVARCHAR(64))                   AS product_class
FROM dbo.InvoiceDetail id
INNER JOIN dbo.Invoice inv
  ON inv.GUIDInvoice = id.GUIDInvoice
$branchJoin
LEFT JOIN dbo.Product p
  ON p.ProductID = id.ProductID
WHERE inv.InvoiceDate >= '2026-01-01'
  AND inv.InvoiceDate <  $todayClause
"@

# ─── Helpers ─────────────────────────────────────────────────────────────────

# Remove characters that break JSON or Supabase: null bytes and C0 control chars.
function Clean-String {
  param([string]$s)
  if ($null -eq $s) { return $null }
  # Strip null bytes and control chars 0x00-0x1F except tab/LF/CR
  $s = $s -replace '[\x00-\x08\x0B\x0C\x0E-\x1F]', ''
  return $s
}

function Clean-Row {
  param([hashtable]$row)
  $clean = @{}
  foreach ($key in $row.Keys) {
    $val = $row[$key]
    if ($val -is [string]) {
      $clean[$key] = Clean-String $val
    } elseif ($val -is [datetime]) {
      $clean[$key] = $val.ToString('yyyy-MM-dd')
    } elseif ($val -is [System.Decimal] -or $val -is [double] -or $val -is [float]) {
      $clean[$key] = [double]$val
    } elseif ($val -is [int] -or $val -is [long] -or $val -is [int64]) {
      $clean[$key] = [long]$val
    } else {
      $clean[$key] = $val
    }
  }
  return $clean
}

$headers = @{
  'apikey'        = $ServiceKey
  'Authorization' = "Bearer $ServiceKey"
  'Content-Type'  = 'application/json'
  'Prefer'        = 'resolution=merge-duplicates,return=minimal'
}

$upsertUrl = "$SupabaseUrl/rest/v1/acctivate_invoice_lines_2026_direct?on_conflict=guid_invoice_detail"

function Send-Batch {
  param([hashtable[]]$Rows, [int]$StartIndex, [int]$Total)

  $payload = $Rows | ForEach-Object { Clean-Row $_ } | ConvertTo-Json -Depth 5 -Compress

  for ($attempt = 1; $attempt -le $MaxRetries; $attempt++) {
    try {
      Invoke-RestMethod `
        -Method      Post `
        -Uri         $upsertUrl `
        -Headers     $headers `
        -Body        $payload `
        -TimeoutSec  $RequestTimeout | Out-Null
      $end = [Math]::Min($StartIndex + $Rows.Count, $Total)
      Write-Host "  upserted rows $($StartIndex + 1)–$end of $Total" -ForegroundColor DarkCyan
      return
    } catch {
      $msg = $_.Exception.Message
      if ($attempt -ge $MaxRetries) {
        throw "Batch starting row $($StartIndex + 1) failed after $MaxRetries attempts: $msg"
      }
      Write-Warning "  batch at row $($StartIndex + 1): attempt $attempt/$MaxRetries failed ($msg) – retrying in ${RetryDelaySec}s"
      Start-Sleep -Seconds $RetryDelaySec
    }
  }
}

# ─── Pull ────────────────────────────────────────────────────────────────────

Write-Host "`nPulling 2026 invoice lines from Acctivate SQL..." -ForegroundColor Yellow
Write-Host "  server   : $($cfg.sql.server)"
Write-Host "  database : $($cfg.sql.database)"
Write-Host "  date range: 2026-01-01 through today ($(Get-Date -Format 'yyyy-MM-dd'))"

$rows = Invoke-Sql -Query $sql
Write-Host "  pulled $($rows.Count) rows" -ForegroundColor Green

if ($rows.Count -eq 0) {
  Write-Warning "No rows returned – check SQL connection and InvoiceDate filter."
  exit 0
}

# ─── Upload in batches ────────────────────────────────────────────────────────

Write-Host "`nUploading to Supabase (batch size: $BatchSize)..." -ForegroundColor Yellow
$total = $rows.Count

for ($i = 0; $i -lt $total; $i += $BatchSize) {
  $last  = [Math]::Min($i + $BatchSize - 1, $total - 1)
  $chunk = [hashtable[]]$rows[$i..$last]
  Send-Batch -Rows $chunk -StartIndex $i -Total $total
}

Write-Host "  upload complete: $total rows upserted" -ForegroundColor Green

# ─── Refresh materialized view ────────────────────────────────────────────────

Write-Host "`nRefreshing mv_portal_monthly_invoiced_actuals..." -ForegroundColor Yellow

$rpcUrl = "$SupabaseUrl/rest/v1/rpc/refresh_mv_portal_invoiced"
$rpcHeaders = @{
  'apikey'        = $ServiceKey
  'Authorization' = "Bearer $ServiceKey"
  'Content-Type'  = 'application/json'
}

for ($attempt = 1; $attempt -le $MaxRetries; $attempt++) {
  try {
    Invoke-RestMethod -Method Post -Uri $rpcUrl -Headers $rpcHeaders -Body '{}' -TimeoutSec 120 | Out-Null
    Write-Host "  materialized view refreshed" -ForegroundColor Green
    break
  } catch {
    $msg = $_.Exception.Message
    if ($attempt -ge $MaxRetries) {
      Write-Warning "Could not refresh mv_portal_monthly_invoiced_actuals after $MaxRetries attempts: $msg"
      Write-Warning "Run manually in Supabase SQL editor: SELECT public.refresh_mv_portal_invoiced();"
    } else {
      Write-Warning "  RPC attempt $attempt/$MaxRetries failed ($msg) – retrying in ${RetryDelaySec}s"
      Start-Sleep -Seconds $RetryDelaySec
    }
  }
}

# ─── Summary ─────────────────────────────────────────────────────────────────

Write-Host "`nDone at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Green
Write-Host "  $total invoice lines upserted into acctivate_invoice_lines_2026_direct"
Write-Host "  Portal MTD invoicing should now reflect the updated August figures."
