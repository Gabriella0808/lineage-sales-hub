<#
.SYNOPSIS
    Backfills Jan–Jul 2026 invoice lines from Acctivate into
    public.acctivate_invoice_lines_2026_direct using source = 'jan_jul_direct_pull'.

.DESCRIPTION
    Pulls all Jan–Jul 2026 InvoiceDetail rows from Acctivate (no source-level
    category filter), prints a full diagnostic breakdown, then:

      1. Deletes old incomplete rows where source = 'Acctivate direct VM invoice line pull'
      2. Deletes any existing 'jan_jul_direct_pull' rows (idempotency pass)
      3. Uploads the fresh pull with source = 'jan_jul_direct_pull'
      4. Refreshes mv_portal_monthly_invoiced_actuals

    Does NOT change:
      - August rows  (source = 'aug_direct_pull')
      - acctivate_kpi_monthly_invoiced_2026  (locked KPI table — untouched)
      - Bookings

    The category/amount methodology matches August:
      formula_net_amount = Price * QtyInvoiced * (1 - LineDiscountPct / 100)
      Reporting filter (view-layer): exclude FREIGHTO, MISC, SALESTAX, TARIFF.

    Config: C:\AcctivateKPI\kpi.config.json

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File sync-jan-jul-historical-invoiced-lines.ps1
#>

[CmdletBinding()]
param(
    [string]$ConfigPath = (Join-Path $PSScriptRoot 'kpi.config.json')
)

$ErrorActionPreference = 'Stop'

# Fixed date range
$RangeStart   = '2026-01-01'
$RangeEnd     = '2026-08-01'   # exclusive upper bound (< 2026-08-01)
$SourceTag    = 'jan_jul_direct_pull'
$OldSourceTag = 'Acctivate direct VM invoice line pull'   # old incomplete rows to replace

# ─── Config ──────────────────────────────────────────────────────────────────

if (-not (Test-Path $ConfigPath)) { throw "Config not found: $ConfigPath" }

$cfg = Get-Content $ConfigPath -Raw | ConvertFrom-Json

$SupabaseUrl    = $cfg.supabaseUrl.TrimEnd('/')
$ServiceKey     = $cfg.serviceRoleKey
$BatchSize      = 50;  if ($cfg.batchSize)                { $BatchSize      = [int]$cfg.batchSize }
$MaxRetries     = 3;   if ($cfg.maxRetries)               { $MaxRetries     = [int]$cfg.maxRetries }
$RetryDelay     = 10;  if ($cfg.retryDelaySeconds)        { $RetryDelay     = [int]$cfg.retryDelaySeconds }
$RequestTimeout = 60;  if ($cfg.requestTimeoutSec)        { $RequestTimeout = [int]$cfg.requestTimeoutSec }
$SqlTimeout     = 600; if ($cfg.sql.commandTimeoutSeconds) { $SqlTimeout    = [int]$cfg.sql.commandTimeoutSeconds }

if (-not $SupabaseUrl -or -not $ServiceKey) {
    throw "supabaseUrl and serviceRoleKey are required in $ConfigPath"
}

# ─── SQL connection ───────────────────────────────────────────────────────────

$connStr = 'Server=' + $cfg.sql.server + ';Database=' + $cfg.sql.database + ';Connection Timeout=30;'
if ($cfg.sql.integratedSecurity) { $connStr += 'Integrated Security=SSPI;' }
else { $connStr += 'User Id=' + $cfg.sql.user + ';Password=' + $cfg.sql.password + ';' }
$connStr += 'Encrypt=False;TrustServerCertificate=True;'

