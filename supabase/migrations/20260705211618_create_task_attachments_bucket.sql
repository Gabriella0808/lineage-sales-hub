-- Create the task-attachments storage bucket (policies already exist from prior migration)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'task-attachments',
  'task-attachments',
  false,
  52428800,  -- 50 MB
  NULL
)
ON CONFLICT (id) DO NOTHING;
