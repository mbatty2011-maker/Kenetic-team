create table if not exists subscriptions (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid references auth.users(id) on delete set null,
  stripe_subscription_id  text unique not null,
  stripe_customer_id      text not null,
  status                  text not null,         -- active | trialing | past_due | cancelled | incomplete | unpaid
  price_id                text,
  current_period_start    timestamptz,
  current_period_end      timestamptz,
  cancel_at_period_end    boolean not null default false,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists subscriptions_user_id_idx          on subscriptions(user_id);
create index if not exists subscriptions_stripe_customer_idx  on subscriptions(stripe_customer_id);

-- Users can only read their own subscription row.
alter table subscriptions enable row level security;

create policy "users can view own subscription"
  on subscriptions for select
  using (auth.uid() = user_id);
