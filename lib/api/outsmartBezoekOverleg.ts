import { supabase } from '@/lib/supabase';

export interface BezoekBericht {
  rol: 'gebruiker' | 'agent';
  tekst: string;
}

export interface OverlegAntwoord {
  status: 'vraag' | 'klaar';
  tekst: string;
}

/** Live overleg met de agent tijdens een klantenbezoek/opmeting: krijgt het
 *  hele gesprek tot nu toe mee en antwoordt met een vervolgvraag, of dat er
 *  genoeg info is om de offerte op te stellen. Zie
 *  supabase/functions/outsmart-bezoek-overleg. */
export async function overlegMetAgent(
  klantNaam: string,
  berichten: BezoekBericht[]
): Promise<OverlegAntwoord> {
  const { data, error } = await supabase.functions.invoke('outsmart-bezoek-overleg', {
    body: { klantNaam, berichten },
  });
  if (error) {
    const context = (error as any).context;
    if (context && typeof context.json === 'function') {
      const body = await context.json().catch(() => null);
      throw new Error(body?.error ?? error.message);
    }
    throw error;
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as OverlegAntwoord;
}
