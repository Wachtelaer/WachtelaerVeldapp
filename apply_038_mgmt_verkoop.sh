#!/usr/bin/env bash
set -euo pipefail

echo "Wachtelaer Veldapp - Management kan verkoop zien en opmetingen aanmaken..."

mkdir -p "lib/api"
cat > "lib/api/opmetingen.ts" <<'WACHTELAER_EOF_MARKER'
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
WACHTELAER_EOF_MARKER

mkdir -p "app/(tabs)/werven"
cat > "app/(tabs)/werven/index.tsx" <<'WACHTELAER_EOF_MARKER'
import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppHeader } from '@/components/AppHeader';
import { KpiTile, SectionLabel, Tag } from '@/components/ui/Basics';
import { Button } from '@/components/ui/Button';
import { ChipGroup, FieldLabel, TextField } from '@/components/ui/Form';
import { useAuth } from '@/context/AuthProvider';
import { createWerf, deleteWerf, listWervenWithSummary, type WerfListItem } from '@/lib/api/werven';
import { listOpmetingen, type OpmetingListItem } from '@/lib/api/opmetingen';
import { getModule, summarizeAntwoorden } from '@/lib/salesModules';
import { colors, fonts, roleLabels } from '@/lib/theme';

const FASE_OPTIES = ['offerte', 'opstart', 'bezig', 'afwerking'];

