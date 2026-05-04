-- Marcus's per-user document store. Holds PDF/DOCX uploads from the chat
-- attachment UI: original storage path, mime + size, parsed text (full + preview),
-- optional cached analysis JSON.

create table if not exists marcus_documents (
  id                   uuid        primary key default gen_random_uuid(),
  user_id              uuid        not null references auth.users on delete cascade,
  storage_path         text        not null,
  original_filename    text        not null,
  mime_type            text        not null,
  size_bytes           integer     not null,
  page_count           integer,
  parsed_text          text,
  parsed_text_preview  text,
  analysis             jsonb,
  created_at           timestamptz not null default now()
);

alter table marcus_documents enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'marcus_documents' and policyname = 'Users manage own documents'
  ) then
    create policy "Users manage own documents" on marcus_documents
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

create index if not exists marcus_documents_user_idx
  on marcus_documents (user_id, created_at desc);

-- ── RPCs (worker-side admin client uses these; user-side reads go through RLS) ──

create or replace function create_marcus_document(
  p_user_id             uuid,
  p_storage_path        text,
  p_original_filename   text,
  p_mime_type           text,
  p_size_bytes          integer,
  p_page_count          integer,
  p_parsed_text         text,
  p_parsed_text_preview text
) returns json language plpgsql security definer as $$
declare v json;
begin
  insert into marcus_documents (
    user_id, storage_path, original_filename, mime_type, size_bytes,
    page_count, parsed_text, parsed_text_preview
  ) values (
    p_user_id, p_storage_path, p_original_filename, p_mime_type, p_size_bytes,
    p_page_count, p_parsed_text, p_parsed_text_preview
  )
  returning row_to_json(marcus_documents.*) into v;
  return v;
end;
$$;

create or replace function get_marcus_document(p_document_id uuid, p_user_id uuid)
returns json language plpgsql security definer as $$
declare v json;
begin
  select row_to_json(marcus_documents.*) into v
  from marcus_documents where id = p_document_id and user_id = p_user_id;
  return v;
end;
$$;

create or replace function set_marcus_document_analysis(
  p_document_id uuid,
  p_user_id     uuid,
  p_analysis    jsonb
) returns void language plpgsql security definer as $$
begin
  update marcus_documents set analysis = p_analysis
  where id = p_document_id and user_id = p_user_id;
end;
$$;

revoke all on function create_marcus_document(uuid, text, text, text, integer, integer, text, text) from public;
revoke all on function get_marcus_document(uuid, uuid) from public;
revoke all on function set_marcus_document_analysis(uuid, uuid, jsonb) from public;
grant execute on function create_marcus_document(uuid, text, text, text, integer, integer, text, text) to authenticated;
grant execute on function get_marcus_document(uuid, uuid) to authenticated;
grant execute on function set_marcus_document_analysis(uuid, uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
