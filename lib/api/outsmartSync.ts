import { supabase } from '@/lib/supabase';

export interface SyncResultaat {
  totaalOffertesVerwerkt: number;
  uniekeArtikelen: number;
}

/** Ververst de gededupliceerde prijsreferentie (public.outsmart_prijsreferentie)
 *  uit ALLE offertes in Outsmart, elke status — gebruikt als leerdata door
 *  outsmart-offerte-aanmaken. Duurt ~10s (haalt alle ~2000 offertes op), dus
 *  manueel te triggeren, niet bij elke offerte-aanmaak. Zie
 *  supabase/functions/outsmart-sync-referentie. */
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
