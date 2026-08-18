-- Wachtelaer Veldapp — a single, general "Team Wachtelaer" chat that
-- everyone can see, without being tied to a specific job site.
--
-- Modeled as a special werven row (flagged is_algemeen) instead of a
-- parallel chat schema, so it reuses the entire existing werfchat
-- table/RLS/storage machinery as-is. It just isn't a real site — the app
-- filters it out of the Werven tab, Ploeg & rechten, and plannen, and no
-- werfrapporten/opmetingen/plannen are ever created against it.

alter table werven add column is_algemeen boolean not null default false;

-- Additional permissive policies (OR'd with the existing is_mgmt/
-- is_werf_member ones) so everyone signed in can see and use this one
-- werf's chat, regardless of werf_members.
create policy "werven: iedereen ziet de algemene chat-werf"
  on werven for select
  to authenticated
  using (is_algemeen);

create policy "werf_chat_berichten: iedereen leest de algemene chat"
  on werf_chat_berichten for select
  to authenticated
  using (exists (select 1 from werven w where w.id = werf_id and w.is_algemeen));

create policy "werf_chat_berichten: iedereen stuurt in de algemene chat"
  on werf_chat_berichten for insert
  to authenticated
  with check (
    auteur_id = auth.uid()
    and exists (select 1 from werven w where w.id = werf_id and w.is_algemeen)
  );

create policy "werfchat photos: iedereen leest algemene chat-fotos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'werfchat-fotos'
    and exists (
      select 1 from werven w
      where w.id = ((storage.foldername(name))[1])::uuid and w.is_algemeen
    )
  );

create policy "werfchat photos: iedereen upload algemene chat-fotos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'werfchat-fotos'
    and exists (
      select 1 from werven w
      where w.id = ((storage.foldername(name))[1])::uuid and w.is_algemeen
    )
  );

insert into werven (code, naam, adres, fase, is_algemeen)
values ('ALGEMEEN', 'Team Wachtelaer', '', 'bezig', true)
on conflict (code) do nothing;
