CREATE POLICY "Creators can delete their own notes"
ON public.crm_account_notes
FOR DELETE
TO authenticated
USING (created_by = auth.uid());