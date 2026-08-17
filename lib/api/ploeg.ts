import { supabase } from '@/lib/supabase';
import type { Profile, Role } from '@/lib/database.types';

export interface WerfToewijzing {
  werf_id: string;
  werf_naam: string;
  is_leider: boolean;
}

export interface ProfielMetWerven extends Profile {
  werven: WerfToewijzing[];
}

export async function listProfielen(): Promise<ProfielMetWerven[]> {
  const [{ data: profiles, error: pErr }, { data: members, error: mErr }] = await Promise.all([
    supabase.from('profiles').select('*').order('full_name'),
    supabase.from('werf_members').select('werf_id, profile_id, is_leider, werven(naam)'),
  ]);
  if (pErr) throw pErr;
  if (mErr) throw mErr;

  const wervenByProfile = new Map<string, WerfToewijzing[]>();
  for (const m of members ?? []) {
    const naam = (m as any).werven?.naam ?? '';
    const list = wervenByProfile.get(m.profile_id) ?? [];
    list.push({ werf_id: m.werf_id, werf_naam: naam, is_leider: m.is_leider });
    wervenByProfile.set(m.profile_id, list);
  }

  return (profiles ?? []).map((p) => ({ ...p, werven: wervenByProfile.get(p.id) ?? [] }));
}

export async function updateRol(profileId: string, role: Role): Promise<void> {
  const { error } = await supabase.from('profiles').update({ role }).eq('id', profileId);
  if (error) throw error;
}

export async function updateSaldo(profileId: string, verlofDagen: number, inhaalrustDagen: number): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ verlof_dagen: verlofDagen, inhaalrust_dagen: inhaalrustDagen })
    .eq('id', profileId);
  if (error) throw error;
}

export async function setWerfLid(werfId: string, profileId: string, lid: boolean): Promise<void> {
  if (lid) {
    const { error } = await supabase
      .from('werf_members')
      .upsert({ werf_id: werfId, profile_id: profileId, is_leider: false });
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('werf_members')
      .delete()
      .eq('werf_id', werfId)
      .eq('profile_id', profileId);
    if (error) throw error;
  }
}

export async function setWerfLeider(werfId: string, profileId: string, isLeider: boolean): Promise<void> {
  const { error } = await supabase
    .from('werf_members')
    .update({ is_leider: isLeider })
    .eq('werf_id', werfId)
    .eq('profile_id', profileId);
  if (error) throw error;
}

// Runs server-side (see supabase/functions/create-employee) since creating
// an auth user needs the service_role key, which never ships in the app.
export async function createEmployee(input: { email: string; full_name: string; role: Role }): Promise<void> {
  const { data, error } = await supabase.functions.invoke('create-employee', { body: input });
  if (error) {
    const context = (error as any).context;
    if (context && typeof context.json === 'function') {
      const body = await context.json().catch(() => null);
      throw new Error(body?.error ?? error.message);
    }
    throw error;
  }
  if ((data as any)?.error) throw new Error((data as any).error);
}
