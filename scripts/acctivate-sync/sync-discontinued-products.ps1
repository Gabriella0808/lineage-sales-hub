<#
.SYNOPSIS
  Syncs discontinued / clearance / closeout product inventory from Acctivate
  SQL Server into Supabase table stg_acctivate_discontinued_inventory.

.DESCRIPTION
  Replaces the Skyvia sync for this data set.  Queries dbo.Product joined to
  dbo.ProductWarehouseSummary (per-warehouse, not summed) for all products where
  Discontinued = 1 OR custom clearance / closeout flags are set.  If dbo.tbProduct
  exists its _Clearance / _Closeout custom columns are also probed.

  Safety:
    • Aborts without uploading if Acctivate returns 0 rows.
    • Stages all rows in memory; uploads only after full SQL pull succeeds.
    • Non-zero exit code on any failure.

  Config: C:\AcctivateKPI\kpi.config.json
  {
      "supabaseUrl":    "https://tcqpseblcwqjopbocfmr.supabase.co",
      "serviceRoleKey": "YOUR_SERVICE_ROLE_KEY",
      "sql": {
          "server":   ".\\ACCTIVATE",
          "database": "Acctivate",
          "integratedSecurity": true,
          "commandTimeoutSeconds": 600
      },
      "batchSize": 100, "maxRetries": 3,
      "retryDelaySeconds": 10, "requestTimeoutSec": 60
  }

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File C:\AcctivateKPI\sync-discontinued-products.ps1
#>

[CmdletBinding()]
param(
    [string]$ConfigPath = (Join-Path $PSScriptRoot 'kpi.config.json')
)

$ErrorActionPreference = 'Stop'
$script:ExitCode = 0

# ── Config ────────────────────────────────────────────────────────────────────

if (-not (Test-Path $ConfigPath)) {
    Write-Error "Config not found: $ConfigPath"
    exit 1
}

$cfg = Get-Content $ConfigPath -Raw | ConvertFrom-Json

$SupabaseUrl    = $cfg.supabaseUrl.TrimEnd('/')
$ServiceKey     = $cfg.serviceRoleKey
$BatchSize      = if ($cfg.batchSize)               { [int]$cfg.batchSize }               else { 100 }
$MaxRetries     = if ($cfg.maxRetries)              { [int]$cfg.maxRetries }              else { 3 }
$RetryDelay     = if ($cfg.retryDelaySeconds)       { [int]$cfg.retryDelaySeconds }       else { 10 }
$RequestTimeout = if ($cfg.requestTimeoutSec)       { [int]$cfg.requestTimeoutSec }       else { 60 }
$SqlTimeout     = if ($cfg.sql.commandTimeoutSeconds) { [int]$cfg.sql.commandTimeoutSeconds } else { 600 }

if (-not $SupabaseUrl -or -not $ServiceKey) {
    Write-Error "supabaseUrl and serviceRoleKey are required in $ConfigPath"
    exit 1
}

# ── SQL connection ────────────────────────────────────────────────────────────

$connStr = 'Server=' + $cfg.sql.server + ';Database=' + $cfg.sql.database + ';Connection Timeout=30;'
if ($cfg.sql.integratedSecurity) {
    $connStr += 'Integrated Security=SSPI;'
} else {
    $connStr += 'User Id=' + $cfg.sql.user + ';Password=' + $cfg.sql.password + ';'
}
$connStr += 'Encrypt=False;TrustServerCertificate=True;'

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
    } finally {
        $conn.Close()
    }
}

function Get-Columns {
    param([string]$Table, [string]$Schema = 'dbo')
    $rows = Invoke-Sql -SqlQuery "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='$Schema' AND TABLE_NAME='$Table' ORDER BY ORDINAL_POSITION" -TimeoutSec 30
    return @($rows | ForEach-Object { [string]$_['COLUMN_NAME'] })
}

