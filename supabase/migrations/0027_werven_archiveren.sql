-- Wachtelaer Veldapp — werven archiveren: data blijft bewaard, maar de
-- werf verdwijnt uit de gewone lijst en is niet langer zichtbaar voor
-- werfleden — enkel management ziet ze nog, via een apart archief.

alter table werven add column gearchiveerd boolean not null default false;

drop policy "werven are readable by members and management" on werven;

create policy "werven are readable by members and management"
  on werven for select
  to authenticated
  using (
    private.is_mgmt(auth.uid())
    or (not gearchiveerd and (private.is_werf_member(id, auth.uid()) or aangemaakt_door = auth.uid()))
  );

create policy "werven are archived by management"
  on werven for update
  to authenticated
  using (private.is_mgmt(auth.uid()))
  with check (private.is_mgmt(auth.uid()));
