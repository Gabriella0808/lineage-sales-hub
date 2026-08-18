<#
.SYNOPSIS
  Syncs August 2026–present invoice lines from Acctivate SQL directly into
  Supabase (acctivate_invoice_lines_2026_direct). Jan–Jul rows are untouched.

.DESCRIPTION
  Connects to Acctivate SQL Server, pulls InvoiceDetail rows for
  2026-08-01 through today, and upserts them into Supabase using
  guid_invoice_detail as the conflict key. Runs in batches of 100 to
  avoid Supabase 500 errors. After upload, refreshes the invoiced
  materialized view and prints a reconciliation summary.

  Intended to run daily via Windows Task Scheduler on the LineageVM.

  Config file: C:\AcctivateKPI\kpi.config.json
  {
    "supabaseUrl":    "https://tcqpseblcwqjopbocfmr.supabase.co",
    "serviceRoleKey": "YOUR_SERVICE_ROLE_KEY",
    "sql": {
      "server":                ".\\ACCTIVATE",
      "database":              "Acctivate",
      "integratedSecurity":    true,
      "user":                  "",
      "password":              "",
      "commandTimeoutSeconds": 600
    },
    "batchSize":          100,
    "maxRetries":         3,
    "retryDelaySeconds":  10,
    "requestTimeoutSec":  60
  }

.PARAMETER ConfigPath
  Path to kpi.config.json. Defaults to .\kpi.config.json next to this script.

.EXAMPLE
  pwsh C:\AcctivateKPI\sync-aug-current-invoiced-lines.ps1
#>

[CmdletBinding()]
param(
  [string]$ConfigPath = (Join-Path $PSScriptRoot 'kpi.config.json')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# ─── Config ──────────────────────────────────────────────────────────────────

if (-not (Test-Path $ConfigPath)) {
  throw "Config not found: $ConfigPath`nCreate kpi.config.json next to this script (see .SYNOPSIS)."
}

$cfg = Get-Content $ConfigPath -Raw | ConvertFrom-Json

$SupabaseUrl   = $cfg.supabaseUrl.TrimEnd('/')
$ServiceKey    = $cfg.serviceRoleKey
$BatchSize     = if ($cfg.batchSize)         { [int]$cfg.batchSize }         else { 100 }
$MaxRetries    = if ($cfg.maxRetries)        { [int]$cfg.maxRetries }        else { 3   }
$RetryDelay    = if ($cfg.retryDelaySeconds) { [int]$cfg.retryDelaySeconds } else { 10  }
$RequestTimeout= if ($cfg.requestTimeoutSec) { [int]$cfg.requestTimeoutSec } else { 60  }
$SqlTimeout    = if ($cfg.sql.commandTimeoutSeconds) { [int]$cfg.sql.commandTimeoutSeconds } else { 600 }

if (-not $SupabaseUrl -or -not $ServiceKey) {
  throw "supabaseUrl and serviceRoleKey are required in $ConfigPath"
}

# ─── SQL ─────────────────────────────────────────────────────────────────────

$connStr = "Server=$($cfg.sql.server);Database=$($cfg.sql.database);Connection Timeout=30;"
$connStr += if ($cfg.sql.integratedSecurity) { "Integrated Security=SSPI;" }
            else { "User Id=$($cfg.sql.user);Password=$($cfg.sql.password);" }
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
    $rows = [System.Collections.Generic.List[hashtable]]::new()
    while ($reader.Read()) {
      $row = @{}
      for ($i = 0; $i -lt $reader.FieldCount; $i++) {
        $v = $reader.GetValue($i)
        $row[$reader.GetName($i)] = if ($v -is [System.DBNull]) { $null } else { $v }
      }
      $rows.Add($row) | Out-Null
    }
    return , [hashtable[]]$rows
  } finally { $conn.Close() }
}

function Test-Column {
  param([string]$Table, [string]$Column)
  $r = Invoke-Sql "SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                   WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='$Table' AND COLUMN_NAME='$Column'"
  return ($r.Count -gt 0)
}

# ─── Discover optional columns ────────────────────────────────────────────────

