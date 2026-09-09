<#
.SYNOPSIS
  One-time backfill: populates original_price on public.acctivate_invoice_lines_2026_direct
  for July 2026 invoice lines only, from the live Acctivate SQL Server.

.DESCRIPTION
  July 2026 is the one month where Acctivate bundled tariff/freight into the
  invoice line's Price/Amount - from August 2026 on they're separate line
  items already excluded by the Product.SalesCategory filter. The correct
  July formula is:
    _OriginalPrice * QtyInvoiced * (1 - LineDiscountPct / 100)

  This script pulls _OriginalPrice for July 2026 straight from the LIVE
  Acctivate SQL Server (dbo.InvoiceDetail / dbo.Invoice) - NOT the stale
  Skyvia dbo_InvoiceDetail mirror in Supabase, which died 2026-07-08 and
  only covers July 1-8.

  The write goes through the public.backfill_july_2026_invoice_original_price
  RPC (see supabase/migrations/20260913000900_backfill_july_original_price_rpc.sql)
  - a plain UPDATE, never an upsert. acctivate_invoice_lines_2026_direct has
  no unique constraint/index on guid_invoice_detail (only on natural_key), so
  a POST upsert with on_conflict=guid_invoice_detail is invalid from
  Postgres's side and always fails with 400. The RPC matches rows by a
  normalized (lowercase, dashes/braces stripped) comparison against
  guid_invoice_detail - case-insensitive on both sides, since Acctivate
  returns lowercase GUIDs and Supabase stores them hyphenated-UPPERCASE - and
  its WHERE clause hard-codes the July 2026 date range itself, so the RPC
  physically cannot insert a row or touch a row outside July no matter what
  is sent to it. It never touches formula_net_amount, price,
  invoice_detail_amount, or any other column. Any Acctivate row whose
  guid_invoice_detail has no matching row in Supabase is skipped and
  reported before the write even happens - that would mean the base
  direct-sync pull is missing that line, a separate problem.
  On any write failure the script prints the full Supabase/PostgREST error
  response body (not just the .NET exception message), so real failures are
  never hidden behind a generic "400 Bad Request".

  Scope is hard-limited to July 2026 (invoice_date >= 2026-07-01 AND
  < 2026-08-01) at the SQL Server query, the pre-write existence check, AND
  inside the RPC's own WHERE clause - three independent layers, not just one.
  January through June and August onward are never touched. Bookings, Open
  SO, and Labor Day Promo are untouched - this script only ever writes to
  the original_price column.

  Deploy to C:\AcctivateKPI\ on the LineageVM, alongside the existing sync
  scripts and kpi.config.json (same config file/format as
  pull-2026-invoiced-lines-direct.ps1). Requires migration
  20260913000900_backfill_july_original_price_rpc.sql to already be applied
  to Supabase (it grants EXECUTE on the RPC to service_role only).

.PARAMETER ConfigPath
  Path to kpi.config.json. Defaults to .\kpi.config.json next to this script.

.PARAMETER DryRun
  Pull from Acctivate and compute what would be updated, but skip the
  confirmation prompt and the Supabase write entirely. Use this to preview
  row counts before running for real.

.EXAMPLE
  pwsh C:\AcctivateKPI\backfill-july-invoice-original-price.ps1
  pwsh C:\AcctivateKPI\backfill-july-invoice-original-price.ps1 -DryRun
  pwsh C:\AcctivateKPI\backfill-july-invoice-original-price.ps1 -ConfigPath C:\AcctivateKPI\kpi.config.json

.NOTES
  kpi.config.json structure (same file already used by the other sync
  scripts on this VM):
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
  [string]$ConfigPath = (Join-Path $PSScriptRoot 'kpi.config.json'),
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Write-Section {
  param([string]$Title)
  Write-Host ''
  Write-Host ('=== ' + $Title + ' ===') -ForegroundColor Cyan
}

# GUID matching key: lowercase, braces stripped, dashes kept. Acctivate's SQL
# already outputs this form; Supabase stores guid_invoice_detail as
# hyphenated UPPERCASE (e.g. 95B657DC-AEF6-428F-AC87-01291C43B63F), so a raw
# string/HashSet comparison against Acctivate's lowercase value never matches
# - this normalizes both sides to the same case before comparing.
function Normalize-Guid {
  param([string]$Guid)
  if (-not $Guid) { return $null }
  return ($Guid -replace '[{}]', '').ToLowerInvariant()
}

