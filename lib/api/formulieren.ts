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

  // Elke foto apart vangen: dit formulier kan via de offline-wachtrij pas
  // dagen later alsnog verstuurd worden, en tegen dan kan het besturings-
  // systeem de lokale foto-cache al opgeruimd hebben. Eén ontbrekende foto
  // mocht voorheen de hele indiening blokkeren — bij een herpoging vanuit de
  // wachtrij werd dan de formulier-rij een tweede keer aangemaakt (dubbel),
  // en bleef het item voor altijd in de wachtrij hangen omdat diezelfde foto
  // bij elke volgende poging opnieuw faalde. De antwoorden zelf zijn het
  // belangrijkste; een enkele verloren foto mag dat nooit met zich meeslepen.
  for (const uri of input.fotoUris) {
    try {
      const { blob, ext, contentType } = await resolveImageBlob(uri);
      const filename = `${Crypto.randomUUID()}.${ext}`;
      const path = `${formulier.id}/${filename}`;
      const { error: uploadError } = await supabase.storage.from(FOTOS_BUCKET).upload(path, blob, { contentType });
      if (uploadError) throw uploadError;
      const { error: rowError } = await supabase
        .from('formulier_fotos')
        .insert({ formulier_id: formulier.id, storage_path: path, label: filename });
      if (rowError) throw rowError;
    } catch (e) {
      console.warn(`Foto overslaan voor formulier ${formulier.id} (${uri}):`, e);
    }
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