Write-Host "`nChecking Acctivate schema..." -ForegroundColor Cyan

# guid_invoice_detail conflict key — required
$hasGuidDetail  = Test-Column 'InvoiceDetail' 'GUIDInvoiceDetail'
if (-not $hasGuidDetail) { throw "GUIDInvoiceDetail not found on dbo.InvoiceDetail — cannot build conflict key." }

# guid_invoice from Invoice header
$hasGuidInvoice = Test-Column 'Invoice' 'GUIDInvoice'

# Branch join
$hasBranch      = Test-Column 'Invoice' 'GUIDBranch'

# Optional Invoice columns
$hasTransDate   = Test-Column 'Invoice' 'TransactionDate'
$hasOrderNum    = Test-Column 'Invoice' 'OrderNumber'
$hasSalesRepId  = Test-Column 'Invoice' 'SalespersonID'

# Optional InvoiceDetail columns
$hasSalesAcct   = Test-Column 'InvoiceDetail' 'SalesAccountID'

Write-Host "  GUIDInvoice     : $hasGuidInvoice"
Write-Host "  GUIDBranch      : $hasBranch"
Write-Host "  TransactionDate : $hasTransDate"
Write-Host "  OrderNumber     : $hasOrderNum"
Write-Host "  SalespersonID   : $hasSalesRepId"
Write-Host "  SalesAccountID  : $hasSalesAcct"

# ─── Build query ─────────────────────────────────────────────────────────────

$guidInvoiceExpr = if ($hasGuidInvoice) { "CAST(inv.GUIDInvoice AS NVARCHAR(64))" } else { "NULL" }
$txDateExpr      = if ($hasTransDate)   {
  "CONVERT(VARCHAR(10), inv.TransactionDate, 23)"
} else {
  "CONVERT(VARCHAR(10), inv.InvoiceDate, 23)"   -- fallback
}
$orderExpr       = if ($hasOrderNum)   { "CAST(inv.OrderNumber   AS NVARCHAR(64))" } else { "NULL" }
$repIdExpr       = if ($hasSalesRepId) { "CAST(ISNULL(inv.SalespersonID,'') AS NVARCHAR(64))" } else { "NULL" }
$salesAcctExpr   = if ($hasSalesAcct)  { "CAST(dtl.SalesAccountID AS NVARCHAR(64))" } else { "NULL" }
$branchJoin      = if ($hasBranch) {
  "LEFT JOIN dbo.Branch br ON br.GUIDBranch = inv.GUIDBranch"
} else { "" }
$branchExpr      = if ($hasBranch) { "CAST(br.BranchID AS NVARCHAR(64))" } else { "NULL" }

# Date filter: Aug 1 2026 through end of today
$fromDate = "'2026-08-01'"
$toExpr   = "DATEADD(day, 1, CAST(GETDATE() AS date))"

$sql = @"
SELECT
  -- Conflict key
  CAST(dtl.GUIDInvoiceDetail AS NVARCHAR(64))                            AS guid_invoice_detail,

  -- Invoice header identifiers
  $guidInvoiceExpr                                                       AS guid_invoice,
  CAST(inv.InvoiceNumber      AS NVARCHAR(64))                           AS invoice_number,

  -- Dates
  CONVERT(VARCHAR(10), inv.InvoiceDate, 23)                              AS invoice_date,
  $txDateExpr                                                            AS transaction_date,
  YEAR (inv.InvoiceDate)                                                 AS year,
  MONTH(inv.InvoiceDate)                                                 AS month_number,

  -- Parties
  CAST(inv.CustomerID         AS NVARCHAR(64))                           AS customer_id,
  $repIdExpr                                                             AS sales_rep_id,
  $branchExpr                                                            AS branch_id,
  $orderExpr                                                             AS order_number,

  -- Line detail
  CAST(dtl.ProductID          AS NVARCHAR(128))                          AS product_id,
  CAST(ISNULL(dtl.Description,'') AS NVARCHAR(512))                     AS description,
  ISNULL(dtl.QtyInvoiced,     0)                                         AS qty_invoiced,
  ISNULL(dtl.LineDiscountPct, 0)                                         AS line_discount_pct,
  $salesAcctExpr                                                         AS sales_account_id,
  ISNULL(dtl.Price,           0)                                         AS price,

  -- Amount: per Andrew, dtl.Amount is the line total
  ISNULL(dtl.Amount,          0)                                         AS invoice_detail_amount,

  -- Formula net (Price x Qty x (1 - Disc%/100)), rounded to cents
  ROUND(
    ISNULL(dtl.Price,           0)
    * ISNULL(dtl.QtyInvoiced,   0)
    * (1.0 - ISNULL(dtl.LineDiscountPct, 0) / 100.0),
    2
  )                                                                      AS formula_net_amount,

  -- Product category & class from Product master
  CAST(ISNULL(prod.SalesCategory,   '') AS NVARCHAR(64))                 AS product_sales_category,
  CAST(ISNULL(prod.ProductClassID,  '') AS NVARCHAR(64))                 AS product_class,

  -- Origin tag — lets us identify Aug+ direct-pull rows
  'aug_direct_pull'                                                      AS source

