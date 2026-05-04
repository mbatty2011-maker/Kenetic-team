-- Stripe provider support for user_oauth_tokens.
-- Stripe API keys reuse the same encrypted-token row pattern: the encrypted
-- key lives in `refresh_token` (NOT NULL) and access_token / access_expires_at
-- stay null because Stripe keys don't expire.
--
-- Two new generic columns:
--   account_label  - provider-agnostic display string (replaces google_email
--                    for non-Google providers; backfilled for existing Google
--                    rows for consistency)
--   livemode       - Stripe-specific test/live indicator; null for non-Stripe

alter table user_oauth_tokens
  add column if not exists account_label text,
  add column if not exists livemode boolean;

update user_oauth_tokens
   set account_label = google_email
 where provider = 'google'
   and account_label is null
   and google_email is not null;

create or replace function get_oauth_connection_status(p_provider text)
returns table (
  provider text,
  google_email text,
  account_label text,
  livemode boolean,
  connected_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select t.provider, t.google_email, t.account_label, t.livemode, t.created_at
      from user_oauth_tokens t
     where t.user_id = auth.uid()
       and t.provider = p_provider;
end;
$$;

revoke all on function get_oauth_connection_status(text) from public;
grant execute on function get_oauth_connection_status(text) to authenticated;

notify pgrst, 'reload schema';
