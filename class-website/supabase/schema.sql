-- Shared data schema for the single-page class website.
-- Run this once in the Supabase SQL Editor for a new project.

create table if not exists public.owners (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.owners is
  'Supabase Auth users allowed to manage shared class data. Add the Owner user UUID here manually.';

create table if not exists public.records (
  collection text not null check (collection in (
    'classInfo',
    'homework',
    'exams',
    'kisi-kisi',
    'announcements',
    'schedule',
    'scheduleSettings',
    'students',
    'galleryPosts',
    'albums',
    'birthdays',
    'piket',
    'siteSettings',
    'wheelHistory'
  )),
  id uuid not null default gen_random_uuid(),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  version integer not null default 1 check (version >= 1),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  primary key (collection, id)
);

create index if not exists records_active_collection_updated_idx
  on public.records (collection, updated_at desc)
  where deleted_at is null;

create index if not exists records_deleted_collection_updated_idx
  on public.records (collection, updated_at desc)
  where deleted_at is not null;

create index if not exists records_data_gin_idx
  on public.records using gin (data);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  message text not null check (char_length(btrim(message)) between 1 and 5000),
  attachment_paths text[] not null default '{}'
    check (cardinality(attachment_paths) <= 5),
  created_at timestamptz not null default now(),
  status text not null default 'Baru'
    check (char_length(btrim(status)) between 1 and 40),
  note text check (note is null or char_length(note) <= 2000)
);

create index if not exists reports_created_at_idx
  on public.reports (created_at desc);

create table if not exists public.suggestions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  message text not null check (char_length(btrim(message)) between 1 and 5000),
  name text check (name is null or char_length(name) <= 100),
  created_at timestamptz not null default now(),
  "read" boolean not null default false,
  archived boolean not null default false,
  reply_note text check (reply_note is null or char_length(reply_note) <= 2000)
);

create index if not exists suggestions_inbox_created_at_idx
  on public.suggestions (archived, "read", created_at desc);

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  action text not null check (char_length(btrim(action)) between 1 and 60),
  "record" jsonb,
  description text not null check (char_length(btrim(description)) between 1 and 500),
  created_at timestamptz not null default now(),
  actor uuid references auth.users (id) on delete set null
);

create index if not exists activity_log_created_at_idx
  on public.activity_log (created_at desc);

-- This SECURITY DEFINER helper reads owners without granting visitors access
-- to the membership table itself. Its fixed search_path prevents object spoofing.
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.owners
    where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_owner() from public;
grant execute on function public.is_owner() to anon, authenticated;

create or replace function public.set_record_metadata()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.version := 1;
    new.updated_at := now();
  else
    new.version := old.version + 1;
    new.updated_at := now();
  end if;
  new.updated_by := auth.uid();
  return new;
end;
$$;

revoke all on function public.set_record_metadata() from public, anon, authenticated;

drop trigger if exists set_records_metadata on public.records;
create trigger set_records_metadata
before insert or update on public.records
for each row execute function public.set_record_metadata();

-- Enable public shared-record changes in Realtime when the standard
-- Supabase publication is available; clients still refetch if it is not.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'records'
    ) then
    alter publication supabase_realtime add table public.records;
  end if;
end;
$$;

alter table public.owners enable row level security;
alter table public.records enable row level security;
alter table public.reports enable row level security;
alter table public.suggestions enable row level security;
alter table public.activity_log enable row level security;

-- Owners may see only their own membership row. There are deliberately no
-- client insert/update/delete policies; add or remove owners in the SQL Editor.
drop policy if exists owners_select_self on public.owners;
create policy owners_select_self
  on public.owners for select to authenticated
  using (user_id = (select auth.uid()));
comment on policy owners_select_self on public.owners is
  'An authenticated user can see only their own Owner membership row.';

-- Visitors see active shared records; authenticated Owners can also see
-- soft-deleted records to restore them.
drop policy if exists records_select_active_or_owner on public.records;
create policy records_select_active_or_owner
  on public.records for select to anon, authenticated
  using (deleted_at is null or (select public.is_owner()));
comment on policy records_select_active_or_owner on public.records is
  'Anyone can read active records; only an Owner can also read soft-deleted records.';

-- Only an authenticated user listed in owners may create a shared record.
drop policy if exists records_insert_owner on public.records;
create policy records_insert_owner
  on public.records for insert to authenticated
  with check ((select public.is_owner()));
comment on policy records_insert_owner on public.records is
  'Only an authenticated Owner can insert shared records.';

-- Only an authenticated Owner may change shared records.
drop policy if exists records_update_owner on public.records;
create policy records_update_owner
  on public.records for update to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));
comment on policy records_update_owner on public.records is
  'Only an authenticated Owner can update or restore shared records.';

-- Only an authenticated Owner may hard-delete a shared record.
drop policy if exists records_delete_owner on public.records;
create policy records_delete_owner
  on public.records for delete to authenticated
  using ((select public.is_owner()));
comment on policy records_delete_owner on public.records is
  'Only an authenticated Owner can hard-delete a shared record.';

-- Visitors may submit a validated report, but cannot read or edit submissions.
drop policy if exists reports_insert_anon on public.reports;
create policy reports_insert_anon
  on public.reports for insert to anon
  with check (
    char_length(btrim(name)) between 1 and 100
    and char_length(btrim(message)) between 1 and 5000
    and cardinality(attachment_paths) <= 5
  );
comment on policy reports_insert_anon on public.reports is
  'Anonymous visitors may submit reports within the table length and attachment limits.';

-- Only an authenticated Owner may read report submissions.
drop policy if exists reports_select_owner on public.reports;
create policy reports_select_owner
  on public.reports for select to authenticated
  using ((select public.is_owner()));