FROM       dbo.InvoiceDetail dtl
INNER JOIN dbo.Invoice       inv  ON  dtl.InvoiceNumber = inv.InvoiceNumber
LEFT  JOIN dbo.Product       prod ON  dtl.ProductID     = prod.ProductID
$branchJoin
WHERE inv.InvoiceDate >= $fromDate
  AND inv.InvoiceDate <  $toExpr
"@

# ─── Utilities ───────────────────────────────────────────────────────────────

function Clean-Value {
  param($v)
  if ($null -eq $v)          { return $null }
  if ($v -is [string]) {
    # Strip null bytes and C0 control chars (except tab/LF/CR)
    return ($v -replace '[\x00-\x08\x0B\x0C\x0E-\x1F]', '')
  }
  if ($v -is [datetime])     { return $v.ToString('yyyy-MM-dd') }
  if ($v -is [System.Decimal] -or $v -is [double] -or $v -is [float]) { return [double]$v }
  if ($v -is [int] -or $v -is [long] -or $v -is [int64]) { return [long]$v }
  return $v
}

function Clean-Row {
  param([hashtable]$row)
  $out = @{}
  foreach ($k in $row.Keys) { $out[$k] = Clean-Value $row[$k] }
  return $out
}

$upsertUrl = "$SupabaseUrl/rest/v1/acctivate_invoice_lines_2026_direct?on_conflict=guid_invoice_detail"
$upsertHdr = @{
  'apikey'        = $ServiceKey
  'Authorization' = "Bearer $ServiceKey"
  'Content-Type'  = 'application/json'
  'Prefer'        = 'resolution=merge-duplicates,return=minimal'
}

