import * as Crypto from 'expo-crypto';

import { supabase } from '@/lib/supabase';
import { resolveImageBlob } from '@/lib/photoUpload';
import type { ModuleKey } from '@/lib/salesModules';
import type { Opmeting } from '@/lib/database.types';

const FOTOS_BUCKET = 'opmeting-fotos';

export interface NieuweOpmetingInput {
  verkoperId: string;
  module: ModuleKey;
  klantNaam: string;
  klantAdres: string;
  klantTel: string;
  antwoorden: Record<string, unknown>;
  nota: string;
  fotoUris: string[];
}

export async function createOpmeting(input: NieuweOpmetingInput): Promise<string> {
  const { data: opmeting, error } = await supabase
    .from('opmetingen')
    .insert({
      verkoper_id: input.verkoperId,
      module: input.module,
      klant_naam: input.klantNaam,
      klant_adres: input.klantAdres,
      klant_tel: input.klantTel,
      antwoorden: input.antwoorden,
      nota: input.nota,
    })
    .select('id')
    .single();
  if (error) throw error;

  for (const uri of input.fotoUris) {
    const { blob, ext, contentType } = await resolveImageBlob(uri);
    const filename = `${Crypto.randomUUID()}.${ext}`;
    const path = `${opmeting.id}/${filename}`;
    const { error: uploadError } = await supabase.storage.from(FOTOS_BUCKET).upload(path, blob, { contentType });
    if (uploadError) throw uploadError;
    const { error: rowError } = await supabase
      .from('opmeting_fotos')
      .insert({ opmeting_id: opmeting.id, storage_path: path, label: filename });
    if (rowError) throw rowError;
  }

  return opmeting.id;
}

export interface OpmetingListItem extends Opmeting {
  fotoCount: number;
  verkoperNaam: string;
}

/**
 * No verkoper filter needed — RLS already scopes this to "my own opmetingen"
 * for a sales user and "every opmeting" for management, same as the rest of
 * the app relies on RLS for visibility.
 */
export async function listOpmetingen(): Promise<OpmetingListItem[]> {
  const { data: opmetingen, error } = await supabase
    .from('opmetingen')
    .select('*, profiles(full_name)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  if (!opmetingen?.length) return [];

  const { data: fotos, error: fErr } = await supabase
    .from('opmeting_fotos')
    .select('opmeting_id')
    .in(
      'opmeting_id',
      opmetingen.map((o) => o.id)
    );
  if (fErr) throw fErr;

  const fotoCountById = new Map<string, number>();
  for (const f of fotos ?? []) {
    fotoCountById.set(f.opmeting_id, (fotoCountById.get(f.opmeting_id) ?? 0) + 1);
  }

  return opmetingen.map((o: any) => ({
    ...o,
    fotoCount: fotoCountById.get(o.id) ?? 0,
    verkoperNaam: o.profiles?.full_name ?? 'Onbekend',
  }));
}
