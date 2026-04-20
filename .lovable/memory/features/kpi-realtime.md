---
name: KPI 2026 live data
description: KPI 2026 section must stay live with Acctivate bookings/invoicing updates
type: feature
---
The KPI 2026 section (LiveKpiReport / KpiPage) must always reflect the latest bookings and invoicing data from Acctivate.

How to apply:
- Acctivate syncs into the `dealer_sales` table via the `sync-acctivate` edge function.
- Any KPI views must auto-refresh when `dealer_sales` changes — use Supabase Realtime on `dealer_sales` (subscribe to INSERT/UPDATE) and invalidate the relevant React Query keys (`dealer_sales`, KPI-derived queries).
- Ensure the `dealer_sales` table has `REPLICA IDENTITY FULL` and is in the `supabase_realtime` publication.
- Keep React Query `staleTime` short (or rely on realtime invalidation) so users always see fresh booking/invoicing numbers.
