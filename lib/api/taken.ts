import { supabase } from '@/lib/supabase';
import type { Taak } from '@/lib/database.types';

export interface TaakListItem extends Taak {
  toegewezenAanNaam: string;
  aangemaaktDoorNaam: string;
  werfNaam: string | null;
}

function mapRow(r: any): TaakListItem {
  return {
    ...r,
    toegewezenAanNaam: r.toegewezen_aan_profile?.full_name ?? 'Onbekend',
    aangemaaktDoorNaam: r.aangemaakt_door_profile?.full_name ?? 'Onbekend',
    werfNaam: r.werven?.naam ?? null,
  };
}

const SELECT =
  '*, toegewezen_aan_profile:profiles!toegewezen_aan(full_name), aangemaakt_door_profile:profiles!aangemaakt_door(full_name), werven(naam)';

export interface NieuweTaakInput {
  titel: string;
  omschrijving: string;
  toegewezenAan: string;
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

/** My own taken, open ones first — for the employee's "To do" view. */
export async function listMijnTaken(profielId: string): Promise<TaakListItem[]> {
  const { data, error } = await supabase
    .from('taken')
    .select(SELECT)
    .eq('toegewezen_aan', profielId)
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

export async function zetGedaan(id: string, gedaan: boolean): Promise<void> {
  const { error } = await supabase
    .from('taken')
    .update(gedaan ? { gedaan: true, gedaan_op: new Date().toISOString() } : { gedaan: false, gedaan_op: null })
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
