-- LinkedIn profile cache for Dana. Reduces Proxycurl spend (paid per lookup)
-- and keeps results consistent within the 30-day TTL.
-- url_hash is a normalized sha256 of the linkedin URL (lowercased, no query, no trailing slash).

create table if not exists crm_linkedin_profiles (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,
  linkedin_url  text        not null,
  url_hash      text        not null,
  data          jsonb       not null,
  provider      text        not null check (provider in ('proxycurl','tavily')),
  fetched_at    timestamptz not null default now()
);

create unique index if not exists crm_linkedin_profiles_user_hash_uniq
  on crm_linkedin_profiles (user_id, url_hash);

create index if not exists crm_linkedin_profiles_user_fetched_idx
  on crm_linkedin_profiles (user_id, fetched_at desc);

create index if not exists crm_linkedin_profiles_user_provider_day_idx
  on crm_linkedin_profiles (user_id, provider, (fetched_at::date));

alter table crm_linkedin_profiles enable row level security;

create policy "Users manage own linkedin profiles"
  on crm_linkedin_profiles for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

notify pgrst, 'reload schema';
