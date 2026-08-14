-- Optional demo data — matches the werven from the Claude Design prototype.
-- Run after 0001_werfrapporten.sql. Assigning werf_members requires real
-- profile ids, so that step is left to `supabase/README.md`.

insert into werven (code, naam, adres, fase) values
  ('W-2026-041', 'Residentie Ter Beke', 'Bekestraat 8, Aalst', 'ruwbouw'),
  ('W-2026-052', 'Bakkerij De Smet', 'Markt 12, Denderleeuw', 'afwerking'),
  ('W-2026-060', 'Appartementen Kaaizicht', 'Désiré De Bodtkaai, Ninove', 'opstart')
on conflict (code) do nothing;
