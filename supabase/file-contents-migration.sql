-- agent_file_contents: stores the plain-text rendering of every file agents generate.
-- Kept separate from the jobs tables so chat responses stay short (only the download
-- link is returned to the agent) while get_agent_output can still return full content.
-- Run in the Supabase SQL editor. Safe to re-run (IF NOT EXISTS / OR REPLACE).

CREATE TABLE IF NOT EXISTS agent_file_contents (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  title        text        NOT NULL,
  format       text        NOT NULL,
  text_content text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE agent_file_contents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'agent_file_contents' AND policyname = 'Users manage own file contents'
  ) THEN
    CREATE POLICY "Users manage own file contents" ON agent_file_contents
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS agent_file_contents_user_idx
  ON agent_file_contents (user_id, created_at DESC);

NOTIFY pgrst, 'reload schema';
