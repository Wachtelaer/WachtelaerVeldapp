-- Wachtelaer Veldapp — een taak kan voortaan ook aan een hele werf
-- toegewezen worden (in plaats van verplicht aan één medewerker): elk lid
-- van die werf ziet en kan de taak afvinken. toegewezen_aan wordt daarvoor
-- nullable; werf_id blijft de link, maar is dan verplicht.

alter table taken alter column toegewezen_aan drop not null;

alter table taken add constraint taken_toegewezen_of_werf
  check (toegewezen_aan is not null or werf_id is not null);

drop policy "taken are readable by their assignee and management" on taken;

create policy "taken are readable by their assignee, their werf or management"
  on taken for select
  to authenticated
  using (
    toegewezen_aan = auth.uid()
    or private.is_mgmt(auth.uid())
    or (toegewezen_aan is null and werf_id is not null and private.is_werf_member(werf_id, auth.uid()))
  );

drop policy "taken are updated by their assignee or management" on taken;

create policy "taken are updated by their assignee, their werf or management"
  on taken for update
  to authenticated
  using (
    toegewezen_aan = auth.uid()
    or private.is_mgmt(auth.uid())
    or (toegewezen_aan is null and werf_id is not null and private.is_werf_member(werf_id, auth.uid()))
  )
  with check (
    toegewezen_aan = auth.uid()
    or private.is_mgmt(auth.uid())
    or (toegewezen_aan is null and werf_id is not null and private.is_werf_member(werf_id, auth.uid()))
  );