comment on policy reports_select_owner on public.reports is
  'Only an authenticated Owner can read reports.';

-- Only an authenticated Owner may update a report status or note.
drop policy if exists reports_update_owner on public.reports;
create policy reports_update_owner
  on public.reports for update to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));
comment on policy reports_update_owner on public.reports is
  'Only an authenticated Owner can update reports.';

-- Only an authenticated Owner may hard-delete a report.
drop policy if exists reports_delete_owner on public.reports;
create policy reports_delete_owner
  on public.reports for delete to authenticated
  using ((select public.is_owner()));
comment on policy reports_delete_owner on public.reports is
  'Only an authenticated Owner can hard-delete reports.';

-- Visitors may submit a validated suggestion, but cannot read or edit it.
drop policy if exists suggestions_insert_anon on public.suggestions;
create policy suggestions_insert_anon
  on public.suggestions for insert to anon
  with check (
    char_length(btrim(title)) between 1 and 160
    and char_length(btrim(message)) between 1 and 5000
    and (name is null or char_length(name) <= 100)
  );
comment on policy suggestions_insert_anon on public.suggestions is
  'Anonymous visitors may submit suggestions within the table length limits.';

-- Only an authenticated Owner may read the suggestions inbox.
drop policy if exists suggestions_select_owner on public.suggestions;
create policy suggestions_select_owner
  on public.suggestions for select to authenticated
  using ((select public.is_owner()));
comment on policy suggestions_select_owner on public.suggestions is
  'Only an authenticated Owner can read suggestions.';

-- Only an authenticated Owner may mark or archive suggestions and add replies.
drop policy if exists suggestions_update_owner on public.suggestions;
create policy suggestions_update_owner
  on public.suggestions for update to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));
comment on policy suggestions_update_owner on public.suggestions is
  'Only an authenticated Owner can update suggestions.';

-- Only an authenticated Owner may hard-delete a suggestion.
drop policy if exists suggestions_delete_owner on public.suggestions;
create policy suggestions_delete_owner
  on public.suggestions for delete to authenticated
  using ((select public.is_owner()));
comment on policy suggestions_delete_owner on public.suggestions is
  'Only an authenticated Owner can hard-delete suggestions.';

-- Activity data is private and can be accessed only by authenticated Owners.
drop policy if exists activity_log_owner_all on public.activity_log;
create policy activity_log_owner_all
  on public.activity_log for all to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));
comment on policy activity_log_owner_all on public.activity_log is
  'Only an authenticated Owner can read or change the activity log.';

revoke all on public.owners, public.records, public.reports, public.suggestions, public.activity_log
  from anon, authenticated;

grant select on public.owners to authenticated;
grant select on public.records to anon, authenticated;
grant insert, update, delete on public.records to authenticated;
grant insert (name, message, attachment_paths) on public.reports to anon;
grant select, update, delete on public.reports to authenticated;
grant insert (title, message, name) on public.suggestions to anon;
grant select, update, delete on public.suggestions to authenticated;
grant select, insert, update, delete on public.activity_log to authenticated;

-- Public images are readable by everyone. Only an authenticated Owner may
-- upload, replace, or remove objects in this bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gallery',
  'gallery',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Gallery object URLs can be fetched publicly, without exposing other buckets.
drop policy if exists gallery_public_read on storage.objects;
create policy gallery_public_read
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'gallery');
comment on policy gallery_public_read on storage.objects is
  'Anyone can read objects stored in the public gallery bucket.';

-- Only an authenticated Owner may add gallery images.
drop policy if exists gallery_owner_insert on storage.objects;
create policy gallery_owner_insert
  on storage.objects for insert to authenticated
  with check (bucket_id = 'gallery' and (select public.is_owner()));
comment on policy gallery_owner_insert on storage.objects is
  'Only an authenticated Owner can upload images to the gallery bucket.';

-- Only an authenticated Owner may replace gallery images.
drop policy if exists gallery_owner_update on storage.objects;
create policy gallery_owner_update
  on storage.objects for update to authenticated
  using (bucket_id = 'gallery' and (select public.is_owner()))
  with check (bucket_id = 'gallery' and (select public.is_owner()));
comment on policy gallery_owner_update on storage.objects is
  'Only an authenticated Owner can replace images in the gallery bucket.';

-- Only an authenticated Owner may remove gallery images.
drop policy if exists gallery_owner_delete on storage.objects;
create policy gallery_owner_delete
  on storage.objects for delete to authenticated
  using (bucket_id = 'gallery' and (select public.is_owner()));
comment on policy gallery_owner_delete on storage.objects is
  'Only an authenticated Owner can delete images from the gallery bucket.';

-- Public submissions may upload limited-size images but cannot read them back.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'report-attachments',
  'report-attachments',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Visitors may create attachments for reports; bucket settings enforce the
-- size limit and MIME allowlist, and the objects are never made public.
drop policy if exists report_attachments_anon_insert on storage.objects;
create policy report_attachments_anon_insert
  on storage.objects for insert to anon
  with check (bucket_id = 'report-attachments');
comment on policy report_attachments_anon_insert on storage.objects is
  'Visitors may upload limited-size image attachments for reports.';

-- Only an authenticated Owner may read private report attachments.
drop policy if exists report_attachments_owner_read on storage.objects;
create policy report_attachments_owner_read
  on storage.objects for select to authenticated
  using (bucket_id = 'report-attachments' and (select public.is_owner()));
comment on policy report_attachments_owner_read on storage.objects is
  'Only an authenticated Owner can read private report attachments.';
