<#
.SYNOPSIS
    Syncs all sales reps from Acctivate into Supabase public.acctivate_sales_reps.

.DESCRIPTION
    Pulls every salesperson from dbo.Salesperson (Acctivate SQL Server).
    Enriches each rep with their most-common territory and sales manager
    derived from dbo.Orders + dbo.tbCustomer order history.

    Upserts into public.acctivate_sales_reps ON CONFLICT (acctivate_id).
    Does NOT delete reps — only inserts/updates.
    Failed rows are written to a timestamped CSV next to this script.

    Stable identifier used: acctivate_id = SalespersonID (the Acctivate rep code).
    GUIDSalesperson is NOT available on dbo.Salesperson in all Acctivate versions;
    the SalespersonID code is used as the unique key instead.

    Column discovery: the script inspects INFORMATION_SCHEMA at runtime so it
    works across Acctivate versions where column names vary (e.g. SalespersonID
    vs ID, Name vs SalespersonName, Inactive vs Active).

    Config: place kpi.config.json next to this script, or pass -ConfigPath.
    {
        "supabaseUrl":    "https://<project>.supabase.co",
        "serviceRoleKey": "...",
        "sql": { "server": ".\\ACCTIVATE", "database": "Acctivate",
                 "integratedSecurity": true, "commandTimeoutSeconds": 300 },
        "batchSize": 100, "maxRetries": 3, "retryDelaySeconds": 10, "requestTimeoutSec": 60
    }

.OUTPUTS
    Console: Pulled from Acctivate / Uploaded to Supabase / Failed rows / Sync complete
    File:    failed-acctivate-reps_YYYYMMDD_HHmmss.csv  (only created if failures occur)
#>