export default function WervenHomeScreen() {
  const { profile } = useAuth();
  const [werven, setWerven] = useState<WerfListItem[] | null>(null);
  const [opmetingen, setOpmetingen] = useState<OpmetingListItem[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newNaam, setNewNaam] = useState('');
  const [newAdres, setNewAdres] = useState('');
  const [newFase, setNewFase] = useState('opstart');
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<WerfListItem | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const isSales = profile?.role === 'sales';
  const isMgmt = profile?.role === 'mgmt';
  const toontVerkoop = isSales || isMgmt;

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      setError(null);
      const [data, opm] = await Promise.all([
        listWervenWithSummary(profile.id),
        toontVerkoop ? listOpmetingen() : Promise.resolve(null),
      ]);
      setWerven(data);
      setOpmetingen(opm);
    } catch (e: any) {
      setError(e.message ?? 'Kon gegevens niet laden');
    }
  }, [profile, toontVerkoop]);

  useEffect(() => {
    load();
  }, [load]);

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

  const openAdd = () => {
    setNewCode('');
    setNewNaam('');
    setNewAdres('');
    setNewFase('opstart');
    setAddError(null);
    setAddOpen(true);
  };

  const submitAdd = async () => {
    const code = newCode.trim();
    const naam = newNaam.trim();
    const adres = newAdres.trim();
    if (!code || !naam || !adres) {
      setAddError('Vul code, naam en adres in');
      return;
    }
    setAddSaving(true);
    setAddError(null);
    try {
      await createWerf({ code, naam, adres, fase: newFase.trim() });
      setAddOpen(false);
      await load();
    } catch (e: any) {
      setAddError(e.message ?? 'Kon werf niet aanmaken');
    } finally {
      setAddSaving(false);
    }
  };

  const openDelete = (w: WerfListItem) => {
    setDeleteTarget(w);
    setDeleteConfirmText('');
    setDeleteError(null);
  };

  const submitDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteWerf(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (e: any) {
      setDeleteError(e.message ?? 'Kon werf niet verwijderen');
    } finally {
      setDeleting(false);
    }
  };

  const isWerfleider = profile?.role === 'werfleider';
  const eigenWerven = (werven ?? []).filter((w) => w.isLeider);
  const knelpunten = (werven ?? []).filter((w) => w.laatsteRapport?.knelpunt?.trim()).length;

  return (
    <View style={styles.root}>
      <AppHeader
        kicker={
          profile
            ? isSales
              ? `Verkoop · ${(opmetingen ?? []).length} opmetingen`
              : `${roleLabels[profile.role]} · ${(werven ?? []).length} werven`
            : ''
        }
      />
      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{isMgmt ? 'Overzicht' : isSales ? 'Verkoop' : 'Werven'}</Text>
        </View>

        {werven === null && !error ? <ActivityIndicator style={{ marginTop: 24 }} color={colors.accent} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {isMgmt && werven ? (
          <View style={styles.kpiRow}>
            <KpiTile value={String(werven.length)} label="werven actief" />
            <KpiTile value={String(knelpunten)} label="knelpunten open" />
            <KpiTile value={String(werven.reduce((n, w) => n + w.rapportCount, 0))} label="rapporten totaal" />
          </View>
        ) : null}

        {isMgmt ? <Button label="+ nieuwe werf" variant="secondary" onPress={openAdd} /> : null}

        {isWerfleider && eigenWerven.length === 1 ? (
          <Button
            label="Werfrapport van vandaag"
            onPress={() => router.push(`/werven/${eigenWerven[0].id}/nieuw`)}
          />
        ) : null}

        {toontVerkoop ? (
          <View style={{ gap: 12 }}>
            <Button label="Nieuwe opmeting bij klant" onPress={() => router.push('/werven/opmeting/modules')} />
            <View>
              <SectionLabel>{isMgmt ? 'Opmetingen — iedereen' : 'Opmetingen'}</SectionLabel>
              {opmetingen && opmetingen.length === 0 ? (
                <Text style={styles.empty}>Nog geen opmetingen.</Text>
              ) : null}
              {opmetingen?.map((o) => {
                const mod = getModule(o.module);
                return (
                  <View key={o.id} style={styles.card}>
                    <View style={styles.cardTop}>
                      <Text style={styles.cardName} numberOfLines={1}>
                        {o.klant_naam || '(naam ontbreekt)'}
                      </Text>
                      <Text style={styles.cardFase}>{formatDatum(o.created_at)}</Text>
                    </View>
                    <Text style={styles.cardMeta} numberOfLines={2}>
                      {isMgmt
                        ? `${o.verkoperNaam} · ${mod.naam} · ${summarizeAntwoorden(mod, o.antwoorden)}`
                        : `${mod.naam} · ${summarizeAntwoorden(mod, o.antwoorden)}`}
                    </Text>
                    <View style={styles.tagRow}>
                      <Tag label={`${o.fotoCount} foto's`} />
                      <Tag label={o.status} tone="accent" />
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        {werven && werven.length > 0 ? (
          <View>
            <SectionLabel>Werven</SectionLabel>
            {werven.map((w) => (
              <View key={w.id} style={styles.cardWrap}>
                <TouchableOpacity
                  style={[styles.card, styles.cardInWrap]}
                  onPress={() => router.push(`/werven/${w.id}`)}
                  accessibilityRole="button">
                  <View style={[styles.cardTop, isMgmt && styles.cardTopWithDelete]}>
                    <Text style={styles.cardName} numberOfLines={1}>
                      {w.naam}
                    </Text>
                    <Text style={styles.cardFase}>{w.fase}</Text>
                  </View>
                  <Text style={styles.cardMeta} numberOfLines={2}>
                    {w.laatsteRapport
                      ? `Rapport ${formatDatum(w.laatsteRapport.datum)} — ${w.laatsteRapport.uitgevoerd || w.laatsteRapport.knelpunt || '—'}`
                      : 'Nog geen rapport'}
                  </Text>
                  <View style={styles.tagRow}>
                    <Tag label={`${w.fotoCount} foto's`} />
                    <Tag label={`${w.rapportCount} rapporten`} />
                    {w.laatsteRapport?.knelpunt?.trim() ? <Tag label="knelpunt" tone="accent" /> : null}
                  </View>
                </TouchableOpacity>

                {isMgmt ? (
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => openDelete(w)}
                    accessibilityRole="button"
                    hitSlop={8}>
                    <Ionicons name="trash-outline" size={16} color={colors.danger} />
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {werven && werven.length === 0 ? (
          <Text style={styles.empty}>Je bent nog aan geen enkele werf toegewezen.</Text>
        ) : null}
      </ScrollView>

      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setAddOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Nieuwe werf</Text>

            <FieldLabel>Code</FieldLabel>
            <TextField value={newCode} onChangeText={setNewCode} placeholder="bv. W-2026-070" autoCapitalize="characters" />

            <FieldLabel>Naam</FieldLabel>
            <TextField value={newNaam} onChangeText={setNewNaam} placeholder="bv. Residentie De Linde" />

            <FieldLabel>Adres</FieldLabel>
            <TextField value={newAdres} onChangeText={setNewAdres} placeholder="Straat, nummer, gemeente" />

            <FieldLabel>Fase</FieldLabel>
            <ChipGroup opties={FASE_OPTIES} value={newFase} onChange={(v) => setNewFase(v as string)} />

            {addError ? <Text style={styles.error}>{addError}</Text> : null}

            <View style={styles.sheetRow}>
              <TouchableOpacity style={styles.sheetCancel} onPress={() => setAddOpen(false)} accessibilityRole="button">
                <Text style={styles.sheetCancelText}>Annuleren</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sheetConfirm, addSaving && styles.sheetConfirmDisabled]}
                onPress={submitAdd}
                disabled={addSaving}
                accessibilityRole="button">
                {addSaving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.sheetConfirmText}>Aanmaken</Text>}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
        <Pressable style={styles.backdrop} onPress={() => setDeleteTarget(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Werf verwijderen</Text>
            <Text style={styles.sheetWarning}>
              Dit verwijdert <Text style={styles.sheetWarningBold}>{deleteTarget?.naam}</Text> definitief, samen met al
              haar rapporten, chatberichten en plannen. Dit kan niet ongedaan gemaakt worden.
            </Text>

            <FieldLabel>{`Typ de code "${deleteTarget?.code}" om te bevestigen`}</FieldLabel>
            <TextField
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              placeholder={deleteTarget?.code}
              autoCapitalize="characters"
            />

            {deleteError ? <Text style={styles.error}>{deleteError}</Text> : null}

            <View style={styles.sheetRow}>
              <TouchableOpacity style={styles.sheetCancel} onPress={() => setDeleteTarget(null)} accessibilityRole="button">
                <Text style={styles.sheetCancelText}>Annuleren</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.sheetDelete,
                  (deleting || deleteConfirmText.trim() !== deleteTarget?.code) && styles.sheetConfirmDisabled,
                ]}
                onPress={submitDelete}
                disabled={deleting || deleteConfirmText.trim() !== deleteTarget?.code}
                accessibilityRole="button">
                {deleting ? <ActivityIndicator color={colors.white} /> : <Text style={styles.sheetConfirmText}>Verwijderen</Text>}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function formatDatum(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' });
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 16, gap: 16, paddingBottom: 40 },
  titleRow: { borderBottomWidth: 1, borderBottomColor: colors.divider, paddingBottom: 8 },
  title: { fontFamily: fonts.heading, fontSize: 24, textTransform: 'uppercase', color: colors.ink },
  error: { fontFamily: fonts.body, color: colors.danger },
  kpiRow: { flexDirection: 'row', gap: 1, backgroundColor: colors.divider, borderWidth: 1, borderColor: colors.divider },
  card: {
    borderWidth: 1,
    borderColor: colors.divider,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    padding: 12,
    marginBottom: 8,
    gap: 7,
  },
  cardWrap: { position: 'relative', marginBottom: 8 },
  cardInWrap: { marginBottom: 0 },
  deleteBtn: { position: 'absolute', top: 12, right: 12, padding: 4 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  cardTopWithDelete: { paddingRight: 22 },
  cardName: { fontFamily: fonts.heading, fontSize: 17, textTransform: 'uppercase', color: colors.ink, flexShrink: 1 },
  cardFase: { fontFamily: fonts.monoMedium, fontSize: 12, color: colors.accentDark },
  cardMeta: { fontFamily: fonts.body, fontSize: 13, color: colors.inkMuted },
  tagRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  empty: { fontFamily: fonts.body, fontSize: 14, color: colors.inkMuted, marginTop: 12 },
  backdrop: { flex: 1, backgroundColor: 'rgba(29,31,32,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  sheet: { width: '100%', maxWidth: 380, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.ink, padding: 16, gap: 10 },
  sheetTitle: { fontFamily: fonts.heading, fontSize: 18, textTransform: 'uppercase', color: colors.ink },
  sheetWarning: { fontFamily: fonts.body, fontSize: 13, color: colors.ink, lineHeight: 18 },
  sheetWarningBold: { fontFamily: fonts.bodyMedium, color: colors.ink },
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
  sheetDelete: {
    flex: 1,
    minHeight: 44,
    backgroundColor: colors.danger,
    borderWidth: 1,
    borderColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetConfirmDisabled: { opacity: 0.5 },
  sheetConfirmText: { fontFamily: fonts.heading, fontSize: 13, letterSpacing: 0.8, textTransform: 'uppercase', color: colors.white },
});
WACHTELAER_EOF_MARKER

echo "Klaar. Geen SQL-stap nodig — management kon al opmetingen aanmaken in de databank, dit is enkel de app-interface."
