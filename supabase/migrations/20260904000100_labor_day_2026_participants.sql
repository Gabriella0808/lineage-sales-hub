-- ══════════════════════════════════════════════════════════════════════════════
-- Labor Day Promo (LD26) participant roster.
--
-- Backs the Labor Day Promo page's rep/dealer table so every participating
-- dealer and rep shows up even with $0 LD26 bookings, instead of only the
-- ones that happen to have matching sales.
--
-- Naming: promo_slug = 'ld26' is the portal's internal identifier for this
-- roster/config. It is intentionally distinct from discount_code = 'LD26',
-- which is the Acctivate OrderDetail._DiscType value used to pull actual
-- bookings from acctivate/v_portal_dealer_rep_reporting_lines. The roster
-- and the sales data are joined at query time (customer_id normalized match)
-- — this migration does not touch the Acctivate sync or discount_code.
--
-- Seed: 81 participants / 11 reps, loaded from
-- labor_day_2026_participants_clean.csv (promo_slug column in that file was
-- 'labor-day-2026' — overridden to 'ld26' here per the corrected naming).
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.labor_day_2026_participants (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_slug        text        NOT NULL DEFAULT 'ld26',
  cust_id           text        NOT NULL,
  company_name      text,
  dealer_name       text,
  territory         text,
  sales_manager     text,
  salesperson_id    text        NOT NULL,
  salesperson_name  text,
  active            boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT labor_day_2026_participants_unique UNIQUE (promo_slug, cust_id, salesperson_id)
);

ALTER TABLE public.labor_day_2026_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read ld26 participants"
  ON public.labor_day_2026_participants FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated write ld26 participants"
  ON public.labor_day_2026_participants FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

GRANT SELECT ON public.labor_day_2026_participants TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.labor_day_2026_participants TO authenticated;
GRANT ALL ON public.labor_day_2026_participants TO service_role;

-- ─── Seed: 81 LD26 participants ───────────────────────────────────────────────

INSERT INTO public.labor_day_2026_participants
  (promo_slug, cust_id, company_name, dealer_name, territory, sales_manager, salesperson_id, salesperson_name, active)
