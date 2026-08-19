-- Wachtelaer Veldapp — Magazijn: iedereen kan doorgeven wat ze uit het
-- magazijn nemen wanneer de magazijnier er niet is; management krijgt een
-- overzicht van alle meldingen en kan ze als verwerkt afvinken.

create table magazijn_meldingen (
  id uuid primary key default gen_random_uuid(),
  melder_id uuid not null references profiles (id),
  werf_id uuid references werven (id) on delete set null,
  tekst text not null,
  hoeveelheid numeric,
  eenheid text not null default '',
  verwerkt boolean not null default false,
  verwerkt_door uuid references profiles (id),
  verwerkt_op timestamptz,
  created_at timestamptz not null default now()
);

alter table magazijn_meldingen enable row level security;

create policy "magazijn_meldingen are readable by their melder and management"
  on magazijn_meldingen for select
  to authenticated
  using (melder_id = auth.uid() or private.is_mgmt(auth.uid()));

create policy "magazijn_meldingen are created by their own melder"
  on magazijn_meldingen for insert
  to authenticated
  with check (melder_id = auth.uid());

create policy "magazijn_meldingen are updated by management only"
  on magazijn_meldingen for update
  to authenticated
  using (private.is_mgmt(auth.uid()))
  with check (private.is_mgmt(auth.uid()));

create table magazijn_meldingen_fotos (
  id uuid primary key default gen_random_uuid(),
  melding_id uuid not null references magazijn_meldingen (id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now()
);

alter table magazijn_meldingen_fotos enable row level security;

create policy "magazijn_meldingen_fotos follow the melding's visibility"
  on magazijn_meldingen_fotos for select
  to authenticated
  using (
    exists (
      select 1 from magazijn_meldingen m
      where m.id = melding_id and (m.melder_id = auth.uid() or private.is_mgmt(auth.uid()))
    )
  );

create policy "magazijn_meldingen_fotos are added by the melding's own melder"
  on magazijn_meldingen_fotos for insert
  to authenticated
  with check (
    exists (
      select 1 from magazijn_meldingen m
      where m.id = melding_id and m.melder_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- storage — one object per photo at {melding_id}/{filename}
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('magazijn-fotos', 'magazijn-fotos', false)
on conflict (id) do nothing;

create policy "magazijn photos are readable per melding visibility"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'magazijn-fotos'
    and exists (
      select 1 from magazijn_meldingen m
      where m.id = ((storage.foldername(name))[1])::uuid
        and (m.melder_id = auth.uid() or private.is_mgmt(auth.uid()))
    )
  );

create policy "magazijn photos are uploaded by the melding's own melder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'magazijn-fotos'
    and exists (
      select 1 from magazijn_meldingen m
      where m.id = ((storage.foldername(name))[1])::uuid and m.melder_id = auth.uid()
    )
  );
