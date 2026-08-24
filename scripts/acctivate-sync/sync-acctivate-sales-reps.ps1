<#
.SYNOPSIS
    Syncs all sales reps from Acctivate into Supabase public.acctivate_sales_reps.

.DESCRIPTION
    SOURCE TABLE DISCOVERY
    The script checks table names in priority order:
      dbo.tbSalespersonInfo, dbo.tbSalesperson, dbo.Salesperson,
      dbo.tblSalesperson, dbo.SalesPerson, dbo.tblSalesPerson
    If none match by name it falls back to an INFORMATION_SCHEMA column scan.

    COLUMN DISCOVERY
    All column names are discovered at runtime via INFORMATION_SCHEMA so the
    script works across Acctivate versions. Candidate lists cover common naming
    variants for ID, name, email, phone, and active/inactive status.

    TERRITORY AND MANAGER ENRICHMENT
    Derived from dbo.Orders + dbo.tbCustomer:
    - The script detects at runtime whether dbo.Orders.SalespersonID stores a
      short text code (e.g. "Brent") or a GUID.
    - If code-based: enrichment joins on the text code directly.
    - If GUID-based: enrichment joins via dbo.[RepTable].GUIDSalesperson so the
      per-rep territory/manager assignment still works.
    The most-frequently-assigned territory and manager per rep are chosen.

    TERRITORY CODE
    territory_code is set to the first segment of territory_name split by "/" or
    space, giving a compact code (e.g. "IL/WI" -> "IL", "Mid Atlantic" -> "Mid").
    Override this derivation by extending the $TerritoryCodeMap hashtable.

    UPLOAD
    Upserts to public.acctivate_sales_reps ON CONFLICT (acctivate_id).
    Does NOT delete rows.
    Failed rows are written to a timestamped CSV next to this script.

    CONFIG (kpi.config.json, same directory as script)
    {
      "supabaseUrl":    "https://<project>.supabase.co",
      "serviceRoleKey": "...",
      "sql": {
        "server":                ".\\ACCTIVATE",
        "database":              "Acctivate",
        "integratedSecurity":    true,
        "commandTimeoutSeconds": 300
      },
      "batchSize":         100,
      "maxRetries":        3,
      "retryDelaySeconds": 10,
      "requestTimeoutSec": 60
    }

    PowerShell 5.1 compatible. No ?? operator. No unicode symbols.
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

if ($cfg.batchSize)           { $BatchSize      = [int]$cfg.batchSize           } else { $BatchSize      = 100 }
if ($cfg.maxRetries)          { $MaxRetries      = [int]$cfg.maxRetries          } else { $MaxRetries      = 3   }
if ($cfg.retryDelaySeconds)   { $RetryDelay      = [int]$cfg.retryDelaySeconds   } else { $RetryDelay      = 10  }
if ($cfg.requestTimeoutSec)   { $RequestTimeout  = [int]$cfg.requestTimeoutSec   } else { $RequestTimeout  = 60  }
if ($cfg.sql.commandTimeoutSeconds) { $SqlTimeout = [int]$cfg.sql.commandTimeoutSeconds } else { $SqlTimeout = 300 }

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
                if ($colVal -is [System.DBNull]) { $row[$colName] = $null } else { $row[$colName] = $colVal }
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
    $r = Invoke-Sql -SqlQuery (
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS " +
        "WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='" + $Table + "' ORDER BY ORDINAL_POSITION"
    )
    $names = @()
    foreach ($row in $r) { $names += $row['COLUMN_NAME'] }
    return $names
}

function Test-SqlObjectExists {
    param([string]$Name)
    $r = Invoke-Sql -SqlQuery (
        "SELECT 1 FROM INFORMATION_SCHEMA.TABLES " +
        "WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='" + $Name + "'"
    )
    return ($r.Count -gt 0)
}

function Test-SqlColumnExists {
    param([string]$Table, [string]$Column)
    $r = Invoke-Sql -SqlQuery (
        "SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS " +
        "WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='" + $Table + "' AND COLUMN_NAME='" + $Column + "'"
    )
    return ($r.Count -gt 0)
}

