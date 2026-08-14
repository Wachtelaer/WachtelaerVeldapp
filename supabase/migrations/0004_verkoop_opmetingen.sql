-- Wachtelaer Veldapp — phase 2b: verkoopmodule (sales site-survey intake).
-- A 'sales' user picks a domain and answers a domain-specific
-- questionnaire on-site; the backoffice turns it into a quote. Prices are
-- deliberately never captured here — see the prototype's design notes.

create function private.is_sales(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from profiles where id = uid and role = 'sales');
$$;

create table opmetingen (
  id uuid primary key default gen_random_uuid(),
  verkoper_id uuid not null references profiles (id),
  module text not null check (module in ('verwarming', 'airco', 'zon', 'sanitair', 'ventilatie')),
  klant_naam text not null default '',
  klant_adres text not null default '',
  klant_tel text not null default '',
  antwoorden jsonb not null default '{}'::jsonb,
  nota text not null default '',
  status text not null default 'nieuw',
  created_at timestamptz not null default now()
);

alter table opmetingen enable row level security;

create policy "opmetingen are readable by their verkoper and management"
  on opmetingen for select
  to authenticated
  using (verkoper_id = auth.uid() or private.is_mgmt(auth.uid()));

create policy "opmetingen are created by sales and management"
  on opmetingen for insert
  to authenticated
  with check (
    verkoper_id = auth.uid()
    and (private.is_sales(auth.uid()) or private.is_mgmt(auth.uid()))
  );

create table opmeting_fotos (
  id uuid primary key default gen_random_uuid(),
  opmeting_id uuid not null references opmetingen (id) on delete cascade,
  storage_path text not null,
  label text not null default '',
  created_at timestamptz not null default now()
);

alter table opmeting_fotos enable row level security;

create function private.can_view_opmeting(target_opmeting uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from opmetingen o
    where o.id = target_opmeting
      and (o.verkoper_id = uid or private.is_mgmt(uid))
  );
$$;

create policy "opmeting_fotos follow the opmeting's visibility"
  on opmeting_fotos for select
  to authenticated
  using (private.can_view_opmeting(opmeting_id, auth.uid()));

create policy "opmeting_fotos are added by the opmeting's verkoper"
  on opmeting_fotos for insert
  to authenticated
  with check (
    exists (
      select 1 from opmetingen o
      where o.id = opmeting_id and o.verkoper_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- storage — opmeting photos, one object per photo at {opmeting_id}/{filename}
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('opmeting-fotos', 'opmeting-fotos', false)
on conflict (id) do nothing;

create policy "opmeting photos are readable per opmeting visibility"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'opmeting-fotos'
    and private.can_view_opmeting(((storage.foldername(name))[1])::uuid, auth.uid())
  );

create policy "opmeting photos are uploaded by the opmeting's verkoper"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'opmeting-fotos'
    and exists (
      select 1 from opmetingen o
      where o.id = ((storage.foldername(name))[1])::uuid and o.verkoper_id = auth.uid()
    )
  );
