echo "Wachtelaer Veldapp - Magazijn module toepassen..."

mkdir -p "supabase/migrations"
cat > "supabase/migrations/0011_magazijn.sql" <<'WACHTELAER_EOF_MARKER'
-- Wachtelaer Veldapp — Magazijn: iedereen kan doorgeven wat ze uit het
-- magazijn nemen wanneer de magazijnier er niet is; management krijgt een
-- overzicht van alle meldingen en kan ze als verwerkt afvinken.

create table magazijn_meldingen (
  id uuid primary key default gen_random_uuid(),
  melder_id uuid not null references profiles (id),
  werf_id uuid references werven (id) on delete set null,
  tekst text not null,
  hoeveelheid numeric,
  eenheid text not null default '',
  verwerkt boolean not null default false,
  verwerkt_door uuid references profiles (id),
  verwerkt_op timestamptz,
  created_at timestamptz not null default now()
);

alter table magazijn_meldingen enable row level security;

create policy "magazijn_meldingen are readable by their melder and management"
  on magazijn_meldingen for select
  to authenticated
  using (melder_id = auth.uid() or private.is_mgmt(auth.uid()));

create policy "magazijn_meldingen are created by their own melder"
  on magazijn_meldingen for insert
  to authenticated
  with check (melder_id = auth.uid());

create policy "magazijn_meldingen are updated by management only"
  on magazijn_meldingen for update
  to authenticated
  using (private.is_mgmt(auth.uid()))
  with check (private.is_mgmt(auth.uid()));

create table magazijn_meldingen_fotos (
  id uuid primary key default gen_random_uuid(),
  melding_id uuid not null references magazijn_meldingen (id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now()
);

alter table magazijn_meldingen_fotos enable row level security;

create policy "magazijn_meldingen_fotos follow the melding's visibility"
  on magazijn_meldingen_fotos for select
  to authenticated
  using (
    exists (
      select 1 from magazijn_meldingen m
      where m.id = melding_id and (m.melder_id = auth.uid() or private.is_mgmt(auth.uid()))
    )
  );

create policy "magazijn_meldingen_fotos are added by the melding's own melder"
  on magazijn_meldingen_fotos for insert
  to authenticated
  with check (
    exists (
      select 1 from magazijn_meldingen m
      where m.id = melding_id and m.melder_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- storage — one object per photo at {melding_id}/{filename}
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('magazijn-fotos', 'magazijn-fotos', false)
on conflict (id) do nothing;

create policy "magazijn photos are readable per melding visibility"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'magazijn-fotos'
    and exists (
      select 1 from magazijn_meldingen m
      where m.id = ((storage.foldername(name))[1])::uuid
        and (m.melder_id = auth.uid() or private.is_mgmt(auth.uid()))
    )
  );

create policy "magazijn photos are uploaded by the melding's own melder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'magazijn-fotos'
    and exists (
      select 1 from magazijn_meldingen m
      where m.id = ((storage.foldername(name))[1])::uuid and m.melder_id = auth.uid()
    )
  );
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

export interface MagazijnMelding {
  id: string;
  melder_id: string;
  werf_id: string | null;
  tekst: string;
  hoeveelheid: number | null;
  eenheid: string;
  verwerkt: boolean;
  verwerkt_door: string | null;
  verwerkt_op: string | null;
  created_at: string;
}

export interface MagazijnMeldingFoto {
  id: string;
  melding_id: string;
  storage_path: string;
  created_at: string;
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
      magazijn_meldingen: {
        Row: MagazijnMelding;
        Insert: Partial<MagazijnMelding> & Pick<MagazijnMelding, 'melder_id'>;
        Update: Partial<MagazijnMelding>;
      };
      magazijn_meldingen_fotos: {
        Row: MagazijnMeldingFoto;
        Insert: Partial<MagazijnMeldingFoto> & Pick<MagazijnMeldingFoto, 'melding_id' | 'storage_path'>;
        Update: Partial<MagazijnMeldingFoto>;
      };
    };
  };
}
WACHTELAER_EOF_MARKER

