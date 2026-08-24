<#
.SYNOPSIS
    Syncs all sales reps from Acctivate into Supabase public.acctivate_sales_reps.

.DESCRIPTION
    Pulls every salesperson from the Acctivate salesperson table (SQL Server).
    The source table is discovered at runtime -- the script checks dbo.tbSalesperson
    first, then dbo.Salesperson, then searches INFORMATION_SCHEMA.COLUMNS for any
    table in dbo that contains SalespersonID / SalespersonName / GUIDSalesperson.

    Enriches each rep with their most-common territory and sales manager
    derived from dbo.Orders + dbo.tbCustomer order history.

    Upserts to public.acctivate_sales_reps ON CONFLICT (acctivate_id).
    Does NOT delete reps -- only inserts/updates.
    Failed rows are written to a timestamped CSV next to this script.

    Stable identifier: acctivate_id = the SalespersonID code that appears
    in dbo.Orders.SalespersonID and flows into reporting views as rep_id.

    Column names are discovered at runtime from INFORMATION_SCHEMA so the
    script works across Acctivate versions.

    Config: place kpi.config.json next to this script, or pass -ConfigPath.
    {
        "supabaseUrl":    "https://<project>.supabase.co",
        "serviceRoleKey": "...",
        "sql": { "server": ".\\ACCTIVATE", "database": "Acctivate",
                 "integratedSecurity": true, "commandTimeoutSeconds": 300 },
        "batchSize": 100, "maxRetries": 3, "retryDelaySeconds": 10, "requestTimeoutSec": 60
    }

    PowerShell version: 5.1 compatible only.
    No ?? operator. No ternary. No unicode symbols.
#>

