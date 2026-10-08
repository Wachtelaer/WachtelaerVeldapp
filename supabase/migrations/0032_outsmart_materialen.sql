-- Outsmart's volledige artikelcatalogus ("materials", 156k+ rijen, 156.886
-- bij laatste controle, ~50MB) — te groot om bij elke offerte-aanmaak live
-- op te halen en in het geheugen te doorzoeken. Wordt hier gesynchroniseerd
-- en nadien via pg_trgm (trigram-gelijkenis, geïndexeerd) doorzocht vanuit
-- outsmart-offerte-aanmaken: één snelle, geïndexeerde SQL-match per
-- voorgestelde regel i.p.v. alles naar de edge function te moeten halen.
--
-- Nodig omdat de agent tot nu toe zelf artikelnummers (en prijzen) verzon
-- of oversloeg i.p.v. het echte, actuele artikel + actuele prijs uit
-- Outsmart's eigen catalogus te nemen (de prijsreferentie-tabel bevriest
-- de prijs op het moment van een oude offerte, niet de huidige prijs).
create extension if not exists pg_trgm;

create table public.outsmart_materialen (
  id bigint generated always as identity primary key,
  code text not null unique,
  omschrijving text not null,
  prijs numeric not null default 0,
  eenheid text,
  btw_code text,
  bijgewerkt_op timestamptz not null default now()
);

create index outsmart_materialen_omschrijving_trgm_idx
  on public.outsmart_materialen using gin (omschrijving gin_trgm_ops);

alter table public.outsmart_materialen enable row level security;
-- Enkel server-side (edge functions met service role) lezen/schrijven deze
-- tabel — geen directe client-toegang nodig of gewenst.

-- Geeft het best gelijkende artikel (op trigram-gelijkenis van de
-- omschrijving) terug voor een gegeven zoekterm, boven een minimumscore —
-- draait volledig in de database (geïndexeerd), dus snel genoeg om per
-- voorgestelde offerteregel aan te roepen zonder de volledige catalogus
-- naar de edge function te moeten halen.
create or replace function public.vind_materiaal_match(zoekterm text, min_score real default 0.3)
returns table (code text, omschrijving text, prijs numeric, eenheid text, score real)
language sql
stable
as $$
  select m.code, m.omschrijving, m.prijs, m.eenheid, similarity(m.omschrijving, zoekterm) as score
  from public.outsmart_materialen m
  where similarity(m.omschrijving, zoekterm) >= min_score
  order by score desc
  limit 1;
$$;