mkdir -p "lib/api"
cat > "lib/api/magazijn.ts" <<'WACHTELAER_EOF_MARKER'
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
WACHTELAER_EOF_MARKER

mkdir -p "lib"
cat > "lib/offlineQueue.ts" <<'WACHTELAER_EOF_MARKER'
import { useEffect, useState, useCallback, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

import { createRapport, addReactie, type NieuwRapportInput } from '@/lib/api/rapporten';
import { sendMessage, type SendMessageInput } from '@/lib/api/chat';
import { createOpmeting, type NieuweOpmetingInput } from '@/lib/api/opmetingen';
import { createAanvraag, type NieuweVerlofaanvraagInput } from '@/lib/api/verlof';
import { createMelding, type NieuweMeldingInput } from '@/lib/api/magazijn';

const STORAGE_KEY = 'wachtelaer.offlineQueue.v1';

type QueuedAction =
  | { id: string; kind: 'submit_rapport'; createdAt: number; payload: NieuwRapportInput }
  | {
      id: string;
      kind: 'submit_reactie';
      createdAt: number;
      payload: { rapportId: string; auteurId: string; tekst: string };
    }
  | { id: string; kind: 'submit_chat_bericht'; createdAt: number; payload: SendMessageInput }
  | { id: string; kind: 'submit_opmeting'; createdAt: number; payload: NieuweOpmetingInput }
  | { id: string; kind: 'submit_verlofaanvraag'; createdAt: number; payload: NieuweVerlofaanvraagInput }
  | { id: string; kind: 'submit_magazijn_melding'; createdAt: number; payload: NieuweMeldingInput };

let queue: QueuedAction[] = [];
let hydrated = false;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

async function hydrate() {
  if (hydrated) return;
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  queue = raw ? JSON.parse(raw) : [];
  hydrated = true;
  notify();
}

async function persist() {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  notify();
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function enqueueRapport(payload: NieuwRapportInput) {
  await hydrate();
  queue = [...queue, { id: makeId(), kind: 'submit_rapport', createdAt: Date.now(), payload }];
  await persist();
}

export async function enqueueReactie(payload: { rapportId: string; auteurId: string; tekst: string }) {
  await hydrate();
  queue = [...queue, { id: makeId(), kind: 'submit_reactie', createdAt: Date.now(), payload }];
  await persist();
}

export async function enqueueChatBericht(payload: SendMessageInput) {
  await hydrate();
  queue = [...queue, { id: makeId(), kind: 'submit_chat_bericht', createdAt: Date.now(), payload }];
  await persist();
}

export async function enqueueOpmeting(payload: NieuweOpmetingInput) {
  await hydrate();
  queue = [...queue, { id: makeId(), kind: 'submit_opmeting', createdAt: Date.now(), payload }];
  await persist();
}

export async function enqueueVerlofaanvraag(payload: NieuweVerlofaanvraagInput) {
  await hydrate();
  queue = [...queue, { id: makeId(), kind: 'submit_verlofaanvraag', createdAt: Date.now(), payload }];
  await persist();
}

export async function enqueueMagazijnMelding(payload: NieuweMeldingInput) {
  await hydrate();
  queue = [...queue, { id: makeId(), kind: 'submit_magazijn_melding', createdAt: Date.now(), payload }];
  await persist();
}

export function getQueueLength() {
  return queue.length;
}

/** Tries to send every queued item. Leaves failures queued for the next attempt. */
export async function flushQueue() {
  await hydrate();
  const remaining: QueuedAction[] = [];
  for (const action of queue) {
    try {
      if (action.kind === 'submit_rapport') {
        await createRapport(action.payload);
      } else if (action.kind === 'submit_reactie') {
        await addReactie(action.payload.rapportId, action.payload.auteurId, action.payload.tekst);
      } else if (action.kind === 'submit_chat_bericht') {
        await sendMessage(action.payload);
      } else if (action.kind === 'submit_opmeting') {
        await createOpmeting(action.payload);
      } else if (action.kind === 'submit_verlofaanvraag') {
        await createAanvraag(action.payload);
      } else {
        await createMelding(action.payload);
      }
    } catch {
      remaining.push(action);
    }
  }
  queue = remaining;
  await persist();
}

export function useQueueLength() {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      hydrate();
      return () => listeners.delete(onChange);
    },
    () => queue.length,
    () => 0
  );
}

