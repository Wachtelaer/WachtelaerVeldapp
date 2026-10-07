import { supabase } from '@/lib/supabase';

export interface SyncResultaat {
  totaalOffertesVerwerkt: number;
  uniekeArtikelen: number;
  uitgevoerdeKlussenMetUren: number;
}

/** Ververst twee leerdata-tabellen uit ALLE offertes in Outsmart:
 *  - public.outsmart_prijsreferentie (gededupliceerde prijzen/artikelen, elke status)
 *  - public.outsmart_duurreferentie (werkelijk bestede uren per rol, enkel
 *    uit uitgevoerde offertes) — gebruikt door outsmart-offerte-aanmaken om
 *    zowel de prijs als het AANTAL uren op echte historiek te gronden.
 *  Duurt ~10s (haalt alle ~2000 offertes op), dus manueel te triggeren, niet
 *  bij elke offerte-aanmaak. Zie supabase/functions/outsmart-sync-referentie. */
export async function syncPrijsreferentie(): Promise<SyncResultaat> {
  const { data, error } = await supabase.functions.invoke('outsmart-sync-referentie');
  if (error) {
    const context = (error as any).context;
    if (context && typeof context.json === 'function') {
      const body = await context.json().catch(() => null);
      throw new Error(body?.error ?? error.message);
    }
    throw error;
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as SyncResultaat;
}
