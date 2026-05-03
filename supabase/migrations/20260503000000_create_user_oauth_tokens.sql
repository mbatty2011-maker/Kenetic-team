-- Per-user OAuth tokens (Google, future: Slack/Notion/etc.)
-- Tokens are AES-256-GCM ciphertext (base64). DB never sees plaintext.
-- All read/write goes through the service-role admin client; clients use the
-- get_oauth_connection_status() RPC to check status without seeing tokens.

create table if not exists user_oauth_tokens (
  user_id            uuid        not null references auth.users(id) on delete cascade,
  provider           text        not null,
  refresh_token      text        not null,
  access_token       text,
  access_expires_at  timestamptz,
  scope              text,
  google_email       text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  primary key (user_id, provider)
);

create index if not exists user_oauth_tokens_user_idx on user_oauth_tokens (user_id);

alter table user_oauth_tokens enable row level security;
-- No policies for authenticated => only service-role can read/write.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_oauth_tokens_set_updated_at on user_oauth_tokens;
create trigger user_oauth_tokens_set_updated_at
  before update on user_oauth_tokens
  for each row execute function public.set_updated_at();

create or replace function get_oauth_connection_status(p_provider text)
returns table (provider text, google_email text, connected_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select t.provider, t.google_email, t.created_at
      from user_oauth_tokens t
     where t.user_id = auth.uid()
       and t.provider = p_provider;
end;
$$;

revoke all on function get_oauth_connection_status(text) from public;
grant execute on function get_oauth_connection_status(text) to authenticated;

notify pgrst, 'reload schema';
