<#
.SYNOPSIS
  Syncs total active-product inventory value from Acctivate SQL Server into
  Supabase table public.acctivate_inventory_value.

.DESCRIPTION
  Queries dbo.ProductWarehouseSummary joined to dbo.Product for all products
  where the product is Active in Acctivate (Status = 'Active' or equivalent).
  Includes BOTH active-non-discontinued AND active-discontinued products so the
  Total Inventory Value card matches the Acctivate balance sheet (~$1.834M).

  The OnHandValue field is used directly from Acctivate — never re-calculated
  from Available × UnitCost in the frontend.

  Safety:
    • Aborts without uploading if Acctivate returns 0 rows.
    • Preflight-tests one row before the bulk upload.
    • Non-zero exit on any failure.

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

  Schedule (Windows Task Scheduler):
    Task name : Daily Direct Acctivate Inventory Value Sync
    Program   : powershell.exe
    Arguments : -NoProfile -ExecutionPolicy Bypass -File "C:\AcctivateKPI\sync-total-inventory-value.ps1"
    Trigger   : Daily at 05:20 AM

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File C:\AcctivateKPI\sync-total-inventory-value.ps1
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
Write-Host ('=== Total Inventory Value Sync  ' + (Get-Date -Format 'yyyy-MM-dd HH:mm')) + ' ===' -ForegroundColor Yellow
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
$prodIdCol    = 'ProductID'
$descCol      = Pick-Col $prodCols @('Description','ProductDescription','Name')
$classCol     = Pick-Col $prodCols @('ProductClassID','ProductClass','Class')
$listPriceCol = Pick-Col $prodCols @('ListPrice','SD_Price','SuggestedRetail','Price')
$discCol      = Pick-Col $prodCols @('Discontinued','IsDiscontinued','Inactive')
$webCol       = Pick-Col $prodCols @('AvailableOnWeb','WebAvailable','IsWebEnabled','OnWeb')
$statusCol    = Pick-Col $prodCols @('Status','ProductStatus','Active')

# dbo.ProductWarehouseSummary columns
$whProdIdCol  = Pick-Col $whCols @('ProductID','ProductCode','SKU')
$whIdCol      = Pick-Col $whCols @('WarehouseID','Warehouse','WarehouseName','BranchID','Location','LocationID')
$onHandCol    = Pick-Col $whCols @('QtyOnHand','OnHand','QuantityOnHand','Qty_OnHand')
$availCol     = Pick-Col $whCols @('Available','QtyAvailable','QuantityAvailable','Qty_Available')
$whValueCol   = Pick-Col $whCols @('OnHandValue','InventoryValue','ValueOnHand','ExtendedCost','ExtCost','TotalCost','TotalValue','QtyOnHandValue')
$whCostCol    = Pick-Col $whCols @('AverageCost','AvgCost','UnitCost','LastCost','StandardCost','Cost')

if (-not $onHandCol -or -not $availCol -or -not $whProdIdCol) {
    Write-Error "Could not map required columns on dbo.ProductWarehouseSummary. Found: $($whCols -join ', ')"
    exit 1
}

Write-Host ('  dbo.Product columns              : ' + $prodCols.Count)
Write-Host ('  dbo.ProductWarehouseSummary cols : ' + $whCols.Count)
Write-Host ('  wh on_hand_value col (direct)    : ' + $(if ($whValueCol) { $whValueCol } else { '(none — will fall back to cost × qty)' }))
Write-Host ('  wh cost col (fallback)           : ' + $(if ($whCostCol)  { $whCostCol }  else { '(none)' }))
Write-Host ('  product status col               : ' + $(if ($statusCol)  { $statusCol }  else { '(none found)' }))
Write-Host ('  product discontinued col         : ' + $(if ($discCol)    { $discCol }    else { '(none found)' }))

# ── Build the WHERE clause for "Active" products ──────────────────────────────
# Acctivate's "Active" status means the product record is live (not archived/deleted).
# Discontinued products can still be Active — both must be included for the total
# to match the Acctivate balance sheet.

