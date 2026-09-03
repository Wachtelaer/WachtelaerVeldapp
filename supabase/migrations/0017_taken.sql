-- Wachtelaer Veldapp — To do: management assigns a task to one employee,
-- who checks it off once done. Optional werf link, same shape as the
-- other lightweight logging tables in this app (magazijn_meldingen,
-- verlofaanvragen, ...).

create table taken (
  id uuid primary key default gen_random_uuid(),
  titel text not null,
  omschrijving text not null default '',
  toegewezen_aan uuid not null references profiles (id),
  aangemaakt_door uuid not null references profiles (id),
  werf_id uuid references werven (id) on delete set null,
  gedaan boolean not null default false,
  gedaan_op timestamptz,
  created_at timestamptz not null default now()
);

alter table taken enable row level security;

create policy "taken are readable by their assignee and management"
  on taken for select
  to authenticated
  using (toegewezen_aan = auth.uid() or private.is_mgmt(auth.uid()));

create policy "taken are created by management"
  on taken for insert
  to authenticated
  with check (private.is_mgmt(auth.uid()) and aangemaakt_door = auth.uid());

-- Only gedaan/gedaan_op are meant to change from the assignee side (the
-- app never sends anything else from a non-mgmt call site) — RLS here
-- guards the row, not the column, matching how zetVerwerkt/updateRol
-- etc. rely on the client elsewhere in this app.
create policy "taken are updated by their assignee or management"
  on taken for update
  to authenticated
  using (toegewezen_aan = auth.uid() or private.is_mgmt(auth.uid()))
  with check (toegewezen_aan = auth.uid() or private.is_mgmt(auth.uid()));

create policy "taken are deleted by management"
  on taken for delete
  to authenticated
  using (private.is_mgmt(auth.uid()));
