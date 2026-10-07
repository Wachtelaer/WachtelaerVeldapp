-- Gededupliceerde prijs-/artikelreferentie, opgebouwd uit ALLE offertes in
-- Outsmart (elke status, niet enkel aanvaard) — gebruikt als leerdata voor
-- de AI-agent bij het opstellen van nieuwe offertes. Live ophalen van alle
-- offertes bij elke aanvraag is te traag (2022 offertes, ~34k regels,
-- ~57MB, ~10s) — deze tabel wordt periodiek bijgewerkt via
-- outsmart-sync-referentie en daarna lokaal/snel geraadpleegd.
create table public.outsmart_prijsreferentie (
  id bigint generated always as identity primary key,
  sleutel text not null unique, -- materiaal_code, of omschrijving in kleine letters als er geen code is
  materiaal_code text,
  omschrijving text not null,
  eenheid text,
  prijs numeric not null,
  inkoopprijs numeric not null default 0,
  btw numeric not null default 21,
  laatst_gebruikt date,
  aantal_offertes integer not null default 1,
  bijgewerkt_op timestamptz not null default now()
);

alter table public.outsmart_prijsreferentie enable row level security;
-- Enkel server-side (edge functions met service role) lezen/schrijven deze
-- tabel — geen directe client-toegang nodig of gewenst.
