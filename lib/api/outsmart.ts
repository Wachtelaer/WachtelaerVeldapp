import { supabase } from '@/lib/supabase';

export interface GoedgekeurdeOfferte {
  id: string;
  nummer: string;
  klantNaam: string;
  adres: string | null;
  omschrijving: string;
  bedrag: string;
  datumAanvaard: string | null;
  substatus: string | null;
}

/** Approved ("ACCEPTED") quotations pulled live from Outsmart — see
 *  supabase/functions/outsmart-offertes for the actual API call. */
export async function listGoedgekeurdeOffertes(): Promise<GoedgekeurdeOfferte[]> {
  const { data, error } = await supabase.functions.invoke('outsmart-offertes');
  if (error) {
    const context = (error as any).context;
    if (context && typeof context.json === 'function') {
      const body = await context.json().catch(() => null);
      throw new Error(body?.error ?? error.message);
    }
    throw error;
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return (data as any)?.offertes ?? [];
}
