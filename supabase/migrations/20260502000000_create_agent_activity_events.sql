create table if not exists agent_activity_events (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  agent           text        not null,        -- alex | jeremy | kai | dana | marcus | maya | computer
  tool_name       text        not null,
  status          text        not null,        -- started | succeeded | failed
  input_summary   jsonb,
  output_summary  text,
  error_message   text,
  conversation_id uuid        references conversations(id) on delete set null,
  job_id          uuid,                        -- generic; alex_jobs.id etc; no FK so it's reusable
  duration_ms     integer,
  screenshot_url  text,                        -- reserved for future computer-use enrichment
  created_at      timestamptz not null default now()
);

create index if not exists agent_activity_events_user_time_idx
  on agent_activity_events (user_id, created_at desc);
create index if not exists agent_activity_events_user_tool_idx
  on agent_activity_events (user_id, tool_name, created_at desc);
create index if not exists agent_activity_events_user_agent_idx
  on agent_activity_events (user_id, agent, created_at desc);
create index if not exists agent_activity_events_user_job_idx
  on agent_activity_events (user_id, job_id) where job_id is not null;

alter table agent_activity_events enable row level security;

create policy "users read own activity"
  on agent_activity_events for select
  using (auth.uid() = user_id);

-- Inserts go through service-role client or the SECURITY DEFINER RPC below.
-- No authenticated INSERT policy by design.

create or replace function log_agent_activity(
  p_user_id         uuid,
  p_agent           text,
  p_tool_name       text,
  p_status          text,
  p_input_summary   jsonb default null,
  p_output_summary  text  default null,
  p_error_message   text  default null,
  p_conversation_id uuid  default null,
  p_job_id          uuid  default null,
  p_duration_ms     int   default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  insert into agent_activity_events
    (user_id, agent, tool_name, status, input_summary, output_summary,
     error_message, conversation_id, job_id, duration_ms)
  values
    (p_user_id, p_agent, p_tool_name, p_status, p_input_summary, p_output_summary,
     p_error_message, p_conversation_id, p_job_id, p_duration_ms)
  returning id into v_id;
  return v_id;
end;
$$;

notify pgrst, 'reload schema';
