-- Boardroom sessions per user per calendar month.
-- Safe to re-run (all statements are idempotent).

create table if not exists boardroom_counts (
  user_id uuid not null references auth.users(id) on delete cascade,
  month   text not null,  -- YYYY-MM
  count   int  not null default 0,
  primary key (user_id, month)
);

alter table boardroom_counts enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'boardroom_counts' and policyname = 'users can view own boardroom counts'
  ) then
    create policy "users can view own boardroom counts"
      on boardroom_counts for select
      using (auth.uid() = user_id);
  end if;
end $$;

-- Same atomic check-and-increment pattern as message_counts.
create or replace function check_and_increment_boardroom_count(
  p_user_id uuid,
  p_month   text,
  p_limit   int
) returns table(allowed boolean, current_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  select bc.count into v_count
  from boardroom_counts bc
  where bc.user_id = p_user_id and bc.month = p_month;

  v_count := coalesce(v_count, 0);

  if v_count >= p_limit then
    return query select false, v_count;
    return;
  end if;

  insert into boardroom_counts (user_id, month, count)
  values (p_user_id, p_month, 1)
  on conflict (user_id, month)
  do update set count = boardroom_counts.count + 1
  returning boardroom_counts.count into v_count;

  return query select true, v_count;
end;
$$;