# --- Load config -------------------------------------------------------------

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

$RangeStart = '2026-07-01'
$RangeEnd   = '2026-08-01'

$headers = @{
  'apikey'        = $ServiceKey
  'Authorization' = "Bearer $ServiceKey"
  'Content-Type'  = 'application/json'
}

# --- SQL connection -----------------------------------------------------------

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

# --- Source query (live Acctivate SQL Server - not the Skyvia mirror) --------

$sql = @"
SELECT
    LOWER(REPLACE(REPLACE(CAST(dtl.GUIDInvoiceDetail AS NVARCHAR(64)), '{', ''), '}', '')) AS guid_invoice_detail,
    CAST(dtl._OriginalPrice AS DECIMAL(18,4)) AS original_price,
    inv.InvoiceDate,
    inv.InvoiceNumber,
    dtl.ProductID,
    dtl.QtyInvoiced,
    dtl.LineDiscountPct
FROM dbo.InvoiceDetail dtl
INNER JOIN dbo.Invoice inv
    ON dtl.InvoiceNumber = inv.InvoiceNumber
WHERE inv.InvoiceDate >= '$RangeStart'
  AND inv.InvoiceDate <  '$RangeEnd'
  AND dtl._OriginalPrice IS NOT NULL
"@

Write-Section 'PULL FROM LIVE ACCTIVATE SQL SERVER'
Write-Host "  server   : $($cfg.sql.server)"
Write-Host "  database : $($cfg.sql.database)"
Write-Host "  scope    : InvoiceDate >= $RangeStart AND < $RangeEnd (July 2026 only)"

$acctivateRows = Invoke-Sql -Query $sql
$fetchedCount  = $acctivateRows.Count
Write-Host "  rows fetched from Acctivate: $fetchedCount" -ForegroundColor Green

if ($fetchedCount -eq 0) {
  Write-Warning "No rows returned. Check the SQL connection, or that dbo.InvoiceDetail._OriginalPrice is populated for July 2026."
  exit 0
}

# Dedupe defensively on normalized guid_invoice_detail (last one wins) in
# case of any join fan-out from the source query. Acctivate's SQL already
# lowercases and strips braces, but normalize again here so this is not
# silently dependent on the SQL text staying exactly as written.
$byGuid = [ordered]@{}
foreach ($r in $acctivateRows) {
  $g = Normalize-Guid ([string]$r['guid_invoice_detail'])
  if ($g) { $byGuid[$g] = $r }
}
Write-Host "  distinct guid_invoice_detail values: $($byGuid.Count)"

# --- Find which of these guids already exist in Supabase ---------------------
# This check is purely for accurate fetched/matched/skipped reporting - the
# actual write below goes through an UPDATE-only RPC that cannot insert a row
# regardless of whether this check ran, so it isn't a safety dependency, just
# visibility into which July Acctivate lines the base direct-sync pull is
# missing (those are skipped and reported, not written).
#
# Matching is done on the normalized (lowercase, no braces) form on both
# sides, since Supabase stores guid_invoice_detail hyphenated-UPPERCASE while
# Acctivate's query returns lowercase.

Write-Section 'CHECK EXISTING ROWS IN SUPABASE (July 2026 scope only)'

function Get-ExistingJulyGuidMap {
  # normalized guid -> original Supabase-cased guid
  $existing = [System.Collections.Generic.Dictionary[string,string]]::new()
  $pageSize = 1000
  $offset   = 0
  while ($true) {
    $url = "$SupabaseUrl/rest/v1/acctivate_invoice_lines_2026_direct" +
           "?select=guid_invoice_detail" +
           "&invoice_date=gte.$RangeStart&invoice_date=lt.$RangeEnd" +
           "&limit=$pageSize&offset=$offset"
    $getHeaders = @{ 'apikey' = $ServiceKey; 'Authorization' = "Bearer $ServiceKey"; 'Accept' = 'application/json' }
    $resp = Invoke-RestMethod -Method Get -Uri $url -Headers $getHeaders -TimeoutSec $RequestTimeout
    if (-not $resp -or $resp.Count -eq 0) { break }
    foreach ($row in $resp) {
      $orig = [string]$row.guid_invoice_detail
      $norm = Normalize-Guid $orig
      if ($norm) { $existing[$norm] = $orig }
    }
    if ($resp.Count -lt $pageSize) { break }
    $offset += $pageSize
  }
  return $existing
}

