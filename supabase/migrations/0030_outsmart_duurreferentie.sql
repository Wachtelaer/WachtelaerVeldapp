-- Referentie van werkelijk bestede uren per afgewerkte klus, opgebouwd uit
-- offertes met Outsmart-status UITGEVOERD (EXECUTED) — gebruikt als leerdata
-- om de AI-agent het AANTAL uren (niet enkel de prijs) te laten gronden op
-- echte, vergelijkbare eerder uitgevoerde klussen in plaats van vrij te
-- laten gokken. Zie outsmart-sync-referentie (zelfde sync-pas als
-- outsmart_prijsreferentie, geen extra Outsmart-call nodig).
create table public.outsmart_duurreferentie (
  id bigint generated always as identity primary key,
  quo_id text not null unique,
  omschrijving text not null,
  datum date,
  uren jsonb not null default '{}'::jsonb, -- { "<hourtypeCode>": <aantal uur> }
  totaal_uren numeric not null default 0,
  bijgewerkt_op timestamptz not null default now()
);

alter table public.outsmart_duurreferentie enable row level security;
-- Enkel server-side (edge functions met service role) lezen/schrijven deze
-- tabel — geen directe client-toegang nodig of gewenst.
