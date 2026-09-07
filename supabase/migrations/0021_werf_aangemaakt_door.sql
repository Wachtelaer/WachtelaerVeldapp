-- Wachtelaer Veldapp — fix: een werfleider kon geen nieuwe werf aanmaken.
-- De insert-policy liet dit al toe, maar de app doet een insert-met-
-- teruggave (om de nieuwe werf meteen te tonen), en Postgres controleert
-- daarbij ook meteen de select-policy op de net aangemaakte rij. Op dat
-- moment bestaat het werf_members-lidrecord (aangemaakt via de
-- werven_add_creator_as_leider-trigger) nog niet gegarandeerd op tijd,
-- dus faalde de select-check en dus de hele insert.
--
-- Oplossing: leg vast wie de werf heeft aangemaakt, en laat de select-
-- policy ook die aanmaker meteen toe — zonder afhankelijk te zijn van de
-- trigger-timing.

alter table werven add column aangemaakt_door uuid references profiles(id) default auth.uid();

drop policy "werven are readable by members and management" on werven;

create policy "werven are readable by members and management"
  on werven for select
  to authenticated
  using (
    private.is_mgmt(auth.uid())
    or private.is_werf_member(id, auth.uid())
    or aangemaakt_door = auth.uid()
  );