function Get-FirstColumn {
    param([string[]]$Columns, [string[]]$Candidates)
    foreach ($c in $Candidates) {
        if ($Columns -contains $c) { return $c }
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
    if ($null -eq $Val)              { return $null }
    if ($Val -is [System.DBNull])    { return $null }
    if ($Val -is [bool])             { return [bool]$Val }
    if ($Val -is [string])           { return ($Val -replace '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '') }
    if ($Val -is [datetime])         { return $Val.ToString('yyyy-MM-ddTHH:mm:ss') }
    if ($Val -is [System.DateTimeOffset]) { return $Val.ToString('yyyy-MM-ddTHH:mm:ss') }
    if (($Val -is [int]) -or ($Val -is [long]) -or ($Val -is [System.Int32]) -or ($Val -is [System.Int64])) {
        return [long]$Val
    }
    if (($Val -is [double]) -or ($Val -is [float]) -or ($Val -is [System.Decimal])) {
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
# Supabase upsert
# ---------------------------------------------------------------------------

function Convert-RowsToJsonArray {
    param([array]$Rows)
    $items = @()
    foreach ($row in @($Rows)) { $items += ($row | ConvertTo-Json -Depth 10 -Compress) }
    return '[' + ($items -join ',') + ']'
}

function Invoke-SupabaseUpsert {
    param([string]$Table, [array]$Rows, [string]$OnConflict = '')

    if ($OnConflict -ne '') {
        $url = $SupabaseUrl + '/rest/v1/' + $Table + '?on_conflict=' + $OnConflict
    } else {
        $url = $SupabaseUrl + '/rest/v1/' + $Table
    }
    $json      = Convert-RowsToJsonArray -Rows @($Rows)
    $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($json)

    Write-Host ('  POST ' + $Table + ' | ' + $Rows.Count + ' rows | ' + $bodyBytes.Length + ' bytes') -ForegroundColor DarkGray

    $headers = @{
        'apikey'        = $ServiceKey
        'Authorization' = 'Bearer ' + $ServiceKey
        'Prefer'        = 'resolution=merge-duplicates,return=minimal'
    }

    $attempt    = 0
    $keepTrying = $true
    $result     = @{ ok = $false; statusCode = 0; body = '' }

    while ($keepTrying) {
        $attempt++
        try {
            Invoke-WebRequest `
                -Uri $url -Method Post -Headers $headers `
                -ContentType 'application/json; charset=utf-8' `
                -Body $bodyBytes -UseBasicParsing `
                -TimeoutSec $RequestTimeout -ErrorAction Stop | Out-Null
            $result     = @{ ok = $true; statusCode = 200; body = '' }
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
                $result     = @{ ok = $false; statusCode = $code; body = $body }
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
    '_fail_reason','acctivate_id','rep_code','name','email','phone',
    'manager_name','manager_acctivate_id','territory_name','territory_acctivate_id',
    'territory_code','active'
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
        if ($v -match '[,"\r\n]') { $v = '"' + $v + '"' }
        $vals += $v
    }
    ($vals -join ',') | Out-File -FilePath $FailedCsvPath -Encoding utf8 -Append
    $script:FailedCount++
}

# ---------------------------------------------------------------------------
# Territory code derivation
# Override individual territory names here as needed.
# ---------------------------------------------------------------------------

$TerritoryCodeMap = @{
    'Mid Atlantic'    = 'MidAtl'
    'New England'     = 'NE'
    'South Florida'   = 'SFL'
    'North Florida'   = 'NFL'
    'Panhandle/GA/AL' = 'PGAAL'
    'Hospitality'     = 'HOSP'
    'Internet'        = 'INET'
    'House'           = 'HOUSE'
    'Arkansas'        = 'AR'
    'Indiana'         = 'IN'
}

function Get-TerritoryCode {
    param([string]$TerritoryName)
    if (-not $TerritoryName -or $TerritoryName.Trim() -eq '') { return $null }
    $n = $TerritoryName.Trim()
    if ($TerritoryCodeMap.ContainsKey($n)) { return $TerritoryCodeMap[$n] }
    # Default: first segment split on / or first two words
    $parts = $n -split '/'
    if ($parts.Count -gt 1) { return $parts[0].Trim() }
    $words = $n.Trim() -split '\s+'
    if ($words.Count -gt 1) { return ($words[0..1] -join '') }
    return $n
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

$RepTableCandidates = @('tbSalespersonInfo','tbSalesperson','Salesperson','tblSalesperson','SalesPerson','tblSalesPerson')
$RepTable = $null

foreach ($candidate in $RepTableCandidates) {
    if (Test-SqlObjectExists -Name $candidate) {
        $RepTable = $candidate
        Write-Host ('  Found: dbo.' + $RepTable) -ForegroundColor Green
        break
    }
}

if (-not $RepTable) {
    Write-Host '  Known names not found. Scanning INFORMATION_SCHEMA.COLUMNS...' -ForegroundColor Yellow
    $colSearch = Invoke-Sql -SqlQuery (
        "SELECT DISTINCT TABLE_NAME FROM INFORMATION_SCHEMA.COLUMNS " +
        "WHERE TABLE_SCHEMA='dbo' " +
        "  AND LOWER(COLUMN_NAME) IN (" +
        "    'salespersonid','salesperson_id','guidsalesperson'," +
        "    'salespersonname','salesperson_name') " +
        "ORDER BY TABLE_NAME"
    )
    if ($colSearch.Count -gt 0) {
        $RepTable = $colSearch[0]['TABLE_NAME']
        Write-Host ('  Found by column scan: dbo.' + $RepTable) -ForegroundColor Yellow
        if ($colSearch.Count -gt 1) {
            $others = @()
            for ($ci = 1; $ci -lt $colSearch.Count; $ci++) { $others += $colSearch[$ci]['TABLE_NAME'] }
            Write-Host ('  Other candidates (not used): ' + ($others -join ', ')) -ForegroundColor DarkGray
        }
    }
}

if (-not $RepTable) {
    Write-Host 'ERROR: No salesperson table found. Check manually:' -ForegroundColor Red
    Write-Host "  SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' ORDER BY TABLE_NAME" -ForegroundColor Yellow
    throw 'Salesperson source table not found.'
}

Write-Host ('  Using: dbo.' + $RepTable) -ForegroundColor Green

# ── 2. Discover columns on the source table ────────────────────────────────

Write-Host ('Inspecting dbo.' + $RepTable + ' schema...') -ForegroundColor Cyan

$cols = Get-SqlColumns -Table $RepTable

# Primary key / ID: prefer text code (SalespersonID) over GUID
$idCol       = Get-FirstColumn -Columns $cols -Candidates @('SalespersonID','SalespersonId','Salesperson_ID','ID','Code')
$guidCol     = Get-FirstColumn -Columns $cols -Candidates @('GUIDSalesperson','GuidSalesperson','GUID','UniqueId','UniqueID')
$nameCol     = Get-FirstColumn -Columns $cols -Candidates @('Name','SalespersonName','Salesperson_Name','FullName','DisplayName','Description')
$emailCol    = Get-FirstColumn -Columns $cols -Candidates @('Email','EmailAddress','EMail','EMailAddress','Email1','PrimaryEmail','ContactEmail')
$phoneCol    = Get-FirstColumn -Columns $cols -Candidates @('Phone','PhoneNumber','Phone1','CellPhone','MobilePhone','Telephone','Mobile','Cell','WorkPhone','DirectPhone')
$inactiveCol = Get-FirstColumn -Columns $cols -Candidates @('Inactive','IsInactive','Discontinued','Deleted','IsDeleted')
$activeCol   = Get-FirstColumn -Columns $cols -Candidates @('Active','IsActive','Enabled','IsEnabled')

# If no text-code ID column exists, fall back to the GUID column
if (-not $idCol) {
    if ($guidCol) {
        $idCol   = $guidCol
        $guidCol = $null
        Write-Host ('  Warning: no text-code ID column found -- using GUID column ' + $idCol + ' as acctivate_id') -ForegroundColor Yellow
    } else {
        Write-Host ('ERROR: No ID column found on dbo.' + $RepTable + '. Columns: ' + ($cols -join ', ')) -ForegroundColor Red
        throw ('Cannot find SalespersonID column on dbo.' + $RepTable)
    }
}

Write-Host ('  ID column   : ' + $idCol)
if ($guidCol)     { Write-Host ('  GUID column : ' + $guidCol) }
if ($nameCol)     { Write-Host ('  Name column : ' + $nameCol) } else { Write-Host '  Name column : (none) -- will use ID as name' -ForegroundColor Yellow }
if ($emailCol)    { Write-Host ('  Email       : ' + $emailCol) } else { Write-Host '  Email       : (none)' }
if ($phoneCol)    { Write-Host ('  Phone       : ' + $phoneCol) } else { Write-Host '  Phone       : (none)' }
if ($inactiveCol) { Write-Host ('  Active flag : NOT ' + $inactiveCol)
} elseif ($activeCol) { Write-Host ('  Active flag : ' + $activeCol)
} else { Write-Host '  Active flag : (none) -- defaulting all reps to active' }
Write-Host ('  All columns : ' + ($cols -join ', ')) -ForegroundColor DarkGray
Write-Host ''

# Build SQL column expressions

$repTableQ = 'dbo.' + (Quote-SqlId $RepTable)
$idColSql  = 's.' + (Quote-SqlId $idCol)

if ($nameCol) {
    $nameExpr = 'CAST(s.' + (Quote-SqlId $nameCol) + ' AS NVARCHAR(255))'
} else {
    $nameExpr = 'CAST(' + $idColSql + ' AS NVARCHAR(255))'
}

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
$hasOrders       = Test-SqlObjectExists -Name 'Orders'
$hasOrderSalesId = $hasOrders -and (Test-SqlColumnExists -Table 'Orders' -Column 'SalespersonID')

if ($hasTerritory)    { Write-Host 'dbo.tbCustomer._Territory   : found' } else { Write-Host 'dbo.tbCustomer._Territory   : not found' }
if ($hasSalesMgr)     { Write-Host 'dbo.tbCustomer._SalesManager: found' } else { Write-Host 'dbo.tbCustomer._SalesManager: not found' }
if ($hasOrderSalesId) { Write-Host 'dbo.Orders.SalespersonID    : found' } else { Write-Host 'dbo.Orders.SalespersonID    : not found' }

# ── 4. Detect whether Orders.SalespersonID is GUID-based or code-based ─────

$ordersIdIsGuid    = $false
$canEnrich         = $hasTerritory -and $hasOrderSalesId
$guidJoinAvailable = $canEnrich -and ($null -ne $guidCol)

if ($canEnrich) {
    Write-Host 'Sampling Orders.SalespersonID to detect format...' -ForegroundColor Cyan
    $sampleRows = Invoke-Sql -SqlQuery 'SELECT TOP 5 CAST(SalespersonID AS NVARCHAR(64)) AS sid FROM dbo.Orders WHERE SalespersonID IS NOT NULL'
    if ($sampleRows.Count -gt 0) {
        $sampleVal = $sampleRows[0]['sid'].ToString().Trim()
        $guidPattern = '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$'
        if ($sampleVal -match $guidPattern) {
            $ordersIdIsGuid = $true
            Write-Host ('  Orders.SalespersonID is GUID format (sample: ' + $sampleVal.Substring(0,8) + '...)') -ForegroundColor DarkGray
            if ($guidJoinAvailable) {
                Write-Host ('  Will join via ' + $RepTable + '.' + $guidCol + ' = Orders.SalespersonID') -ForegroundColor DarkGray
            } else {
                Write-Host ('  Warning: GUID join needed but ' + $RepTable + ' has no GUID column -- enrichment skipped') -ForegroundColor Yellow
                $canEnrich = $false
            }
        } else {
            Write-Host ('  Orders.SalespersonID is code format (sample: "' + $sampleVal + '") -- direct join') -ForegroundColor DarkGray
        }
    } else {
        Write-Host '  Orders table has no SalespersonID values -- enrichment skipped' -ForegroundColor Yellow
        $canEnrich = $false
    }
}
Write-Host ''

# ── 5. Build and run rep query ───────────────────────────────────────────────

$repSql = 'SELECT' + [Environment]::NewLine +
          '  LTRIM(RTRIM(CAST(' + $idColSql + ' AS NVARCHAR(64)))) AS acctivate_id,' + [Environment]::NewLine +
          '  LTRIM(RTRIM(CAST(' + $idColSql + ' AS NVARCHAR(64)))) AS rep_code,' + [Environment]::NewLine +
          '  LTRIM(RTRIM(' + $nameExpr + '))                        AS name,' + [Environment]::NewLine +
          '  ' + $emailExpr + '                                      AS email,' + [Environment]::NewLine +
          '  ' + $phoneExpr + '                                      AS phone,' + [Environment]::NewLine +
          '  ' + $activeExpr + '                                     AS active' + [Environment]::NewLine +
          'FROM ' + $repTableQ + ' s' + [Environment]::NewLine +
          'WHERE ' + $idColSql + ' IS NOT NULL' + [Environment]::NewLine +
          '  AND LEN(LTRIM(RTRIM(CAST(' + $idColSql + ' AS NVARCHAR(64))))) > 0'

Write-Host ('Pulling sales reps from dbo.' + $RepTable + '...') -ForegroundColor Cyan
$rawReps = Invoke-Sql -SqlQuery $repSql
Write-Host ('  Pulled ' + $rawReps.Count + ' reps') -ForegroundColor Green

if ($rawReps.Count -eq 0) {
    Write-Host ('No reps returned from dbo.' + $RepTable + ' -- aborting.') -ForegroundColor Red
    exit 1
}

# ── 6. Pull territory/manager enrichment ────────────────────────────────────

$enrichMap = @{}

if ($canEnrich) {
    Write-Host 'Pulling territory/manager from dbo.Orders + dbo.tbCustomer...' -ForegroundColor Cyan

    # Discover the customer join columns dynamically -- Acctivate may use
    # GUIDCustomer rather than CustomerID on tbCustomer.
    $tbCustCols  = Get-SqlColumns -Table 'tbCustomer'
    $ordersAllCols = Get-SqlColumns -Table 'Orders'

    $custPkCol    = Get-FirstColumn -Columns $tbCustCols   -Candidates @('GUIDCustomer','CustomerID','GUID','ID','CustomerGUID','CustID')
    $ordersCustFk = Get-FirstColumn -Columns $ordersAllCols -Candidates @('GUIDCustomer','CustomerID','Customer_ID','CustomerGUID','CustID')

    if (-not $custPkCol -or -not $ordersCustFk) {
        Write-Host ('  Warning: cannot find customer join columns.' ) -ForegroundColor Yellow
        Write-Host ('    tbCustomer columns  : ' + ($tbCustCols -join ', ')) -ForegroundColor DarkGray
        Write-Host ('    Orders columns (first 20): ' + ($ordersAllCols[0..19] -join ', ')) -ForegroundColor DarkGray
        Write-Host '  Skipping territory/manager enrichment.' -ForegroundColor Yellow
        $canEnrich = $false
    } else {
        Write-Host ('  Customer join: dbo.tbCustomer.' + $custPkCol + ' = dbo.Orders.' + $ordersCustFk) -ForegroundColor DarkGray
    }
}

if ($canEnrich) {
    if ($hasSalesMgr) {
        $managerSelectExpr = 'LTRIM(RTRIM(tc._SalesManager))'
        $managerGroupBy    = ',' + [Environment]::NewLine + '    LTRIM(RTRIM(tc._SalesManager))'
    } else {
        $managerSelectExpr = 'NULL'
        $managerGroupBy    = ''
    }

    # Build the salesperson join clause (GUID path or code path)
    if ($ordersIdIsGuid) {
        $guidColSql  = 's.' + (Quote-SqlId $guidCol)
        $spJoinLine  = [Environment]::NewLine + '  JOIN ' + $repTableQ + ' s ON CAST(' + $guidColSql + ' AS NVARCHAR(64)) = CAST(o.SalespersonID AS NVARCHAR(64))'
        $idSelectSQL = 'LTRIM(RTRIM(CAST(s.' + (Quote-SqlId $idCol) + ' AS NVARCHAR(64))))'
        $partitionBy = $idSelectSQL
        $groupByPrimary = 'LTRIM(RTRIM(CAST(s.' + (Quote-SqlId $idCol) + ' AS NVARCHAR(64)))),' + [Environment]::NewLine + '    LTRIM(RTRIM(tc._Territory))'
        $whereClause = '  WHERE o.SalespersonID IS NOT NULL' + [Environment]::NewLine +
                       '    AND tc._Territory IS NOT NULL' + [Environment]::NewLine +
                       '    AND LEN(LTRIM(RTRIM(tc._Territory))) > 0'
    } else {
        $spJoinLine  = ''
        $idSelectSQL = 'LTRIM(RTRIM(CAST(o.SalespersonID AS NVARCHAR(64))))'
        $partitionBy = 'LTRIM(RTRIM(CAST(o.SalespersonID AS NVARCHAR(64))))'
        $groupByPrimary = 'LTRIM(RTRIM(CAST(o.SalespersonID AS NVARCHAR(64)))),' + [Environment]::NewLine + '    LTRIM(RTRIM(tc._Territory))'
        $whereClause = '  WHERE o.SalespersonID IS NOT NULL' + [Environment]::NewLine +
                       '    AND LEN(LTRIM(RTRIM(CAST(o.SalespersonID AS NVARCHAR(64))))) > 0' + [Environment]::NewLine +
                       '    AND tc._Territory IS NOT NULL' + [Environment]::NewLine +
                       '    AND LEN(LTRIM(RTRIM(tc._Territory))) > 0'
    }

    # Customer join uses discovered column names
    $custJoinExpr = 'CAST(tc.' + (Quote-SqlId $custPkCol) + ' AS NVARCHAR(64)) = CAST(o.' + (Quote-SqlId $ordersCustFk) + ' AS NVARCHAR(64))'

    $enrichSql = ';WITH rep_assignments AS (' + [Environment]::NewLine +
                 '  SELECT' + [Environment]::NewLine +
                 '    ' + $idSelectSQL + ' AS salesperson_id,' + [Environment]::NewLine +
                 '    LTRIM(RTRIM(tc._Territory)) AS territory_name,' + [Environment]::NewLine +
                 '    ' + $managerSelectExpr + ' AS manager_name,' + [Environment]::NewLine +
                 '    COUNT(*) AS n,' + [Environment]::NewLine +
                 '    ROW_NUMBER() OVER (' + [Environment]::NewLine +
                 '      PARTITION BY ' + $partitionBy + [Environment]::NewLine +
                 '      ORDER BY COUNT(*) DESC' + [Environment]::NewLine +
                 '    ) AS rk' + [Environment]::NewLine +
                 '  FROM dbo.Orders o' + $spJoinLine + [Environment]::NewLine +
                 '  JOIN dbo.tbCustomer tc ON ' + $custJoinExpr + [Environment]::NewLine +
                 $whereClause + [Environment]::NewLine +
                 '  GROUP BY' + [Environment]::NewLine +
                 '    ' + $groupByPrimary + $managerGroupBy + [Environment]::NewLine +
                 ')' + [Environment]::NewLine +
                 'SELECT salesperson_id, territory_name, manager_name' + [Environment]::NewLine +
                 'FROM rep_assignments WHERE rk = 1'

    try {
        $enrichRows = Invoke-Sql -SqlQuery $enrichSql
        foreach ($r in $enrichRows) {
            $kv = $r['salesperson_id']
            if ($null -ne $kv) {
                $k = $kv.ToString().Trim()
                if ($k -ne '') { $enrichMap[$k] = $r }
            }
        }
        Write-Host ('  Matched territory/manager for ' + $enrichMap.Count + ' reps') -ForegroundColor Green
    } catch {
        Write-Host '  Warning: territory/manager enrichment failed -- continuing without it' -ForegroundColor Yellow
        Write-Host ('  Error: ' + $_) -ForegroundColor DarkGray
    }
} else {
    Write-Host 'Skipping territory/manager enrichment (dbo.tbCustomer._Territory not available or join not possible)' -ForegroundColor DarkGray
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
    if ($null -eq $repActiveValue) { $repActive = $true } else { $repActive = [bool]$repActiveValue }

    if ($enrichMap.ContainsKey($repId)) {
        $enrich = $enrichMap[$repId]
        $tv = $enrich['territory_name']
        $mv = $enrich['manager_name']
        if ($null -ne $tv) { $terrName = $tv.ToString().Trim() } else { $terrName = '' }
        if ($null -ne $mv) { $mgrName  = $mv.ToString().Trim() } else { $mgrName  = '' }
    } else {
        $terrName = ''
        $mgrName  = ''
    }

    $row = [ordered]@{
        acctivate_id = $repId
        rep_code     = $repId
        name         = $repName
        active       = $repActive
        synced_at    = $SyncedAt
    }

    $emailValue = $cleaned['email']
    if ($null -ne $emailValue) {
        $emailStr = $emailValue.ToString().Trim()
        if ($emailStr -ne '') { $row['email'] = $emailStr }
    }

    $phoneValue = $cleaned['phone']
    if ($null -ne $phoneValue) {
        $phoneStr = $phoneValue.ToString().Trim()
        if ($phoneStr -ne '') { $row['phone'] = $phoneStr }
    }

    if ($terrName -ne '') {
        $row['territory_name']         = $terrName
        $row['territory_acctivate_id'] = $terrName
        $terrCode = Get-TerritoryCode -TerritoryName $terrName
        if ($null -ne $terrCode) { $row['territory_code'] = $terrCode }
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
$i             = 0

while ($i -lt $uploadRows.Count) {
    $batchNum++
    $end   = $i + $BatchSize - 1
    if ($end -ge $uploadRows.Count) { $end = $uploadRows.Count - 1 }
    $batch = $uploadRows[$i..$end]

    Write-Host ('  Batch ' + $batchNum + ': rows ' + ($i + 1) + ' to ' + ($i + $batch.Count)) -ForegroundColor DarkGray

    $result = Invoke-SupabaseUpsert -Table 'acctivate_sales_reps' -Rows $batch -OnConflict 'acctivate_id'

    if ($result.ok) {
        $totalUploaded += $batch.Count
    } else {
        Write-Host ('  Batch failed (HTTP ' + $result.statusCode + '): ' + $result.body) -ForegroundColor Red
        foreach ($singleRow in $batch) {
            $r2 = Invoke-SupabaseUpsert -Table 'acctivate_sales_reps' -Rows @($singleRow) -OnConflict 'acctivate_id'
            if ($r2.ok) {
                $totalUploaded++
            } else {
                $bp = $r2.body
                if ($bp.Length -gt 200) { $bp = $bp.Substring(0, 200) }
                Log-FailedRow -Row $singleRow -Reason ('HTTP ' + $r2.statusCode + ': ' + $bp)
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
if ($guidCol) { Write-Host ('GUID column           : ' + $guidCol + ' (join mode: ' + $(if ($ordersIdIsGuid) {'GUID'} else {'n/a'}) + ')') }
Write-Host ('Enrichment            : ' + $(if ($enrichMap.Count -gt 0) {$enrichMap.Count.ToString() + ' reps matched'} else {'none'}))
Write-Host ('Email column          : ' + $(if ($emailCol) {$emailCol} else {'(none)'}))
Write-Host ('Phone column          : ' + $(if ($phoneCol) {$phoneCol} else {'(none)'}))
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
