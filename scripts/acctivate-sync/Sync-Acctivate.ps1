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

.EXAMPLE
  pwsh ./Sync-Acctivate.ps1
  pwsh ./Sync-Acctivate.ps1 -Tables dealers,products
#>

[CmdletBinding()]
param(
  [string]$ConfigPath = (Join-Path $PSScriptRoot 'sync.config.json'),
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
$BatchSize    = if ($config.batchSize) { [int]$config.batchSize } else { 500 }

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
  CAST(c.CustId AS NVARCHAR(64))  AS acctivate_id,
  c.CompanyName                   AS name,
  c.Email                         AS email,
  c.Phone                         AS phone,
  c.Address                       AS street_address,
  c.City                          AS city,
  c.State                         AS state,
  c.SalespersonName               AS salesperson,
  c._Territory                    AS territory,
  c._SalesManager                 AS sales_manager
FROM dbo.Customer c
WHERE ISNULL(c.Inactive, 0) = 0
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

# ---------- Run ----------
$enabled = if ($Tables) {
  $Tables | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim().Trim([char]39).Trim([char]34) } | Where-Object { $_ }
} else {
  $config.enabledTables
}
if (-not $enabled -or $enabled.Count -eq 0) {
  $enabled = $queries.Keys
}

Write-Host "Acctivate sync starting -> $FunctionUrl" -ForegroundColor Cyan
Write-Host "Tables: $($enabled -join ', ')" -ForegroundColor Cyan

foreach ($table in $enabled) {
  if (-not $queries.ContainsKey($table)) {
    Write-Warning "No query defined for '$table' — skipping."
    continue
  }
  Write-Host "==> $table" -ForegroundColor Yellow
  $rows = Invoke-Sql -Query $queries[$table]
  Write-Host "  pulled $($rows.Count) rows from SQL"
  Send-Batch -Table $table -Rows $rows -OnConflict 'acctivate_id'
}

Write-Host "Done." -ForegroundColor Green
