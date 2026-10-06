-- 2 of market_appointments' 6 appointments on the bare "Jordan Shindell"
-- rep record (no Acctivate match, acctivate_id null) resolve with confidence
-- by matching their dealer name against public.dealers' already-correct
-- Shindell split (20261006010000):
--   Morris Furniture Co  -> matches "Morris Furniture"/"Morris Furniture-
--                           Corporate Offices" (OH) -> Shindell - PA/OH
--   Johnny Janosik        -> matches "Johnny Janosik"/"JOHNNY JANOSIK, INC."
--                           (DE / Mid Atlantic) -> Shindell- Beach
-- Per explicit instruction: swap the rep, never delete the appointment.
-- The remaining 4 appointments on this bare record (Wayside Furniture, John
-- V Schultz Company, Levin Furniture, Furniture Fair OH) have no confident
-- match - 2 have no matching dealer in the system at all, 2 match multiple
-- dealers under different reps - left untouched on the bare record rather
-- than guess.

UPDATE public.market_appointments
SET rep_id = '9d218273-c52d-4103-8695-29b756d3f120' -- Shindell - PA/OH
WHERE id = '57c72511-6041-46fc-8b9b-87c9556e03d2'; -- Morris Furniture Co

UPDATE public.market_appointments
SET rep_id = '96ec9def-176e-4d5e-9a0a-2823d59bd9f4' -- Shindell- Beach
WHERE id = 'c4554f06-7c7c-4adc-9785-6faeb736a254'; -- Johnny Janosik
