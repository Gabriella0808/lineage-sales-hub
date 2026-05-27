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

## 4. Schedule it (daily 3:00 PM Eastern)

A helper script registers a Windows Scheduled Task that runs the full sync
every day at **3:00 PM America/New_York** (follows DST automatically),
whether the user is logged in or not, and writes output to `last-run.log`.

Open an **elevated PowerShell 7** prompt (Run as Administrator) and run:

```powershell
cd C:\LineageSync
pwsh .\Register-SyncTask.ps1
```

That's it — the task is now registered as **Lineage Acctivate Sync**.

Useful follow-ups:

```powershell
# Trigger an immediate run to smoke-test
Start-ScheduledTask -TaskName 'Lineage Acctivate Sync'

# Tail the log
Get-Content C:\LineageSync\last-run.log -Wait

# Inspect / remove the task
Get-ScheduledTask -TaskName 'Lineage Acctivate Sync'
Unregister-ScheduledTask -TaskName 'Lineage Acctivate Sync' -Confirm:$false
```

> **About "live" data:** Acctivate runs on your on-prem SQL Server, which the
> cloud cannot reach directly. The portal is as fresh as the last sync — with
> this setup, that's once a day at 3 PM Eastern.

## 5. Troubleshooting

| Symptom | Fix |
|---|---|
| `Invalid sync token` | Token in `sync.config.json` doesn't match `SYNC_API_TOKEN` in Lovable Cloud. Re-copy it. |
| `Login failed for user` | Wrong SQL credentials — toggle `integratedSecurity` or fix user/password. |
| `Invalid object name 'dbo.Customer'` | Your Acctivate schema differs — edit the SQL in `$queries`. |
| HTTP 400 with column errors | A returned column isn't in the target table. Adjust the SELECT aliases. |
| Sync stops after `==> inventory` | The inventory SQL query or HTTP upload is timing out/retrying. The script now logs timestamps and exits after configured timeouts instead of wedging the scheduled task. |
| Remote desktop disconnects mid-sync | Reconnect and check `C:\LineageSync\last-run.log`; scheduled runs continue in the background and should now either finish or fail cleanly. |

Optional timeout settings in `sync.config.json`:

```json
{
  "requestTimeoutSeconds": 120,
  "maxRetries": 3,
  "retryDelaySeconds": 5,
  "sql": {
    "commandTimeoutSeconds": 300
  }
}
```
