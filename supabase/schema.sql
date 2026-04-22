-- Conversations
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  agent_key text not null,
  title text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Messages
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations on delete cascade,
  user_id uuid references auth.users on delete cascade,
  agent_key text not null,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamptz default now()
);

-- User profiles
create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  company_name text,
  role_title text default 'Founder & CEO',
  avatar_url text,
  updated_at timestamptz default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Row Level Security
alter table conversations enable row level security;
alter table messages enable row level security;
alter table profiles enable row level security;

-- Policies
create policy "Users can manage their own conversations"
  on conversations for all
  using (auth.uid() = user_id);

create policy "Users can manage their own messages"
  on messages for all
  using (auth.uid() = user_id);

create policy "Users can manage their own profile"
  on profiles for all
  using (auth.uid() = id);

-- Indexes for performance
create index if not exists messages_conversation_id_idx on messages (conversation_id, created_at desc);
create index if not exists conversations_user_agent_idx on conversations (user_id, agent_key, updated_at desc);
