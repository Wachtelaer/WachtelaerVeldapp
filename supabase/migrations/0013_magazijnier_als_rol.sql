-- Wachtelaer Veldapp — make "magazijnier" a role, exactly like tech,
-- werfleider, sales and mgmt, instead of a separate checkbox. Same
-- role-picker UI/update path as the other roles, which already works
-- reliably, instead of a second, separately-wired toggle.
--
-- Self-sufficient: safe to run whether or not 0012's checkbox-based
-- attempt was ever successfully applied (every statement is idempotent
-- and every policy this depends on is (re)created here too).

alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('tech', 'werfleider', 'sales', 'mgmt', 'magazijnier'));

create or replace function private.is_magazijnier(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from profiles where id = uid and role = 'magazijnier');
$$;

drop policy if exists "magazijn_meldingen are readable by their melder and management" on magazijn_meldingen;
drop policy if exists "magazijn_meldingen are readable by their melder, management and magazijnier" on magazijn_meldingen;

create policy "magazijn_meldingen are readable by their melder, management and magazijnier"
  on magazijn_meldingen for select
  to authenticated
  using (melder_id = auth.uid() or private.is_mgmt(auth.uid()) or private.is_magazijnier(auth.uid()));

drop policy if exists "magazijn_meldingen are updated by management only" on magazijn_meldingen;
drop policy if exists "magazijn_meldingen are updated by management or magazijnier" on magazijn_meldingen;

create policy "magazijn_meldingen are updated by management or magazijnier"
  on magazijn_meldingen for update
  to authenticated
  using (private.is_mgmt(auth.uid()) or private.is_magazijnier(auth.uid()))
  with check (private.is_mgmt(auth.uid()) or private.is_magazijnier(auth.uid()));

drop policy if exists "magazijn_meldingen_fotos follow the melding's visibility" on magazijn_meldingen_fotos;

create policy "magazijn_meldingen_fotos follow the melding's visibility"
  on magazijn_meldingen_fotos for select
  to authenticated
  using (
    exists (
      select 1 from magazijn_meldingen m
      where m.id = melding_id
        and (m.melder_id = auth.uid() or private.is_mgmt(auth.uid()) or private.is_magazijnier(auth.uid()))
    )
  );

drop policy if exists "magazijn photos are readable per melding visibility" on storage.objects;

create policy "magazijn photos are readable per melding visibility"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'magazijn-fotos'
    and exists (
      select 1 from magazijn_meldingen m
      where m.id = ((storage.foldername(name))[1])::uuid
        and (m.melder_id = auth.uid() or private.is_mgmt(auth.uid()) or private.is_magazijnier(auth.uid()))
    )
  );

alter table profiles drop column if exists is_magazijnier;
