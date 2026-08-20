-- Wachtelaer Veldapp — Formulieren: standalone service forms (onderhoud,
-- recuperatie, druktest, opstart) available to everyone, not tied to a
-- werf or an opportunity. Modeled closely on opmetingen (0004) since the
-- shape — invuller, klantgegevens, jsonb antwoorden, optional photos — is
-- identical; the only real difference is who's allowed to create one.

create table formulieren (
  id uuid primary key default gen_random_uuid(),
  invuller_id uuid not null references profiles (id),
  formulier text not null check (
    formulier in ('onderhoud_airco', 'onderhoud_ventilatie', 'recuperatie_koelmiddel', 'druktest_leidingen', 'opstart_airco')
  ),
  klant_naam text not null default '',
  klant_adres text not null default '',
  klant_tel text not null default '',
  antwoorden jsonb not null default '{}'::jsonb,
  nota text not null default '',
  created_at timestamptz not null default now()
);

alter table formulieren enable row level security;

create policy "formulieren are readable by their invuller and management"
  on formulieren for select
  to authenticated
  using (invuller_id = auth.uid() or private.is_mgmt(auth.uid()));

create policy "formulieren are created by their own invuller"
  on formulieren for insert
  to authenticated
  with check (invuller_id = auth.uid());

create table formulier_fotos (
  id uuid primary key default gen_random_uuid(),
  formulier_id uuid not null references formulieren (id) on delete cascade,
  storage_path text not null,
  label text not null default '',
  created_at timestamptz not null default now()
);

alter table formulier_fotos enable row level security;

create function private.can_view_formulier(target_formulier uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from formulieren f
    where f.id = target_formulier
      and (f.invuller_id = uid or private.is_mgmt(uid))
  );
$$;

create policy "formulier_fotos follow the formulier's visibility"
  on formulier_fotos for select
  to authenticated
  using (private.can_view_formulier(formulier_id, auth.uid()));

create policy "formulier_fotos are added by the formulier's own invuller"
  on formulier_fotos for insert
  to authenticated
  with check (
    exists (
      select 1 from formulieren f
      where f.id = formulier_id and f.invuller_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- storage — formulier photos, one object per photo at {formulier_id}/{filename}
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('formulier-fotos', 'formulier-fotos', false)
on conflict (id) do nothing;

create policy "formulier photos are readable per formulier visibility"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'formulier-fotos'
    and private.can_view_formulier(((storage.foldername(name))[1])::uuid, auth.uid())
  );

create policy "formulier photos are uploaded by the formulier's own invuller"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'formulier-fotos'
    and exists (
      select 1 from formulieren f
      where f.id = ((storage.foldername(name))[1])::uuid and f.invuller_id = auth.uid()
    )
  );
