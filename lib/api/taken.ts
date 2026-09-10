import { supabase } from '@/lib/supabase';
import type { Taak } from '@/lib/database.types';

export interface TaakListItem extends Taak {
  /** null wanneer de taak aan een hele werf is toegewezen (gedeeld tussen alle leden). */
  toegewezenAanNaam: string | null;
  aangemaaktDoorNaam: string;
  gedaanDoorNaam: string | null;
  werfNaam: string | null;
}

function mapRow(r: any): TaakListItem {
  return {
    ...r,
    toegewezenAanNaam: r.toegewezen_aan ? (r.toegewezen_aan_profile?.full_name ?? 'Onbekend') : null,
    aangemaaktDoorNaam: r.aangemaakt_door_profile?.full_name ?? 'Onbekend',
    gedaanDoorNaam: r.gedaan_door_profile?.full_name ?? null,
    werfNaam: r.werven?.naam ?? null,
  };
}

const SELECT =
  '*, toegewezen_aan_profile:profiles!toegewezen_aan(full_name), aangemaakt_door_profile:profiles!aangemaakt_door(full_name), gedaan_door_profile:profiles!gedaan_door(full_name), werven(naam)';

export interface NieuweTaakInput {
  titel: string;
  omschrijving: string;
  /** null = toegewezen aan de hele werf (werfId is dan verplicht) in plaats van één medewerker. */
  toegewezenAan: string | null;
  werfId: string | null;
  aangemaaktDoor: string;
}

export async function createTaak(input: NieuweTaakInput): Promise<void> {
  const { error } = await supabase.from('taken').insert({
    titel: input.titel,
    omschrijving: input.omschrijving,
    toegewezen_aan: input.toegewezenAan,
    werf_id: input.werfId,
    aangemaakt_door: input.aangemaaktDoor,
  });
  if (error) throw error;
}

/** Mijn eigen taken, plus gedeelde taken van werven waar ik lid van ben. */
export async function listMijnTaken(profielId: string): Promise<TaakListItem[]> {
  const { data: memberships, error: mErr } = await supabase
    .from('werf_members')
    .select('werf_id')
    .eq('profile_id', profielId);
  if (mErr) throw mErr;
  const werfIds = (memberships ?? []).map((m) => m.werf_id);

  const orParts = [`toegewezen_aan.eq.${profielId}`];
  if (werfIds.length > 0) {
    orParts.push(`and(toegewezen_aan.is.null,werf_id.in.(${werfIds.join(',')}))`);
  }

  const { data, error } = await supabase
    .from('taken')
    .select(SELECT)
    .or(orParts.join(','))
    .order('gedaan', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

/** Alle taken gekoppeld aan een werf — voor de to-do-lijst op de werfpagina. */
export async function listTakenVoorWerf(werfId: string): Promise<TaakListItem[]> {
  const { data, error } = await supabase
    .from('taken')
    .select(SELECT)
    .eq('werf_id', werfId)
    .order('gedaan', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

/** Every taak — for management's overview. */
export async function listAlleTaken(): Promise<TaakListItem[]> {
  const { data, error } = await supabase
    .from('taken')
    .select(SELECT)
    .order('gedaan', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export async function zetGedaan(id: string, gedaan: boolean, doorId: string): Promise<void> {
  const { error } = await supabase
    .from('taken')
    .update(
      gedaan
        ? { gedaan: true, gedaan_op: new Date().toISOString(), gedaan_door: doorId }
        : { gedaan: false, gedaan_op: null, gedaan_door: null }
    )
    .eq('id', id);
  if (error) throw error;
}

export async function deleteTaak(id: string): Promise<void> {
  const { error } = await supabase.from('taken').delete().eq('id', id);
  if (error) throw error;
}

/** Bare id/naam list for the "toegewezen aan" picker when creating a taak. */
export async function listToewijsbareProfielen(): Promise<{ id: string; naam: string }[]> {
  const { data, error } = await supabase.from('profiles').select('id, full_name').order('full_name');
  if (error) throw error;
  return (data ?? []).map((p) => ({ id: p.id, naam: p.full_name }));
}
