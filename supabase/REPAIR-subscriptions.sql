-- ─── ONE-TIME REPAIR ───────────────────────────────────────────────────────
-- Paste this entire file into the Supabase SQL Editor for project
-- wotwbsvvfruithxmwokj and click "Run".
--
-- It does two things:
--   1. Creates the `subscriptions` table that the app expects (this migration
--      was authored on 2026-04-25 but was never pushed to the database, which
--      is why every paying user has been silently treated as the free tier).
--   2. Backfills the row for the live Stripe subscription for mbatty2011@gmail.com
--      (auth user 23f93158-fe46-4cc9-977a-3f41e6957519, Stripe customer
--      cus_UR2H3Bl0HvSmQc, subscription sub_1TSACr6tAx61WjancUOKEPdb,
--      Solo plan price_1TQs2d6tAx61Wjan3wQ8jgVK).
--
-- Safe to re-run.
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists subscriptions (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid references auth.users(id) on delete set null,
  stripe_subscription_id  text unique not null,
  stripe_customer_id      text not null,
  status                  text not null,
  price_id                text,
  current_period_start    timestamptz,
  current_period_end      timestamptz,
  cancel_at_period_end    boolean not null default false,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists subscriptions_user_id_idx          on subscriptions(user_id);
create index if not exists subscriptions_stripe_customer_idx  on subscriptions(stripe_customer_id);

alter table subscriptions enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'subscriptions' and policyname = 'users can view own subscription'
  ) then
    create policy "users can view own subscription"
      on subscriptions for select
      using (auth.uid() = user_id);
  end if;
end $$;

-- Backfill the active Stripe subscription so the user is recognised as Solo
-- without waiting for the next webhook event.
insert into subscriptions (
  user_id,
  stripe_subscription_id,
  stripe_customer_id,
  status,
  price_id,
  cancel_at_period_end
) values (
  '23f93158-fe46-4cc9-977a-3f41e6957519',
  'sub_1TSACr6tAx61WjancUOKEPdb',
  'cus_UR2H3Bl0HvSmQc',
  'active',
  'price_1TQs2d6tAx61Wjan3wQ8jgVK',
  false
)
on conflict (stripe_subscription_id) do update set
  user_id    = excluded.user_id,
  status     = excluded.status,
  price_id   = excluded.price_id,
  updated_at = now();

notify pgrst, 'reload schema';
