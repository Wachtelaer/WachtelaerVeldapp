import * as Crypto from 'expo-crypto';

import { supabase } from '@/lib/supabase';
import { resolveImageBlob } from '@/lib/photoUpload';
import type { MagazijnMelding, MagazijnMeldingFoto } from '@/lib/database.types';

const FOTOS_BUCKET = 'magazijn-fotos';

export interface NieuweMeldingInput {
  melderId: string;
  werfId: string | null;
  tekst: string;
  hoeveelheid: number | null;
  eenheid: string;
  /** Local file URIs (e.g. from expo-image-picker) to upload alongside the melding. */
  fotoUris: string[];
}

export async function createMelding(input: NieuweMeldingInput): Promise<string> {
  const { data: melding, error } = await supabase
    .from('magazijn_meldingen')
    .insert({
      melder_id: input.melderId,
      werf_id: input.werfId,
      tekst: input.tekst,
      hoeveelheid: input.hoeveelheid,
      eenheid: input.eenheid,
    })
    .select('id')
    .single();
  if (error) throw error;

  for (const uri of input.fotoUris) {
    const { blob, ext, contentType } = await resolveImageBlob(uri);
    const filename = `${Crypto.randomUUID()}.${ext}`;
    const path = `${melding.id}/${filename}`;

    const { error: uploadError } = await supabase.storage.from(FOTOS_BUCKET).upload(path, blob, { contentType });
    if (uploadError) throw uploadError;

    const { error: rowError } = await supabase
      .from('magazijn_meldingen_fotos')
      .insert({ melding_id: melding.id, storage_path: path });
    if (rowError) throw rowError;
  }

  return melding.id;
}

export interface MeldingListItem extends MagazijnMelding {
  melderNaam: string;
  werfNaam: string | null;
  fotos: MagazijnMeldingFoto[];
}

function mapRow(r: any): MeldingListItem {
  return {
    ...r,
    melderNaam: r.profiles?.full_name ?? 'Onbekend',
    werfNaam: r.werven?.naam ?? null,
    fotos: r.magazijn_meldingen_fotos ?? [],
  };
}

export async function listMijnMeldingen(melderId: string): Promise<MeldingListItem[]> {
  const { data, error } = await supabase
    .from('magazijn_meldingen')
    .select('*, profiles!melder_id(full_name), werven(naam), magazijn_meldingen_fotos(*)')
    .eq('melder_id', melderId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

/** All meldingen, newest first — for the magazijnier's overview. */
export async function listAlleMeldingen(): Promise<MeldingListItem[]> {
  const { data, error } = await supabase
    .from('magazijn_meldingen')
    .select('*, profiles!melder_id(full_name), werven(naam), magazijn_meldingen_fotos(*)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export async function countOnverwerkt(): Promise<number> {
  const { count, error } = await supabase
    .from('magazijn_meldingen')
    .select('id', { count: 'exact', head: true })
    .eq('verwerkt', false);
  if (error) throw error;
  return count ?? 0;
}

export async function zetVerwerkt(id: string, verwerktDoor: string, verwerkt: boolean): Promise<void> {
  const { error } = await supabase
    .from('magazijn_meldingen')
    .update(
      verwerkt
        ? { verwerkt: true, verwerkt_door: verwerktDoor, verwerkt_op: new Date().toISOString() }
        : { verwerkt: false, verwerkt_door: null, verwerkt_op: null }
    )
    .eq('id', id);
  if (error) throw error;
}

export async function getMeldingFotoUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(FOTOS_BUCKET).createSignedUrl(storagePath, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}
