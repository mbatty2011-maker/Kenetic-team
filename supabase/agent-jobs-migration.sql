-- agent_jobs migration — jeremy, kai, dana, marcus, maya
-- Run in the Supabase SQL editor. Safe to re-run (IF NOT EXISTS / OR REPLACE throughout).
-- Mirrors alex-jobs-migration.sql exactly, one block per agent.

-- ═══════════════════════════════════════════════════════════════════════════════
-- JEREMY
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS jeremy_jobs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  conversation_id uuid        REFERENCES conversations ON DELETE CASCADE,
  status          text        NOT NULL DEFAULT 'queued',
  prompt          text        NOT NULL,
  steps           jsonb       NOT NULL DEFAULT '[]',
  result          text,
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE jeremy_jobs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'jeremy_jobs' AND policyname = 'Users manage own jobs'
  ) THEN
    CREATE POLICY "Users manage own jobs" ON jeremy_jobs
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS jeremy_jobs_user_idx ON jeremy_jobs (user_id, created_at DESC);

ALTER TABLE jeremy_jobs REPLICA IDENTITY FULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'jeremy_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE jeremy_jobs;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION create_jeremy_job(p_user_id uuid, p_conversation_id uuid, p_prompt text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v json;
BEGIN
  INSERT INTO jeremy_jobs (user_id, conversation_id, prompt)
  VALUES (p_user_id, p_conversation_id, p_prompt)
  RETURNING row_to_json(jeremy_jobs.*) INTO v;
  RETURN v;
END; $$;

