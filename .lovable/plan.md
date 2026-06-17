## SOP Templates for Task Boards

### What you get
- When creating a new board, a **Template** dropdown: `Blank board` (current default), `SOP - Product New Into` (built-in), plus any custom SOPs you've saved.
- Picking an SOP seeds the board with a single group **"SOP Checklist"** containing every step as a task.
- SOP tasks render as a large **checkbox row** instead of the usual status pill. Checking it marks done and the row disappears from view (data is kept — you can show "Completed (n)" to restore).
- New **Manage SOP Templates** dialog (gear menu on the boards page): create / rename / delete your own templates, add/remove/reorder steps.

### Built-in starter
- **SOP - Product New Into** with placeholder steps (Receive product info, Create SKU in Acctivate, Add to website, Photograph, Set price tiers, Announce to reps, etc.). You can edit it after.

### Data model
New tables:
- `sop_templates` — `id, name, description, created_by (nullable), is_builtin, created_at, updated_at`
- `sop_template_items` — `id, template_id, title, position, created_at`

`manager_tasks` gets one new column: `is_sop boolean default false` so the UI knows to render the checkbox style and to hide when `status='done'`.

RLS: users see built-in templates + their own; only owner can edit/delete their own; built-ins read-only.

### UI changes (all in `src/components/TaskBoardsView.tsx`)
- New board dialog → add Template `<Select>`.
- `saveBoard()` → if template chosen, fetch its items and insert `manager_tasks` rows with `is_sop=true` into a seeded "SOP Checklist" group, instead of the default 4-column groups.
- Task row renderer → if `is_sop`, swap status pill for a `<Checkbox>`; hide row when `status='done'` (small "Show completed" toggle at top of the group).
- Add `Manage templates` button + dialog with list, add/edit/delete, item editor.

### Out of scope
- No changes to list view, my tasks, or reporting.
- No notifications/emails on SOP completion.

I'll ship the migration first (needs your approval), then the UI in one pass.
