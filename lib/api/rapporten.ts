import * as Crypto from 'expo-crypto';

import { supabase } from '@/lib/supabase';
import { resolveImageBlob } from '@/lib/photoUpload';
import type { Weer, Werfrapport, WerfrapportFoto, WerfrapportReactie } from '@/lib/database.types';

const FOTOS_BUCKET = 'werfrapport-fotos';

export interface NieuwRapportInput {
  werfId: string;
  auteurId: string;
  weer: Weer;
  aanwezigEigen: number;
  aanwezigOnderaanneming: number;
  uitgevoerd: string;
  knelpunt: string;
  deelMgmt: boolean;
  deelWerf: boolean;
  deelKlant: boolean;
  /** Local file URIs (e.g. from expo-image-picker) to upload alongside the report. */
  fotoUris: string[];
}

export async function createRapport(input: NieuwRapportInput): Promise<string> {
  const { data: rapport, error } = await supabase
    .from('werfrapporten')
    .insert({
      werf_id: input.werfId,
      auteur_id: input.auteurId,
      weer: input.weer,
      aanwezig_eigen: input.aanwezigEigen,
      aanwezig_onderaanneming: input.aanwezigOnderaanneming,
      uitgevoerd: input.uitgevoerd,
      knelpunt: input.knelpunt,
      deel_mgmt: input.deelMgmt,
      deel_werf: input.deelWerf,
      deel_klant: input.deelKlant,
    })
    .select('id')
    .single();
  if (error) throw error;

  await uploadFotos(input.werfId, rapport.id, input.fotoUris);
  return rapport.id;
}

export async function uploadFotos(werfId: string, rapportId: string, fotoUris: string[]) {
  for (const uri of fotoUris) {
    const { blob, ext, contentType } = await resolveImageBlob(uri);
    const filename = `${Crypto.randomUUID()}.${ext}`;
    const path = `${werfId}/${rapportId}/${filename}`;

    const { error: uploadError } = await supabase.storage.from(FOTOS_BUCKET).upload(path, blob, { contentType });
    if (uploadError) throw uploadError;

    const { error: rowError } = await supabase
      .from('werfrapport_fotos')
      .insert({ rapport_id: rapportId, storage_path: path, label: filename });
    if (rowError) throw rowError;
  }
}

export interface RapportDetail extends Werfrapport {
  auteurNaam: string;
  fotos: WerfrapportFoto[];
  reacties: (WerfrapportReactie & { auteurNaam: string })[];
}

export async function getRapport(rapportId: string): Promise<RapportDetail> {
  const [{ data: rapport, error: rErr }, { data: fotos, error: fErr }, { data: reacties, error: cErr }] =
    await Promise.all([
      supabase.from('werfrapporten').select('*, profiles(full_name)').eq('id', rapportId).single(),
      supabase.from('werfrapport_fotos').select('*').eq('rapport_id', rapportId).order('created_at'),
      supabase
        .from('werfrapport_reacties')
        .select('*, profiles(full_name)')
        .eq('rapport_id', rapportId)
        .order('created_at'),
    ]);
  if (rErr) throw rErr;
  if (fErr) throw fErr;
  if (cErr) throw cErr;

  return {
    ...(rapport as any),
    auteurNaam: (rapport as any).profiles?.full_name ?? 'Onbekend',
    fotos: fotos ?? [],
    reacties: (reacties ?? []).map((c: any) => ({ ...c, auteurNaam: c.profiles?.full_name ?? 'Onbekend' })),
  };
}

export async function getFotoUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(FOTOS_BUCKET).createSignedUrl(storagePath, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}

export async function addReactie(rapportId: string, auteurId: string, tekst: string) {
  const { error } = await supabase
    .from('werfrapport_reacties')
    .insert({ rapport_id: rapportId, auteur_id: auteurId, tekst });
  if (error) throw error;
}
