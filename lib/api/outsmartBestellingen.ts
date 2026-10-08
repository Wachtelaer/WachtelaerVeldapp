import { supabase } from '@/lib/supabase';

export interface BestellijstBijdrage {
  offerteNummer: string;
  klantNaam: string | null;
  aantal: number;
  periodeStart: string | null;
}

export interface BestellijstItem {
  materiaalCode: string;
  omschrijving: string;
  eenheid: string;
  totaalNodig: number;
  voorradig: number;
  bestelDrempel: number;
  tekort: number;
  opVoorraad: boolean;
  vroegsteDatum: string | null;
  offertes: BestellijstBijdrage[];
}

/** Welk materiaal wanneer besteld moet worden, op basis van aanvaarde
 *  offertes, gekruist met de voorraad in magazijn Bodtkaai 25 — zie
 *  supabase/functions/outsmart-bestellingen. Enkel bereikbaar door het ene
 *  account waarvoor deze verborgen tab bedoeld is. */
export async function listBestellijst(): Promise<BestellijstItem[]> {
  const { data, error } = await supabase.functions.invoke('outsmart-bestellingen');
  if (error) {
    const context = (error as any).context;
    if (context && typeof context.json === 'function') {
      const body = await context.json().catch(() => null);
      throw new Error(body?.error ?? error.message);
    }
    throw error;
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return (data as any)?.bestellijst ?? [];
}