/** Online/offline status plus a queue that auto-flushes on reconnect. */
export function useConnectivity() {
  const [isOnline, setIsOnline] = useState(true);
  const queued = useQueueLength();

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const nowOnline = !!state.isConnected && state.isInternetReachable !== false;
      setIsOnline((prevOnline) => {
        if (!prevOnline && nowOnline) flushQueue();
        return nowOnline;
      });
    });
    return unsub;
  }, []);

  const flushNow = useCallback(() => flushQueue(), []);

  return { isOnline, queued, flushNow };
}
WACHTELAER_EOF_MARKER

mkdir -p "app/(tabs)/meer"
cat > "app/(tabs)/meer/index.tsx" <<'WACHTELAER_EOF_MARKER'
import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/ui/Button';
import { SectionLabel } from '@/components/ui/Basics';
import { useAuth } from '@/context/AuthProvider';
import { countInBehandeling, countTeKeuren } from '@/lib/api/verlof';
import { colors, fonts, roleLabels } from '@/lib/theme';

export default function MeerTab() {
  const { profile, signOut } = useAuth();
  const isMgmt = profile?.role === 'mgmt';
  const [verlofSub, setVerlofSub] = useState('');

  useFocusEffect(
    useCallback(() => {
      if (!profile) return;
      (isMgmt ? countTeKeuren() : countInBehandeling(profile.id)).then((n) => {
        setVerlofSub(isMgmt ? `${n} te beoordelen` : `${profile.verlof_dagen} dagen over · ${n} in behandeling`);
      });
    }, [profile, isMgmt])
  );

  return (
    <View style={styles.root}>
      <AppHeader kicker="Instellingen" />
      <View style={styles.body}>
        <View>
          <SectionLabel>Aangemeld als</SectionLabel>
          <Text style={styles.name}>{profile?.full_name ?? '—'}</Text>
          <Text style={styles.role}>{profile ? roleLabels[profile.role] : ''}</Text>
        </View>

        <TouchableOpacity style={styles.card} onPress={() => router.push('/meer/verlof')} accessibilityRole="button">
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{isMgmt ? 'Verlofaanvragen' : 'Verlof aanvragen'}</Text>
            <Text style={styles.cardBody}>{verlofSub}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.accent} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.card} onPress={() => router.push('/meer/magazijn')} accessibilityRole="button">
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Magazijn</Text>
            <Text style={styles.cardBody}>
              {isMgmt ? 'Meldingen van wat er is meegenomen.' : 'Geef door wat je hebt meegenomen.'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.accent} />
        </TouchableOpacity>

        {isMgmt ? (
          <TouchableOpacity style={styles.card} onPress={() => router.push('/meer/ploeg')} accessibilityRole="button">
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Ploeg &amp; rechten</Text>
              <Text style={styles.cardBody}>Rol, verlofsaldo en werftoewijzingen per medewerker.</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.accent} />
          </TouchableOpacity>
        ) : null}
        <View style={styles.noteCard}>
          <Text style={styles.noteTitle}>Werkbonnen</Text>
          <Text style={styles.noteBody}>
            Werkbonnen en facturatie blijven in jullie bestaande systeem. Deze app verwijst er enkel naar.
          </Text>
        </View>

        <Button label="Afmelden" variant="secondary" onPress={signOut} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, padding: 16, gap: 16 },
  name: { fontFamily: fonts.heading, fontSize: 22, color: colors.ink, textTransform: 'uppercase' },
  role: { fontFamily: fonts.body, fontSize: 14, color: colors.inkMuted, marginTop: 2 },
  card: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: colors.divider,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardTitle: { fontFamily: fonts.heading, fontSize: 16, textTransform: 'uppercase', color: colors.ink },
  cardBody: { fontFamily: fonts.body, fontSize: 12, color: colors.inkMuted, marginTop: 2 },
  noteCard: { borderWidth: 1, borderColor: colors.accentPale, backgroundColor: colors.accentTint, padding: 12, gap: 4 },
  noteTitle: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.accentDarker,
  },
  noteBody: { fontFamily: fonts.body, fontSize: 13, color: colors.ink },
});
WACHTELAER_EOF_MARKER

