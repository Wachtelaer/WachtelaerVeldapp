-- Wachtelaer Veldapp — een werfleider die een nieuwe werf aanmaakt moet die
-- werf ook zelf kunnen zien (de select-policy op werven vereist mgmt of
-- werf_member), en werf_members zelf is enkel door management te wijzigen.
-- Dit voegt de aanmaker automatisch toe als leider — enkel wanneer die geen
-- management is, want management ziet toch al alles en hoefde daarvoor nooit
-- lid te zijn.

create function private.add_creator_as_werf_leider()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.is_mgmt(auth.uid()) then
    insert into werf_members (werf_id, profile_id, is_leider)
    values (new.id, auth.uid(), true)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger werven_add_creator_as_leider
after insert on werven
for each row execute function private.add_creator_as_werf_leider();