[CmdletBinding()]
param(
    [string]$ConfigPath = (Join-Path $PSScriptRoot 'kpi.config.json')
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

if (-not (Test-Path $ConfigPath)) {
    throw "Config not found: $ConfigPath"
}

$cfg = Get-Content $ConfigPath -Raw | ConvertFrom-Json

$SupabaseUrl = $cfg.supabaseUrl.TrimEnd('/')
$ServiceKey  = $cfg.serviceRoleKey

if ($cfg.batchSize) {
    $BatchSize = [int]$cfg.batchSize
} else {
    $BatchSize = 100
}

if ($cfg.maxRetries) {
    $MaxRetries = [int]$cfg.maxRetries
} else {
    $MaxRetries = 3
}

if ($cfg.retryDelaySeconds) {
    $RetryDelay = [int]$cfg.retryDelaySeconds
} else {
    $RetryDelay = 10
}

if ($cfg.requestTimeoutSec) {
    $RequestTimeout = [int]$cfg.requestTimeoutSec
} else {
    $RequestTimeout = 60
}

if ($cfg.sql.commandTimeoutSeconds) {
    $SqlTimeout = [int]$cfg.sql.commandTimeoutSeconds
} else {
    $SqlTimeout = 300
}

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
        $cmd.CommandText    = $SqlQuery
        $cmd.CommandTimeout = $SqlTimeout
        $reader = $cmd.ExecuteReader()
        $rows = New-Object System.Collections.Generic.List[hashtable]
        while ($reader.Read()) {
            $row = @{}
            for ($i = 0; $i -lt $reader.FieldCount; $i++) {
                $colName = $reader.GetName($i)
                $colVal  = $reader.GetValue($i)
                if ($colVal -is [System.DBNull]) {
                    $row[$colName] = $null
                } else {
                    $row[$colName] = $colVal
                }
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
    $results = Invoke-Sql -SqlQuery ("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS " +
                                     "WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='" + $Table + "'")
    $names = @()
    foreach ($r in $results) {
        $names += $r['COLUMN_NAME']
    }
    return $names
}

function Test-SqlObjectExists {
    param([string]$Name)
    $r = Invoke-Sql -SqlQuery ("SELECT 1 FROM INFORMATION_SCHEMA.TABLES " +
                                "WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='" + $Name + "'")
    return ($r.Count -gt 0)
}

function Test-SqlColumnExists {
    param([string]$Table, [string]$Column)
    $r = Invoke-Sql -SqlQuery ("SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS " +
                                "WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='" + $Table + "' " +
                                "AND COLUMN_NAME='" + $Column + "'")
    return ($r.Count -gt 0)
}

function Get-FirstColumn {
    param([string[]]$Columns, [string[]]$Candidates)
    foreach ($c in $Candidates) {
        if ($Columns -contains $c) {
            return $c
        }
    }
    return $null
}

function Quote-SqlId {
    param([string]$Name)
    return '[' + $Name + ']'
}

# ---------------------------------------------------------------------------
# Value cleaning
# ---------------------------------------------------------------------------

function Clean-Value {
    param($Val)
    if ($null -eq $Val) { return $null }
    if ($Val -is [System.DBNull]) { return $null }
    if ($Val -is [bool]) { return [bool]$Val }
    if ($Val -is [string]) {
        return ($Val -replace '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '')
    }
    if ($Val -is [datetime]) {
        return $Val.ToString('yyyy-MM-ddTHH:mm:ss')
    }
    if ($Val -is [System.DateTimeOffset]) {
        return $Val.ToString('yyyy-MM-ddTHH:mm:ss')
    }
    if ($Val -is [System.Int32]) { return [long]$Val }
    if ($Val -is [System.Int64]) { return [long]$Val }
    if ($Val -is [int])          { return [long]$Val }
    if ($Val -is [long])         { return [long]$Val }
    if ($Val -is [System.Decimal]) {
        $d = [double]$Val
        if ([double]::IsNaN($d) -or [double]::IsInfinity($d)) { return $null }
        return $d
    }
    if ($Val -is [double]) {
        $d = [double]$Val
        if ([double]::IsNaN($d) -or [double]::IsInfinity($d)) { return $null }
        return $d
    }
    if ($Val -is [float]) {
        $d = [double]$Val
        if ([double]::IsNaN($d) -or [double]::IsInfinity($d)) { return $null }
        return $d
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

# ---------------------------------------------------------------------------
# Supabase upsert
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

    $url       = $SupabaseUrl + '/rest/v1/' + $Table
    $json      = Convert-RowsToJsonArray -Rows @($Rows)
    $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($json)

    Write-Host ('  POST ' + $Table + ' | ' + $Rows.Count + ' rows | ' + $bodyBytes.Length + ' bytes') -ForegroundColor DarkGray

    $headers = @{
        'apikey'        = $ServiceKey
        'Authorization' = 'Bearer ' + $ServiceKey
        'Prefer'        = 'resolution=merge-duplicates,return=minimal'
    }

    $attempt = 0
    $keepTrying = $true
    $result = @{ ok = $false; statusCode = 0; body = '' }

    while ($keepTrying) {
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
            $result = @{ ok = $true; statusCode = 200; body = '' }
            $keepTrying = $false
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
                Write-Host ('  Retry ' + $attempt + '/' + $MaxRetries + ' after ' + $RetryDelay + 's (HTTP ' + $code + ')') -ForegroundColor DarkYellow
                Start-Sleep -Seconds $RetryDelay
            } else {
                $result = @{ ok = $false; statusCode = $code; body = $body }
                $keepTrying = $false
            }
        }
    }

    return $result
}

# ---------------------------------------------------------------------------
# Failed-row CSV logger
# ---------------------------------------------------------------------------

$FailedCsvPath      = Join-Path $PSScriptRoot ('failed-acctivate-reps_' + (Get-Date -Format 'yyyyMMdd_HHmmss') + '.csv')
$script:FailedCount = 0
$script:CsvReady    = $false

$CsvColumns = @(
    '_fail_reason', 'acctivate_id', 'rep_code', 'name', 'email', 'phone',
    'manager_name', 'manager_acctivate_id', 'territory_name', 'territory_acctivate_id', 'active'
)

function Log-FailedRow {
    param([hashtable]$Row, [string]$Reason)
    if (-not $script:CsvReady) {
        ($CsvColumns -join ',') | Out-File -FilePath $FailedCsvPath -Encoding utf8 -Append
        $script:CsvReady = $true
    }
    $vals = @()
    foreach ($col in $CsvColumns) {
        if ($col -eq '_fail_reason') {
            $v = $Reason
        } elseif ($null -ne $Row[$col]) {
            $v = $Row[$col].ToString()
        } else {
            $v = ''
        }
        $v = $v.Replace('"', '""')
        if ($v -match '[,"\r\n]') {
            $v = '"' + $v + '"'
        }
        $vals += $v
    }
    ($vals -join ',') | Out-File -FilePath $FailedCsvPath -Encoding utf8 -Append
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

# ── 1. Discover the salesperson source table ───────────────────────────────

Write-Host 'Searching for Acctivate salesperson table...' -ForegroundColor Cyan

# Priority-ordered list of table names to try
$RepTableCandidates = @('tbSalesperson', 'Salesperson', 'tblSalesperson', 'SalesPerson', 'tblSalesPerson')

$RepTable = $null
foreach ($candidate in $RepTableCandidates) {
    if (Test-SqlObjectExists -Name $candidate) {
        $RepTable = $candidate
        Write-Host ('  Found: dbo.' + $RepTable) -ForegroundColor Green
        break
    }
}

# Fallback: search INFORMATION_SCHEMA for any dbo table with salesperson columns
if (-not $RepTable) {
    Write-Host '  Known names not found. Scanning INFORMATION_SCHEMA.COLUMNS...' -ForegroundColor Yellow
    $colSearch = Invoke-Sql -SqlQuery (
        "SELECT DISTINCT TABLE_NAME " +
        "FROM INFORMATION_SCHEMA.COLUMNS " +
        "WHERE TABLE_SCHEMA = 'dbo' " +
        "  AND LOWER(COLUMN_NAME) IN (" +
        "    'salespersonid','salesperson_id','guidsalesperson'," +
        "    'salespersonname','salesperson_name'" +
        "  ) " +
        "ORDER BY TABLE_NAME"
    )
    if ($colSearch.Count -gt 0) {
        $RepTable = $colSearch[0]['TABLE_NAME']
        Write-Host ('  Found by column scan: dbo.' + $RepTable) -ForegroundColor Yellow
        if ($colSearch.Count -gt 1) {
            $otherNames = @()
            for ($ci = 1; $ci -lt $colSearch.Count; $ci++) {
                $otherNames += $colSearch[$ci]['TABLE_NAME']
            }
            Write-Host ('  Other candidates (not used): ' + ($otherNames -join ', ')) -ForegroundColor DarkGray
        }
    }
}

if (-not $RepTable) {
    Write-Host ''
    Write-Host 'ERROR: Cannot find a salesperson table in dbo.' -ForegroundColor Red
    Write-Host 'Tried named: tbSalesperson, Salesperson, tblSalesperson, SalesPerson, tblSalesPerson' -ForegroundColor Red
    Write-Host 'Searched columns: SalespersonID, SalespersonName, GUIDSalesperson, Salesperson_ID' -ForegroundColor Red
    Write-Host 'Run this on the Acctivate DB to inspect manually:' -ForegroundColor Yellow
    Write-Host "  SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' ORDER BY TABLE_NAME" -ForegroundColor Yellow
    throw 'Salesperson source table not found. See above for diagnostics.'
}

Write-Host ('  Using source table : dbo.' + $RepTable) -ForegroundColor Green

# ── 2. Discover columns on the source table ────────────────────────────────

Write-Host ('Inspecting dbo.' + $RepTable + ' schema...') -ForegroundColor Cyan

$cols        = Get-SqlColumns -Table $RepTable
$idCol       = Get-FirstColumn -Columns $cols -Candidates @('SalespersonID','SalespersonId','Salesperson_ID','GUIDSalesperson','ID','Code')
$nameCol     = Get-FirstColumn -Columns $cols -Candidates @('Name','SalespersonName','Salesperson_Name','FullName','DisplayName')
$emailCol    = Get-FirstColumn -Columns $cols -Candidates @('Email','EmailAddress','EMail','EMailAddress')
$phoneCol    = Get-FirstColumn -Columns $cols -Candidates @('Phone','PhoneNumber','CellPhone','Telephone','Mobile')
$inactiveCol = Get-FirstColumn -Columns $cols -Candidates @('Inactive','IsInactive','Discontinued','Deleted')
$activeCol   = Get-FirstColumn -Columns $cols -Candidates @('Active','IsActive','Enabled')

if (-not $idCol) {
    Write-Host ('ERROR: No ID column found on dbo.' + $RepTable + '. Columns present:') -ForegroundColor Red
    Write-Host ('  ' + ($cols -join ', ')) -ForegroundColor DarkGray
    throw ('Cannot find SalespersonID column on dbo.' + $RepTable)
}

Write-Host ('  ID column  : ' + $idCol)
if ($nameCol) {
    Write-Host ('  Name column: ' + $nameCol)
} else {
    Write-Host '  Name column: (none) -- will use ID as name' -ForegroundColor Yellow
}
if ($emailCol) { Write-Host ('  Email      : ' + $emailCol) } else { Write-Host '  Email      : (none)' }
if ($phoneCol) { Write-Host ('  Phone      : ' + $phoneCol) } else { Write-Host '  Phone      : (none)' }
if ($inactiveCol) {
    Write-Host ('  Active flag: NOT ' + $inactiveCol)
} elseif ($activeCol) {
    Write-Host ('  Active flag: ' + $activeCol)
} else {
    Write-Host '  Active flag: (none) -- defaulting all reps to active'
}
Write-Host ''

# Build SQL column expressions using simple concatenation (PS 5.1 safe)

$idColSql = 's.' + (Quote-SqlId $idCol)

if ($nameCol) {
    $nameColSql = 's.' + (Quote-SqlId $nameCol)
} else {
    $nameColSql = $idColSql
}
$nameExpr = 'CAST(' + $nameColSql + ' AS NVARCHAR(255))'

if ($emailCol) {
    $emailExpr = 'CAST(s.' + (Quote-SqlId $emailCol) + ' AS NVARCHAR(255))'
} else {
    $emailExpr = 'NULL'
}

if ($phoneCol) {
    $phoneExpr = 'CAST(s.' + (Quote-SqlId $phoneCol) + ' AS NVARCHAR(64))'
} else {
    $phoneExpr = 'NULL'
}

if ($inactiveCol) {
    $activeExpr = 'CASE WHEN ISNULL(s.' + (Quote-SqlId $inactiveCol) + ',0)=1 THEN CAST(0 AS bit) ELSE CAST(1 AS bit) END'
} elseif ($activeCol) {
    $activeExpr = 'CASE WHEN ISNULL(s.' + (Quote-SqlId $activeCol) + ',1)=1 THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END'
} else {
    $activeExpr = 'CAST(1 AS bit)'
}

# ── 3. Check enrichment table availability ──────────────────────────────────

$hasTbCustomer   = Test-SqlObjectExists -Name 'tbCustomer'
$hasTerritory    = $hasTbCustomer -and (Test-SqlColumnExists -Table 'tbCustomer' -Column '_Territory')
$hasSalesMgr     = $hasTbCustomer -and (Test-SqlColumnExists -Table 'tbCustomer' -Column '_SalesManager')
$hasOrderSalesId = (Test-SqlObjectExists -Name 'Orders') -and (Test-SqlColumnExists -Table 'Orders' -Column 'SalespersonID')

if ($hasTerritory)    { Write-Host 'dbo.tbCustomer._Territory   : found' } else { Write-Host 'dbo.tbCustomer._Territory   : not found' }
if ($hasSalesMgr)     { Write-Host 'dbo.tbCustomer._SalesManager: found' } else { Write-Host 'dbo.tbCustomer._SalesManager: not found' }
if ($hasOrderSalesId) { Write-Host 'dbo.Orders.SalespersonID    : found' } else { Write-Host 'dbo.Orders.SalespersonID    : not found' }
Write-Host ''

# ── 4. Build rep query ──────────────────────────────────────────────────────

$repTableQuoted = 'dbo.' + (Quote-SqlId $RepTable)

$repSql = 'SELECT' + [Environment]::NewLine +
          '  LTRIM(RTRIM(CAST(' + $idColSql + ' AS NVARCHAR(64)))) AS acctivate_id,' + [Environment]::NewLine +
          '  LTRIM(RTRIM(CAST(' + $idColSql + ' AS NVARCHAR(64)))) AS rep_code,' + [Environment]::NewLine +
          '  LTRIM(RTRIM(' + $nameExpr + '))                        AS name,' + [Environment]::NewLine +
          '  ' + $emailExpr + '                                      AS email,' + [Environment]::NewLine +
          '  ' + $phoneExpr + '                                      AS phone,' + [Environment]::NewLine +
          '  ' + $activeExpr + '                                     AS active' + [Environment]::NewLine +
          'FROM ' + $repTableQuoted + ' s' + [Environment]::NewLine +
          'WHERE ' + $idColSql + ' IS NOT NULL' + [Environment]::NewLine +
          '  AND LEN(LTRIM(RTRIM(CAST(' + $idColSql + ' AS NVARCHAR(64))))) > 0'

# ── 5. Pull reps from Acctivate ─────────────────────────────────────────────

Write-Host ('Pulling sales reps from dbo.' + $RepTable + '...') -ForegroundColor Cyan

$rawReps = Invoke-Sql -SqlQuery $repSql

Write-Host ('  Pulled ' + $rawReps.Count + ' reps from Acctivate') -ForegroundColor Green

if ($rawReps.Count -eq 0) {
    Write-Host ''
    Write-Host ('No reps returned from dbo.' + $RepTable + ' -- aborting.') -ForegroundColor Red
    exit 1
}

# ── 6. Pull territory/manager enrichment ────────────────────────────────────

$enrichMap = @{}

if ($hasTerritory -and $hasOrderSalesId) {
    Write-Host 'Pulling territory/manager assignments from dbo.Orders + dbo.tbCustomer...' -ForegroundColor Cyan

    if ($hasSalesMgr) {
        $managerSelectExpr = 'LTRIM(RTRIM(tc._SalesManager))'
    } else {
        $managerSelectExpr = 'NULL'
    }

    if ($hasSalesMgr) {
        $managerGroupBy = ',' + [Environment]::NewLine + '    LTRIM(RTRIM(tc._SalesManager))'
    } else {
        $managerGroupBy = ''
    }

    $enrichSql = ';WITH rep_assignments AS (' + [Environment]::NewLine +
                 '  SELECT' + [Environment]::NewLine +
                 '    LTRIM(RTRIM(CAST(o.SalespersonID AS NVARCHAR(64)))) AS salesperson_id,' + [Environment]::NewLine +
                 '    LTRIM(RTRIM(tc._Territory))                          AS territory_name,' + [Environment]::NewLine +
                 '    ' + $managerSelectExpr + '                           AS manager_name,' + [Environment]::NewLine +
                 '    COUNT(*)                                              AS n,' + [Environment]::NewLine +
                 '    ROW_NUMBER() OVER (' + [Environment]::NewLine +
                 '      PARTITION BY LTRIM(RTRIM(CAST(o.SalespersonID AS NVARCHAR(64))))' + [Environment]::NewLine +
                 '      ORDER BY COUNT(*) DESC' + [Environment]::NewLine +
                 '    ) AS rk' + [Environment]::NewLine +
                 '  FROM dbo.Orders o' + [Environment]::NewLine +
                 '  JOIN dbo.tbCustomer tc ON tc.CustomerID = o.CustomerID' + [Environment]::NewLine +
                 '  WHERE o.SalespersonID IS NOT NULL' + [Environment]::NewLine +
                 '    AND LEN(LTRIM(RTRIM(CAST(o.SalespersonID AS NVARCHAR(64))))) > 0' + [Environment]::NewLine +
                 '    AND tc._Territory IS NOT NULL' + [Environment]::NewLine +
                 '    AND LEN(LTRIM(RTRIM(tc._Territory))) > 0' + [Environment]::NewLine +
                 '  GROUP BY' + [Environment]::NewLine +
                 '    LTRIM(RTRIM(CAST(o.SalespersonID AS NVARCHAR(64)))),' + [Environment]::NewLine +
                 '    LTRIM(RTRIM(tc._Territory))' + $managerGroupBy + [Environment]::NewLine +
                 ')' + [Environment]::NewLine +
                 'SELECT salesperson_id, territory_name, manager_name' + [Environment]::NewLine +
                 'FROM rep_assignments' + [Environment]::NewLine +
                 'WHERE rk = 1'

    try {
        $enrichRows = Invoke-Sql -SqlQuery $enrichSql
        foreach ($r in $enrichRows) {
            $keyVal = $r['salesperson_id']
            if ($null -ne $keyVal) {
                $key = $keyVal.ToString().Trim()
                if ($key -ne '') {
                    $enrichMap[$key] = $r
                }
            }
        }
        Write-Host ('  Matched territory/manager for ' + $enrichMap.Count + ' reps') -ForegroundColor Green
    } catch {
        Write-Host '  Warning: territory/manager enrichment failed -- continuing without it' -ForegroundColor Yellow
        Write-Host ('  ' + $_) -ForegroundColor DarkGray
    }
} else {
    Write-Host 'Skipping territory/manager enrichment (dbo.tbCustomer._Territory not available)' -ForegroundColor DarkGray
}

Write-Host ''

# ── 7. Build upload rows ─────────────────────────────────────────────────────

$uploadRows = @()

foreach ($rep in $rawReps) {
    $cleaned = Clean-Row -Row $rep

    $repIdValue = $cleaned['acctivate_id']
    if ($null -eq $repIdValue) { $repIdValue = '' }
    $repId = $repIdValue.ToString().Trim()

    if ($repId -eq '') { continue }

    $repNameValue = $cleaned['name']
    if ($null -eq $repNameValue) { $repNameValue = $repId }
    $repName = $repNameValue.ToString()
    if ($repName -eq '') { $repName = $repId }

    $repActiveValue = $cleaned['active']
    if ($null -eq $repActiveValue) {
        $repActive = $true
    } else {
        $repActive = [bool]$repActiveValue
    }

    if ($enrichMap.ContainsKey($repId)) {
        $enrich = $enrichMap[$repId]
        $terrNameVal = $enrich['territory_name']
        $mgrNameVal  = $enrich['manager_name']
        if ($null -ne $terrNameVal) { $terrName = $terrNameVal.ToString().Trim() } else { $terrName = '' }
        if ($null -ne $mgrNameVal)  { $mgrName  = $mgrNameVal.ToString().Trim()  } else { $mgrName  = '' }
    } else {
        $terrName = ''
        $mgrName  = ''
    }

    # Build the row as an ordered hashtable for consistent JSON serialization
    $row = [ordered]@{
        acctivate_id = $repId
        rep_code     = $repId
        name         = $repName
        active       = $repActive
        synced_at    = $SyncedAt
    }

    $repEmailValue = $cleaned['email']
    if ($null -ne $repEmailValue) {
        $row['email'] = $repEmailValue.ToString()
    }

    $repPhoneValue = $cleaned['phone']
    if ($null -ne $repPhoneValue) {
        $row['phone'] = $repPhoneValue.ToString()
    }

    if ($terrName -ne '') {
        $row['territory_name']         = $terrName
        $row['territory_acctivate_id'] = $terrName
    }

    if ($mgrName -ne '') {
        $row['manager_name']         = $mgrName
        $row['manager_acctivate_id'] = $mgrName
    }

    $uploadRows += $row
}

Write-Host ('Uploading ' + $uploadRows.Count + ' reps to Supabase (acctivate_sales_reps)...') -ForegroundColor Cyan

# ── 8. Batch upsert ──────────────────────────────────────────────────────────

$totalUploaded = 0
$totalFailed   = 0
$batchNum      = 0

$i = 0
while ($i -lt $uploadRows.Count) {
    $batchNum++
    $end = $i + $BatchSize - 1
    if ($end -ge $uploadRows.Count) { $end = $uploadRows.Count - 1 }
    $batch = $uploadRows[$i..$end]

    $rangeEnd = $i + $batch.Count
    Write-Host ('  Batch ' + $batchNum + ': rows ' + ($i + 1) + ' to ' + $rangeEnd) -ForegroundColor DarkGray

    $result = Invoke-SupabaseUpsert -Table 'acctivate_sales_reps' -Rows $batch

    if ($result.ok) {
        $totalUploaded += $batch.Count
    } else {
        Write-Host ('  Batch failed (HTTP ' + $result.statusCode + '): ' + $result.body) -ForegroundColor Red

        # Retry individual rows so one bad row does not lose the whole batch
        foreach ($singleRow in $batch) {
            $r2 = Invoke-SupabaseUpsert -Table 'acctivate_sales_reps' -Rows @($singleRow)
            if ($r2.ok) {
                $totalUploaded++
            } else {
                $bodyPreview = $r2.body
                if ($bodyPreview.Length -gt 200) { $bodyPreview = $bodyPreview.Substring(0, 200) }
                Log-FailedRow -Row $singleRow -Reason ('HTTP ' + $r2.statusCode + ': ' + $bodyPreview)
                $totalFailed++
            }
        }
    }

    $i += $BatchSize
}

# ── 9. Summary ───────────────────────────────────────────────────────────────

Write-Host ''
Write-Host '-----------------------------------------' -ForegroundColor DarkGray
Write-Host ('Source table          : dbo.' + $RepTable + ' (ID=' + $idCol + ')')
Write-Host ('Pulled from Acctivate : ' + $rawReps.Count + ' reps')
Write-Host ('Uploaded to Supabase  : ' + $totalUploaded + ' reps')

if ($totalFailed -gt 0) {
    Write-Host ('Failed rows           : ' + $totalFailed + '  -->  ' + $FailedCsvPath) -ForegroundColor Red
} else {
    Write-Host 'Failed rows           : 0' -ForegroundColor Green
}

Write-Host ('Sync complete         : ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')) -ForegroundColor Green
Write-Host '-----------------------------------------' -ForegroundColor DarkGray
Write-Host ''
