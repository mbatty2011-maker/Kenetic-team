-- computer_jobs migration
-- Run this in the Supabase SQL editor. Safe to re-run (IF NOT EXISTS / OR REPLACE throughout).
--
-- Tracks E2B Desktop sessions launched by Alex's `use_desktop` tool. The
-- Inngest worker writes the row, and the browser subscribes via Realtime to
-- render the live action feed alongside the VNC stream.

-- ─── Table ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS computer_jobs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  conversation_id uuid        REFERENCES conversations ON DELETE CASCADE,
  alex_job_id     uuid,                                          -- generic; alex_jobs.id, no FK so the row outlives the parent
  status          text        NOT NULL DEFAULT 'queued',         -- queued | running | complete | failed | expired
  task            text        NOT NULL,
  sandbox_id      text,                                          -- E2B sandbox id; populated once createDesktop() returns
  stream_url      text,                                          -- VNC stream URL the browser embeds
  steps           jsonb       NOT NULL DEFAULT '[]',             -- { timestamp, type, summary, detail? }
  result          text,
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE computer_jobs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'computer_jobs' AND policyname = 'Users manage own jobs'
  ) THEN
    CREATE POLICY "Users manage own jobs" ON computer_jobs
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS computer_jobs_user_idx        ON computer_jobs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS computer_jobs_user_status_idx ON computer_jobs (user_id, status);
CREATE INDEX IF NOT EXISTS computer_jobs_alex_job_idx    ON computer_jobs (alex_job_id) WHERE alex_job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS computer_jobs_stale_idx       ON computer_jobs (status, created_at) WHERE status IN ('queued', 'running');

-- ─── Realtime ────────────────────────────────────────────────────────────────
-- REPLICA IDENTITY FULL ensures old + new row values are sent in the WAL event,
-- which Supabase Realtime needs to populate payload.new correctly on UPDATE.

ALTER TABLE computer_jobs REPLICA IDENTITY FULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'computer_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE computer_jobs;
  END IF;
END $$;

-- ─── RPC functions (all SECURITY DEFINER — bypass PostgREST schema cache) ───

-- create_computer_job: insert a new job row, return the full row as JSON
CREATE OR REPLACE FUNCTION create_computer_job(
  p_user_id         uuid,
  p_conversation_id uuid,
  p_alex_job_id     uuid,
  p_task            text
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v json;
BEGIN
  INSERT INTO computer_jobs (user_id, conversation_id, alex_job_id, task)
  VALUES (p_user_id, p_conversation_id, p_alex_job_id, p_task)
  RETURNING row_to_json(computer_jobs.*) INTO v;
  RETURN v;
END; $$;

-- update_computer_job: partial update — only non-null params are written
CREATE OR REPLACE FUNCTION update_computer_job(
  p_job_id     uuid,
  p_user_id    uuid,
  p_status     text  DEFAULT NULL,
  p_sandbox_id text  DEFAULT NULL,
  p_stream_url text  DEFAULT NULL,
  p_result     text  DEFAULT NULL,
  p_error      text  DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE computer_jobs SET
    status     = COALESCE(p_status,     status),
    sandbox_id = COALESCE(p_sandbox_id, sandbox_id),
    stream_url = COALESCE(p_stream_url, stream_url),
    result     = COALESCE(p_result,     result),
    error      = COALESCE(p_error,      error),
    updated_at = now()
  WHERE id = p_job_id AND user_id = p_user_id;
END; $$;

-- append_computer_job_step: atomic jsonb append — no read-modify-write
CREATE OR REPLACE FUNCTION append_computer_job_step(
  p_job_id  uuid,
  p_user_id uuid,
  p_step    jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE computer_jobs SET
    steps      = steps || jsonb_build_array(p_step),
    updated_at = now()
  WHERE id = p_job_id AND user_id = p_user_id;
END; $$;

-- get_computer_job: fetch a single job by id (for initial hydration)
CREATE OR REPLACE FUNCTION get_computer_job(p_job_id uuid, p_user_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v json;
BEGIN
  SELECT row_to_json(computer_jobs.*) INTO v
  FROM computer_jobs
  WHERE id = p_job_id AND user_id = p_user_id;
  RETURN v;
END; $$;

-- get_active_computer_jobs: queued or running jobs for a user
CREATE OR REPLACE FUNCTION get_active_computer_jobs(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v json;
BEGIN
  SELECT COALESCE(json_agg(row_to_json(j.*)), '[]'::json) INTO v
  FROM (
    SELECT * FROM computer_jobs
    WHERE user_id = p_user_id
      AND status IN ('queued', 'running')
    ORDER BY created_at DESC
    LIMIT 5
  ) j;
  RETURN v;
END; $$;

-- count_user_computer_jobs_today: how many sessions has this user started in
-- the last 24 hours? (used by the rate limiter; counts ALL statuses including
-- failed/expired so a flapping sandbox can't bypass the cap)
CREATE OR REPLACE FUNCTION count_user_computer_jobs_today(p_user_id uuid)
RETURNS integer
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT COUNT(*)::int FROM computer_jobs
  WHERE user_id = p_user_id
    AND created_at > now() - interval '24 hours';
$$;

-- list_stale_computer_jobs: rows the cron should clean up. Service-role only —
-- no user_id filter — because the cron runs systemwide.
CREATE OR REPLACE FUNCTION list_stale_computer_jobs(p_older_than_minutes int)
RETURNS SETOF computer_jobs
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT * FROM computer_jobs
  WHERE status IN ('queued', 'running')
    AND created_at < now() - (p_older_than_minutes || ' minutes')::interval
  ORDER BY created_at ASC
  LIMIT 50;
$$;

-- ─── Best-effort schema cache reload ─────────────────────────────────────────

NOTIFY pgrst, 'reload schema';
