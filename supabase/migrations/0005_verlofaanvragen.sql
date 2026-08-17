-- Wachtelaer Veldapp — phase 2c: verlofaanvragen (leave requests).

alter table profiles add column verlof_dagen numeric not null default 20;
alter table profiles add column inhaalrust_dagen numeric not null default 0;

create table verlofaanvragen (
  id uuid primary key default gen_random_uuid(),
  aanvrager_id uuid not null references profiles (id),
  type text not null check (type in ('Verlof', 'Inhaalrust', 'Ziekte')),
  van date not null,
  tot date not null,
  nota text not null default '',
  status text not null default 'wacht' check (status in ('wacht', 'goed', 'nee')),
  behandeld_door uuid references profiles (id),
  behandeld_op timestamptz,
  created_at timestamptz not null default now(),
  constraint verlofaanvragen_periode_check check (tot >= van)
);

alter table verlofaanvragen enable row level security;

create policy "verlofaanvragen are readable by their aanvrager and management"
  on verlofaanvragen for select
  to authenticated
  using (aanvrager_id = auth.uid() or private.is_mgmt(auth.uid()));

-- Lets a colleague on the same site see that someone is already off in a
-- given period (name, dates, type) — used for the "op die dagen"
-- conflict check when requesting leave. Rejected requests stay private.
create policy "verlofaanvragen are readable by werf-mates for conflict checks"
  on verlofaanvragen for select
  to authenticated
  using (
    status in ('wacht', 'goed')
    and exists (
      select 1 from werf_members wm1
      join werf_members wm2 on wm1.werf_id = wm2.werf_id
      where wm1.profile_id = auth.uid() and wm2.profile_id = verlofaanvragen.aanvrager_id
    )
  );

create policy "verlofaanvragen are created by their own aanvrager"
  on verlofaanvragen for insert
  to authenticated
  with check (aanvrager_id = auth.uid());

create policy "verlofaanvragen are approved or rejected by management only"
  on verlofaanvragen for update
  to authenticated
  using (private.is_mgmt(auth.uid()))
  with check (private.is_mgmt(auth.uid()));