[CmdletBinding()]
param(
    [string]$ConfigPath = (Join-Path $PSScriptRoot 'kpi.config.json')
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

if (-not (Test-Path $ConfigPath)) { throw "Config not found: $ConfigPath" }
$cfg = Get-Content $ConfigPath -Raw | ConvertFrom-Json

$SupabaseUrl    = $cfg.supabaseUrl.TrimEnd('/')
$ServiceKey     = $cfg.serviceRoleKey
$BatchSize      = if ($cfg.batchSize)                { [int]$cfg.batchSize }                else { 100 }
$MaxRetries     = if ($cfg.maxRetries)               { [int]$cfg.maxRetries }               else { 3 }
$RetryDelay     = if ($cfg.retryDelaySeconds)        { [int]$cfg.retryDelaySeconds }        else { 10 }
$RequestTimeout = if ($cfg.requestTimeoutSec)        { [int]$cfg.requestTimeoutSec }        else { 60 }
$SqlTimeout     = if ($cfg.sql.commandTimeoutSeconds){ [int]$cfg.sql.commandTimeoutSeconds } else { 300 }

if (-not $SupabaseUrl -or -not $ServiceKey) {
    throw "supabaseUrl and serviceRoleKey are required in $ConfigPath"
}

$connStr = 'Server=' + $cfg.sql.server + ';Database=' + $cfg.sql.database + ';Connection Timeout=30;'
if ($cfg.sql.integratedSecurity) {
    $connStr += 'Integrated Security=SSPI;'
} else {
    $connStr += 'User Id=' + $cfg.sql.user + ';Password=' + $cfg.sql.password + ';'
}
$connStr += 'Encrypt=False;TrustServerCertificate=True;'

# ---------------------------------------------------------------------------
# SQL helpers
# ---------------------------------------------------------------------------

function Invoke-Sql {
    param([string]$SqlQuery)
    $conn = New-Object System.Data.SqlClient.SqlConnection($connStr)
    $conn.Open()
    try {
        $cmd = $conn.CreateCommand()
        $cmd.CommandText  = $SqlQuery
        $cmd.CommandTimeout = $SqlTimeout
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

function Get-SqlColumns {
    param([string]$Table)
    $r = Invoke-Sql "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
                     WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='$Table'"
    return $r | ForEach-Object { $_['COLUMN_NAME'] }
}

function Test-SqlObjectExists {
    param([string]$Name)
    $r = Invoke-Sql "SELECT 1 FROM INFORMATION_SCHEMA.TABLES
                     WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='$Name'"
    return ($r.Count -gt 0)
}

function Test-SqlColumnExists {
    param([string]$Table, [string]$Column)
    $r = Invoke-Sql "SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                     WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='$Table' AND COLUMN_NAME='$Column'"
    return ($r.Count -gt 0)
}

function Get-FirstColumn {
    param([string[]]$Columns, [string[]]$Candidates)
    foreach ($c in $Candidates) {
        if ($Columns -contains $c) { return $c }
    }
    return $null
}

function Quote-SqlId { param([string]$n) return "[$n]" }

# ---------------------------------------------------------------------------
# Value cleaning  (same logic as sync-aug-current-bookings.ps1)
# ---------------------------------------------------------------------------

function Clean-Value {
    param($Val)
    if ($null -eq $Val -or $Val -is [System.DBNull]) { return $null }
    if ($Val -is [bool])    { return [bool]$Val }
    if ($Val -is [string])  { return ($Val -replace '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '') }
    if ($Val -is [datetime] -or $Val -is [System.DateTimeOffset]) {
        return $Val.ToString('yyyy-MM-ddTHH:mm:ss')
    }
    if ($Val -is [System.Int32] -or $Val -is [System.Int64] -or
        $Val -is [int]           -or $Val -is [long]) {
        return [long]$Val
    }
    if ($Val -is [System.Decimal] -or $Val -is [double] -or $Val -is [float]) {
        $d = [double]$Val
        if ([double]::IsNaN($d) -or [double]::IsInfinity($d)) { return $null }
        return $d
    }
    return $Val.ToString()
}

function Clean-Row {
    param([hashtable]$Row)
    $out = @{}
    foreach ($key in $Row.Keys) { $out[$key] = Clean-Value $Row[$key] }
    return $out
}

# ---------------------------------------------------------------------------
# HTTP: POST batch to Supabase
# ---------------------------------------------------------------------------

function Convert-RowsToJsonArray {
    param([array]$Rows)
    $items = @()
    foreach ($row in @($Rows)) {
        $items += ($row | ConvertTo-Json -Depth 10 -Compress)
    }
    return '[' + ($items -join ',') + ']'
}

function Invoke-SupabaseUpsert {
    param([string]$Table, [array]$Rows)

    $url       = "$SupabaseUrl/rest/v1/$Table"
    $json      = Convert-RowsToJsonArray -Rows @($Rows)
    $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($json)

    Write-Host "  POST $Table | $($Rows.Count) rows | $($bodyBytes.Length) bytes" -ForegroundColor DarkGray

    $headers = @{
        'apikey'        = $ServiceKey
        'Authorization' = 'Bearer ' + $ServiceKey
        'Prefer'        = 'resolution=merge-duplicates,return=minimal'
    }

    $attempt = 0
    while ($true) {
        $attempt++
        try {
            Invoke-WebRequest `
                -Uri $url `
                -Method Post `
                -Headers $headers `
                -ContentType 'application/json; charset=utf-8' `
                -Body $bodyBytes `
                -UseBasicParsing `
                -TimeoutSec $RequestTimeout `
                -ErrorAction Stop | Out-Null
            return @{ ok = $true; body = '' }
        } catch {
            $code = 0
            $body = $_.Exception.Message
            if ($null -ne $_.Exception.Response) {
                $code   = [int]$_.Exception.Response.StatusCode
                $stream = $_.Exception.Response.GetResponseStream()
                $reader = New-Object System.IO.StreamReader($stream)
                $body   = $reader.ReadToEnd()
                $reader.Close()
            }
            if ($attempt -lt $MaxRetries) {
                Write-Host "  Retry $attempt/$MaxRetries after ${RetryDelay}s (HTTP $code)" -ForegroundColor DarkYellow
                Start-Sleep -Seconds $RetryDelay
            } else {
                return @{ ok = $false; statusCode = $code; body = $body }
            }
        }
    }
}

# ---------------------------------------------------------------------------
# Failed-row CSV logger
# ---------------------------------------------------------------------------

$FailedCsvPath  = Join-Path $PSScriptRoot ('failed-acctivate-reps_' + (Get-Date -Format 'yyyyMMdd_HHmmss') + '.csv')
$script:FailedCount = 0
$script:CsvReady    = $false

$CsvColumns = @('_fail_reason','acctivate_id','rep_code','name','email','phone',
                'manager_name','manager_acctivate_id','territory_name','territory_acctivate_id','active')

function Log-FailedRow {
    param([hashtable]$Row, [string]$Reason)
    if (-not $script:CsvReady) {
        $CsvColumns -join ',' | Out-File -FilePath $FailedCsvPath -Encoding utf8 -Append
        $script:CsvReady = $true
    }
    $vals = $CsvColumns | ForEach-Object {
        $v = if ($_ -eq '_fail_reason') { $Reason } else { if ($null -ne $Row[$_]) { $Row[$_].ToString() } else { '' } }
        $v = $v.Replace('"', '""')
        if ($v -match '[,"\r\n]') { '"' + $v + '"' } else { $v }
    }
    $vals -join ',' | Out-File -FilePath $FailedCsvPath -Encoding utf8 -Append
    $script:FailedCount++
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

$SyncedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')

Write-Host ''
Write-Host ('=== Acctivate Sales Reps Sync  ' + (Get-Date -Format 'yyyy-MM-dd HH:mm') + ' ===') -ForegroundColor Yellow
Write-Host ('Server   : ' + $cfg.sql.server + ' / ' + $cfg.sql.database)
Write-Host ('synced_at: ' + $SyncedAt)
Write-Host ''

# ── 1. Discover dbo.Salesperson columns ────────────────────────────────────

Write-Host 'Inspecting dbo.Salesperson schema...' -ForegroundColor Cyan

if (-not (Test-SqlObjectExists -Name 'Salesperson')) {
    throw "dbo.Salesperson not found in Acctivate. Cannot sync sales reps."
}

$cols       = Get-SqlColumns -Table 'Salesperson'
$idCol      = Get-FirstColumn -Columns $cols -Candidates @('SalespersonID','SalespersonId','ID','Code')
$nameCol    = Get-FirstColumn -Columns $cols -Candidates @('Name','SalespersonName','FullName')
$emailCol   = Get-FirstColumn -Columns $cols -Candidates @('Email','EmailAddress')
$phoneCol   = Get-FirstColumn -Columns $cols -Candidates @('Phone','PhoneNumber','Telephone','CellPhone')
$inactiveCol= Get-FirstColumn -Columns $cols -Candidates @('Inactive','IsInactive','Discontinued')
$activeCol  = Get-FirstColumn -Columns $cols -Candidates @('Active','IsActive')

if (-not $idCol)   { throw "Cannot find SalespersonID column on dbo.Salesperson. Found: $($cols -join ', ')" }
if (-not $nameCol) { Write-Host "  Warning: no Name column found — will use ID as name" -ForegroundColor Yellow }

Write-Host "  ID column  : $idCol"
Write-Host "  Name column: $(if ($nameCol) { $nameCol } else { '(none)' })"
Write-Host "  Email      : $(if ($emailCol) { $emailCol } else { '(none)' })"
Write-Host "  Phone      : $(if ($phoneCol) { $phoneCol } else { '(none)' })"
Write-Host "  Active flag: $(if ($inactiveCol) { "NOT $inactiveCol" } elseif ($activeCol) { $activeCol } else { '(none — defaulting to active)' })"
Write-Host ''

$nameExpr   = if ($nameCol)     { "CAST(s.$(Quote-SqlId $nameCol) AS NVARCHAR(255))" }     else { "CAST(s.$(Quote-SqlId $idCol) AS NVARCHAR(255))" }
$emailExpr  = if ($emailCol)    { "CAST(s.$(Quote-SqlId $emailCol) AS NVARCHAR(255))" }    else { "NULL" }
$phoneExpr  = if ($phoneCol)    { "CAST(s.$(Quote-SqlId $phoneCol) AS NVARCHAR(64))" }     else { "NULL" }
$activeExpr = if ($inactiveCol) {
    "CASE WHEN ISNULL(s.$(Quote-SqlId $inactiveCol),0)=1 THEN CAST(0 AS bit) ELSE CAST(1 AS bit) END"
} elseif ($activeCol) {
    "CASE WHEN ISNULL(s.$(Quote-SqlId $activeCol),1)=1 THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END"
} else { "CAST(1 AS bit)" }

# ── 2. Check whether dbo.tbCustomer has _Territory / _SalesManager ─────────

$hasTbCustomer   = Test-SqlObjectExists -Name 'tbCustomer'
$hasTerritory    = $hasTbCustomer -and (Test-SqlColumnExists -Table 'tbCustomer' -Column '_Territory')
$hasSalesMgr     = $hasTbCustomer -and (Test-SqlColumnExists -Table 'tbCustomer' -Column '_SalesManager')
$hasOrderSalesId = (Test-SqlObjectExists -Name 'Orders') -and (Test-SqlColumnExists -Table 'Orders' -Column 'SalespersonID')

Write-Host "dbo.tbCustomer._Territory   : $(if ($hasTerritory)    { 'found' } else { 'not found' })"
Write-Host "dbo.tbCustomer._SalesManager: $(if ($hasSalesMgr)     { 'found' } else { 'not found' })"
Write-Host "dbo.Orders.SalespersonID    : $(if ($hasOrderSalesId) { 'found' } else { 'not found' })"
Write-Host ''

# ── 3. Build territory/manager enrichment CTE ──────────────────────────────

$enrichQuery = $null
if ($hasTerritory -and $hasOrderSalesId) {
    $managerSelect = if ($hasSalesMgr) { "LTRIM(RTRIM(tc._SalesManager))" } else { "NULL" }
    $enrichQuery = @"
;WITH rep_assignments AS (
  SELECT
    LTRIM(RTRIM(CAST(o.SalespersonID AS NVARCHAR(64)))) AS salesperson_id,
    LTRIM(RTRIM(tc._Territory))                          AS territory_name,
    $managerSelect                                       AS manager_name,
    COUNT(*)                                             AS n,
    ROW_NUMBER() OVER (
      PARTITION BY LTRIM(RTRIM(CAST(o.SalespersonID AS NVARCHAR(64))))
      ORDER BY COUNT(*) DESC
    ) AS rk
  FROM dbo.Orders o
  JOIN dbo.tbCustomer tc ON tc.CustomerID = o.CustomerID
  WHERE o.SalespersonID IS NOT NULL
    AND LEN(LTRIM(RTRIM(CAST(o.SalespersonID AS NVARCHAR(64))))) > 0
    AND tc._Territory IS NOT NULL
    AND LEN(LTRIM(RTRIM(tc._Territory))) > 0
  GROUP BY
    LTRIM(RTRIM(CAST(o.SalespersonID AS NVARCHAR(64)))),
    LTRIM(RTRIM(tc._Territory))
    $(if ($hasSalesMgr) { ', LTRIM(RTRIM(tc._SalesManager))' } else { '' })
)
SELECT salesperson_id, territory_name, manager_name
FROM rep_assignments
WHERE rk = 1
"@
}

# ── 4. Pull reps from Acctivate ─────────────────────────────────────────────

Write-Host 'Pulling sales reps from dbo.Salesperson...' -ForegroundColor Cyan

$repSql = @"
SELECT
  LTRIM(RTRIM(CAST(s.$(Quote-SqlId $idCol) AS NVARCHAR(64)))) AS acctivate_id,
  LTRIM(RTRIM(CAST(s.$(Quote-SqlId $idCol) AS NVARCHAR(64)))) AS rep_code,
  LTRIM(RTRIM($nameExpr))                                       AS name,
  $emailExpr                                                    AS email,
  $phoneExpr                                                    AS phone,
  $activeExpr                                                   AS active
FROM dbo.Salesperson s
WHERE s.$(Quote-SqlId $idCol) IS NOT NULL
  AND LEN(LTRIM(RTRIM(CAST(s.$(Quote-SqlId $idCol) AS NVARCHAR(64))))) > 0
"@

$rawReps = Invoke-Sql -SqlQuery $repSql
Write-Host "  Pulled $($rawReps.Count) reps from Acctivate" -ForegroundColor Green

if ($rawReps.Count -eq 0) {
    Write-Host ''
    Write-Host 'No reps returned from dbo.Salesperson — aborting.' -ForegroundColor Red
    exit 1
}

# ── 5. Pull territory/manager enrichment ────────────────────────────────────

$enrichMap = @{}
if ($enrichQuery) {
    Write-Host 'Pulling territory/manager assignments from dbo.Orders + dbo.tbCustomer...' -ForegroundColor Cyan
    try {
        $enrichRows = Invoke-Sql -SqlQuery $enrichQuery
        foreach ($r in $enrichRows) {
            $key = ($r['salesperson_id'] ?? '').ToString().Trim()
            if ($key) { $enrichMap[$key] = $r }
        }
        Write-Host "  Matched territory/manager for $($enrichMap.Count) reps" -ForegroundColor Green
    } catch {
        Write-Host "  Warning: territory/manager enrichment failed — continuing without it" -ForegroundColor Yellow
        Write-Host "  $_" -ForegroundColor DarkGray
    }
} else {
    Write-Host 'Skipping territory/manager enrichment (dbo.tbCustomer._Territory not available)' -ForegroundColor DarkGray
}

Write-Host ''

# ── 6. Build upload rows ─────────────────────────────────────────────────────

$uploadRows = @()
foreach ($rep in $rawReps) {
    $cleaned  = Clean-Row -Row $rep
    $repId    = ($cleaned['acctivate_id'] ?? '').ToString().Trim()
    $enrich   = if ($enrichMap.ContainsKey($repId)) { $enrichMap[$repId] } else { @{} }

    $row = [ordered]@{
        acctivate_id           = $repId
        rep_code               = $repId
        name                   = ($cleaned['name'] ?? $repId)
        email                  = $cleaned['email']
        phone                  = $cleaned['phone']
        active                 = if ($null -ne $cleaned['active']) { [bool]$cleaned['active'] } else { $true }
        territory_name         = if ($enrich['territory_name']) { ($enrich['territory_name']).ToString().Trim() } else { $null }
        territory_acctivate_id = if ($enrich['territory_name']) { ($enrich['territory_name']).ToString().Trim() } else { $null }
        manager_name           = if ($enrich['manager_name'])   { ($enrich['manager_name']).ToString().Trim()   } else { $null }
        manager_acctivate_id   = if ($enrich['manager_name'])   { ($enrich['manager_name']).ToString().Trim()   } else { $null }
        synced_at              = $SyncedAt
    }
    # Strip nulls — let Supabase use column defaults
    $row.Keys | Where-Object { $null -eq $row[$_] } | ForEach-Object { $row.Remove($_) }
    $uploadRows += $row
}

Write-Host "Uploading $($uploadRows.Count) reps to Supabase (acctivate_sales_reps)..." -ForegroundColor Cyan

# ── 7. Batch upsert ──────────────────────────────────────────────────────────

$totalUploaded = 0
$totalFailed   = 0

for ($i = 0; $i -lt $uploadRows.Count; $i += $BatchSize) {
    $batch = $uploadRows[$i..([Math]::Min($i + $BatchSize - 1, $uploadRows.Count - 1))]
    Write-Host "  Batch $([Math]::Floor($i/$BatchSize)+1): rows $($i+1)–$([Math]::Min($i+$BatchSize,$uploadRows.Count))" -ForegroundColor DarkGray

    $result = Invoke-SupabaseUpsert -Table 'acctivate_sales_reps' -Rows $batch
    if ($result.ok) {
        $totalUploaded += $batch.Count
    } else {
        Write-Host "  Batch failed (HTTP $($result.statusCode)): $($result.body)" -ForegroundColor Red
        # Retry individual rows so one bad row doesn't lose the whole batch
        foreach ($row in $batch) {
            $r2 = Invoke-SupabaseUpsert -Table 'acctivate_sales_reps' -Rows @($row)
            if ($r2.ok) {
                $totalUploaded++
            } else {
                Log-FailedRow -Row $row -Reason "HTTP $($r2.statusCode): $($r2.body.Substring(0,[Math]::Min(200,$r2.body.Length)))"
                $totalFailed++
            }
        }
    }
}

# ── 8. Summary ───────────────────────────────────────────────────────────────

Write-Host ''
Write-Host '─────────────────────────────────────────' -ForegroundColor DarkGray
Write-Host ('Pulled from Acctivate : ' + $rawReps.Count + ' reps')
Write-Host ('Uploaded to Supabase  : ' + $totalUploaded + ' reps')
if ($totalFailed -gt 0) {
    Write-Host ('Failed rows           : ' + $totalFailed + '  →  ' + $FailedCsvPath) -ForegroundColor Red
} else {
    Write-Host 'Failed rows           : 0' -ForegroundColor Green
}
Write-Host ('Sync complete         : ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')) -ForegroundColor Green
Write-Host '─────────────────────────────────────────' -ForegroundColor DarkGray
Write-Host ''
