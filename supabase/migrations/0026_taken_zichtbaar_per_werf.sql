-- Wachtelaer Veldapp — de werf-detailpagina toont voortaan alle taken die
-- aan die werf gekoppeld zijn (zowel gedeelde "hele werf"-taken als taken
-- die aan één specifieke collega zijn toegewezen maar met deze werf
-- gelabeld zijn), zodat iedereen op de werf ziet wat er nog open staat.
-- Wijzigen (afvinken) blijft wel beperkt tot de eigenlijke toegewezene,
-- management, of — bij een gedeelde werf-taak — eender welk werflid.

drop policy "taken are readable by their assignee, their werf or management" on taken;

create policy "taken are readable by their assignee, their werf or management"
  on taken for select
  to authenticated
  using (
    toegewezen_aan = auth.uid()
    or private.is_mgmt(auth.uid())
    or (werf_id is not null and private.is_werf_member(werf_id, auth.uid()))
  );
