-- "Report Issue" feature: private storage bucket for optional screenshot
-- attachments. Mirrors the task-attachments bucket's RLS pattern:
-- authenticated users can upload/read their own objects, admins can read
-- everything. No new DB table is created here (portal_issue_reports is
-- intentionally out of scope for this pass) — objects are looked up purely
-- by storage path, which the client sends to the report-portal-issue edge
-- function so it can mint a short-lived signed URL for the email.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'issue-report-attachments',
  'issue-report-attachments',
  false,
  5242880,  -- 5 MB, matches the frontend's client-side cap
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users can upload objects they own (path convention enforced
-- client-side as `${user.id}/${uuid}-${filename}`; RLS itself only checks
-- the `owner` column, which storage sets from the caller's JWT on upload).
CREATE POLICY "issue-report-attachments owner insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'issue-report-attachments' AND owner = auth.uid());

-- A user can read their own uploads; admins can read all (e.g. to
-- investigate a report), matching the task-attachments admin-visibility
-- intent without needing a join table here.
CREATE POLICY "issue-report-attachments scoped read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'issue-report-attachments'
  AND (owner = auth.uid() OR public.is_admin())
);

-- Owner can delete their own upload (e.g. picked the wrong file before
-- submitting). No update policy — attachments are write-once.
CREATE POLICY "issue-report-attachments owner delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'issue-report-attachments' AND owner = auth.uid());