VALUES
  ('ld26', 'China Towne Furniture & Mattress', 'China Towne Furniture & Mattress', 'China Towne Furniture & Mattress', 'NY Upstate', 'Mateo', 'Avell', 'Peter Avella', true),
  ('ld26', 'Cozy Living Furniture', 'Cozy Living Furniture', 'Cozy Living Furniture', 'NY Metro', 'Mateo', 'Avell', 'Peter Avella', true),
  ('ld26', 'Flemington Department Store, Inc', 'Flemington Department Store, Inc', 'Flemington Department Store, Inc', 'NY Metro', 'Mateo', 'Avell', 'Peter Avella', true),
  ('ld26', 'LaCasa & Design Inc', 'LaCasa & Design Inc', 'LaCasa & Design Inc', 'NY Metro', 'Mateo', 'Avell', 'Peter Avella', true),
  ('ld26', 'Stanley''s Bedding & Furniture Co., Inc', 'Stanley''s Bedding & Furniture Co., Inc', 'Stanley''s Bedding & Furniture Co., Inc', 'NY Metro', 'Mateo', 'Avell', 'Peter Avella', true),
  ('ld26', 'Suburban Furniture', 'Suburban Furniture', 'Suburban Furniture', 'NY Metro', 'Mateo', 'Avell', 'Peter Avella', true),
  ('ld26', 'The Home Zone', 'At The Home Zone, LLC', 'The Home Zone', 'NY Upstate', 'Mateo', 'Avell', 'Peter Avella', true),
  ('ld26', 'Arrington''s Home Furnishings, Inc.', 'Arrington''s Home Furnishings, Inc.', 'Arrington''s Home Furnishings, Inc.', 'Virginia', 'Mateo', 'BradR', 'Robertson', true),
  ('ld26', 'B&H Market on the Dan', 'B&H Furniture', 'B&H Market on the Dan', 'Virginia', 'Mateo', 'BradR', 'Robertson', true),
  ('ld26', 'Belfort Furniture Inc', 'Belfort Furniture', 'Belfort Furniture Inc', 'Virginia', 'Mateo', 'BradR', 'Robertson', true),
  ('ld26', 'EspritDecorInc', 'Esprit Decor, Inc.', 'EspritDecorInc', 'Virginia', 'Mateo', 'BradR', 'Robertson', true),
  ('ld26', 'Furniture and Floors, Inc', 'Furniture and Floors, Inc', 'Furniture and Floors, Inc', 'Virginia', 'Mateo', 'BradR', 'Robertson', true),
  ('ld26', 'Rock''s Carolina Furniture', 'Rock''s Carolina Furniture', 'Rock''s Carolina Furniture', 'Virginia', 'Mateo', 'BradR', 'Robertson', true),
  ('ld26', 'Vance''s Furniture & Mattresses', 'Vance''s Furniture & Mattresses', 'Vance''s Furniture & Mattresses', 'Virginia', 'Mateo', 'BradR', 'Robertson', true),
  ('ld26', 'ATLANTICFINE', 'ATLANTIC FINE FURNITURE INC', 'ATLANTICFINE', 'FL SE', 'Will', 'Brent', 'Brent Holbrook', true),
  ('ld26', 'COASTALFURN', 'Coastal Furniture & Accessories', 'COASTALFURN', 'FL SW', 'Will', 'Brent', 'Brent Holbrook', true),
  ('ld26', 'COASTALINT', 'Coastal Interior', 'COASTALINT', 'FL SE', 'Will', 'Brent', 'Brent Holbrook', true),
  ('ld26', 'Elm & Co Furniture LLC', 'Elm & Co Furniture LLC', 'Elm & Co Furniture LLC', 'FL SW', 'Will', 'Brent', 'Brent Holbrook', true),
  ('ld26', 'FAMFURNAMERI', 'Family Furniture of America (Stuart)', 'FAMFURNAMERI', 'FL SE', 'Will', 'Brent', 'Brent Holbrook', true),
  ('ld26', 'FOS-FACTORYO', 'Fos Factory Outlet Stores', 'FOS-FACTORYO', 'FL SW', 'Will', 'Brent', 'Brent Holbrook', true),
  ('ld26', 'More Space Place - Sarasota', 'Home Space Solutions LLC dba More Space', 'More Space Place - Sarasota', 'FL SW', 'Will', 'Brent', 'Brent Holbrook', true),
  ('ld26', 'PAMARO-*****', 'PAMARO SHOP', 'PAMARO-*****', 'FL SW', 'Will', 'Brent', 'Brent Holbrook', true),
  ('ld26', 'ROYALFURNKEY', 'ROYAL FURNITURE', 'ROYALFURNKEY', 'FL SE', 'Will', 'Brent', 'Brent Holbrook', true),
  ('ld26', 'Shoreside Furnishings', 'Shoreside Furnishings', 'Shoreside Furnishings', 'FL SW', 'Will', 'Brent', 'Brent Holbrook', true),
  ('ld26', 'SUNSHINE-*C', 'SUNSHINE FURNITURE PATIO', 'SUNSHINE-*C', 'FL SE', 'Will', 'Brent', 'Brent Holbrook', true),
  ('ld26', 'Surroundings', 'Surroundings Inc', 'Surroundings', 'FL SW', 'Will', 'Brent', 'Brent Holbrook', true),
  ('ld26', 'FURNITUREWAR', 'FWDG', 'FURNITUREWAR', 'South Carolina', 'Mateo', 'DE', 'Dave Ervin', true),
  ('ld26', 'HOMEACCENTS', 'Home Accents II', 'HOMEACCENTS', 'South Carolina', 'Mateo', 'DE', 'Dave Ervin', true),
  ('ld26', 'J&K HOME FUR', 'COASTAL CAROLINA FURNITURE LLC.', 'J&K HOME FUR', 'South Carolina', 'Mateo', 'DE', 'Dave Ervin', true),
  ('ld26', 'JCL of Hilton Head dba Hilton Head Furnit', 'JCL of Hilton Head', 'JCL of Hilton Head dba Hilton Head Furnit', 'South Carolina', 'Mateo', 'DE', 'Dave Ervin', true),
  ('ld26', 'Jernigan Furniture', 'Jernigan Furniture', 'Jernigan Furniture', 'North Carolina', 'Mateo', 'DE', 'Dave Ervin', true),
  ('ld26', 'SEASIDEHOM', 'SEASIDE FURNITURE GALLERY', 'SEASIDEHOM', 'South Carolina', 'Mateo', 'DE', 'Dave Ervin', true),
  ('ld26', 'SOUNDFURN', 'SOUND FURN & APPL', 'SOUNDFURN', 'North Carolina', 'Mateo', 'DE', 'Dave Ervin', true),
  ('ld26', 'TDF Furniture', 'TDF Furniture', 'TDF Furniture', 'North Carolina', 'Mateo', 'DE', 'Dave Ervin', true),
  ('ld26', 'WATERWAYFURN', 'WATERWAY FURNITURE', 'WATERWAYFURN', 'South Carolina', 'Mateo', 'DE', 'Dave Ervin', true),
  ('ld26', 'GARDENCITYFU', 'Garden City Furniture Co. Inc.', 'GARDENCITYFU', 'South Carolina', 'Mateo', 'DE', 'Dave Ervin', true),
  ('ld26', 'MANTEOFURN', 'MANTEO FURNITURE CO INC', 'MANTEOFURN', 'North Carolina', 'Mateo', 'DE', 'Dave Ervin', true),
  ('ld26', 'White Barn Marketplace', 'White Barn Marketplace', 'White Barn Marketplace', 'North Carolina', 'Mateo', 'DE', 'Dave Ervin', true),
  ('ld26', 'WICKER&MORE', 'WICKER AND MORE HOME FURNISHINGS', 'WICKER&MORE', 'North Carolina', 'Mateo', 'DE', 'Dave Ervin', true),
  ('ld26', 'Furniture Mart', 'Furniture Mart', 'Furniture Mart', 'FL North', 'Will', 'MD', 'Mike Durham', true),
  ('ld26', 'KENTFURNITUR', 'KENT FURNITURE, INC.', 'KENTFURNITUR', 'FL North', 'Will', 'MD', 'Mike Durham', true),
  ('ld26', 'CoastFurnitureInc', 'Coast Furniture Inc', 'CoastFurnitureInc', 'Panhandle', 'Will', 'Quill', 'Bruce Quillen', true),
  ('ld26', 'Coco Island Furniture', 'Coco Island Furniture', 'Coco Island Furniture', 'Alabama', 'Will', 'Quill', 'Bruce Quillen', true),
  ('ld26', 'DECORDESIGN', 'Decor Design Center Inc', 'DECORDESIGN', 'Panhandle', 'Will', 'Quill', 'Bruce Quillen', true),
  ('ld26', 'FACTORYMATT', 'Factory Direct Furniture LLC', 'FACTORYMATT', 'Panhandle', 'Will', 'Quill', 'Bruce Quillen', true),
  ('ld26', 'KINGSFURNITU', 'KING''S FURNITURE & MATTRESS CO., INC.', 'KINGSFURNITU', 'Panhandle', 'Will', 'Quill', 'Bruce Quillen', true),
  ('ld26', 'Liddon Furniture', 'Liddon Furniture', 'Liddon Furniture', 'Alabama', 'Will', 'Quill', 'Bruce Quillen', true),
  ('ld26', 'Risa''s Interiors', 'Risa''s Interiors', 'Risa''s Interiors', 'Panhandle', 'Will', 'Quill', 'Bruce Quillen', true),
  ('ld26', 'Riviera Furniture', 'Riviera Furniture', 'Riviera Furniture', 'Panhandle', 'Will', 'Quill', 'Bruce Quillen', true),
  ('ld26', 'Turner''s Distribution Center Inc', 'Turner''s Distribution Center Inc', 'Turner''s Distribution Center Inc', 'Georgia', 'Will', 'Quill', 'Bruce Quillen', true),
  ('ld26', 'Weinberger''s Furniture', 'Weinberger''s Furniture', 'Weinberger''s Furniture', 'Georgia', 'Will', 'Quill', 'Bruce Quillen', true),
  ('ld26', 'BESCHEFURN', 'Besche Furnitre Inc.', 'BESCHEFURN', 'Mid Atlantic', 'Will', 'Shin', 'Jordan Shindell (MidAtlantic)', true),
  ('ld26', 'BETHANYRE***', 'Trident Furnishings Inc.', 'BETHANYRE***', 'Mid Atlantic', 'Will', 'Shin', 'Jordan Shindell (MidAtlantic)', true),
  ('ld26', 'CASUALDESIGN', 'Casual Designs Furniture', 'CASUALDESIGN', 'Mid Atlantic', 'Will', 'Shin', 'Jordan Shindell (MidAtlantic)', true),
  ('ld26', 'DMARIE', 'D. Marie', 'DMARIE', 'Mid Atlantic', 'Will', 'Shin', 'Jordan Shindell (MidAtlantic)', true),
  ('ld26', 'Fenwick Furnishings', 'Fenwick Furnishings', 'Fenwick Furnishings', 'Mid Atlantic', 'Will', 'Shin', 'Jordan Shindell (MidAtlantic)', true),
  ('ld26', 'FURNMORE', 'Furniture & More Galleries', 'FURNMORE', 'Mid Atlantic', 'Will', 'Shin', 'Jordan Shindell (MidAtlantic)', true),
  ('ld26', 'JOHNNYJANOSI', 'JOHNNY JANOSIK, INC.', 'JOHNNYJANOSI', 'Mid Atlantic', 'Will', 'Shin', 'Jordan Shindell (MidAtlantic)', true),
  ('ld26', 'OSBORNESFURN', 'OSBORNE''S FURNITURE INC.', 'OSBORNESFURN', 'Mid Atlantic', 'Will', 'Shin', 'Jordan Shindell (MidAtlantic)', true),
  ('ld26', 'OSKARHUBER', 'OSKAR HUBER FURNITURE & DESIGN', 'OSKARHUBER', 'Mid Atlantic', 'Will', 'Shin', 'Jordan Shindell (MidAtlantic)', true),
  ('ld26', 'PLATTSHOMEF', 'PLATT''S HOME FURNISHINGS', 'PLATTSHOMEF', 'Mid Atlantic', 'Will', 'Shin', 'Jordan Shindell (MidAtlantic)', true),
  ('ld26', 'SEASIDEFURNI', 'SEASIDE FURNITURE', 'SEASIDEFURNI', 'Mid Atlantic', 'Will', 'Shin', 'Jordan Shindell (MidAtlantic)', true),
  ('ld26', 'Surfside Casual Furniture', 'Surfside Casual', 'Surfside Casual Furniture', 'Mid Atlantic', 'Will', 'Shin', 'Jordan Shindell (MidAtlantic)', true),
  ('ld26', 'Dewey Furniture & Carpeting, Inc', 'Dewey Furniture & Carpeting, Inc', 'Dewey Furniture & Carpeting, Inc', 'Ohio', 'Will', 'Shin2', 'Jordan Shindell (OH/PA)', true),
  ('ld26', 'Earla''s Furniture & Design Center', 'Earla''s Furniture & Design Center', 'Earla''s Furniture & Design Center', 'Ohio', 'Will', 'Shin2', 'Jordan Shindell (OH/PA)', true),
  ('ld26', 'Rileys Furniture', 'Rileys Furniture Mattress', 'Rileys Furniture', 'Ohio', 'Will', 'Shin2', 'Jordan Shindell (OH/PA)', true),
  ('ld26', 'Aspire Home', 'Aspire Home', 'Aspire Home', 'New England', 'House', 'Skip', 'Skip Camillo', true),
  ('ld26', 'BARBOSFURN', 'Barbo''s Furniture, INC.', 'BARBOSFURN', 'New England', 'House', 'Skip', 'Skip Camillo', true),
  ('ld26', 'Ben''s Furniture Company', 'Ben''s Furniture Company', 'Ben''s Furniture Company', 'New England', 'House', 'Skip', 'Skip Camillo', true),
  ('ld26', 'Comfort Sleep Systems', 'Comfort Sleep Systems', 'Comfort Sleep Systems', 'New England', 'House', 'Skip', 'Skip Camillo', true),
  ('ld26', 'Frantz Furniture and Bedding', 'Frantz Furniture and Bedding', 'Frantz Furniture and Bedding', 'New England', 'House', 'Skip', 'Skip Camillo', true),
  ('ld26', 'Miceli''s Furniture', 'Miceli''s Furniture', 'Miceli''s Furniture', 'New England', 'House', 'Skip', 'Skip Camillo', true),
  ('ld26', 'Worley Beds Factory Outlet', 'Worley Beds Factory Outlet', 'Worley Beds Factory Outlet', 'New England', 'House', 'Skip', 'Skip Camillo', true),
  ('ld26', 'McLaughlin''s Home Furnishings', 'McLaughlin''s Home Furnishing Designs', 'McLaughlin''s Home Furnishings', 'Michigan', 'Mateo', 'Smith', 'Andrew Smith', true),
  ('ld26', 'SCHROEDER', 'SCHROEDER FURNITURE', 'SCHROEDER', 'Michigan', 'Mateo', 'Smith', 'Andrew Smith', true),
  ('ld26', 'Talsma Furniture', 'Talsma Furniture', 'Talsma Furniture', 'Michigan', 'Mateo', 'Smith', 'Andrew Smith', true),
  ('ld26', 'Vermeulen Furniture', 'Vermeulen Furniture', 'Vermeulen Furniture', 'Michigan', 'Mateo', 'Smith', 'Andrew Smith', true),
  ('ld26', 'Gorrod Gallery', 'Gorrod Gallery', 'Gorrod Gallery', 'Texas North', 'Will', 'Stew', 'Stewart Hunt', true),
  ('ld26', 'MYCOASTALHOM', 'MY COASTAL HOME', 'MYCOASTALHOM', 'Texas South', 'Will', 'Stew', 'Stewart Hunt', true),
  ('ld26', 'One Swanky Shop, Inc.', 'One Swanky Shop, Inc.', 'One Swanky Shop, Inc.', 'Texas South', 'Will', 'Stew', 'Stewart Hunt', true),
  ('ld26', 'Zavala''s Furniture & Mattress', 'Zavala''s Furniture & Mattress', 'Zavala''s Furniture & Mattress', 'Texas South', 'Will', 'Stew', 'Stewart Hunt', true)
ON CONFLICT (promo_slug, cust_id, salesperson_id) DO UPDATE SET
  company_name     = EXCLUDED.company_name,
  dealer_name       = EXCLUDED.dealer_name,
  territory         = EXCLUDED.territory,
  sales_manager     = EXCLUDED.sales_manager,
  salesperson_name  = EXCLUDED.salesperson_name,
  active            = EXCLUDED.active,
  updated_at        = now();

NOTIFY pgrst, 'reload schema';

-- ══════════════════════════════════════════════════════════════════════════════
-- VALIDATION
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Participant count (expect 81 participants / 11 reps):
-- select count(*) as participants, count(distinct cust_id) as dealers,
--        count(distinct salesperson_id) as reps
-- from public.labor_day_2026_participants
-- where promo_slug = 'ld26' and active = true;
