ALTER TABLE public.dealer_check_ins
  DROP CONSTRAINT dealer_check_ins_dealer_id_fkey,
  ADD CONSTRAINT dealer_check_ins_dealer_id_fkey
    FOREIGN KEY (dealer_id) REFERENCES public.dealers(id) ON DELETE RESTRICT;