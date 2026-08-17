-- Wachtelaer Veldapp — phase 2d: plannen & documenten (versioned plans).
-- A "document" is a logical identity (a title); each upload against that
-- title becomes a new version. The crew always sees the latest version;
-- older ones stay around but are collapsed in the UI.

create table plan_documenten (
  id uuid primary key default gen_random_uuid(),
  werf_id uuid not null references werven (id) on delete cascade,
  titel text not null,
  created_at timestamptz not null default now(),
  unique (werf_id, titel)
);

alter table plan_documenten enable row level security;

create policy "plan_documenten are readable by members and management"
  on plan_documenten for select
  to authenticated
  using (private.is_mgmt(auth.uid()) or private.is_werf_member(werf_id, auth.uid()));

create policy "plan_documenten are created by management"
  on plan_documenten for insert
  to authenticated
  with check (private.is_mgmt(auth.uid()));

create table plan_versies (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references plan_documenten (id) on delete cascade,
  versie_nummer int not null,
  storage_path text not null,
  bestandsnaam text not null,
  geupload_door uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  unique (document_id, versie_nummer)
);

alter table plan_versies enable row level security;

create function private.can_view_plan_document(target_document uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from plan_documenten d
    where d.id = target_document
      and (private.is_mgmt(uid) or private.is_werf_member(d.werf_id, uid))
  );
$$;

create policy "plan_versies follow their document's visibility"
  on plan_versies for select
  to authenticated
  using (private.can_view_plan_document(document_id, auth.uid()));

create policy "plan_versies are added by management"
  on plan_versies for insert
  to authenticated
  with check (geupload_door = auth.uid() and private.is_mgmt(auth.uid()));

-- Per-user read marker, used to compute the "nieuw" badge — same pattern
-- as werf_chat_reads.
create table plan_reads (
  werf_id uuid not null references werven (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (werf_id, profile_id)
);

alter table plan_reads enable row level security;

create policy "plan_reads are managed by their own owner"
  on plan_reads for all
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- storage — plan files, one object per version at
-- {werf_id}/{document_id}/{versie_nummer}_{filename}
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('werf-plannen', 'werf-plannen', false)
on conflict (id) do nothing;

create policy "werf plan files are readable by members and management"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'werf-plannen'
    and (
      private.is_mgmt(auth.uid())
      or private.is_werf_member(((storage.foldername(name))[1])::uuid, auth.uid())
    )
  );

create policy "werf plan files are uploaded by management"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'werf-plannen' and private.is_mgmt(auth.uid()));
