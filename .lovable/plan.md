# Migrate Portal to Standalone Supabase

Goal: move the portal's backend off Lovable Cloud onto a Supabase project you own, while keeping the Lovable editor + Cloudflare Pages frontend pipeline. Email gets rebuilt on Resend. Users reset passwords on first login.

---

## Phase 1 — Create the new Supabase project (you do this)

1. Sign up at supabase.com → create new project (pick US region — closest to your AWS Lightsail VM running the Acctivate sync).
2. Save the **project URL**, **anon/publishable key**, **service role key**, and **DB password** somewhere safe.
3. Enable extensions: `pg_cron`, `pg_net`, `pgmq`, `vault`.

I'll walk you through each click in chat, one step at a time.

---

## Phase 2 — Export schema + data from Lovable Cloud

Lovable Cloud doesn't allow full `pg_dump`. Workaround:

- I generate a **single consolidated SQL migration file** containing every table, view, function, trigger, RLS policy, and grant currently in your portal (~90 tables, ~50 functions).
- I export each table's data to CSV (via the exec tool, table by table — `dealers`, `crm_accounts`, `dealer_invoices`, `manager_tasks`, `manager_weekly_reviews`, `clearance_weekly_sales`, etc.).
- The big Acctivate mirror tables (`dbo_*`) — we **skip exporting** these because your Lightsail sync will repopulate them on the new DB.

Output: one `.sql` schema file + a folder of CSVs, both saved to `/mnt/documents/`.

---

## Phase 3 — Load schema + data into new Supabase

1. You paste the schema SQL into the new project's SQL editor → run.
2. I write an import script that uploads CSVs via `\copy`.
3. Verify row counts match.

Users (`auth.users`) are **not migrated** — everyone resets password on first login.

---

## Phase 4 — Switch the portal frontend to the new Supabase

This is where Lovable Cloud gets disconnected for this project.

1. Update `.env` (and Cloudflare Pages env vars):
   - `VITE_SUPABASE_URL` → new project URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY` → new anon key
   - `VITE_SUPABASE_PROJECT_ID` → new project ref
2. Push to GitHub → Cloudflare Pages rebuilds → portal now reads/writes the new DB.

Note: After this, the Lovable Cloud panel in the editor stops being the source of truth. Future schema changes must be applied to your new Supabase project directly (I'll use its SQL editor or you can connect Supabase CLI).

---

## Phase 5 — Redeploy edge functions to new Supabase

All ~30 edge functions get redeployed via Supabase CLI. I'll provide one-command-at-a-time terminal instructions.

Functions: `sync-acctivate`, `sync-bigcommerce`, `sync-monday`, `sync-mailchimp-lead`, `sync-travel-log`, `sync-trade-show-leads`, `notify-task-assigned`, `notify-task-mention`, `notify-tasks-due-today`, `notify-weekly-checkins`, `notify-weekly-clearance`, `send-weekly-review-digest`, `submit-quote`, `admin-manage-users`, `geocode-dealer`, `qbwc-sync`, etc.

All ~24 secrets get re-added to the new project (Acctivate DB creds, Mailchimp, Monday, BigCommerce, Mapbox, Resend, etc.).

---

## Phase 6 — Rebuild email on Resend

`process-email-queue` and `send-transactional-email` currently use `@lovable.dev/email-js` + `LOVABLE_API_KEY`. Those won't work on standalone Supabase.

Rewrite to use **Resend** (you create a Resend account + verify `lineage-collections.com` or a subdomain like `notify.lineage-managerhub.com`).

All existing React Email templates (weekly review, clearance report, task assigned, etc.) are kept — only the send transport changes.

Cron jobs rebuilt:
- Friday 6pm ET → weekly review digest
- Friday 6pm ET → clearance products report
- Every 5s → process email queue
- Daily → tasks due today

---

## Phase 7 — Repoint the Lightsail Acctivate sync

On the Windows VM in AWS Lightsail:
1. Open `sync.config.json` next to `Sync-Acctivate.ps1`.
2. Update the Supabase URL + service role key to the new project.
3. Restart the scheduled task.

Within ~30 min the `dbo_*` tables on the new DB will be repopulated.

---

## Phase 8 — Cutover + verify

1. Pick a low-traffic window (~1hr).
2. Take a fresh CSV snapshot of writable tables (tasks, check-ins, weekly reviews, CRM notes) right before flipping env vars, so nothing entered last-minute is lost.
3. Flip Cloudflare Pages env vars → portal now on new Supabase.
4. Trigger an Acctivate sync manually to confirm inbound data works.
5. Send yourself a test weekly review email via Resend.
6. Have one user log in → reset password → confirm dashboard loads.

---

## What stays the same

- Lovable editor (you keep editing here)
- GitHub repo (`Gabriella0808/lineage-sales-hub`)
- Cloudflare Pages deployment
- Cloudflare domain (`lineage-managerhub.com`)
- Frontend code (React/Vite)
- All your data, tables, RLS rules, business logic

## What changes

- Database lives in **your** Supabase account, not Lovable's
- Emails sent via **Resend**, not Lovable Emails
- You manage your own secrets in the new Supabase dashboard
- All users reset passwords once

---

## Estimated timeline

- Phase 1 (setup): 15 min
- Phase 2 (export): 30–60 min (I do this)
- Phase 3 (load): 30 min
- Phase 4 (env flip): 10 min
- Phase 5 (functions): 1 hr
- Phase 6 (Resend): 1–2 hr (DNS verification can take time)
- Phase 7 (Lightsail): 15 min
- Phase 8 (cutover): 1 hr

**Total: ~half a day of active work, spread over 1–2 days for DNS propagation.**

Approve this and I'll start with Phase 1 — one command/click at a time.