# ─── SQL query ────────────────────────────────────────────────────────────────

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
            COALESCE(dtl.Price,         0)
            * COALESCE(dtl.QtyInvoiced, 0)
            * (1.0 - COALESCE(dtl.LineDiscountPct, 0) / 100.0)
            AS decimal(18,2)
        )                                                          AS formula_net_amount,
        CAST(ISNULL(prod.SalesCategory,  '')    AS NVARCHAR(100))  AS product_sales_category,
        CAST(COALESCE(NULLIF(RTRIM(pc.Description),''), NULLIF(RTRIM(prod.ProductClassID),''),'') AS NVARCHAR(128)) AS product_class,
        CAST('$SourceTag'                       AS NVARCHAR(50))   AS source,
        CAST(ISNULL(inv.Type,            '')    AS NVARCHAR(10))   AS invoice_type,
        ROW_NUMBER() OVER (
            PARTITION BY
                inv.InvoiceNumber, dtl.LineNumber, dtl.SubLineNumber,
                dtl.ComponentLevel, dtl.ProductID, dtl.OrderNumber, dtl.GUIDInvoiceDetail
            ORDER BY dtl.ProductID, dtl.QtyInvoiced, dtl.Price, dtl.Amount, dtl.TransactionDate
        ) AS duplicate_row_ordinal
    FROM dbo.InvoiceDetail dtl
    INNER JOIN dbo.Invoice inv
        ON dtl.InvoiceNumber = inv.InvoiceNumber
    LEFT JOIN dbo.Product prod
        ON dtl.ProductID = prod.ProductID
    LEFT JOIN dbo.ProductClass pc
        ON pc.ProductClassID = prod.ProductClassID
    WHERE inv.InvoiceDate >= '$RangeStart'
      AND inv.InvoiceDate <  '$RangeEnd'
)
SELECT * FROM src
ORDER BY invoice_date, invoice_number, line_number, sub_line_number, component_level
"@

# ─── Helpers ─────────────────────────────────────────────────────────────────

function Invoke-Sql {
    param([string]$SqlQuery)
    $conn = New-Object System.Data.SqlClient.SqlConnection($connStr)
    $conn.Open()
    try {
        $cmd = $conn.CreateCommand(); $cmd.CommandText = $SqlQuery; $cmd.CommandTimeout = $SqlTimeout
        $reader = $cmd.ExecuteReader()
        $rows = New-Object System.Collections.Generic.List[hashtable]
        while ($reader.Read()) {
            $row = @{}
            for ($i = 0; $i -lt $reader.FieldCount; $i++) {
                $v = $reader.GetValue($i); $row[$reader.GetName($i)] = if ($v -is [System.DBNull]) { $null } else { $v }
            }
            $rows.Add($row) | Out-Null
        }
        return ,$rows.ToArray()
    } finally { $conn.Close() }
}

function Sanitize-String {
    param([string]$s)
    # Replace typographic quotes with ASCII equivalents before UTF-8 encoding.
    # Windows-1252 encodes U+201D as byte 0x94; if Invoke-RestMethod sends
    # the body using the system encoding, that byte is invalid UTF-8 and
    # PostgREST rejects the request. Replacing beforehand keeps all bytes ASCII.
    $s = $s.Replace([string][char]0x2018, "'")   # left single quote  -> '
    $s = $s.Replace([string][char]0x2019, "'")   # right single quote -> '
    $s = $s.Replace([string][char]0x201C, '"')   # left double quote  -> "
    $s = $s.Replace([string][char]0x201D, '"')   # right double quote -> "
    $s = $s.Replace([string][char]0x2013, '-')   # en dash  -> -
    $s = $s.Replace([string][char]0x2014, '--')  # em dash  -> --
    # Strip control characters char-by-char (avoids regex literal issues):
    # removes C0 (except TAB=9 LF=10 CR=13), DEL=127, C1=128..159, surrogates
    $chars = New-Object System.Collections.Generic.List[char]
    foreach ($c in $s.ToCharArray()) {
        $cp = [int]$c
        if (($cp -ge 0    -and $cp -le 8)   -or
            $cp -eq 11                       -or
            $cp -eq 12                       -or
            ($cp -ge 14   -and $cp -le 31)   -or
            $cp -eq 127                      -or
            ($cp -ge 128  -and $cp -le 159)  -or
            ($cp -ge 0xD800 -and $cp -le 0xDFFF)) { continue }
        $chars.Add($c) | Out-Null
    }
    return [string]::new($chars.ToArray())
}

function Clean-Value {
    param($Val)
    if ($null -eq $Val) { return $null }
    if ($Val -is [string]) { return Sanitize-String $Val }
    if ($Val -is [datetime]) { return $Val.ToString('yyyy-MM-dd') }
    if ($Val -is [System.Decimal] -or $Val -is [double] -or $Val -is [float]) {
        $d = [double]$Val; if ([double]::IsNaN($d) -or [double]::IsInfinity($d)) { return $null }; return $d
    }
    if ($Val -is [System.Int32] -or $Val -is [System.Int64] -or $Val -is [int] -or $Val -is [long]) { return [long]$Val }
    return Sanitize-String $Val.ToString()
}

