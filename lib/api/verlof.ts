import { supabase } from '@/lib/supabase';
import type { VerlofStatus, VerlofType, Verlofaanvraag } from '@/lib/database.types';

export interface NieuweVerlofaanvraagInput {
  aanvragerId: string;
  type: VerlofType;
  van: string;
  tot: string;
  nota: string;
}

export async function createAanvraag(input: NieuweVerlofaanvraagInput): Promise<void> {
  const { error } = await supabase.from('verlofaanvragen').insert({
    aanvrager_id: input.aanvragerId,
    type: input.type,
    van: input.van,
    tot: input.tot,
    nota: input.nota,
  });
  if (error) throw error;
}

export async function listMijnAanvragen(aanvragerId: string): Promise<Verlofaanvraag[]> {
  const { data, error } = await supabase
    .from('verlofaanvragen')
    .select('*')
    .eq('aanvrager_id', aanvragerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function countInBehandeling(aanvragerId: string): Promise<number> {
  const { count, error } = await supabase
    .from('verlofaanvragen')
    .select('id', { count: 'exact', head: true })
    .eq('aanvrager_id', aanvragerId)
    .eq('status', 'wacht');
  if (error) throw error;
  return count ?? 0;
}

export async function countTeKeuren(): Promise<number> {
  const { count, error } = await supabase
    .from('verlofaanvragen')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'wacht');
  if (error) throw error;
  return count ?? 0;
}

export interface TeKeurenItem extends Verlofaanvraag {
  aanvragerNaam: string;
  impact: string;
}

export async function listTeKeuren(): Promise<TeKeurenItem[]> {
  const { data, error } = await supabase
    .from('verlofaanvragen')
    .select('*, profiles!verlofaanvragen_aanvrager_id_fkey(full_name)')
    .eq('status', 'wacht')
    .order('created_at', { ascending: true });
  if (error) throw error;

  const items = await Promise.all(
    (data ?? []).map(async (a: any) => ({
      ...a,
      aanvragerNaam: a.profiles?.full_name ?? 'Onbekend',
      impact: await getImpact(a.aanvrager_id, a.van, a.tot),
    }))
  );
  return items;
}

export async function beoordeel(id: string, behandelaarId: string, status: Extract<VerlofStatus, 'goed' | 'nee'>) {
  const { error } = await supabase
    .from('verlofaanvragen')
    .update({ status, behandeld_door: behandelaarId, behandeld_op: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

/** "Wie van jouw werf is er in diezelfde periode al weg" — for the request form's conflict banner. */
export async function getConflict(aanvragerId: string, van: string, tot: string): Promise<string> {
  if (!van || !tot) return 'Kies eerst een periode.';

  const { data: myWerven, error: mwErr } = await supabase
    .from('werf_members')
    .select('werf_id')
    .eq('profile_id', aanvragerId);
  if (mwErr) throw mwErr;
  const werfIds = (myWerven ?? []).map((w) => w.werf_id);
  if (werfIds.length === 0) return 'Je bent aan geen werf toegewezen — geen conflicten te checken.';

  const { data: mates, error: mErr } = await supabase
    .from('werf_members')
    .select('profile_id')
    .in('werf_id', werfIds)
    .neq('profile_id', aanvragerId);
  if (mErr) throw mErr;
  const mateIds = [...new Set((mates ?? []).map((m) => m.profile_id))];
  if (mateIds.length === 0) return 'Niemand anders op jouw werf(en) — geen conflicten.';

  const { data: overlapping, error: oErr } = await supabase
    .from('verlofaanvragen')
    .select('type, van, tot, status, profiles!verlofaanvragen_aanvrager_id_fkey(full_name)')
    .in('aanvrager_id', mateIds)
    .in('status', ['wacht', 'goed'])
    .lte('van', tot)
    .gte('tot', van);
  if (oErr) throw oErr;

  if (!overlapping || overlapping.length === 0) return 'Niemand van jouw werf is in deze periode al weg.';

  return overlapping
    .map((o: any) => {
      const statusLabel = o.status === 'goed' ? 'goedgekeurd' : 'in behandeling';
      return `${o.profiles?.full_name ?? 'Onbekend'} — ${formatPeriode(o.van, o.tot)} (${o.type}, ${statusLabel})`;
    })
    .join(' · ');
}

async function getImpact(aanvragerId: string, van: string, tot: string): Promise<string> {
  const { data: memberships, error } = await supabase
    .from('werf_members')
    .select('werf_id, werven(naam)')
    .eq('profile_id', aanvragerId);
  if (error) throw error;
  if (!memberships || memberships.length === 0) return 'Niet aan een werf toegewezen.';

  const parts = await Promise.all(
    memberships.map(async (m: any) => {
      const werfNaam = m.werven?.naam ?? 'werf';
      const { count: totalCount } = await supabase
        .from('werf_members')
        .select('profile_id', { count: 'exact', head: true })
        .eq('werf_id', m.werf_id);
      const { data: mates } = await supabase
        .from('werf_members')
        .select('profile_id')
        .eq('werf_id', m.werf_id)
        .neq('profile_id', aanvragerId);
      const mateIds = (mates ?? []).map((x) => x.profile_id);
      let alWegCount = 0;
      if (mateIds.length > 0) {
        const { count } = await supabase
          .from('verlofaanvragen')
          .select('id', { count: 'exact', head: true })
          .in('aanvrager_id', mateIds)
          .in('status', ['wacht', 'goed'])
          .lte('van', tot)
          .gte('tot', van);
        alWegCount = count ?? 0;
      }
      const anderen = (totalCount ?? 1) - 1;
      return alWegCount > 0
        ? `${werfNaam}: ${alWegCount} van ${anderen} andere ploegleden ook al weg in deze periode`
        : `${werfNaam}: rest van de ploeg (${anderen}) beschikbaar in deze periode`;
    })
  );
  return parts.join(' · ');
}

function formatPeriode(van: string, tot: string) {
  const vanD = new Date(van);
  const totD = new Date(tot);
  const fmt = (d: Date) => d.toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' });
  return van === tot ? fmt(vanD) : `${fmt(vanD)} – ${fmt(totD)}`;
}

export { formatPeriode };