mkdir -p "app/(tabs)/meer"
cat > "app/(tabs)/meer/magazijn.tsx" <<'WACHTELAER_EOF_MARKER'
import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { BackRow, KpiTile, SectionLabel, Tag } from '@/components/ui/Basics';
import { Button } from '@/components/ui/Button';
import { ChipGroup, FieldLabel, TextArea, TextField } from '@/components/ui/Form';
import { PhotoPicker } from '@/components/PhotoPicker';
import { useAuth } from '@/context/AuthProvider';
import { listAlleWerven } from '@/lib/api/werven';
import {
  countOnverwerkt,
  createMelding,
  getMeldingFotoUrl,
  listAlleMeldingen,
  listMijnMeldingen,
  zetVerwerkt,
  type MeldingListItem,
} from '@/lib/api/magazijn';
import { enqueueMagazijnMelding, useConnectivity } from '@/lib/offlineQueue';
import { colors, fonts } from '@/lib/theme';

const GEEN_WERF = 'Geen specifieke werf';

export default function MagazijnScreen() {
  const { profile } = useAuth();
  const isMgmt = profile?.role === 'mgmt';

  return (
    <View style={styles.root}>
      <AppHeader kicker={isMgmt ? 'Magazijn · meldingen' : 'Magazijn'} />
      <BackRow label="Meer" onPress={() => router.replace('/meer')} />
      {isMgmt ? <OverzichtView /> : <MeldingView />}
    </View>
  );
}

