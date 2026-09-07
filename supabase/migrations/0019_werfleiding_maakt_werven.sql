-- Wachtelaer Veldapp — laat werfleiding (niet enkel management) nieuwe
-- werven aanmaken vanuit de app.

create function private.is_werfleider(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from profiles where id = uid and role = 'werfleider');
$$;

drop policy "werven are created by management" on werven;

create policy "werven are created by management or werfleiding"
  on werven for insert
  to authenticated
  with check (private.is_mgmt(auth.uid()) or private.is_werfleider(auth.uid()));
