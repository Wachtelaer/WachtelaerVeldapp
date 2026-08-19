-- Wachtelaer Veldapp — a dedicated "magazijnier" permission, separate from
-- the role enum. A magazijnier keeps their normal role (tech, werfleider,
-- ...) but additionally gets to see and process every Magazijn-melding,
-- same as management already does.

alter table profiles add column is_magazijnier boolean not null default false;

create function private.is_magazijnier(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from profiles where id = uid and is_magazijnier);
$$;

drop policy "magazijn_meldingen are readable by their melder and management" on magazijn_meldingen;

create policy "magazijn_meldingen are readable by their melder, management and magazijnier"
  on magazijn_meldingen for select
  to authenticated
  using (melder_id = auth.uid() or private.is_mgmt(auth.uid()) or private.is_magazijnier(auth.uid()));

drop policy "magazijn_meldingen are updated by management only" on magazijn_meldingen;

create policy "magazijn_meldingen are updated by management or magazijnier"
  on magazijn_meldingen for update
  to authenticated
  using (private.is_mgmt(auth.uid()) or private.is_magazijnier(auth.uid()))
  with check (private.is_mgmt(auth.uid()) or private.is_magazijnier(auth.uid()));

drop policy "magazijn_meldingen_fotos follow the melding's visibility" on magazijn_meldingen_fotos;

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

drop policy "magazijn photos are readable per melding visibility" on storage.objects;

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