function Clean-Row { param([hashtable]$Row); $out=@{}; foreach ($k in $Row.Keys) { $out[$k]=Clean-Value $Row[$k] }; return $out }

function Val-Dbl { param($v); if ($null -eq $v) { return 0.0 }; return [double]$v }
function Val-Str { param($v); if ($null -eq $v) { return '' }; return $v.ToString().Trim() }

function Get-SupabaseRows {
    param([string]$Url)
    $h = @{ 'apikey'=$ServiceKey; 'Authorization'='Bearer '+$ServiceKey; 'Accept'='application/json' }
    try { return Invoke-RestMethod -Method Get -Uri $Url -Headers $h -TimeoutSec $RequestTimeout }
    catch { Write-Warning ('Supabase GET failed: '+$_.Exception.Message); return @() }
}

function Write-Section { param([string]$T)
    Write-Host ''; Write-Host ('─── '+$T+' '+('─'*[Math]::Max(0,56-$T.Length))) -ForegroundColor Cyan
}

$UpsertUrl = $SupabaseUrl + '/rest/v1/acctivate_invoice_lines_2026_direct?on_conflict=natural_key'
$UpsertHeaders = @{
    'apikey'='Bearer '+$ServiceKey; 'Authorization'='Bearer '+$ServiceKey
    'Content-Type'='application/json'; 'Prefer'='resolution=merge-duplicates,return=minimal'
}
# Note: apikey header must be the key itself, not 'Bearer key'
$UpsertHeaders['apikey'] = $ServiceKey

