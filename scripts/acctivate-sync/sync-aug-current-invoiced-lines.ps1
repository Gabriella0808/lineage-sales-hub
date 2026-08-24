<#
.SYNOPSIS
    Syncs current-month Acctivate invoice lines into Supabase with a
    guaranteed-unique 8-part natural key.

.DESCRIPTION
    Pulls the full current calendar month of InvoiceDetail rows using a CTE
    that assigns a ROW_NUMBER() within every (InvoiceNumber, LineNumber,
    SubLineNumber, ComponentLevel, ProductID, OrderNumber, GUIDInvoiceDetail)
    partition.  The 8-part natural_key is:

        invoice_number - line_number - sub_line_number - component_level
        - product_id - order_number - guid_invoice_detail - duplicate_row_ordinal

    Before uploading, the script verifies that all 8-part keys are distinct and
    ABORTS if any duplicates remain (prints the offending keys for diagnosis).

    On batch failure, every row is retried individually; failed rows are written
    to a timestamped CSV.  After upload, the materialized view is refreshed and
    a category/spot-check reconciliation is printed.

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
        "batchSize": 50, "maxRetries": 3,
        "retryDelaySeconds": 10, "requestTimeoutSec": 60
    }

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File C:\AcctivateKPI\sync-aug-current-invoiced-lines.ps1
#>

[CmdletBinding()]
param(
    [string]$ConfigPath = (Join-Path $PSScriptRoot 'kpi.config.json')
)

$ErrorActionPreference = 'Stop'

# --- Config ------------------------------------------------------------------

if (-not (Test-Path $ConfigPath)) {
    throw "Config not found: $ConfigPath"
}

$cfg = Get-Content $ConfigPath -Raw | ConvertFrom-Json

$SupabaseUrl    = $cfg.supabaseUrl.TrimEnd('/')
$ServiceKey     = $cfg.serviceRoleKey
$BatchSize      = 50
if ($cfg.batchSize)          { $BatchSize      = [int]$cfg.batchSize }
$MaxRetries     = 3
if ($cfg.maxRetries)         { $MaxRetries     = [int]$cfg.maxRetries }
$RetryDelay     = 10
if ($cfg.retryDelaySeconds)  { $RetryDelay     = [int]$cfg.retryDelaySeconds }
$RequestTimeout = 60
if ($cfg.requestTimeoutSec)  { $RequestTimeout = [int]$cfg.requestTimeoutSec }
$SqlTimeout     = 600
if ($cfg.sql.commandTimeoutSeconds) { $SqlTimeout = [int]$cfg.sql.commandTimeoutSeconds }

if (-not $SupabaseUrl -or -not $ServiceKey) {
    throw "supabaseUrl and serviceRoleKey are required in $ConfigPath"
}

# --- Connection string -------------------------------------------------------

$connStr = 'Server=' + $cfg.sql.server + ';Database=' + $cfg.sql.database + ';Connection Timeout=30;'
if ($cfg.sql.integratedSecurity) {
    $connStr = $connStr + 'Integrated Security=SSPI;'
} else {
    $connStr = $connStr + 'User Id=' + $cfg.sql.user + ';Password=' + $cfg.sql.password + ';'
}
$connStr = $connStr + 'Encrypt=False;TrustServerCertificate=True;'

# --- SQL query ---------------------------------------------------------------
# CTE assigns duplicate_row_ordinal via ROW_NUMBER() so that rows which share
# every identifying field (including GUIDInvoiceDetail) still get a unique ordinal.
# Date range: first day of current month through first day of next month,
# matching Andrew's SSMS pattern for August (>= 2026-08-01, < 2026-09-01).