function Send-Batch {
  param([hashtable[]]$Chunk, [int]$Offset, [int]$Total)
  $body = $Chunk | ForEach-Object { Clean-Row $_ } | ConvertTo-Json -Depth 5 -Compress
  for ($try = 1; $try -le $MaxRetries; $try++) {
    try {
      Invoke-RestMethod -Method Post -Uri $upsertUrl -Headers $upsertHdr `
        -Body $body -TimeoutSec $RequestTimeout | Out-Null
      $end = [Math]::Min($Offset + $Chunk.Count, $Total)
      Write-Host ("  rows {0,6}–{1,6} / {2,6}  ok" -f ($Offset + 1), $end, $Total) -ForegroundColor DarkCyan
      return $Chunk.Count
    } catch {
      $msg = $_.Exception.Message
      if ($try -ge $MaxRetries) {
        throw "Batch at row $($Offset+1) failed after $MaxRetries attempts: $msg"
      }
      Write-Warning "  batch at row $($Offset+1): attempt $try/$MaxRetries failed – retrying in ${RetryDelay}s ($msg)"
      Start-Sleep -Seconds $RetryDelay
    }
  }
}

# ─── Pull ────────────────────────────────────────────────────────────────────

$today = Get-Date -Format 'yyyy-MM-dd'
Write-Host "`n=== Aug 2026 Invoice Sync  ($today) ===" -ForegroundColor Yellow
Write-Host "Server  : $($cfg.sql.server) / $($cfg.sql.database)"
Write-Host "Range   : 2026-08-01 through $today"

Write-Host "`nQuerying Acctivate..." -ForegroundColor Cyan
$allRows = Invoke-Sql -Query $sql
$pulled  = $allRows.Count
Write-Host "  $pulled rows pulled from Acctivate" -ForegroundColor Green

if ($pulled -eq 0) {
  Write-Warning "No rows returned for Aug 2026+. Check SQL connection and InvoiceDate filter."
  exit 0
}

# ─── Upload ──────────────────────────────────────────────────────────────────

Write-Host "`nUploading to Supabase (batch $BatchSize)..." -ForegroundColor Cyan
$uploaded = 0
for ($i = 0; $i -lt $pulled; $i += $BatchSize) {
  $last  = [Math]::Min($i + $BatchSize - 1, $pulled - 1)
  $chunk = [hashtable[]]$allRows[$i..$last]
  $uploaded += Send-Batch -Chunk $chunk -Offset $i -Total $pulled
}

# ─── Refresh mat view ────────────────────────────────────────────────────────

Write-Host "`nRefreshing mv_portal_monthly_invoiced_actuals..." -ForegroundColor Cyan
$rpcUrl = "$SupabaseUrl/rest/v1/rpc/refresh_mv_portal_invoiced"
$rpcHdr = @{
  'apikey'        = $ServiceKey
  'Authorization' = "Bearer $ServiceKey"
  'Content-Type'  = 'application/json'
}
for ($try = 1; $try -le $MaxRetries; $try++) {
  try {
    Invoke-RestMethod -Method Post -Uri $rpcUrl -Headers $rpcHdr -Body '{}' -TimeoutSec 120 | Out-Null
    Write-Host "  materialized view refreshed" -ForegroundColor Green
    break
  } catch {
    $msg = $_.Exception.Message
    if ($try -ge $MaxRetries) {
      Write-Warning "Could not refresh mat view after $MaxRetries attempts: $msg"
      Write-Warning "Run manually: SELECT public.refresh_mv_portal_invoiced();"
    } else {
      Write-Warning "  RPC attempt $try/$MaxRetries failed – retrying in ${RetryDelay}s"
      Start-Sleep -Seconds $RetryDelay
    }
  }
}

# ─── Summary ─────────────────────────────────────────────────────────────────

# Compute stats from pulled rows
$dates     = $allRows | ForEach-Object {
  $d = $_['invoice_date']
  if ($d -is [datetime]) { $d } elseif ($d) { [datetime]::Parse($d) } else { $null }
} | Where-Object { $_ } | Sort-Object

$firstDate  = if ($dates) { $dates[0].ToString('yyyy-MM-dd') }  else { 'n/a' }
$latestDate = if ($dates) { $dates[-1].ToString('yyyy-MM-dd') } else { 'n/a' }

$augTotal = ($allRows | Where-Object {
  $mo = $_['month_number']
  $yr = $_['year']
  ($mo -eq 8 -or $mo -eq '8') -and ($yr -eq 2026 -or $yr -eq '2026')
} | ForEach-Object {
  $v = $_['invoice_detail_amount']
  if ($null -eq $v) { 0.0 } else { [double]$v }
} | Measure-Object -Sum).Sum

Write-Host ""
Write-Host "─────────────────────────────────────────" -ForegroundColor Green
Write-Host " SYNC COMPLETE" -ForegroundColor Green
Write-Host "─────────────────────────────────────────" -ForegroundColor Green
Write-Host (" Rows pulled from Acctivate : {0,8}"   -f $pulled)
Write-Host (" Rows uploaded to Supabase  : {0,8}"   -f $uploaded)
Write-Host (" First invoice date         : {0}"      -f $firstDate)
Write-Host (" Latest invoice date        : {0}"      -f $latestDate)
Write-Host (" August invoice_detail_amt  : {0,14:C0}" -f $augTotal)
Write-Host "─────────────────────────────────────────" -ForegroundColor Green
Write-Host " Finished $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Green
