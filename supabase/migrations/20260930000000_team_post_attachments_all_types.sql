-- Team Updates attachments were image/PDF-only at 10MB - widen this to cover
-- common document, video and image types, and raise the cap so a short
-- video clip actually fits. The original bucket insert used ON CONFLICT DO
-- NOTHING, so this has to be an explicit UPDATE to actually take effect.

UPDATE storage.buckets
SET
  file_size_limit = 104857600, -- 100MB, up from 10MB - mainly for video
  allowed_mime_types = ARRAY[
    -- images
    'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml',
    -- documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/csv',
    'text/plain',
    'application/rtf',
    'application/zip',
    'application/x-zip-compressed',
    -- video
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'video/x-msvideo'
  ]
WHERE id = 'team-post-attachments';
