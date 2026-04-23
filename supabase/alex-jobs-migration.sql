-- alex_jobs migration
-- Run this in the Supabase SQL editor. Safe to re-run (IF NOT EXISTS / OR REPLACE throughout).

-- ─── Table ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS alex_jobs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  conversation_id uuid        REFERENCES conversations ON DELETE CASCADE,
  status          text        NOT NULL DEFAULT 'queued',  -- queued | running | complete | failed
  prompt          text        NOT NULL,
  steps           jsonb       NOT NULL DEFAULT '[]',      -- { timestamp, type, summary, detail? }
  result          text,
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE alex_jobs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'alex_jobs' AND policyname = 'Users manage own jobs'
  ) THEN
    CREATE POLICY "Users manage own jobs" ON alex_jobs
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ─── Index ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS alex_jobs_user_idx ON alex_jobs (user_id, created_at DESC);

-- ─── Realtime ────────────────────────────────────────────────────────────────
-- REPLICA IDENTITY FULL ensures old + new row values are sent in the WAL event,
-- which Supabase Realtime needs to populate payload.new correctly on UPDATE.

ALTER TABLE alex_jobs REPLICA IDENTITY FULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'alex_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE alex_jobs;
  END IF;
END $$;

-- ─── RPC functions (all SECURITY DEFINER — bypass PostgREST schema cache) ───

-- create_alex_job: insert a new job row, return the full row as JSON
CREATE OR REPLACE FUNCTION create_alex_job(
  p_user_id         uuid,
  p_conversation_id uuid,
  p_prompt          text
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v json;
BEGIN
  INSERT INTO alex_jobs (user_id, conversation_id, prompt)
  VALUES (p_user_id, p_conversation_id, p_prompt)
  RETURNING row_to_json(alex_jobs.*) INTO v;
  RETURN v;
END; $$;

-- update_alex_job: partial update — only non-null params are written
CREATE OR REPLACE FUNCTION update_alex_job(
  p_job_id  uuid,
  p_user_id uuid,
  p_status  text    DEFAULT NULL,
  p_result  text    DEFAULT NULL,
  p_error   text    DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE alex_jobs SET
    status     = COALESCE(p_status, status),
    result     = COALESCE(p_result, result),
    error      = COALESCE(p_error,  error),
    updated_at = now()
  WHERE id = p_job_id AND user_id = p_user_id;
END; $$;

-- append_alex_job_step: atomic jsonb append — no read-modify-write
-- Appends a single step object to the steps array in one UPDATE statement.
CREATE OR REPLACE FUNCTION append_alex_job_step(
  p_job_id  uuid,
  p_user_id uuid,
  p_step    jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE alex_jobs SET
    steps      = steps || jsonb_build_array(p_step),
    updated_at = now()
  WHERE id = p_job_id AND user_id = p_user_id;
END; $$;

-- get_alex_job: fetch a single job by id (for initial hydration)
CREATE OR REPLACE FUNCTION get_alex_job(p_job_id uuid, p_user_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v json;
BEGIN
  SELECT row_to_json(alex_jobs.*) INTO v
  FROM alex_jobs
  WHERE id = p_job_id AND user_id = p_user_id;
  RETURN v;
END; $$;

-- get_active_alex_jobs: queued or running jobs for a user (for tab-reopen resumption)
CREATE OR REPLACE FUNCTION get_active_alex_jobs(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v json;
BEGIN
  SELECT COALESCE(json_agg(row_to_json(j.*)), '[]'::json) INTO v
  FROM (
    SELECT * FROM alex_jobs
    WHERE user_id = p_user_id
      AND status IN ('queued', 'running')
    ORDER BY created_at DESC
    LIMIT 5
  ) j;
  RETURN v;
END; $$;

-- ─── Best-effort schema cache reload ─────────────────────────────────────────

NOTIFY pgrst, 'reload schema';