if ($statusCol) {
    # Status column typically holds 'Active' or 'Inactive' as a string.
    # Also handle bit-style Active = 1.
    $activeWhere = "(LOWER(CAST(p.$(Q $statusCol) AS NVARCHAR(32))) = 'active' OR CAST(p.$(Q $statusCol) AS NVARCHAR(32)) = '1')"
    Write-Host ("  Active filter: status column '$statusCol' = 'Active'") -ForegroundColor Cyan
} else {
    # No Status column found — include all products with on-hand inventory.
    $activeWhere = "1=1"
    Write-Warning "No Status/Active column found on dbo.Product. Including ALL products. Review the WHERE clause."
    Write-Warning ("  Product columns: " + ($prodCols -join ', '))
}

# ── Build SQL expressions ─────────────────────────────────────────────────────

$descExpr      = if ($descCol)      { "CAST(p.$(Q $descCol) AS NVARCHAR(512))"   } else { "CAST(p.$(Q $prodIdCol) AS NVARCHAR(512))" }
$classExpr     = if ($classCol)     { "CAST(p.$(Q $classCol) AS NVARCHAR(128))"  } else { 'NULL' }
$listPriceExpr = if ($listPriceCol) { "CAST(ISNULL(p.$(Q $listPriceCol),0) AS decimal(18,4))" } else { 'NULL' }
$discExpr      = if ($discCol)      { "CAST(ISNULL(p.$(Q $discCol),0) AS bit)"   } else { 'CAST(0 AS bit)' }
$webExpr       = if ($webCol)       { "CAST(ISNULL(p.$(Q $webCol),1) AS bit)"    } else { 'NULL' }
$statusExpr    = if ($statusCol)    { "CAST(p.$(Q $statusCol) AS NVARCHAR(50))"  } else { "'Active'" }
$whExpr        = if ($whIdCol)      { "CAST(ws.$(Q $whIdCol) AS NVARCHAR(128))"  } else { "'Warehouse'" }
$onHandExpr    = "CAST(ISNULL(ws.$(Q $onHandCol),0) AS decimal(18,4))"
$availExpr     = "CAST(ISNULL(ws.$(Q $availCol),0) AS decimal(18,4))"

# on_hand_value: use Acctivate's OnHandValue directly; fall back to cost × qty only if absent.
if ($whValueCol) {
    $onHandValueExpr = "CAST(ISNULL(ws.$(Q $whValueCol),0) AS decimal(18,4))"
    Write-Host ('  on_hand_value source : ws.' + $whValueCol + ' (Acctivate OnHandValue — direct)') -ForegroundColor Green
} elseif ($whCostCol) {
    $onHandValueExpr = "CAST(ISNULL(ws.$(Q $whCostCol),0) * ISNULL(ws.$(Q $onHandCol),0) AS decimal(18,4))"
    Write-Host ('  on_hand_value source : ws.' + $whCostCol + ' × on_hand (fallback — review)') -ForegroundColor Yellow
    Write-Warning "OnHandValue column not found. Falling back to cost × qty. Verify this matches Acctivate's balance sheet."
} else {
    $onHandValueExpr = 'CAST(0 AS decimal(18,4))'
    Write-Warning 'No cost or value column found — on_hand_value will be 0. Sync will NOT be useful.'
    Write-Warning ("  ProductWarehouseSummary columns: " + ($whCols -join ', '))
    $script:ExitCode = 1
}

$Query = @"
SELECT
  CAST(p.$(Q $prodIdCol) AS NVARCHAR(128))                  AS product_id,
  $whExpr                                                    AS warehouse,
  $descExpr                                                  AS description,
  $classExpr                                                 AS collection,
  $onHandExpr                                                AS on_hand,
  $availExpr                                                 AS available,
  $onHandValueExpr                                           AS on_hand_value,
  $listPriceExpr                                             AS list_price,
  $discExpr                                                  AS is_discontinued,
  $webExpr                                                   AS avail_on_web,
  $statusExpr                                                AS status_raw
