-- Wachtelaer Veldapp — lets a magazijn_melding also represent bringing
-- stock back, not just taking it. Same shape (tekst/hoeveelheid/werf/
-- foto's/verwerkt) as a regular melding, just tagged by direction so the
-- magazijnier's overzicht can tell them apart.

alter table magazijn_meldingen
  add column type text not null default 'genomen' check (type in ('genomen', 'retour'));
