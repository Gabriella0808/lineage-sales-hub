-- Create the target table for the Skyvia direct Acctivate InvoiceDetail sync.
--
-- Skyvia pulls dbo.InvoiceDetail (single table, no JOIN) via LineageVM and
-- writes into this table.  InvoiceDate / CustomerID / SalespersonID are joined
-- from portal_acctivate_invoices at query time; SalesCategory is joined from
-- acctivate_product_master at query time.  Both joins happen in
-- v_portal_invoice_line_facts (view layer), not here.
--
-- Skyvia source fields: InvoiceNumber, ProductID, Description, OrderNumber,
--                       QtyInvoiced, LineDiscountPct, Price
-- Skyvia target:        public.acctivate_2026_invoice_line_facts (this table)
-- Skyvia load mode:     Clear and insert (full replace on each run)

CREATE TABLE IF NOT EXISTS public.acctivate_2026_invoice_line_facts (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_number    text,
  product_id        text,
  description       text,
  order_number      text,
  qty_invoiced      numeric,
  line_discount_pct numeric,
  price             numeric,
  synced_at         timestamptz DEFAULT now()
);

CREATE INDEX ON public.acctivate_2026_invoice_line_facts (invoice_number);
CREATE INDEX ON public.acctivate_2026_invoice_line_facts (product_id);

GRANT SELECT ON public.acctivate_2026_invoice_line_facts
  TO authenticated, anon, service_role;
