#!/usr/bin/env bash
set -euo pipefail

echo "Wachtelaer Veldapp - Team Wachtelaer (algemene chat) toepassen..."

mkdir -p "supabase/migrations"
cat > "supabase/migrations/0010_algemene_chat.sql" <<'WACHTELAER_EOF_MARKER'
-- Wachtelaer Veldapp — a single, general "Team Wachtelaer" chat that
-- everyone can see, without being tied to a specific job site.
--
-- Modeled as a special werven row (flagged is_algemeen) instead of a
-- parallel chat schema, so it reuses the entire existing werfchat
-- table/RLS/storage machinery as-is. It just isn't a real site — the app
-- filters it out of the Werven tab, Ploeg & rechten, and plannen, and no
-- werfrapporten/opmetingen/plannen are ever created against it.

alter table werven add column is_algemeen boolean not null default false;

-- Additional permissive policies (OR'd with the existing is_mgmt/
-- is_werf_member ones) so everyone signed in can see and use this one
-- werf's chat, regardless of werf_members.
create policy "werven: iedereen ziet de algemene chat-werf"
  on werven for select
  to authenticated
  using (is_algemeen);

create policy "werf_chat_berichten: iedereen leest de algemene chat"
  on werf_chat_berichten for select
  to authenticated
  using (exists (select 1 from werven w where w.id = werf_id and w.is_algemeen));

create policy "werf_chat_berichten: iedereen stuurt in de algemene chat"
  on werf_chat_berichten for insert
  to authenticated
  with check (
    auteur_id = auth.uid()
    and exists (select 1 from werven w where w.id = werf_id and w.is_algemeen)
  );

create policy "werfchat photos: iedereen leest algemene chat-fotos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'werfchat-fotos'
    and exists (
      select 1 from werven w
      where w.id = ((storage.foldername(name))[1])::uuid and w.is_algemeen
    )
  );

create policy "werfchat photos: iedereen upload algemene chat-fotos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'werfchat-fotos'
    and exists (
      select 1 from werven w
      where w.id = ((storage.foldername(name))[1])::uuid and w.is_algemeen
    )
  );

insert into werven (code, naam, adres, fase, is_algemeen)
values ('ALGEMEEN', 'Team Wachtelaer', '', 'bezig', true)
on conflict (code) do nothing;
WACHTELAER_EOF_MARKER

mkdir -p "lib"
cat > "lib/database.types.ts" <<'WACHTELAER_EOF_MARKER'
// Hand-written to match supabase/migrations/0001_werfrapporten.sql.
// Regenerate with `supabase gen types typescript` once the schema grows.

export type Role = 'tech' | 'werfleider' | 'sales' | 'mgmt';
export type Weer = 'Droog' | 'Regen' | 'Hitte';

export interface Profile {
  id: string;
  full_name: string;
  role: Role;
  verlof_dagen: number;
  inhaalrust_dagen: number;
  created_at: string;
}

export interface Werf {
  id: string;
  code: string;
  naam: string;
  adres: string;
  fase: string;
  is_algemeen: boolean;
  created_at: string;
}

export interface WerfMember {
  werf_id: string;
  profile_id: string;
  is_leider: boolean;
}

export interface Werfrapport {
  id: string;
  werf_id: string;
  auteur_id: string;
  datum: string;
  weer: Weer;
  aanwezig_eigen: number;
  aanwezig_onderaanneming: number;
  uitgevoerd: string;
  knelpunt: string;
  deel_mgmt: boolean;
  deel_werf: boolean;
  deel_klant: boolean;
  created_at: string;
}

export interface WerfrapportFoto {
  id: string;
  rapport_id: string;
  storage_path: string;
  label: string;
  created_at: string;
}

export interface WerfrapportReactie {
  id: string;
  rapport_id: string;
  auteur_id: string;
  tekst: string;
  created_at: string;
}

export interface WerfChatBericht {
  id: string;
  werf_id: string;
  auteur_id: string;
  tekst: string;
  foto_storage_path: string | null;
  created_at: string;
}

export interface WerfChatRead {
  werf_id: string;
  profile_id: string;
  last_read_at: string;
}

export interface Opmeting {
  id: string;
  verkoper_id: string;
  module: string;
  klant_naam: string;
  klant_adres: string;
  klant_tel: string;
  antwoorden: Record<string, unknown>;
  nota: string;
  status: string;
  created_at: string;
}

export interface OpmetingFoto {
  id: string;
  opmeting_id: string;
  storage_path: string;
  label: string;
  created_at: string;
}