FROM dbo.ProductWarehouseSummary ws
JOIN dbo.Product p ON p.$(Q $prodIdCol) = ws.$(Q $whProdIdCol)
WHERE $activeWhere
ORDER BY p.$(Q $prodIdCol), $whExpr
"@

# ── Pull from Acctivate ───────────────────────────────────────────────────────

Write-Host ''
Write-Host 'Querying Acctivate (all active products)...' -ForegroundColor Cyan
Write-Host ('  WHERE: ' + $activeWhere) -ForegroundColor DarkCyan

$allRows = Invoke-Sql -SqlQuery $Query
$pulled  = $allRows.Count

Write-Host ('  ' + $pulled + ' rows returned') -ForegroundColor $(if ($pulled -gt 0) { 'Green' } else { 'Yellow' })

if ($pulled -eq 0) {
    Write-Warning 'Acctivate returned 0 rows — aborting without touching Supabase.'
    Write-Warning 'Check: Status/Active column detection and WHERE clause above.'
    exit 1
}

# ── Reconciliation stats ──────────────────────────────────────────────────────

$totalOnHandValue = 0.0
$discOnHandValue  = 0.0
$totalOnHand      = 0.0
$totalSkusSet     = [System.Collections.Generic.HashSet[string]]::new()

foreach ($r in $allRows) {
    $pid   = if ($null -ne $r['product_id'])   { [string]$r['product_id'] } else { '' }
    $ohv   = if ($null -ne $r['on_hand_value']) { [double]$r['on_hand_value'] } else { 0.0 }
    $oh    = if ($null -ne $r['on_hand'])        { [double]$r['on_hand'] }       else { 0.0 }
    $disc  = $false
    $rawDisc = $r['is_discontinued']
    if ($rawDisc -is [bool])         { $disc = $rawDisc }
    elseif ($null -ne $rawDisc)      { $disc = [string]$rawDisc -in @('1','True','true') }

    $totalOnHandValue += $ohv
    $totalOnHand      += $oh
    $totalSkusSet.Add($pid) | Out-Null
    if ($disc) { $discOnHandValue += $ohv }
}

Write-Host ''
Write-Host 'Pre-upload reconciliation (from Acctivate pull):' -ForegroundColor Cyan
Write-Host ('  Rows pulled                  : ' + $pulled)
Write-Host ('  Distinct SKUs                : ' + $totalSkusSet.Count)
Write-Host ('  Total on_hand units          : ' + $totalOnHand.ToString('N1'))
Write-Host ('  Total On Hand Value          : $' + $totalOnHandValue.ToString('N2')) -ForegroundColor $(if ($totalOnHandValue -gt 1000000) { 'Green' } else { 'Yellow' })
Write-Host ('  Discontinued On Hand Value   : $' + $discOnHandValue.ToString('N2'))
Write-Host ('  Non-disc On Hand Value       : $' + ($totalOnHandValue - $discOnHandValue).ToString('N2'))

# ── Row serialization ─────────────────────────────────────────────────────────

$UpsertUrl = $SupabaseUrl + '/rest/v1/acctivate_inventory_value?on_conflict=product_id,warehouse'
$Headers   = @{
    'apikey'        = $ServiceKey
    'Authorization' = 'Bearer ' + $ServiceKey
    'Content-Type'  = 'application/json; charset=utf-8'
    'Prefer'        = 'resolution=merge-duplicates,return=minimal'
}

function ConvertTo-Bool {
    param($Val, [bool]$Default = $false)
    if ($null -eq $Val) { return $Default }
    if ($Val -is [bool]) { return $Val }
    $s = [string]$Val
    return $s -in @('1','True','true','Yes','yes','Active','active')
}

function ConvertTo-NullableDouble {
    param($Val)
    if ($null -eq $Val) { return $null }
    try { return [double]$Val } catch { return $null }
}

