-- Maya's brand knowledge base: a single mutable identity row per user holding
-- brand voice, target audience, value props, mission, taglines, and language rules.
-- Auto-injected into Maya's system prompt; editable from Settings → Brand and via
-- Maya's `update_brand_profile` tool.

create table if not exists brand_profiles (
  user_id            uuid        primary key references auth.users(id) on delete cascade,
  brand_voice        text,
  target_audience    text,
  value_propositions text,
  mission            text,
  taglines           text,
  dos_and_donts      text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table brand_profiles enable row level security;

create policy "Users manage own brand profile"
  on brand_profiles for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function set_brand_profiles_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists brand_profiles_updated_at on brand_profiles;
create trigger brand_profiles_updated_at
  before update on brand_profiles
  for each row execute function set_brand_profiles_updated_at();

notify pgrst, 'reload schema';