$existingGuidMap = Get-ExistingJulyGuidMap
Write-Host "  existing July rows in acctivate_invoice_lines_2026_direct: $($existingGuidMap.Count)"

$toUpdate = [System.Collections.Generic.List[hashtable]]::new()
$skipped  = [System.Collections.Generic.List[string]]::new()

foreach ($g in $byGuid.Keys) {
  if ($existingGuidMap.ContainsKey($g)) {
    # $g is already the normalized (lowercase, no braces) form built above -
    # this is exactly what backfill_july_2026_invoice_original_price expects
    # as normalized_guid; the RPC does its own dash-stripped matching against
    # guid_invoice_detail server-side, so no lookup of the original
    # Supabase-cased value is needed for the write itself (existingGuidMap is
    # still used above only to decide what counts as skipped, for reporting).
    $toUpdate.Add(@{ normalized_guid = $g; original_price = [double]$byGuid[$g]['original_price'] }) | Out-Null
  } else {
    $skipped.Add($g) | Out-Null
  }
}

Write-Host "  rows matched to an existing Supabase row (will be updated): $($toUpdate.Count)" -ForegroundColor Green
if ($skipped.Count -gt 0) {
  Write-Warning "  $($skipped.Count) Acctivate row(s) have no matching row in Supabase and will be SKIPPED (not inserted):"
  $skipped | Select-Object -First 10 | ForEach-Object { Write-Warning "    guid_invoice_detail: $_" }
  if ($skipped.Count -gt 10) { Write-Warning "    ... and $($skipped.Count - 10) more" }
  Write-Warning "  This means the base direct-sync pull is missing these July invoice lines entirely - a separate issue, not fixed by this script."
}

if ($toUpdate.Count -eq 0) {
  Write-Warning "Nothing to update. Exiting."
  exit 0
}

if ($DryRun) {
  Write-Host ''
  Write-Host "DryRun: would update original_price on $($toUpdate.Count) row(s). No changes made." -ForegroundColor Yellow
  exit 0
}

# --- Confirm ---------------------------------------------------------------

Write-Host ''
Write-Host "This will update ONLY the original_price column on $($toUpdate.Count) existing July 2026 rows in" -ForegroundColor Yellow
Write-Host "public.acctivate_invoice_lines_2026_direct. No other column, no other month, no other table." -ForegroundColor Yellow
$ans = Read-Host "Proceed? (yes/no)"
if ($ans -notmatch '^y(es)?$') { Write-Host 'Aborted. Nothing changed.' -ForegroundColor Red; exit 1 }

# --- Upload: UPDATE-only RPC, no upsert, no ON CONFLICT ---------------------
# acctivate_invoice_lines_2026_direct has NO unique constraint or index on
# guid_invoice_detail (only on natural_key) - a POST upsert with
# on_conflict=guid_invoice_detail is invalid from Postgres's side and always
# returns 400. public.backfill_july_2026_invoice_original_price (see
# supabase/migrations/20260913000900_backfill_july_original_price_rpc.sql)
# is a plain UPDATE ... FROM ... WHERE, hard-scoped to July 2026 in its own
# WHERE clause and writing only original_price - it cannot insert a row
# regardless of what's passed in, so this is safe even without the
# pre-existing-row check above (that check is kept only for accurate
# fetched/matched/skipped reporting).

function Get-HttpErrorBody {
  param($ErrorRecord)
  if ($ErrorRecord.ErrorDetails -and $ErrorRecord.ErrorDetails.Message) {
    return $ErrorRecord.ErrorDetails.Message
  }
  try {
    $resp = $ErrorRecord.Exception.Response
    if ($resp) {
      $stream = $resp.GetResponseStream()
      $reader = New-Object System.IO.StreamReader($stream)
      $body   = $reader.ReadToEnd()
      $reader.Close()
      if ($body) { return $body }
    }
  } catch { }
  return $ErrorRecord.Exception.Message
}

$rpcHeaders = $headers.Clone()
$rpcUrl = "$SupabaseUrl/rest/v1/rpc/backfill_july_2026_invoice_original_price"