function Clean-Row {
    param([hashtable]$Row)

    $pid = if ($null -ne $Row['product_id']) { ([string]$Row['product_id']).Trim() } else { '' }
    $wh  = if ($null -ne $Row['warehouse'])  { ([string]$Row['warehouse']).Trim() }  else { 'Warehouse' }
    if (-not $wh) { $wh = 'Warehouse' }

    $isDisc   = ConvertTo-Bool -Val $Row['is_discontinued'] -Default $false
    $isActive = ConvertTo-Bool -Val $Row['status_raw']      -Default $true
    $isWeb    = if ($null -ne $Row['avail_on_web']) { ConvertTo-Bool -Val $Row['avail_on_web'] -Default $true } else { $null }

    $ohv = ConvertTo-NullableDouble $Row['on_hand_value']
    $lp  = ConvertTo-NullableDouble $Row['list_price']

    $cleaned = [ordered]@{
        'product_id'    = $pid
        'warehouse'     = $wh
        'description'   = if ($null -ne $Row['description'])  { [string]$Row['description'] }  else { $null }
        'collection'    = if ($null -ne $Row['collection'])   { [string]$Row['collection'] }   else { $null }
        'on_hand'       = if ($null -ne $Row['on_hand'])      { [double]$Row['on_hand'] }      else { 0.0 }
        'available'     = if ($null -ne $Row['available'])    { [double]$Row['available'] }    else { 0.0 }
        'on_hand_value' = if ($null -ne $ohv) { $ohv } else { 0.0 }
        'list_price'    = $lp
        'active'        = $isActive
        'discontinued'  = $isDisc
        'avail_on_web'  = $isWeb
        'synced_at'     = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    }
    return $cleaned
}

# ── Preflight ─────────────────────────────────────────────────────────────────

