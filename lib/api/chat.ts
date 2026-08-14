import * as Crypto from 'expo-crypto';

import { supabase } from '@/lib/supabase';
import { resolveImageBlob } from '@/lib/photoUpload';
import type { WerfChatBericht } from '@/lib/database.types';

const CHAT_FOTOS_BUCKET = 'werfchat-fotos';

export interface ChatThread {
  werfId: string;
  werfNaam: string;
  ledenCount: number;
  laatste: (WerfChatBericht & { auteurNaam: string }) | null;
  ongelezen: boolean;
}

export async function listChatThreads(profileId: string): Promise<ChatThread[]> {
  const [{ data: werven, error: wErr }, { data: reads, error: rErr }, { data: members, error: mErr }] =
    await Promise.all([
      supabase.from('werven').select('id, naam').order('naam'),
      supabase.from('werf_chat_reads').select('werf_id, last_read_at').eq('profile_id', profileId),
      supabase.from('werf_members').select('werf_id'),
    ]);
  if (wErr) throw wErr;
  if (rErr) throw rErr;
  if (mErr) throw mErr;

  const lastReadByWerf = new Map((reads ?? []).map((r) => [r.werf_id, r.last_read_at]));
  const ledenCountByWerf = new Map<string, number>();
  for (const m of members ?? []) {
    ledenCountByWerf.set(m.werf_id, (ledenCountByWerf.get(m.werf_id) ?? 0) + 1);
  }

  const threads = await Promise.all(
    (werven ?? []).map(async (w) => {
      const { data: laatste, error } = await supabase
        .from('werf_chat_berichten')
        .select('*, profiles(full_name)')
        .eq('werf_id', w.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;

      const laatsteBericht = laatste
        ? { ...(laatste as any), auteurNaam: (laatste as any).profiles?.full_name ?? 'Onbekend' }
        : null;
      const lastReadAt = lastReadByWerf.get(w.id);
      const ongelezen = !!laatsteBericht && (!lastReadAt || new Date(laatsteBericht.created_at) > new Date(lastReadAt));

      return {
        werfId: w.id,
        werfNaam: w.naam,
        ledenCount: ledenCountByWerf.get(w.id) ?? 0,
        laatste: laatsteBericht,
        ongelezen,
      };
    })
  );

  return threads;
}

export async function listMessages(werfId: string): Promise<(WerfChatBericht & { auteurNaam: string })[]> {
  const { data, error } = await supabase
    .from('werf_chat_berichten')
    .select('*, profiles(full_name)')
    .eq('werf_id', werfId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((m: any) => ({ ...m, auteurNaam: m.profiles?.full_name ?? 'Onbekend' }));
}

export interface SendMessageInput {
  werfId: string;
  auteurId: string;
  tekst: string;
  fotoUri?: string | null;
}

export async function sendMessage(input: SendMessageInput) {
  let fotoStoragePath: string | null = null;
  if (input.fotoUri) {
    const { blob, ext, contentType } = await resolveImageBlob(input.fotoUri);
    const filename = `${Crypto.randomUUID()}.${ext}`;
    const path = `${input.werfId}/${filename}`;
    const { error: uploadError } = await supabase.storage
      .from(CHAT_FOTOS_BUCKET)
      .upload(path, blob, { contentType });
    if (uploadError) throw uploadError;
    fotoStoragePath = path;
  }

  const { error } = await supabase.from('werf_chat_berichten').insert({
    werf_id: input.werfId,
    auteur_id: input.auteurId,
    tekst: input.tekst,
    foto_storage_path: fotoStoragePath,
  });
  if (error) throw error;
}

export async function getChatFotoUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(CHAT_FOTOS_BUCKET).createSignedUrl(storagePath, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}

export async function markThreadRead(werfId: string, profileId: string) {
  const { error } = await supabase
    .from('werf_chat_reads')
    .upsert({ werf_id: werfId, profile_id: profileId, last_read_at: new Date().toISOString() });
  if (error) throw error;
}
