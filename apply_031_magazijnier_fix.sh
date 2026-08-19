#!/usr/bin/env bash
set -euo pipefail

echo "Wachtelaer Veldapp - Magazijnier-checkbox fix + dynamische itemregels toepassen..."

mkdir -p "supabase/migrations"
cat > "supabase/migrations/0012_magazijnier_rol.sql" <<'WACHTELAER_EOF_MARKER'
-- Wachtelaer Veldapp — a dedicated "magazijnier" permission, separate from
-- the role enum. A magazijnier keeps their normal role (tech, werfleider,
-- ...) but additionally gets to see and process every Magazijn-melding,
-- same as management already does.
--
-- Written to be safe to run more than once (if-exists guards on every
-- statement), in case an earlier attempt at this migration only partially
-- applied.

alter table profiles add column if not exists is_magazijnier boolean not null default false;

create or replace function private.is_magazijnier(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from profiles where id = uid and is_magazijnier);
$$;

drop policy if exists "magazijn_meldingen are readable by their melder and management" on magazijn_meldingen;
drop policy if exists "magazijn_meldingen are readable by their melder, management and magazijnier" on magazijn_meldingen;

create policy "magazijn_meldingen are readable by their melder, management and magazijnier"
  on magazijn_meldingen for select
  to authenticated
  using (melder_id = auth.uid() or private.is_mgmt(auth.uid()) or private.is_magazijnier(auth.uid()));

drop policy if exists "magazijn_meldingen are updated by management only" on magazijn_meldingen;
drop policy if exists "magazijn_meldingen are updated by management or magazijnier" on magazijn_meldingen;

create policy "magazijn_meldingen are updated by management or magazijnier"
  on magazijn_meldingen for update
  to authenticated
  using (private.is_mgmt(auth.uid()) or private.is_magazijnier(auth.uid()))
  with check (private.is_mgmt(auth.uid()) or private.is_magazijnier(auth.uid()));

drop policy if exists "magazijn_meldingen_fotos follow the melding's visibility" on magazijn_meldingen_fotos;

create policy "magazijn_meldingen_fotos follow the melding's visibility"
  on magazijn_meldingen_fotos for select
  to authenticated
  using (
    exists (
      select 1 from magazijn_meldingen m
      where m.id = melding_id
        and (m.melder_id = auth.uid() or private.is_mgmt(auth.uid()) or private.is_magazijnier(auth.uid()))
    )
  );

drop policy if exists "magazijn photos are readable per melding visibility" on storage.objects;

