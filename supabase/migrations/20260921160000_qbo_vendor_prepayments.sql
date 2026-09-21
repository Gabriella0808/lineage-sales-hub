-- Prepaid Inventory (Inventory page) is switching from an Acctivate
-- PO-derived figure to the real QuickBooks Online source of truth: the
-- "Vendor Prepayments" account (QBO account id 1203, Other Current Asset).
-- Confirmed live via QBO's Account entity and GeneralLedger report:
-- current balance $400,922.40, backed by 684 real transactions.
--
-- Two tables: a one-row-per-account summary (the headline figure) and a
-- transaction-level detail table (the drilldown), both populated by a new
-- sync-qbo-vendor-prepayments edge function mirroring sync-qbo-pnl's
-- token-refresh/logging pattern.

CREATE TABLE public.portal_qbo_vendor_prepayments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qbo_account_id    text NOT NULL UNIQUE,
  qbo_account_name  text NOT NULL,
  current_balance   numeric NOT NULL,
  synced_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.portal_qbo_vendor_prepayment_lines (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qbo_account_id    text NOT NULL,
  qbo_txn_id        text,
  transaction_date  date NOT NULL,
  transaction_type  text,
  doc_num           text,
  vendor_name       text,
  memo              text,
  amount            numeric NOT NULL,
  running_balance   numeric,
  synced_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (qbo_account_id, qbo_txn_id, transaction_date, amount)
);

CREATE INDEX idx_qbo_vendor_prepayment_lines_date ON public.portal_qbo_vendor_prepayment_lines (transaction_date DESC);

ALTER TABLE public.portal_qbo_vendor_prepayments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_qbo_vendor_prepayment_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read vendor prepayments summary"
  ON public.portal_qbo_vendor_prepayments FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated can read vendor prepayment lines"
  ON public.portal_qbo_vendor_prepayment_lines FOR SELECT
  TO authenticated USING (true);
