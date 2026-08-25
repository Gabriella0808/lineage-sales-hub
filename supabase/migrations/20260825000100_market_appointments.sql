
-- ══════════════════════════════════════════════════════════════════════════════
-- market_appointments
-- Trade show appointment lifecycle: Target → Confirmed → Showed / No-Show
-- Used by the High Point Market Appointments module inside Capture Leads.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE public.market_appointments (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID        REFERENCES public.trade_show_markets(id) ON DELETE SET NULL,
  phase             TEXT        NOT NULL DEFAULT 'Premarket'
                                CHECK (phase IN ('Premarket', 'Market')),
  rep_id            UUID        NOT NULL REFERENCES public.sales_reps(id) ON DELETE CASCADE,
  dealer            TEXT,
  buyer_name        TEXT,
  buyer_email       TEXT,
  appointment_day   DATE,
  appointment_time  TIME,
  notes             TEXT,
  status            TEXT        NOT NULL DEFAULT 'Target'
                                CHECK (status IN ('Target', 'Confirmed', 'Showed', 'No-Show')),
  created_by        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.market_appointments ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_market_appointments_updated_at
  BEFORE UPDATE ON public.market_appointments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_market_appts_event   ON public.market_appointments(event_id);
CREATE INDEX idx_market_appts_rep     ON public.market_appointments(rep_id);
CREATE INDEX idx_market_appts_status  ON public.market_appointments(status);
CREATE INDEX idx_market_appts_day     ON public.market_appointments(appointment_day);

-- ── RLS policies ──────────────────────────────────────────────────────────────

-- Admins: full access
CREATE POLICY "Admins manage all market appointments"
  ON public.market_appointments FOR ALL TO authenticated
  USING    (public.is_admin())
  WITH CHECK (public.is_admin());

-- Managers: read / write only for reps assigned to them
CREATE POLICY "Managers read team market appointments"
  ON public.market_appointments FOR SELECT TO authenticated
  USING (
    public.current_manager_id() IS NOT NULL
    AND rep_id IN (SELECT public.current_manager_rep_ids())
  );

CREATE POLICY "Managers insert market appointments"
  ON public.market_appointments FOR INSERT TO authenticated
  WITH CHECK (
    public.current_manager_id() IS NOT NULL
    AND rep_id IN (SELECT public.current_manager_rep_ids())
  );

CREATE POLICY "Managers update market appointments"
  ON public.market_appointments FOR UPDATE TO authenticated
  USING    (public.current_manager_id() IS NOT NULL AND rep_id IN (SELECT public.current_manager_rep_ids()))
  WITH CHECK (public.current_manager_id() IS NOT NULL AND rep_id IN (SELECT public.current_manager_rep_ids()));

CREATE POLICY "Managers delete market appointments"
  ON public.market_appointments FOR DELETE TO authenticated
  USING (
    public.current_manager_id() IS NOT NULL
    AND rep_id IN (SELECT public.current_manager_rep_ids())
  );

-- Reps: own appointments only
CREATE POLICY "Reps read own market appointments"
  ON public.market_appointments FOR SELECT TO authenticated
  USING (rep_id = public.current_rep_id());

CREATE POLICY "Reps insert own market appointments"
  ON public.market_appointments FOR INSERT TO authenticated
  WITH CHECK (rep_id = public.current_rep_id());

CREATE POLICY "Reps update own market appointments"
  ON public.market_appointments FOR UPDATE TO authenticated
  USING    (rep_id = public.current_rep_id())
  WITH CHECK (rep_id = public.current_rep_id());

CREATE POLICY "Reps delete own market appointments"
  ON public.market_appointments FOR DELETE TO authenticated
  USING (rep_id = public.current_rep_id());

-- ── Allow reps to read trade_show_markets (needed for the event selector) ────

CREATE POLICY "Reps read trade show markets"
  ON public.trade_show_markets FOR SELECT TO authenticated
  USING (public.current_rep_id() IS NOT NULL);