create policy "magazijn photos are readable per melding visibility"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'magazijn-fotos'
    and exists (
      select 1 from magazijn_meldingen m
      where m.id = ((storage.foldername(name))[1])::uuid
        and (m.melder_id = auth.uid() or private.is_mgmt(auth.uid()) or private.is_magazijnier(auth.uid()))
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
  is_magazijnier: boolean;
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
cat > "lib/api/ploeg.ts" <<'WACHTELAER_EOF_MARKER'
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

export async function updateMagazijnier(profileId: string, isMagazijnier: boolean): Promise<void> {
  const { error } = await supabase.from('profiles').update({ is_magazijnier: isMagazijnier }).eq('id', profileId);
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
WACHTELAER_EOF_MARKER

mkdir -p "app/(tabs)/meer"
cat > "app/(tabs)/meer/ploeg.tsx" <<'WACHTELAER_EOF_MARKER'
import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { BackRow } from '@/components/ui/Basics';
import { ChipGroup, FieldLabel, TextField, ToggleRow } from '@/components/ui/Form';
import { useAuth } from '@/context/AuthProvider';
import { listAlleWerven } from '@/lib/api/werven';
import {
  createEmployee,
  listProfielen,
  setWerfLeider,
  setWerfLid,
  updateMagazijnier,
  updateRol,
  updateSaldo,
  type ProfielMetWerven,
} from '@/lib/api/ploeg';
import type { Role } from '@/lib/database.types';
import { colors, fonts, roleLabels } from '@/lib/theme';

const ROLES: Role[] = ['tech', 'werfleider', 'sales', 'mgmt'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function PloegScreen() {
  const { profile } = useAuth();
  const [profielen, setProfielen] = useState<ProfielMetWerven[] | null>(null);
  const [werven, setWerven] = useState<{ id: string; naam: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saldoDraft, setSaldoDraft] = useState<{ verlof: string; inhaalrust: string } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newNaam, setNewNaam] = useState('');
  const [newRol, setNewRol] = useState<Role>('tech');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [p, w] = await Promise.all([listProfielen(), listAlleWerven()]);
      setProfielen(p);
      setWerven(w);
    } catch (e: any) {
      setError(e.message ?? 'Kon ploeg niet laden');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const toggleExpand = (p: ProfielMetWerven) => {
    if (expandedId === p.id) {
      setExpandedId(null);
      setSaldoDraft(null);
    } else {
      setExpandedId(p.id);
      setSaldoDraft({ verlof: String(p.verlof_dagen), inhaalrust: String(p.inhaalrust_dagen) });
    }
  };

  const changeRol = async (p: ProfielMetWerven, role: Role) => {
    setSavingId(p.id);
    try {
      await updateRol(p.id, role);
      await load();
    } catch (e: any) {
      setError(e.message ?? 'Kon rol niet aanpassen');
    } finally {
      setSavingId(null);
    }
  };

  const toggleMagazijnier = async (p: ProfielMetWerven) => {
    setSavingId(p.id);
    try {
      await updateMagazijnier(p.id, !p.is_magazijnier);
      await load();
    } catch (e: any) {
      setError(e.message ?? 'Kon magazijnier-recht niet aanpassen');
    } finally {
      setSavingId(null);
    }
  };

  const saveSaldo = async (p: ProfielMetWerven) => {
    if (!saldoDraft) return;
    const verlof = Number(saldoDraft.verlof.replace(',', '.'));
    const inhaalrust = Number(saldoDraft.inhaalrust.replace(',', '.'));
    if (Number.isNaN(verlof) || Number.isNaN(inhaalrust)) {
      setError('Vul een geldig aantal dagen in');
      return;
    }
    setSavingId(p.id);
    try {
      await updateSaldo(p.id, verlof, inhaalrust);
      await load();
    } catch (e: any) {
      setError(e.message ?? 'Kon saldo niet opslaan');
    } finally {
      setSavingId(null);
    }
  };

  const toggleLid = async (p: ProfielMetWerven, werfId: string, huidigLid: boolean) => {
    setSavingId(p.id);
    try {
      await setWerfLid(werfId, p.id, !huidigLid);
      await load();
    } catch (e: any) {
      setError(e.message ?? 'Kon toewijzing niet aanpassen');
    } finally {
      setSavingId(null);
    }
  };

  const toggleLeider = async (p: ProfielMetWerven, werfId: string, huidigLeider: boolean) => {
    setSavingId(p.id);
    try {
      await setWerfLeider(werfId, p.id, !huidigLeider);
      await load();
    } catch (e: any) {
      setError(e.message ?? 'Kon leider-status niet aanpassen');
    } finally {
      setSavingId(null);
    }
  };

  const openAdd = () => {
    setNewEmail('');
    setNewNaam('');
    setNewRol('tech');
    setAddError(null);
    setAddOpen(true);
  };

  const submitAdd = async () => {
    const email = newEmail.trim().toLowerCase();
    const naam = newNaam.trim();
    if (!EMAIL_RE.test(email)) {
      setAddError('Vul een geldig e-mailadres in');
      return;
    }
    if (!naam) {
      setAddError('Vul een naam in');
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      await createEmployee({ email, full_name: naam, role: newRol });
      setAddOpen(false);
      setSuccess(`Uitnodiging verstuurd naar ${email}`);
      await load();
    } catch (e: any) {
      setAddError(e.message ?? 'Kon medewerker niet aanmaken');
    } finally {
      setAdding(false);
    }
  };

  return (
    <View style={styles.root}>
      <AppHeader kicker="Ploeg & rechten" />
      <BackRow label="Instellingen" onPress={() => router.replace('/meer')} />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>Ploeg &amp; rechten</Text>
        <Text style={styles.subtitle}>Rol, verlofsaldo en werftoewijzingen per medewerker.</Text>

        {profielen === null && !error ? <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {success ? <Text style={styles.success}>{success}</Text> : null}

        {profielen?.map((p) => {
          const isSelf = p.id === profile?.id;
          const expanded = expandedId === p.id;
          const werfSamenvatting = p.werven.map((w) => (w.is_leider ? `${w.werf_naam} (leider)` : w.werf_naam)).join(', ');
          return (
            <View key={p.id} style={styles.card}>
              <TouchableOpacity style={styles.cardHead} onPress={() => toggleExpand(p)} accessibilityRole="button">
                <View style={{ flex: 1 }}>
                  <Text style={styles.naam}>{p.full_name}</Text>
                  <Text style={styles.meta}>
                    {roleLabels[p.role]}
                    {p.is_magazijnier ? ' · magazijnier' : ''}
                    {werfSamenvatting ? ` · ${werfSamenvatting}` : ''}
                  </Text>
                </View>
                {savingId === p.id ? <ActivityIndicator color={colors.accent} /> : null}
              </TouchableOpacity>

              {expanded ? (
                <View style={styles.editArea}>
                  <FieldLabel>Rol</FieldLabel>
                  {isSelf ? (
                    <Text style={styles.selfNote}>Je kan je eigen rol hier niet wijzigen.</Text>
                  ) : (
                    <ChipGroup
                      opties={ROLES.map((r) => roleLabels[r])}
                      value={roleLabels[p.role]}
                      onChange={(label) => {
                        const role = ROLES.find((r) => roleLabels[r] === label);
                        if (role) changeRol(p, role);
                      }}
                    />
                  )}

                  <ToggleRow
                    checked={p.is_magazijnier}
                    onToggle={() => toggleMagazijnier(p)}
                    titel="Magazijnier"
                    sub="Ziet alle magazijn-meldingen en kan ze als verwerkt afvinken"
                  />

                  <FieldLabel>Saldo</FieldLabel>
                  <View style={styles.saldoRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.saldoLabel}>Verlofdagen</Text>
                      <TextInput
                        style={styles.saldoInput}
                        keyboardType="numeric"
                        value={saldoDraft?.verlof ?? ''}
                        onChangeText={(v) => setSaldoDraft((d) => (d ? { ...d, verlof: v } : d))}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.saldoLabel}>Inhaalrust</Text>
                      <TextInput
                        style={styles.saldoInput}
                        keyboardType="numeric"
                        value={saldoDraft?.inhaalrust ?? ''}
                        onChangeText={(v) => setSaldoDraft((d) => (d ? { ...d, inhaalrust: v } : d))}
                      />
                    </View>
                    <TouchableOpacity style={styles.saldoSave} onPress={() => saveSaldo(p)} accessibilityRole="button">
                      <Text style={styles.saldoSaveText}>Opslaan</Text>
                    </TouchableOpacity>
                  </View>

                  <FieldLabel>Werven</FieldLabel>
                  {werven.map((w) => {
                    const membership = p.werven.find((m) => m.werf_id === w.id);
                    return (
                      <View key={w.id} style={styles.werfRow}>
                        <Text style={styles.werfNaam} numberOfLines={1}>
                          {w.naam}
                        </Text>
                        <View style={styles.werfToggles}>
                          <TouchableOpacity
                            style={[styles.toggleChip, !!membership && styles.toggleChipActive]}
                            onPress={() => toggleLid(p, w.id, !!membership)}
                            accessibilityRole="button">
                            <Text style={[styles.toggleChipText, !!membership && styles.toggleChipTextActive]}>Lid</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[
                              styles.toggleChip,
                              !!membership?.is_leider && styles.toggleChipActive,
                              !membership && styles.toggleChipDisabled,
                            ]}
                            disabled={!membership}
                            onPress={() => toggleLeider(p, w.id, !!membership?.is_leider)}
                            accessibilityRole="button">
                            <Text
                              style={[
                                styles.toggleChipText,
                                !!membership?.is_leider && styles.toggleChipTextActive,
                                !membership && styles.toggleChipTextDisabled,
                              ]}>
                              Leider
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </View>
          );
        })}

        <TouchableOpacity style={styles.addBtn} onPress={openAdd} accessibilityRole="button">
          <Text style={styles.addBtnText}>+ nieuwe medewerker</Text>
        </TouchableOpacity>

        <View style={styles.noteCard}>
          <Text style={styles.noteTitle}>Nieuwe medewerker</Text>
          <Text style={styles.noteBody}>
            De medewerker krijgt een e-mail om een wachtwoord in te stellen; daarna kan die zich aanmelden. Rol en
            werftoewijzing kan je hier al meteen instellen, of later nog aanpassen.
          </Text>
        </View>
      </ScrollView>

      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setAddOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Nieuwe medewerker</Text>

            <FieldLabel>E-mail</FieldLabel>
            <TextField
              value={newEmail}
              onChangeText={setNewEmail}
              placeholder="naam@geert-wachtelaer.be"
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <FieldLabel>Naam</FieldLabel>
            <TextField value={newNaam} onChangeText={setNewNaam} placeholder="Voor- en achternaam" />

            <FieldLabel>Rol</FieldLabel>
            <ChipGroup opties={ROLES.map((r) => roleLabels[r])} value={roleLabels[newRol]} onChange={(label) => {
              const role = ROLES.find((r) => roleLabels[r] === label);
              if (role) setNewRol(role);
            }} />

            {addError ? <Text style={styles.error}>{addError}</Text> : null}

            <View style={styles.sheetRow}>
              <TouchableOpacity style={styles.sheetCancel} onPress={() => setAddOpen(false)} accessibilityRole="button">
                <Text style={styles.sheetCancelText}>Annuleren</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sheetConfirm, adding && styles.sheetConfirmDisabled]}
                onPress={submitAdd}
                disabled={adding}
                accessibilityRole="button">
                {adding ? <ActivityIndicator color={colors.white} /> : <Text style={styles.sheetConfirmText}>Uitnodigen</Text>}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 16, gap: 12, paddingBottom: 48 },
  title: { fontFamily: fonts.heading, fontSize: 24, textTransform: 'uppercase', color: colors.ink },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.inkMuted, marginTop: -4 },
  error: { fontFamily: fonts.body, color: colors.danger },
  success: { fontFamily: fonts.body, color: colors.accentDarker },
  card: { borderWidth: 1, borderColor: colors.divider, backgroundColor: colors.white },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  naam: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.ink },
  meta: { fontFamily: fonts.mono, fontSize: 11, color: colors.inkMuted, marginTop: 2 },
  editArea: { borderTopWidth: 1, borderTopColor: colors.divider, padding: 12, gap: 10 },
  selfNote: { fontFamily: fonts.body, fontSize: 12.5, color: colors.inkMuted, fontStyle: 'italic' },
  saldoRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  saldoLabel: { fontFamily: fonts.mono, fontSize: 10.5, color: colors.inkMuted, marginBottom: 4 },
  saldoInput: {
    minHeight: 40,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: colors.dividerStrong,
    backgroundColor: colors.white,
    fontFamily: fonts.mono,
    fontSize: 14,
    color: colors.ink,
  },
  saldoSave: {
    minHeight: 40,
    paddingHorizontal: 12,
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: colors.accentDark,
  },
  saldoSaveText: { fontFamily: fonts.heading, fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.white },
  werfRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  werfNaam: { flex: 1, fontFamily: fonts.body, fontSize: 13.5, color: colors.ink },
  werfToggles: { flexDirection: 'row', gap: 6 },
  toggleChip: { minHeight: 34, paddingHorizontal: 10, justifyContent: 'center', borderWidth: 1, borderColor: colors.dividerStrong },
  toggleChipActive: { backgroundColor: colors.accent, borderColor: colors.accentDark },
  toggleChipDisabled: { opacity: 0.4 },
  toggleChipText: { fontFamily: fonts.monoMedium, fontSize: 11, textTransform: 'uppercase', color: colors.ink },
  toggleChipTextActive: { color: colors.white },
  toggleChipTextDisabled: { color: colors.inkMuted },
  noteCard: { borderWidth: 1, borderColor: colors.accentPale, backgroundColor: colors.accentTint, padding: 12, gap: 4, marginTop: 4 },
  noteTitle: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.accentDarker,
  },
  noteBody: { fontFamily: fonts.body, fontSize: 13, color: colors.ink },
  addBtn: {
    minHeight: 48,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.dividerStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  addBtnText: { fontFamily: fonts.monoMedium, fontSize: 13, color: colors.accentDark },
  backdrop: { flex: 1, backgroundColor: 'rgba(29,31,32,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  sheet: { width: '100%', maxWidth: 380, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.ink, padding: 16, gap: 10 },
  sheetTitle: { fontFamily: fonts.heading, fontSize: 18, textTransform: 'uppercase', color: colors.ink },
  sheetRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  sheetCancel: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.dividerStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetCancelText: { fontFamily: fonts.heading, fontSize: 13, letterSpacing: 0.8, textTransform: 'uppercase', color: colors.ink },
  sheetConfirm: {
    flex: 1,
    minHeight: 44,
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: colors.accentDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetConfirmDisabled: { opacity: 0.5 },
  sheetConfirmText: { fontFamily: fonts.heading, fontSize: 13, letterSpacing: 0.8, textTransform: 'uppercase', color: colors.white },
});
WACHTELAER_EOF_MARKER

mkdir -p "app/(tabs)/magazijn"
cat > "app/(tabs)/magazijn/index.tsx" <<'WACHTELAER_EOF_MARKER'
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppHeader } from '@/components/AppHeader';
import { KpiTile, SectionLabel, Tag } from '@/components/ui/Basics';
import { Button } from '@/components/ui/Button';
import { ChipGroup, FieldLabel, TextField } from '@/components/ui/Form';
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

interface MeldingRegel {
  tekst: string;
  hoeveelheid: string;
}

const LEGE_REGEL: MeldingRegel = { tekst: '', hoeveelheid: '' };

export default function MagazijnScreen() {
  const { profile } = useAuth();
  const canOverzien = profile?.role === 'mgmt' || !!profile?.is_magazijnier;

  return (
    <View style={styles.root}>
      <AppHeader kicker={canOverzien ? 'Magazijn · meldingen' : 'Magazijn'} />
      {canOverzien ? <OverzichtView /> : <MeldingView />}
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
  const [regels, setRegels] = useState<MeldingRegel[]>([{ ...LEGE_REGEL }]);
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

  const gevuldeRegels = regels.filter((r) => r.tekst.trim());

  const updateRegel = (index: number, veld: keyof MeldingRegel, waarde: string) => {
    setRegels((prev) => {
      const next = prev.map((r, i) => (i === index ? { ...r, [veld]: waarde } : r));
      if (next[next.length - 1].tekst.trim()) next.push({ ...LEGE_REGEL });
      return next;
    });
  };

  const removeRegel = (index: number) => {
    setRegels((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length ? next : [{ ...LEGE_REGEL }];
    });
  };

  const submit = async () => {
    if (!profile || gevuldeRegels.length === 0) return;
    setSubmitting(true);
    setError(null);
    const werf = alleWerven.find((w) => w.naam === werfNaam);
    const tekst = gevuldeRegels
      .map((r) => (r.hoeveelheid.trim() ? `${r.hoeveelheid.trim()}× ${r.tekst.trim()}` : r.tekst.trim()))
      .join('\n');
    const payload = {
      melderId: profile.id,
      werfId: werf?.id ?? null,
      tekst,
      hoeveelheid: null,
      eenheid: '',
      fotoUris,
    };
    try {
      if (isOnline) await createMelding(payload);
      else await enqueueMagazijnMelding(payload);
      setRegels([{ ...LEGE_REGEL }]);
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

      <View style={{ gap: 8 }}>
        <FieldLabel>Wat neem je mee</FieldLabel>
        {regels.map((regel, i) => (
          <View key={i} style={styles.regelRow}>
            <View style={styles.regelTekst}>
              <TextField value={regel.tekst} onChangeText={(v) => updateRegel(i, 'tekst', v)} placeholder="Bv. zakken cement" />
            </View>
            <View style={styles.regelHoeveelheid}>
              <TextField value={regel.hoeveelheid} onChangeText={(v) => updateRegel(i, 'hoeveelheid', v)} placeholder="aantal" />
            </View>
            {regels.length > 1 ? (
              <TouchableOpacity onPress={() => removeRegel(i)} accessibilityRole="button" style={styles.regelRemove}>
                <Ionicons name="close" size={16} color={colors.inkMuted} />
              </TouchableOpacity>
            ) : null}
          </View>
        ))}
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
        disabled={gevuldeRegels.length === 0}
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
  regelRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  regelTekst: { flex: 2 },
  regelHoeveelheid: { flex: 1 },
  regelRemove: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
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

echo "Klaar. Voer nu de inhoud van supabase/migrations/0012_magazijnier_rol.sql uit in de Supabase SQL editor (dit mag ook al eens geprobeerd zijn - dit bestand is veilig om opnieuw te draaien)."
