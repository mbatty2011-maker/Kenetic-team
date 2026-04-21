-- Tasks table for the agentic task queue
CREATE TABLE IF NOT EXISTS public.tasks (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_key     TEXT        NOT NULL,
  title         TEXT        NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'running',
  -- status values: running | awaiting_confirmation | done | failed
  steps         JSONB       NOT NULL DEFAULT '[]',
  result        TEXT,
  error         TEXT,
  pending_ssh   JSONB,
  -- pending_ssh: { command, tool_use_id, messages } when awaiting_confirmation
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own tasks"
  ON public.tasks FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS tasks_user_id_idx     ON public.tasks (user_id);
CREATE INDEX IF NOT EXISTS tasks_created_at_idx  ON public.tasks (created_at DESC);
CREATE INDEX IF NOT EXISTS tasks_status_idx      ON public.tasks (status);
