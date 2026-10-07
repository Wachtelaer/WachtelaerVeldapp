import { supabase } from '@/lib/supabase';

export interface GevondenKlant {
  debtorNr: string;
  naam: string;
  adres: string | null;
  telefoon: string | null;
  email: string | null;
  leadFase: string | null;
}

/** Zoekt een bestaande klant/lead op in Outsmart op (deel van de) naam —
 *  zie supabase/functions/outsmart-klant-zoeken. Geen "nieuwe klant
 *  aanmaken" hier: Outsmart vereist zelf een debtor_number bij aanmaken,
 *  dat risicovol zelf te verzinnen is. */
export async function zoekKlant(query: string): Promise<GevondenKlant[]> {
  const { data, error } = await supabase.functions.invoke('outsmart-klant-zoeken', { body: { query } });
  if (error) {
    const context = (error as any).context;
    if (context && typeof context.json === 'function') {
      const body = await context.json().catch(() => null);
      throw new Error(body?.error ?? error.message);
    }
    throw error;
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return (data as any)?.klanten ?? [];
}