export type VerlofType = 'Verlof' | 'Inhaalrust' | 'Ziekte';
export type VerlofStatus = 'wacht' | 'goed' | 'nee';

export interface Verlofaanvraag {
  id: string;
  aanvrager_id: string;
  type: VerlofType;
  van: string;
  tot: string;
  nota: string;
  status: VerlofStatus;
  behandeld_door: string | null;
  behandeld_op: string | null;
  created_at: string;
}

export interface PlanDocument {
  id: string;
  werf_id: string;
  titel: string;
  created_at: string;
}

export interface PlanVersie {
  id: string;
  document_id: string;
  versie_nummer: number;
  storage_path: string;
  bestandsnaam: string;
  geupload_door: string;
  created_at: string;
}

export interface PlanRead {
  werf_id: string;
  profile_id: string;
  last_read_at: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile> & Pick<Profile, 'id' | 'full_name' | 'role'>; Update: Partial<Profile> };
      werven: { Row: Werf; Insert: Partial<Werf> & Pick<Werf, 'code' | 'naam' | 'adres'>; Update: Partial<Werf> };
      werf_members: { Row: WerfMember; Insert: WerfMember; Update: Partial<WerfMember> };
      werfrapporten: {
        Row: Werfrapport;
        Insert: Partial<Werfrapport> & Pick<Werfrapport, 'werf_id' | 'auteur_id' | 'weer'>;
        Update: Partial<Werfrapport>;
      };
      werfrapport_fotos: {
        Row: WerfrapportFoto;
        Insert: Partial<WerfrapportFoto> & Pick<WerfrapportFoto, 'rapport_id' | 'storage_path'>;
        Update: Partial<WerfrapportFoto>;
      };
      werfrapport_reacties: {
        Row: WerfrapportReactie;
        Insert: Partial<WerfrapportReactie> & Pick<WerfrapportReactie, 'rapport_id' | 'auteur_id' | 'tekst'>;
        Update: Partial<WerfrapportReactie>;
      };
      werf_chat_berichten: {
        Row: WerfChatBericht;
        Insert: Partial<WerfChatBericht> & Pick<WerfChatBericht, 'werf_id' | 'auteur_id'>;
        Update: Partial<WerfChatBericht>;
      };
      werf_chat_reads: { Row: WerfChatRead; Insert: WerfChatRead; Update: Partial<WerfChatRead> };
      opmetingen: {
        Row: Opmeting;
        Insert: Partial<Opmeting> & Pick<Opmeting, 'verkoper_id' | 'module'>;
        Update: Partial<Opmeting>;
      };
      opmeting_fotos: {
        Row: OpmetingFoto;
        Insert: Partial<OpmetingFoto> & Pick<OpmetingFoto, 'opmeting_id' | 'storage_path'>;
        Update: Partial<OpmetingFoto>;
      };
      verlofaanvragen: {
        Row: Verlofaanvraag;
        Insert: Partial<Verlofaanvraag> & Pick<Verlofaanvraag, 'aanvrager_id' | 'type' | 'van' | 'tot'>;
        Update: Partial<Verlofaanvraag>;
      };
      plan_documenten: {
        Row: PlanDocument;
        Insert: Partial<PlanDocument> & Pick<PlanDocument, 'werf_id' | 'titel'>;
        Update: Partial<PlanDocument>;
      };
      plan_versies: {
        Row: PlanVersie;
        Insert: Partial<PlanVersie> & Pick<PlanVersie, 'document_id' | 'versie_nummer' | 'storage_path' | 'bestandsnaam' | 'geupload_door'>;
        Update: Partial<PlanVersie>;
      };
      plan_reads: { Row: PlanRead; Insert: PlanRead; Update: Partial<PlanRead> };
    };
  };
}
WACHTELAER_EOF_MARKER

mkdir -p "lib/api"
cat > "lib/api/werven.ts" <<'WACHTELAER_EOF_MARKER'
import { supabase } from '@/lib/supabase';
import type { Werf, Werfrapport } from '@/lib/database.types';

export interface WerfListItem extends Werf {
  leiderNaam: string | null;
  rapportCount: number;
  fotoCount: number;
  laatsteRapport: Pick<Werfrapport, 'id' | 'datum' | 'uitgevoerd' | 'knelpunt'> | null;
  isLeider: boolean;
}

