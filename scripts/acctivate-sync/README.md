# Acctivate → Lovable Cloud Sync (PowerShell)

Pushes data from your on-prem Acctivate SQL Server to the `sync-acctivate`
edge function. Run this on a Windows machine that can reach the Acctivate
SQL Server (typically the same machine Acctivate is installed on).

## 1. One-time setup

1. Install **PowerShell 7+** (`winget install Microsoft.PowerShell`).
2. Copy this `scripts/acctivate-sync/` folder to the desktop machine
   (e.g. `C:\LineageSync\`).
3. Copy the config template and fill it in:
   ```powershell
   cd C:\LineageSync
   Copy-Item sync.config.example.json sync.config.json
   notepad sync.config.json
   ```
   - `syncToken` → value of the `SYNC_API_TOKEN` secret in Lovable Cloud
   - `sql.server` → e.g. `LOCALHOST\ACCTIVATE` or `ACCT-SQL01`
   - `sql.database` → usually `Acctivate`
   - `integratedSecurity: true` uses the logged-in Windows account; set to
     `false` and fill `user` / `password` for SQL auth.

4. **Lock down the config file** — it contains the sync token:
   ```powershell
   icacls sync.config.json /inheritance:r /grant:r "$($env:USERNAME):(R,W)"
   ```

## 2. Test it

```powershell
pwsh .\Sync-Acctivate.ps1 -Tables dealers
```

You should see something like:
```
==> dealers
  pulled 842 rows from SQL
  [dealers] 500 / 842
  [dealers] 842 / 842
Done.
```

To remove stale dealers after syncing, run:
```powershell
pwsh .\Sync-Acctivate.ps1 -Tables dealers -Prune
```

The prune step is protected: dealers with field check-in history are kept.

Then run a full sync without pruning:
```powershell
pwsh .\Sync-Acctivate.ps1
```

## 3. Customize the SQL queries

The default queries in `Sync-Acctivate.ps1` assume common Acctivate column
names (`dbo.Customer`, `dbo.Product`, `dbo.Salesperson`, …). Your install
may differ — open the script, edit the `$queries` hashtable, and make sure
**every query returns an `acctivate_id` column** (used as the upsert key).

Allowed target tables (defined server-side in `sync-acctivate`):
`managers, sales_reps, territories, rep_territories, dealers, contacts,
kpi_records, activities, tasks, dealer_sales, dealer_sales_lines,
products, inventory`.

## 4. Schedule it (Task Scheduler)

Run every night at 2 AM:

```powershell
$action  = New-ScheduledTaskAction `
  -Execute 'pwsh.exe' `
  -Argument '-NoProfile -File C:\LineageSync\Sync-Acctivate.ps1' `
  -WorkingDirectory 'C:\LineageSync'

$trigger = New-ScheduledTaskTrigger -Daily -At 2am

Register-ScheduledTask `
  -TaskName 'Lineage Acctivate Sync' `
  -Action $action `
  -Trigger $trigger `
  -RunLevel Highest `
  -Description 'Pushes Acctivate data to Lovable Cloud nightly.'
```

Logs: add `*> C:\LineageSync\last-run.log` to the argument string to capture
output for troubleshooting.

## 5. Troubleshooting

| Symptom | Fix |
|---|---|
| `Invalid sync token` | Token in `sync.config.json` doesn't match `SYNC_API_TOKEN` in Lovable Cloud. Re-copy it. |
| `Login failed for user` | Wrong SQL credentials — toggle `integratedSecurity` or fix user/password. |
| `Invalid object name 'dbo.Customer'` | Your Acctivate schema differs — edit the SQL in `$queries`. |
| HTTP 400 with column errors | A returned column isn't in the target table. Adjust the SELECT aliases. |
