-- Undoes 20261008000000. That migration made Brian Beane pass the Dealer/
-- Rep Reporting access check by giving him a real public.managers row -
-- but that table IS the "Sales Manager directory" (ManagersPage.tsx shows
-- every row in it as a real company manager, with a territories/reps/
-- dealers/YTD card). Per explicit correction: he is a portal user with
-- manager-level VIEW permissions only, not a real company sales manager,
-- and the two must be kept distinct. The real fix (next migration) changes
-- the reporting RPCs' access check instead, so a portal role alone is
-- enough - no public.managers row required.
DELETE FROM public.user_managers WHERE user_id = 'a7622d4b-e7a2-47bc-bbd9-d5ba7bd4cca8';
DELETE FROM public.managers WHERE email = 'brian.beane@villagematrix.com';
