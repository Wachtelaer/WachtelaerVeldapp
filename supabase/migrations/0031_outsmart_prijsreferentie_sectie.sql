-- Outsmart deelt offerteregels in hoofdstukken/secties in via een vrij
-- tekstveld 'section' per regel (bv. "Ketel", "Schouw") — bevestigd via
-- live data (1034 van de 2023 offertes gebruiken meerdere secties). Dit
-- veld bewaren we nu ook in de prijsreferentie, zodat de AI-agent nieuwe
-- offertes in dezelfde indeling kan opbouwen als hoe ze voorheen gemaakt
-- werden, in plaats van alles in één platte lijst te zetten.
alter table public.outsmart_prijsreferentie
  add column sectie text;