function OverzichtView() {
  const { profile } = useAuth();
  const [meldingen, setMeldingen] = useState<MeldingListItem[] | null>(null);
  const [onverwerkt, setOnverwerkt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [alle, teVerwerken] = await Promise.all([listAlleMeldingen(), countOnverwerkt()]);
      setMeldingen(alle);
      setOnverwerkt(teVerwerken);
    } catch (e: any) {
      setError(e.message ?? 'Kon meldingen niet laden');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const vandaag = (meldingen ?? []).filter((m) => isVandaag(m.created_at)).length;

  const toggleVerwerkt = async (m: MeldingListItem) => {
    if (!profile) return;
    setBusyId(m.id);
    try {
      await zetVerwerkt(m.id, profile.id, !m.verwerkt);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <View>
        <Text style={styles.title}>Magazijn</Text>
        <Text style={styles.subtitle}>Wat medewerkers hebben doorgegeven dat ze uit het magazijn namen.</Text>
      </View>

      <View style={styles.kpiRow}>
        <KpiTile value={String(onverwerkt)} label="onverwerkt" />
        <KpiTile value={String(vandaag)} label="vandaag" />
        <KpiTile value={String(meldingen?.length ?? 0)} label="totaal" />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {meldingen === null && !error ? <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} /> : null}
      {meldingen?.length === 0 ? <Text style={styles.empty}>Nog geen meldingen.</Text> : null}

      {meldingen?.map((m) => (
        <View key={m.id} style={styles.card}>
          <View style={styles.cardTop}>
            <Text style={styles.cardTitel}>{m.melderNaam}</Text>
            <Text style={styles.cardTijd}>{formatTijd(m.created_at)}</Text>
          </View>
          <Text style={styles.cardTekst}>{m.tekst}</Text>
          <View style={styles.tagRow}>
            {m.hoeveelheid !== null ? <Tag label={`${m.hoeveelheid} ${m.eenheid}`.trim()} /> : null}
            {m.werfNaam ? <Tag label={m.werfNaam} /> : null}
          </View>
          {m.fotos.length > 0 ? (
            <View style={styles.fotoRow}>
              {m.fotos.map((f) => (
                <MeldingFotoThumb key={f.id} storagePath={f.storage_path} />
              ))}
            </View>
          ) : null}
          <TouchableOpacity
            style={[styles.verwerktBtn, m.verwerkt && styles.verwerktBtnActive]}
            onPress={() => toggleVerwerkt(m)}
            disabled={busyId === m.id}
            accessibilityRole="button">
            <Text style={[styles.verwerktBtnText, m.verwerkt && styles.verwerktBtnTextActive]}>
              {m.verwerkt ? '✓ verwerkt' : 'markeer als verwerkt'}
            </Text>
          </TouchableOpacity>
        </View>
      ))}
    </ScrollView>
  );
}

function MeldingView() {
  const { profile } = useAuth();
  const { isOnline } = useConnectivity();
  const [alleWerven, setAlleWerven] = useState<{ id: string; naam: string }[]>([]);
  const [tekst, setTekst] = useState('');
  const [hoeveelheid, setHoeveelheid] = useState('');
  const [eenheid, setEenheid] = useState('');
  const [werfNaam, setWerfNaam] = useState(GEEN_WERF);
  const [fotoUris, setFotoUris] = useState<string[]>([]);
  const [mijnMeldingen, setMijnMeldingen] = useState<MeldingListItem[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      setError(null);
      setMijnMeldingen(await listMijnMeldingen(profile.id));
    } catch (e: any) {
      setError(e.message ?? 'Kon meldingen niet laden');
    }
  }, [profile]);

  useEffect(() => {
    listAlleWerven().then(setAlleWerven);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const submit = async () => {
    if (!profile || !tekst.trim()) return;
    setSubmitting(true);
    setError(null);
    const werf = alleWerven.find((w) => w.naam === werfNaam);
    const payload = {
      melderId: profile.id,
      werfId: werf?.id ?? null,
      tekst: tekst.trim(),
      hoeveelheid: hoeveelheid.trim() ? Number(hoeveelheid.replace(',', '.')) : null,
      eenheid: eenheid.trim(),
      fotoUris,
    };
    try {
      if (isOnline) await createMelding(payload);
      else await enqueueMagazijnMelding(payload);
      setTekst('');
      setHoeveelheid('');
      setEenheid('');
      setWerfNaam(GEEN_WERF);
      setFotoUris([]);
      await load();
    } catch (e: any) {
      setError(e.message ?? 'Melding versturen mislukt');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <View>
        <Text style={styles.title}>Magazijn</Text>
        <Text style={styles.subtitle}>
          Geef door wat je uit het magazijn hebt meegenomen. De magazijnier ziet dit meteen.
        </Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={{ gap: 6 }}>
        <FieldLabel>Wat neem je mee</FieldLabel>
        <TextArea value={tekst} onChangeText={setTekst} placeholder="Bv. 2 zakken cement, 10m koperbuis 18mm…" />
      </View>

      <View style={styles.row}>
        <View style={{ flex: 1, gap: 6 }}>
          <FieldLabel>Aantal (optioneel)</FieldLabel>
          <TextField value={hoeveelheid} onChangeText={setHoeveelheid} placeholder="0" keyboardType="numeric" />
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <FieldLabel>Eenheid</FieldLabel>
          <TextField value={eenheid} onChangeText={setEenheid} placeholder="st., zakken, m…" />
        </View>
      </View>

      {alleWerven.length > 0 ? (
        <View style={{ gap: 7 }}>
          <FieldLabel>Voor welke werf (optioneel)</FieldLabel>
          <ChipGroup
            opties={[GEEN_WERF, ...alleWerven.map((w) => w.naam)]}
            value={werfNaam}
            onChange={(v) => setWerfNaam(v as string)}
          />
        </View>
      ) : null}

      <View style={{ gap: 6 }}>
        <FieldLabel>{`Foto (${fotoUris.length})`}</FieldLabel>
        <PhotoPicker uris={fotoUris} onChange={setFotoUris} />
      </View>

      <Button
        label={isOnline ? 'Melding versturen' : 'Opslaan in wachtrij'}
        onPress={submit}
        loading={submitting}
        disabled={!tekst.trim()}
      />

      <View>
        <SectionLabel>Mijn meldingen</SectionLabel>
        {mijnMeldingen?.length === 0 ? <Text style={styles.empty}>Nog geen meldingen.</Text> : null}
        {mijnMeldingen?.map((m) => (
          <View key={m.id} style={styles.aanvraagRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.aanvraagTekst} numberOfLines={2}>
                {m.tekst}
              </Text>
              <Text style={styles.aanvraagMeta}>
                {`${formatTijd(m.created_at)}${m.werfNaam ? ` · ${m.werfNaam}` : ''}`}
              </Text>
            </View>
            <Tag label={m.verwerkt ? 'verwerkt' : 'in wachtrij'} tone={m.verwerkt ? 'accent' : 'neutral'} />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function MeldingFotoThumb({ storagePath }: { storagePath: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getMeldingFotoUrl(storagePath).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [storagePath]);

  return (
    <View style={styles.fotoThumb}>
      {url ? <Image source={{ uri: url }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
    </View>
  );
}

function isVandaag(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString();
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
  body: { padding: 16, gap: 16, paddingBottom: 48 },
  title: { fontFamily: fonts.heading, fontSize: 24, textTransform: 'uppercase', color: colors.ink },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.inkMuted, marginTop: 5, lineHeight: 19 },
  error: { fontFamily: fonts.body, fontSize: 13, color: colors.danger },
  empty: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkMuted,
    borderWidth: 1,
    borderColor: colors.dividerStrong,
    borderStyle: 'dashed',
    padding: 14,
  },
  kpiRow: { flexDirection: 'row', gap: 1, backgroundColor: colors.divider, borderWidth: 1, borderColor: colors.divider },
  row: { flexDirection: 'row', gap: 10 },
  card: { borderWidth: 1, borderColor: colors.divider, backgroundColor: colors.white, padding: 12, gap: 9 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  cardTitel: { fontFamily: fonts.heading, fontSize: 16, textTransform: 'uppercase', color: colors.ink },
  cardTijd: { fontFamily: fonts.mono, fontSize: 10, color: colors.inkMuted },
  cardTekst: { fontFamily: fonts.body, fontSize: 14, color: colors.ink, lineHeight: 19 },
  tagRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  fotoRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  fotoThumb: { width: 56, height: 56, borderWidth: 1, borderColor: colors.dividerStrong, backgroundColor: colors.chipBg, overflow: 'hidden' },
  verwerktBtn: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.dividerStrong,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  verwerktBtnActive: { borderColor: colors.accent, backgroundColor: colors.accentTint },
  verwerktBtnText: { fontFamily: fonts.monoMedium, fontSize: 10.5, letterSpacing: 0.4, textTransform: 'uppercase', color: colors.inkMuted },
  verwerktBtnTextActive: { color: colors.accentDarker },
  aanvraagRow: {
    borderWidth: 1,
    borderColor: colors.divider,
    padding: 11,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  aanvraagTekst: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.ink },
  aanvraagMeta: { fontFamily: fonts.mono, fontSize: 11, color: colors.inkMuted, marginTop: 2 },
});
WACHTELAER_EOF_MARKER

echo "Klaar. Vergeet niet: voer supabase/migrations/0011_magazijn.sql uit in de Supabase SQL editor."
