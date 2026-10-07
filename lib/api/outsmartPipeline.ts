import { supabase } from '@/lib/supabase';

export interface OutsmartOfferteRegel {
  nummer: string;
  status: string;
  bedrag: string;
  datumAanvaard: string | null;
}

export interface OutsmartFactuurRegel {
  nummer: string;
  status: string;
  bedrag: string;
  betaaldOp: string | null;
}

export interface OutsmartMateriaalRegel {
  code: string;
  omschrijving: string;
  aantal: number;
  eenheid: string;
}

export interface Dossier {
  id: string;
  naam: string;
  fase: string | null;
  klantNaam: string | null;
  adres: string | null;
  latitude: number | null;
  longitude: number | null;
  periodeStart: string | null;
  periodeEind: string | null;
  offertes: OutsmartOfferteRegel[];
  facturen: OutsmartFactuurRegel[];
  materialen: OutsmartMateriaalRegel[];
  margeEuro: number;
  margePercent: number | null;
}

/** Per-dossier pipeline (offerte -> werf-fase -> facturatie) pulled live
 *  from Outsmart — see supabase/functions/outsmart-pipeline. Only reachable
 *  by the one account this hidden tab belongs to. */
export async function listDossiers(): Promise<Dossier[]> {
  const { data, error } = await supabase.functions.invoke('outsmart-pipeline');
  if (error) {
    const context = (error as any).context;
    if (context && typeof context.json === 'function') {
      const body = await context.json().catch(() => null);
      throw new Error(body?.error ?? error.message);
    }
    throw error;
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return (data as any)?.dossiers ?? [];
}
