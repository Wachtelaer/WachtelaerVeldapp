-- Wachtelaer Veldapp — management can create and delete werven from the
-- app. Deleting a werf cascades to its rapporten, chat, plannen, and
-- memberships (see the `on delete cascade` foreign keys in earlier
-- migrations) — the app confirms this with the user before calling it.

create policy "werven are created by management"
  on werven for insert
  to authenticated
  with check (private.is_mgmt(auth.uid()));

create policy "werven are deleted by management"
  on werven for delete
  to authenticated
  using (private.is_mgmt(auth.uid()));