function Test-TableExists {
    param([string]$Table, [string]$Schema = 'dbo')
    $rows = Invoke-Sql -SqlQuery "SELECT 1 AS x FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='$Schema' AND TABLE_NAME='$Table'" -TimeoutSec 10
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

# ── Column discovery ──────────────────────────────────────────────────────────

Write-Host ''
Write-Host ('=== Discontinued / Clearance Sync  ' + (Get-Date -Format 'yyyy-MM-dd HH:mm')) + ' ===' -ForegroundColor Yellow
Write-Host ('Server  : ' + $cfg.sql.server + ' / ' + $cfg.sql.database)
Write-Host ''
Write-Host 'Discovering column layout...' -ForegroundColor Cyan

$prodCols = Get-Columns -Table 'Product'
$whCols   = Get-Columns -Table 'ProductWarehouseSummary'

if (-not $prodCols -or $prodCols.Count -eq 0) {
    Write-Error 'Could not read columns from dbo.Product.'
    exit 1
}
if (-not $whCols -or $whCols.Count -eq 0) {
    Write-Error 'Could not read columns from dbo.ProductWarehouseSummary.'
    exit 1
}

# dbo.Product columns
$prodIdCol       = 'ProductID'   # always present
$descCol         = Pick-Col $prodCols @('Description','ProductDescription','Name')
$classCol        = Pick-Col $prodCols @('ProductClassID','ProductClass','Class')
$listPriceCol    = Pick-Col $prodCols @('ListPrice','SD_Price','SuggestedRetail','Price')
$costCol         = Pick-Col $prodCols @('AverageCost','AvgCost','LastCost','StandardCost','Cost','UnitCost')
$discCol         = Pick-Col $prodCols @('Discontinued','IsDiscontinued','Inactive')
$webCol          = Pick-Col $prodCols @('AvailableOnWeb','WebAvailable','IsWebEnabled','OnWeb')
$statusCol       = Pick-Col $prodCols @('Status','ProductStatus','Active')

# dbo.ProductWarehouseSummary columns
$whIdCol         = Pick-Col $whCols @('WarehouseID','Warehouse','WarehouseName','BranchID','BranchName','LocationID','Location')
$onHandCol       = Pick-Col $whCols @('QtyOnHand','OnHand','QuantityOnHand','Qty_OnHand')
$availCol        = Pick-Col $whCols @('Available','QtyAvailable','QuantityAvailable','Qty_Available')
$whProdIdCol     = Pick-Col $whCols @('ProductID','ProductCode','SKU')

if (-not $onHandCol -or -not $availCol -or -not $whProdIdCol) {
    Write-Error "Could not map required columns on dbo.ProductWarehouseSummary. Found: $($whCols -join ', ')"
    exit 1
}

# Optional dbo.tbProduct for custom clearance / closeout flags
$hasTbProduct    = Test-TableExists -Table 'tbProduct'
$tbpCols         = @()
$clearanceCol    = $null
$closeoutCol     = $null
$tbpJoin         = ''
$tbpAlias        = ''

if ($hasTbProduct) {
    $tbpCols   = Get-Columns -Table 'tbProduct'
    $clearanceCol = Pick-Col $tbpCols @('_Clearance','_IsClearance','Clearance','IsClearance','_Disc_Clearance')
    $closeoutCol  = Pick-Col $tbpCols @('_Closeout','_IsCloseout','Closeout','IsCloseout','_ClosingOut','_CloseOut')
    $tbpIdCol     = Pick-Col $tbpCols @('ProductID','CustID','ID')
    if ($tbpIdCol) {
        $tbpAlias = 'tbp'
        $tbpJoin  = "LEFT JOIN dbo.tbProduct $tbpAlias ON $tbpAlias.$(Q $tbpIdCol) = p.$(Q $prodIdCol)"
    }
}

Write-Host ('  dbo.Product          : ' + $prodCols.Count + ' columns')
Write-Host ('  dbo.ProductWarehouseSummary : ' + $whCols.Count + ' columns')
Write-Host ('  dbo.tbProduct        : ' + $(if ($hasTbProduct) { 'found (' + $tbpCols.Count + ' cols)' } else { 'not present' }))
Write-Host ('  list_price col       : ' + $(if ($listPriceCol)  { $listPriceCol }  else { '(none found)' }))
Write-Host ('  cost col             : ' + $(if ($costCol)       { $costCol }       else { '(none found)' }))
Write-Host ('  discontinued col     : ' + $(if ($discCol)       { $discCol }       else { '(none found)' }))
Write-Host ('  warehouse col        : ' + $(if ($whIdCol)       { $whIdCol }       else { '(none found – will use ''Warehouse'')' }))
Write-Host ('  clearance col (tbp)  : ' + $(if ($clearanceCol)  { $clearanceCol }  else { '(none found)' }))
Write-Host ('  closeout col (tbp)   : ' + $(if ($closeoutCol)   { $closeoutCol }   else { '(none found)' }))

# ── Build query ───────────────────────────────────────────────────────────────

$descExpr     = if ($descCol)      { "CAST(p.$(Q $descCol) AS NVARCHAR(512))"    } else { "CAST(p.$(Q $prodIdCol) AS NVARCHAR(512))" }
$classExpr    = if ($classCol)     { "CAST(p.$(Q $classCol) AS NVARCHAR(128))"   } else { 'NULL' }
$listPriceExpr= if ($listPriceCol) { "CAST(ISNULL(p.$(Q $listPriceCol),0) AS decimal(18,4))" } else { '0' }
$costExpr     = if ($costCol)      { "CAST(ISNULL(p.$(Q $costCol),0) AS decimal(18,4))"      } else { '0' }
$discExpr     = if ($discCol)      { "CAST(ISNULL(p.$(Q $discCol),0) AS bit)" } else { '0' }
$webExpr      = if ($webCol)       { "CAST(ISNULL(p.$(Q $webCol),1) AS bit)" }  else { 'NULL' }
$statusExpr   = if ($statusCol)    { "CAST(p.$(Q $statusCol) AS NVARCHAR(50))" } else { 'NULL' }
$whExpr       = if ($whIdCol)      { "CAST(ws.$(Q $whIdCol) AS NVARCHAR(128))" } else { "'Warehouse'" }
$onHandExpr   = "CAST(ISNULL(ws.$(Q $onHandCol),0) AS decimal(18,4))"
$availExpr    = "CAST(ISNULL(ws.$(Q $availCol),0) AS decimal(18,4))"

# clearance / closeout: tbProduct custom columns if discovered, else 0
$clearanceExpr = if ($clearanceCol -and $tbpAlias) { "CAST(ISNULL($tbpAlias.$(Q $clearanceCol),0) AS bit)" } else { '0' }
$closeoutExpr  = if ($closeoutCol  -and $tbpAlias) { "CAST(ISNULL($tbpAlias.$(Q $closeoutCol),0)  AS bit)" } else { '0' }

# WHERE: include any row flagged discontinued OR clearance OR closeout.
# If no custom flag columns exist, fall back to Discontinued only.
$whereFrags = @()
if ($discCol)     { $whereFrags += "ISNULL(p.$(Q $discCol),0) = 1" }
if ($clearanceCol -and $tbpAlias) { $whereFrags += "ISNULL($tbpAlias.$(Q $clearanceCol),0) = 1" }
if ($closeoutCol  -and $tbpAlias) { $whereFrags += "ISNULL($tbpAlias.$(Q $closeoutCol),0)  = 1" }

if ($whereFrags.Count -eq 0) {
    # Fallback: sync ALL products with QtyOnHand > 0 so clearance views have data.
    # Adjust manually if you have a different way to identify clearance/discontinued.
    Write-Warning 'No discontinued/clearance flag columns found on dbo.Product or dbo.tbProduct.'
    Write-Warning 'Querying ALL products with on_hand > 0 as a fallback. Review the WHERE clause.'
    $whereClause = "ws.$(Q $onHandCol) > 0"
} else {
    $whereClause = '(' + ($whereFrags -join ' OR ') + ')'
}

$Query = @"
SELECT
  CAST(p.$(Q $prodIdCol) AS NVARCHAR(128))                 AS sku,
  $descExpr                                                 AS product,
  $whExpr                                                   AS warehouse,
  $classExpr                                                AS collection,
  $onHandExpr                                               AS on_hand,
  $availExpr                                                AS available,
  $costExpr                                                 AS unit_cost,
  $listPriceExpr                                            AS list_price,
  $discExpr                                                 AS is_discontinued,
  $clearanceExpr                                            AS is_clearance,
  $closeoutExpr                                             AS is_closeout,
  $webExpr                                                  AS avail_on_web,
  $statusExpr                                               AS status
FROM dbo.ProductWarehouseSummary ws
JOIN dbo.Product p ON p.$(Q $prodIdCol) = ws.$(Q $whProdIdCol)
$tbpJoin
WHERE $whereClause
ORDER BY p.$(Q $prodIdCol), $whExpr
"@

# ── Pull from Acctivate ───────────────────────────────────────────────────────

Write-Host ''
Write-Host 'Querying Acctivate...' -ForegroundColor Cyan
Write-Host ('  WHERE: ' + $whereClause) -ForegroundColor DarkCyan

$allRows = Invoke-Sql -SqlQuery $Query
$pulled  = $allRows.Count

Write-Host ('  ' + $pulled + ' rows returned') -ForegroundColor $(if ($pulled -gt 0) { 'Green' } else { 'Yellow' })

if ($pulled -eq 0) {
    Write-Warning 'Acctivate returned 0 rows — aborting without touching Supabase (safety guard).'
    Write-Warning 'Check: discontinued / clearance / closeout flags in Acctivate, and verify the WHERE clause above.'
    exit 1
}

# ── Column name normalization ─────────────────────────────────────────────────
# SQL AS aliases can be dropped when SqlDataReader reads CAST expressions.
# This block maps whatever column names came back to the canonical names the
# Supabase staging table and the rest of this script expect.

function Find-Key {
    param([string[]]$Keys, [string[]]$Candidates)
    foreach ($c in $Candidates) {
        $m = $Keys | Where-Object { $_ -ieq $c } | Select-Object -First 1
        if ($m) { return [string]$m }
    }
    return $null
}

$sampleKeys = @($allRows[0].Keys)

Write-Host ''
Write-Host 'Column diagnostics (first Acctivate row):' -ForegroundColor Cyan
Write-Host ('  Fields returned    : ' + (($sampleKeys | Sort-Object) -join ', '))

$colCandidates = [ordered]@{
    'sku'             = @('sku','ProductID','ProductId','product_id','ProductCode','ItemCode','SKU','Item')
    'product'         = @('product','Description','ProductDescription','ProductName','Name','product_name')
    'warehouse'       = @('warehouse','WarehouseID','WarehouseCode','Warehouse','BranchID','BranchName','Location','LocationID')
    'collection'      = @('collection','ProductClassID','ProductClass','Class','SalesCategory')
    'on_hand'         = @('on_hand','QtyOnHand','OnHand','QuantityOnHand','Qty_OnHand')
    'available'       = @('available','Available','QtyAvailable','QuantityAvailable','Qty_Available')
    'unit_cost'       = @('unit_cost','AverageCost','AvgCost','LastCost','StandardCost','Cost','UnitCost')
    'list_price'      = @('list_price','ListPrice','SD_Price','SuggestedRetail','Price','RetailPrice')
    'is_discontinued' = @('is_discontinued','Discontinued','IsDiscontinued','Inactive','discontinued')
    'is_clearance'    = @('is_clearance','Clearance','_Clearance','IsClearance')
    'is_closeout'     = @('is_closeout','Closeout','_Closeout','IsCloseout')
    'avail_on_web'    = @('avail_on_web','AvailableOnWeb','WebAvailable','IsWebEnabled','OnWeb')
    'status'          = @('status','Status','ProductStatus','Active')
}

$required  = @('sku','on_hand','available','warehouse')
$renameMap = @{}

foreach ($expected in $colCandidates.Keys) {
    if ($sampleKeys -icontains $expected) { continue }   # alias already correct
    $actual = Find-Key -Keys $sampleKeys -Candidates $colCandidates[$expected]
    if ($actual) {
        $renameMap[$actual] = $expected
        Write-Host ("  rename '$actual' -> '$expected'") -ForegroundColor DarkYellow
    } elseif ($expected -in $required) {
        Write-Host ("  ERROR: required column '$expected' not found.") -ForegroundColor Red
        Write-Host ("  Full field list: " + ($sampleKeys -join ', ')) -ForegroundColor Red
        Write-Error "Aborting: cannot map required column '$expected'. Check SQL query output above."
        exit 1
    }
}

if ($renameMap.Count -gt 0) {
    foreach ($row in $allRows) {
        foreach ($from in @($renameMap.Keys)) {
            if ($row.ContainsKey($from)) {
                $row[$renameMap[$from]] = $row[$from]
                $row.Remove($from) | Out-Null
            }
        }
    }
    Write-Host ('  Applied ' + $renameMap.Count + ' rename(s) to ' + $pulled + ' rows.') -ForegroundColor DarkCyan
}

$firstRowSku  = if ($allRows[0].ContainsKey('sku')) { $allRows[0]['sku'] } else { '(not mapped — see field list above)' }
$distinctSkuN = @($allRows | ForEach-Object { $_['sku'] } | Where-Object { $_ } | Sort-Object -Unique).Count
Write-Host ('  Sample first SKU   : ' + $firstRowSku)
Write-Host ('  Distinct SKU count : ' + $distinctSkuN)

# ── Reconciliation stats (computed from pull, before upload) ──────────────────

# $totalSkus is set from the normalization block above (avoids Select-Object -ExpandProperty
# which does not work on hashtables and would crash even with a correct 'sku' key).
$totalSkus      = $distinctSkuN
$totalAvail     = 0.0
$totalOnHand    = 0.0
$totalRetail    = 0.0
$totalInventory = 0.0
$allSkus        = @()

foreach ($r in $allRows) {
    $oh = if ($null -ne $r['on_hand'])   { [double]$r['on_hand']   } else { 0 }
    $av = if ($null -ne $r['available']) { [double]$r['available'] } else { 0 }
    $lp = if ($null -ne $r['list_price']){ [double]$r['list_price']} else { 0 }
    $uc = if ($null -ne $r['unit_cost']) { [double]$r['unit_cost'] } else { 0 }
    $totalOnHand    += $oh
    $totalAvail     += $av
    $totalRetail    += ($lp * $av)
    $totalInventory += ($uc * $oh)
    $allSkus += $r['sku']
}
$allSkus = @($allSkus | Where-Object { $_ } | Sort-Object -Unique)
$firstSku = if ($allSkus.Count -gt 0) { $allSkus[0] } else { '(none)' }
$lastSku  = if ($allSkus.Count -gt 0) { $allSkus[-1] } else { '(none)' }

Write-Host ''
Write-Host 'Pre-upload reconciliation (from Acctivate pull):' -ForegroundColor Cyan
Write-Host ('  Rows pulled            : ' + $pulled)
Write-Host ('  Distinct SKUs          : ' + $totalSkus)
Write-Host ('  Total on_hand          : ' + $totalOnHand.ToString('N1'))
Write-Host ('  Total available        : ' + $totalAvail.ToString('N1'))
Write-Host ('  Retail value (LP×avail): $' + $totalRetail.ToString('N2'))
Write-Host ('  Inventory value (UC×oh): $' + $totalInventory.ToString('N2'))
Write-Host ('  First SKU              : ' + $firstSku)
Write-Host ('  Last SKU               : ' + $lastSku)

# ── Value cleaning ────────────────────────────────────────────────────────────

function Clean-Value {
    param($Val)
    if ($null -eq $Val) { return $null }
    if ($Val -is [string]) {
        return ($Val -replace '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '')
    }
    if ($Val -is [datetime]) { return $Val.ToString('yyyy-MM-dd') }
    if ($Val -is [bool])     { return $Val }
    if ($Val -is [System.Decimal] -or $Val -is [double] -or $Val -is [float]) {
        $d = [double]$Val
        if ([double]::IsNaN($d) -or [double]::IsInfinity($d)) { return $null }
        return $d
    }
    if ($Val -is [System.Int32] -or $Val -is [System.Int64] -or
        $Val -is [int] -or $Val -is [long]) {
        return [long]$Val
    }
    return $Val.ToString()
}

# Exact columns of public.stg_acctivate_discontinued_inventory (Skyvia schema).
# Columns pulled from Acctivate that are NOT in this list are silently dropped.
$TableColumns = @(
    'guid_product_warehouse','guid_product','product_id','description',
    'warehouse','list_price','on_hand','available',
    'product_class','discontinued','active_product','avail_on_web','synced_at'
)

# Convert any value to a plain string for text columns, preserving null.
function ToStr {
    param($Val)
    if ($null -eq $Val) { return $null }
    $cv = Clean-Value $Val
    if ($null -eq $cv) { return $null }
    return [string]$cv
}

function Clean-Row {
    param([hashtable]$Row)

    # product_id and warehouse are the upsert conflict keys — must be non-null strings
    $pid = ToStr $Row['sku']
    if (-not $pid) { $pid = '' } else { $pid = $pid.Trim() }
    $wh  = ToStr $Row['warehouse']
    if (-not $wh)  { $wh  = 'Warehouse' } else { $wh  = $wh.Trim() }

    # Internal mapping → table column names, all as text (Skyvia schema stores as text)
    return @{
        'guid_product_warehouse' = ($pid + '::' + $wh)   # stable composite key
        'guid_product'           = $pid
        'product_id'             = $pid
        'description'            = ToStr $Row['product']
        'warehouse'              = $wh
        'list_price'             = ToStr $Row['list_price']
        'on_hand'                = ToStr $Row['on_hand']
        'available'              = ToStr $Row['available']
        'product_class'          = ToStr $Row['collection']
        'discontinued'           = ToStr $Row['is_discontinued']
        'active_product'         = ToStr $Row['status']
        'avail_on_web'           = ToStr $Row['avail_on_web']
        'synced_at'              = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    }
}

# ── Upload to Supabase ────────────────────────────────────────────────────────

$UpsertUrl = $SupabaseUrl + '/rest/v1/stg_acctivate_discontinued_inventory?on_conflict=product_id,warehouse'
$Headers   = @{
    'apikey'        = $ServiceKey
    'Authorization' = 'Bearer ' + $ServiceKey
    'Content-Type'  = 'application/json; charset=utf-8'
    'Prefer'        = 'resolution=merge-duplicates,return=minimal'
}

function Post-Batch {
    param([string]$Body)
    for ($attempt = 1; $attempt -le $MaxRetries; $attempt++) {
        try {
            Invoke-RestMethod -Method Post -Uri $UpsertUrl -Headers $Headers `
                -Body ([System.Text.Encoding]::UTF8.GetBytes($Body)) `
                -TimeoutSec $RequestTimeout | Out-Null
            return $true
        } catch {
            if ($attempt -lt $MaxRetries) {
                Write-Warning ('  batch failed (attempt ' + $attempt + '/' + $MaxRetries + '): ' + $_.Exception.Message + ' — retrying in ' + $RetryDelay + 's')
                Start-Sleep -Seconds $RetryDelay
            }
        }
    }
    return $false
}

# ── Preflight: test one row before committing to the full upload ──────────────
# Uses Invoke-WebRequest (not Invoke-RestMethod) so we can read the response
# body on a 4xx error without PowerShell swallowing it.

function Test-Preflight {
    param([hashtable]$SampleRow)
    Write-Host '  Sending preflight row...' -ForegroundColor DarkCyan
    $cleaned  = Clean-Row $SampleRow
    $payload  = @($cleaned) | ConvertTo-Json -Depth 5 -Compress
    $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
    try {
        $resp = Invoke-WebRequest -Method Post -Uri $UpsertUrl -Headers $Headers `
            -Body $bodyBytes -TimeoutSec $RequestTimeout -UseBasicParsing
        Write-Host ('  Preflight OK (HTTP ' + [int]$resp.StatusCode + ')') -ForegroundColor Green
        return $true
    } catch {
        $statusCode = 0
        $errBody    = ''
        try { $statusCode = [int]$_.Exception.Response.StatusCode }               catch {}
        try {
            $stream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            $errBody = $reader.ReadToEnd()
        } catch {}
        Write-Host ("  Preflight FAILED (HTTP $statusCode)") -ForegroundColor Red
        Write-Host ("  Response body  : $errBody") -ForegroundColor Red
        Write-Host ("  Payload sent   : $payload") -ForegroundColor Red
        Write-Host ("  Columns in row : " + ($cleaned.Keys -join ', ')) -ForegroundColor Red
        return $false
    }
}

Write-Host ''
Write-Host ('Uploading ' + $pulled + ' rows in batches of ' + $BatchSize + '...') -ForegroundColor Cyan

# Run preflight before touching any real data
if (-not (Test-Preflight -SampleRow $allRows[0])) {
    Write-Error 'Preflight upload failed — aborting. Existing Supabase data is unchanged.'
    exit 1
}

$uploaded   = 0
$failed     = 0
$batchFails = 0

for ($i = 0; $i -lt $pulled; $i += $BatchSize) {
    $last  = [Math]::Min($i + $BatchSize - 1, $pulled - 1)
    $chunk = $allRows[$i..$last]

    $cleaned   = @($chunk | ForEach-Object { Clean-Row $_ })
    $batchBody = $cleaned | ConvertTo-Json -Depth 5 -Compress

    if (Post-Batch -Body $batchBody) {
        $uploaded += $chunk.Count
        Write-Host ('  rows ' + ($i + 1) + '-' + ($last + 1) + '/' + $pulled + '  ok') -ForegroundColor DarkCyan
    } else {
        $batchFails++
        Write-Warning ('  batch ' + ($i + 1) + '-' + ($last + 1) + ' failed; retrying row by row...')
        foreach ($row in $chunk) {
            $cleanedRow = Clean-Row $row
            $rowBody    = @($cleanedRow) | ConvertTo-Json -Depth 5 -Compress
            if (Post-Batch -Body $rowBody) {
                $uploaded++
            } else {
                $failed++
                $sku = if ($null -ne $row['sku']) { $row['sku'] } else { '(null)' }
                $wh  = if ($null -ne $row['warehouse']) { $row['warehouse'] } else { '(null)' }
                Write-Warning ('    FAILED  sku=' + $sku + '  warehouse=' + $wh)
                $script:ExitCode = 1
            }
        }
    }
}

Write-Host ('  ' + $uploaded + ' of ' + $pulled + ' rows uploaded') -ForegroundColor $(if ($failed -eq 0) { 'Green' } else { 'Yellow' })

# ── PostgREST schema reload ───────────────────────────────────────────────────
# v_portal_clearance_products and v_portal_closeout_inventory are regular views
# — they query live data on every request.  The reload is attempted as a best
# effort; a 404 means the wrapper function doesn't exist yet (data-only updates
# don't strictly require it, but the user has requested it).
Write-Host ''
Write-Host 'Notifying PostgREST schema reload...' -ForegroundColor DarkCyan
$ReloadUrl     = $SupabaseUrl + '/rest/v1/rpc/pgrst_reload_schema'
$ReloadHeaders = @{
    'apikey'        = $ServiceKey
    'Authorization' = 'Bearer ' + $ServiceKey
    'Content-Type'  = 'application/json'
}
try {
    Invoke-RestMethod -Method Post -Uri $ReloadUrl -Headers $ReloadHeaders `
        -Body '{}' -TimeoutSec 10 | Out-Null
    Write-Host '  Schema reload OK' -ForegroundColor Green
} catch {
    $reloadStatus = 0
    try { $reloadStatus = [int]$_.Exception.Response.StatusCode } catch {}
    if ($reloadStatus -eq 404) {
        Write-Host '  pgrst_reload_schema() RPC not found — skipped.' -ForegroundColor DarkGray
        Write-Host '  To reload manually: run the following in the Supabase SQL editor:' -ForegroundColor DarkGray
        Write-Host "    SELECT pg_notify('pgrst', 'reload schema');" -ForegroundColor DarkGray
    } else {
        Write-Warning ('  Schema reload failed (HTTP ' + $reloadStatus + '): ' + $_.Exception.Message)
    }
}

# ── Final summary ─────────────────────────────────────────────────────────────

Write-Host ''
Write-Host '-------------------------------------------------------' -ForegroundColor $(if ($script:ExitCode -eq 0) { 'Green' } else { 'Red' })
Write-Host ' SYNC COMPLETE' -ForegroundColor $(if ($script:ExitCode -eq 0) { 'Green' } else { 'Red' })
Write-Host '-------------------------------------------------------' -ForegroundColor $(if ($script:ExitCode -eq 0) { 'Green' } else { 'Red' })
Write-Host (' Pulled from Acctivate   : ' + $pulled)
Write-Host (' Uploaded to Supabase    : ' + $uploaded)
Write-Host (' Failed rows             : ' + $failed)
Write-Host (' Batch-level failures    : ' + $batchFails)
Write-Host (' Distinct SKUs           : ' + $totalSkus)
Write-Host (' Total available         : ' + $totalAvail.ToString('N1'))
Write-Host (' Total on_hand           : ' + $totalOnHand.ToString('N1'))
Write-Host (' Retail value            : $' + $totalRetail.ToString('N2'))
Write-Host (' Inventory value         : $' + $totalInventory.ToString('N2'))
Write-Host (' First SKU               : ' + $firstSku)
Write-Host (' Last SKU                : ' + $lastSku)
Write-Host (' Target table            : stg_acctivate_discontinued_inventory')
Write-Host (' Finished                : ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))

if ($failed -gt 0) {
    Write-Host ''
    Write-Warning ($failed.ToString() + ' rows failed to upload. Existing Supabase data is preserved for those SKUs.')
}

Write-Host ''
Write-Host ' Validation SQL (run in Supabase SQL editor):' -ForegroundColor Cyan
Write-Host @'
    SELECT COUNT(*) AS total_rows, MAX(last_synced_at) AS last_sync
    FROM public.stg_acctivate_discontinued_inventory;

    SELECT is_discontinued, is_clearance, is_closeout,
           COUNT(*)        AS skus,
           SUM(available)  AS total_available,
           ROUND(SUM(list_price * available), 2) AS retail_value,
           ROUND(SUM(unit_cost  * on_hand),   2) AS inventory_value
    FROM public.stg_acctivate_discontinued_inventory
    GROUP BY is_discontinued, is_clearance, is_closeout
    ORDER BY is_discontinued DESC, is_clearance DESC, is_closeout DESC;
'@

exit $script:ExitCode
