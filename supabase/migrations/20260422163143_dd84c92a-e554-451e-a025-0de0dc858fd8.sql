
-- Cache geocoded coordinates on dealers
ALTER TABLE public.dealers
ADD COLUMN IF NOT EXISTS lat double precision,
ADD COLUMN IF NOT EXISTS lng double precision;

-- Allow managers/admins to update lat/lng (RLS already restricts SELECT scope)
DROP POLICY IF EXISTS "Admins update dealers" ON public.dealers;
CREATE POLICY "Admins update dealers"
ON public.dealers
FOR UPDATE
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Managers update team dealers" ON public.dealers;
CREATE POLICY "Managers update team dealers"
ON public.dealers
FOR UPDATE
TO authenticated
USING (rep_id IN (SELECT current_manager_rep_ids()))
WITH CHECK (rep_id IN (SELECT current_manager_rep_ids()));

-- Check-ins table
CREATE TABLE IF NOT EXISTS public.dealer_check_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id uuid NOT NULL REFERENCES public.dealers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  visit_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  outcome text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dealer_check_ins_dealer ON public.dealer_check_ins (dealer_id);
CREATE INDEX IF NOT EXISTS idx_dealer_check_ins_user ON public.dealer_check_ins (user_id);
CREATE INDEX IF NOT EXISTS idx_dealer_check_ins_date ON public.dealer_check_ins (visit_date DESC);

ALTER TABLE public.dealer_check_ins ENABLE ROW LEVEL SECURITY;

-- Admins: all access
CREATE POLICY "Admins manage all check-ins"
ON public.dealer_check_ins
FOR ALL
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

-- Managers: full access to their team's dealers' check-ins + their own
CREATE POLICY "Managers view team check-ins"
ON public.dealer_check_ins
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR dealer_id IN (
    SELECT d.id FROM public.dealers d
    WHERE d.rep_id IN (SELECT current_manager_rep_ids())
  )
);

CREATE POLICY "Managers insert check-ins"
ON public.dealer_check_ins
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (
    is_admin()
    OR dealer_id IN (
      SELECT d.id FROM public.dealers d
      WHERE d.rep_id IN (SELECT current_manager_rep_ids())
    )
  )
);

CREATE POLICY "Managers update own check-ins"
ON public.dealer_check_ins
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Managers delete own check-ins"
ON public.dealer_check_ins
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- Reps: read-only for their own dealers
CREATE POLICY "Reps view own dealer check-ins"
ON public.dealer_check_ins
FOR SELECT
TO authenticated
USING (
  dealer_id IN (
    SELECT d.id FROM public.dealers d
    WHERE d.rep_id = current_rep_id()
  )
);

-- Trigger: keep updated_at fresh
CREATE TRIGGER trg_dealer_check_ins_updated_at
BEFORE UPDATE ON public.dealer_check_ins
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
