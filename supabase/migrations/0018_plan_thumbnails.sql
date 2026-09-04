-- Wachtelaer Veldapp — real page-1 thumbnails for uploaded plans (PDFs),
-- rendered server-side (mupdf, in the plan-thumbnail edge function) so
-- nothing about the client app needs a native PDF-rendering dependency.

alter table plan_versies add column thumbnail_path text;

-- Fires the render asynchronously right after a new version lands — the
-- shared secret (matching the edge function's PLAN_THUMBNAIL_SECRET) is
-- the only auth this internal, trigger-only endpoint has, since there's
-- no user session to check here.
--
-- The literal below is a placeholder — the deployed version of this
-- function carries the real secret (set once directly in the database,
-- not committed here). Re-running this migration as-is would need that
-- value substituted in, matching whatever PLAN_THUMBNAIL_SECRET is set
-- to on the plan-thumbnail edge function.
create or replace function private.trigger_plan_thumbnail()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://iiejlzdybamfiawdnhgv.supabase.co/functions/v1/plan-thumbnail',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', '<PLAN_THUMBNAIL_SECRET>'
    ),
    body := jsonb_build_object('versie_id', new.id),
    timeout_milliseconds := 20000
  );
  return new;
end;
$$;

create trigger plan_versies_thumbnail
after insert on plan_versies
for each row execute function private.trigger_plan_thumbnail();
