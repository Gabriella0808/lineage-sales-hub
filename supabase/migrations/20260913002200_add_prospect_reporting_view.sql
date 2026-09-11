-- ══════════════════════════════════════════════════════════════════════════════
-- Prospect Reporting, part 2: v_prospect_reporting_overview.
--
-- IMPORTANT FINDING before writing this view: there are two DIFFERENT
-- existing "last contacted" implementations in this codebase, and they
-- disagree.
--   1. CrmAccountsPage.tsx's `lastContactedMap` (list page) assumes
--      dealer_check_ins.dealer_id equals crm_accounts.id directly
--      ("prospect-shell dealers share the same id as the crm_account").
--   2. useAccountLastVisited (useCrm.ts, detail page) properly joins
--      dealers.crm_account_id = crm_accounts.id, then dealer_check_ins on
--      the resulting dealer id(s).
-- Queried directly: of 2,370 dealers linked to a crm_account via
-- crm_account_id, only 117 (5%) have dealers.id = dealers.crm_account_id.
-- The other 2,253 (95%) do not. #1's "shared id" assumption is therefore
-- wrong for the large majority of real records today — it would silently
-- miss most field-check-in-based contact history. #2's join is the
-- structurally correct one and matches how the conversion trigger
-- (convert_crm_account_to_dealer) actually links the two tables. This
-- view uses #2's (correct) join, not #1's — reusing crm_account_notes and
-- dealer_check_ins exactly as instructed, just via the join that's
-- actually accurate. Flagging the discrepancy in #1 back to the user
-- rather than silently propagating it.
--
-- contact_health buckets match the thresholds specified for the Contact
-- Health report exactly: healthy (<=30d), watch (31-60d), at_risk
-- (61-90d), neglected (90+d), no_contact (no note or check-in ever
-- found) — reused for both the Contact Health tab and the aging-bucket
-- chart, so both tell the same story with the same numbers.
--
-- converted_at: prefers the exact timestamp from the new
-- crm_account_events 'converted' event (added in the prior migration);
-- for accounts already converted before that migration shipped, falls
-- back to the linked dealers row's created_at (approximate — flagged via
-- converted_at_is_exact so the UI can label it accordingly, never
-- presented as exact when it isn't).
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.v_prospect_reporting_overview AS
WITH notes_last AS (
  SELECT account_id, MAX(created_at) AS last_note_at
  FROM public.crm_account_notes
  GROUP BY account_id
),
checkins_last AS (
  SELECT d.crm_account_id AS account_id, MAX(dci.visit_date) AS last_checkin_at
  FROM public.dealers d
  JOIN public.dealer_check_ins dci ON dci.dealer_id = d.id
  WHERE d.crm_account_id IS NOT NULL
  GROUP BY d.crm_account_id
),
contacts_60d AS (
  SELECT account_id, count(*) AS n FROM (
    SELECT account_id FROM public.crm_account_notes WHERE created_at >= now() - interval '60 days'
    UNION ALL
    SELECT d.crm_account_id AS account_id
    FROM public.dealers d JOIN public.dealer_check_ins dci ON dci.dealer_id = d.id
    WHERE d.crm_account_id IS NOT NULL AND dci.visit_date >= now() - interval '60 days'
  ) x
  GROUP BY account_id
),
contacts_6mo AS (
  SELECT account_id, count(*) AS n FROM (
    SELECT account_id FROM public.crm_account_notes WHERE created_at >= now() - interval '6 months'
    UNION ALL
    SELECT d.crm_account_id AS account_id
    FROM public.dealers d JOIN public.dealer_check_ins dci ON dci.dealer_id = d.id
    WHERE d.crm_account_id IS NOT NULL AND dci.visit_date >= now() - interval '6 months'
  ) x
  GROUP BY account_id
),
converted_event AS (
  SELECT account_id, MIN(occurred_at) AS converted_at
  FROM public.crm_account_events
  WHERE event_type = 'converted'
  GROUP BY account_id
),
dealer_fallback AS (
  SELECT crm_account_id AS account_id, MIN(created_at) AS dealer_created_at
  FROM public.dealers
  WHERE crm_account_id IS NOT NULL
  GROUP BY crm_account_id
)
SELECT
  a.id,
  a.company_name,
  a.account_type,
  a.lifecycle_stage,
  a.status,
  a.assigned_manager_id,
  a.assigned_rep_id,
  a.created_at,
  a.updated_at,
  GREATEST(nl.last_note_at, cl.last_checkin_at)                                          AS last_contact_at,
  (
    SELECT n.body FROM public.crm_account_notes n
    WHERE n.account_id = a.id ORDER BY n.created_at DESC LIMIT 1
  )                                                                                       AS last_note_preview,
  CASE WHEN GREATEST(nl.last_note_at, cl.last_checkin_at) IS NULL THEN NULL
    ELSE EXTRACT(DAY FROM (now() - GREATEST(nl.last_note_at, cl.last_checkin_at)))::int
  END                                                                                     AS days_since_contact,
  CASE
    WHEN GREATEST(nl.last_note_at, cl.last_checkin_at) IS NULL THEN 'no_contact'
    WHEN now() - GREATEST(nl.last_note_at, cl.last_checkin_at) <= INTERVAL '30 days' THEN 'healthy'
    WHEN now() - GREATEST(nl.last_note_at, cl.last_checkin_at) <= INTERVAL '60 days' THEN 'watch'
    WHEN now() - GREATEST(nl.last_note_at, cl.last_checkin_at) <= INTERVAL '90 days' THEN 'at_risk'
    ELSE 'neglected'
  END                                                                                     AS contact_health,
  COALESCE(c60.n, 0)                                                                      AS contacts_last_60d,
  COALESCE(c6m.n, 0)                                                                      AS contacts_last_6mo,
  COALESCE(ce.converted_at, df.dealer_created_at)                                         AS converted_at,
  (ce.converted_at IS NOT NULL)                                                           AS converted_at_is_exact,
  (a.assigned_manager_id IS NULL)                                                         AS is_unassigned
FROM public.crm_accounts a
LEFT JOIN notes_last     nl  ON nl.account_id = a.id
LEFT JOIN checkins_last  cl  ON cl.account_id = a.id
LEFT JOIN contacts_60d   c60 ON c60.account_id = a.id
LEFT JOIN contacts_6mo   c6m ON c6m.account_id = a.id
LEFT JOIN converted_event ce ON ce.account_id = a.id
LEFT JOIN dealer_fallback df ON df.account_id = a.id;

-- ══════════════════════════════════════════════════════════════════════════════
-- VALIDATION
--
-- 1. Row count must equal crm_accounts exactly (1:1 view, no fan-out):
--    SELECT (SELECT count(*) FROM crm_accounts) AS accounts,
--           (SELECT count(*) FROM v_prospect_reporting_overview) AS view_rows;
--
-- 2. Spot-check last_contact_at against useAccountLastVisited's logic for
--    a handful of converted (account_type='dealer') accounts that have a
--    linked dealer with check-ins.
--
-- 3. contact_health distribution should look reasonable, not e.g. 100%
--    'no_contact':
--    SELECT contact_health, count(*) FROM v_prospect_reporting_overview
--    GROUP BY 1 ORDER BY 2 DESC;
-- ══════════════════════════════════════════════════════════════════════════════
