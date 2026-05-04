-- Drop the legacy pending_ssh column from the tasks table.
-- It was used to pause autonomous tasks while the user confirmed an
-- SSH command — that whole code path has been removed along with the
-- /api/task/[id]/resume route.
alter table public.tasks
  drop column if exists pending_ssh;

-- Any tasks left in 'awaiting_confirmation' state can never be resumed
-- (the resume route is gone). Mark them failed so the UI handles them
-- alongside other failed tasks.
update public.tasks
   set status = 'failed',
       error  = 'SSH confirmation system was removed; task cannot resume',
       updated_at = now()
 where status = 'awaiting_confirmation';

notify pgrst, 'reload schema';
