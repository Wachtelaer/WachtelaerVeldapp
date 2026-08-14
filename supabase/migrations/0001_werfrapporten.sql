-- Wachtelaer Veldapp — phase 1 schema: profiles, werven, werfrapporten.
-- Chat, plannen, verlof and the sales/opmeting module are out of scope for
-- this migration and are added in later phases.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles — one row per employee, mirrors auth.users
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('tech', 'werfleider', 'sales', 'mgmt')),
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create function is_mgmt(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from profiles where id = uid and role = 'mgmt');
$$;

create policy "profiles are readable by everyone signed in"
  on profiles for select
  to authenticated
  using (true);

create policy "profiles are only editable by their owner"
  on profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- New auth users get a profile row automatically (default role 'tech';
-- an admin/mgmt user promotes them afterwards).
create function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    coalesce(new.raw_user_meta_data ->> 'role', 'tech')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ---------------------------------------------------------------------------
-- werven — job sites
-- ---------------------------------------------------------------------------
create table werven (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  naam text not null,
  adres text not null,
  fase text not null default 'opstart',
  created_at timestamptz not null default now()
);

alter table werven enable row level security;

create table werf_members (
  werf_id uuid not null references werven (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  is_leider boolean not null default false,
  primary key (werf_id, profile_id)
);

alter table werf_members enable row level security;

create function is_werf_member(target_werf uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from werf_members
    where werf_id = target_werf and profile_id = uid
  );
$$;

create function is_werf_leider(target_werf uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from werf_members
    where werf_id = target_werf and profile_id = uid and is_leider
  );
$$;

create policy "werven are readable by members and management"
  on werven for select
  to authenticated
  using (is_mgmt(auth.uid()) or is_werf_member(id, auth.uid()));

create policy "werf_members are readable by members and management"
  on werf_members for select
  to authenticated
  using (is_mgmt(auth.uid()) or is_werf_member(werf_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- werfrapporten — daily site reports
-- ---------------------------------------------------------------------------
create table werfrapporten (
  id uuid primary key default gen_random_uuid(),
  werf_id uuid not null references werven (id) on delete cascade,
  auteur_id uuid not null references profiles (id),
  datum date not null default current_date,
  weer text not null check (weer in ('Droog', 'Regen', 'Hitte')),
  aanwezig_eigen int not null default 0,
  aanwezig_onderaanneming int not null default 0,
  uitgevoerd text not null default '',
  knelpunt text not null default '',
  deel_mgmt boolean not null default true,
  deel_werf boolean not null default true,
  deel_klant boolean not null default false,
  created_at timestamptz not null default now()
);

alter table werfrapporten enable row level security;

create table werfrapport_fotos (
  id uuid primary key default gen_random_uuid(),
  rapport_id uuid not null references werfrapporten (id) on delete cascade,
  storage_path text not null,
  label text not null default '',
  created_at timestamptz not null default now()
);

alter table werfrapport_fotos enable row level security;

create table werfrapport_reacties (
  id uuid primary key default gen_random_uuid(),
  rapport_id uuid not null references werfrapporten (id) on delete cascade,
  auteur_id uuid not null references profiles (id),
  tekst text not null,
  created_at timestamptz not null default now()
);

alter table werfrapport_reacties enable row level security;

-- A report is visible to: its author, management (if deel_mgmt), and werf
-- members (if deel_werf). deel_klant is reserved for a future client/portal
-- surface and grants no extra access here.
create function can_view_rapport(target_rapport uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from werfrapporten r
    where r.id = target_rapport
      and (
        r.auteur_id = uid
        or (is_mgmt(uid) and r.deel_mgmt)
        or (r.deel_werf and is_werf_member(r.werf_id, uid))
      )
  );
$$;

create policy "werfrapporten are readable per sharing rules"
  on werfrapporten for select
  to authenticated
  using (
    auteur_id = auth.uid()
    or (is_mgmt(auth.uid()) and deel_mgmt)
    or (deel_werf and is_werf_member(werf_id, auth.uid()))
  );

create policy "werfrapporten are created by the site's werfleider or management"
  on werfrapporten for insert
  to authenticated
  with check (
    auteur_id = auth.uid()
    and (is_mgmt(auth.uid()) or is_werf_leider(werf_id, auth.uid()))
  );

create policy "werfrapport_fotos follow the report's visibility"
  on werfrapport_fotos for select
  to authenticated
  using (can_view_rapport(rapport_id, auth.uid()));

create policy "werfrapport_fotos are added by the report's author"
  on werfrapport_fotos for insert
  to authenticated
  with check (
    exists (
      select 1 from werfrapporten r
      where r.id = rapport_id and r.auteur_id = auth.uid()
    )
  );

create policy "werfrapport_reacties follow the report's visibility"
  on werfrapport_reacties for select
  to authenticated
  using (can_view_rapport(rapport_id, auth.uid()));

create policy "werfrapport_reacties are added by anyone who can see the report"
  on werfrapport_reacties for insert
  to authenticated
  with check (auteur_id = auth.uid() and can_view_rapport(rapport_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- storage — site report photos, one object per photo at
-- {werf_id}/{rapport_id}/{filename}
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('werfrapport-fotos', 'werfrapport-fotos', false)
on conflict (id) do nothing;

create policy "werfrapport photos are readable per report visibility"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'werfrapport-fotos'
    and exists (
      select 1 from werfrapport_fotos f
      where f.storage_path = storage.objects.name
        and can_view_rapport(f.rapport_id, auth.uid())
    )
  );

create policy "werfrapport photos are uploaded by werf members"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'werfrapport-fotos'
    and is_werf_member(((storage.foldername(name))[1])::uuid, auth.uid())
  );

-- ---------------------------------------------------------------------------
-- werf_summary — per-site rollups for the Werven list (report/photo counts,
-- most recent report). security_invoker so it's filtered by the calling
-- user's own RLS, same as querying the base tables directly.
-- ---------------------------------------------------------------------------
create view werf_summary
  with (security_invoker = true)
  as
  select
    w.id as werf_id,
    (select count(*) from werfrapporten r where r.werf_id = w.id) as rapport_count,
    (
      select count(*) from werfrapport_fotos f
      join werfrapporten r on r.id = f.rapport_id
      where r.werf_id = w.id
    ) as foto_count,
    (
      select r.id from werfrapporten r
      where r.werf_id = w.id
      order by r.datum desc, r.created_at desc
      limit 1
    ) as laatste_rapport_id
  from werven w;

grant select on werf_summary to authenticated;
