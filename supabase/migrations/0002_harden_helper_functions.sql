-- Move internal RLS helper functions out of the `public` schema so they
-- aren't auto-exposed as PostgREST RPC endpoints (public schema is what
-- PostgREST exposes; a separate, non-exposed schema keeps RLS working
-- without making these callable by anyone with the anon key).

create schema if not exists private;
grant usage on schema private to authenticated;

-- Dropping cascades to every policy that references these functions
-- (directly, or transitively via can_view_rapport) — all of which are
-- recreated below pointing at the private schema.
drop function if exists public.can_view_rapport(uuid, uuid) cascade;
drop function if exists public.is_werf_leider(uuid, uuid) cascade;
drop function if exists public.is_werf_member(uuid, uuid) cascade;
drop function if exists public.is_mgmt(uuid) cascade;
drop function if exists public.handle_new_user() cascade;

create function private.is_mgmt(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from profiles where id = uid and role = 'mgmt');
$$;

create function private.is_werf_member(target_werf uuid, uid uuid)
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

create function private.is_werf_leider(target_werf uuid, uid uuid)
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

create function private.can_view_rapport(target_rapport uuid, uid uuid)
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
        or (private.is_mgmt(uid) and r.deel_mgmt)
        or (r.deel_werf and private.is_werf_member(r.werf_id, uid))
      )
  );
$$;

create function private.handle_new_user()
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
  for each row execute procedure private.handle_new_user();

-- Recreate every policy that used the old public.* helper functions.

create policy "werven are readable by members and management"
  on werven for select
  to authenticated
  using (private.is_mgmt(auth.uid()) or private.is_werf_member(id, auth.uid()));

create policy "werf_members are readable by members and management"
  on werf_members for select
  to authenticated
  using (private.is_mgmt(auth.uid()) or private.is_werf_member(werf_id, auth.uid()));

create policy "werfrapporten are readable per sharing rules"
  on werfrapporten for select
  to authenticated
  using (
    auteur_id = auth.uid()
    or (private.is_mgmt(auth.uid()) and deel_mgmt)
    or (deel_werf and private.is_werf_member(werf_id, auth.uid()))
  );

create policy "werfrapporten are created by the site's werfleider or management"
  on werfrapporten for insert
  to authenticated
  with check (
    auteur_id = auth.uid()
    and (private.is_mgmt(auth.uid()) or private.is_werf_leider(werf_id, auth.uid()))
  );

create policy "werfrapport_fotos follow the report's visibility"
  on werfrapport_fotos for select
  to authenticated
  using (private.can_view_rapport(rapport_id, auth.uid()));

create policy "werfrapport_reacties follow the report's visibility"
  on werfrapport_reacties for select
  to authenticated
  using (private.can_view_rapport(rapport_id, auth.uid()));

create policy "werfrapport_reacties are added by anyone who can see the report"
  on werfrapport_reacties for insert
  to authenticated
  with check (auteur_id = auth.uid() and private.can_view_rapport(rapport_id, auth.uid()));

create policy "werfrapport photos are readable per report visibility"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'werfrapport-fotos'
    and exists (
      select 1 from werfrapport_fotos f
      where f.storage_path = storage.objects.name
        and private.can_view_rapport(f.rapport_id, auth.uid())
    )
  );

create policy "werfrapport photos are uploaded by werf members"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'werfrapport-fotos'
    and private.is_werf_member(((storage.foldername(name))[1])::uuid, auth.uid())
  );
