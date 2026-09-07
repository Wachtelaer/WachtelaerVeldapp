-- Wachtelaer Veldapp — herstel de insert-policy op werven. Tijdens het
-- debuggen van de RLS-RETURNING-bug werd deze policy tijdelijk vervangen
-- door een hardcoded test-check (op één specifiek mgmt-account) om het
-- probleem te isoleren, en die tijdelijke versie bleef per ongeluk staan
-- in plaats van de echte check uit migratie 0019.

drop policy "werven are created by management or werfleiding" on werven;

create policy "werven are created by management or werfleiding"
  on werven for insert
  to authenticated
  with check (private.is_mgmt(auth.uid()) or private.is_werfleider(auth.uid()));
