-- get_recent_agent_outputs: fetch recent completed outputs from any agent's jobs table.
-- Uses dynamic SQL; agent key is whitelisted to prevent injection.
-- Run in the Supabase SQL editor. Safe to re-run (OR REPLACE).

CREATE OR REPLACE FUNCTION get_recent_agent_outputs(
  p_user_id   uuid,
  p_agent_key text,
  p_limit     int DEFAULT 3
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_result json;
BEGIN
  IF p_agent_key NOT IN ('alex', 'jeremy', 'kai', 'dana', 'marcus', 'maya') THEN
    RAISE EXCEPTION 'Invalid agent key: %', p_agent_key;
  END IF;

  EXECUTE format(
    'SELECT COALESCE(json_agg(row_to_json(j.*)), ''[]''::json)
     FROM (
       SELECT id, prompt, result, created_at
       FROM %I
       WHERE user_id = $1
         AND status = ''complete''
         AND result IS NOT NULL
       ORDER BY created_at DESC
       LIMIT $2
     ) j',
    p_agent_key || '_jobs'
  ) INTO v_result USING p_user_id, p_limit;

  RETURN v_result;
END; $$;

NOTIFY pgrst, 'reload schema';
