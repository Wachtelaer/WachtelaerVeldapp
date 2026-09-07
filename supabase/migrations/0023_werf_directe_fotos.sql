-- Wachtelaer Veldapp — laat werfleden (incl. de rol "Werf", d.i. gewone
-- werknemers op een werf, die zelf geen werfrapport mogen aanmaken) ook
-- rechtstreeks foto's toevoegen aan een werf vanuit het tabblad Werven,
-- los van een werfrapport.

alter table werfrapport_fotos alter column rapport_id drop not null;
alter table werfrapport_fotos add column werf_id uuid references werven(id) on delete cascade;

alter table werfrapport_fotos add constraint werfrapport_fotos_rapport_of_werf
  check (rapport_id is not null or werf_id is not null);

-- Bestaande, aan een rapport gekoppelde foto's krijgen hun werf_id mee,
-- zodat lijst-queries voortaan gewoon op werf_id kunnen filteren.
update werfrapport_fotos f
  set werf_id = r.werf_id
  from werfrapporten r
  where f.rapport_id = r.id and f.werf_id is null;

-- Nieuwe aan een rapport gekoppelde foto's krijgen hun werf_id automatisch
-- mee, zodat de bestaande upload-code (die enkel rapport_id meegeeft)
-- ongewijzigd kan blijven.
create function private.set_werfrapport_foto_werf_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.werf_id is null and new.rapport_id is not null then
    select werf_id into new.werf_id from werfrapporten where id = new.rapport_id;
  end if;
  return new;
end;
$$;

create trigger werfrapport_fotos_set_werf_id
before insert on werfrapport_fotos
for each row execute function private.set_werfrapport_foto_werf_id();

drop policy "werfrapport_fotos follow the report's visibility" on werfrapport_fotos;

create policy "werfrapport_fotos follow the report's visibility"
  on werfrapport_fotos for select
  to authenticated
  using (
    (rapport_id is not null and private.can_view_rapport(rapport_id, auth.uid()))
    or (werf_id is not null and (private.is_mgmt(auth.uid()) or private.is_werf_member(werf_id, auth.uid())))
  );

drop policy "werfrapport_fotos are added by the report's author" on werfrapport_fotos;

create policy "werfrapport_fotos are added by the report's author or werf members"
  on werfrapport_fotos for insert
  to authenticated
  with check (
    (
      rapport_id is not null
      and exists (select 1 from werfrapporten r where r.id = rapport_id and r.auteur_id = auth.uid())
    )
    or (
      rapport_id is null
      and werf_id is not null
      and (private.is_mgmt(auth.uid()) or private.is_werf_member(werf_id, auth.uid()))
    )
  );

drop policy "werfrapport photos are readable per report visibility" on storage.objects;

create policy "werfrapport photos are readable per report visibility"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'werfrapport-fotos'
    and exists (
      select 1 from werfrapport_fotos f
      where f.storage_path = storage.objects.name
        and (
          (f.rapport_id is not null and private.can_view_rapport(f.rapport_id, auth.uid()))
          or (f.werf_id is not null and (private.is_mgmt(auth.uid()) or private.is_werf_member(f.werf_id, auth.uid())))
        )
    )
  );

-- foto_count telt nu rechtstreeks via werf_id (dekt zowel rapport- als
-- direct-aan-de-werf-gekoppelde foto's, dankzij de backfill/trigger hierboven).
create or replace view werf_summary
  with (security_invoker = true)
  as
  select
    w.id as werf_id,
    (select count(*) from werfrapporten r where r.werf_id = w.id) as rapport_count,
    (select count(*) from werfrapport_fotos f where f.werf_id = w.id) as foto_count,
    (
      select r.id from werfrapporten r
      where r.werf_id = w.id
      order by r.datum desc, r.created_at desc
      limit 1
    ) as laatste_rapport_id
  from werven w;