CREATE OR REPLACE FUNCTION update_jeremy_job(p_job_id uuid, p_user_id uuid, p_status text DEFAULT NULL, p_result text DEFAULT NULL, p_error text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE jeremy_jobs SET
    status     = COALESCE(p_status, status),
    result     = COALESCE(p_result, result),
    error      = COALESCE(p_error,  error),
    updated_at = now()
  WHERE id = p_job_id AND user_id = p_user_id;
END; $$;

CREATE OR REPLACE FUNCTION append_jeremy_job_step(p_job_id uuid, p_user_id uuid, p_step jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE jeremy_jobs SET
    steps      = steps || jsonb_build_array(p_step),
    updated_at = now()
  WHERE id = p_job_id AND user_id = p_user_id;
END; $$;

CREATE OR REPLACE FUNCTION get_jeremy_job(p_job_id uuid, p_user_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v json;
BEGIN
  SELECT row_to_json(jeremy_jobs.*) INTO v
  FROM jeremy_jobs WHERE id = p_job_id AND user_id = p_user_id;
  RETURN v;
END; $$;

CREATE OR REPLACE FUNCTION get_active_jeremy_jobs(p_user_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v json;
BEGIN
  SELECT COALESCE(json_agg(row_to_json(j.*)), '[]'::json) INTO v
  FROM (
    SELECT * FROM jeremy_jobs
    WHERE user_id = p_user_id AND status IN ('queued', 'running')
    ORDER BY created_at DESC LIMIT 5
  ) j;
  RETURN v;
END; $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- KAI
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS kai_jobs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  conversation_id uuid        REFERENCES conversations ON DELETE CASCADE,
  status          text        NOT NULL DEFAULT 'queued',
  prompt          text        NOT NULL,
  steps           jsonb       NOT NULL DEFAULT '[]',
  result          text,
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE kai_jobs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'kai_jobs' AND policyname = 'Users manage own jobs'
  ) THEN
    CREATE POLICY "Users manage own jobs" ON kai_jobs
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS kai_jobs_user_idx ON kai_jobs (user_id, created_at DESC);

ALTER TABLE kai_jobs REPLICA IDENTITY FULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'kai_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE kai_jobs;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION create_kai_job(p_user_id uuid, p_conversation_id uuid, p_prompt text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v json;
BEGIN
  INSERT INTO kai_jobs (user_id, conversation_id, prompt)
  VALUES (p_user_id, p_conversation_id, p_prompt)
  RETURNING row_to_json(kai_jobs.*) INTO v;
  RETURN v;
END; $$;

CREATE OR REPLACE FUNCTION update_kai_job(p_job_id uuid, p_user_id uuid, p_status text DEFAULT NULL, p_result text DEFAULT NULL, p_error text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE kai_jobs SET
    status     = COALESCE(p_status, status),
    result     = COALESCE(p_result, result),
    error      = COALESCE(p_error,  error),
    updated_at = now()
  WHERE id = p_job_id AND user_id = p_user_id;
END; $$;

CREATE OR REPLACE FUNCTION append_kai_job_step(p_job_id uuid, p_user_id uuid, p_step jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE kai_jobs SET
    steps      = steps || jsonb_build_array(p_step),
    updated_at = now()
  WHERE id = p_job_id AND user_id = p_user_id;
END; $$;

CREATE OR REPLACE FUNCTION get_kai_job(p_job_id uuid, p_user_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v json;
BEGIN
  SELECT row_to_json(kai_jobs.*) INTO v
  FROM kai_jobs WHERE id = p_job_id AND user_id = p_user_id;
  RETURN v;
END; $$;

CREATE OR REPLACE FUNCTION get_active_kai_jobs(p_user_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v json;
BEGIN
  SELECT COALESCE(json_agg(row_to_json(j.*)), '[]'::json) INTO v
  FROM (
    SELECT * FROM kai_jobs
    WHERE user_id = p_user_id AND status IN ('queued', 'running')
    ORDER BY created_at DESC LIMIT 5
  ) j;
  RETURN v;
END; $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- DANA
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS dana_jobs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  conversation_id uuid        REFERENCES conversations ON DELETE CASCADE,
  status          text        NOT NULL DEFAULT 'queued',
  prompt          text        NOT NULL,
  steps           jsonb       NOT NULL DEFAULT '[]',
  result          text,
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dana_jobs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'dana_jobs' AND policyname = 'Users manage own jobs'
  ) THEN
    CREATE POLICY "Users manage own jobs" ON dana_jobs
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS dana_jobs_user_idx ON dana_jobs (user_id, created_at DESC);

ALTER TABLE dana_jobs REPLICA IDENTITY FULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'dana_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE dana_jobs;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION create_dana_job(p_user_id uuid, p_conversation_id uuid, p_prompt text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v json;
BEGIN
  INSERT INTO dana_jobs (user_id, conversation_id, prompt)
  VALUES (p_user_id, p_conversation_id, p_prompt)
  RETURNING row_to_json(dana_jobs.*) INTO v;
  RETURN v;
END; $$;

CREATE OR REPLACE FUNCTION update_dana_job(p_job_id uuid, p_user_id uuid, p_status text DEFAULT NULL, p_result text DEFAULT NULL, p_error text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE dana_jobs SET
    status     = COALESCE(p_status, status),
    result     = COALESCE(p_result, result),
    error      = COALESCE(p_error,  error),
    updated_at = now()
  WHERE id = p_job_id AND user_id = p_user_id;
END; $$;

CREATE OR REPLACE FUNCTION append_dana_job_step(p_job_id uuid, p_user_id uuid, p_step jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE dana_jobs SET
    steps      = steps || jsonb_build_array(p_step),
    updated_at = now()
  WHERE id = p_job_id AND user_id = p_user_id;
END; $$;

CREATE OR REPLACE FUNCTION get_dana_job(p_job_id uuid, p_user_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v json;
BEGIN
  SELECT row_to_json(dana_jobs.*) INTO v
  FROM dana_jobs WHERE id = p_job_id AND user_id = p_user_id;
  RETURN v;
END; $$;

CREATE OR REPLACE FUNCTION get_active_dana_jobs(p_user_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v json;
BEGIN
  SELECT COALESCE(json_agg(row_to_json(j.*)), '[]'::json) INTO v
  FROM (
    SELECT * FROM dana_jobs
    WHERE user_id = p_user_id AND status IN ('queued', 'running')
    ORDER BY created_at DESC LIMIT 5
  ) j;
  RETURN v;
END; $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- MARCUS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS marcus_jobs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  conversation_id uuid        REFERENCES conversations ON DELETE CASCADE,
  status          text        NOT NULL DEFAULT 'queued',
  prompt          text        NOT NULL,
  steps           jsonb       NOT NULL DEFAULT '[]',
  result          text,
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE marcus_jobs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'marcus_jobs' AND policyname = 'Users manage own jobs'
  ) THEN
    CREATE POLICY "Users manage own jobs" ON marcus_jobs
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS marcus_jobs_user_idx ON marcus_jobs (user_id, created_at DESC);

ALTER TABLE marcus_jobs REPLICA IDENTITY FULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'marcus_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE marcus_jobs;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION create_marcus_job(p_user_id uuid, p_conversation_id uuid, p_prompt text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v json;
BEGIN
  INSERT INTO marcus_jobs (user_id, conversation_id, prompt)
  VALUES (p_user_id, p_conversation_id, p_prompt)
  RETURNING row_to_json(marcus_jobs.*) INTO v;
  RETURN v;
END; $$;

CREATE OR REPLACE FUNCTION update_marcus_job(p_job_id uuid, p_user_id uuid, p_status text DEFAULT NULL, p_result text DEFAULT NULL, p_error text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE marcus_jobs SET
    status     = COALESCE(p_status, status),
    result     = COALESCE(p_result, result),
    error      = COALESCE(p_error,  error),
    updated_at = now()
  WHERE id = p_job_id AND user_id = p_user_id;
END; $$;

CREATE OR REPLACE FUNCTION append_marcus_job_step(p_job_id uuid, p_user_id uuid, p_step jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE marcus_jobs SET
    steps      = steps || jsonb_build_array(p_step),
    updated_at = now()
  WHERE id = p_job_id AND user_id = p_user_id;
END; $$;

CREATE OR REPLACE FUNCTION get_marcus_job(p_job_id uuid, p_user_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v json;
BEGIN
  SELECT row_to_json(marcus_jobs.*) INTO v
  FROM marcus_jobs WHERE id = p_job_id AND user_id = p_user_id;
  RETURN v;
END; $$;

CREATE OR REPLACE FUNCTION get_active_marcus_jobs(p_user_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v json;
BEGIN
  SELECT COALESCE(json_agg(row_to_json(j.*)), '[]'::json) INTO v
  FROM (
    SELECT * FROM marcus_jobs
    WHERE user_id = p_user_id AND status IN ('queued', 'running')
    ORDER BY created_at DESC LIMIT 5
  ) j;
  RETURN v;
END; $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- MAYA
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS maya_jobs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  conversation_id uuid        REFERENCES conversations ON DELETE CASCADE,
  status          text        NOT NULL DEFAULT 'queued',
  prompt          text        NOT NULL,
  steps           jsonb       NOT NULL DEFAULT '[]',
  result          text,
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE maya_jobs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'maya_jobs' AND policyname = 'Users manage own jobs'
  ) THEN
    CREATE POLICY "Users manage own jobs" ON maya_jobs
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS maya_jobs_user_idx ON maya_jobs (user_id, created_at DESC);

ALTER TABLE maya_jobs REPLICA IDENTITY FULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'maya_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE maya_jobs;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION create_maya_job(p_user_id uuid, p_conversation_id uuid, p_prompt text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v json;
BEGIN
  INSERT INTO maya_jobs (user_id, conversation_id, prompt)
  VALUES (p_user_id, p_conversation_id, p_prompt)
  RETURNING row_to_json(maya_jobs.*) INTO v;
  RETURN v;
END; $$;

CREATE OR REPLACE FUNCTION update_maya_job(p_job_id uuid, p_user_id uuid, p_status text DEFAULT NULL, p_result text DEFAULT NULL, p_error text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE maya_jobs SET
    status     = COALESCE(p_status, status),
    result     = COALESCE(p_result, result),
    error      = COALESCE(p_error,  error),
    updated_at = now()
  WHERE id = p_job_id AND user_id = p_user_id;
END; $$;

CREATE OR REPLACE FUNCTION append_maya_job_step(p_job_id uuid, p_user_id uuid, p_step jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE maya_jobs SET
    steps      = steps || jsonb_build_array(p_step),
    updated_at = now()
  WHERE id = p_job_id AND user_id = p_user_id;
END; $$;

CREATE OR REPLACE FUNCTION get_maya_job(p_job_id uuid, p_user_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v json;
BEGIN
  SELECT row_to_json(maya_jobs.*) INTO v
  FROM maya_jobs WHERE id = p_job_id AND user_id = p_user_id;
  RETURN v;
END; $$;

CREATE OR REPLACE FUNCTION get_active_maya_jobs(p_user_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v json;
BEGIN
  SELECT COALESCE(json_agg(row_to_json(j.*)), '[]'::json) INTO v
  FROM (
    SELECT * FROM maya_jobs
    WHERE user_id = p_user_id AND status IN ('queued', 'running')
    ORDER BY created_at DESC LIMIT 5
  ) j;
  RETURN v;
END; $$;

-- ─── Best-effort schema cache reload ─────────────────────────────────────────

NOTIFY pgrst, 'reload schema';
