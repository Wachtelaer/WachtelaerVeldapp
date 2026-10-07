-- Wachtelaer Veldapp — laat niet enkel management, maar ook de werfleider
-- van een werf plannen/documenten toevoegen (nieuwe documenten én nieuwe
-- versies van bestaande). Bert (sales, maar wel leider op meerdere
-- werven) kon hierdoor geen plannen toevoegen aan zijn eigen werven.

alter policy "plan_documenten are created by management" on plan_documenten
  with check (
    private.is_mgmt(auth.uid()) or private.is_werf_leider(werf_id, auth.uid())
  );

alter policy "plan_versies are added by management" on plan_versies
  with check (
    geupload_door = auth.uid()
    and (
      private.is_mgmt(auth.uid())
      or exists (
        select 1 from plan_documenten d
        where d.id = document_id and private.is_werf_leider(d.werf_id, auth.uid())
      )
    )
  );

alter policy "werf plan files are uploaded by management" on storage.objects
  with check (
    bucket_id = 'werf-plannen'
    and (
      private.is_mgmt(auth.uid())
      or private.is_werf_leider(((storage.foldername(name))[1])::uuid, auth.uid())
    )
  );