function Test-Preflight {
    param([hashtable]$SampleRow)
    Write-Host '  Sending preflight row...' -ForegroundColor DarkCyan
    $cleaned   = Clean-Row $SampleRow
    $payload   = @($cleaned) | ConvertTo-Json -Depth 5 -Compress
    $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
    try {
        $resp = Invoke-WebRequest -Method Post -Uri $UpsertUrl -Headers $Headers `
            -Body $bodyBytes -TimeoutSec $RequestTimeout -UseBasicParsing
        Write-Host ('  Preflight OK (HTTP ' + [int]$resp.StatusCode + ')') -ForegroundColor Green
        return $true
    } catch {
        $statusCode = 0; $errBody = ''
        try { $statusCode = [int]$_.Exception.Response.StatusCode }               catch {}
        try {
            $stream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            $errBody = $reader.ReadToEnd()
        } catch {}
        Write-Host ("  Preflight FAILED (HTTP $statusCode)") -ForegroundColor Red
        Write-Host ("  Response body : $errBody") -ForegroundColor Red
        Write-Host ("  Payload sent  : $payload") -ForegroundColor Red
        return $false
    }
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
                Write-Warning ('  batch failed (attempt ' + $attempt + '): ' + $_.Exception.Message + ' — retrying in ' + $RetryDelay + 's')
                Start-Sleep -Seconds $RetryDelay
            }
        }
    }
    return $false
}

# ── Upload ────────────────────────────────────────────────────────────────────

Write-Host ''
Write-Host ('Uploading ' + $pulled + ' rows in batches of ' + $BatchSize + '...') -ForegroundColor Cyan

if (-not (Test-Preflight -SampleRow $allRows[0])) {
    Write-Error 'Preflight failed — aborting. Existing Supabase data is unchanged.'
    exit 1
}

$uploaded = 0; $failed = 0; $batchFails = 0

for ($i = 0; $i -lt $pulled; $i += $BatchSize) {
    $last    = [Math]::Min($i + $BatchSize - 1, $pulled - 1)
    $chunk   = $allRows[$i..$last]
    $cleaned = @($chunk | ForEach-Object { Clean-Row $_ })
    $body    = $cleaned | ConvertTo-Json -Depth 5 -Compress

    if (Post-Batch -Body $body) {
        $uploaded += $chunk.Count
        Write-Host ('  rows ' + ($i + 1) + '-' + ($last + 1) + '/' + $pulled + '  ok') -ForegroundColor DarkCyan
    } else {
        $batchFails++
        Write-Warning ('  batch ' + ($i + 1) + '-' + ($last + 1) + ' failed; retrying row by row...')
        foreach ($row in $chunk) {
            $rowBody = @(Clean-Row $row) | ConvertTo-Json -Depth 5 -Compress
            if (Post-Batch -Body $rowBody) {
                $uploaded++
            } else {
                $failed++
                $sku = if ($null -ne $row['product_id']) { $row['product_id'] } else { '(null)' }
                $wh  = if ($null -ne $row['warehouse'])  { $row['warehouse'] }  else { '(null)' }
                Write-Warning ('    FAILED  sku=' + $sku + '  warehouse=' + $wh)
                $script:ExitCode = 1
            }
        }
    }
}

# ── Schema reload ─────────────────────────────────────────────────────────────

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
    $rc = 0; try { $rc = [int]$_.Exception.Response.StatusCode } catch {}
    if ($rc -eq 404) {
        Write-Host '  pgrst_reload_schema() not found — skipped.' -ForegroundColor DarkGray
    } else {
        Write-Warning ('  Schema reload warning (HTTP ' + $rc + '): ' + $_.Exception.Message)
    }
}

# ── Summary ───────────────────────────────────────────────────────────────────

Write-Host ''
Write-Host '───────────────────────────────────────────────────────' -ForegroundColor $(if ($script:ExitCode -eq 0) { 'Green' } else { 'Red' })
Write-Host ' SYNC COMPLETE' -ForegroundColor $(if ($script:ExitCode -eq 0) { 'Green' } else { 'Red' })
Write-Host '───────────────────────────────────────────────────────' -ForegroundColor $(if ($script:ExitCode -eq 0) { 'Green' } else { 'Red' })
Write-Host (' Pulled from Acctivate        : ' + $pulled)
Write-Host (' Uploaded to Supabase         : ' + $uploaded)
Write-Host (' Failed rows                  : ' + $failed)
Write-Host (' Target table                 : public.acctivate_inventory_value')
Write-Host (' Total On Hand Value          : $' + $totalOnHandValue.ToString('N2'))
Write-Host (' Discontinued On Hand Value   : $' + $discOnHandValue.ToString('N2'))
Write-Host (' Non-disc On Hand Value       : $' + ($totalOnHandValue - $discOnHandValue).ToString('N2'))
Write-Host (' Finished                     : ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
Write-Host ''
Write-Host ' Validation SQL (run in Supabase SQL editor):' -ForegroundColor Cyan
Write-Host @'

-- A. Total active inventory value
SELECT
  ROUND(SUM(on_hand_value), 2) AS total_inventory_value,
  COUNT(DISTINCT product_id)   AS skus,
  SUM(on_hand)                 AS total_on_hand_units
FROM public.acctivate_inventory_value
WHERE active = TRUE;

-- B. Discontinued inventory value
SELECT
  ROUND(SUM(on_hand_value), 2) AS discontinued_inventory_value,
  COUNT(DISTINCT product_id)   AS discontinued_skus,
  SUM(on_hand)                 AS discontinued_units
FROM public.acctivate_inventory_value
WHERE active = TRUE
  AND discontinued = TRUE;

-- C. Warehouse breakdown
SELECT
  warehouse,
  ROUND(SUM(on_hand_value), 2) AS inventory_value,
  COUNT(DISTINCT product_id)   AS skus,
  SUM(on_hand)                 AS units
FROM public.acctivate_inventory_value
WHERE active = TRUE
GROUP BY warehouse
ORDER BY inventory_value DESC;

'@

if ($failed -gt 0) {
    Write-Warning ($failed.ToString() + ' rows failed. Existing Supabase data preserved for those SKUs.')
}

exit $script:ExitCode
