-- Raise the Team Updates attachment cap from 100MB to 500MB, for longer
-- video clips. Types are unchanged (all-types migration).

UPDATE storage.buckets
SET file_size_limit = 524288000 -- 500MB
WHERE id = 'team-post-attachments';
