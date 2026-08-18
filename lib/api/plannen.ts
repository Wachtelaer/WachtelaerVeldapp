import * as Crypto from 'expo-crypto';

import { supabase } from '@/lib/supabase';
import type { PlanVersie } from '@/lib/database.types';

const PLANNEN_BUCKET = 'werf-plannen';

export interface WerfPlannenSummary {
  werfId: string;
  werfNaam: string;
  aantalDocumenten: number;
  nieuwCount: number;
}

export async function listWervenMetPlannen(profileId: string): Promise<WerfPlannenSummary[]> {
  const [{ data: werven, error: wErr }, { data: reads, error: rErr }] = await Promise.all([
    supabase.from('werven').select('id, naam').eq('is_algemeen', false).order('naam'),
    supabase.from('plan_reads').select('werf_id, last_read_at').eq('profile_id', profileId),
  ]);
  if (wErr) throw wErr;
  if (rErr) throw rErr;

  const lastReadByWerf = new Map((reads ?? []).map((r) => [r.werf_id, r.last_read_at]));

  const summaries = await Promise.all(
    (werven ?? []).map(async (w) => {
      const { data: docs, error: dErr } = await supabase.from('plan_documenten').select('id').eq('werf_id', w.id);
      if (dErr) throw dErr;
      const docIds = (docs ?? []).map((d) => d.id);

      let nieuwCount = 0;
      if (docIds.length > 0) {
        const lastReadAt = lastReadByWerf.get(w.id);
        let query = supabase.from('plan_versies').select('id', { count: 'exact', head: true }).in('document_id', docIds);
        if (lastReadAt) query = query.gt('created_at', lastReadAt);
        const { count, error: vErr } = await query;
        if (vErr) throw vErr;
        nieuwCount = count ?? 0;
      }

      return { werfId: w.id, werfNaam: w.naam, aantalDocumenten: docIds.length, nieuwCount };
    })
  );

  return summaries;
}

export interface DocumentMetVersies {
  id: string;
  titel: string;
  laatsteVersie: PlanVersie & { uploaderNaam: string };
  vorigeVersies: (PlanVersie & { uploaderNaam: string })[];
  isNieuw: boolean;
}

export async function listDocumenten(werfId: string, profileId: string): Promise<DocumentMetVersies[]> {
  const [{ data: docs, error: dErr }, { data: read, error: rErr }] = await Promise.all([
    supabase.from('plan_documenten').select('id, titel').eq('werf_id', werfId).order('titel'),
    supabase.from('plan_reads').select('last_read_at').eq('werf_id', werfId).eq('profile_id', profileId).maybeSingle(),
  ]);
  if (dErr) throw dErr;
  if (rErr) throw rErr;
  const lastReadAt = read?.last_read_at ?? null;

  const result = await Promise.all(
    (docs ?? []).map(async (d) => {
      const { data: versies, error: vErr } = await supabase
        .from('plan_versies')
        .select('*, profiles(full_name)')
        .eq('document_id', d.id)
        .order('versie_nummer', { ascending: false });
      if (vErr) throw vErr;

      const mapped = (versies ?? []).map((v: any) => ({ ...v, uploaderNaam: v.profiles?.full_name ?? 'Onbekend' }));
      const [laatste, ...vorige] = mapped;

      return {
        id: d.id,
        titel: d.titel,
        laatsteVersie: laatste,
        vorigeVersies: vorige,
        isNieuw: !!laatste && (!lastReadAt || new Date(laatste.created_at) > new Date(lastReadAt)),
      };
    })
  );

  return result.filter((d) => d.laatsteVersie);
}

export interface UploadPlanInput {
  werfId: string;
  titel: string;
  fileUri: string;
  fileName: string;
  mimeType: string;
  geuploadDoor: string;
}

export async function uploadPlan(input: UploadPlanInput): Promise<void> {
  let { data: doc, error: findErr } = await supabase
    .from('plan_documenten')
    .select('id')
    .eq('werf_id', input.werfId)
    .eq('titel', input.titel)
    .maybeSingle();
  if (findErr) throw findErr;

  if (!doc) {
    const { data: created, error: createErr } = await supabase
      .from('plan_documenten')
      .insert({ werf_id: input.werfId, titel: input.titel })
      .select('id')
      .single();
    if (createErr) throw createErr;
    doc = created;
  }

  const { data: laatsteVersie, error: vErr } = await supabase
    .from('plan_versies')
    .select('versie_nummer')
    .eq('document_id', doc.id)
    .order('versie_nummer', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (vErr) throw vErr;
  const volgendeVersie = (laatsteVersie?.versie_nummer ?? 0) + 1;

  const response = await fetch(input.fileUri);
  const blob = await response.blob();
  const path = `${input.werfId}/${doc.id}/${volgendeVersie}_${Crypto.randomUUID()}_${input.fileName}`;

  const { error: uploadError } = await supabase.storage
    .from(PLANNEN_BUCKET)
    .upload(path, blob, { contentType: input.mimeType || 'application/octet-stream' });
  if (uploadError) throw uploadError;

  const { error: rowError } = await supabase.from('plan_versies').insert({
    document_id: doc.id,
    versie_nummer: volgendeVersie,
    storage_path: path,
    bestandsnaam: input.fileName,
    geupload_door: input.geuploadDoor,
  });
  if (rowError) throw rowError;
}

export async function getPlanUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(PLANNEN_BUCKET).createSignedUrl(storagePath, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}

export async function markPlannenRead(werfId: string, profileId: string) {
  const { error } = await supabase
    .from('plan_reads')
    .upsert({ werf_id: werfId, profile_id: profileId, last_read_at: new Date().toISOString() });
  if (error) throw error;
}
