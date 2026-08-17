import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { BackRow } from '@/components/ui/Basics';
import { ChipGroup, FieldLabel } from '@/components/ui/Form';
import { useAuth } from '@/context/AuthProvider';
import { listAlleWerven } from '@/lib/api/werven';
import {
  listProfielen,
  setWerfLeider,
  setWerfLid,
  updateRol,
  updateSaldo,
  type ProfielMetWerven,
} from '@/lib/api/ploeg';
import type { Role } from '@/lib/database.types';
import { colors, fonts, roleLabels } from '@/lib/theme';

const ROLES: Role[] = ['tech', 'werfleider', 'sales', 'mgmt'];

export default function PloegScreen() {
  const { profile } = useAuth();
  const [profielen, setProfielen] = useState<ProfielMetWerven[] | null>(null);
  const [werven, setWerven] = useState<{ id: string; naam: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saldoDraft, setSaldoDraft] = useState<{ verlof: string; inhaalrust: string } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

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

  return (
    <View style={styles.root}>
      <AppHeader kicker="Ploeg & rechten" />
      <BackRow label="Instellingen" onPress={() => router.replace('/meer')} />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>Ploeg &amp; rechten</Text>
        <Text style={styles.subtitle}>Rol, verlofsaldo en werftoewijzingen per medewerker.</Text>

        {profielen === null && !error ? <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

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

        <View style={styles.noteCard}>
          <Text style={styles.noteTitle}>Nieuwe medewerker</Text>
          <Text style={styles.noteBody}>
            Een account aanmaken kan nog niet in de app — dat doe je in het Supabase-dashboard onder
            Authentication → Users. Zodra iemand daar een account heeft, verschijnt die persoon hier om rol en
            werven toe te wijzen.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 16, gap: 12, paddingBottom: 48 },
  title: { fontFamily: fonts.heading, fontSize: 24, textTransform: 'uppercase', color: colors.ink },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.inkMuted, marginTop: -4 },
  error: { fontFamily: fonts.body, color: colors.danger },
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
});