function Post-Json {
    param([string]$Body)
    # Explicitly encode as UTF-8 bytes so Invoke-RestMethod does not fall back
    # to the system encoding (Windows-1252), which would mangle non-ASCII chars.
    $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($Body)
    for ($attempt = 1; $attempt -le $MaxRetries; $attempt++) {
        try {
            Invoke-RestMethod -Method Post -Uri $UpsertUrl -Headers $UpsertHeaders `
                -Body $bodyBytes -TimeoutSec $RequestTimeout | Out-Null
            return $true
        } catch {
            if ($attempt -lt $MaxRetries) { Start-Sleep -Seconds $RetryDelay }
        }
    }
    return $false
}

# ─── CSV logger ───────────────────────────────────────────────────────────────

$FailedCsvPath = Join-Path $PSScriptRoot ('failed_rows_janjul_'+( Get-Date -Format 'yyyyMMdd_HHmmss')+'.csv')
$script:FailedCount = 0; $script:CsvReady = $false

$CsvColumns = @(
    '_fail_reason','natural_key','guid_invoice_detail','guid_invoice',
    'invoice_number','line_number','sub_line_number','component_level',
    'duplicate_row_ordinal','invoice_date','transaction_date',
    'year','month_number','customer_id','sales_rep_id','branch_id',
    'order_number','product_id','description','qty_invoiced',
    'line_discount_pct','sales_account_id','price',
    'invoice_detail_amount','formula_net_amount',
    'product_sales_category','product_class','source','invoice_type'
)

function Log-FailedRow {
    param([hashtable]$Row, [string]$Reason)
    if (-not $script:CsvReady) { $CsvColumns -join ',' | Out-File $FailedCsvPath -Encoding utf8 -Append; $script:CsvReady=$true }
    $vals = $CsvColumns | ForEach-Object {
        $v = if ($_ -eq '_fail_reason') { $Reason } else { if ($null -ne $Row[$_]) { $Row[$_].ToString() } else { '' } }
        $v = $v.Replace('"','""'); if ($v -match '[,"\r\n]') { '"'+$v+'"' } else { $v }
    }
    $vals -join ',' | Out-File $FailedCsvPath -Encoding utf8 -Append; $script:FailedCount++
}

# ─── Delete helper ────────────────────────────────────────────────────────────

$DelHeaders = @{ 'apikey'=$ServiceKey; 'Authorization'='Bearer '+$ServiceKey; 'Content-Type'='application/json'; 'Prefer'='return=minimal' }

function Invoke-Delete {
    param([string]$Url, [string]$Label)
    Write-Host ('  Deleting '+$Label+'...') -ForegroundColor Yellow
    for ($a = 1; $a -le $MaxRetries; $a++) {
        try {
            $r = Invoke-WebRequest -Method Delete -Uri $Url -Headers $DelHeaders -TimeoutSec $RequestTimeout -UseBasicParsing
            Write-Host ('    -> HTTP '+[int]$r.StatusCode+'  ok') -ForegroundColor Green; return
        } catch {
            $msg = $_.Exception.Message
            if ($a -ge $MaxRetries) { throw ('DELETE ['+$Label+'] failed: '+$msg) }
            Write-Warning ('    Attempt '+$a+'/'+$MaxRetries+' failed — retrying in '+$RetryDelay+'s'); Start-Sleep -Seconds $RetryDelay
        }
    }
}

$ExcludedCats = @('FREIGHTO','MISC','SALESTAX','TARIFF')
$MonthNames   = @{ 1='Jan';2='Feb';3='Mar';4='Apr';5='May';6='Jun';7='Jul' }

# ─── Main ─────────────────────────────────────────────────────────────────────

Write-Host ''
Write-Host ('=== Jan–Jul Invoice Backfill  '+(Get-Date -Format 'yyyy-MM-dd HH:mm')+' ===') -ForegroundColor Yellow
Write-Host ('Server : '+$cfg.sql.server+' / '+$cfg.sql.database)
Write-Host ('Range  : '+$RangeStart+' through 2026-07-31')
Write-Host ('Source : '+$SourceTag)

# ─── Pull from Acctivate ─────────────────────────────────────────────────────

Write-Host ''; Write-Host 'Querying Acctivate...' -ForegroundColor Cyan
$allRows = Invoke-Sql -SqlQuery $Query
$pulled  = $allRows.Count
Write-Host ('  '+$pulled+' rows returned') -ForegroundColor Green
if ($pulled -eq 0) { Write-Warning 'No rows returned.'; exit 0 }

# ─── Natural keys ─────────────────────────────────────────────────────────────

foreach ($row in $allRows) {
    $p1 = if ($null -ne $row['invoice_number'])       { $row['invoice_number'].ToString()       } else { '' }
    $p2 = if ($null -ne $row['line_number'])           { $row['line_number'].ToString()           } else { '' }
    $p3 = if ($null -ne $row['sub_line_number'])       { $row['sub_line_number'].ToString()       } else { '' }
    $p4 = if ($null -ne $row['component_level'])       { $row['component_level'].ToString()       } else { '' }
    $p5 = if ($null -ne $row['product_id'])            { $row['product_id'].ToString()            } else { '' }
    $p6 = if ($null -ne $row['order_number'])          { $row['order_number'].ToString()          } else { '' }
    $p7 = if ($null -ne $row['guid_invoice_detail'])   { $row['guid_invoice_detail'].ToString()   } else { '' }
    $p8 = if ($null -ne $row['duplicate_row_ordinal']) { $row['duplicate_row_ordinal'].ToString() } else { '1' }
    $row['natural_key'] = $p1+'-'+$p2+'-'+$p3+'-'+$p4+'-'+$p5+'-'+$p6+'-'+$p7+'-'+$p8
}

# Natural key uniqueness check
$keyCounts = @{}
foreach ($r in $allRows) { $k=$r['natural_key']; if ($keyCounts.ContainsKey($k)) { $keyCounts[$k]++ } else { $keyCounts[$k]=1 } }
$distinctNK = $keyCounts.Count; $dupNKCount = $pulled - $distinctNK

Write-Host ('  Rows: '+$pulled+'   Distinct natural_keys: '+$distinctNK+'   Duplicates: '+$dupNKCount)
if ($dupNKCount -gt 0) {
    Write-Host 'DUPLICATE natural_keys (first 10):' -ForegroundColor Red
    $shown=0; foreach ($e in $keyCounts.GetEnumerator()) { if ($e.Value -gt 1) { Write-Host ('  '+$e.Key+'  ('+$e.Value+')') -ForegroundColor Red; $shown++; if ($shown -ge 10) { break } } }
    throw ('ABORT: '+$dupNKCount+' duplicate natural_keys. Fix before uploading.')
}
Write-Host '  All natural_keys are distinct.' -ForegroundColor Green

# ─── Diagnostics ─────────────────────────────────────────────────────────────

Write-Section 'AMOUNT: invoice_detail_amount vs formula_net_amount (unfiltered)'
$totalRaw=0.0; $totalFmt=0.0
foreach ($r in $allRows) { $totalRaw+=Val-Dbl $r['invoice_detail_amount']; $totalFmt+=Val-Dbl $r['formula_net_amount'] }
Write-Host ('  invoice_detail_amount (raw dtl.Amount)        : '+$totalRaw.ToString('N2').PadLeft(14)+'  '+$pulled.ToString().PadLeft(6)+' lines')
Write-Host ('  formula_net_amount (Price*Qty*(1-Disc%))       : '+$totalFmt.ToString('N2').PadLeft(14)+'  '+$pulled.ToString().PadLeft(6)+' lines')
Write-Host ('  Difference (formula - raw)                     : '+($totalFmt-$totalRaw).ToString('N2').PadLeft(14)) -ForegroundColor Yellow

Write-Section 'STEP-BY-STEP EXCLUSION (formula_net_amount)'
$stepTotal=$totalFmt; $stepLines=$pulled
Write-Host ('  Start — all rows                   : '+$stepTotal.ToString('N2').PadLeft(14)+'  '+$stepLines.ToString().PadLeft(7)+' lines')
foreach ($cat in $ExcludedCats) {
    $catAmt=0.0; $catCnt=0
    foreach ($r in $allRows) { if ((Val-Str $r['product_sales_category']) -eq $cat) { $catAmt+=Val-Dbl $r['formula_net_amount']; $catCnt++ } }
    $stepTotal-=$catAmt; $stepLines-=$catCnt
    Write-Host ('  Remove '+$cat.PadRight(12)+' (-'+$catAmt.ToString('N2').PadLeft(12)+'  '+$catCnt.ToString().PadLeft(5)+' lines)   Remaining: '+$stepTotal.ToString('N2').PadLeft(14)+'  '+$stepLines.ToString().PadLeft(7)+' lines')
}
Write-Host ('  Andrew-filtered total (formula)    : '+$stepTotal.ToString('N2').PadLeft(14)+'  '+$stepLines.ToString().PadLeft(7)+' lines') -ForegroundColor Green

Write-Section 'MONTHLY TOTALS — Andrew-filtered formula_net_amount'
$mFmt=@{}; $mCnt=@{}; for ($m=1;$m-le7;$m++) { $mFmt[$m]=0.0; $mCnt[$m]=0 }
foreach ($r in $allRows) {
    if ($ExcludedCats -contains (Val-Str $r['product_sales_category'])) { continue }
    $mn=[int](Val-Dbl $r['month_number']); if ($mn -lt 1 -or $mn -gt 7) { continue }
    $mFmt[$mn]+=Val-Dbl $r['formula_net_amount']; $mCnt[$mn]++
}
$fltYtd=0.0; $fltLines=0
for ($m=1;$m-le7;$m++) { $fltYtd+=$mFmt[$m]; $fltLines+=$mCnt[$m]; Write-Host ('  2026-'+$MonthNames[$m]+'    '+$mFmt[$m].ToString('N2').PadLeft(14)+'  '+$mCnt[$m].ToString().PadLeft(7)+' lines') }
Write-Host ('  Total (formula, filtered)  : '+$fltYtd.ToString('N2').PadLeft(14)+'  '+$fltLines.ToString().PadLeft(7)+' lines') -ForegroundColor Green

Write-Section 'MONTHLY TOTALS — Andrew-filtered invoice_detail_amount (raw)'
$mRaw=@{}; for ($m=1;$m-le7;$m++) { $mRaw[$m]=0.0 }
foreach ($r in $allRows) {
    if ($ExcludedCats -contains (Val-Str $r['product_sales_category'])) { continue }
    $mn=[int](Val-Dbl $r['month_number']); if ($mn -lt 1 -or $mn -gt 7) { continue }
    $mRaw[$mn]+=Val-Dbl $r['invoice_detail_amount']
}
$rawYtd=0.0; for ($m=1;$m-le7;$m++) { $rawYtd+=$mRaw[$m]; Write-Host ('  2026-'+$MonthNames[$m]+'    '+$mRaw[$m].ToString('N2').PadLeft(14)) }
Write-Host ('  Total (raw, filtered)      : '+$rawYtd.ToString('N2').PadLeft(14)) -ForegroundColor Green

Write-Section 'BY Invoice.Type — Andrew-filtered'
$typeAmts=@{'O'=0.0;'C'=0.0;'other'=0.0}; $typeCounts=@{'O'=0;'C'=0;'other'=0}
foreach ($r in $allRows) {
    if ($ExcludedCats -contains (Val-Str $r['product_sales_category'])) { continue }
    $it=Val-Str $r['invoice_type']; $v=Val-Dbl $r['formula_net_amount']
    $b=if ($it -eq 'O' -or $it -eq 'C') { $it } else { 'other' }
    $typeAmts[$b]+=$v; $typeCounts[$b]++
}
Write-Host ('  O  Invoice    '+$typeAmts['O'].ToString('N2').PadLeft(14)+'  '+$typeCounts['O'].ToString().PadLeft(6)+' lines') -ForegroundColor DarkCyan
Write-Host ('  C  CreditMemo '+$typeAmts['C'].ToString('N2').PadLeft(14)+'  '+$typeCounts['C'].ToString().PadLeft(6)+' lines') -ForegroundColor DarkCyan
if ($typeCounts['other'] -gt 0) { Write-Host ('  ?  Other      '+$typeAmts['other'].ToString('N2').PadLeft(14)+'  '+$typeCounts['other'].ToString().PadLeft(6)+' lines') -ForegroundColor Yellow }

Write-Section 'BY Raw Product.SalesCategory (formula_net_amount)'
$catMap=@{}
foreach ($r in $allRows) {
    $cat=Val-Str $r['product_sales_category']; if (-not $catMap.ContainsKey($cat)) { $catMap[$cat]=@{amt=0.0;cnt=0} }
    $catMap[$cat].amt+=Val-Dbl $r['formula_net_amount']; $catMap[$cat].cnt++
}
foreach ($e in ($catMap.GetEnumerator() | Sort-Object { [Math]::Abs($_.Value.amt) } -Descending)) {
    $lbl=if ($e.Key -eq '') { '(blank)' } else { $e.Key }
    $isExcl=$ExcludedCats -contains $e.Key
    $color=if ($isExcl) { 'DarkGray' } else { 'White' }
    if ($isExcl) { $excludedLabel = ' [excluded]' } else { $excludedLabel = '' }
    Write-Host ('  '+$lbl.PadRight(16)+$e.Value.amt.ToString('N2').PadLeft(14)+'  '+$e.Value.cnt.ToString().PadLeft(6)+' lines'+$excludedLabel) -ForegroundColor $color
}

# Locked KPI comparison (informational)
$kpiUrl  = $SupabaseUrl+'/rest/v1/acctivate_kpi_monthly_invoiced_2026?select=year,month_number,invoiced_actual&year=eq.2026&month_number=lte.7&order=month_number'
$kpiRows = Get-SupabaseRows -Url $kpiUrl
if ($kpiRows -is [array] -and $kpiRows.Count -gt 0) {
    $kpiByMonth=@{}; $kpiYtd=0.0
    foreach ($r in $kpiRows) { $mn=[int]$r.month_number; $kpiByMonth[$mn]=[double]$r.invoiced_actual; $kpiYtd+=[double]$r.invoiced_actual }
    Write-Section 'LOCKED KPI vs PULL (informational — locked KPI uses raw dtl.Amount, no filter)'
    Write-Host ('  '+' Month'.PadRight(12)+'Pull formula'.PadLeft(16)+'Raw Amount'.PadLeft(14)+'Locked KPI'.PadLeft(14))
    Write-Host ('  '+('-'*58))
    for ($m=1;$m-le7;$m++) {
        $fAmt=$mFmt[$m]; $rAmt=$mRaw[$m]; $kpi=if ($kpiByMonth.ContainsKey($m)) { $kpiByMonth[$m] } else { 0.0 }
        Write-Host ('  2026-'+$MonthNames[$m].PadRight(7)+$fAmt.ToString('N2').PadLeft(16)+$rAmt.ToString('N2').PadLeft(14)+$kpi.ToString('N2').PadLeft(14))
    }
    Write-Host ('  '+('-'*58))
    Write-Host ('  '+'YTD'.PadRight(12)+$fltYtd.ToString('N2').PadLeft(16)+$rawYtd.ToString('N2').PadLeft(14)+$kpiYtd.ToString('N2').PadLeft(14))
    Write-Host ''
    Write-Host '  Note: KPI uses raw dtl.Amount unfiltered. Dealer/Rep Reporting will use formula_net_amount' -ForegroundColor Yellow
    Write-Host '        with Andrew exclude filter. These are different methodologies by design.' -ForegroundColor Yellow
}

# ─── Pre-flight: count old source rows ───────────────────────────────────────

Write-Section 'PRE-FLIGHT'

$OldSourceTagEnc = [uri]::EscapeDataString($OldSourceTag)
$oldCntUrl = $SupabaseUrl+'/rest/v1/acctivate_invoice_lines_2026_direct?select=source&invoice_date=gte.'+$RangeStart+'&invoice_date=lt.'+$RangeEnd+'&source=eq.'+$OldSourceTagEnc+'&limit=1'
$oldCntHdr = @{ 'apikey'=$ServiceKey; 'Authorization'='Bearer '+$ServiceKey; 'Accept'='application/json'; 'Prefer'='count=exact' }
$oldCount = -1
try {
    $r = Invoke-WebRequest -Method Get -Uri $oldCntUrl -Headers $oldCntHdr -TimeoutSec $RequestTimeout -UseBasicParsing
    $cr = $r.Headers['Content-Range']; if ($cr -and $cr -match '/(\d+)') { $oldCount=[int]$Matches[1] }
} catch { Write-Warning ('Could not count old source rows: '+$_.Exception.Message) }

if ($oldCount -gt 0) {
    Write-Host ('  Found '+$oldCount+' rows with source = '''+$OldSourceTag+'''') -ForegroundColor Yellow
    Write-Host '  These will be deleted and replaced with the fresh Jan–Jul pull.'
} elseif ($oldCount -eq 0) {
    Write-Host '  No old incomplete rows found.' -ForegroundColor Green
} else {
    Write-Warning 'Could not verify old row count. Proceeding.'
}
Write-Host '  August rows (aug_direct_pull) are NOT touched.' -ForegroundColor Green
Write-Host '  Locked KPI table is NOT touched.' -ForegroundColor Green
Write-Host ''
if ($oldCount -gt 0) { $oldRowsText = [string]$oldCount } else { $oldRowsText = 'any existing' }
$ans = Read-Host ('DELETE '+$oldRowsText+' old rows and upload '+$pulled+' fresh rows? (yes/no)')
if ($ans -notmatch '^y(es)?$') { Write-Host 'Aborted. Nothing changed.' -ForegroundColor Red; exit 1 }

# ─── Delete (two passes) ─────────────────────────────────────────────────────

Write-Host ''; Write-Host 'Clearing Jan–Jul rows before upload...' -ForegroundColor Cyan

# Pass 1: old incomplete source
Invoke-Delete -Url ($SupabaseUrl+'/rest/v1/acctivate_invoice_lines_2026_direct?invoice_date=gte.'+$RangeStart+'&invoice_date=lt.'+$RangeEnd+'&source=eq.'+$OldSourceTagEnc) `
              -Label ("source='"+$OldSourceTag+"'")

# Pass 2: idempotency — prior jan_jul_direct_pull rows
Invoke-Delete -Url ($SupabaseUrl+'/rest/v1/acctivate_invoice_lines_2026_direct?invoice_date=gte.'+$RangeStart+'&invoice_date=lt.'+$RangeEnd+'&source=eq.'+$SourceTag) `
              -Label ("source='"+$SourceTag+"' (idempotency)")

# ─── Upload ───────────────────────────────────────────────────────────────────

Write-Host ''; Write-Host ('Uploading '+$pulled+' rows (batch '+$BatchSize+', conflict: natural_key)...') -ForegroundColor Cyan
$uploaded=0; $batchFails=0

for ($i=0; $i -lt $pulled; $i+=$BatchSize) {
    $last=[Math]::Min($i+$BatchSize-1,$pulled-1); $chunk=$allRows[$i..$last]
    $body=@($chunk | ForEach-Object { Clean-Row $_ }) | ConvertTo-Json -Depth 5 -Compress
    if (Post-Json -Body $body) {
        $uploaded+=$chunk.Count
        if (($i/$BatchSize)%20 -eq 0 -or ($last+1) -eq $pulled) { Write-Host ('  rows '+($i+1)+'-'+($last+1)+'/'+$pulled+'  ok') -ForegroundColor DarkCyan }
    } else {
        $batchFails++; Write-Warning ('  batch '+($i+1)+'-'+($last+1)+' failed; retrying row by row...')
        foreach ($row in $chunk) {
            $rb=@(Clean-Row $row) | ConvertTo-Json -Depth 5 -Compress
            if (Post-Json -Body $rb) { $uploaded++ }
            else {
                $nk=if ($null -ne $row['natural_key']) { $row['natural_key'] } else { 'NULL' }
                Write-Warning ('    FAILED nk='+$nk); Log-FailedRow -Row $row -Reason 'upload failed after retries'
            }
        }
    }
}
Write-Host ('  '+$uploaded+' of '+$pulled+' rows uploaded') -ForegroundColor Green
if ($script:FailedCount -gt 0) { Write-Warning ($script:FailedCount.ToString()+' rows failed — see '+$FailedCsvPath) }

# ─── Refresh MV ──────────────────────────────────────────────────────────────

Write-Host ''; Write-Host 'Refreshing mv_portal_monthly_invoiced_actuals...' -ForegroundColor Cyan
$rpcOk=$false
for ($a=1;$a-le$MaxRetries;$a++) {
    try {
        Invoke-RestMethod -Method Post -Uri ($SupabaseUrl+'/rest/v1/rpc/refresh_mv_portal_invoiced') `
            -Headers @{'apikey'=$ServiceKey;'Authorization'='Bearer '+$ServiceKey;'Content-Type'='application/json'} `
            -Body '{}' -TimeoutSec 120 | Out-Null
        Write-Host '  materialized view refreshed' -ForegroundColor Green; $rpcOk=$true; break
    } catch {
        if ($a -ge $MaxRetries) { Write-Warning ('MV refresh failed: '+$_.Exception.Message) }
        else { Start-Sleep -Seconds $RetryDelay }
    }
}

# ─── Final summary ────────────────────────────────────────────────────────────

Write-Host ''
Write-Host '============================================================' -ForegroundColor Green
Write-Host ' JAN–JUL INVOICE BACKFILL COMPLETE' -ForegroundColor Green
Write-Host '============================================================' -ForegroundColor Green
Write-Host (' Pulled from Acctivate          : '+$pulled)
Write-Host (' Uploaded to Supabase           : '+$uploaded)
Write-Host (' Failed rows                    : '+$script:FailedCount)
Write-Host (' Batch fallbacks                : '+$batchFails)
Write-Host (' MV refreshed                   : '+$rpcOk)
Write-Host ''
Write-Host (' Jan–Jul Andrew-filtered formula_net_amount: ' + $fltYtd.ToString('N2')) -ForegroundColor Green
Write-Host ' (Dealer/Rep Reporting will show this total for Jan–Jul invoiced)' -ForegroundColor DarkCyan
Write-Host ''
Write-Host ' VALIDATION — run in Supabase SQL Editor:' -ForegroundColor Yellow
Write-Host '   SELECT metric_type, ROUND(SUM(amount),2) AS total, COUNT(*) AS lines'
Write-Host '   FROM public.v_portal_dealer_rep_reporting_lines'
Write-Host "   WHERE metric_type='invoiced' AND transaction_date BETWEEN '2026-01-01' AND '2026-08-26'"
Write-Host '   GROUP BY metric_type;'
Write-Host ''
Write-Host ('============================================================') -ForegroundColor Green
Write-Host (' Finished '+(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')) -ForegroundColor Green
