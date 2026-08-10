-- Replace en-dashes in built-in template names and task titles with regular hyphens.
-- The previous migration (000300) was applied before the dash fix, so the DB still
-- holds the old strings. This patch corrects the live data.

UPDATE public.board_templates
SET name = REPLACE(name, '–', '-')
WHERE is_builtin = true;

UPDATE public.board_template_tasks
SET title = REPLACE(title, '–', '-')
WHERE template_id IN (SELECT id FROM public.board_templates WHERE is_builtin = true);
