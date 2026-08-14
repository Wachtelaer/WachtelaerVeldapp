-- Wachtelaer Veldapp — phase 2a: werfchat (one group chat per site).
-- Same visibility as the werf itself: management sees every thread, a
-- werf's crew sees their own thread. No separate "delen" toggle — chat is
-- inherently shared with the whole site + management, like the prototype.

create table werf_chat_berichten (
  id uuid primary key default gen_random_uuid(),
  werf_id uuid not null references werven (id) on delete cascade,
  auteur_id uuid not null references profiles (id),
  tekst text not null default '',
  foto_storage_path text,
  created_at timestamptz not null default now(),
  constraint werf_chat_berichten_not_empty check (tekst <> '' or foto_storage_path is not null)
);

alter table werf_chat_berichten enable row level security;

create index werf_chat_berichten_werf_id_created_at_idx
  on werf_chat_berichten (werf_id, created_at);

create policy "werf_chat_berichten are readable by members and management"
  on werf_chat_berichten for select
  to authenticated
  using (private.is_mgmt(auth.uid()) or private.is_werf_member(werf_id, auth.uid()));

create policy "werf_chat_berichten are sent by members and management"
  on werf_chat_berichten for insert
  to authenticated
  with check (
    auteur_id = auth.uid()
    and (private.is_mgmt(auth.uid()) or private.is_werf_member(werf_id, auth.uid()))
  );

-- Per-user read marker, used to compute the "ongelezen" badge on the thread list.
create table werf_chat_reads (
  werf_id uuid not null references werven (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (werf_id, profile_id)
);

alter table werf_chat_reads enable row level security;

create policy "werf_chat_reads are managed by their own owner"
  on werf_chat_reads for all
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- storage — chat photos, one object per photo at {werf_id}/{filename}
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('werfchat-fotos', 'werfchat-fotos', false)
on conflict (id) do nothing;

create policy "werfchat photos are readable by members and management"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'werfchat-fotos'
    and (
      private.is_mgmt(auth.uid())
      or private.is_werf_member(((storage.foldername(name))[1])::uuid, auth.uid())
    )
  );

create policy "werfchat photos are uploaded by members and management"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'werfchat-fotos'
    and (
      private.is_mgmt(auth.uid())
      or private.is_werf_member(((storage.foldername(name))[1])::uuid, auth.uid())
    )
  );