$Query = @"
WITH src AS (
    SELECT
        CAST(dtl.GUIDInvoiceDetail              AS NVARCHAR(64))   AS guid_invoice_detail,
        CAST(dtl.GUIDInvoice                    AS NVARCHAR(64))   AS guid_invoice,
        CAST(inv.InvoiceNumber                  AS NVARCHAR(64))   AS invoice_number,
        CAST(dtl.LineNumber                     AS NVARCHAR(20))   AS line_number,
        CAST(ISNULL(dtl.SubLineNumber,  0)      AS NVARCHAR(20))   AS sub_line_number,
        CAST(ISNULL(dtl.ComponentLevel, 0)      AS NVARCHAR(20))   AS component_level,
        CAST(inv.InvoiceDate                    AS date)           AS invoice_date,
        CAST(inv.InvoiceDate                    AS date)           AS transaction_date,
        YEAR(inv.InvoiceDate)                                      AS [year],
        MONTH(inv.InvoiceDate)                                     AS month_number,
        CAST(inv.CustomerID                     AS NVARCHAR(100))  AS customer_id,
        CAST(ISNULL(inv.SalespersonID,  '')     AS NVARCHAR(100))  AS sales_rep_id,
        CAST(ISNULL(inv.BranchID,       '')     AS NVARCHAR(100))  AS branch_id,
        CAST(ISNULL(dtl.OrderNumber,    '')     AS NVARCHAR(100))  AS order_number,
        CAST(ISNULL(dtl.ProductID,      '')     AS NVARCHAR(255))  AS product_id,
        CAST(ISNULL(dtl.Description,    '')     AS NVARCHAR(500))  AS description,
        CAST(COALESCE(dtl.QtyInvoiced,    0)    AS decimal(18,4))  AS qty_invoiced,
        CAST(COALESCE(dtl.LineDiscountPct,0)    AS decimal(18,4))  AS line_discount_pct,
        CAST(ISNULL(dtl.SalesAccountID, '')     AS NVARCHAR(255))  AS sales_account_id,
        CAST(COALESCE(dtl.Price,          0)    AS decimal(18,4))  AS price,
        CAST(COALESCE(dtl.Amount,         0)    AS decimal(18,2))  AS invoice_detail_amount,
        CAST(
            COALESCE(dtl.Price,          0)
            * COALESCE(dtl.QtyInvoiced,  0)
            * (1.0 - COALESCE(dtl.LineDiscountPct, 0) / 100.0)
            AS decimal(18,2)
        )                                                          AS formula_net_amount,
        CAST(ISNULL(prod.SalesCategory,  '')    AS NVARCHAR(100))  AS product_sales_category,
        -- Human-readable collection name from ProductClass.Description; falls back to
        -- ProductClassID code so the portal can group by collection automatically.
        CAST(COALESCE(NULLIF(RTRIM(pc.Description), ''), NULLIF(RTRIM(prod.ProductClassID), ''), '') AS NVARCHAR(128)) AS product_class,
        CAST('aug_direct_pull'                  AS NVARCHAR(50))   AS source,
        ROW_NUMBER() OVER (
            PARTITION BY
                inv.InvoiceNumber,
                dtl.LineNumber,
                dtl.SubLineNumber,
                dtl.ComponentLevel,
                dtl.ProductID,
                dtl.OrderNumber,
                dtl.GUIDInvoiceDetail
            ORDER BY
                dtl.ProductID,
                dtl.Description,
                dtl.QtyInvoiced,
                dtl.Price,
                dtl.Amount,
                dtl.TransactionDate
        ) AS duplicate_row_ordinal
    FROM dbo.InvoiceDetail dtl
    INNER JOIN dbo.Invoice inv
        ON dtl.InvoiceNumber = inv.InvoiceNumber
    LEFT JOIN dbo.Product prod
        ON dtl.ProductID = prod.ProductID
    LEFT JOIN dbo.ProductClass pc
        ON pc.ProductClassID = prod.ProductClassID
    WHERE inv.InvoiceDate >= DATEADD(month, DATEDIFF(month, 0, GETDATE()), 0)
      AND inv.InvoiceDate <  DATEADD(month, DATEDIFF(month, 0, GETDATE()) + 1, 0)
)
SELECT * FROM src
ORDER BY invoice_date, invoice_number, line_number, sub_line_number, component_level
"@

# --- SQL execution -----------------------------------------------------------

function Invoke-Sql {
    param([string]$SqlQuery)
    $conn = New-Object System.Data.SqlClient.SqlConnection($connStr)
    $conn.Open()
    try {
        $cmd             = $conn.CreateCommand()
        $cmd.CommandText = $SqlQuery
        $cmd.CommandTimeout = $SqlTimeout
        $reader = $cmd.ExecuteReader()
        $rows = New-Object System.Collections.Generic.List[hashtable]
        while ($reader.Read()) {
            $row = @{}
            for ($i = 0; $i -lt $reader.FieldCount; $i++) {
                $name = $reader.GetName($i)
                $val  = $reader.GetValue($i)
                if ($val -is [System.DBNull]) {
                    $row[$name] = $null
                } else {
                    $row[$name] = $val
                }
            }
            $rows.Add($row) | Out-Null
        }
        return ,$rows.ToArray()
    } finally {
        $conn.Close()
    }
}

