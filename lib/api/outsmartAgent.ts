import { supabase } from '@/lib/supabase';
import type { Dossier } from '@/lib/api/outsmartPipeline';

export interface AgentAdvies {
  id: string;
  prioriteit: 'hoog' | 'normaal' | 'laag';
  advies: string;
}

export interface AgentResultaat {
  adviezen: AgentAdvies[];
  aandachtspunten: string[];
}

/** Vraagt de AI-agent (Claude) om per dossier een prioriteit + advies, op
 *  basis van de al opgehaalde Outsmart-pipeline — zie
 *  supabase/functions/outsmart-agent. Puur tekstueel, voert zelf nooit iets
 *  uit. */
export async function vraagAgentAdvies(dossiers: Dossier[]): Promise<AgentResultaat> {
  const { data, error } = await supabase.functions.invoke('outsmart-agent', { body: { dossiers } });
  if (error) {
    const context = (error as any).context;
    if (context && typeof context.json === 'function') {
      const body = await context.json().catch(() => null);
      throw new Error(body?.error ?? error.message);
    }
    throw error;
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return {
    adviezen: (data as any)?.adviezen ?? [],
    aandachtspunten: (data as any)?.aandachtspunten ?? [],
  };
}