export async function listAlleWerven(): Promise<Pick<Werf, 'id' | 'naam'>[]> {
  const { data, error } = await supabase.from('werven').select('id, naam').eq('is_algemeen', false).order('naam');
  if (error) throw error;
  return data ?? [];
}

export async function createWerf(input: { code: string; naam: string; adres: string; fase?: string }): Promise<Werf> {
  const { data, error } = await supabase
    .from('werven')
    .insert({ code: input.code, naam: input.naam, adres: input.adres, fase: input.fase || 'opstart' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteWerf(werfId: string): Promise<void> {
  const { error } = await supabase.from('werven').delete().eq('id', werfId);
  if (error) throw error;
}

export async function listWervenWithSummary(profileId: string): Promise<WerfListItem[]> {
  const [{ data: werven, error: wErr }, { data: members, error: mErr }, { data: summaries, error: sErr }] =
    await Promise.all([
      supabase.from('werven').select('*').eq('is_algemeen', false).order('naam'),
      supabase.from('werf_members').select('werf_id, profile_id, is_leider, profiles(full_name)'),
      supabase.from('werf_summary').select('*'),
    ]);
  if (wErr) throw wErr;
  if (mErr) throw mErr;
  if (sErr) throw sErr;

  const leiderByWerf = new Map<string, string>();
  const myMembership = new Map<string, boolean>();
  for (const m of members ?? []) {
    const naam = (m as any).profiles?.full_name as string | undefined;
    if (m.is_leider && naam) leiderByWerf.set(m.werf_id, naam);
    if (m.profile_id === profileId) myMembership.set(m.werf_id, m.is_leider);
  }

  const summaryByWerf = new Map((summaries ?? []).map((s) => [s.werf_id, s]));
  const laatsteIds = (summaries ?? []).map((s) => s.laatste_rapport_id).filter((id): id is string => !!id);

  let laatsteById = new Map<string, Pick<Werfrapport, 'id' | 'datum' | 'uitgevoerd' | 'knelpunt'>>();
  if (laatsteIds.length) {
    const { data: laatste, error: lErr } = await supabase
      .from('werfrapporten')
      .select('id, datum, uitgevoerd, knelpunt')
      .in('id', laatsteIds);
    if (lErr) throw lErr;
    laatsteById = new Map((laatste ?? []).map((r) => [r.id, r]));
  }

  return (werven ?? []).map((w) => {
    const summary = summaryByWerf.get(w.id);
    const laatsteRapportId = summary?.laatste_rapport_id ?? null;
    return {
      ...w,
      leiderNaam: leiderByWerf.get(w.id) ?? null,
      rapportCount: summary?.rapport_count ?? 0,
      fotoCount: summary?.foto_count ?? 0,
      laatsteRapport: laatsteRapportId ? laatsteById.get(laatsteRapportId) ?? null : null,
      isLeider: myMembership.get(w.id) ?? false,
    };
  });
}

export async function getWerf(werfId: string): Promise<Werf> {
  const { data, error } = await supabase.from('werven').select('*').eq('id', werfId).single();
  if (error) throw error;
  return data;
}

export async function isLeiderOfWerf(werfId: string, profileId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('werf_members')
    .select('is_leider')
    .eq('werf_id', werfId)
    .eq('profile_id', profileId)
    .maybeSingle();
  if (error) throw error;
  return data?.is_leider ?? false;
}

export async function listRapportenForWerf(werfId: string): Promise<
  (Werfrapport & { auteurNaam: string })[]
> {
  const { data, error } = await supabase
    .from('werfrapporten')
    .select('*, profiles(full_name)')
    .eq('werf_id', werfId)
    .order('datum', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ ...r, auteurNaam: r.profiles?.full_name ?? 'Onbekend' }));
}

export async function listRecentFotosForWerf(werfId: string, limit = 6) {
  const { data, error } = await supabase
    .from('werfrapport_fotos')
    .select('id, storage_path, label, created_at, werfrapporten!inner(werf_id)')
    .eq('werfrapporten.werf_id', werfId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
WACHTELAER_EOF_MARKER

mkdir -p "lib/api"
cat > "lib/api/plannen.ts" <<'WACHTELAER_EOF_MARKER'
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
WACHTELAER_EOF_MARKER

mkdir -p "lib/api"
cat > "lib/api/chat.ts" <<'WACHTELAER_EOF_MARKER'
import * as Crypto from 'expo-crypto';

import { supabase } from '@/lib/supabase';
import { resolveImageBlob } from '@/lib/photoUpload';
import type { WerfChatBericht } from '@/lib/database.types';

const CHAT_FOTOS_BUCKET = 'werfchat-fotos';

export interface ChatThread {
  werfId: string;
  werfNaam: string;
  isAlgemeen: boolean;
  ledenCount: number;
  laatste: (WerfChatBericht & { auteurNaam: string }) | null;
  ongelezen: boolean;
}

export async function listChatThreads(profileId: string): Promise<ChatThread[]> {
  const [{ data: werven, error: wErr }, { data: reads, error: rErr }, { data: members, error: mErr }] =
    await Promise.all([
      supabase.from('werven').select('id, naam, is_algemeen').order('naam'),
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
        isAlgemeen: w.is_algemeen,
        ledenCount: ledenCountByWerf.get(w.id) ?? 0,
        laatste: laatsteBericht,
        ongelezen,
      };
    })
  );

  // The general chat always leads the list, regardless of alphabetical order.
  threads.sort((a, b) => Number(b.isAlgemeen) - Number(a.isAlgemeen));

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
WACHTELAER_EOF_MARKER

mkdir -p "app/(tabs)/chat"
cat > "app/(tabs)/chat/index.tsx" <<'WACHTELAER_EOF_MARKER'
import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { Tag } from '@/components/ui/Basics';
import { useAuth } from '@/context/AuthProvider';
import { listChatThreads, type ChatThread } from '@/lib/api/chat';
import { colors, fonts } from '@/lib/theme';

export default function ChatThreadsScreen() {
  const { profile } = useAuth();
  const [threads, setThreads] = useState<ChatThread[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      setError(null);
      setThreads(await listChatThreads(profile.id));
    } catch (e: any) {
      setError(e.message ?? 'Kon chats niet laden');
    }
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <View style={styles.root}>
      <AppHeader kicker="Werfchats" />
      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <Text style={styles.title}>Chat</Text>

        {threads === null && !error ? <ActivityIndicator style={{ marginTop: 24 }} color={colors.accent} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {threads?.map((t) => (
          <TouchableOpacity
            key={t.werfId}
            style={[styles.card, t.isAlgemeen && styles.cardAlgemeen]}
            onPress={() => router.push(`/chat/${t.werfId}`)}
            accessibilityRole="button">
            <View style={styles.cardTop}>
              <Text style={styles.cardTitel} numberOfLines={1}>
                {t.isAlgemeen ? '📢 ' : ''}
                {t.werfNaam}
              </Text>
              <Text style={styles.cardTijd}>{t.laatste ? formatTijd(t.laatste.created_at) : ''}</Text>
            </View>
            <Text style={styles.cardLaatste} numberOfLines={1}>
              {t.laatste
                ? `${t.laatste.auteurNaam}: ${t.laatste.tekst || (t.laatste.foto_storage_path ? '📷 foto' : '')}`
                : 'Nog geen berichten'}
            </Text>
            <View style={styles.tagRow}>
              <Tag label={t.isAlgemeen ? 'Iedereen' : `${t.ledenCount} leden`} />
              {t.ongelezen ? <Tag label="nieuw" tone="accent" /> : null}
            </View>
          </TouchableOpacity>
        ))}

        {threads && threads.length === 0 ? (
          <Text style={styles.empty}>Je bent nog aan geen enkele werf toegewezen.</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

function formatTijd(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' });
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 16, gap: 12, paddingBottom: 40 },
  title: {
    fontFamily: fonts.heading,
    fontSize: 24,
    textTransform: 'uppercase',
    color: colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    paddingBottom: 8,
    marginBottom: 4,
  },
  error: { fontFamily: fonts.body, color: colors.danger },
  card: { borderWidth: 1, borderColor: colors.divider, padding: 12, gap: 5 },
  cardAlgemeen: { borderColor: colors.accent, borderWidth: 2 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  cardTitel: { fontFamily: fonts.heading, fontSize: 16, textTransform: 'uppercase', color: colors.ink, flexShrink: 1 },
  cardTijd: { fontFamily: fonts.mono, fontSize: 10, color: colors.inkMuted },
  cardLaatste: { fontFamily: fonts.body, fontSize: 13, color: colors.inkMuted },
  tagRow: { flexDirection: 'row', gap: 6 },
  empty: { fontFamily: fonts.body, fontSize: 14, color: colors.inkMuted, marginTop: 12 },
});
WACHTELAER_EOF_MARKER

echo "Klaar. Vergeet niet: voer supabase/migrations/0010_algemene_chat.sql uit in de Supabase SQL editor."
