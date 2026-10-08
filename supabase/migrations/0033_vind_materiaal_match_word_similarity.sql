-- Verbetert vind_materiaal_match (migratie 0032): de oorspronkelijke versie
-- riep similarity() rechtstreeks aan in de WHERE-clausule, wat de
-- trigram-index NIET gebruikte (bevestigd via EXPLAIN ANALYZE: sequential
-- scan over alle 150k+ artikelen, ~2s per aanroep). Daarnaast bleek pure
-- similarity() te streng zodra de agent extra, legitieme woorden aan een
-- omschrijving toevoegt (bv. "(hangend model)") — de gevraagde omschrijving
-- bevat dan meer dan het artikel zelf, wat de volledige-string-gelijkenis
-- verlaagt ook al is het wel degelijk het juiste artikel.
--
-- Nieuwe aanpak, elk live getest tegen echte (foute en correcte) gevallen:
--   1. Snelle, GEÏNDEXEERDE voorfiltering via de '%'-operator (gebruikt de
--      trigram GIN-index — ~85ms i.p.v. ~2-4s).
--   2. Acceptatiedrempel via word_similarity() — vergelijkt het artikel
--      tegen het best passende DEEL van de gevraagde omschrijving, dus
--      extra woorden in de vraag verlagen de score niet onterecht.
--   3. Rangschikking via de gewone similarity() (volledige string) — zonder
--      dit zou een kort, generiek artikel ("Aansluiting") dat toevallig
--      volledig in de vraag voorkomt altijd winnen van een langer, net
--      specifieker en correct artikel ("Elektrische aansluiting SWW"),
--      puur omdat het kortere artikel een triviale word_similarity van 1.0
--      haalt — live vastgesteld en hiermee opgelost.
create or replace function public.vind_materiaal_match(zoekterm text, min_score real default 0.3)
returns table (code text, omschrijving text, prijs numeric, eenheid text, score real)
language sql
stable
as $$
  select code, omschrijving, prijs, eenheid, score
  from (
    select m.code, m.omschrijving, m.prijs, m.eenheid,
           similarity(m.omschrijving, zoekterm) as score,
           word_similarity(m.omschrijving, zoekterm) as wscore
    from public.outsmart_materialen m
    where m.omschrijving % zoekterm
  ) kandidaten
  where wscore >= min_score
  order by score desc
  limit 1;
$$;