# --- Value and row cleaning --------------------------------------------------

function Clean-Value {
    param($Val)
    if ($null -eq $Val) { return $null }
    if ($Val -is [string]) {
        return ($Val -replace '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '')
    }
    if ($Val -is [datetime]) {
        return $Val.ToString('yyyy-MM-dd')
    }
    if ($Val -is [System.Decimal] -or $Val -is [double] -or $Val -is [float]) {
        $d = [double]$Val
        if ([double]::IsNaN($d) -or [double]::IsInfinity($d)) { return $null }
        return $d
    }
    if ($Val -is [System.Int32] -or $Val -is [System.Int64] -or $Val -is [int] -or $Val -is [long]) {
        return [long]$Val
    }
    return $Val.ToString()
}

function Clean-Row {
    param([hashtable]$Row)
    $out = @{}
    foreach ($key in $Row.Keys) {
        $out[$key] = Clean-Value $Row[$key]
    }
    return $out
}

# --- HTTP upsert -------------------------------------------------------------
# Always uses natural_key as the conflict target (8-part key is guaranteed unique).

$UpsertUrl = $SupabaseUrl + '/rest/v1/acctivate_invoice_lines_2026_direct?on_conflict=natural_key'

$UpsertHeaders = @{
    'apikey'        = $ServiceKey
    'Authorization' = 'Bearer ' + $ServiceKey
    'Content-Type'  = 'application/json'
    'Prefer'        = 'resolution=merge-duplicates,return=minimal'
}

function Post-Json {
    param([string]$Body)
    for ($attempt = 1; $attempt -le $MaxRetries; $attempt++) {
        try {
            Invoke-RestMethod -Method Post -Uri $UpsertUrl -Headers $UpsertHeaders `
                -Body $Body -TimeoutSec $RequestTimeout | Out-Null
            return $true
        } catch {
            if ($attempt -lt $MaxRetries) {
                Start-Sleep -Seconds $RetryDelay
            }
        }
    }
    return $false
}

# --- CSV logger for failed rows ----------------------------------------------

$FailedCsvPath = Join-Path $PSScriptRoot ('failed_rows_' + (Get-Date -Format 'yyyyMMdd_HHmmss') + '.csv')
$script:FailedCount = 0
$script:CsvReady    = $false

$CsvColumns = @(
    '_fail_reason', 'natural_key', 'guid_invoice_detail', 'guid_invoice',
    'invoice_number', 'line_number', 'sub_line_number', 'component_level',
    'duplicate_row_ordinal', 'invoice_date', 'transaction_date',
    'year', 'month_number', 'customer_id', 'sales_rep_id', 'branch_id',
    'order_number', 'product_id', 'description', 'qty_invoiced',
    'line_discount_pct', 'sales_account_id', 'price',
    'invoice_detail_amount', 'formula_net_amount',
    'product_sales_category', 'product_class', 'source'
)

function Log-FailedRow {
    param([hashtable]$Row, [string]$Reason)
    if (-not $script:CsvReady) {
        $CsvColumns -join ',' | Out-File -FilePath $FailedCsvPath -Encoding utf8 -Append
        $script:CsvReady = $true
    }
    $vals = $CsvColumns | ForEach-Object {
        if ($_ -eq '_fail_reason') {
            $s = $Reason
        } else {
            $v = $Row[$_]
            $s = if ($null -eq $v) { '' } else { $v.ToString() }
        }
        $s = $s.Replace('"', '""')
        if ($s -match '[,"\r\n]') { '"' + $s + '"' } else { $s }
    }
    $vals -join ',' | Out-File -FilePath $FailedCsvPath -Encoding utf8 -Append
    $script:FailedCount++
}

# --- Reconciliation config ---------------------------------------------------

$ReconCategories = @('ALLOW', 'FL', 'FINNLOU', 'LUX', 'SW')

$ExpectedTotals = @{
    'ALLOW'   = @{ Lines = 0; Amt = 0 }   # update after confirming live totals
    'FL'      = @{ Lines = 0; Amt = 0 }   # update after confirming live totals
    'FINNLOU' = @{ Lines = 0; Amt = 0 }   # update after confirming live totals
    'LUX'     = @{ Lines = 0; Amt = 0 }   # update after confirming live totals
    'SW'      = @{ Lines = 0; Amt = 0 }   # update after confirming live totals
}

$SpotChecks = @(
    @{ Date = '2026-08-04'; Cat = 'SW';  ExpLines = 33; ExpAmt = 12130.59 },
    @{ Date = '2026-08-05'; Cat = 'LUX'; ExpLines = 30; ExpAmt = 4230.07  },
    @{ Date = '2026-08-05'; Cat = 'SW';  ExpLines = 78; ExpAmt = 27283.99 }
)

function Get-DateStr {
    param($Val)
    if ($null -eq $Val) { return '' }
    if ($Val -is [datetime]) { return $Val.ToString('yyyy-MM-dd') }
    return $Val.ToString()
}

# --- Main --------------------------------------------------------------------

Write-Host ''
Write-Host ('=== Invoice Sync  ' + (Get-Date -Format 'yyyy-MM-dd HH:mm') + ' ===') -ForegroundColor Yellow
Write-Host ('Server : ' + $cfg.sql.server + ' / ' + $cfg.sql.database)
Write-Host 'Range  : full current calendar month (via dynamic DATEADD)'

# Pull rows from Acctivate
Write-Host ''
Write-Host 'Querying Acctivate...' -ForegroundColor Cyan
$allRows = Invoke-Sql -SqlQuery $Query
$pulled  = $allRows.Count
Write-Host ('  ' + $pulled + ' rows returned from Acctivate') -ForegroundColor Green

if ($pulled -eq 0) {
    Write-Warning 'No rows returned. Check SQL Server connection and date range.'
    exit 0
}

# Build 8-part natural_key for every row
foreach ($row in $allRows) {
    $p1 = if ($null -ne $row['invoice_number'])         { $row['invoice_number'].ToString()         } else { '' }
    $p2 = if ($null -ne $row['line_number'])             { $row['line_number'].ToString()             } else { '' }
    $p3 = if ($null -ne $row['sub_line_number'])         { $row['sub_line_number'].ToString()         } else { '' }
    $p4 = if ($null -ne $row['component_level'])         { $row['component_level'].ToString()         } else { '' }
    $p5 = if ($null -ne $row['product_id'])              { $row['product_id'].ToString()              } else { '' }
    $p6 = if ($null -ne $row['order_number'])            { $row['order_number'].ToString()            } else { '' }
    $p7 = if ($null -ne $row['guid_invoice_detail'])     { $row['guid_invoice_detail'].ToString()     } else { '' }
    $p8 = if ($null -ne $row['duplicate_row_ordinal'])   { $row['duplicate_row_ordinal'].ToString()   } else { '1' }
    $row['natural_key'] = $p1 + '-' + $p2 + '-' + $p3 + '-' + $p4 + '-' + $p5 + '-' + $p6 + '-' + $p7 + '-' + $p8
}

# GUID diagnostics (informational)
$blankGuids = 0
$guidCounts = @{}
foreach ($row in $allRows) {
    $g = $row['guid_invoice_detail']
    if ($null -eq $g -or $g.ToString().Trim() -eq '') {
        $blankGuids++
    } else {
        $k = $g.ToString()
        if ($guidCounts.ContainsKey($k)) { $guidCounts[$k]++ } else { $guidCounts[$k] = 1 }
    }
}
$dupGuidCount = 0
foreach ($cnt in $guidCounts.Values) { if ($cnt -gt 1) { $dupGuidCount += ($cnt - 1) } }

# Natural key uniqueness check
$keyCounts = @{}
foreach ($row in $allRows) {
    $k = $row['natural_key']
    if ($keyCounts.ContainsKey($k)) { $keyCounts[$k]++ } else { $keyCounts[$k] = 1 }
}
$distinctNK = $keyCounts.Count
$dupNKCount = $pulled - $distinctNK

Write-Host ''
Write-Host 'Pre-upload diagnostics:' -ForegroundColor Cyan
Write-Host ('  Rows pulled from Acctivate   : ' + $pulled)
Write-Host ('  Distinct guid_invoice_detail : ' + $guidCounts.Count)
Write-Host ('  Duplicate GUIDs (extra rows) : ' + $dupGuidCount)
Write-Host ('  Blank / null GUIDs           : ' + $blankGuids)
Write-Host ('  Distinct natural_key count   : ' + $distinctNK)
Write-Host ('  Duplicate natural_key count  : ' + $dupNKCount)

if ($dupNKCount -gt 0) {
    Write-Host ''
    Write-Host 'DUPLICATE natural_keys (first 10):' -ForegroundColor Red
    $shown = 0
    foreach ($entry in $keyCounts.GetEnumerator()) {
        if ($entry.Value -gt 1) {
            Write-Host ('  ' + $entry.Key + '  (' + $entry.Value + ' rows)') -ForegroundColor Red
            $shown++
            if ($shown -ge 10) { break }
        }
    }
    throw ('ABORT: natural_key is not unique (' + $dupNKCount + ' extra rows). Fix the key before uploading.')
}

Write-Host ('  -> All natural_keys are distinct. Proceeding with upload.') -ForegroundColor Green

# Category sums (computed once from the SQL pull)
$reconSums   = @{}
$reconCounts = @{}
foreach ($cat in $ReconCategories) { $reconSums[$cat] = 0.0; $reconCounts[$cat] = 0 }
foreach ($row in $allRows) {
    $cat = $row['product_sales_category']
    if ($null -ne $cat -and $reconSums.ContainsKey($cat)) {
        $v = $row['formula_net_amount']
        if ($null -ne $v) { $reconSums[$cat] += [double]$v }
        $reconCounts[$cat]++
    }
}
$reconTotal  = 0.0; $reconLines = 0
foreach ($cat in $ReconCategories) { $reconTotal += $reconSums[$cat]; $reconLines += $reconCounts[$cat] }

Write-Host ''
Write-Host 'formula_net_amount by SalesCategory (Acctivate pull):' -ForegroundColor Cyan
foreach ($cat in $ReconCategories) {
    Write-Host ('  ' + $cat.PadRight(10) + $reconSums[$cat].ToString('N2').PadLeft(14) + '  ' + $reconCounts[$cat].ToString().PadLeft(4) + ' lines')
}
Write-Host ('  ' + 'Total'.PadRight(10) + $reconTotal.ToString('N2').PadLeft(14) + '  ' + $reconLines.ToString().PadLeft(4) + ' lines') -ForegroundColor Green

# Upload
Write-Host ''
Write-Host ('Uploading in batches of ' + $BatchSize + ' (conflict key: natural_key)...') -ForegroundColor Cyan

$uploaded   = 0
$batchFails = 0

for ($i = 0; $i -lt $pulled; $i += $BatchSize) {
    $last  = [Math]::Min($i + $BatchSize - 1, $pulled - 1)
    $chunk = $allRows[$i..$last]

    $cleaned   = @($chunk | ForEach-Object { Clean-Row $_ })
    $batchBody = $cleaned | ConvertTo-Json -Depth 5 -Compress

    if (Post-Json -Body $batchBody) {
        $uploaded += $chunk.Count
        Write-Host ('  rows ' + ($i + 1) + '-' + ($last + 1) + '/' + $pulled + '  ok') -ForegroundColor DarkCyan
    } else {
        $batchFails++
        Write-Warning ('  batch ' + ($i + 1) + '-' + ($last + 1) + ' failed; retrying row by row...')
        foreach ($row in $chunk) {
            $cleanedRow = Clean-Row $row
            $rowBody    = @($cleanedRow) | ConvertTo-Json -Depth 5 -Compress
            if (Post-Json -Body $rowBody) {
                $uploaded++
            } else {
                $nk   = if ($null -ne $row['natural_key'])        { $row['natural_key']        } else { 'NULL' }
                $guid = if ($null -ne $row['guid_invoice_detail']) { $row['guid_invoice_detail']} else { 'NULL' }
                Write-Warning ('    FAILED  nk=' + $nk + '  guid=' + $guid)
                Log-FailedRow -Row $row -Reason 'upload failed after retries'
            }
        }
    }
}

Write-Host ('  ' + $uploaded + ' of ' + $pulled + ' rows uploaded') -ForegroundColor Green
if ($script:FailedCount -gt 0) {
    Write-Warning ($script:FailedCount.ToString() + ' rows failed -- see ' + $FailedCsvPath)
}

# Refresh materialized view
Write-Host ''
Write-Host 'Refreshing mv_portal_monthly_invoiced_actuals...' -ForegroundColor Cyan
$RpcUrl = $SupabaseUrl + '/rest/v1/rpc/refresh_mv_portal_invoiced'
$RpcHeaders = @{
    'apikey'        = $ServiceKey
    'Authorization' = 'Bearer ' + $ServiceKey
    'Content-Type'  = 'application/json'
}
$rpcOk = $false
for ($attempt = 1; $attempt -le $MaxRetries; $attempt++) {
    try {
        Invoke-RestMethod -Method Post -Uri $RpcUrl -Headers $RpcHeaders `
            -Body '{}' -TimeoutSec 120 | Out-Null
        Write-Host '  materialized view refreshed' -ForegroundColor Green
        $rpcOk = $true
        break
    } catch {
        if ($attempt -ge $MaxRetries) {
            Write-Warning ('Mat view refresh failed: ' + $_.Exception.Message)
            Write-Warning 'Run manually: SELECT public.refresh_mv_portal_invoiced();'
        } else {
            Start-Sleep -Seconds $RetryDelay
        }
    }
}

# Final summary
Write-Host ''
Write-Host '----------------------------------------------' -ForegroundColor Green
Write-Host ' SYNC COMPLETE' -ForegroundColor Green
Write-Host '----------------------------------------------' -ForegroundColor Green
Write-Host (' Pulled from Acctivate    : ' + $pulled)
Write-Host (' Uploaded to Supabase     : ' + $uploaded)
Write-Host (' Failed rows (CSV)        : ' + $script:FailedCount)
Write-Host (' Batch fallbacks          : ' + $batchFails)
Write-Host (' Mat view refreshed       : ' + $rpcOk)
if ($script:FailedCount -gt 0) {
    Write-Host (' Failed CSV               : ' + $FailedCsvPath) -ForegroundColor Yellow
}

Write-Host ''
Write-Host ' Category totals vs SSMS expected:' -ForegroundColor Cyan
$allOk = ($uploaded -eq $pulled -and $script:FailedCount -eq 0)
foreach ($cat in $ReconCategories) {
    $amt    = $reconSums[$cat]
    $lines  = $reconCounts[$cat]
    $expAmt = $ExpectedTotals[$cat].Amt
    $expLn  = $ExpectedTotals[$cat].Lines
    $amtOk  = [Math]::Abs($amt - $expAmt) -lt 0.02
    $lnOk   = ($lines -eq $expLn)
    $ok     = $amtOk -and $lnOk
    if (-not $ok) { $allOk = $false }
    $verdict = if ($ok) { 'MATCH' } else { 'MISMATCH' }
    $color   = if ($ok) { 'Green'  } else { 'Red'     }
    Write-Host ('  ' + $cat.PadRight(10) + $amt.ToString('N2').PadLeft(14) + '  ' + $lines.ToString().PadLeft(4) + ' lines   ' + $verdict + '  (exp ' + $expAmt.ToString('N2') + ' / ' + $expLn + ' lines)') -ForegroundColor $color
}
Write-Host ('  ' + 'Total'.PadRight(10) + $reconTotal.ToString('N2').PadLeft(14) + '  ' + $reconLines.ToString().PadLeft(4) + ' lines')

Write-Host ''
Write-Host ' Spot checks:' -ForegroundColor Cyan
foreach ($sc in $SpotChecks) {
    $scRows  = @($allRows | Where-Object { (Get-DateStr $_['invoice_date']) -eq $sc.Date -and $_['product_sales_category'] -eq $sc.Cat })
    $scLines = $scRows.Count
    $scAmt   = 0.0
    foreach ($r in $scRows) {
        $v = $r['formula_net_amount']
        if ($null -ne $v) { $scAmt += [double]$v }
    }
    $ok      = [Math]::Abs($scAmt - $sc.ExpAmt) -lt 0.02 -and ($scLines -eq $sc.ExpLines)
    if (-not $ok) { $allOk = $false }
    $verdict = if ($ok) { 'MATCH' } else { 'MISMATCH' }
    $color   = if ($ok) { 'Green' } else { 'Red'     }
    Write-Host ('  ' + $sc.Date + ' ' + $sc.Cat.PadRight(8) + $scLines.ToString().PadLeft(4) + ' lines  ' + $scAmt.ToString('N2').PadLeft(12) + '   ' + $verdict + '  (exp ' + $sc.ExpLines + ' / ' + $sc.ExpAmt.ToString('N2') + ')') -ForegroundColor $color
}

Write-Host ''
if ($allOk) {
    Write-Host ' ALL CHECKS PASSED' -ForegroundColor Green
} else {
    Write-Host ' ONE OR MORE CHECKS FAILED -- review output above' -ForegroundColor Red
}
Write-Host '----------------------------------------------' -ForegroundColor Green
Write-Host (' Finished ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')) -ForegroundColor Green
