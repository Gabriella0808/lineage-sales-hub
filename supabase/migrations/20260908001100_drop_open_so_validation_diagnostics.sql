-- Drop all temporary diagnostic functions created for pre-deployment
-- validation of the Open Sales Orders backlog feature (20260908000200
-- through 20260908001000). None of these were ever used by the app —
-- v_rep_open_sales_order_lines and get_open_sales_order_lines are the only
-- production objects and are untouched by this cleanup.

DROP FUNCTION IF EXISTS public._diag_order_status_distribution();
DROP FUNCTION IF EXISTS public._diag_orders_overview();
DROP FUNCTION IF EXISTS public._diag_qty_fields(int);
DROP FUNCTION IF EXISTS public._diag_discount_check(int);
DROP FUNCTION IF EXISTS public._diag_charge_lines(int);
DROP FUNCTION IF EXISTS public._diag_rep_reconciliation(text[]);
DROP FUNCTION IF EXISTS public._diag_scenario_orders();
DROP FUNCTION IF EXISTS public._diag_status_decoder();
DROP FUNCTION IF EXISTS public._diag_qty_survey();
DROP FUNCTION IF EXISTS public._diag_completed_sample(int);
DROP FUNCTION IF EXISTS public._diag_backordered_sample(int);
DROP FUNCTION IF EXISTS public._diag_charge_sku_check();
DROP FUNCTION IF EXISTS public._diag_sales_category_survey();
DROP FUNCTION IF EXISTS public._diag_rep_reconciliation_v2(text[]);
DROP FUNCTION IF EXISTS public._diag_order_count_check(text[]);
DROP FUNCTION IF EXISTS public._diag_brand_filter_check(text);
DROP FUNCTION IF EXISTS public._diag_cancelled_orders(int);
DROP FUNCTION IF EXISTS public._diag_completed_orders(int);
DROP FUNCTION IF EXISTS public._diag_partial_orders(int);
DROP FUNCTION IF EXISTS public._diag_order_line_dup_check(text);
DROP FUNCTION IF EXISTS public._diag_raw_order_detail_rows(text);

NOTIFY pgrst, 'reload schema';