function Send-Batch {
  param([hashtable[]]$Rows, [int]$StartIndex, [int]$Total)
  $payload = @{ p_rows = $Rows } | ConvertTo-Json -Depth 4 -Compress
  for ($attempt = 1; $attempt -le $MaxRetries; $attempt++) {
    try {
      $result = Invoke-RestMethod -Method Post -Uri $rpcUrl -Headers $rpcHeaders -Body $payload -TimeoutSec $RequestTimeout
      $end = [Math]::Min($StartIndex + $Rows.Count, $Total)
      Write-Host "  updated rows $($StartIndex + 1)-$end of $Total (RPC reports $result row(s) actually updated)" -ForegroundColor DarkCyan
      return [int]$result
    } catch {
      $errorBody = Get-HttpErrorBody $_
      Write-Warning "  batch at row $($StartIndex + 1): attempt $attempt/$MaxRetries failed - full Supabase response:"
      Write-Warning "  $errorBody"
      if ($attempt -ge $MaxRetries) {
        throw "Batch starting row $($StartIndex + 1) failed after $MaxRetries attempts. Last response: $errorBody"
      }
      Start-Sleep -Seconds $RetryDelaySec
    }
  }
}

Write-Section 'UPDATE original_price IN SUPABASE (UPDATE-only RPC)'
$rows  = $toUpdate.ToArray()
$total = $rows.Count
$rpcUpdatedTotal = 0
for ($i = 0; $i -lt $total; $i += $BatchSize) {
  $last  = [Math]::Min($i + $BatchSize - 1, $total - 1)
  $chunk = [hashtable[]]$rows[$i..$last]
  $rpcUpdatedTotal += (Send-Batch -Rows $chunk -StartIndex $i -Total $total)
}
Write-Host "  update complete: RPC updated $rpcUpdatedTotal of $total row(s) sent" -ForegroundColor Green
if ($rpcUpdatedTotal -ne $total) {
  Write-Warning "  $($total - $rpcUpdatedTotal) row(s) were sent but not matched by the RPC's own WHERE clause (guid or July date mismatch server-side) - investigate before assuming the backfill is complete."
}

# --- Validation ------------------------------------------------------------

function Get-Count {
  param([string]$Filter)
  $url = "$SupabaseUrl/rest/v1/acctivate_invoice_lines_2026_direct?select=guid_invoice_detail&invoice_date=gte.$RangeStart&invoice_date=lt.$RangeEnd&limit=1$Filter"
  $countHeaders = @{ 'apikey' = $ServiceKey; 'Authorization' = "Bearer $ServiceKey"; 'Accept' = 'application/json'; 'Prefer' = 'count=exact' }
  $r  = Invoke-WebRequest -Method Get -Uri $url -Headers $countHeaders -TimeoutSec $RequestTimeout -UseBasicParsing
  $cr = $r.Headers['Content-Range']
  if ($cr -and $cr -match '/(\d+)') { return [int]$Matches[1] }
  return -1
}

Write-Section 'VALIDATION'
$julyTotal   = Get-Count ''
$julyHasVal  = Get-Count '&original_price=not.is.null'
$julyMissing = Get-Count '&original_price=is.null'

Write-Host ("  rows fetched from Acctivate (with _OriginalPrice)     : {0}" -f $fetchedCount)
Write-Host ("  rows updated in Supabase                              : {0}" -f $total) -ForegroundColor Green
if ($skipped.Count -gt 0) {
  Write-Host ("  rows skipped (no matching row in Supabase)            : {0}" -f $skipped.Count) -ForegroundColor Yellow
}
Write-Host ("  July 2026 rows total in acctivate_invoice_lines_2026_direct : {0}" -f $julyTotal)
Write-Host ("  July 2026 rows WITH original_price populated          : {0}" -f $julyHasVal) -ForegroundColor Green
Write-Host ("  July 2026 rows STILL missing original_price           : {0}" -f $julyMissing) -ForegroundColor (if ($julyMissing -gt 0) { 'Yellow' } else { 'Green' })

Write-Host ''
Write-Host "Done at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Green
Write-Host "  August onwards, Jan-Jun, formula_net_amount, price, invoice_detail_amount, bookings, Open SO, and Labor Day Promo were not touched by this script."
