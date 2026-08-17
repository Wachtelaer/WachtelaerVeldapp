import { supabase } from '@/lib/supabase';
import type { Werf, Werfrapport } from '@/lib/database.types';

export interface WerfListItem extends Werf {
  leiderNaam: string | null;
  rapportCount: number;
  fotoCount: number;
  laatsteRapport: Pick<Werfrapport, 'id' | 'datum' | 'uitgevoerd' | 'knelpunt'> | null;
  isLeider: boolean;
}

export async function listAlleWerven(): Promise<Pick<Werf, 'id' | 'naam'>[]> {
  const { data, error } = await supabase.from('werven').select('id, naam').order('naam');
  if (error) throw error;
  return data ?? [];
}

export async function createWerf(input: { code: string; naam: string; adres: string; fase?: string }): Promise<Werf> {
  const { data, error } = await supabase
    .from('werven')
    .insert({ code: input.code, naam: input.naam, adres: input.adres, fase: input.fase || 'opstart' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteWerf(werfId: string): Promise<void> {
  const { error } = await supabase.from('werven').delete().eq('id', werfId);
  if (error) throw error;
}

export async function listWervenWithSummary(profileId: string): Promise<WerfListItem[]> {
  const [{ data: werven, error: wErr }, { data: members, error: mErr }, { data: summaries, error: sErr }] =
    await Promise.all([
      supabase.from('werven').select('*').order('naam'),
      supabase.from('werf_members').select('werf_id, profile_id, is_leider, profiles(full_name)'),
      supabase.from('werf_summary').select('*'),
    ]);
  if (wErr) throw wErr;
  if (mErr) throw mErr;
  if (sErr) throw sErr;

  const leiderByWerf = new Map<string, string>();
  const myMembership = new Map<string, boolean>();
  for (const m of members ?? []) {
    const naam = (m as any).profiles?.full_name as string | undefined;
    if (m.is_leider && naam) leiderByWerf.set(m.werf_id, naam);
    if (m.profile_id === profileId) myMembership.set(m.werf_id, m.is_leider);
  }

  const summaryByWerf = new Map((summaries ?? []).map((s) => [s.werf_id, s]));
  const laatsteIds = (summaries ?? []).map((s) => s.laatste_rapport_id).filter((id): id is string => !!id);

  let laatsteById = new Map<string, Pick<Werfrapport, 'id' | 'datum' | 'uitgevoerd' | 'knelpunt'>>();
  if (laatsteIds.length) {
    const { data: laatste, error: lErr } = await supabase
      .from('werfrapporten')
      .select('id, datum, uitgevoerd, knelpunt')
      .in('id', laatsteIds);
    if (lErr) throw lErr;
    laatsteById = new Map((laatste ?? []).map((r) => [r.id, r]));
  }

  return (werven ?? []).map((w) => {
    const summary = summaryByWerf.get(w.id);
    const laatsteRapportId = summary?.laatste_rapport_id ?? null;
    return {
      ...w,
      leiderNaam: leiderByWerf.get(w.id) ?? null,
      rapportCount: summary?.rapport_count ?? 0,
      fotoCount: summary?.foto_count ?? 0,
      laatsteRapport: laatsteRapportId ? laatsteById.get(laatsteRapportId) ?? null : null,
      isLeider: myMembership.get(w.id) ?? false,
    };
  });
}

export async function getWerf(werfId: string): Promise<Werf> {
  const { data, error } = await supabase.from('werven').select('*').eq('id', werfId).single();
  if (error) throw error;
  return data;
}

export async function isLeiderOfWerf(werfId: string, profileId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('werf_members')
    .select('is_leider')
    .eq('werf_id', werfId)
    .eq('profile_id', profileId)
    .maybeSingle();
  if (error) throw error;
  return data?.is_leider ?? false;
}

export async function listRapportenForWerf(werfId: string): Promise<
  (Werfrapport & { auteurNaam: string })[]
> {
  const { data, error } = await supabase
    .from('werfrapporten')
    .select('*, profiles(full_name)')
    .eq('werf_id', werfId)
    .order('datum', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ ...r, auteurNaam: r.profiles?.full_name ?? 'Onbekend' }));
}

export async function listRecentFotosForWerf(werfId: string, limit = 6) {
  const { data, error } = await supabase
    .from('werfrapport_fotos')
    .select('id, storage_path, label, created_at, werfrapporten!inner(werf_id)')
    .eq('werfrapporten.werf_id', werfId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
