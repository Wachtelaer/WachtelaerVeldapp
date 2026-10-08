import { supabase } from '@/lib/supabase';

export interface NieuweOfferteRegel {
  omschrijving: string;
  aantal: number;
  eenheid: string;
  prijs: number;
  /** Kostprijs per eenheid — Outsmart zelf toont/bewaart dit niet (de
   *  quotations-API negeert purchase_price bij het aanmaken), dus dit
   *  scherm is de enige plek waar deze waarde nog zichtbaar is. */
  inkoopprijs: number;
  materiaalCode: string | null;
}

export interface NieuweOfferte {
  nummer: string;
  status: string;
  bedrag: string;
  url: string | null;
  regels: NieuweOfferteRegel[];
  margeEuro: number;
  margePercent: number | null;
}

export interface NieuweOfferteResultaat {
  offerte: NieuweOfferte;
  toelichting: string | null;
}

/** Laat de agent (Claude) zelf een nieuwe offerte aanmaken in Outsmart voor
 *  een bestaande klant — op basis van een vrije-tekst omschrijving en
 *  prijszetting uit historische offertes. Autonoom: geen goedkeuringsstap,
 *  per expliciete keuze. Komt altijd binnen als Outsmart-status CONCEPT
 *  (intern, nooit verstuurd naar de klant) — zie
 *  supabase/functions/outsmart-offerte-aanmaken. */
export async function maakOfferteAan(input: {
  debtorNr: string;
  klantNaam: string;
  omschrijving: string;
}): Promise<NieuweOfferteResultaat> {
  const { data, error } = await supabase.functions.invoke('outsmart-offerte-aanmaken', { body: input });
  if (error) {
    const context = (error as any).context;
    if (context && typeof context.json === 'function') {
      const body = await context.json().catch(() => null);
      throw new Error(body?.error ?? error.message);
    }
    throw error;
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as NieuweOfferteResultaat;
}
