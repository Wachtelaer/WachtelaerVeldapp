import * as Crypto from 'expo-crypto';

import { supabase } from '@/lib/supabase';
import { resolveImageBlob } from '@/lib/photoUpload';
import type { FormKey } from '@/lib/formTemplates';
import type { Formulier } from '@/lib/database.types';

const FOTOS_BUCKET = 'formulier-fotos';

export interface NieuwFormulierInput {
  invullerId: string;
  formulier: FormKey;
  klantNaam: string;
  klantAdres: string;
  klantTel: string;
  antwoorden: Record<string, unknown>;
  nota: string;
  fotoUris: string[];
}

export async function createFormulier(input: NieuwFormulierInput): Promise<string> {
  const { data: formulier, error } = await supabase
    .from('formulieren')
    .insert({
      invuller_id: input.invullerId,
      formulier: input.formulier,
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
    const path = `${formulier.id}/${filename}`;
    const { error: uploadError } = await supabase.storage.from(FOTOS_BUCKET).upload(path, blob, { contentType });
    if (uploadError) throw uploadError;
    const { error: rowError } = await supabase
      .from('formulier_fotos')
      .insert({ formulier_id: formulier.id, storage_path: path, label: filename });
    if (rowError) throw rowError;
  }

  return formulier.id;
}

export interface FormulierListItem extends Formulier {
  fotoCount: number;
}

export async function listMijnFormulieren(invullerId: string): Promise<FormulierListItem[]> {
  const { data: formulieren, error } = await supabase
    .from('formulieren')
    .select('*')
    .eq('invuller_id', invullerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  if (!formulieren?.length) return [];

  const { data: fotos, error: fErr } = await supabase
    .from('formulier_fotos')
    .select('formulier_id')
    .in(
      'formulier_id',
      formulieren.map((f) => f.id)
    );
  if (fErr) throw fErr;

  const fotoCountById = new Map<string, number>();
  for (const f of fotos ?? []) {
    fotoCountById.set(f.formulier_id, (fotoCountById.get(f.formulier_id) ?? 0) + 1);
  }

  return formulieren.map((f) => ({ ...f, fotoCount: fotoCountById.get(f.id) ?? 0 }));
}
