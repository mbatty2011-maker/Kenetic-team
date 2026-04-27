-- Message counts per user, per agent, per calendar month.
-- Safe to re-run (all statements are idempotent).

create table if not exists message_counts (
  user_id   uuid not null references auth.users(id) on delete cascade,
  agent_key text not null,
  month     text not null,  -- YYYY-MM
  count     int  not null default 0,
  primary key (user_id, agent_key, month)
);

alter table message_counts enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'message_counts' and policyname = 'users can view own message counts'
  ) then
    create policy "users can view own message counts"
      on message_counts for select
      using (auth.uid() = user_id);
  end if;
end $$;

-- Atomically checks the current count against a limit and, if under the limit,
-- increments it in a single round-trip.  Returns (allowed, current_count).
-- Pass p_limit = 2147483647 to unconditionally increment (unlimited tiers).
create or replace function check_and_increment_message_count(
  p_user_id   uuid,
  p_agent_key text,
  p_month     text,
  p_limit     int
) returns table(allowed boolean, current_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  select mc.count into v_count
  from message_counts mc
  where mc.user_id = p_user_id
    and mc.agent_key = p_agent_key
    and mc.month = p_month;

  v_count := coalesce(v_count, 0);

  if v_count >= p_limit then
    return query select false, v_count;
    return;
  end if;

  insert into message_counts (user_id, agent_key, month, count)
  values (p_user_id, p_agent_key, p_month, 1)
  on conflict (user_id, agent_key, month)
  do update set count = message_counts.count + 1
  returning message_counts.count into v_count;

  return query select true, v_count;
end;
$$;
