-- Dana's CRM: contacts, deals (with multi-stakeholder support), activities.
-- All tables are user-scoped via auth.users with RLS enforcing auth.uid() = user_id.

-- ─── crm_contacts ──────────────────────────────────────────────────────────────

create table if not exists crm_contacts (
  id                  uuid        primary key default gen_random_uuid(),
  user_id             uuid        not null references auth.users(id) on delete cascade,
  full_name           text        not null,
  email               text,
  email_lower         text        generated always as (lower(email)) stored,
  phone               text,
  title               text,
  company             text,
  linkedin_url        text,
  notes               text,
  source              text,
  status              text        not null default 'active'
                                  check (status in ('active','cold','do_not_contact','customer')),
  tags                text[]      not null default '{}',
  last_contacted_at   timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index if not exists crm_contacts_user_email_uniq
  on crm_contacts (user_id, email_lower)
  where email_lower is not null;

create index if not exists crm_contacts_user_company_idx
  on crm_contacts (user_id, lower(company));

create index if not exists crm_contacts_user_updated_idx
  on crm_contacts (user_id, updated_at desc);

create index if not exists crm_contacts_user_status_idx
  on crm_contacts (user_id, status);

alter table crm_contacts enable row level security;

create policy "Users manage own contacts"
  on crm_contacts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── crm_deals ────────────────────────────────────────────────────────────────

create table if not exists crm_deals (
  id                    uuid        primary key default gen_random_uuid(),
  user_id               uuid        not null references auth.users(id) on delete cascade,
  contact_id            uuid        references crm_contacts(id) on delete set null,
  title                 text        not null,
  company               text,
  value_minor           bigint      not null default 0,
  currency              text        not null default 'usd',
  stage                 text        not null default 'new'
                                    check (stage in ('new','qualified','meeting','proposal','negotiation','won','lost')),
  probability           int         not null default 10
                                    check (probability between 0 and 100),
  expected_close_date   date,
  notes                 text,
  closed_at             timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists crm_deals_user_stage_idx
  on crm_deals (user_id, stage);

create index if not exists crm_deals_user_updated_idx
  on crm_deals (user_id, updated_at desc);

create index if not exists crm_deals_user_contact_idx
  on crm_deals (user_id, contact_id);

alter table crm_deals enable row level security;

create policy "Users manage own deals"
  on crm_deals for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Trigger: stamp closed_at on transition to won/lost; clear it otherwise.
-- Also bump updated_at on every write.
create or replace function set_crm_deal_closed_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if new.stage in ('won','lost') then
    if old is null or old.stage is distinct from new.stage then
      new.closed_at := now();
    end if;
  else
    new.closed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists crm_deals_set_closed_at on crm_deals;
create trigger crm_deals_set_closed_at
  before insert or update on crm_deals
  for each row execute function set_crm_deal_closed_at();

-- ─── crm_deal_contacts (many-to-many stakeholders) ─────────────────────────────

create table if not exists crm_deal_contacts (
  deal_id     uuid        not null references crm_deals(id) on delete cascade,
  contact_id  uuid        not null references crm_contacts(id) on delete cascade,
  role        text        not null default 'other'
                          check (role in ('champion','decision_maker','procurement','technical','user','other')),
  created_at  timestamptz not null default now(),
  primary key (deal_id, contact_id)
);

create index if not exists crm_deal_contacts_contact_idx
  on crm_deal_contacts (contact_id);

alter table crm_deal_contacts enable row level security;

create policy "Users manage own deal_contacts"
  on crm_deal_contacts for all
  using (
    exists (
      select 1 from crm_deals d
      where d.id = crm_deal_contacts.deal_id
        and d.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from crm_deals d
      where d.id = crm_deal_contacts.deal_id
        and d.user_id = auth.uid()
    )
  );

-- ─── crm_activities ───────────────────────────────────────────────────────────

create table if not exists crm_activities (
  id                  uuid        primary key default gen_random_uuid(),
  user_id             uuid        not null references auth.users(id) on delete cascade,
  contact_id          uuid        references crm_contacts(id) on delete cascade,
  deal_id             uuid        references crm_deals(id) on delete cascade,
  activity_type       text        not null
                                  check (activity_type in ('call','email','meeting','note','linkedin','task')),
  subject             text,
  body                text,
  occurred_at         timestamptz not null default now(),
  gmail_thread_id     text,
  gmail_message_id    text,
  metadata            jsonb       not null default '{}',
  idempotency_key     text,
  created_at          timestamptz not null default now()
);

create unique index if not exists crm_activities_user_idem_uniq
  on crm_activities (user_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists crm_activities_user_occurred_idx
  on crm_activities (user_id, occurred_at desc);

create index if not exists crm_activities_contact_occurred_idx
  on crm_activities (contact_id, occurred_at desc)
  where contact_id is not null;

create index if not exists crm_activities_deal_occurred_idx
  on crm_activities (deal_id, occurred_at desc)
  where deal_id is not null;

alter table crm_activities enable row level security;

create policy "Users manage own activities"
  on crm_activities for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── updated_at trigger for crm_contacts ──────────────────────────────────────

create or replace function set_crm_contacts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists crm_contacts_updated_at on crm_contacts;
create trigger crm_contacts_updated_at
  before update on crm_contacts
  for each row execute function set_crm_contacts_updated_at();

notify pgrst, 'reload schema';
